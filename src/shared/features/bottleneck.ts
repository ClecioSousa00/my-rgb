/**
 * Bottleneck: the theoretical GPU × CPU balance, the live limiter and the
 * session report.
 *
 * The limiter is the answer to "what is holding the FPS back right now?", and
 * it is classified in the same order as the Reset Explode: VRAM full, then
 * temperature, then the GPU, then the CPU, then RAM, and finally "capped"
 * (frame limit, V-Sync or a menu). The order matters more than the thresholds:
 * a full VRAM causes stutter even when the GPU is at 99 %, and a thermal cap
 * explains the low clock even when the load looks normal.
 *
 * A reading that could not be collected is absent, never zero - the rules that
 * depend on it are simply skipped, and the page says what is missing.
 */

export type BottleneckLimiter = 'gpu' | 'cpu' | 'vram' | 'ram' | 'thermal' | 'capped'

/** Short labels for chips and axis ticks; the full sentence comes from the main. */
export const BOTTLENECK_LIMITERS: BottleneckLimiter[] = [
  'gpu',
  'cpu',
  'vram',
  'ram',
  'thermal',
  'capped'
]

export const BOTTLENECK_LIMITER_LABEL: Record<BottleneckLimiter, string> = {
  gpu: 'GPU',
  cpu: 'CPU',
  vram: 'VRAM',
  ram: 'RAM',
  thermal: 'Temperatura',
  capped: 'Travado'
}

/** Session durations offered by the page, exactly like the original. */
export const BOTTLENECK_SESSION_MINUTES = [1, 3, 5] as const
export type BottleneckSessionMinutes = (typeof BOTTLENECK_SESSION_MINUTES)[number]

/** Keep a session length coming from the renderer inside the known options. */
export function normalizeSessionMinutes(input?: number): BottleneckSessionMinutes {
  return BOTTLENECK_SESSION_MINUTES.find((minutes) => minutes === input) ?? 1
}

/**
 * One reading (one per second) of everything that can limit the FPS.
 *
 * `gpuThermalCap` is the "hardware is throttling" flag. The Reset Explode
 * reads the NVML throttle bits; here it is approximated by the GPU reaching
 * 90 °C, because neither nvidia-smi's CSV nor hwmon expose those bits. The
 * classification itself keeps the flag as an input, so the rules are the
 * original ones.
 */
export interface LoadSample {
  gpuLoad?: number
  cpuTotal?: number
  cpuMaxCore?: number
  /** Label of the busiest core, e.g. "Núcleo 3". */
  busiestCore?: string
  vramPct?: number
  ramPct?: number
  gpuTemp?: number
  cpuTemp?: number
  gpuThermalCap?: boolean
  /** Real FPS from the game overlay. Absent until phase 7. */
  fps?: number
}

/** One side of the theoretical balance. */
export interface BottleneckHardware {
  name: string
  /** Name in the spelling used by the tables: "RTX 5070", "Ryzen 7 7700X". */
  short: string
  /** Relative performance index (RTX 4070 / Ryzen 7 7700X = 100). */
  index: number
  /** True when the index is the Reset default (50 for GPU, 80 for CPU). */
  fallback: boolean
}

export interface BottleneckBalance {
  /** GPU index ÷ CPU index. */
  ratio: number
  /** The same five sentences as `BottleneckAnalyzer.Balance`. */
  text: string
  gpu: BottleneckHardware
  cpu: BottleneckHardware
  notes: string[]
}

/** The live block: the current limiter and the numbers behind it. */
export interface BottleneckLive {
  at: number
  limiter: BottleneckLimiter
  title: string
  advice: string
  sample: LoadSample
  /** What the sensors could not read, and how that narrows the verdict. */
  notes: string[]
}

export interface BottleneckSessionProgress {
  startedAt: number
  endsAt: number
  durationMinutes: BottleneckSessionMinutes
  samples: number
  /** Limiter with the most samples so far, absent before the first sample. */
  leading?: BottleneckLimiter
}

export interface BottleneckDistributionEntry {
  limiter: BottleneckLimiter
  title: string
  /** Share of the session, 0–100. */
  percent: number
  samples: number
}

export interface BottleneckSessionReport {
  startedAt: number
  finishedAt: number
  durationMinutes: BottleneckSessionMinutes
  samples: number
  /** Most frequent limiter; absent when no sample was collected. */
  main?: BottleneckLimiter
  title: string
  advice: string
  distribution: BottleneckDistributionEntry[]
  avgGpuLoad?: number
  avgCpuLoad?: number
  avgCpuMaxCore?: number
  maxVramPct?: number
  maxRamPct?: number
  maxGpuTemp?: number
  maxCpuTemp?: number
  /** Real FPS from the overlay. Absent until phase 7. */
  avgFps?: number
}

/** Push sent once per sensor batch, plus once when a session finishes. */
export interface BottleneckUpdate {
  live?: BottleneckLive
  session: BottleneckSessionProgress | null
  /** Present only in the push that closed a session. */
  report?: BottleneckSessionReport
}

export interface BottleneckSnapshot {
  balance: BottleneckBalance
  live: BottleneckLive | null
  session: BottleneckSessionProgress | null
  /** Last finished session, kept in the main process memory. */
  report: BottleneckSessionReport | null
}
