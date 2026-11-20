/**
 * Thermal alert evaluation.
 *
 * Pure: it receives the readings of one batch and the previous per-source
 * state, and returns what the engine should do. No timers, no settings file,
 * no hardware — the Sensors page and the tests can call it directly.
 *
 * Only the `cpu` and `gpu` groups count. A hot NVMe or VRM reading is real,
 * but the request is about the processor and the graphics card; the page
 * already flags every reading with its own `critical` limit.
 */

import type { SensorReading } from '@shared/features/sensors'
import type { ThermalAlertConfig, ThermalAlertState } from '@shared/features/thermal'
import { THERMAL_HYSTERESIS_C } from '@shared/features/thermal'

export interface ThermalWatch {
  cpu: boolean
  gpu: boolean
}

export const COLD_WATCH: ThermalWatch = { cpu: false, gpu: false }

/** Hottest temperature of a group, or undefined when that group is absent. */
export function hottestTemperature(
  readings: SensorReading[],
  group: 'cpu' | 'gpu'
): number | undefined {
  let hottest: number | undefined
  for (const reading of readings) {
    if (reading.kind !== 'temperature' || reading.group !== group) continue
    if (!Number.isFinite(reading.value)) continue
    hottest = hottest === undefined ? reading.value : Math.max(hottest, reading.value)
  }
  return hottest
}

/**
 * Decide whether the alert is active for this batch.
 *
 * The first activation uses the configured threshold; once a source is hot it
 * only clears after dropping `THERMAL_HYSTERESIS_C` degrees. Each source is
 * tracked on its own, so a processor that cooled down cannot keep a graphics
 * card alert alive just because the alert was already on.
 *
 * Returns `undefined` when the feature is disabled: absent on the snapshot,
 * which is what tells the engine to render the profile effect again.
 */
export function evaluateThermal(
  readings: SensorReading[],
  config: ThermalAlertConfig,
  previous: ThermalWatch = COLD_WATCH
): ThermalAlertState | undefined {
  if (!config.enabled) return undefined

  const cpuC = hottestTemperature(readings, 'cpu')
  const gpuC = hottestTemperature(readings, 'gpu')
  const release = config.thresholdC - THERMAL_HYSTERESIS_C

  const cpuHot = cpuC !== undefined && cpuC >= (previous.cpu ? release : config.thresholdC)
  const gpuHot = gpuC !== undefined && gpuC >= (previous.gpu ? release : config.thresholdC)

  return {
    thresholdC: config.thresholdC,
    color: config.color,
    ...(cpuC !== undefined ? { cpuC } : {}),
    ...(gpuC !== undefined ? { gpuC } : {}),
    cpuHot,
    gpuHot,
    ...(cpuHot ? { source: 'cpu' as const } : gpuHot ? { source: 'gpu' as const } : {}),
    active: cpuHot || gpuHot
  }
}

/** The per-source history for the next batch. */
export function nextWatch(state: ThermalAlertState | undefined): ThermalWatch {
  return state
    ? { cpu: state.cpuHot, gpu: state.gpuHot }
    : { cpu: false, gpu: false }
}
