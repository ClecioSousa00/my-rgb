import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  GAMES,
  cpuPerf,
  estimate,
  gpuPerf,
  localRow,
  shortCpuName,
  shortGpuName
} from '@main/features/games/catalog'
import { HowManyFpsClient, HowManyFpsError } from '@main/features/games/howManyFps'
import { DEFAULT_GAME_OPTIONS, GAME_PRESETS, normalizeGameOptions } from '@shared/features/games'

/**
 * The catalog is a port, so the tests pin the numbers and the matching rules
 * to the original: a name must land on the same row, and the formula must
 * produce the same FPS. The client tests use a fake fetch and a temporary
 * cache, because CI has no key and no network.
 */

const folders: string[] = []

function tempFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'myrgb-games-'))
  folders.push(folder)
  return folder
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

const cs2 = GAMES.find((game) => game.name === 'Counter-Strike 2')!
const eldenRing = GAMES.find((game) => game.name === 'Elden Ring')!

describe('hardware matching', () => {
  it('keeps the whole catalog at 32 games', () => {
    expect(GAMES).toHaveLength(32)
    expect(GAMES.every((game) => game.gpuRef > 0 && game.cpuCap > 0)).toBe(true)
  })

  it('matches by the longest key contained in the name', () => {
    // "RTX 5070 Ti" must win over "RTX 5070", and "RTX 4070 Ti SUPER" over both.
    expect(gpuPerf('NVIDIA GeForce RTX 5070 Ti')).toBe(150)
    expect(gpuPerf('NVIDIA GeForce RTX 5070')).toBe(118)
    expect(gpuPerf('NVIDIA GeForce RTX 4070 Ti SUPER')).toBe(136)
    expect(gpuPerf('NVIDIA GeForce RTX 4070')).toBe(100)
  })

  it('recognises Radeon, Arc and integrated graphics', () => {
    expect(gpuPerf('AMD Radeon RX 7900 XTX')).toBe(170)
    expect(gpuPerf('Intel(R) Arc(TM) B580 Graphics')).toBe(80)
    expect(gpuPerf('AMD Radeon(TM) Graphics')).toBe(6)
  })

  it('returns nothing for a card outside the table', () => {
    expect(gpuPerf('Some Unknown GPU 9000')).toBeUndefined()
  })

  it('matches desktop and mobile-style CPU names', () => {
    expect(cpuPerf('AMD Ryzen 7 7700X 8-Core Processor')).toBe(100)
    expect(cpuPerf('13th Gen Intel(R) Core(TM) i7-13700K')).toBe(108)
    expect(cpuPerf('AMD Ryzen 7 7800X3D 8-Core Processor')).toBe(128)
    expect(cpuPerf('Intel(R) Core(TM) i5-12400F')).toBe(78)
  })
})

describe('short names for the API', () => {
  it('drops the vendor words from GPUs', () => {
    expect(shortGpuName('NVIDIA GeForce RTX 4060 Ti')).toBe('RTX 4060 Ti')
    expect(shortGpuName('AMD Radeon RX 7900 XTX')).toBe('RX 7900 XTX')
    expect(shortGpuName('Intel(R) Arc(TM) B580 Graphics')).toBe('Arc B580')
    // An iGPU is literally "Radeon Graphics"; "Radeon" only goes when "RX" follows.
    expect(shortGpuName('AMD Radeon(TM) Graphics')).toBe('Radeon Graphics')
  })

  it('turns a CPU string into the model name', () => {
    expect(shortCpuName('AMD Ryzen 7 7700X 8-Core Processor')).toBe('Ryzen 7 7700X')
    expect(shortCpuName('13th Gen Intel(R) Core(TM) i7-13700K')).toBe('Core i7-13700K')
    expect(shortCpuName('Intel(R) Core(TM) i5-12400F CPU @ 2.50GHz')).toBe('Core i5-12400F')
    expect(shortCpuName('AMD Ryzen 9 7950X3D 16-Core Processor')).toBe('Ryzen 9 7950X3D')
  })
})

describe('estimate', () => {
  it('takes the lowest of the GPU ceiling and the CPU ceiling', () => {
    const gpu = estimate(cs2, 100, 100, DEFAULT_GAME_OPTIONS)
    expect(gpu).toEqual({ avg: 340, low1: 255, limiter: 'gpu' })

    // At 1080p/Low the CPU ceiling (420 * 1.1) is the lower one.
    const low = estimate(cs2, 100, 100, { ...DEFAULT_GAME_OPTIONS, preset: 'Baixo' })
    expect(low).toEqual({ avg: 462, low1: 347, limiter: 'cpu' })
  })

  it('scales the GPU by resolution, preset and upscaling', () => {
    // 340 * 0.42 = 142.8 at 4K, still GPU-bound.
    expect(estimate(cs2, 100, 100, { ...DEFAULT_GAME_OPTIONS, resolution: '3840x2160' }).avg).toBe(
      143
    )

    // Ultra: 340 * 0.82 = 278.8.
    expect(estimate(cs2, 100, 100, { ...DEFAULT_GAME_OPTIONS, preset: 'Ultra' }).avg).toBe(279)

    // DLSS Quality at 1440p: 340 * 0.72 * 1.4 = 342.7.
    expect(
      estimate(cs2, 100, 100, {
        ...DEFAULT_GAME_OPTIONS,
        resolution: '2560x1440',
        upscaling: 'Quality'
      }).avg
    ).toBe(343)
  })

  it('applies the game frame cap last, and keeps it as the limiter', () => {
    // Elden Ring caps at 60 even though both ceilings are above it.
    const result = estimate(eldenRing, 100, 100, DEFAULT_GAME_OPTIONS)
    expect(result).toEqual({ avg: 60, low1: 45, limiter: 'engine' })

    const row = localRow(eldenRing, 100, 100, DEFAULT_GAME_OPTIONS)
    expect(row.detail).toBe('trava do jogo em 60 FPS')
  })

  it('scales with the hardware indices', () => {
    // A GPU at half the reference: 340 * 0.5 = 170.
    expect(estimate(cs2, 50, 100, DEFAULT_GAME_OPTIONS).avg).toBe(170)
    // A CPU at half: 420 * 0.5 = 210, below the GPU.
    expect(estimate(cs2, 100, 50, DEFAULT_GAME_OPTIONS)).toMatchObject({
      avg: 210,
      limiter: 'cpu'
    })
  })
})

describe('normalizeGameOptions', () => {
  it('keeps valid options and replaces anything unknown', () => {
    expect(
      normalizeGameOptions({ resolution: '2560x1440', preset: 'Ultra', upscaling: 'Quality' })
    ).toEqual({ resolution: '2560x1440', preset: 'Ultra', upscaling: 'Quality' })

    expect(
      normalizeGameOptions({
        resolution: '800x600' as never,
        preset: 'Cinematográfico' as never,
        upscaling: 'Magic' as never
      })
    ).toEqual(DEFAULT_GAME_OPTIONS)

    expect(normalizeGameOptions(undefined)).toEqual(DEFAULT_GAME_OPTIONS)
    expect(GAME_PRESETS).toContain('Médio')
  })
})

const params = {
  cpu: 'Ryzen 7 7700X',
  gpu: 'RTX 4070',
  game: 'Counter-Strike 2',
  resolution: '1920x1080',
  upscaling: 'Native'
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

describe('HowManyFpsClient', () => {
  it('parses avgFps and the 1% low, and caches the answer', async () => {
    const cachePath = join(tempFolder(), 'fps-cache.json')
    const fetchImpl = vi.fn(async () => okResponse({ avgFps: 123.6, min1Fps: 95.2 }))
    const client = new HowManyFpsClient(cachePath, fetchImpl)

    const first = await client.get('secret', params)
    // The original rounds to whole FPS when showing; the cache keeps the raw
    // number, so a second call returns exactly the same value.
    expect(first).toEqual({ avg: 123.6, low1: 95.2 })
    expect(await client.get('secret', params)).toEqual(first)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('sends the key in both headers and the parameters in the body', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ avgFps: 100, min1Fps: 80 }))
    const client = new HowManyFpsClient(join(tempFolder(), 'fps-cache.json'), fetchImpl)

    await client.get('chave-123', params)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://howmanyfps.com/api')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer chave-123')
    expect(headers['x-api-key']).toBe('chave-123')
    expect(JSON.parse(String(init.body))).toEqual(params)
  })

  it('survives a restart through the cache file', async () => {
    const folder = tempFolder()
    const cachePath = join(folder, 'fps-cache.json')
    const first = new HowManyFpsClient(cachePath, async () =>
      okResponse({ avgFps: 60, min1Fps: 45 })
    )
    await first.get('secret', params)

    const onDisk = JSON.parse(readFileSync(cachePath, 'utf8')) as Record<string, unknown>
    expect(Object.keys(onDisk)).toEqual(['Ryzen 7 7700X|RTX 4070|Counter-Strike 2|1920x1080|Native'])

    const offline = vi.fn(async () => {
      throw new Error('sem rede')
    })
    const second = new HowManyFpsClient(cachePath, offline)
    expect(await second.get('secret', params)).toEqual({ avg: 60, low1: 45 })
    expect(offline).not.toHaveBeenCalled()
  })

  it('maps 401, 403 and 429 as fatal, with a reason in Portuguese', async () => {
    for (const status of [401, 403, 429]) {
      const client = new HowManyFpsClient(
        join(tempFolder(), 'fps-cache.json'),
        async () => new Response('', { status })
      )

      const error = await client.get('secret', params).catch((err: unknown) => err)
      expect(error).toBeInstanceOf(HowManyFpsError)
      expect((error as HowManyFpsError).fatal).toBe(true)
      expect((error as HowManyFpsError).status).toBe(status)
      expect((error as HowManyFpsError).message).toMatch(
        status === 429 ? /cota de requisições/ : /chave recusada/
      )
    }
  })

  it('keeps a 404 as a per-game miss', async () => {
    const client = new HowManyFpsClient(
      join(tempFolder(), 'fps-cache.json'),
      async () => new Response('', { status: 404 })
    )

    const error = (await client.get('secret', params).catch((err: unknown) => err)) as HowManyFpsError
    expect(error).toBeInstanceOf(HowManyFpsError)
    expect(error.fatal).toBe(false)
    expect(error.message).toBe('jogo ou hardware não encontrado na base')
  })

  it('blames Cloudflare, not the key, when the answer is an HTML challenge', async () => {
    const client = new HowManyFpsClient(join(tempFolder(), 'fps-cache.json'), async () =>
      new Response('<!DOCTYPE html><html><title>Just a moment...</title></html>', {
        status: 403,
        headers: { 'content-type': 'text/html' }
      })
    )

    const error = (await client.get('secret', params).catch((err: unknown) => err)) as HowManyFpsError
    expect(error).toBeInstanceOf(HowManyFpsError)
    expect(error.status).toBe(403)
    expect(error.fatal).toBe(true)
    expect(error.message).toMatch(/Cloudflare/)
  })

  it('refuses an answer without avgFps', async () => {
    const client = new HowManyFpsClient(join(tempFolder(), 'fps-cache.json'), async () =>
      okResponse({ min1Fps: 60 })
    )

    await expect(client.get('secret', params)).rejects.toThrow(/sem avgFps/)
  })

  it('treats a missing 1% low as "not measured", not zero', async () => {
    const client = new HowManyFpsClient(join(tempFolder(), 'fps-cache.json'), async () =>
      okResponse({ avgFps: 90 })
    )

    expect(await client.get('secret', params)).toEqual({ avg: 90, low1: 0 })
  })

  it('reports a network failure instead of throwing something opaque', async () => {
    const client = new HowManyFpsClient(join(tempFolder(), 'fps-cache.json'), async () => {
      throw new Error('ECONNREFUSED')
    })

    await expect(client.get('secret', params)).rejects.toThrow(/falha de conexão: ECONNREFUSED/)
  })
})
