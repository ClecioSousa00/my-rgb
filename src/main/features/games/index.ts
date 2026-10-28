/**
 * FPS per game.
 *
 * Everything comes from the dataset shipped with the app (`data/catalog.json`,
 * built by `npm run games:data`), so the page works offline and a failed
 * network never empties the table.
 *
 * The service only assembles the answer: which GPU the machine has (or the one
 * the user picked), which games to resolve, and the notes that belong to the
 * page as a whole. The maths lives in `estimate.ts` and the priority order in
 * `query.ts`, both pure and tested without Electron.
 *
 * There is no fallback hardware index: an unknown GPU gets "sem dados" and an
 * invitation to pick the model, because a default score would look like a
 * measurement of this machine.
 */

import type {
  GamesQuery,
  GamesReport,
  GameHardware,
  GameResult,
  GpuMatch
} from '@shared/features/games'
import { normalizeGameOptions } from '@shared/features/games'
import { getSystem } from '../system/info'
import { fold, getDataset, matchGpu, searchGames, searchGpus } from './dataset'
import { buildMeasuredIndex, resolveGame } from './query'

/**
 * The games the page opens with.
 *
 * A full catalogue of 17k rows cannot be rendered, and "sort by FPS" over
 * everything would be meaningless. These 32 are the ones the previous version
 * shipped, kept as the landing list; the search box reaches the whole base.
 */
export const FEATURED_GAMES = [
  'Counter-Strike 2',
  'Valorant',
  'Fortnite',
  'League of Legends',
  'Dota 2',
  'Apex Legends',
  'PUBG: Battlegrounds',
  'Call of Duty: Black Ops 6',
  'Call of Duty: Warzone',
  'Battlefield 6',
  'Rainbow Six Siege',
  'Overwatch',
  'Marvel Rivals',
  'Rocket League',
  'EA Sports FC 25',
  'Minecraft: Java Edition',
  'Grand Theft Auto V',
  'Red Dead Redemption 2',
  'Cyberpunk 2077',
  'The Witcher 3: Wild Hunt',
  'Elden Ring',
  "Baldur's Gate III",
  'Hogwarts Legacy',
  'Starfield',
  'Black Myth: Wukong',
  'Alan Wake II',
  'God of War Ragnarök',
  'Forza Horizon 5',
  'Helldivers 2',
  'Monster Hunter Wilds',
  "Assassin's Creed Shadows",
  'Borderlands 4'
]

/** Rows returned for a search; the featured list is shown whole. */
const SEARCH_LIMIT = 40

export class GamesService {
  private readonly dataset = getDataset()
  private readonly measured = buildMeasuredIndex(this.dataset)

  /** Rows for the options, the search and the GPU in `query`. */
  async report(input: GamesQuery = {}): Promise<GamesReport> {
    // IPC input is not trusted: a malformed payload must fall back to the
    // defaults, not throw inside the handler.
    const query: GamesQuery = input && typeof input === 'object' ? input : {}
    const options = normalizeGameOptions(query)
    const dataset = this.dataset
    const system = await getSystem()
    const notes: string[] = []

    const detected = system.gpus[0]?.name ?? ''
    const manual = this.resolveManualGpu(query.gpu)

    if (query.gpu && !manual) {
      notes.push(
        `A GPU escolhida ("${String(query.gpu)}") não existe na base; usando a detecção do sistema.`
      )
    }

    const matched = manual ?? (detected ? matchGpu(dataset, detected) : undefined)

    const gpu: GameHardware = {
      detected: detected || 'Não detectada',
      matched: matched?.name,
      g3d: matched?.g3d,
      manual: manual !== undefined
    }

    if (manual && detected) {
      notes.push(
        `Usando ${manual.name} manualmente; o hardware detectado é ${detected}. ` +
          'A detecção do sistema não foi alterada.'
      )
    } else if (manual) {
      notes.push(`Usando ${manual.name} escolhida manualmente.`)
    } else if (!detected) {
      notes.push('Nenhuma placa de vídeo foi detectada pelo sistema.')
    } else if (!matched) {
      notes.push(
        `A GPU "${detected}" não está na base de 1.381 placas. ` +
          'Escolha o modelo mais próximo para ver uma estimativa.'
      )
    }

    notes.push(
      'A estimativa considera apenas a placa de vídeo: a CPU entra como informação, ' +
        'não como teto de FPS.'
    )

    const measuredGames = new Set(dataset.measured.map((run) => run.game)).size
    notes.push(
      dataset.measured.length > 0
        ? `Benchmarks medidos nesta versão: ${dataset.measured.length} combinações em ` +
          `${measuredGames} jogo${measuredGames > 1 ? 's' : ''}. Todos os outros valores são estimativa.`
        : 'Nenhum benchmark medido acompanha esta versão; todos os valores são estimativa.'
    )

    const search = typeof query.search === 'string' ? query.search.trim() : ''
    let games = FEATURED_GAMES.map((name) => dataset.byName.get(fold(name))).filter(
      (game): game is NonNullable<typeof game> => game !== undefined
    )
    let total = games.length
    let truncated = false

    if (search) {
      const requested = Number.isFinite(query.limit) ? (query.limit as number) : SEARCH_LIMIT
      const limit = Math.min(Math.max(Math.round(requested), 1), 200)
      const found = searchGames(dataset, search, limit)
      games = found.items
      total = found.total
      truncated = found.total > found.items.length
    }

    const rows: GameResult[] = games.map((game) =>
      resolveGame(dataset, this.measured, { game, gpu: matched, options })
    )

    return {
      at: Date.now(),
      options,
      gpu,
      cpu: { detected: system.cpu.brand, manual: false },
      rows,
      catalogSize: dataset.games.length,
      matched: total,
      truncated,
      sources: dataset.sources,
      dataGeneratedAt: dataset.generatedAt,
      notes
    }
  }

  /** GPU table search for the manual picker. */
  searchGpus(query: string, limit = 8): GpuMatch[] {
    const text = typeof query === 'string' ? query : ''
    const requested = Number.isFinite(limit) ? limit : 8
    return searchGpus(this.dataset, text, Math.min(Math.max(Math.round(requested), 1), 20))
  }

  private resolveManualGpu(name: string | null | undefined): GpuMatch | undefined {
    if (typeof name !== 'string' || !name) return undefined
    const direct = this.dataset.gpus.find((gpu) => gpu.name === name)
    if (direct) return direct
    return matchGpu(this.dataset, name)
  }
}
