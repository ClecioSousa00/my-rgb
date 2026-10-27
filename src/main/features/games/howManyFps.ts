/**
 * HowManyFPS client.
 *
 * The API returns average FPS and 1% low measured in real play sessions. It
 * has a request quota, so every answer is cached on disk for seven days under
 * `cpu|gpu|game|resolution|upscaling` - the same key and TTL as the Reset
 * Explode. A cached answer is served without touching the network, which is
 * what makes reopening the page free.
 *
 * The API key never leaves the main process: the renderer only ever learns
 * whether a key exists.
 *
 * Authentication is not officially documented (the credentials are requested
 * by e-mail from info@howmanyfps.com), so the two common headers are sent -
 * `Authorization: Bearer` and `x-api-key` - exactly like the original.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

const ENDPOINT = 'https://howmanyfps.com/api'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const TIMEOUT_MS = 15_000

export interface FpsApiParams {
  cpu: string
  gpu: string
  game: string
  resolution: string
  upscaling: string
}

export interface FpsApiResult {
  avg: number
  low1: number
}

interface CacheEntry {
  avg: number
  low1: number
  fetchedAt: number
}

type CacheFile = Record<string, CacheEntry>

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * A readable failure.
 *
 * `fatal` means "stop asking": a refused key or an exhausted quota will not
 * get better on the next game, and hammering the endpoint could make it worse.
 * A 404 is per game and the loop continues.
 */
export class HowManyFpsError extends Error {
  readonly status?: number
  readonly fatal: boolean

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'HowManyFpsError'
    this.status = status
    this.fatal = status === 401 || status === 403 || status === 429
  }
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return 'chave recusada pela API'
  if (status === 404) return 'jogo ou hardware não encontrado na base'
  if (status === 429) return 'cota de requisições esgotada'
  return `HTTP ${status}`
}

export function cacheKey(params: FpsApiParams): string {
  return [params.cpu, params.gpu, params.game, params.resolution, params.upscaling].join('|')
}

export class HowManyFpsClient {
  private readonly cachePath: string
  private readonly fetchImpl: FetchLike
  private cache: CacheFile

  constructor(cachePath: string, fetchImpl: FetchLike = fetch) {
    this.cachePath = cachePath
    this.fetchImpl = fetchImpl
    this.cache = this.loadCache()
  }

  private loadCache(): CacheFile {
    if (!existsSync(this.cachePath)) return {}
    try {
      const parsed = JSON.parse(readFileSync(this.cachePath, 'utf8')) as CacheFile
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      // A corrupt cache is not worth a message: the next answer rewrites it.
      return {}
    }
  }

  private saveCache(): void {
    const now = Date.now()
    for (const [key, entry] of Object.entries(this.cache)) {
      if (now - entry.fetchedAt >= CACHE_TTL_MS) delete this.cache[key]
    }
    try {
      mkdirSync(dirname(this.cachePath), { recursive: true })
      writeFileSync(this.cachePath, JSON.stringify(this.cache), 'utf8')
    } catch {
      // Losing the cache only costs requests, never the answer already shown.
    }
  }

  /** Cached answer for these parameters, without any network call. */
  cached(params: FpsApiParams): FpsApiResult | undefined {
    const entry = this.cache[cacheKey(params)]
    if (!entry) return undefined
    if (Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return undefined
    return { avg: entry.avg, low1: entry.low1 }
  }

  /** Ask the API (or the cache). Throws `HowManyFpsError` with a PT-BR reason. */
  async get(apiKey: string, params: FpsApiParams): Promise<FpsApiResult> {
    const hit = this.cached(params)
    if (hit) return hit

    let response: Response
    try {
      response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${apiKey}`,
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          cpu: params.cpu,
          gpu: params.gpu,
          game: params.game,
          resolution: params.resolution,
          upscaling: params.upscaling
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new HowManyFpsError(`falha de conexão: ${detail}`)
    }

    if (!response.ok) {
      // Cloudflare sits in front of the API and answers a bot check with an
      // HTML page, never JSON. Saying "chave recusada" there would send the
      // user to re-enter a key that is fine.
      const body = await response.text().catch(() => '')
      const challenge = /<!doctype html|<html/i.test(body)
      throw new HowManyFpsError(
        challenge ? 'a API bloqueou a conexão (Cloudflare)' : messageForStatus(response.status),
        response.status
      )
    }

    let body: { avgFps?: unknown; min1Fps?: unknown }
    try {
      body = (await response.json()) as { avgFps?: unknown; min1Fps?: unknown }
    } catch {
      throw new HowManyFpsError('resposta da API não é JSON válido')
    }

    if (typeof body.avgFps !== 'number' || !Number.isFinite(body.avgFps)) {
      throw new HowManyFpsError('resposta da API sem avgFps')
    }

    const result: FpsApiResult = {
      avg: body.avgFps,
      // The API may omit the 1% low; 0 means "not measured", like the original.
      low1: typeof body.min1Fps === 'number' && Number.isFinite(body.min1Fps) ? body.min1Fps : 0
    }

    this.cache[cacheKey(params)] = { ...result, fetchedAt: Date.now() }
    this.saveCache()
    return result
  }
}
