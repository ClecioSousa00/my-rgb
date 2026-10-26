/**
 * Sistema.
 *
 * A static snapshot of the machine: operating system, board and BIOS, CPU,
 * RAM, GPUs and physical disks. Nothing here changes while the app is open,
 * so the main process caches it and the page refreshes on demand.
 *
 * The page trusts the data it gets. When a category could not be read, the
 * collector sends a note explaining why, and that note is shown at the bottom
 * instead of the page pretending every field is "unknown" for no reason.
 */

import { useCallback, useEffect, useState } from 'react'
import type { SystemSnapshot } from '@shared/features/system'
import { Section } from '../components/ui/Section'
import { Metric, MetricGrid } from '../components/ui/Metric'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { formatAgo, formatBiosDate, formatBytes, formatGhz, formatMts } from '@shared/format'

export function SystemPage(): React.JSX.Element {
  const [data, setData] = useState<SystemSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (force: boolean) => {
    setLoading(true)
    try {
      const snapshot = await window.myrgb.getSystem(force)
      setData(snapshot)
      setError(null)
      setNow(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  // The snapshot is cached; the "há X min" line has to keep up on its own.
  useEffect(() => {
    if (!data) return
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [data])

  const cpu = data?.cpu
  const ram = data?.ram
  const board = data?.board

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="system">
        <span className="text-[11px] text-ink-500">
          {data ? `Atualizado ${formatAgo(data.at, now)}` : ''}
        </span>
        <button className="btn" onClick={() => void load(true)} disabled={loading}>
          {loading ? 'Lendo…' : 'Atualizar'}
        </button>
      </PageHeader>

      {error && (
        <Card className="mt-6 max-w-3xl">
          <div className="metric-label">Falha ao ler o hardware</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
          <button className="btn mt-4" onClick={() => void load(false)}>
            Tentar de novo
          </button>
        </Card>
      )}

      {!data && loading && !error && (
        <div className="mt-8 text-[12px] text-ink-400">Lendo o hardware…</div>
      )}

      {data && (
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
          <Section collapsible title="Sistema" chip={data.os.uefi ? 'UEFI' : undefined}>
            <MetricGrid>
              <Metric label="Sistema operacional" value={data.os.name} />
              <Metric label="Versão" value={data.os.version} />
              <Metric label="Arquitetura" value={data.os.arch} />
              <Metric label="Nome do computador" value={data.os.hostname ?? '—'} />
            </MetricGrid>
          </Section>

          <Section collapsible title="Placa-mãe e BIOS">
            <MetricGrid>
              <Metric label="Fabricante" value={board?.vendor ?? '—'} />
              <Metric label="Modelo" value={board?.model ?? '—'} />
              <Metric label="Revisão" value={board?.version ?? '—'} />
              <Metric label="Versão da BIOS" value={board?.biosVersion ?? '—'} />
              <Metric label="Fabricante da BIOS" value={board?.biosVendor ?? '—'} />
              <Metric label="Data da BIOS" value={formatBiosDate(board?.biosDate)} />
              <Metric
                label="Slots de memória"
                value={board?.memSlots ? String(board.memSlots) : '—'}
              />
            </MetricGrid>
          </Section>

          <Section collapsible title="Processador" chip={cpu?.virtualization ? 'VT habilitado' : undefined}>
            <MetricGrid>
              <Metric label="Modelo" value={cpu?.brand ?? '—'} />
              <Metric label="Fabricante" value={cpu?.vendor ?? '—'} />
              <Metric label="Núcleos" value={cpu ? `${cpu.physicalCores} físicos` : '—'} />
              <Metric label="Threads" value={cpu?.threads ? String(cpu.threads) : '—'} />
              <Metric
                label="Clock"
                value={formatGhz(cpu?.speedGhz)}
                hint="na hora da leitura"
              />
              <Metric label="Clock máximo" value={formatGhz(cpu?.maxGhz)} />
              <Metric
                label="Cache L3"
                value={cpu?.cacheL3Mb ? `${cpu.cacheL3Mb} MB` : '—'}
              />
              <Metric label="Socket" value={cpu?.socket ?? '—'} />
            </MetricGrid>
          </Section>

          <Section
            title="Memória"
            chip={ram && ram.modules.length === 0 ? 'sem detalhes por módulo' : undefined}
          >
            <MetricGrid>
              <Metric label="Total" value={formatBytes(ram?.totalBytes)} />
              <Metric
                label="Disponível"
                value={formatBytes(ram?.availableBytes)}
                hint="na hora da leitura"
              />
              <Metric label="Tipo" value={ram?.type ?? '—'} />
              <Metric label="Velocidade" value={formatMts(ram?.speedMts)} />
              <Metric
                label="Canais"
                value={ram?.channels ? `${ram.channels} canais` : '—'}
                hint={ram?.channels ? 'estimado pelos slots' : undefined}
              />
              <Metric label="ECC" value={ram?.ecc ? 'Sim' : '—'} />
            </MetricGrid>

            {ram && ram.modules.length > 0 && (
              <div className="mt-4 space-y-2">
                {ram.modules.map((module, index) => (
                  <div
                    key={`${module.slot ?? 'mod'}-${index}`}
                    className="rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[11px] uppercase tracking-wide text-ink-400">
                        {module.slot ?? `Módulo ${index + 1}`}
                      </span>
                      <span className="font-mono text-[12.5px] text-ink-100">
                        {formatBytes(module.sizeBytes)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-400">
                      <span>
                        {[module.type, formatMts(module.speedConfiguredMts)]
                          .filter((part) => part && part !== '—')
                          .join(' · ') || '—'}
                      </span>
                      <span>{module.manufacturer ?? '—'}</span>
                      <span className="font-mono text-ink-500">{module.partNumber ?? '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ram && ram.modules.length === 0 && (
              <p className="mt-4 text-[11.5px] leading-relaxed text-ink-400">
                O total é confiável, mas os detalhes de cada pente (slot, fabricante, part
                number) não puderam ser lidos sem privilégio administrativo.
              </p>
            )}
          </Section>

          <Section collapsible title="Placa de vídeo" chip={data.gpus.length > 1 ? `${data.gpus.length}` : undefined}>
            {data.gpus.length === 0 && (
              <p className="text-[12px] text-ink-400">Nenhuma placa de vídeo identificada.</p>
            )}
            <div className="space-y-4">
              {data.gpus.map((gpu, index) => (
                <div
                  key={`${gpu.name}-${index}`}
                  className={index === 0 ? '' : 'border-t border-ink-700 pt-4'}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-[12.5px] font-medium leading-snug text-ink-100">
                      {gpu.name}
                    </span>
                    <span className="chip shrink-0">
                      {gpu.integrated ? 'integrada' : 'dedicada'}
                    </span>
                  </div>
                  <div className="mt-3">
                    <MetricGrid>
                      <Metric label="Memória" value={formatBytes(gpu.vramBytes)} />
                      <Metric label="Driver" value={gpu.driver ?? '—'} />
                      <Metric label="Fabricante" value={gpu.vendor ?? '—'} />
                      <Metric
                        label="Barramento"
                        value={[gpu.bus, gpu.busAddress].filter(Boolean).join(' · ') || '—'}
                      />
                    </MetricGrid>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section collapsible title="Discos" chip={`${data.disks.length}`}>
            {data.disks.length === 0 && (
              <p className="text-[12px] text-ink-400">Nenhum disco físico identificado.</p>
            )}
            <div className="space-y-2">
              {data.disks.map((disk) => (
                <div
                  key={disk.device}
                  className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-ink-100">{disk.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-400">
                      <span>{[disk.type, disk.interfaceType].filter(Boolean).join(' · ') || '—'}</span>
                      {disk.firmware && <span className="font-mono">fw {disk.firmware}</span>}
                      {disk.serial && (
                        <span className="truncate font-mono text-ink-500">S/N {disk.serial}</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[12.5px] text-ink-100">
                    {formatBytes(disk.sizeBytes)}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {data.notes.length > 0 && (
            <Section collapsible title="Observações" className="lg:col-span-2">
              <ul className="space-y-1.5">
                {data.notes.map((note) => (
                  <li key={note} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300">
                    <span className="text-ink-500">—</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

        </div>
      )}
    </div>
  )
}
