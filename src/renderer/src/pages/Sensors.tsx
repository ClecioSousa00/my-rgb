/**
 * Sensores.
 *
 * The page is a viewer for the stream the main process collects once per
 * second. It never polls on its own: `startSensors` subscribes, the batches
 * arrive through `onSensors`, and leaving the page unsubscribes. That keeps
 * the cost at zero while another page is open.
 *
 * Each reading carries the session minimum, maximum and history from the main
 * process, so opening the page again shows the whole session instead of
 * restarting the sparkline.
 *
 * Filters are local: a kind chip plus a text search. Nothing is re-fetched,
 * because the snapshot already has everything.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CoolingSnapshot,
  CoolingStatus,
  SensorKind,
  SensorReading,
  SensorsSnapshot
} from '@shared/features/sensors'
import { COOLING_STOPPED_RPM, SENSOR_INTERVAL_MS } from '@shared/features/sensors'
import { formatSensor } from '@shared/format'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Section } from '../components/ui/Section'
import { Sparkline } from '../components/ui/Sparkline'

const KIND_ORDER: SensorKind[] = [
  'temperature',
  'load',
  'clock',
  'power',
  'voltage',
  'fan',
  'memory'
]

const KIND_LABEL: Record<SensorKind, string> = {
  temperature: 'Temperatura',
  load: 'Carga',
  clock: 'Clock',
  power: 'Consumo',
  voltage: 'Tensão',
  fan: 'Ventoinha',
  memory: 'Memória'
}

const COOLING_LABEL: Record<CoolingStatus, string> = {
  ok: 'Normal',
  idle: 'Parado',
  warning: 'Atenção',
  unknown: 'Sem dados'
}

/**
 * The pump and fan summary.
 *
 * It sits above the raw table because "is the pump turning?" is a question
 * about one number, and hunting for it among forty readings is how a stopped
 * pump goes unnoticed. The rows are the same readings, with the session range
 * and the last minute - nothing is computed here.
 */
function CoolingCard({ cooling }: { cooling: CoolingSnapshot }): React.JSX.Element {
  return (
    <Section
      title="Refrigeração"
      chip={cooling.channels.length > 0 ? `${cooling.channels.length}` : undefined}
      className="mt-6"
      action={
        <span className="verdict" data-alert={cooling.status === 'warning'}>
          {COOLING_LABEL[cooling.status]}
        </span>
      }
    >
      <p className="text-[12px] leading-relaxed text-ink-200">{cooling.verdict}</p>

      {cooling.alarms.length > 1 && (
        <ul className="mt-3 space-y-1">
          {/* The first alarm is the verdict above; the rest would be lost. */}
          {cooling.alarms.slice(1).map((alarm) => (
            <li key={alarm} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300">
              <span className="text-ink-500">—</span>
              <span>{alarm}</span>
            </li>
          ))}
        </ul>
      )}

      {cooling.channels.length > 0 && (
        <div className="mt-4">
          <div className="sensor-head">
            <span>Ventoinha / bomba</span>
            <span>agora</span>
            <span>mín</span>
            <span>máx</span>
            <span aria-hidden="true" />
          </div>
          {cooling.channels.map((channel) => {
            const stopped =
              channel.unit === '%' ? channel.value <= 0 : channel.value < COOLING_STOPPED_RPM
            return (
              <div className="sensor-row" key={channel.id}>
                <div className="min-w-0">
                  <div className="truncate text-[12px] text-ink-200">
                    {channel.role === 'pump' ? `Bomba · ${channel.label}` : channel.label}
                  </div>
                  <div className="truncate text-[10px] text-ink-500">
                    {channel.chip}
                    {channel.role === 'pump' ? ' · canal identificado como bomba' : ''}
                  </div>
                </div>
                <span className="sensor-value" data-alert={stopped}>
                  {formatSensor(channel.value, channel.unit)}
                </span>
                <span className="sensor-minmax">{formatSensor(channel.min, channel.unit)}</span>
                <span className="sensor-minmax">{formatSensor(channel.max, channel.unit)}</span>
                <Sparkline values={channel.history ?? []} alert={stopped} />
              </div>
            )
          })}
        </div>
      )}

      {cooling.notes.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-ink-800 pt-3">
          {cooling.notes.map((note) => (
            <li key={note} className="flex gap-2 text-[11px] leading-relaxed text-ink-400">
              <span className="text-ink-500">—</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

type KindFilter = SensorKind | 'all'

/** Whether the reading deserves the inverted treatment. */
function isCritical(reading: SensorReading): boolean {
  return reading.critical !== undefined && reading.value >= reading.critical
}

function matches(reading: SensorReading, query: string): boolean {
  if (!query) return true
  const haystack = `${reading.chip} ${reading.label} ${KIND_LABEL[reading.kind]}`.toLowerCase()
  return haystack.includes(query)
}

export function SensorsPage(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<SensorsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  /** Read by the unmount cleanup, which must not release a reference the
   * pause already released (a double `stop` would kill another consumer). */
  const pausedRef = useRef(false)
  const [kind, setKind] = useState<KindFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true

    const unsubscribe = window.myrgb.onSensors((next) => {
      if (!alive) return
      setSnapshot(next)
      setError(null)
    })

    void window.myrgb
      .startSensors()
      .then((initial) => {
        if (!alive || !initial) return
        setSnapshot(initial)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
      })

    // StrictMode runs this cleanup once in development and the store counts
    // subscribers, so the second mount still has a running poll.
    return () => {
      alive = false
      unsubscribe()
      // If the user paused, this page already released its reference; a
      // second stop here would decrement another consumer (overlay, session).
      if (!pausedRef.current) {
        void window.myrgb.stopSensors().catch(() => {})
      }
    }
  }, [])

  const readings = snapshot?.readings ?? []

  const counts = useMemo(() => {
    const map = new Map<SensorKind, number>()
    for (const reading of readings) {
      map.set(reading.kind, (map.get(reading.kind) ?? 0) + 1)
    }
    return map
  }, [readings])

  const normalizedQuery = query.trim().toLowerCase()

  const groups = useMemo(() => {
    const byChip = new Map<string, SensorReading[]>()
    for (const reading of readings) {
      if (kind !== 'all' && reading.kind !== kind) continue
      if (!matches(reading, normalizedQuery)) continue
      const list = byChip.get(reading.chip)
      if (list) list.push(reading)
      else byChip.set(reading.chip, [reading])
    }
    // The main process sorts the batch; Map keeps the first-seen order, so the
    // groups stay in the same stable order between polls.
    return [...byChip.entries()]
  }, [readings, kind, normalizedQuery])

  const visible = groups.reduce((total, [, list]) => total + list.length, 0)

  const togglePause = (): void => {
    if (paused) {
      pausedRef.current = false
      setPaused(false)
      void window.myrgb
        .startSensors()
        .then((initial) => {
          if (initial) setSnapshot(initial)
        })
        .catch((err: unknown) => {
          // The stream did not resume: show it as paused instead of claiming
          // "ao vivo" over frozen values.
          pausedRef.current = true
          setPaused(true)
          setError(err instanceof Error ? err.message : String(err))
        })
    } else {
      pausedRef.current = true
      setPaused(true)
      void window.myrgb.stopSensors().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="sensors">
        <span
          className={paused ? 'live-dot' : 'live-dot animate-pulse-dot'}
          data-live={!paused && snapshot !== null}
          aria-hidden="true"
        />
        <span className="text-[11px] text-ink-400">
          {paused
            ? 'pausado'
            : snapshot
              ? `ao vivo · ${Math.round(SENSOR_INTERVAL_MS / 1000)} s`
              : 'conectando…'}
        </span>
        <button className="btn" onClick={togglePause}>
          {paused ? 'Retomar' : 'Pausar'}
        </button>
      </PageHeader>

      {error && (
        <Card className="mt-6 max-w-3xl">
          <div className="metric-label">Falha ao ler os sensores</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
        </Card>
      )}

      {!snapshot && !error && (
        <div className="mt-8 text-[12px] text-ink-400">Coletando a primeira leitura…</div>
      )}

      {snapshot && (
        <>
          {snapshot.cooling && <CoolingCard cooling={snapshot.cooling} />}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              className="chip"
              data-active={kind === 'all'}
              aria-pressed={kind === 'all'}
              onClick={() => setKind('all')}
            >
              Todos <span className="text-ink-500">{readings.length}</span>
            </button>
            {KIND_ORDER.filter((item) => (counts.get(item) ?? 0) > 0).map((item) => (
              <button
                key={item}
                className="chip"
                data-active={kind === item}
                aria-pressed={kind === item}
                onClick={() => setKind(item)}
              >
                {KIND_LABEL[item]} <span className="text-ink-500">{counts.get(item)}</span>
              </button>
            ))}
            <div className="ml-auto w-56">
              <input
                className="field"
                type="search"
                placeholder="Buscar sensor"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {groups.map(([chip, list]) => (
              <Section key={chip} title={chip} chip={`${list.length}`} scroll>
                <div className="sensor-head">
                  <span>Sensor</span>
                  <span>agora</span>
                  <span>mín</span>
                  <span>máx</span>
                  <span aria-hidden="true" />
                </div>
                {list.map((reading) => {
                  const alert = isCritical(reading)
                  return (
                    <div className="sensor-row" key={reading.id}>
                      <div className="min-w-0">
                        <div className="truncate text-[12px] text-ink-200">{reading.label}</div>
                        <div className="text-[10px] text-ink-500">
                          {KIND_LABEL[reading.kind]}
                          {reading.critical !== undefined &&
                            ` · limite ${formatSensor(reading.critical, reading.unit)}`}
                        </div>
                      </div>
                      <span className="sensor-value" data-alert={alert}>
                        {formatSensor(reading.value, reading.unit)}
                      </span>
                      <span className="sensor-minmax">{formatSensor(reading.min, reading.unit)}</span>
                      <span className="sensor-minmax">{formatSensor(reading.max, reading.unit)}</span>
                      <Sparkline values={reading.history ?? []} alert={alert} />
                    </div>
                  )
                })}
              </Section>
            ))}
          </div>

          {visible === 0 && (
            <Card className="mt-4">
              <p className="text-[12px] text-ink-400">
                {readings.length === 0
                  ? 'Nenhum sensor pôde ser lido nesta máquina.'
                  : 'Nenhum sensor corresponde ao filtro e à busca atuais.'}
              </p>
            </Card>
          )}

          {snapshot.notes.length > 0 && (
            <Card className="mt-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
                Observações
              </h2>
              <ul className="mt-4 space-y-1.5">
                {snapshot.notes.map((note) => (
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
        </>
      )}
    </div>
  )
}
