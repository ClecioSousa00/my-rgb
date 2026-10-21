/**
 * Effect engine types.
 *
 * A pattern describes HOW the light moves along a strip. It returns a
 * coordinate in the palette (0..1) which the palette maps to a colour, so a
 * pattern and a gradient compose without either knowing about the other.
 */

import type { ParamSpec, ParamValue, RGB } from '@shared/types'

export interface PatternContext {
  /** Index of the LED inside its zone, 0 based. */
  ledIndex: number
  /** Total number of LEDs in the zone. */
  ledCount: number
  /** Normalised position along the zone, 0..1. */
  position: number
  /** Seconds since the engine started. */
  time: number
  /** Global speed multiplier. */
  speed: number
  /** Pattern specific parameters. */
  params: Record<string, ParamValue>
  /** Sample the active palette at the given coordinate. */
  sampleGradient: (u: number) => RGB
  /** Deterministic pseudo random number in 0..1. */
  hash: (n: number) => number
  /** Smooth 1D value noise in -1..1. */
  noise: (x: number) => number
}

/**
 * A pattern either picks a point on the palette (`u`) or returns a colour
 * directly. `intensity` scales the final result.
 */
export type PatternOutput =
  | { u: number; intensity?: number }
  | { color: RGB; intensity?: number }

export interface Pattern {
  id: string
  name: string
  category: string
  description: string
  /** Declarative parameters - the UI builds its controls from these. */
  params: ParamSpec[]
  render: (ctx: PatternContext) => PatternOutput
}
