/**
 * Live sensor buffer.
 *
 * The page asks for the stream, not for the values: `start` begins the poll and
 * the main process pushes one batch per second. The session minimum, maximum
 * and the sparkline history live here, so closing and reopening the page keeps
 * them and a future overlay can read the same buffer.
 *
 * Polling is reference counted. React's StrictMode mounts effects twice in
 * development, and two pages could subscribe at once; without the count the
 * first cleanup would stop the stream the second mount is still using.
 *
 * The hardware is only touched while the window is visible. A hidden window
 * would otherwise keep reading hwmon and spawning nvidia-smi every second for
 * a page nobody is looking at.
 */

import type { SensorsSnapshot, SensorReading } from '@shared/features/sensors'
import { SENSOR_HISTORY, SENSOR_INTERVAL_MS } from '@shared/features/sensors'
import { collectSensors } from '.'

export interface SensorStats {
  min: number
  max: number
  /** Oldest first, at most `historySize` samples. */
  history: number[]
}

/**
 * Fold a batch into the session stats and return the readings with min, max
 * and history attached.
 *
 * Readings that disappeared are dropped from the map, so unplugging a disk
 * does not leave its old values behind forever.
 */
export function mergeReadings(
  stats: Map<string, SensorStats>,
  readings: SensorReading[],
  historySize = SENSOR_HISTORY
): SensorReading[] {
  const seen = new Set<string>()

  const merged = readings.map((reading) => {
    seen.add(reading.id)
    const entry = stats.get(reading.id) ?? {
      min: reading.value,
      max: reading.value,
      history: []
    }

    entry.min = Math.min(entry.min, reading.value)
    entry.max = Math.max(entry.max, reading.value)
    entry.history.push(reading.value)
    if (historySize > 0 && entry.history.length > historySize) {
      entry.history.splice(0, entry.history.length - historySize)
    }
    stats.set(reading.id, entry)

    return {
      ...reading,
      min: entry.min,
      max: entry.max,
      history: [...entry.history]
    }
  })

  for (const id of [...stats.keys()]) {
    if (!seen.has(id)) stats.delete(id)
  }

  return merged
}

export interface SensorsStoreOptions {
  /** Called once per batch, already carrying the session stats. */
  onBatch: (snapshot: SensorsSnapshot) => void
  /** Injected by the tests; the collector is the default. */
  collect?: (now: number) => Promise<SensorsSnapshot>
  /** Gate for the poll; the app passes "window is visible". */
  canPoll?: () => boolean
  intervalMs?: number
  historySize?: number
  onError?: (message: string) => void
}

export class SensorsStore {
  private timer: NodeJS.Timeout | null = null
  private subscribers = 0
  private busy = false
  private readonly stats = new Map<string, SensorStats>()
  private last: SensorsSnapshot | null = null

  constructor(private readonly options: SensorsStoreOptions) {}

  /** Whether the interval is running, for shutdown checks and tests. */
  get running(): boolean {
    return this.timer !== null
  }

  private get intervalMs(): number {
    return this.options.intervalMs ?? SENSOR_INTERVAL_MS
  }

  private get historySize(): number {
    return this.options.historySize ?? SENSOR_HISTORY
  }

  /** Add a subscriber and make sure the poll is running. */
  start(): void {
    this.subscribers++
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), this.intervalMs)
    void this.poll()
  }

  /** Remove a subscriber; the poll stops when the last one leaves. */
  stop(): void {
    this.subscribers = Math.max(0, this.subscribers - 1)
    if (this.subscribers > 0) return
    this.clearTimer()
  }

  /** Stop regardless of subscribers, for shutdown. */
  dispose(): void {
    this.subscribers = 0
    this.clearTimer()
  }

  /**
   * Last batch with stats attached, or null before the first collection.
   * The page calls this on open so it does not start on an empty table.
   */
  snapshot(): SensorsSnapshot | null {
    return this.last
  }

  /**
   * Collect once. Public so tests can drive the store without timers, and so
   * a manual refresh has the same path as the scheduled poll.
   */
  async poll(): Promise<SensorsSnapshot | null> {
    if (this.busy) return this.last
    if (this.options.canPoll && !this.options.canPoll()) return this.last

    this.busy = true
    try {
      const collect = this.options.collect ?? collectSensors
      const snapshot = await collect(Date.now())
      const merged: SensorsSnapshot = {
        ...snapshot,
        readings: mergeReadings(this.stats, snapshot.readings, this.historySize)
      }
      this.last = merged
      this.options.onBatch(merged)
      return merged
    } catch (err) {
      // The collectors turn per-source failures into notes; an exception here
      // means something unexpected. Keep the last good batch so the page does
      // not blank out, and report it once.
      this.options.onError?.(err instanceof Error ? err.message : String(err))
      return this.last
    } finally {
      this.busy = false
    }
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }
}
