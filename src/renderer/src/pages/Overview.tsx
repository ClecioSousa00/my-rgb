/**
 * Visão geral.
 *
 * The landing page: who this machine is, what it is doing right now, how much
 * disk is left, what the last network test said and whether anything needs
 * attention - the five things that otherwise need five pages. Every card is a
 * summary with a button that opens the page with the full story.
 *
 * The live block is fed by `startBottleneck`, not by a second reading of the
 * sensors: the same per-second sample the Gargalo page uses already picks the
 * CPU total, the busiest core, the VRAM and the temperatures, and duplicating
 * that selection here would be a second source of truth for the same numbers.
 *
 * Only two things are read on open: the cached hardware snapshot and the
 * S.M.A.R.T. of the disks (also cached, and cheap when the system cannot
 * answer). The network diagnostic saturates the link for half a minute, so it
 * is never started here - the card shows the last report, or says there is
 * none yet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PageId } from '@shared/types'
import type { DriveInfo, SystemSnapshot } from '@shared/features/system'
import type { DiskHealthSnapshot, DiskVerdict } from '@shared/features/health'
import type { NetworkReport } from '@shared/features/network'
import type { BottleneckLimiter, BottleneckLive } from '@shared/features/bottleneck'
import { BOTTLENECK_LIMITER_LABEL } from '@shared/features/bottleneck'
import {
  formatAgo,
  formatBytes,
  formatMbps,
  formatMs,
  formatMts
} from '@shared/format'
import { useApp } from '../store'
import { PAGE_META } from '../navigation'
import { Card } from '../components/ui/Card'
import { Meter } from '../components/ui/Meter'
import { Metric, MetricGrid } from '../components/ui/Metric'
import { PageHeader } from '../components/ui/PageHeader'
import { Ring } from '../components/ui/Ring'
import { Section } from '../components/ui/Section'

/** Limiters that deserve the inverted treatment, like the Gargalo card. */
const ALERT_LIMITERS: BottleneckLimiter[] = ['cpu', 'vram', 'ram', 'thermal']

const DISK_LABEL: Record<DiskVerdict, string> = {
  good: 'Saudável',
  warning: 'Atenção',
  critical: 'Crítico',
  unknown: 'Sem dados'
}

const NETWORK_LABEL: Record<NetworkReport['verdict'], string> = {
  good: 'Estável',
  warning: 'Atenção',
  critical: 'Ruim',
  unknown: 'Sem dados'
}

/** One line of the "Precisa de atenção" list. */
interface Attention {
  id: string
  title: string
  detail: string
  /** Page that explains or fixes it. */
  page: PageId
  /** True when the item deserves the inverted badge. */
  alert: boolean
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function percent(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value)} %`
}

function degrees(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value)} °C`
}

/** The worst verdict among the disks, which is the one worth showing. */
function worstVerdict(cards: { verdict: DiskVerdict }[]): DiskVerdict {
  if (cards.some((card) => card.verdict === 'critical')) return 'critical'
  if (cards.some((card) => card.verdict === 'warning')) return 'warning'
  if (cards.some((card) => card.verdict === 'unknown')) return 'unknown'
  return 'good'
}

function driveTitle(drive: DriveInfo): string {
  return drive.label ?? (drive.mount === '/' ? 'Sistema' : drive.mount)
}

export function OverviewPage(): React.JSX.Element {
  const device = useApp((s) => s.device)
  const zones = useApp((s) => s.zones)
  const profile = useApp((s) => s.profile)
  const engineRunning = useApp((s) => s.engineRunning)
  const dirty = useApp((s) => s.dirty)
  const setPage = useApp((s) => s.setPage)

  const [system, setSystem] = useState<SystemSnapshot | null>(null)
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [health, setHealth] = useState<DiskHealthSnapshot | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [network, setNetwork] = useState<NetworkReport | null>(null)
  const [live, setLive] = useState<BottleneckLive | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (force: boolean) => {
    setLoading(true)
    try {
      const [snapshot, volumes, report] = await Promise.all([
        window.myrgb.getSystem(force),
        window.myrgb.listDrives(),
        window.myrgb.getNetworkReport()
      ])
      setSystem(snapshot)
      setDrives(volumes)
      setNetwork(report)
      setError(null)
      setNow(Date.now())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // The S.M.A.R.T. read can take a few seconds on a spinning disk, so it is
  // not awaited by the rest of the page: the card shows what it has and the
  // verdict fills in when the disks answer.
  const loadHealth = useCallback(async (force: boolean) => {
    try {
      const snapshot = await window.myrgb.listDiskHealth(force)
      setHealth(snapshot)
      setHealthError(null)
    } catch (err) {
      setHealthError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load(false)
    void loadHealth(false)
  }, [load, loadHealth])

  useEffect(() => {
    let alive = true

    const unsubscribe = window.myrgb.onBottleneck((update) => {
      if (!alive || !update.live) return
      setLive(update.live)
      setLiveError(null)
    })

    void window.myrgb
      .startBottleneck()
      .then((snapshot) => {
        if (alive && snapshot.live) setLive(snapshot.live)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setLiveError(errorMessage(err))
      })

    return () => {
      alive = false
      unsubscribe()
      void window.myrgb.stopBottleneck()
    }
  }, [])

  // "Atualizado há X min" has to keep up without another fetch.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  const cpu = system?.cpu
  const gpu = system?.gpus[0]
  const ram = system?.ram
  const board = system?.board

  const diskBytes = (system?.disks ?? []).reduce((total, disk) => total + disk.sizeBytes, 0)
  const activeZones = profile?.zones.filter((zone) => zone.enabled).length ?? 0
  const lightsOn = profile?.global.outputEnabled ?? false

  const verdict = health && health.cards.length > 0 ? worstVerdict(health.cards) : undefined
  const healthy = health?.cards.filter((card) => card.verdict === 'good').length ?? 0
  const unhealthy =
    health?.cards.filter(
      (card) => card.verdict === 'warning' || card.verdict === 'critical'
    ).length ?? 0
  const unknownDisks =
    health?.cards.filter((card) => card.verdict === 'unknown').length ?? 0

  const internet = network?.internet[0]

  const attention = useMemo<Attention[]>(() => {
    const items: Attention[] = []

    if (device && !device.connected) {
      items.push({
        id: 'device',
        title: 'Controlador AURA desconectado',
        detail: device.error ?? 'O MyRGB não encontrou o controlador USB 0b05:19af.',
        page: 'lighting',
        alert: true
      })
    }

    if (device?.conflictSuspected) {
      items.push({
        id: 'conflict',
        title: 'Outro programa está controlando o controlador',
        detail:
          'Armoury Crate, Aura Sync ou OpenRGB. Desligue a iluminação dele para evitar cintilação.',
        page: 'lighting',
        alert: true
      })
    }

    if (!engineRunning) {
      items.push({
        id: 'engine',
        title: 'O motor está pausado',
        detail: 'Nenhum quadro novo está sendo gerado; as luzes ficam no último estado.',
        page: 'lighting',
        alert: false
      })
    }

    if (profile && !profile.global.outputEnabled) {
      items.push({
        id: 'output',
        title: 'As luzes estão desligadas',
        detail: `O perfil "${profile.name}" está com a saída desligada.`,
        page: 'lighting',
        alert: false
      })
    }

    if (dirty) {
      items.push({
        id: 'dirty',
        title: 'Alterações ainda não salvas',
        detail: 'O perfil tem mudanças que ainda não foram para o disco.',
        page: 'lighting',
        alert: false
      })
    }

    for (const card of health?.cards ?? []) {
      if (card.verdict !== 'warning' && card.verdict !== 'critical') continue
      items.push({
        id: `disk-${card.device}`,
        title: `${card.title}: ${DISK_LABEL[card.verdict].toLowerCase()}`,
        detail: card.reasons[0] ?? 'O S.M.A.R.T. do disco pede uma olhada.',
        page: 'disks',
        alert: card.verdict === 'critical'
      })
    }

    if (health?.needsElevation) {
      items.push({
        id: 'disk-elevation',
        title: 'A saúde dos discos precisa de permissão',
        detail: 'Abra Discos › Saúde e leia o S.M.A.R.T. com autorização do sistema.',
        page: 'disks',
        alert: false
      })
    }

    // Every disk unknown is not a healthy disk: the card says "sem dados" and
    // the reason (no smartctl, an unsupported bridge) belongs here, not in a
    // silent gap.
    if (
      health &&
      health.cards.length > 0 &&
      unknownDisks === health.cards.length &&
      !health.needsElevation
    ) {
      items.push({
        id: 'disk-unknown',
        title: 'A saúde dos discos ficou sem dados',
        detail:
          health.notes[0] ??
          'O S.M.A.R.T. não respondeu; abra Discos › Saúde para ver o motivo.',
        page: 'disks',
        alert: false
      })
    }

    for (const drive of drives) {
      if (drive.usedPercent < 90) continue
      items.push({
        id: `drive-${drive.id}`,
        title: `${driveTitle(drive)} está com ${percent(drive.usedPercent)} de uso`,
        detail: `${formatBytes(drive.freeBytes)} livres de ${formatBytes(drive.totalBytes)}.`,
        page: 'disks',
        alert: true
      })
    }

    if (network && network.verdict !== 'good') {
      items.push({
        id: 'network',
        title: `Rede: ${NETWORK_LABEL[network.verdict]}`,
        detail: network.reasons[0] ?? 'O último teste de rede não chegou a uma conclusão.',
        page: 'network',
        alert: network.verdict === 'critical'
      })
    }

    if (live && ALERT_LIMITERS.includes(live.limiter)) {
      items.push({
        id: 'limiter',
        title: `Limitador agora: ${BOTTLENECK_LIMITER_LABEL[live.limiter]}`,
        detail: live.advice,
        page: 'bottleneck',
        alert: live.limiter === 'thermal' || live.limiter === 'vram'
      })
    }

    // Problems first, notes after; the order inside each group is the order
    // they were checked, so the list does not jump between polls.
    return items.sort((a, b) => Number(b.alert) - Number(a.alert))
  }, [device, engineRunning, profile, dirty, health, drives, network, live])

  const refresh = (): void => {
    void load(true)
    void loadHealth(true)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="overview">
        <span className="text-[11px] text-ink-500">
          {system ? `Atualizado ${formatAgo(system.at, now)}` : ''}
        </span>
        <button className="btn" onClick={refresh} disabled={loading}>
          {loading ? 'Lendo…' : 'Atualizar'}
        </button>
      </PageHeader>

      {error && (
        <Card className="mt-6 max-w-3xl">
          <div className="metric-label">Falha ao ler o hardware</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
          <button className="btn mt-4" onClick={refresh}>
            Tentar de novo
          </button>
        </Card>
      )}

      {!system && loading && !error && (
        <div className="mt-8 text-[12px] text-ink-400">Lendo o hardware…</div>
      )}

      {system && (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Section title="A máquina" chip={system.os.hostname} className="lg:col-span-2">
              <MetricGrid columns={3}>
                <Metric
                  label="Processador"
                  value={cpu?.brand ?? '—'}
                  hint={
                    cpu
                      ? `${cpu.physicalCores} núcleos · ${cpu.threads} threads`
                      : undefined
                  }
                />
                <Metric
                  label="Placa de vídeo"
                  value={gpu?.name ?? '—'}
                  hint={gpu?.vramBytes ? `${formatBytes(gpu.vramBytes)} de VRAM` : undefined}
                />
                <Metric
                  label="Memória"
                  value={formatBytes(ram?.totalBytes)}
                  hint={
                    [ram?.type, formatMts(ram?.speedMts)]
                      .filter((part) => part && part !== '—')
                      .join(' · ') || undefined
                  }
                />
                <Metric
                  label="Placa-mãe"
                  value={[board?.vendor, board?.model].filter(Boolean).join(' ') || '—'}
                  hint={board?.biosVersion ? `BIOS ${board.biosVersion}` : undefined}
                />
                <Metric label="Sistema" value={system.os.name} hint={system.os.version} />
                <Metric
                  label="Discos físicos"
                  value={`${system.disks.length}`}
                  hint={diskBytes > 0 ? formatBytes(diskBytes) : undefined}
                />
                <Metric label="Driver da GPU" value={gpu?.driver ?? '—'} />
                <Metric
                  label="Slots de memória"
                  value={board?.memSlots ? String(board.memSlots) : '—'}
                />
                <Metric
                  label="Firmware"
                  value={system.os.uefi ? 'UEFI' : 'Legacy'}
                  hint={board?.biosVendor}
                />
              </MetricGrid>
            </Section>

            <Section
              title="Iluminação"
              action={
                <button className="btn" onClick={() => setPage('lighting')}>
                  Abrir
                </button>
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="metric-label">Perfil</div>
                  <div className="mt-1 truncate text-[15px] font-medium text-ink-100">
                    {profile?.name ?? '—'}
                  </div>
                </div>
                <span className="verdict shrink-0" data-alert={!engineRunning}>
                  {engineRunning ? 'Rodando' : 'Pausado'}
                </span>
              </div>

              <div className="mt-4">
                <MetricGrid>
                  <Metric label="Luzes" value={lightsOn ? 'Ligadas' : 'Desligadas'} />
                  <Metric
                    label="Zonas ativas"
                    value={zones.length > 0 ? `${activeZones} de ${zones.length}` : '—'}
                  />
                  <Metric
                    label="Brilho"
                    value={
                      profile ? `${Math.round(profile.global.brightness * 100)} %` : '—'
                    }
                  />
                  <Metric
                    label="Velocidade"
                    value={profile ? `${profile.global.speed.toFixed(2)}×` : '—'}
                  />
                </MetricGrid>
              </div>

              <div className="mt-4 border-t border-ink-700 pt-3 text-[11px] leading-relaxed text-ink-400">
                {device?.connected
                  ? `${device.product} · firmware ${device.firmware}`
                  : 'Controlador AURA não encontrado.'}
              </div>
            </Section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Section
              title="Agora"
              chip={live ? 'ao vivo · 1 s' : undefined}
              className="lg:col-span-2"
              action={
                <button className="btn" onClick={() => setPage('bottleneck')}>
                  Gargalo
                </button>
              }
            >
              {live ? (
                <>
                  <div
                    className={`rounded-xl px-3.5 py-2.5 ${
                      ALERT_LIMITERS.includes(live.limiter)
                        ? 'bg-ink-100'
                        : 'border border-ink-700 bg-ink-850'
                    }`}
                  >
                    <div
                      className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${
                        ALERT_LIMITERS.includes(live.limiter) ? 'text-black/55' : 'text-ink-500'
                      }`}
                    >
                      Limitador agora
                    </div>
                    <div
                      className={`mt-0.5 text-[15px] font-semibold leading-tight ${
                        ALERT_LIMITERS.includes(live.limiter) ? 'text-black' : 'text-ink-100'
                      }`}
                    >
                      {live.title}
                    </div>
                    <p
                      className={`mt-1 text-[11px] leading-relaxed ${
                        ALERT_LIMITERS.includes(live.limiter) ? 'text-black/70' : 'text-ink-300'
                      }`}
                    >
                      {live.advice}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                    <Meter
                      label="Carga da GPU"
                      text={percent(live.sample.gpuLoad)}
                      value={live.sample.gpuLoad}
                    />
                    <Meter
                      label="Carga total da CPU"
                      text={percent(live.sample.cpuTotal)}
                      value={live.sample.cpuTotal}
                    />
                    <Meter
                      label="Núcleo mais ocupado"
                      text={percent(live.sample.cpuMaxCore)}
                      hint={live.sample.busiestCore}
                      value={live.sample.cpuMaxCore}
                    />
                    <Meter
                      label="VRAM em uso"
                      text={percent(live.sample.vramPct)}
                      value={live.sample.vramPct}
                    />
                    <Meter
                      label="RAM em uso"
                      text={percent(live.sample.ramPct)}
                      value={live.sample.ramPct}
                    />
                    <Meter
                      label="Temperaturas (GPU / CPU)"
                      text={`${degrees(live.sample.gpuTemp)} / ${degrees(live.sample.cpuTemp)}`}
                      value={Math.max(live.sample.gpuTemp ?? 0, live.sample.cpuTemp ?? 0) || undefined}
                    />
                  </div>
                </>
              ) : (
                <p className="text-[12px] text-ink-400">
                  {liveError ?? 'Lendo os sensores…'}
                </p>
              )}
            </Section>

            <Section
              title="Precisa de atenção"
              chip={attention.length > 0 ? `${attention.length}` : undefined}
              scroll
            >
              {attention.length > 0 ? (
                <ul className="space-y-2">
                  {attention.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setPage(item.page)}
                        className="w-full rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-left transition-colors hover:border-ink-500 hover:bg-ink-800"
                        title={`Abrir ${PAGE_META[item.page].title}`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-100"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="text-[12px] font-medium leading-snug text-ink-100">
                              {item.title}
                            </div>
                            <div className="mt-0.5 text-[11px] leading-relaxed text-ink-400">
                              {item.detail}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : health || healthError ? (
                <>
                  <p className="text-[12px] leading-relaxed text-ink-300">
                    Nada precisa de atenção agora.
                  </p>
                  <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-ink-400">
                    <li>
                      — Iluminação:{' '}
                      {profile
                        ? `perfil "${profile.name}", motor ${engineRunning ? 'rodando' : 'pausado'}`
                        : 'sem perfil'}
                    </li>
                    <li>
                      — Discos:{' '}
                      {health
                        ? [
                            healthy > 0 ? `${healthy} saudável${healthy > 1 ? 'eis' : ''}` : undefined,
                            unknownDisks > 0 ? `${unknownDisks} sem dados` : undefined
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'nenhum disco físico'
                        : `indisponível${healthError ? ` (${healthError})` : ''}`}
                    </li>
                    <li>
                      — Rede:{' '}
                      {network
                        ? `último teste ${NETWORK_LABEL[network.verdict].toLowerCase()}`
                        : 'nenhum teste ainda'}
                    </li>
                  </ul>
                </>
              ) : (
                <p className="text-[12px] leading-relaxed text-ink-400">
                  Verificando os discos…
                </p>
              )}
            </Section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Section
              title="Armazenamento"
              className="lg:col-span-2"
              chip={verdict ? DISK_LABEL[verdict] : undefined}
              action={
                <button className="btn" onClick={() => setPage('disks')}>
                  Discos
                </button>
              }
            >
              {drives.length === 0 ? (
                <p className="text-[12px] text-ink-400">Nenhuma unidade identificada.</p>
              ) : (
                <ul className="space-y-3">
                  {drives.map((drive) => (
                    <li key={drive.id} className="flex items-center gap-3">
                      <Ring
                        percent={drive.usedPercent}
                        size={58}
                        stroke={6}
                        title={driveTitle(drive)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[12.5px] font-medium text-ink-100">
                            {driveTitle(drive)}
                          </span>
                          {drive.mount !== driveTitle(drive) && (
                            <span className="shrink-0 font-mono text-[11px] text-ink-500">
                              {drive.mount}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-mono text-[11.5px] text-ink-300">
                          {formatBytes(drive.usedBytes)} de {formatBytes(drive.totalBytes)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-400">
                          {formatBytes(drive.freeBytes)} livres
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 border-t border-ink-700 pt-3 text-[11px] leading-relaxed text-ink-400">
                {healthError
                  ? `Saúde dos discos indisponível: ${healthError}`
                  : health
                    ? [
                        healthy > 0 ? `${healthy} saudável${healthy > 1 ? 'eis' : ''}` : undefined,
                        unhealthy > 0 ? `${unhealthy} com problema` : undefined,
                        unknownDisks > 0 ? `${unknownDisks} sem dados` : undefined
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Nenhum disco físico para avaliar.'
                    : 'Lendo o S.M.A.R.T. dos discos…'}
              </div>
            </Section>

            <Section
              title="Rede"
              chip={network ? NETWORK_LABEL[network.verdict] : undefined}
              action={
                <button className="btn" onClick={() => setPage('network')}>
                  Abrir
                </button>
              }
            >
              {network ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12.5px] text-ink-100">
                      {network.adapter
                        ? [
                            network.adapter.kind === 'wifi' ? 'Wi-Fi' : network.adapter.name,
                            network.adapter.linkMbps !== undefined
                              ? `${network.adapter.linkMbps} Mbps`
                              : undefined
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : 'Sem conexão ativa'}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                      {new Date(network.at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <div className="mt-4">
                    <MetricGrid>
                      <Metric
                        label="Latência"
                        value={formatMs(internet?.avgMs)}
                        hint={internet?.name}
                      />
                      <Metric label="Download" value={formatMbps(network.downloadMbps)} />
                      <Metric label="Upload" value={formatMbps(network.uploadMbps)} />
                      <Metric
                        label="Sob carga"
                        value={formatMs(network.loadedMs)}
                        hint="latência com o link saturado"
                      />
                    </MetricGrid>
                  </div>

                  {network.reasons.length > 0 && (
                    <p className="mt-4 border-t border-ink-700 pt-3 text-[11px] leading-relaxed text-ink-400">
                      {network.reasons[0]}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[12px] leading-relaxed text-ink-400">
                    Nenhum teste de rede ainda. O diagnóstico leva cerca de 30 segundos e
                    satura a conexão, por isso só roda quando você pede.
                  </p>
                  <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-ink-400">
                    <li>— Latência e perda até o roteador e até a internet</li>
                    <li>— Tempo de DNS, download e upload</li>
                    <li>— Latência sob carga (bufferbloat)</li>
                  </ul>
                </>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
