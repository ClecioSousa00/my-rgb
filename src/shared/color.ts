/**
 * Colour and gradient utilities.
 *
 * Pure functions with no platform dependencies, shared by the main process
 * (which renders the hardware frames) and the renderer (which previews them).
 * Keeping one implementation guarantees that what the UI shows is exactly
 * what the LEDs receive.
 */

import type { Interpolation, Palette, RGB } from './types'

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 255, g: 0, b: 255 }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (v: number): string =>
    clamp(Math.round(v), 0, 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

const HEX_COLOR = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * Normalise a colour typed by the user.
 *
 * Accepts `#rgb`, `rgb`, `#rrggbb` and `rrggbb` (with surrounding spaces) and
 * returns the canonical `#rrggbb` form, or null when the text is not a colour.
 * Callers keep the previous value on null instead of handing garbage to CSS
 * and to the engine, which would silently fall back to magenta.
 */
export function normalizeHexColor(value: string): string | null {
  const text = value.trim()
  if (!HEX_COLOR.test(text)) return null
  return rgbToHex(hexToRgb(text))
}

export function rgbToHsv({ r, g, b }: RGB): { h: number; s: number; v: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const hn = (((h % 360) + 360) % 360) / 360
  const c = v * s
  const x = c * (1 - Math.abs(((hn * 6) % 2) - 1))
  const m = v - c
  let rgb: [number, number, number]
  if (hn < 1 / 6) rgb = [c, x, 0]
  else if (hn < 2 / 6) rgb = [x, c, 0]
  else if (hn < 3 / 6) rgb = [0, c, x]
  else if (hn < 4 / 6) rgb = [0, x, c]
  else if (hn < 5 / 6) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255)
  }
}

/** Sample a palette at coordinate u (0..1). */
export function samplePalette(palette: Palette, u: number): RGB {
  const stops = palette.stops
  if (stops.length === 0) return { r: 0, g: 0, b: 0 }
  if (stops.length === 1) return hexToRgb(stops[0].color)

  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const x = clamp(u, 0, 1)

  if (x <= sorted[0].position) return hexToRgb(sorted[0].color)
  if (x >= sorted[sorted.length - 1].position) return hexToRgb(sorted[sorted.length - 1].color)

  let lower = sorted[0]
  let upper = sorted[1]
  for (let i = 0; i < sorted.length - 1; i++) {
    if (x >= sorted[i].position && x <= sorted[i + 1].position) {
      lower = sorted[i]
      upper = sorted[i + 1]
      break
    }
  }

  const span = upper.position - lower.position
  const t = span <= 0 ? 0 : (x - lower.position) / span

  if (palette.interpolation === 'hsv') {
    const a = rgbToHsv(hexToRgb(lower.color))
    const b = rgbToHsv(hexToRgb(upper.color))
    // shortest path around the hue circle
    let dh = b.h - a.h
    if (dh > 180) dh -= 360
    if (dh < -180) dh += 360
    return hsvToRgb(a.h + dh * t, a.s + (b.s - a.s) * t, a.v + (b.v - a.v) * t)
  }

  const a = hexToRgb(lower.color)
  const b = hexToRgb(upper.color)
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  }
}

/** Render a palette as a CSS linear-gradient. */
export function paletteToCssGradient(palette: Palette, angle = '90deg'): string {
  const stops = [...palette.stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${(s.position * 100).toFixed(1)}%`)
  return `linear-gradient(${angle}, ${stops.join(', ')})`
}

/** Build a palette from a list of hex colours, evenly spaced. */
export function paletteFromColors(
  id: string,
  name: string,
  colors: string[],
  interpolation: Interpolation = 'rgb'
): Palette {
  const n = colors.length
  return {
    id,
    name,
    interpolation,
    stops: colors.map((color, i) => ({ position: n > 1 ? i / (n - 1) : 0, color }))
  }
}
