/**
 * FPS per game.
 *
 * The page always gets a local estimate first - it only needs the hardware
 * names - and the API is a second call, made only when a key is stored. That
 * keeps the page instant and means a blocked API can never leave the table
 * empty.
 *
 * The hardware comes from the same `getSystem()` the Sistema page uses, so
 * both pages always describe the same machine. Matching follows the original:
 * the longest catalog key contained in the name wins.
 */

import { join } from 'path'
import type {
  ApiKeyState,
  GamesApiResult,
  GamesReport,
  GameOptions,
  FpsRow
} from '@shared/features/games'
import { DEFAULT_GAME_OPTIONS, normalizeGameOptions } from '@shared/features/games'
import type { SystemSnapshot } from '@shared/features/system'
import { getSystem } from '../system/info'
import { GAMES, cpuPerf, gpuPerf, localRow, shortCpuName, shortGpuName } from './catalog'
import { HowManyFpsClient, HowManyFpsError } from './howManyFps'
import { ApiKeyStore } from './secrets'

/** The original fallbacks when a name is not in the table. */
const DEFAULT_GPU_INDEX = 50
const DEFAULT_CPU_INDEX = 80

function pickGpu(system: SystemSnapshot): { name: string; integrated: boolean } | null {
  // `getSystem` already sorts dedicated cards first.
  const gpu = system.gpus[0]
  if (!gpu) return null
  return { name: gpu.name, integrated: gpu.integrated === true }
}

export class GamesService {
  private readonly keys: ApiKeyStore
  private readonly api: HowManyFpsClient

  constructor(userDataPath: string) {
    this.keys = new ApiKeyStore(userDataPath)
    this.api = new HowManyFpsClient(join(userDataPath, 'fps-cache.json'))
  }

  /** Local estimate for all 32 games. Never touches the network. */
  async report(input?: Partial<GameOptions>): Promise<GamesReport> {
    const options = normalizeGameOptions(input ?? DEFAULT_GAME_OPTIONS)
    const system = await getSystem()
    const notes: string[] = []

    const cpuName = system.cpu.brand
    const cpuIndex = cpuPerf(cpuName)
    const gpu = pickGpu(system)
    const gpuName = gpu?.name ?? ''
    const gpuIndex = gpu ? gpuPerf(gpuName) : undefined

    if (cpuIndex === undefined) {
      notes.push(
        `O processador (${cpuName}) não está na tabela de referência; a estimativa usa o ` +
          `índice padrão ${DEFAULT_CPU_INDEX}, o mesmo do Reset Explode.`
      )
    }

    if (!gpu) {
      notes.push(
        `Nenhuma placa de vídeo foi detectada; a estimativa usa o índice padrão ` +
          `${DEFAULT_GPU_INDEX} e serve só como referência.`
      )
    } else if (gpuIndex === undefined) {
      notes.push(
        `A placa de vídeo (${gpuName}) não está na tabela de referência; a estimativa usa o ` +
          `índice padrão ${DEFAULT_GPU_INDEX} e serve só como referência.`
      )
    } else if (gpu.integrated) {
      notes.push(
        'Só foi encontrada uma placa de vídeo integrada; o FPS estimado é baixo e jogos pesados ' +
          'podem não rodar de forma jogável.'
      )
    }

    const effectiveGpu = gpuIndex ?? DEFAULT_GPU_INDEX
    const effectiveCpu = cpuIndex ?? DEFAULT_CPU_INDEX

    const rows: FpsRow[] = GAMES.map((game) => localRow(game, effectiveGpu, effectiveCpu, options))

    return {
      at: Date.now(),
      options,
      cpu: { name: cpuName, short: shortCpuName(cpuName), index: cpuIndex },
      gpu: {
        name: gpu?.name ?? 'Sem placa de vídeo',
        short: gpu ? shortGpuName(gpu.name) : '',
        index: gpuIndex
      },
      rows,
      apiKey: this.keys.read() !== null,
      notes
    }
  }

  /**
   * Measured data for the games the API knows.
   *
   * One game at a time, stopping at the first fatal refusal - a refused key or
   * an exhausted quota will not fix itself on the next name, and the original
   * stops there too. Cached answers are used without a request.
   */
  async fetchApi(input?: Partial<GameOptions>): Promise<GamesApiResult> {
    const options = normalizeGameOptions(input ?? DEFAULT_GAME_OPTIONS)
    const key = this.keys.read()
    if (!key) {
      return { rows: [], ok: 0, failed: [], error: 'Nenhuma chave da API está configurada.' }
    }

    const system = await getSystem()
    const cpu = shortCpuName(system.cpu.brand)
    const gpuName = pickGpu(system)?.name
    if (!gpuName) {
      return {
        rows: [],
        ok: 0,
        failed: [],
        error: 'Nenhuma placa de vídeo foi detectada para consultar a API.'
      }
    }
    const gpu = shortGpuName(gpuName)

    const rows: FpsRow[] = []
    const failed: GamesApiResult['failed'] = []

    for (const game of GAMES) {
      try {
        const result = await this.api.get(key, {
          cpu,
          gpu,
          game: game.name,
          resolution: options.resolution,
          upscaling: options.upscaling
        })

        rows.push({
          game: game.name,
          genre: game.genre,
          avg: Math.round(result.avg),
          low1: result.low1 > 0 ? Math.round(result.low1) : undefined,
          // Measured data does not name a limiter; the game itself is the
          // only one that can be known from the API.
          limiter: 'none',
          source: 'api'
        })
      } catch (error) {
        if (error instanceof HowManyFpsError) {
          if (error.fatal) {
            return { rows, ok: rows.length, failed, error: error.message }
          }
          failed.push({ game: game.name, reason: error.message })
          continue
        }
        failed.push({
          game: game.name,
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return { rows, ok: rows.length, failed }
  }

  keyState(): ApiKeyState {
    return this.keys.state()
  }

  /** Store or erase the key. Returns the new state - never the key. */
  setApiKey(key: string | null): ApiKeyState {
    return this.keys.write(key)
  }
}
