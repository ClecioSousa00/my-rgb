/**
 * The games catalog and the local FPS formula.
 *
 * Ported from the Reset Explode `GameCatalog`, numbers included: the reference
 * values were compiled from public benchmarks and are only used when the
 * HowManyFPS key is absent (or the API misses a game). The formula and the
 * table matching are the original ones, because the point of this phase is to
 * show the same number the Windows app shows.
 *
 * - `GpuRef`  - average FPS at 1080p/High on an RTX 4070 (index 100)
 * - `CpuCap`  - CPU-side ceiling on a Ryzen 7 7700X (index 100)
 * - `EngineCap` - the game's own frame cap (0 = none)
 *
 * A name matches by the **longest key contained in it** ("RTX 5070 Ti" before
 * "RTX 5070"), which is what makes "NVIDIA GeForce RTX 5070 Ti" land on the
 * Ti row instead of the plain one.
 *
 * Derived in part from the Reset Explode
 * (https://github.com/GustavoReset/ResetExplode), MIT © 2026 Gustavo.

 */

import type {
  FpsLimiter,
  FpsRow,
  GameOptions,
  GamePreset,
  GameResolution,
  GameUpscaling
} from '@shared/features/games'
import { DEFAULT_GAME_OPTIONS } from '@shared/features/games'

export interface GameInfo {
  name: string
  genre: string
  gpuRef: number
  cpuCap: number
  /** Frame cap of the game itself; 0 when it has none. */
  engineCap: number
}

export interface FpsEstimate {
  avg: number
  low1: number
  limiter: FpsLimiter
}

/**
 * The game name is sent to the API as it is, so it follows HowManyFPS's
 * spelling. Genres are the original Portuguese labels.
 */
export const GAMES: GameInfo[] = [
  { name: 'Counter-Strike 2', genre: 'FPS competitivo', gpuRef: 340, cpuCap: 420, engineCap: 0 },
  { name: 'Valorant', genre: 'FPS competitivo', gpuRef: 600, cpuCap: 650, engineCap: 0 },
  { name: 'Fortnite', genre: 'Battle royale', gpuRef: 160, cpuCap: 250, engineCap: 0 },
  { name: 'League of Legends', genre: 'MOBA', gpuRef: 420, cpuCap: 480, engineCap: 0 },
  { name: 'Dota 2', genre: 'MOBA', gpuRef: 260, cpuCap: 280, engineCap: 0 },
  { name: 'Apex Legends', genre: 'Battle royale', gpuRef: 220, cpuCap: 300, engineCap: 0 },
  { name: 'PUBG: Battlegrounds', genre: 'Battle royale', gpuRef: 180, cpuCap: 220, engineCap: 0 },
  { name: 'Call of Duty: Black Ops 6', genre: 'FPS', gpuRef: 140, cpuCap: 220, engineCap: 0 },
  { name: 'Call of Duty: Warzone', genre: 'Battle royale', gpuRef: 130, cpuCap: 200, engineCap: 0 },
  { name: 'Battlefield 6', genre: 'FPS', gpuRef: 120, cpuCap: 170, engineCap: 0 },
  { name: 'Rainbow Six Siege', genre: 'FPS tático', gpuRef: 350, cpuCap: 430, engineCap: 0 },
  { name: 'Overwatch 2', genre: 'FPS heroico', gpuRef: 280, cpuCap: 380, engineCap: 0 },
  { name: 'Marvel Rivals', genre: 'FPS heroico', gpuRef: 110, cpuCap: 160, engineCap: 0 },
  { name: 'Rocket League', genre: 'Esporte', gpuRef: 400, cpuCap: 450, engineCap: 0 },
  { name: 'EA Sports FC 25', genre: 'Esporte', gpuRef: 220, cpuCap: 260, engineCap: 0 },
  { name: 'Minecraft', genre: 'Sandbox', gpuRef: 300, cpuCap: 340, engineCap: 0 },
  { name: 'GTA V', genre: 'Mundo aberto', gpuRef: 160, cpuCap: 190, engineCap: 0 },
  { name: 'Red Dead Redemption 2', genre: 'Mundo aberto', gpuRef: 95, cpuCap: 160, engineCap: 0 },
  { name: 'Cyberpunk 2077', genre: 'RPG mundo aberto', gpuRef: 95, cpuCap: 150, engineCap: 0 },
  { name: 'The Witcher 3: Wild Hunt', genre: 'RPG', gpuRef: 120, cpuCap: 160, engineCap: 0 },
  { name: 'Elden Ring', genre: 'RPG de ação', gpuRef: 110, cpuCap: 140, engineCap: 60 },
  { name: "Baldur's Gate 3", genre: 'RPG', gpuRef: 110, cpuCap: 120, engineCap: 0 },
  { name: 'Hogwarts Legacy', genre: 'RPG de ação', gpuRef: 90, cpuCap: 120, engineCap: 0 },
  { name: 'Starfield', genre: 'RPG espacial', gpuRef: 65, cpuCap: 90, engineCap: 0 },
  { name: 'Black Myth: Wukong', genre: 'Ação', gpuRef: 70, cpuCap: 140, engineCap: 0 },
  { name: 'Alan Wake 2', genre: 'Terror / ação', gpuRef: 60, cpuCap: 140, engineCap: 0 },
  { name: 'God of War Ragnarök', genre: 'Ação', gpuRef: 110, cpuCap: 170, engineCap: 0 },
  { name: 'Forza Horizon 5', genre: 'Corrida', gpuRef: 140, cpuCap: 200, engineCap: 0 },
  { name: 'Helldivers 2', genre: 'Cooperativo', gpuRef: 90, cpuCap: 110, engineCap: 0 },
  { name: 'Monster Hunter Wilds', genre: 'Ação', gpuRef: 60, cpuCap: 85, engineCap: 0 },
  { name: "Assassin's Creed Shadows", genre: 'Ação mundo aberto', gpuRef: 65, cpuCap: 110, engineCap: 0 },
  { name: 'Borderlands 4', genre: 'Looter shooter', gpuRef: 55, cpuCap: 110, engineCap: 0 }
]

/** Relative gaming performance (raster), RTX 4070 = 100. Approximate. */
const GPU_INDEX: ReadonlyArray<readonly [string, number]> = [
  ['RTX 5090', 265], ['RTX 5080', 175], ['RTX 5070 Ti', 150], ['RTX 5070', 118],
  ['RTX 5060 Ti', 95], ['RTX 5060', 85],
  ['RTX 4090', 210], ['RTX 4080 SUPER', 160], ['RTX 4080', 157], ['RTX 4070 Ti SUPER', 136],
  ['RTX 4070 Ti', 124], ['RTX 4070 SUPER', 116], ['RTX 4070', 100], ['RTX 4060 Ti', 82],
  ['RTX 4060', 70],
  ['RTX 3090 Ti', 135], ['RTX 3090', 125], ['RTX 3080 Ti', 122], ['RTX 3080', 112],
  ['RTX 3070 Ti', 92], ['RTX 3070', 86],
  ['RTX 3060 Ti', 78], ['RTX 3060', 60], ['RTX 3050', 40], ['GTX 1660', 38], ['GTX 1650', 28],
  ['RX 9070 XT', 160], ['RX 9070', 140], ['RX 7900 XTX', 170], ['RX 7900 XT', 150],
  ['RX 7900 GRE', 128],
  ['RX 7800 XT', 115], ['RX 7700 XT', 98], ['RX 7600 XT', 72], ['RX 7600', 70],
  ['RX 6950 XT', 125], ['RX 6800 XT', 112], ['RX 6700 XT', 82], ['RX 6600', 58],
  ['Arc B580', 80], ['Arc A770', 68],
  ['Radeon(TM) Graphics', 6], ['Radeon Graphics', 6]
]

/** Relative gaming performance limited by the CPU, Ryzen 7 7700X = 100. */
const CPU_INDEX: ReadonlyArray<readonly [string, number]> = [
  ['9950X3D', 138], ['9800X3D', 140], ['7950X3D', 126], ['7800X3D', 128], ['5800X3D', 95],
  ['5700X3D', 90],
  ['9950X', 112], ['9900X', 110], ['9700X', 108], ['9600X', 104], ['7950X', 104],
  ['7900X', 102], ['7700X', 100],
  ['7700', 97], ['7600X', 96], ['7600', 93], ['5950X', 82], ['5900X', 81], ['5800X', 80],
  ['5700X', 77], ['5600X', 76], ['5600', 73],
  ['285K', 112], ['265K', 108], ['245K', 100], ['14900K', 116], ['14700K', 112],
  ['14600K', 104], ['13900K', 113],
  ['13700K', 108], ['13600K', 101], ['13400', 84], ['12900K', 98], ['12700K', 95],
  ['12600K', 90], ['12400', 78]
]

/**
 * The longest key contained in the name wins ("RTX 5070 Ti" before "RTX
 * 5070"). Ties keep the table order, like the original.
 */
function lookup(table: ReadonlyArray<readonly [string, number]>, name: string): number | undefined {
  const haystack = name.toLowerCase()
  let bestKey = ''
  let bestIndex: number | undefined

  for (const [key, index] of table) {
    if (key.length <= bestKey.length) continue
    if (!haystack.includes(key.toLowerCase())) continue
    bestKey = key
    bestIndex = index
  }

  return bestIndex
}

export function gpuPerf(gpuName: string): number | undefined {
  return lookup(GPU_INDEX, gpuName) ?? lookup(GPU_INDEX, shortGpuName(gpuName))
}

export function cpuPerf(cpuName: string): number | undefined {
  return lookup(CPU_INDEX, cpuName)
}

/** Fractions applied by the local formula, kept in one place for the tests. */
export function resolutionFactor(resolution: GameResolution): number {
  if (resolution === '2560x1440') return 0.72
  if (resolution === '3840x2160') return 0.42
  return 1
}

export function presetFactor(preset: GamePreset): number {
  if (preset === 'Baixo') return 1.6
  if (preset === 'Médio') return 1.3
  if (preset === 'Ultra') return 0.82
  return 1
}

/**
 * Upscaling (DLSS/FSR) only relieves the GPU, and the gain grows with the
 * resolution - at 1080p there is less to save.
 */
export function upscalingFactor(upscaling: GameUpscaling, resolution: GameResolution): number {
  if (upscaling === 'Quality') return resolution === '1920x1080' ? 1.25 : 1.4
  if (upscaling === 'Performance') return resolution === '1920x1080' ? 1.45 : 1.75
  return 1
}

/**
 * FPS = the lowest of the GPU ceiling, the CPU ceiling and the game's cap.
 *
 * The 1% low is a flat 75% of the average, the same rule as the original - it
 * is a rough shape of the frametime curve, not a measurement.
 */
export function estimate(
  game: GameInfo,
  gpuIndex: number,
  cpuIndex: number,
  options: GameOptions = DEFAULT_GAME_OPTIONS
): FpsEstimate {
  const gpuFps =
    ((game.gpuRef * gpuIndex) / 100) *
    resolutionFactor(options.resolution) *
    presetFactor(options.preset) *
    upscalingFactor(options.upscaling, options.resolution)

  const presetOnCpu = options.preset === 'Baixo' ? 1.1 : options.preset === 'Ultra' ? 0.95 : 1
  const cpuFps = ((game.cpuCap * cpuIndex) / 100) * presetOnCpu

  let fps = Math.min(gpuFps, cpuFps)
  let limiter: FpsLimiter = gpuFps <= cpuFps ? 'gpu' : 'cpu'

  if (game.engineCap > 0 && game.engineCap < fps) {
    fps = game.engineCap
    limiter = 'engine'
  }

  return { avg: Math.round(fps), low1: Math.round(fps * 0.75), limiter }
}

/** One local row, with the limiter spelled out for the table. */
export function localRow(
  game: GameInfo,
  gpuIndex: number,
  cpuIndex: number,
  options: GameOptions = DEFAULT_GAME_OPTIONS
): FpsRow {
  const result = estimate(game, gpuIndex, cpuIndex, options)
  const detail =
    result.limiter === 'engine'
      ? `trava do jogo em ${game.engineCap} FPS`
      : result.limiter === 'gpu'
        ? 'gargalo: GPU'
        : 'gargalo: CPU'

  return {
    game: game.name,
    genre: game.genre,
    avg: result.avg,
    low1: result.low1,
    limiter: result.limiter,
    source: 'local',
    detail
  }
}

/**
 * Names in the spelling the API expects: "RTX 5070", "Ryzen 7 7700X".
 *
 * The vendor words are dropped, AMD's "Radeon" survives only when it is the
 * whole name (an iGPU is literally "Radeon Graphics").
 */
export function shortGpuName(name: string): string {
  let text = name.replace(/\(TM\)/gi, '').replace(/\(R\)/gi, '')
  for (const word of ['NVIDIA', 'GeForce', 'AMD', 'Intel']) {
    text = text.replace(new RegExp(word, 'gi'), '')
  }
  if (text.includes('Radeon RX')) text = text.replace(/Radeon/gi, '')
  text = text.split(/\s+/).filter(Boolean).join(' ')
  if (text.startsWith('Arc') && text.endsWith(' Graphics')) text = text.slice(0, -9)
  return text
}

/**
 * "AMD Ryzen 7 7700X 8-Core Processor" -> "Ryzen 7 7700X";
 * "13th Gen Intel(R) Core(TM) i7-13700K" -> "Core i7-13700K".
 */
export function shortCpuName(name: string): string {
  let text = name
    .replace(/AMD/gi, '')
    .replace(/Intel\(R\)/gi, '')
    .replace(/\(R\)/gi, '')
    .replace(/\(TM\)/gi, '')
    .replace(/Core\(TM\)/gi, 'Core')

  const core = text.toLowerCase().indexOf('-core')
  if (core > 0) text = text.slice(0, text.lastIndexOf(' ', core))

  text = text.replace(/Processor/gi, '').replace(/CPU/gi, '')
  text = text.replace(/\d+th Gen\s*/gi, '')
  const at = text.indexOf('@')
  if (at > 0) text = text.slice(0, at)

  return text.split(/\s+/).filter(Boolean).join(' ')
}
