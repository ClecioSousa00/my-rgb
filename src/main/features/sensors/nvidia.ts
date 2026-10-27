/**
 * NVIDIA GPU sensors via `nvidia-smi`.
 *
 * It is the only source that works on both platforms without a helper, and it
 * costs one short-lived process per poll. When the binary is missing (or the
 * driver is not loaded) the attempt is remembered for a minute, so a machine
 * without an NVIDIA card does not spawn a failing process every second.
 *
 * Fields the driver refuses to report come back as `[N/A]`; those readings are
 * dropped instead of being shown as zero.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SensorReading } from '@shared/features/sensors'

const run = promisify(execFile)

const FIELDS_REQUIRED = [
  'name',
  'temperature.gpu',
  'utilization.gpu',
  'clocks.gr',
  'power.draw',
  'fan.speed',
  'memory.used',
  'memory.total'
]

/**
 * Not every driver knows these; the query is retried without them once, and
 * then stays without them for the rest of the run. They are last in the list
 * so the required columns keep their positions.
 */
const FIELDS_OPTIONAL = ['clocks.mem', 'temperature.memory']

/** How long to wait before trying nvidia-smi again after a failure. */
const RETRY_AFTER_MS = 60_000

export interface NvidiaSample {
  name: string
  temperature?: number
  utilization?: number
  clockMhz?: number
  powerW?: number
  fanPct?: number
  /** Share of the card's memory in use, 0–100. */
  vramPct?: number
  memoryClockMhz?: number
  /** Memory junction temperature; not every driver reports it. */
  memoryTemperature?: number
}

function numberOrUndefined(text: string | undefined): number | undefined {
  if (!text) return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

/** Parse `--format=csv,noheader,nounits` output, one line per GPU. */
export function parseNvidiaSmi(stdout: string): NvidiaSample[] {
  return stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        name,
        temperature,
        utilization,
        clock,
        power,
        fan,
        memoryUsed,
        memoryTotal,
        memoryClock,
        memoryTemperature
      ] = line
        .split(',')
        .map((part) => part.trim())

      const used = numberOrUndefined(memoryUsed)
      const total = numberOrUndefined(memoryTotal)

      return {
        name: name || 'GPU NVIDIA',
        temperature: numberOrUndefined(temperature),
        utilization: numberOrUndefined(utilization),
        clockMhz: numberOrUndefined(clock),
        powerW: numberOrUndefined(power),
        fanPct: numberOrUndefined(fan),
        vramPct:
          used !== undefined && total !== undefined && total > 0
            ? Math.round(((used / total) * 100) * 10) / 10
            : undefined,
        memoryClockMhz: numberOrUndefined(memoryClock),
        memoryTemperature: numberOrUndefined(memoryTemperature)
      }
    })
}

export function buildNvidiaReadings(samples: NvidiaSample[]): SensorReading[] {
  const readings: SensorReading[] = []

  samples.forEach((sample, index) => {
    const chip = `GPU · ${sample.name}`
    const base = {
      group: 'gpu' as const,
      chip
    }

    if (sample.temperature !== undefined) {
      readings.push({
        ...base,
        id: `nvidia:${index}:temp`,
        kind: 'temperature',
        label: 'Temperatura',
        value: sample.temperature,
        unit: '°C',
        order: 0,
        // NVIDIA cards start to throttle around 90 °C.
        critical: 90
      })
    }

    if (sample.utilization !== undefined) {
      readings.push({
        ...base,
        id: `nvidia:${index}:load`,
        kind: 'load',
        label: 'Uso da GPU',
        value: sample.utilization,
        unit: '%',
        order: 0
      })
    }

    if (sample.clockMhz !== undefined) {
      readings.push({
        ...base,
        id: `nvidia:${index}:clock`,
        kind: 'clock',
        label: 'Clock',
        value: sample.clockMhz,
        unit: 'MHz',
        order: 0
      })
    }

    if (sample.memoryClockMhz !== undefined) {
      readings.push({
        ...base,
        id: `nvidia:${index}:memclock`,
        kind: 'clock',
        label: 'Clock da memória',
        value: sample.memoryClockMhz,
        unit: 'MHz',
        order: 1
      })
    }

    if (sample.memoryTemperature !== undefined) {
      readings.push({
        ...base,
        id: `nvidia:${index}:temp-mem`,
        kind: 'temperature',
        label: 'Temperatura da memória',
        value: sample.memoryTemperature,
        unit: '°C',
        order: 1
      })
    }

    if (sample.powerW !== undefined) {
      readings.push({
        ...base,
        id: `nvidia:${index}:power`,
        kind: 'power',
        label: 'Consumo',
        value: Math.round(sample.powerW * 10) / 10,
        unit: 'W',
        order: 0
      })
    }

    if (sample.vramPct !== undefined) {
      readings.push({
        ...base,
        id: `nvidia:${index}:vram`,
        kind: 'memory',
        label: 'VRAM em uso',
        value: sample.vramPct,
        unit: '%',
        order: 0
      })
    }

    if (sample.fanPct !== undefined) {
      readings.push({
        ...base,
        id: `nvidia:${index}:fan`,
        kind: 'fan',
        label: 'Ventoinha',
        value: sample.fanPct,
        unit: '%',
        order: 0
      })
    }
  })

  return readings
}

let unavailableUntil = 0
/** Flipped off when the driver rejects the extra query fields. */
let optionalFields = true

function fields(withOptional: boolean): string {
  return [...FIELDS_REQUIRED, ...(withOptional ? FIELDS_OPTIONAL : [])].join(',')
}

/**
 * Read the NVIDIA sensors, or an empty list when nvidia-smi is not usable.
 *
 * `available` tells the collector whether a warning is worth showing: a
 * machine with an NVIDIA card but no nvidia-smi is worth explaining, a machine
 * without one is not.
 */
export async function readNvidiaSensors(): Promise<{
  readings: SensorReading[]
  available: boolean
}> {
  if (Date.now() < unavailableUntil) return { readings: [], available: false }

  const query = (withOptional: boolean): Promise<{ stdout: string }> =>
    run('nvidia-smi', [
      `--query-gpu=${fields(withOptional)}`,
      '--format=csv,noheader,nounits'
    ], { timeout: 4000 })

  try {
    let stdout: string
    try {
      stdout = (await query(optionalFields)).stdout
    } catch (error) {
      if (!optionalFields) throw error
      // Old driver: the whole query is refused because of the optional fields.
      // Fall back once and remember it, so only the first poll pays for this.
      optionalFields = false
      stdout = (await query(false)).stdout
    }
    return { readings: buildNvidiaReadings(parseNvidiaSmi(stdout)), available: true }
  } catch {
    unavailableUntil = Date.now() + RETRY_AFTER_MS
    return { readings: [], available: false }
  }
}
