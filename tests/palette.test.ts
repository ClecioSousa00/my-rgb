/**
 * Gradient / palette tests.
 */

import { describe, expect, it } from 'vitest'
import {
  hexToRgb,
  hsvToRgb,
  normalizeHexColor,
  paletteToCssGradient,
  rgbToHex,
  rgbToHsv,
  samplePalette
} from '@shared/color'
import type { Palette } from '@shared/types'

const palette: Palette = {
  id: 'test',
  name: 'test',
  interpolation: 'rgb',
  stops: [
    { position: 0, color: '#000000' },
    { position: 1, color: '#ffffff' }
  ]
}

describe('colour conversion', () => {
  it('round trips hex', () => {
    expect(rgbToHex(hexToRgb('#7c5cff'))).toBe('#7c5cff')
    expect(rgbToHex(hexToRgb('#fff'))).toBe('#ffffff')
  })

  it('handles invalid hex', () => {
    expect(hexToRgb('nope')).toEqual({ r: 255, g: 0, b: 255 })
  })

  it('normalises colours typed by the user', () => {
    expect(normalizeHexColor('#7c5cff')).toBe('#7c5cff')
    expect(normalizeHexColor('7c5cff')).toBe('#7c5cff')
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc')
    expect(normalizeHexColor('  #FFF  ')).toBe('#ffffff')
  })

  it('rejects text that is not a colour', () => {
    expect(normalizeHexColor('')).toBeNull()
    expect(normalizeHexColor('#12345')).toBeNull()
    expect(normalizeHexColor('#xyzxyz')).toBeNull()
    expect(normalizeHexColor('vermelho')).toBeNull()
    expect(normalizeHexColor('#7c5cff extra')).toBeNull()
  })

  it('round trips hsv', () => {
    const rgb = { r: 12, g: 200, b: 90 }
    const hsv = rgbToHsv(rgb)
    const back = hsvToRgb(hsv.h, hsv.s, hsv.v)
    expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(2)
    expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(2)
    expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(2)
  })
})

describe('gradient sampling', () => {
  it('returns the stop colours at the extremes', () => {
    expect(samplePalette(palette, 0)).toEqual({ r: 0, g: 0, b: 0 })
    expect(samplePalette(palette, 1)).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('interpolates linearly in rgb', () => {
    const mid = samplePalette(palette, 0.5)
    expect(mid.r).toBeCloseTo(127.5, 0)
    expect(mid.g).toBeCloseTo(127.5, 0)
  })

  it('clamps outside the range', () => {
    expect(samplePalette(palette, -5)).toEqual({ r: 0, g: 0, b: 0 })
    expect(samplePalette(palette, 5)).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('handles a single stop', () => {
    const single: Palette = { ...palette, stops: [{ position: 0, color: '#123456' }] }
    expect(samplePalette(single, 0.5)).toEqual({ r: 0x12, g: 0x34, b: 0x56 })
  })

  it('handles an empty palette', () => {
    expect(samplePalette({ ...palette, stops: [] }, 0.5)).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('takes the shortest path around the hue circle in hsv', () => {
    const hsvPalette: Palette = {
      ...palette,
      interpolation: 'hsv',
      stops: [
        { position: 0, color: '#ff0000' },
        { position: 1, color: '#0000ff' }
      ]
    }
    // Red -> blue the short way goes through magenta, not through green.
    const mid = rgbToHsv(samplePalette(hsvPalette, 0.5))
    expect(mid.h).toBeCloseTo(300, 0)
  })

  it('renders a css gradient', () => {
    expect(paletteToCssGradient(palette)).toBe('linear-gradient(90deg, #000000 0.0%, #ffffff 100.0%)')
  })
})
