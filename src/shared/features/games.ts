/**
 * FPS expectations per game.
 *
 * The page answers one question - "what should this machine do in this game,
 * at this resolution and these settings?" - from two public bases, shipped
 * with the app:
 *
 * - PCGameBenchmarks (estimates, CC BY 4.0): 1080p/High on twelve reference
 *   GPUs for ~17k games, plus a G3D score for 1,381 GPUs.
 * - Open GPU Benchmarks (measured, CC BY 4.0): real runs with average FPS and
 *   1% low, and the CPU/resolution/preset/upscaler each one used.
 *
 * A measured number and a formula must never look the same, so every result
 * carries its source and a confidence level. There is no default hardware
 * index: an unrecognised GPU produces "sem dados", never a made-up number.
 */

export type FpsSource = 'measured' | 'estimated' | 'none'
export type Confidence = 'high' | 'medium' | 'low' | 'unknown'

export const GAME_RESOLUTIONS = [
  { id: '1920x1080', label: '1080p' },
  { id: '2560x1440', label: '1440p' },
  { id: '3840x2160', label: '4K' }
] as const

export const GAME_PRESETS = ['Baixo', 'Médio', 'Alto', 'Ultra'] as const

export const GAME_UPSCALING = [
  { id: 'Native', label: 'Nativo' },
  { id: 'Quality', label: 'Qualidade' },
  { id: 'Performance', label: 'Desempenho' }
] as const

export type GameResolution = (typeof GAME_RESOLUTIONS)[number]['id']
export type GamePreset = (typeof GAME_PRESETS)[number]
export type GameUpscaling = (typeof GAME_UPSCALING)[number]['id']

export interface GameOptions {
  resolution: GameResolution
  preset: GamePreset
  upscaling: GameUpscaling
}

/** 1080p/High is the only configuration the estimates base publishes. */
export const DEFAULT_GAME_OPTIONS: GameOptions = {
  resolution: '1920x1080',
  preset: 'Alto',
  upscaling: 'Native'
}

/** Detected hardware, and how it was placed in the GPU table. */
export interface GameHardware {
  /** Name as the system reported it. */
  detected: string
  /** Name in the GPU table, when it matched. */
  matched?: string
  /** Relative gaming score (G3D) used to place the card on the curve. */
  g3d?: number
  /** True when the user picked the model instead of the detection. */
  manual: boolean
}

/** Why a value exists - shown as a label in the table and the detail card. */
export const FPS_SOURCE_LABEL: Record<FpsSource, string> = {
  measured: 'Benchmark medido',
  estimated: 'Estimativa pública',
  none: 'Dados insuficientes'
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
  unknown: 'Sem dados'
}

/** Rating bands used by FPS calculators: 144+ excelente, 90+ ótimo, 60+ jogável. */
export const FPS_RATING_BANDS = [
  { min: 144, label: 'Excelente' },
  { min: 90, label: 'Ótimo' },
  { min: 60, label: 'Jogável' },
  { min: 30, label: 'Fraco' },
  { min: 0, label: 'Injogável' }
] as const

export interface GameResult {
  game: string
  year?: number
  /** Average FPS, or null when the bases do not support an answer. */
  avg: number | null
  /**
   * 1% low. Only ever filled from a measured run - there is no universal
   * ratio between the average and the 1% low, so an estimate leaves it null.
   */
  low1: number | null
  source: FpsSource
  confidence: Confidence
  /** GPU the value refers to (the detected one, or the manual override). */
  gpu?: string
  /** CPU named by the measured run; absent on estimates. */
  cpu?: string
  /** Ceiling that applies to the value (engine lock or the source's 360 cap). */
  cap?: number
  /** How many measured runs the value averages. */
  sampleCount?: number
  /** Identifier of the source record, for tracing a number back. */
  sourceRef?: string
  /** One sentence on how the value was obtained. */
  explanation: string
  /** Everything the reader has to know before trusting the number. */
  warnings: string[]
}

/** Present in the report so the UI can name and date the bases it is using. */
export interface GameDataSource {
  id: string
  name: string
  url: string
  dataset?: string
  license: string
  licenseUrl?: string
  snapshot?: string
  kind: 'estimated' | 'measured'
}

export interface GamesReport {
  at: number
  options: GameOptions
  gpu: GameHardware
  cpu: GameHardware
  rows: GameResult[]
  /** Games shipped with the app. */
  catalogSize: number
  /** Games that matched the current search (before the row limit). */
  matched: number
  /** True when `rows` is a slice of `matched`. */
  truncated: boolean
  sources: GameDataSource[]
  dataGeneratedAt: string
  /** Notes about the page as a whole (hardware, coverage, limits). */
  notes: string[]
}

/** What the page asks for: the options, a search and an optional GPU. */
export interface GamesQuery extends Partial<GameOptions> {
  /** Empty or absent shows the featured games. */
  search?: string
  /** Manual GPU choice; `null` clears it. */
  gpu?: string | null
  /** Row cap for a search. Ignored for the featured list. */
  limit?: number
}

export interface GpuMatch {
  name: string
  g3d: number
  type: string
}

/** Keep IPC input inside the known options, whatever the renderer sent. */
export function normalizeGameOptions(input?: Partial<GameOptions> | null): GameOptions {
  const resolution = GAME_RESOLUTIONS.find((item) => item.id === input?.resolution)
  const preset = GAME_PRESETS.find((item) => item === input?.preset)
  const upscaling = GAME_UPSCALING.find((item) => item.id === input?.upscaling)

  return {
    resolution: resolution?.id ?? DEFAULT_GAME_OPTIONS.resolution,
    preset: preset ?? DEFAULT_GAME_OPTIONS.preset,
    upscaling: upscaling?.id ?? DEFAULT_GAME_OPTIONS.upscaling
  }
}

/** Label of a configuration, e.g. "1440p · Alto · Nativo". */
export function describeOptions(options: GameOptions): string {
  const resolution = GAME_RESOLUTIONS.find((item) => item.id === options.resolution)?.label
  const upscaling = GAME_UPSCALING.find((item) => item.id === options.upscaling)?.label
  return [resolution, options.preset, upscaling].filter(Boolean).join(' · ')
}
