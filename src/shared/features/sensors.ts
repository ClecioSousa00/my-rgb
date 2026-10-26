/**
 * Live sensors.
 *
 * A reading is one number from one place: the CPU package temperature, the
 * third core's clock, the NVMe composite temperature. The collector labels it
 * with the hardware (`chip`) and the kind, so the page can group by hardware
 * and filter by kind without knowing where the number came from.
 *
 * The session minimum, maximum and the history live in the main process, not
 * in the page: closing and reopening the page keeps them, and a future overlay
 * can reuse the same buffer without a second collector.
 */

export type SensorKind =
  | 'temperature'
  | 'load'
  | 'clock'
  | 'power'
  | 'voltage'
  | 'fan'
  | 'memory'

/** Where the reading comes from, for grouping order. */
export type SensorGroup = 'cpu' | 'gpu' | 'board' | 'ram' | 'storage' | 'network' | 'other'

export interface SensorReading {
  /** Stable while the app runs: kind + hardware + input. */
  id: string
  kind: SensorKind
  group: SensorGroup
  /** Hardware name shown as the group title. */
  chip: string
  /** What this reading measures, e.g. "Núcleo 3" or "Tctl". */
  label: string
  value: number
  unit: string
  /** Position inside the kind, so "Núcleo 2" comes before "Núcleo 10". */
  order: number
  /** Value from which the reading deserves attention (temperature only). */
  critical?: number
  /** Session minimum and maximum. */
  min?: number
  max?: number
  /** Last samples, oldest first (at most SENSOR_HISTORY). */
  history?: number[]
}

export interface SensorsSnapshot {
  /** Epoch milliseconds of the collection. */
  at: number
  readings: SensorReading[]
  /** What could not be read, with the reason. */
  notes: string[]
}

/** Polling cadence, shared so the page can say "1 s" without repeating it. */
export const SENSOR_INTERVAL_MS = 1000

/** Samples kept per reading. One minute at one sample per second. */
export const SENSOR_HISTORY = 60
