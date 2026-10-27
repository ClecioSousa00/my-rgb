/**
 * Builds one overlay frame from the last sensor batch and the FPS sample.
 *
 * This is where the numbers become text, so the overlay bundle stays a dumb
 * renderer and the formatting can be tested with fixtures. A missing reading
 * is "—", never 0: a GPU without nvidia-smi must not look like it is idle at
 * 0 % and 0 °C.
 */

import type { SensorReading, SensorsSnapshot } from '@shared/features/sensors'
import type {
  OverlayConfig,
  OverlayFrame,
  OverlayFps,
  OverlayGroup,
  OverlayItem,
  OverlayItemKey
} from '@shared/features/overlay'
import { OVERLAY_METRICS } from '@shared/features/overlay'

export interface OverlayFrameInput {
  at: number
  snapshot: SensorsSnapshot | null
  fps: OverlayFps | null
  config: OverlayConfig
  /** From the system snapshot; used for "Usada (GB)" in RAM. */
  ramTotalBytes?: number
  /** From the system snapshot; used for "Usada (GB)" in VRAM. */
  vramTotalBytes?: number
  /** Injected by the tests. */
  now?: Date
}

const DASH = '—'

function find(
  readings: SensorReading[],
  predicate: (reading: SensorReading) => boolean
): SensorReading | undefined {
  return readings.find(predicate)
}

function percent(value: number | undefined): string {
  return value === undefined ? DASH : `${Math.round(value)} %`
}

function celsius(value: number | undefined): string {
  return value === undefined ? DASH : `${Math.round(value)} °C`
}

function gigahertz(value: number | undefined): string {
  return value === undefined ? DASH : `${(value / 1000).toFixed(2)} GHz`
}

function megahertz(value: number | undefined): string {
  return value === undefined ? DASH : `${Math.round(value)} MHz`
}

function gigabytes(value: number | undefined): string {
  return value === undefined ? DASH : `${value.toFixed(1)} GB`
}

function watts(value: number | undefined): string {
  return value === undefined ? DASH : `${Math.round(value)} W`
}

/** A fan reading can be a percentage (NVIDIA) or RPM (AMD via hwmon). */
function fan(reading: SensorReading | undefined): string {
  if (!reading) return DASH
  return `${Math.round(reading.value)} ${reading.unit}`
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((total, value) => total + value, 0) / values.length
}

function clockText(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function buildOverlayFrame(input: OverlayFrameInput): OverlayFrame {
  const readings = input.snapshot?.readings ?? []
  const { fps } = input

  const gpuLoad = find(readings, (r) => r.group === 'gpu' && r.kind === 'load')?.value
  const gpuTemps = readings.filter((r) => r.group === 'gpu' && r.kind === 'temperature')
  const gpuTemp = (gpuTemps.find((r) => r.label === 'Temperatura') ?? gpuTemps[0])?.value
  const gpuHotspot = gpuTemps.find((r) => /hotspot|junction/i.test(r.label))?.value
  const gpuClocks = readings.filter((r) => r.group === 'gpu' && r.kind === 'clock')
  const gpuClock = gpuClocks.find((r) => !/mem/i.test(r.label))?.value
  const gpuMemClock = gpuClocks.find((r) => /mem/i.test(r.label))?.value
  const gpuPower = find(readings, (r) => r.group === 'gpu' && r.kind === 'power')?.value
  const gpuVolt = find(readings, (r) => r.group === 'gpu' && r.kind === 'voltage')?.value
  const gpuFan = find(readings, (r) => r.group === 'gpu' && r.kind === 'fan')

  const vramPct = find(
    readings,
    (r) => r.group === 'gpu' && r.kind === 'memory' && /vram/i.test(r.label)
  )?.value
  const vramUsed =
    vramPct !== undefined && input.vramTotalBytes !== undefined && input.vramTotalBytes > 0
      ? (vramPct / 100) * (input.vramTotalBytes / 1024 ** 3)
      : undefined
  const vramTemp = gpuTemps.find((r) => /mem/i.test(r.label))?.value

  const cpuTotal = find(readings, (r) => r.id === 'cpu:load:total')?.value
  const cpuCores = readings.filter(
    (r) =>
      r.group === 'cpu' && r.kind === 'load' && r.id.startsWith('cpu:load:') && r.id !== 'cpu:load:total'
  )
  const cpuMaxCore =
    cpuCores.length > 0 ? Math.max(...cpuCores.map((reading) => reading.value)) : undefined
  const cpuTemp = Math.max(
    ...readings.filter((r) => r.group === 'cpu' && r.kind === 'temperature').map((r) => r.value),
    Number.NEGATIVE_INFINITY
  )
  const cpuClocks = readings
    .filter((r) => r.group === 'cpu' && r.kind === 'clock')
    .map((r) => r.value)
  const cpuPower =
    find(readings, (r) => r.group === 'cpu' && r.kind === 'power' && /package|ppt/i.test(r.label))
      ?.value ?? find(readings, (r) => r.group === 'cpu' && r.kind === 'power')?.value

  const ramPct = find(
    readings,
    (r) => r.id === 'mem:used' || (r.group === 'ram' && r.label === 'RAM em uso')
  )?.value
  const ramUsed =
    ramPct !== undefined && input.ramTotalBytes !== undefined && input.ramTotalBytes > 0
      ? (ramPct / 100) * (input.ramTotalBytes / 1024 ** 3)
      : undefined

  const texts: Record<OverlayItemKey, string> = {
    fps: fps ? `${Math.round(fps.fps)}` : DASH,
    frametime: fps ? `${fps.frameTimeMs.toFixed(1)} ms` : DASH,
    low1: fps ? `${Math.round(fps.low1Fps)}` : DASH,
    graph: '',
    gpu_load: percent(gpuLoad),
    gpu_temp: celsius(gpuTemp),
    gpu_hotspot: celsius(gpuHotspot),
    gpu_clock: megahertz(gpuClock),
    gpu_memclock: megahertz(gpuMemClock),
    gpu_power: watts(gpuPower),
    // nvidia-smi exposes neither the core voltage nor the NVML throttle bits;
    // the page explains what would provide them.
    gpu_volt: gpuVolt === undefined ? DASH : `${gpuVolt.toFixed(3)} V`,
    gpu_fan: fan(gpuFan),
    gpu_perfcap: DASH,
    vram_used: gigabytes(vramUsed),
    vram_pct: percent(vramPct),
    vram_temp: celsius(vramTemp),
    cpu_load: percent(cpuTotal),
    cpu_maxcore: percent(cpuMaxCore),
    cpu_temp: celsius(Number.isFinite(cpuTemp) ? cpuTemp : undefined),
    cpu_clock: gigahertz(average(cpuClocks)),
    cpu_clockmax: gigahertz(cpuClocks.length > 0 ? Math.max(...cpuClocks) : undefined),
    cpu_power: watts(cpuPower),
    ram_used: gigabytes(ramUsed),
    ram_pct: percent(ramPct),
    game: fps?.game ?? DASH,
    clock: clockText(input.now ?? new Date())
  }

  const selected = new Set<OverlayItemKey>(input.config.items)
  const items: OverlayItem[] = OVERLAY_METRICS.filter((metric) => selected.has(metric.key)).map(
    (metric) => ({
      key: metric.key,
      group: metric.group as OverlayGroup,
      text: texts[metric.key]
    })
  )

  return {
    at: input.at,
    config: input.config,
    fps,
    items,
    clock: clockText(input.now ?? new Date())
  }
}
