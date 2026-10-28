import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemSnapshot } from '@shared/features/system'
import type { GameOptions } from '@shared/features/games'
import { DEFAULT_GAME_OPTIONS } from '@shared/features/games'
import {
  getDataset,
  canonicalGpu,
  matchGpu,
  normalizeDataset,
  searchGames,
  searchGpus,
  type Dataset
} from '@main/features/games/dataset'
import { capOf, estimateFps, interpolate } from '@main/features/games/estimate'
import { buildMeasuredIndex, resolveGame } from '@main/features/games/query'
import { FEATURED_GAMES, GamesService } from '@main/features/games'
import { getSystem } from '@main/features/system/info'

/**
 * The page's promises are the tests: measured and estimated are different
 * things, the 1% low is never derived, an unknown GPU produces no number, and
 * the shipped dataset is checked against the real catalog. The service tests
 * stub the hardware snapshot so they pin the matching rules, not this machine.
 */

vi.mock('@main/features/system/info', () => ({ getSystem: vi.fn() }))

const getSystemMock = vi.mocked(getSystem)

function systemSnapshot(gpus: string[], cpu = 'AMD Ryzen 7 7800X3D 8-Core Processor'): SystemSnapshot {
  return {
    at: 1_000_000,
    source: 'systeminformation',
    os: { platform: 'linux', distro: 'test', release: '', arch: 'x64' },
    board: { vendor: '', model: '' },
    cpu: { brand: cpu, physicalCores: 8, threads: 16 },
    ram: { totalBytes: 32 * 1024 ** 3, modules: [], slots: 4 },
    gpus: gpus.map((name) => ({ name })),
    disks: [],
    notes: []
  } as unknown as SystemSnapshot
}

/** A tiny dataset with the same shape as the generated one. */
function rawDataset(): Record<string, unknown> {
  return {
    version: 1,
    generatedAt: '2026-10-05T00:00:00.000Z',
    sourceCap: 360,
    sources: [
      {
        id: 'pcgamebenchmarks',
        name: 'PCGameBenchmarks',
        url: 'https://pcgamebenchmarks.com',
        license: 'CC BY 4.0',
        kind: 'estimated'
      }
    ],
    referenceGpus: [
      { id: 'gtx_1650', name: 'GeForce GTX 1650', g3d: 7873 },
      { id: 'rtx_4070', name: 'GeForce RTX 4070', g3d: 26918 },
      { id: 'rtx_4070_ti_super', name: 'GeForce RTX 4070 Ti SUPER', g3d: 29969 },
      { id: 'rtx_4090', name: 'GeForce RTX 4090', g3d: 38081 }
    ],
    gpus: [
      ['GeForce GTX 1650', 7873, 'Desktop'],
      ['GeForce RTX 4070', 26918, 'Desktop'],
      ['GeForce RTX 4070 Ti SUPER', 29969, 'Desktop'],
      ['GeForce RTX 4090', 38081, 'Desktop'],
      ['GeForce RTX 4090 Laptop GPU', 22739, 'Mobile']
    ],
    games: [
      ['Test Game', 2020, 0, [60, 200, 210, 300]],
      ['Capped Game', 2019, 60, [60, 60, 60, 60]],
      ['Locked Game', 2018, 60, [70, 90, 96, 140]],
      ['Low End Game', 2017, 0, [40, 120, 126, 180]]
    ],
    measured: [
      {
        game: 'Test Game',
        gpu: 'GeForce RTX 4070',
        resolution: '1920x1080',
        preset: 'Alto',
        upscaling: 'Native',
        avg: 190.4,
        low1: 155.2,
        samples: 2,
        cpu: 'AMD Ryzen 7 7800X3D',
        date: '2026-10-01',
        ref: 'run-1'
      },
      {
        game: 'Low End Game',
        gpu: 'GeForce RTX 4070',
        resolution: '1920x1080',
        preset: 'Alto',
        upscaling: 'Native',
        avg: 118,
        low1: null,
        samples: 1
      }
    ]
  }
}

function testDataset(): Dataset {
  return normalizeDataset(rawDataset())
}

function gpu(dataset: Dataset, name: string) {
  const match = matchGpu(dataset, name)
  if (!match) throw new Error(`GPU de teste não encontrada: ${name}`)
  return match
}

function game(dataset: Dataset, name: string) {
  const entry = dataset.byName.get(name.toLowerCase())
  if (!entry) throw new Error(`Jogo de teste não encontrado: ${name}`)
  return entry
}

function options(patch: Partial<GameOptions> = {}): GameOptions {
  return { ...DEFAULT_GAME_OPTIONS, ...patch }
}

beforeEach(() => {
  getSystemMock.mockReset()
})

describe('dataset validation', () => {
  it('loads a well-formed dataset and builds the lookup indexes', () => {
    const dataset = testDataset()

    expect(dataset.games).toHaveLength(4)
    expect(dataset.referenceGpus.map((entry) => entry.name)).toEqual([
      'GeForce GTX 1650',
      'GeForce RTX 4070',
      'GeForce RTX 4070 Ti SUPER',
      'GeForce RTX 4090'
    ])
    expect(dataset.byName.get('test game')?.fps).toEqual([60, 200, 210, 300])
    expect(dataset.gpusByCanonical.get('rtx 4070')?.name).toBe('GeForce RTX 4070')
    expect(dataset.dropped).toEqual({ games: 0, gpus: 0, measured: 0 })
  })

  it('drops records that do not validate instead of shifting columns', () => {
    const raw = rawDataset()
    raw.referenceGpus = [
      { id: 'rtx_4070', name: 'GeForce RTX 4070', g3d: 26918 },
      { id: 'rtx_4090', name: 'GeForce RTX 4090', g3d: 38081 }
    ]
    raw.games = [
      ['Good Game', 2020, 0, [60, 200]],
      // Too few FPS values: the columns would be misaligned.
      ['Short Game', 2021, 0, [60]],
      // Negative FPS is not a measurement.
      ['Negative Game', 2022, 0, [60, -1]],
      ['Good Game', 2019, 0, [10, 20]]
    ]
    raw.measured = [
      {
        game: 'Good Game',
        gpu: 'GeForce RTX 4070',
        resolution: '2560x1440',
        preset: 'Alto',
        upscaling: 'Native',
        avg: 150,
        low1: 120,
        samples: 1
      },
      { game: 'Good Game', gpu: 'GeForce RTX 4070', resolution: '8K', avg: 10 },
      { game: 'Good Game' }
    ]
    raw.gpus = [['GeForce RTX 4070', 26918, 'Desktop'], ['No Score', 0, 'Desktop'], ['Broken']]

    const dataset = normalizeDataset(raw)

    // The duplicate keeps the first row (newest year wins in the generator).
    expect(dataset.games.map((entry) => entry.name)).toEqual(['Good Game'])
    expect(dataset.dropped.games).toBe(3)
    expect(dataset.dropped.gpus).toBe(2)
    expect(dataset.dropped.measured).toBe(2)
    expect(dataset.measured).toHaveLength(1)
  })

  it('refuses a dataset with fewer than two anchors', () => {
    const raw = rawDataset()
    raw.referenceGpus = [{ id: 'only', name: 'Only GPU', g3d: 1000 }]

    expect(() => normalizeDataset(raw)).toThrow(/duas GPUs de referência/)
  })

  it('keeps optional fields absent instead of inventing a value', () => {
    const raw = rawDataset()
    raw.measured = [
      {
        game: 'Test Game',
        gpu: 'GeForce RTX 4070',
        resolution: '1920x1080',
        preset: 'Alto',
        upscaling: 'Native',
        avg: 190
      }
    ]

    const dataset = normalizeDataset(raw)

    expect(dataset.measured[0].low1).toBeNull()
    expect(dataset.measured[0].samples).toBe(1)
    expect(dataset.measured[0].cpu).toBeUndefined()
    expect(dataset.measured[0].ref).toBeUndefined()
  })
})

describe('GPU matching', () => {
  it('ignores vendor words but keeps Ti, SUPER, Laptop and memory sizes', () => {
    expect(canonicalGpu('NVIDIA GeForce RTX 4070')).toBe('rtx 4070')
    expect(canonicalGpu('AMD Radeon RX 7800 XT')).toBe('rx 7800 xt')
    expect(canonicalGpu('GeForce RTX 4070 Ti SUPER')).toBe('rtx 4070 ti super')
    expect(canonicalGpu('GeForce RTX 4090 Laptop GPU')).toBe('rtx 4090 laptop gpu')
    expect(canonicalGpu('Radeon(TM) Graphics')).toBe('graphics')
  })

  it('matches an exact name and a Linux bracket name', () => {
    const dataset = testDataset()

    expect(matchGpu(dataset, 'GeForce RTX 4070')?.name).toBe('GeForce RTX 4070')
    expect(matchGpu(dataset, 'NVIDIA GeForce RTX 4070')?.name).toBe('GeForce RTX 4070')
    expect(matchGpu(dataset, 'AD104 [GeForce RTX 4070]')?.name).toBe('GeForce RTX 4070')
  })

  it('prefers the longest contained model, so Ti SUPER never becomes a plain 4070', () => {
    const dataset = testDataset()

    expect(matchGpu(dataset, 'NVIDIA GeForce RTX 4070 Ti SUPER')?.name).toBe(
      'GeForce RTX 4070 Ti SUPER'
    )
    expect(matchGpu(dataset, 'NVIDIA GeForce RTX 4090 Laptop GPU')?.name).toBe(
      'GeForce RTX 4090 Laptop GPU'
    )
  })

  it('returns undefined for a card that is not in the table', () => {
    expect(matchGpu(testDataset(), 'Some Unknown Card 9000')).toBeUndefined()
    expect(matchGpu(testDataset(), '')).toBeUndefined()
  })

  it('searches names case- and accent-insensitively', () => {
    expect(searchGpus(testDataset(), 'rtx 4070', 8).map((entry) => entry.name)).toContain(
      'GeForce RTX 4070'
    )

    const real = getDataset()
    const found = searchGames(real, 'ragnarok', 10)
    expect(found.total).toBeGreaterThan(0)
    expect(found.items.every((entry) => /ragnar/i.test(entry.name))).toBe(true)
  })

  it('reports the total when the page limit truncates the search', () => {
    const real = getDataset()
    const found = searchGames(real, 'a', 5)

    expect(found.items).toHaveLength(5)
    expect(found.total).toBeGreaterThan(5)
  })
})

describe('estimation', () => {
  it('uses the published value when the card is a reference GPU at 1080p/High', () => {
    const dataset = testDataset()
    const result = estimateFps(
      game(dataset, 'Test Game'),
      26918,
      options(),
      dataset.referenceGpus,
      dataset.sourceCap
    )

    expect(result).toEqual({
      avg: 200,
      confidence: 'high',
      capped: false,
      extrapolated: false,
      published: true
    })
  })

  it('interpolates log-log between anchors and reduces confidence', () => {
    const dataset = testDataset()
    const result = estimateFps(
      game(dataset, 'Test Game'),
      20000,
      options(),
      dataset.referenceGpus,
      dataset.sourceCap
    )

    expect(result?.avg).toBeGreaterThan(60)
    expect(result?.avg).toBeLessThan(200)
    expect(result?.confidence).toBe('medium')
    expect(result?.published).toBe(false)
  })

  it('applies the source resolution and preset factors and caps at the lock', () => {
    const dataset = testDataset()
    const base = estimateFps(
      game(dataset, 'Test Game'),
      20000,
      options(),
      dataset.referenceGpus,
      dataset.sourceCap
    )!

    const at1440p = estimateFps(
      game(dataset, 'Test Game'),
      20000,
      options({ resolution: '2560x1440' }),
      dataset.referenceGpus,
      dataset.sourceCap
    )!
    const at4k = estimateFps(
      game(dataset, 'Test Game'),
      20000,
      options({ resolution: '3840x2160' }),
      dataset.referenceGpus,
      dataset.sourceCap
    )!
    const low = estimateFps(
      game(dataset, 'Test Game'),
      20000,
      options({ preset: 'Baixo' }),
      dataset.referenceGpus,
      dataset.sourceCap
    )!
    const ultra = estimateFps(
      game(dataset, 'Test Game'),
      20000,
      options({ preset: 'Ultra' }),
      dataset.referenceGpus,
      dataset.sourceCap
    )!

    expect(at1440p.avg).toBeCloseTo(base.avg * 0.72, 5)
    expect(at4k.avg).toBeCloseTo(base.avg * 0.39, 5)
    expect(low.avg).toBeCloseTo(base.avg * 1.5625, 5)
    expect(ultra.avg).toBeCloseTo(base.avg * 0.8125, 5)
    // A non-base configuration is never more certain than the base one.
    expect(at1440p.confidence).toBe('low')
  })

  it('treats a capped value as a floor and never exceeds the lock', () => {
    const dataset = testDataset()
    const capped = game(dataset, 'Capped Game')
    const result = estimateFps(capped, 26918, options(), dataset.referenceGpus, dataset.sourceCap)!

    expect(capOf(capped, dataset.sourceCap)).toBe(60)
    expect(result.avg).toBe(60)
    expect(result.capped).toBe(true)

    const stronger = estimateFps(capped, 38081, options(), dataset.referenceGpus, dataset.sourceCap)!
    expect(stronger.avg).toBe(60)
    expect(stronger.capped).toBe(true)
  })

  it('answers "at least the lock" at 1080p/High when every anchor is capped, and nothing elsewhere', () => {
    const dataset = testDataset()

    const base = estimateFps(
      game(dataset, 'Locked Game'),
      20000,
      options(),
      dataset.referenceGpus,
      dataset.sourceCap
    )
    const elsewhere = estimateFps(
      game(dataset, 'Locked Game'),
      20000,
      options({ resolution: '2560x1440' }),
      dataset.referenceGpus,
      dataset.sourceCap
    )

    expect(base?.avg).toBe(60)
    expect(base?.capped).toBe(true)
    expect(base?.confidence).toBe('low')
    expect(elsewhere).toBeNull()
  })

  it('refuses a card weaker than the smallest anchor', () => {
    const dataset = testDataset()
    const result = estimateFps(
      game(dataset, 'Test Game'),
      5000,
      options(),
      dataset.referenceGpus,
      dataset.sourceCap
    )

    expect(result).toBeNull()
  })

  it('extrapolates above the strongest anchor with low confidence', () => {
    const dataset = testDataset()
    const result = estimateFps(
      game(dataset, 'Test Game'),
      50000,
      options(),
      dataset.referenceGpus,
      dataset.sourceCap
    )

    expect(result?.extrapolated).toBe(true)
    expect(result?.confidence).toBe('low')
    expect(result?.avg).toBeGreaterThan(300)
  })

  it('needs two usable anchors for the curve', () => {
    expect(interpolate([{ g3d: 7873, fps: 60 }], 20000)).toBeNull()
    expect(interpolate([], 20000)).toBeNull()
    expect(interpolate([{ g3d: 7873, fps: 0 }], 20000)).toBeNull()
  })
})

describe('query priority', () => {
  it('uses a measured run exactly as published, including the 1% low', () => {
    const dataset = testDataset()
    const index = buildMeasuredIndex(dataset)
    const result = resolveGame(dataset, index, {
      game: game(dataset, 'Test Game'),
      gpu: gpu(dataset, 'NVIDIA GeForce RTX 4070'),
      options: options()
    })

    expect(result.source).toBe('measured')
    expect(result.avg).toBe(190)
    expect(result.low1).toBe(155)
    expect(result.sampleCount).toBe(2)
    expect(result.cpu).toBe('AMD Ryzen 7 7800X3D')
    expect(result.sourceRef).toBe('run-1')
    expect(result.confidence).toBe('high')
  })

  it('shows a measured run without a 1% low without inventing one', () => {
    const dataset = testDataset()
    const index = buildMeasuredIndex(dataset)
    const result = resolveGame(dataset, index, {
      game: game(dataset, 'Low End Game'),
      gpu: gpu(dataset, 'NVIDIA GeForce RTX 4070'),
      options: options()
    })

    expect(result.source).toBe('measured')
    expect(result.low1).toBeNull()
    expect(result.warnings).toContain('A execução não publicou o 1% low.')
  })

  it('falls back to the estimate when the configuration is not measured', () => {
    const dataset = testDataset()
    const index = buildMeasuredIndex(dataset)
    const result = resolveGame(dataset, index, {
      game: game(dataset, 'Test Game'),
      gpu: gpu(dataset, 'NVIDIA GeForce RTX 4070'),
      options: options({ upscaling: 'Performance' })
    })

    expect(result.source).toBe('estimated')
    expect(result.low1).toBeNull()
    expect(result.warnings.join(' ')).toMatch(/não modela DLSS\/FSR/)
  })

  it('never derives the 1% low for an estimate', () => {
    const dataset = testDataset()
    const index = buildMeasuredIndex(dataset)
    const result = resolveGame(dataset, index, {
      game: game(dataset, 'Test Game'),
      gpu: gpu(dataset, 'NVIDIA GeForce RTX 4090'),
      options: options()
    })

    expect(result.source).toBe('estimated')
    expect(result.avg).not.toBeNull()
    expect(result.low1).toBeNull()
  })

  it('returns no data when the GPU is unknown', () => {
    const dataset = testDataset()
    const result = resolveGame(dataset, buildMeasuredIndex(dataset), {
      game: game(dataset, 'Test Game'),
      options: options()
    })

    expect(result.source).toBe('none')
    expect(result.avg).toBeNull()
    expect(result.low1).toBeNull()
    expect(result.confidence).toBe('unknown')
    expect(result.explanation).toMatch(/não foi identificada/)
  })

  it('explains a card below the base instead of defaulting to an index', () => {
    const dataset = testDataset()
    const result = resolveGame(dataset, buildMeasuredIndex(dataset), {
      game: game(dataset, 'Test Game'),
      gpu: { name: 'Weak Card', g3d: 1000, type: 'Desktop' },
      options: options()
    })

    expect(result.source).toBe('none')
    expect(result.explanation).toMatch(/mais fraca que a GPU de referência mínima/)
  })
})

describe('service and shipped catalog', () => {
  beforeEach(() => {
    getSystemMock.mockResolvedValue(systemSnapshot(['NVIDIA GeForce RTX 4070']))
  })

  it('opens with the featured games and a real estimate for each one', async () => {
    const report = await new GamesService().report()

    expect(report.rows).toHaveLength(FEATURED_GAMES.length)
    expect(report.rows.every((row) => row.source === 'estimated')).toBe(true)
    expect(report.rows.every((row) => row.avg !== null && row.avg > 0)).toBe(true)
    // The estimate never carries a 1% low.
    expect(report.rows.every((row) => row.low1 === null)).toBe(true)
    expect(report.gpu.matched).toBe('GeForce RTX 4070')
    expect(report.gpu.manual).toBe(false)
    expect(report.catalogSize).toBeGreaterThan(17_000)
    expect(report.matched).toBe(FEATURED_GAMES.length)
    expect(report.sources.map((source) => source.id)).toEqual([
      'pcgamebenchmarks',
      'opengpubenchmarks'
    ])
  })

  it('searches the whole catalog and reports the full match count', async () => {
    const service = new GamesService()
    const report = await service.report({ search: 'cyberpunk' })

    expect(report.rows.length).toBeGreaterThan(0)
    expect(report.rows[0].game).toMatch(/Cyberpunk/i)
    expect(report.matched).toBeGreaterThanOrEqual(report.rows.length)

    const empty = await service.report({ search: 'zzzz-no-such-game' })
    expect(empty.rows).toEqual([])
    expect(empty.matched).toBe(0)
  })

  it('shows a measured Cyberpunk run for the RTX 5080 with its 1% low', async () => {
    getSystemMock.mockResolvedValue(systemSnapshot(['NVIDIA GeForce RTX 5080 Founders Edition']))

    const report = await new GamesService().report({
      search: 'Cyberpunk 2077',
      resolution: '1920x1080',
      preset: 'Alto',
      upscaling: 'Native'
    })
    const row = report.rows.find((entry) => entry.game === 'Cyberpunk 2077')!

    expect(row.source).toBe('measured')
    expect(row.avg).toBe(194)
    expect(row.low1).toBe(131)
    expect(row.cpu).toMatch(/9950X3D/)
    expect(row.sampleCount).toBe(1)
    expect(report.gpu.matched).toBe('GeForce RTX 5080')
  })

  it('keeps the detected hardware when the user picks another GPU', async () => {
    const report = await new GamesService().report({ gpu: 'GeForce RTX 4090' })

    expect(report.gpu.detected).toBe('NVIDIA GeForce RTX 4070')
    expect(report.gpu.matched).toBe('GeForce RTX 4090')
    expect(report.gpu.manual).toBe(true)
    expect(report.notes.join(' ')).toMatch(/manualmente/)
  })

  it('ignores a manual GPU that is not in the base and says so', async () => {
    const report = await new GamesService().report({ gpu: 'Nope 9999' })

    expect(report.gpu.manual).toBe(false)
    expect(report.gpu.matched).toBe('GeForce RTX 4070')
    expect(report.notes.join(' ')).toMatch(/não existe na base/)
  })

  it('reports unknown hardware explicitly and refuses to guess', async () => {
    getSystemMock.mockResolvedValue(systemSnapshot(['Some Unknown Card 9000']))

    const report = await new GamesService().report()

    expect(report.gpu.matched).toBeUndefined()
    expect(report.rows.every((row) => row.source === 'none')).toBe(true)
    expect(report.rows.every((row) => row.avg === null && row.low1 === null)).toBe(true)
    expect(report.notes.join(' ')).toMatch(/não está na base/)
  })

  it('handles a machine with no GPU at all', async () => {
    getSystemMock.mockResolvedValue(systemSnapshot([]))

    const report = await new GamesService().report()

    expect(report.gpu.detected).toBe('Não detectada')
    expect(report.rows.every((row) => row.source === 'none')).toBe(true)
    expect(report.notes.join(' ')).toMatch(/Nenhuma placa de vídeo/)
  })

  it('reports the CPU as information, not as a frame-rate ceiling', async () => {
    const report = await new GamesService().report()

    expect(report.cpu.detected).toMatch(/7800X3D/)
    expect(report.notes.join(' ')).toMatch(/a CPU entra como informação/)
  })
})
