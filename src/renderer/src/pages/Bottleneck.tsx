/**
 * Gargalo.
 *
 * Three questions, three blocks: what the hardware pairing suggests (the
 * theoretical balance), what is limiting the FPS right now (the live sample)
 * and what happened over a 1/3/5 minute session (the distribution).
 *
 * The live block is the useful one during a game, the session is the one that
 * survives a bad match - a single second can show a menu, thirty samples show
 * the truth. Nothing here invents a number: a missing sensor is "—" and the
 * rule that depended on it is skipped with a note.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BottleneckBalance,
  BottleneckDistributionEntry,
  BottleneckHardware,
  BottleneckLimiter,
  BottleneckLive,
  BottleneckSessionMinutes,
  BottleneckSessionProgress,
  BottleneckSessionReport
} from '@shared/features/bottleneck'
import {
  BOTTLENECK_LIMITER_LABEL,
  BOTTLENECK_SESSION_MINUTES
} from '@shared/features/bottleneck'
import { Card } from '../components/ui/Card'
import { Meter } from '../components/ui/Meter'
import { Metric, MetricGrid } from '../components/ui/Metric'
import { PageHeader } from '../components/ui/PageHeader'

/** Limiters that deserve the inverted treatment, like the original card. */
const ALERT_LIMITERS: BottleneckLimiter[] = ['cpu', 'vram', 'ram', 'thermal']

function alertOf(limiter: BottleneckLimiter | undefined): boolean {
  return limiter !== undefined && ALERT_LIMITERS.includes(limiter)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function percent(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value)} %`
}

function degrees(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value)} °C`
}

function ratio(value: number): string {
  return `${value.toFixed(2)}×`
}

/** mm:ss, for the session clock. */
function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Log scale 0.4× … 2.5×, the same axis as the Reset Explode marker. */
const LOG_MIN = Math.log(0.4)
const LOG_MAX = Math.log(2.5)

function axisPosition(value: number): number {
  return clamp((Math.log(value) - LOG_MIN) / (LOG_MAX - LOG_MIN), 0, 1)
}

const AXIS_TICKS = [0.4, 0.7, 1, 1.3, 1.8, 2.5]

// ---------------------------------------------------------------------------
// Theoretical balance
// ---------------------------------------------------------------------------

function HardwareLine({
  label,
  hardware
}: {
  label: string
  hardware: BottleneckHardware
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-3 border-b border-ink-700 pb-2 last:border-0">
      <span className="w-9 shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100" title={hardware.name}>
        {hardware.short}
      </span>
      {hardware.fallback && <span className="chip shrink-0">fora da tabela</span>}
      <span className="w-8 shrink-0 text-right font-mono text-[12px] text-ink-300">
        {hardware.index}
      </span>
    </div>
  )
}

function BalanceCard({ balance }: { balance: BottleneckBalance }): React.JSX.Element {
  const position = axisPosition(balance.ratio)
  const marker = 4 + position * 92

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <div className="metric-label">Equilíbrio teórico</div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
            Compara o desempenho relativo dos dois, sem medir jogo nenhum: RTX 4070 e Ryzen 7 7700X
            valem 100.
          </p>
        </div>
        <div className="text-right">
          <div className="metric-label">GPU ÷ CPU</div>
          <div className="mt-1 font-mono text-[26px] leading-none text-ink-100">
            {ratio(balance.ratio)}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <HardwareLine label="CPU" hardware={balance.cpu} />
        <HardwareLine label="GPU" hardware={balance.gpu} />
      </div>

      <div className="relative mx-4 mt-7 h-12" aria-hidden="true">
        <div className="absolute inset-x-0 top-4 h-px bg-ink-600" />
        {AXIS_TICKS.map((tick) => (
          <div
            key={tick}
            className="absolute top-3 -translate-x-1/2 text-center"
            style={{ left: `${axisPosition(tick) * 100}%` }}
          >
            <div className={`mx-auto w-px bg-ink-600 ${tick === 1 ? 'h-3' : 'h-2'}`} />
            <div
              className={`mt-1 font-mono text-[9.5px] ${
                tick === 1 ? 'text-ink-300' : 'text-ink-500'
              }`}
            >
              {tick}×
            </div>
          </div>
        ))}
        <div
          className="absolute top-0 -translate-x-1/2 text-center"
          style={{ left: `${marker}%` }}
        >
          <div className="mx-auto h-4 w-[2px] bg-ink-100" />
          <div className="mt-0.5 whitespace-nowrap font-mono text-[10px] text-ink-100">
            {ratio(balance.ratio)}
          </div>
        </div>
      </div>

      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-200">{balance.text}</p>

      {balance.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {balance.notes.map((note) => (
            <li key={note} className="flex gap-2 text-[11px] leading-relaxed text-ink-500">
              <span>—</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Live sample
// ---------------------------------------------------------------------------

function LiveCard({ live }: { live: BottleneckLive }): React.JSX.Element {
  const alert = alertOf(live.limiter)
  const sample = live.sample
  const hottest = Math.max(sample.gpuTemp ?? 0, sample.cpuTemp ?? 0)

  return (
    <Card>
      <div
        className={`rounded-xl px-4 py-3 ${alert ? 'bg-ink-100' : 'border border-ink-700 bg-ink-850'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${
                alert ? 'text-black/55' : 'text-ink-500'
              }`}
            >
              Limitador agora
            </div>
            <div
              className={`mt-1 text-[19px] font-semibold leading-tight ${
                alert ? 'text-black' : 'text-ink-100'
              }`}
            >
              {live.title}
            </div>
          </div>
          <span
            className={`shrink-0 font-mono text-[10.5px] ${alert ? 'text-black/55' : 'text-ink-500'}`}
          >
            ao vivo · 1 s
          </span>
        </div>
        <p
          className={`mt-2 text-[11.5px] leading-relaxed ${alert ? 'text-black/70' : 'text-ink-300'}`}
        >
          {live.advice}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Meter label="Carga da GPU" text={percent(sample.gpuLoad)} value={sample.gpuLoad} />
        <Meter label="Carga total da CPU" text={percent(sample.cpuTotal)} value={sample.cpuTotal} />
        <Meter
          label="Núcleo mais ocupado"
          text={percent(sample.cpuMaxCore)}
          hint={sample.busiestCore}
          value={sample.cpuMaxCore}
        />
        <Meter label="VRAM em uso" text={percent(sample.vramPct)} value={sample.vramPct} />
        <Meter label="RAM em uso" text={percent(sample.ramPct)} value={sample.ramPct} />
        <Meter
          label="Temperaturas (GPU / CPU)"
          text={`${degrees(sample.gpuTemp)} / ${degrees(sample.cpuTemp)}`}
          value={hottest}
        />
      </div>

      {live.notes.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {live.notes.map((note) => (
            <li key={note} className="flex gap-2 text-[11px] leading-relaxed text-ink-500">
              <span>—</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

const SHADES = [
  'var(--color-ink-100)',
  'var(--color-ink-400)',
  'var(--color-ink-600)',
  'var(--color-ink-300)',
  'var(--color-ink-500)',
  'var(--color-ink-200)'
]

function Distribution({
  entries
}: {
  entries: BottleneckDistributionEntry[]
}): React.JSX.Element {
  let offset = 0

  return (
    <>
      <svg
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        className="h-3 w-full"
        role="img"
        aria-label="Distribuição dos limitadores durante a sessão"
      >
        {entries.map((entry, index) => {
          const x = offset
          offset += entry.percent
          return (
            <rect
              key={entry.limiter}
              x={x}
              y={0}
              width={entry.percent}
              height={8}
              fill={SHADES[index % SHADES.length]}
            />
          )
        })}
      </svg>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {entries.map((entry, index) => (
          <li key={entry.limiter} className="flex items-center gap-2 text-[11.5px]">
            <span
              className="h-2 w-2 shrink-0"
              style={{ background: SHADES[index % SHADES.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-300">{entry.title}</span>
            <span className="font-mono text-ink-100">{Math.round(entry.percent)}%</span>
            <span className="w-14 shrink-0 text-right font-mono text-[10.5px] text-ink-500">
              {entry.samples} am.
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function ReportCard({ report }: { report: BottleneckSessionReport }): React.JSX.Element {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="metric-label">Resultado da sessão</div>
          <div className="mt-1 text-[19px] font-semibold leading-tight text-ink-100">
            {report.title}
          </div>
        </div>
        <div className="text-right">
          <span className="verdict" data-alert={alertOf(report.main)}>
            {report.main ? BOTTLENECK_LIMITER_LABEL[report.main] : 'sem amostras'}
          </span>
          <div className="mt-1 font-mono text-[10.5px] text-ink-500">
            {report.samples} amostras · {report.durationMinutes} min
          </div>
        </div>
      </div>

      <div className="mt-5">
        <MetricGrid columns={3}>
          <Metric
            label="FPS médio"
            value={report.avgFps === undefined ? '—' : Math.round(report.avgFps)}
            hint={report.avgFps === undefined ? 'sem FPS nesta sessão' : undefined}
          />
          <Metric label="GPU média" value={percent(report.avgGpuLoad)} />
          <Metric label="CPU média" value={percent(report.avgCpuLoad)} />
          <Metric label="Núcleo mais ocupado" value={percent(report.avgCpuMaxCore)} />
          <Metric label="VRAM máxima" value={percent(report.maxVramPct)} />
          <Metric label="RAM máxima" value={percent(report.maxRamPct)} />
          <Metric label="GPU máxima" value={degrees(report.maxGpuTemp)} />
          <Metric label="CPU máxima" value={degrees(report.maxCpuTemp)} />
          <Metric label="Amostras" value={report.samples} />
        </MetricGrid>
      </div>

      {report.distribution.length > 0 && (
        <div className="mt-6">
          <div className="metric-label">Distribuição do tempo</div>
          <div className="mt-2">
            <Distribution entries={report.distribution} />
          </div>
        </div>
      )}

      <p className="mt-5 text-[12px] leading-relaxed text-ink-300">{report.advice}</p>
    </Card>
  )
}

function SessionCard({
  session,
  report,
  minutes,
  cancelled,
  busy,
  error,
  onMinutes,
  onStart,
  onCancel
}: {
  session: BottleneckSessionProgress | null
  report: BottleneckSessionReport | null
  minutes: BottleneckSessionMinutes
  cancelled: boolean
  busy: boolean
  error: string | null
  onMinutes: (minutes: BottleneckSessionMinutes) => void
  onStart: () => void
  onCancel: () => void
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!session) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [session])

  const elapsed = session ? clamp(now - session.startedAt, 0, session.endsAt - session.startedAt) : 0
  const duration = session ? session.endsAt - session.startedAt : 0
  const percentDone = duration > 0 ? Math.round((elapsed / duration) * 100) : 0

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <div className="metric-label">Análise de sessão</div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
            Abra o jogo e deixe rodar. A cada segundo o app classifica o limitador; no fim, a
            distribuição mostra o que segurou o FPS na maior parte do tempo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="metric-label">Duração</span>
          {BOTTLENECK_SESSION_MINUTES.map((value) => (
            <button
              key={value}
              className="chip"
              data-active={minutes === value}
              aria-pressed={minutes === value}
              disabled={session !== null}
              onClick={() => onMinutes(value as BottleneckSessionMinutes)}
            >
              {value} min
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {session ? (
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        ) : (
          <button className="btn" onClick={onStart} disabled={busy}>
            {busy ? 'Iniciando…' : 'Iniciar análise'}
          </button>
        )}

        {session && (
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[11.5px] text-ink-200">
                Coletando… {clock(elapsed)} de {clock(duration)} · {session.samples}{' '}
                {session.samples === 1 ? 'amostra' : 'amostras'}
                {session.leading
                  ? ` · ${BOTTLENECK_LIMITER_LABEL[session.leading]} na frente`
                  : ''}
              </div>
              <div className="font-mono text-[10.5px] text-ink-500">{percentDone}%</div>
            </div>
            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-700"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentDone}
            >
              <div
                className="h-full bg-ink-100 transition-[width] duration-300"
                style={{ width: `${percentDone}%` }}
              />
            </div>
          </div>
        )}

        {!session && !report && !cancelled && !error && (
          <span className="text-[11px] text-ink-500">
            Nada é gravado em disco; o resultado fica só nesta sessão do app.
          </span>
        )}
        {!session && cancelled && (
          <span className="text-[11px] text-ink-300">Análise cancelada.</span>
        )}
        {!session && error && <span className="text-[11px] text-ink-200">{error}</span>}
      </div>

      {report && (
        <div className="mt-5">
          <ReportCard report={report} />
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BottleneckPage(): React.JSX.Element {
  const [balance, setBalance] = useState<BottleneckBalance | null>(null)
  const [live, setLive] = useState<BottleneckLive | null>(null)
  const [session, setSession] = useState<BottleneckSessionProgress | null>(null)
  const [report, setReport] = useState<BottleneckSessionReport | null>(null)
  const [minutes, setMinutes] = useState<BottleneckSessionMinutes>(1)
  const [cancelled, setCancelled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pushed = useRef(false)

  useEffect(() => {
    let alive = true
    pushed.current = false

    const unsubscribe = window.myrgb.onBottleneck((update) => {
      if (!alive) return
      pushed.current = true
      if (update.live) setLive(update.live)
      setSession(update.session)
      if (update.report) {
        setReport(update.report)
        setCancelled(false)
      }
    })

    window.myrgb
      .startBottleneck()
      .then((snapshot) => {
        if (!alive) return
        setBalance(snapshot.balance)
        if (pushed.current) return
        setLive(snapshot.live)
        setSession(snapshot.session)
        setReport(snapshot.report)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      alive = false
      unsubscribe()
      void window.myrgb.stopBottleneck()
    }
  }, [])

  const start = useCallback(async () => {
    setBusy(true)
    setError(null)
    setCancelled(false)
    try {
      const progress = await window.myrgb.startBottleneckSession(minutes)
      setReport(null)
      setSession(progress)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [minutes])

  const cancel = useCallback(async () => {
    setBusy(true)
    try {
      await window.myrgb.stopBottleneckSession()
      setSession(null)
      setReport(null)
      setCancelled(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const subtitle = balance
    ? `${balance.cpu.short} · ${balance.gpu.short}`
    : 'O que está segurando o FPS: GPU, CPU, memória ou temperatura.'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="bottleneck" subtitle={subtitle}>
        <span className="chip" data-active={live !== null}>
          {live ? 'ao vivo · 1 s' : 'aguardando sensores'}
        </span>
      </PageHeader>

      {error && (
        <Card className="mt-5 max-w-3xl">
          <div className="metric-label">Falha ao ler o gargalo</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
        </Card>
      )}

      {!balance && !error && (
        <div className="mt-8 text-[12px] text-ink-400">Lendo o hardware…</div>
      )}

      {balance && (
        <div className="mt-5 grid max-w-5xl gap-4">
          <BalanceCard balance={balance} />

          {live ? (
            <LiveCard live={live} />
          ) : (
            <Card>
              <div className="metric-label">Leitura ao vivo</div>
              <p className="mt-2 text-[12px] text-ink-400">
                Esperando a primeira coleta de sensores…
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                Sem placa NVIDIA com nvidia-smi, carga e temperatura da GPU não aparecem; o
                limitador continua sendo classificado com o que a máquina informa.
              </p>
            </Card>
          )}

          <SessionCard
            session={session}
            report={report}
            minutes={minutes}
            cancelled={cancelled}
            busy={busy}
            error={error}
            onMinutes={setMinutes}
            onStart={() => void start()}
            onCancel={() => void cancel()}
          />

          <p className="max-w-3xl text-[11px] leading-relaxed text-ink-500">
            Regras, na ordem: VRAM ≥ 97 % → temperatura (CPU ≥ 95 °C ou GPU em queda térmica) →
            GPU ≥ 90 % → CPU ou núcleo ≥ 85 % → RAM ≥ 92 % → nada no limite (trava, V-Sync ou menu).
            A queda térmica da GPU é aproximada pela temperatura ≥ 90 °C; o Reset Explode lê os
            bits de throttle da NVML, que o nvidia-smi não expõe. O FPS real vem do helper do
            Windows, o mesmo do overlay; no Linux a sessão roda sem FPS.
          </p>
        </div>
      )}
    </div>
  )
}
