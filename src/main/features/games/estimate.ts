/**
 * The estimate: from a game's published anchors to this machine.
 *
 * The base (PCGameBenchmarks, CC BY 4.0) publishes one number per game and
 * reference GPU at **1080p/High**, already capped at the game's frame lock and
 * at 360 FPS. To answer for another card we place it on the curve those
 * anchors describe (log FPS against log score, piecewise), and to answer for
 * another resolution/preset we apply the factors the source documents on its
 * methodology page - not the old hand-tuned ones.
 *
 * Two honest consequences are visible in the result:
 *
 * - Capped anchors are not on the curve (a 60 FPS lock says nothing about the
 *   card), so they are left out and only the uncapped ones are fitted. A game
 *   that is capped everywhere still answers ">= cap" at 1080p/High, because
 *   that much is certain, and says nothing elsewhere.
 * - The 1% low is never derived. There is no universal ratio from the average
 *   to the 1% low, so an estimate leaves it empty.
 *
 * The factors below are the source's, and they are heuristics - the report
 * says so. Nothing here is calibrated against this machine.
 */

import type { Confidence, GameOptions, GamePreset, GameResolution } from '@shared/features/games'
import type { DatasetGame, DatasetReference } from './dataset'

/**
 * Relative to 1080p, as published on pcgamebenchmarks.com/methodology
 * ("At 1440p you keep about 72% of the 1080p frame rate, at 4K about 39%").
 */
export const RESOLUTION_FACTOR: Record<GameResolution, number> = {
  '1920x1080': 1,
  '2560x1440': 0.72,
  '3840x2160': 0.39
}

/**
 * Relative to High, derived from the same page: 1080p/Medium is the reference,
 * Low runs about 25% faster, High keeps 80% and Ultra 65%. The published
 * column is High, so each factor is divided by 0.80:
 * Low 1.25/0.80 = 1.5625 · Medium 1/0.80 = 1.25 · High 1 · Ultra 0.65/0.80.
 */
export const PRESET_FACTOR: Record<GamePreset, number> = {
  Baixo: 1.5625,
  Médio: 1.25,
  Alto: 1,
  Ultra: 0.8125
}

/** Slope bounds for the extrapolation above the strongest anchor, so a gap in
 * the table cannot produce a fantasy number. */
const MIN_SLOPE = 0.35
const MAX_SLOPE = 1.6

export interface EstimateResult {
  avg: number
  confidence: Confidence
  /** The value is at the ceiling, so it reads as "at least this". */
  capped: boolean
  /** True when the GPU sits above the strongest anchor. */
  extrapolated: boolean
  /** True when a published anchor was used as-is instead of the curve. */
  published: boolean
}

/** The ceiling that applies to this game: its own lock or the source's. */
export function capOf(game: DatasetGame, sourceCap: number): number {
  return game.cap > 0 ? Math.min(game.cap, sourceCap) : sourceCap
}

export function isBaseOptions(options: GameOptions): boolean {
  return options.resolution === '1920x1080' && options.preset === 'Alto'
}

interface Anchor {
  g3d: number
  fps: number
}

/**
 * Place `g3d` on the anchors' curve.
 *
 * Between two anchors the interpolation is log-log, because frame rate grows
 * sub-linearly with benchmark score. Above the last anchor the slope of the
 * top two is reused, clamped; below the first there is no data and the answer
 * is null instead of a guess.
 */
export function interpolate(
  anchors: Anchor[],
  g3d: number
): { fps: number; confidence: Confidence; extrapolated: boolean } | null {
  const points = anchors
    .filter((anchor) => anchor.g3d > 0 && anchor.fps > 0)
    .sort((a, b) => a.g3d - b.g3d)

  if (points.length === 0) return null

  const exact = points.find((point) => point.g3d === g3d)
  if (exact) return { fps: exact.fps, confidence: 'high', extrapolated: false }

  if (points.length === 1) return null
  if (g3d < points[0].g3d) return null

  const last = points[points.length - 1]
  if (g3d > last.g3d) {
    const previous = points[points.length - 2]
    const slope = clamp(
      (Math.log(last.fps) - Math.log(previous.fps)) /
        (Math.log(last.g3d) - Math.log(previous.g3d)),
      MIN_SLOPE,
      MAX_SLOPE
    )
    const fps = last.fps * Math.pow(g3d / last.g3d, slope)
    return { fps, confidence: 'low', extrapolated: true }
  }

  for (let index = 0; index < points.length - 1; index++) {
    const low = points[index]
    const high = points[index + 1]
    if (g3d < low.g3d || g3d > high.g3d) continue
    if (high.g3d === low.g3d) return { fps: low.fps, confidence: 'medium', extrapolated: false }
    const ratio =
      (Math.log(g3d) - Math.log(low.g3d)) / (Math.log(high.g3d) - Math.log(low.g3d))
    const fps = Math.exp(Math.log(low.fps) + ratio * (Math.log(high.fps) - Math.log(low.fps)))
    return { fps, confidence: 'medium', extrapolated: false }
  }

  return null
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function downgrade(confidence: Confidence): Confidence {
  if (confidence === 'high') return 'medium'
  if (confidence === 'medium') return 'low'
  return confidence
}

/**
 * FPS this game should reach on a card scoring `g3d`.
 *
 * Null means "the bases do not support an answer" - never a default card.
 */
export function estimateFps(
  game: DatasetGame,
  g3d: number,
  options: GameOptions,
  referenceGpus: DatasetReference[],
  sourceCap: number
): EstimateResult | null {
  const cap = capOf(game, sourceCap)
  const base = isBaseOptions(options)

  // A published anchor is the source's own number for that exact card, so it
  // is used as-is at 1080p/High instead of re-fitting the curve through it.
  const anchorIndex = referenceGpus.findIndex((reference) => reference.g3d === g3d)
  const published = anchorIndex >= 0 ? game.fps[anchorIndex] : undefined
  if (base && published !== undefined) {
    return {
      avg: published,
      confidence: published >= cap ? 'medium' : 'high',
      capped: published >= cap,
      extrapolated: false,
      published: true
    }
  }

  const anchors: Anchor[] = referenceGpus
    .map((reference, index) => ({ g3d: reference.g3d, fps: game.fps[index] ?? 0 }))
    // A capped anchor says only "at least this", which is not a point on the
    // curve. Fitting it would flatten the curve and understate fast cards.
    .filter((anchor) => anchor.fps > 0 && anchor.fps < cap)

  const fit = interpolate(anchors, g3d)

  if (!fit) {
    // Every anchor is capped: at 1080p/High the game reaches the ceiling even
    // on the weakest reference card, and that is all the base says.
    const everyAnchorCapped = referenceGpus.every(
      (_reference, index) => (game.fps[index] ?? 0) >= cap
    )
    if (base && everyAnchorCapped) {
      return {
        avg: cap,
        confidence: 'low',
        capped: true,
        extrapolated: false,
        published: false
      }
    }
    return null
  }

  const scaled = fit.fps * RESOLUTION_FACTOR[options.resolution] * PRESET_FACTOR[options.preset]
  const avg = Math.min(scaled, cap)

  return {
    avg,
    // Resolution, preset and upscaling are factors, never measurements, so a
    // non-base configuration is always one step less certain.
    confidence: base ? fit.confidence : downgrade(fit.confidence),
    capped: avg >= cap,
    extrapolated: fit.extrapolated,
    published: false
  }
}
