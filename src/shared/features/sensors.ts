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

/**
 * What a fan channel is expected to do. The kernel has no notion of a pump:
 * a water cooler's pump is just another tachometer channel, so the role is
 * only set when the driver itself labels the input as a pump. Guessing from
 * the header order would be an invention, and a wrong guess here means calling
 * a chassis fan "the pump".
 */
export type CoolingRole = 'pump' | 'fan'

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
  /** Set on fan channels when the source names one as a pump. */
  role?: CoolingRole
  /** Session minimum and maximum. */
  min?: number
  max?: number
  /** Last samples, oldest first (at most SENSOR_HISTORY). */
  history?: number[]
}

/** A pump or fan channel, with the session range attached. */
export interface CoolingChannel {
  id: string
  role: CoolingRole
  /** Hardware the channel belongs to, as shown on the sensors page. */
  chip: string
  label: string
  /** RPM, or % for a GPU fan that only reports a duty cycle. */
  value: number
  unit: string
  min?: number
  max?: number
  history?: number[]
  /**
   * Temperature of the hardware this channel cools, when it could be paired.
   * A motherboard header cools the CPU; the GPU fan cools the GPU.
   */
  temperature?: number
}

export type CoolingStatus = 'ok' | 'idle' | 'warning' | 'unknown'

/**
 * The cooling summary.
 *
 * `verdict` is a sentence with the real numbers (or the reason there are
 * none), not a score: the useful question is "is the pump turning while the
 * processor is hot?", and that needs both halves to be shown.
 */
export interface CoolingSnapshot {
  status: CoolingStatus
  verdict: string
  channels: CoolingChannel[]
  /** Channels stopped while the hardware they cool is above the hot limit. */
  alarms: string[]
  /** What could not be read and what to do about it. */
  notes: string[]
}

export interface SensorsSnapshot {
  /** Epoch milliseconds of the collection. */
  at: number
  readings: SensorReading[]
  /** Fan and pump summary, computed from `readings`. */
  cooling?: CoolingSnapshot
  /** What could not be read, with the reason. */
  notes: string[]
}

/** Polling cadence, shared so the page can say "1 s" without repeating it. */
export const SENSOR_INTERVAL_MS = 1000

/** Samples kept per reading. One minute at one sample per second. */
export const SENSOR_HISTORY = 60

/**
 * Below this a pump is not turning. A running pump sits in the hundreds or
 * thousands; 0-100 RPM is a stopped rotor, not a slow one.
 */
export const COOLING_STOPPED_RPM = 100

/** Above this the hardware is hot enough that a stopped fan matters. */
export const COOLING_HOT_C = 80
