/**
 * Rede.
 *
 * The page runs one 30 second diagnostic and then explains the result: the
 * latency to the router (the local network) next to the latency to two public
 * resolvers (the provider), the DNS time, the download/upload and the
 * latency while the link is saturated (bufferbloat).
 *
 * Nothing is measured on open - the test saturates the connection, so it only
 * runs when the user asks. The last report lives in the main process, so
 * leaving the page and coming back does not throw it away.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  NetworkPingStat,
  NetworkProgress,
  NetworkReport,
  NetworkVerdict
} from '@shared/features/network'
import { formatMbps, formatMs, formatPercent } from '@shared/format'
import { Card } from '../components/ui/Card'
import { Metric, MetricGrid } from '../components/ui/Metric'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'

const VERDICT_LABEL: Record<NetworkVerdict, string> = {
  good: 'Estável',
  warning: 'Atenção',
  critical: 'Ruim',
  unknown: 'Sem dados'
}

const KIND_LABEL = {
  wifi: 'Wi-Fi',
  ethernet: 'Ethernet (cabo)',
  other: 'Adaptador'
} as const

function clock(epoch: number): string {
  return new Date(epoch).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function adapterLine(report: NetworkReport): string {
  const adapter = report.adapter
  if (!adapter) return 'Sem conexão ativa'
  return [
    KIND_LABEL[adapter.kind],
    adapter.linkMbps !== undefined ? `${adapter.linkMbps} Mbps` : undefined,
    adapter.ip
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

/** A latency target, with the loss as the badge. */
function PingCard({ stat }: { stat: NetworkPingStat }): React.JSX.Element {
  const alert =
    !stat.answered || stat.lossPercent > 1 || (stat.avgMs !== undefined && stat.avgMs > 80)

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink-100">{stat.name}</div>
          <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-500">
            {stat.address}
          </div>
        </div>
        <span className="verdict shrink-0" data-alert={alert}>
          {stat.answered ? `${formatPercent(stat.lossPercent, 1)} perda` : 'sem resposta'}
        </span>
      </div>

      <div className="mt-3 font-mono text-[22px] leading-none text-ink-100">
        {stat.answered ? formatMs(stat.avgMs) : '—'}
      </div>
      <div className="mt-1 text-[10.5px] text-ink-500">
        {stat.answered ? `média de ${stat.sent} pacotes` : 'não respondeu'}
      </div>

      {stat.answered && (
        <div className="mt-4">
          <MetricGrid columns={2}>
            <Metric label="Mínima" value={formatMs(stat.minMs)} />
            <Metric label="Máxima" value={formatMs(stat.maxMs)} />
            <Metric label="Jitter" value={formatMs(stat.jitterMs)} />
            <Metric
              label="Pacotes"
              value={`${stat.sent - stat.lost}/${stat.sent}`}
              hint={stat.lost > 0 ? `${stat.lost} perdido(s)` : 'nenhum perdido'}
            />
          </MetricGrid>
        </div>
      )}
    </Card>
  )
}

function VerdictCard({ report }: { report: NetworkReport }): React.JSX.Element {
  const adapter = report.adapter
  const label = adapter ? VERDICT_LABEL[report.verdict] : 'Sem rede'

  return (
    <Card className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-ink-100">Diagnóstico de rede</div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-500">
            {adapterLine(report)} · testado às {clock(report.at)}
          </div>
        </div>
        <span className="verdict shrink-0" data-alert={report.verdict !== 'good'}>
          {label}
        </span>
      </div>

      <ul className="mt-4 space-y-1.5">
        {report.reasons.map((reason) => (
          <li
            key={reason}
            className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300"
          >
            <span className="text-ink-500">—</span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-ink-800 pt-4">
        <MetricGrid columns={3}>
          <Metric
            label="Adaptador"
            value={adapter?.name ?? '—'}
            hint={adapter ? KIND_LABEL[adapter.kind] : undefined}
          />
          <Metric label="IP" value={adapter?.ip ?? '—'} />
          <Metric label="Roteador" value={adapter?.gateway ?? '—'} />
          <Metric
            label="Servidores DNS"
            value={adapter && adapter.dns.length > 0 ? adapter.dns.join(' · ') : '—'}
          />
          <Metric
            label="Link"
            value={adapter?.linkMbps !== undefined ? `${adapter.linkMbps} Mbps` : '—'}
          />
          <Metric label="Latência sob carga" value={formatMs(report.loadedMs)} />
        </MetricGrid>
      </div>
    </Card>
  )
}

function SpeedCard({ report }: { report: NetworkReport }): React.JSX.Element {
  const inline = (label: string, value: string, hint?: string): React.JSX.Element => (
    <div className="min-w-0">
      <div className="metric-label">{label}</div>
      <div className="mt-1 font-mono text-[20px] leading-none text-ink-100">{value}</div>
      {hint && <div className="mt-1 text-[10.5px] text-ink-500">{hint}</div>}
    </div>
  )

  return (
    <Card>
      <div className="metric-label">Velocidade (Cloudflare)</div>
      <div className="mt-3 grid grid-cols-2 gap-6">
        {inline('Download', formatMbps(report.downloadMbps))}
        {inline('Upload', formatMbps(report.uploadMbps))}
      </div>
      <p className="mt-4 border-t border-ink-800 pt-3 text-[11px] leading-relaxed text-ink-500">
        {report.loadedMs !== undefined
          ? `Latência durante o download: ${formatMs(report.loadedMs)}. ` +
            'Quando ela sobe muito com a conexão cheia, o roteador precisa de SQM/QoS.'
          : 'A latência sob carga não pôde ser medida.'}
      </p>
    </Card>
  )
}

function DnsCard({ report }: { report: NetworkReport }): React.JSX.Element {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <div className="metric-label">Resolução de DNS</div>
        <div className="font-mono text-[12px] text-ink-300">
          média {formatMs(report.dnsMs)}
        </div>
      </div>

      <ul className="mt-2 divide-y divide-ink-800">
        {report.dns.map((lookup) => (
          <li
            key={lookup.domain}
            className="flex items-center justify-between gap-3 py-2 text-[11.5px]"
          >
            <span className="truncate text-ink-300">{lookup.domain}</span>
            <span
              className={`shrink-0 font-mono ${
                lookup.ms === undefined ? 'text-ink-500' : 'text-ink-100'
              }`}
            >
              {lookup.ms === undefined ? 'falhou' : formatMs(lookup.ms)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function IntroCard(): React.JSX.Element {
  return (
    <Card className="max-w-3xl">
      <div className="metric-label">O que o teste mede</div>
      <ul className="mt-3 space-y-1.5">
        {[
          'Latência, jitter e perda até o roteador e até a internet (1.1.1.1 e 8.8.8.8)',
          'Tempo de resolução de três domínios (DNS)',
          'Download e upload pelo speed.cloudflare.com (≈ 8 s e ≈ 6 s)',
          'Latência enquanto o download satura a conexão (bufferbloat)'
        ].map((item) => (
          <li key={item} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300">
            <span className="text-ink-500">—</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-500">
        Leva cerca de 30 segundos, funciona sem privilégio e não grava nada em disco. O teste
        usa a conexão inteira enquanto roda; o botão vira <strong>Cancelar</strong>.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
        O roteador pode bloquear ping: isso, sozinho, não é um problema. O veredito compara a
        rede local com a internet para dizer onde está o atraso.
      </p>
    </Card>
  )
}

function ProgressCard({ progress }: { progress: NetworkProgress }): React.JSX.Element {
  const percent = Math.round(Math.max(0, Math.min(1, progress.fraction)) * 100)

  return (
    <Card className="max-w-3xl">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[12.5px] text-ink-200">{progress.text}</div>
        <div className="font-mono text-[11px] text-ink-400">{percent}%</div>
      </div>
      <div
        className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ink-700"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full bg-ink-100 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-3 text-[10.5px] text-ink-500">
        O download e o upload usam a conexão inteira. Você pode continuar usando o app; o teste
        segue no processo principal.
      </p>
    </Card>
  )
}

export function NetworkPage(): React.JSX.Element {
  const [report, setReport] = useState<NetworkReport | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<NetworkProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canceled, setCanceled] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // The report belongs to the main process; opening the page shows the last
  // one instead of pretending no test ever ran.
  useEffect(() => {
    let mounted = true
    window.myrgb
      .getNetworkReport()
      .then((last) => {
        if (mounted && last) setReport(last)
      })
      .catch(() => undefined)
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => window.myrgb.onNetworkProgress(setProgress), [])

  const start = useCallback(async () => {
    setRunning(true)
    setCanceled(false)
    setError(null)
    setProgress({ text: 'Procurando a conexão ativa…', fraction: 0.02 })
    try {
      const result = await window.myrgb.runNetworkDiagnosis()
      if (!alive.current) return
      if (result) setReport(result)
      else setCanceled(true)
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (alive.current) {
        setRunning(false)
        setProgress(null)
      }
    }
  }, [])

  const cancel = useCallback(async () => {
    try {
      await window.myrgb.cancelNetworkDiagnosis()
    } catch {
      // The pending diagnose call already reports the cancellation.
    }
  }, [])

  const subtitle = report
    ? report.adapter
      ? `${VERDICT_LABEL[report.verdict]} · ${adapterLine(report)}`
      : 'Sem conexão ativa'
    : 'Latência, DNS, velocidade e bufferbloat em um teste só.'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="network" subtitle={subtitle}>
        <button className="btn" onClick={() => void (running ? cancel() : start())}>
          {running ? 'Cancelar' : 'Diagnosticar (~30 s)'}
        </button>
      </PageHeader>

      <div className="mt-5 space-y-4">
        {running && progress && <ProgressCard progress={progress} />}

        {canceled && !running && (
          <p className="text-[11.5px] text-ink-400">
            Teste cancelado. O último resultado, se houver, continua abaixo.
          </p>
        )}

        {error && (
          <Card className="max-w-3xl">
            <div className="metric-label">Falha no diagnóstico</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
            <button className="btn mt-4" onClick={() => void start()}>
              Tentar de novo
            </button>
          </Card>
        )}

        {!report && !running && !error && <IntroCard />}

        {report && (
          <>
            <VerdictCard report={report} />

            {report.internet.length > 0 && (
              <Section title="Latência e perda">
                <div className="grid gap-4 xl:grid-cols-3">
                  {report.gateway && <PingCard stat={report.gateway} />}
                  {report.internet.map((stat) => (
                    <PingCard key={stat.address} stat={stat} />
                  ))}
                </div>
              </Section>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              <SpeedCard report={report} />
              <DnsCard report={report} />
            </div>

            {report.notes.length > 0 && (
              <Card className="max-w-3xl">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
                  Observações
                </h2>
                <ul className="mt-3 space-y-1.5">
                  {report.notes.map((note) => (
                    <li
                      key={note}
                      className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300"
                    >
                      <span className="text-ink-500">—</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <p className="text-[11px] text-ink-500">
              Teste feito pelo speed.cloudflare.com; nenhum resultado é gravado em disco. O
              veredito compara a rede local (roteador) com a internet para apontar onde está o
              atraso. Se o jogo ainda engasga com a rede estável, veja o Gargalo.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
