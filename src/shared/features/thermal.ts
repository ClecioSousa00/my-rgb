/**
 * Thermal alert.
 *
 * A safety override for the lighting: when the processor or the graphics card
 * reaches a temperature the user considers too high, every enabled zone is
 * painted in one chosen colour instead of the running effect. It is not a
 * diagnosis — the Sensores page already shows the real numbers — it is a
 * visible warning that does not depend on the window being open.
 *
 * The configuration lives in the application settings, not in the profile:
 * the limit is a property of the machine, not of the effect being edited.
 */

import { normalizeHexColor } from '../color'

export interface ThermalAlertConfig {
  /** Whether the override is armed. */
  enabled: boolean
  /** Temperature, in °C, from which the LEDs change colour. */
  thresholdC: number
  /** Colour used while a monitored temperature is at or above the threshold. */
  color: string
}

/** Limits the page and the normaliser agree on. */
export const THERMAL_THRESHOLD_MIN = 50
export const THERMAL_THRESHOLD_MAX = 100

/**
 * Degrees below the threshold before the alert clears.
 *
 * Without it the colour would flicker at the limit: one second at 85 °C, the
 * next at 84.9 °C. A sensor that hovers around the limit is exactly the case
 * the alert exists for.
 */
export const THERMAL_HYSTERESIS_C = 3

export const DEFAULT_THERMAL_ALERT: ThermalAlertConfig = {
  enabled: false,
  thresholdC: 85,
  color: '#ff2d2d'
}

/**
 * What the main process decided for one sensor batch.
 *
 * `cpuC` and `gpuC` are the hottest temperature of each group as read; a
 * missing sensor stays `undefined` and never triggers the alert. The two
 * `*Hot` flags are kept apart because each source has its own hysteresis, and
 * so the page can say which half crossed the line.
 */
export interface ThermalAlertState {
  thresholdC: number
  color: string
  cpuC?: number
  gpuC?: number
  cpuHot: boolean
  gpuHot: boolean
  /** Which hardware triggered the override, when one did. */
  source?: 'cpu' | 'gpu'
  /** Whether the LEDs are currently painted in `color`. */
  active: boolean
}

/**
 * Keep a config coming from disk or from the renderer usable.
 *
 * A hand-edited settings file can carry an out-of-range threshold or an
 * invalid colour; the renderer's colour input can only produce a valid one,
 * but a partial patch from an older version must not reach the engine.
 */
export function normalizeThermalAlert(
  input?: Partial<ThermalAlertConfig> | null,
  fallback: ThermalAlertConfig = DEFAULT_THERMAL_ALERT
): ThermalAlertConfig {
  const source = input ?? {}

  const enabled = typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled

  const raw =
    typeof source.thresholdC === 'number' && Number.isFinite(source.thresholdC)
      ? source.thresholdC
      : fallback.thresholdC
  const thresholdC = Math.round(
    Math.min(THERMAL_THRESHOLD_MAX, Math.max(THERMAL_THRESHOLD_MIN, raw))
  )

  const color =
    typeof source.color === 'string'
      ? (normalizeHexColor(source.color) ?? fallback.color)
      : fallback.color

  return { enabled, thresholdC, color }
}
