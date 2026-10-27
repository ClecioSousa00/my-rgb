/**
 * Discos.
 *
 * Two tabs: the volumes the user can fill ("Unidades") and the health of the
 * physical disks ("Saúde").
 *
 * The volume card is built around the occupancy ring, because that is the one
 * number a person checks. The health card is built around the verdict: the
 * reasons come first, the metrics that were actually read come next, and a
 * disk that answers nothing says "sem dados" instead of "saudável".
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DriveInfo, DriveKind } from '@shared/features/system'
import type { DiskHealthCard, DiskHealthSnapshot, DiskVerdict } from '@shared/features/health'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Ring } from '../components/ui/Ring'
import { Section } from '../components/ui/Section'
import { Tabs } from '../components/ui/Tabs'
import { Metric, MetricGrid } from '../components/ui/Metric'
import { formatBytes, formatCount, formatPercent, formatSensor } from '@shared/format'

type DiskTab = 'drives' | 'health'

const KIND_LABEL: Record<DriveKind, string> = {
  ssd: 'SSD',
  hdd: 'HDD',
  usb: 'USB',
  network: 'Rede',
  optical: 'Óptico',
  unknown: 'Unidade'
}

const VERDICT_LABEL: Record<DiskVerdict, string> = {
  good: 'Saudável',
  warning: 'Atenção',
  critical: 'Crítico',
  unknown: 'Sem dados'
}

function DriveCard({ drive }: { drive: DriveInfo }): React.JSX.Element {
  // "/" is the system volume; nobody recognises it by the mount point alone.
  const title = drive.label ?? (drive.mount === '/' ? 'Sistema' : drive.mount)
  const disk = drive.physical
  const meta = [drive.fsType, disk?.name, disk?.interfaceType].filter(Boolean)

  return (
    <Card>
      <div className="flex items-center gap-4">
        <Ring percent={drive.usedPercent} title={title} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-[13.5px] font-medium text-ink-100">{title}</span>
            <span className="chip shrink-0">{KIND_LABEL[drive.kind]}</span>
          </div>

          {title !== drive.mount && (
            <div className="mt-0.5 font-mono text-[11px] text-ink-500">{drive.mount}</div>
          )}

          <div className="mt-1.5 font-mono text-[11.5px] text-ink-300">
            {formatBytes(drive.usedBytes)} de {formatBytes(drive.totalBytes)}
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-400">
            {formatBytes(drive.freeBytes)} livres
            {drive.readOnly ? ' · somente leitura' : ''}
          </div>

          {meta.length > 0 && (
            <div className="mt-1.5 truncate text-[10.5px] text-ink-500" title={meta.join(' · ')}>
              {meta.join(' · ')}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function HealthCard({ card }: { card: DiskHealthCard }): React.JSX.Element {
  const alert = card.verdict !== 'good'
  const days = card.powerOnHours !== undefined ? Math.round(card.powerOnHours / 24) : undefined
  const smartLabel =
    card.smartStatus === 'PASSED'
      ? 'Aprovado'
      : card.smartStatus === 'FAILED!'
        ? 'Reprovado'
        : card.smartStatus

  return (
    <Card className="disk-health">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-ink-100" title={card.title}>
            {card.title}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-ink-500" title={card.meta}>
            {card.meta}
          </div>
        </div>
        <span className="verdict shrink-0" data-alert={alert}>
          {VERDICT_LABEL[card.verdict]}
        </span>
      </div>

      {(card.serial || card.firmware) && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] text-ink-500">
          {card.serial && <span className="truncate">S/N {card.serial}</span>}
          {card.firmware && <span>fw {card.firmware}</span>}
        </div>
      )}

      {card.dataAvailable && (
        <div className="mt-4">
          <MetricGrid columns={3}>
            {card.temperatureC !== undefined && (
              <Metric label="Temperatura" value={formatSensor(card.temperatureC, '°C')} />
            )}
            {card.wearPercent !== undefined && (
              <Metric
                label="Desgaste"
                value={formatPercent(card.wearPercent)}
                hint={`${formatPercent(100 - card.wearPercent)} de vida restante`}
              />
            )}
            {card.powerOnHours !== undefined && (
              <Metric
                label="Horas ligado"
                value={`${formatCount(card.powerOnHours)} h`}
                hint={days !== undefined ? `${formatCount(days)} dias` : undefined}
              />
            )}
            {card.powerCycles !== undefined && (
              <Metric label="Ciclos liga/desliga" value={formatCount(card.powerCycles)} />
            )}
            {card.reallocatedSectors !== undefined && (
              <Metric label="Setores realocados" value={formatCount(card.reallocatedSectors)} />
            )}
            {card.pendingSectors !== undefined && (
              <Metric label="Setores pendentes" value={formatCount(card.pendingSectors)} />
            )}
            {card.uncorrectableSectors !== undefined && (
              <Metric label="Não corrigíveis" value={formatCount(card.uncorrectableSectors)} />
            )}
            {card.mediaErrors !== undefined && (
              <Metric label="Erros de mídia" value={formatCount(card.mediaErrors)} />
            )}
            {card.uncorrectedErrors !== undefined && (
              <Metric
                label="Erros não corrigidos"
                value={formatCount(card.uncorrectedErrors)}
              />
            )}
            {card.availableSpare !== undefined && (
              <Metric label="Reserva (spare)" value={formatPercent(card.availableSpare)} />
            )}
            {smartLabel && <Metric label="Autoteste" value={smartLabel} />}
            {card.writtenBytes !== undefined && (
              <Metric label="Total gravado" value={formatBytes(card.writtenBytes)} />
            )}
            {card.readBytes !== undefined && (
              <Metric label="Total lido" value={formatBytes(card.readBytes)} />
            )}
          </MetricGrid>
        </div>
      )}

      <ul className="mt-4 space-y-1.5">
        {card.reasons.map((reason) => (
          <li key={reason} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300">
            <span className="text-ink-500">—</span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      {card.notes.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-ink-800 pt-3">
          {card.notes.map((note) => (
            <p key={note} className="text-[10.5px] leading-relaxed text-ink-500">
              {note}
            </p>
          ))}
        </div>
      )}
    </Card>
  )
}

function healthSummary(snapshot: DiskHealthSnapshot | null): string | undefined {
  if (!snapshot) return undefined
  const total = snapshot.cards.length
  if (total === 0) return 'nenhum disco físico'

  const alerts = snapshot.cards.filter(
    (card) => card.verdict === 'warning' || card.verdict === 'critical'
  ).length
  const unknown = snapshot.cards.filter((card) => card.verdict === 'unknown').length

  const parts = [`${total} ${total === 1 ? 'disco' : 'discos'}`]
  if (alerts > 0) parts.push(`${alerts} com alerta`)
  if (unknown > 0) parts.push(`${unknown} sem dados`)
  if (alerts === 0 && unknown === 0) parts.push('todos saudáveis')
  if (snapshot.elevated) parts.push('leitura com privilégio')
  return parts.join(' · ')
}

interface HealthTabProps {
  snapshot: DiskHealthSnapshot | null
  loading: boolean
  error: string | null
  elevating: boolean
  onElevate: () => void
  onRetry: () => void
}

function HealthTab({
  snapshot,
  loading,
  error,
  elevating,
  onElevate,
  onRetry
}: HealthTabProps): React.JSX.Element {
  if (error) {
    return (
      <Card className="max-w-3xl">
        <div className="metric-label">Falha ao ler a saúde dos discos</div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
        <button className="btn mt-4" onClick={onRetry}>
          Tentar de novo
        </button>
      </Card>
    )
  }

  if (!snapshot) {
    return (
      <div className="text-[12px] text-ink-400">
        {loading ? 'Lendo a saúde dos discos…' : 'A leitura ainda não começou.'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {snapshot.needsElevation && (
        <Card className="max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="metric-label">Leitura completa</div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
                Alguns discos só entregam o S.M.A.R.T. com privilégio. O botão pede a senha uma
                única vez e lê todos de uma vez; se você recusar, a página continua com o que já
                foi lido.
              </p>
            </div>
            <button className="btn shrink-0" onClick={onElevate} disabled={elevating}>
              {elevating ? 'Aguardando…' : 'Ler com privilégio'}
            </button>
          </div>
        </Card>
      )}

      {snapshot.notes.length > 0 && (
        <Card className="max-w-3xl">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
            Observações
          </h2>
          <ul className="mt-3 space-y-1.5">
            {snapshot.notes.map((note) => (
              <li key={note} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300">
                <span className="text-ink-500">—</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {snapshot.cards.length === 0 && (
        <Section title="Saúde">
          <p className="text-[12.5px] text-ink-300">Nenhum disco físico foi identificado.</p>
        </Section>
      )}

      {snapshot.cards.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          {snapshot.cards.map((card) => (
            <HealthCard key={card.device} card={card} />
          ))}
        </div>
      )}

      {snapshot.cards.length > 0 && (
        <p className="text-[11px] text-ink-500">
          O veredito vem das métricas que o disco realmente informou. Um disco que não responde
          fica como “sem dados”, nunca como saudável.
        </p>
      )}
    </div>
  )
}

export function DisksPage(): React.JSX.Element {
  const [tab, setTab] = useState<DiskTab>('drives')
  const [drives, setDrives] = useState<DriveInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [health, setHealth] = useState<DiskHealthSnapshot | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(false)
  const [elevating, setElevating] = useState(false)
  // StrictMode runs the effect twice; without the guard the health tab would
  // spawn two smartctl reads before the first one answers.
  const healthRequest = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDrives(await window.myrgb.listDrives())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHealth = useCallback(async (force: boolean) => {
    if (healthRequest.current) return
    healthRequest.current = true
    setLoadingHealth(true)
    try {
      setHealth(await window.myrgb.listDiskHealth(force))
      setHealthError(null)
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : String(err))
    } finally {
      healthRequest.current = false
      setLoadingHealth(false)
    }
  }, [])

  const elevate = useCallback(async () => {
    if (healthRequest.current) return
    healthRequest.current = true
    setElevating(true)
    try {
      setHealth(await window.myrgb.readDiskHealthElevated())
      setHealthError(null)
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : String(err))
    } finally {
      healthRequest.current = false
      setElevating(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab === 'health' && !health && !loadingHealth) void loadHealth(false)
  }, [tab, health, loadingHealth, loadHealth])

  const total = drives?.reduce((sum, drive) => sum + drive.totalBytes, 0) ?? 0
  const used = drives?.reduce((sum, drive) => sum + drive.usedBytes, 0) ?? 0
  const drivesSummary =
    drives && drives.length > 0
      ? `${drives.length} ${drives.length === 1 ? 'unidade' : 'unidades'} · ${formatBytes(
          used
        )} de ${formatBytes(total)} usados`
      : undefined

  const subtitle = tab === 'drives' ? drivesSummary : healthSummary(health)
  const busy = tab === 'drives' ? loading : loadingHealth || elevating

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="disks" subtitle={subtitle}>
        <button
          className="btn"
          onClick={() => void (tab === 'drives' ? load() : loadHealth(true))}
          disabled={busy}
        >
          {busy ? 'Lendo…' : 'Atualizar'}
        </button>
      </PageHeader>

      <div className="mt-5">
        <Tabs
          label="Seções de Discos"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'drives', label: 'Unidades', count: drives?.length },
            { id: 'health', label: 'Saúde', count: health?.cards.length }
          ]}
        />
      </div>

      <div className="mt-5">
        {tab === 'health' && (
          <HealthTab
            snapshot={health}
            loading={loadingHealth}
            error={healthError}
            elevating={elevating}
            onElevate={() => void elevate()}
            onRetry={() => void loadHealth(true)}
          />
        )}

        {tab === 'drives' && (
          <>
            {error && (
              <Card className="max-w-3xl">
                <div className="metric-label">Falha ao listar as unidades</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
                <button className="btn mt-4" onClick={() => void load()}>
                  Tentar de novo
                </button>
              </Card>
            )}

            {!error && !drives && loading && (
              <div className="text-[12px] text-ink-400">Lendo as unidades…</div>
            )}

            {!error && drives && drives.length === 0 && (
              <Section title="Unidades">
                <p className="text-[12.5px] text-ink-300">
                  Nenhuma unidade montada foi encontrada.
                </p>
              </Section>
            )}

            {drives && drives.length > 0 && (
              <div className="grid gap-4 xl:grid-cols-2">
                {drives.map((drive) => (
                  <DriveCard key={drive.id} drive={drive} />
                ))}
              </div>
            )}

            {drives && drives.length > 0 && (
              <p className="mt-4 text-[11px] text-ink-500">
                Partições de sistema (EFI, snap) e volumes sem ponto de montagem ficam de fora,
                como no gerenciador de arquivos.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
