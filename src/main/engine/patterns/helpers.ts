/**
 * Shared helpers for patterns: deterministic randomness and smooth noise.
 *
 * Everything is seeded and time based, so the same profile renders the exact
 * same frames on Linux and on Windows - which is what the frame-diff tool
 * verifies.
 */

export { clamp } from '@shared/color'

/** Deterministic hash based pseudo random number in 0..1. */
export function hash(n: number): number {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  x -= Math.floor(x)
  return x
}

/** Hash of a 2D lattice point, for spatial randomness. */
export function hash2(x: number, y: number): number {
  let v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  v -= Math.floor(v)
  return v
}

/** Smooth 1D value noise in -1..1. */
export function noise(x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f) // smoothstep
  const a = hash(i) * 2 - 1
  const b = hash(i + 1) * 2 - 1
  return a + (b - a) * u
}

/** Smooth 2D value noise in -1..1. */
export function noise2(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy) * 2 - 1
  const b = hash2(ix + 1, iy) * 2 - 1
  const c = hash2(ix, iy + 1) * 2 - 1
  const d = hash2(ix + 1, iy + 1) * 2 - 1
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Wrap a value into 0..1. */
export function wrap01(v: number): number {
  const r = v % 1
  return r < 0 ? r + 1 : r
}

/** Triangular pulse, 1 at the centre falling to 0 at the edges. */
export function pulse(distance: number, width: number): number {
  const d = Math.abs(distance)
  if (width <= 0) return d < 0.0001 ? 1 : 0
  return Math.max(0, 1 - d / width)
}
