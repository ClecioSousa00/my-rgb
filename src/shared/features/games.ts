/**
 * FPS estimate per game.
 *
 * Two sources, one shape: the local estimate (catalog tables) and the
 * HowManyFPS API (measured sessions). A row always says which one it came
 * from, because a measured number and a formula must never look the same.
 *
 * The options mirror the Reset Explode page: resolution, graphics preset and
 * upscaling. The API only understands resolution and upscaling - the preset
 * changes the local formula alone.
 */

export type FpsLimiter = 'gpu' | 'cpu' | 'engine' | 'none'
export type FpsSource = 'api' | 'local'

export interface FpsRow {
  game: string
  genre: string
  /** Average FPS; absent when nothing could be estimated. */
  avg?: number
  /** 1% low: the slowest percentile, where the stutter lives. */
  low1?: number
  limiter: FpsLimiter
  source: FpsSource
  /** Why the limiter is what it is, or what the API answered. */
  detail?: string
}

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

/** Same defaults as the Reset Explode page. */
export const DEFAULT_GAME_OPTIONS: GameOptions = {
  resolution: '1920x1080',
  preset: 'Alto',
  upscaling: 'Native'
}

/** The hardware the estimate was built for, and how it matched the tables. */
export interface GameHardware {
  name: string
  /** Name in the spelling the API expects: "RTX 5070", "Ryzen 7 7700X". */
  short: string
  /** Relative performance index; absent when the name is not in the table. */
  index?: number
}

export interface GamesReport {
  at: number
  options: GameOptions
  cpu: GameHardware
  gpu: GameHardware
  rows: FpsRow[]
  /** True when a key is stored, so the page can ask for measured data. */
  apiKey: boolean
  notes: string[]
}

/** A game the API did not know, or a request that failed on its own. */
export interface GameApiMiss {
  game: string
  reason: string
}

/** Answer of `games:fps`: only the rows the API knew, plus what went wrong. */
export interface GamesApiResult {
  rows: FpsRow[]
  /** How many games the API answered (cache included). */
  ok: number
  /** Per-game misses (404, timeouts); the page keeps the local estimate. */
  failed: GameApiMiss[]
  /**
   * A refusal that stopped the run (key refused, quota). When set, the loop
   * stopped early and the remaining games keep their local estimate.
   */
  error?: string
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

export interface ApiKeyState {
  configured: boolean
  /** The key is protected by the OS keyring (safeStorage). */
  encrypted: boolean
  /**
   * safeStorage works here. When false the key is stored in clear text and
   * the page has to say so.
   */
  available: boolean
}

/** Rating bands used by FPS calculators: 144+ excelente, 90+ ótimo, 60+ jogável. */
export const FPS_RATING_BANDS = [
  { min: 144, label: 'Excelente' },
  { min: 90, label: 'Ótimo' },
  { min: 60, label: 'Jogável' },
  { min: 30, label: 'Fraco' },
  { min: 0, label: 'Injogável' }
] as const
