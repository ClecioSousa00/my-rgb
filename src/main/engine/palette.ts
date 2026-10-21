/**
 * Palette handling for the engine.
 *
 * The colour maths lives in @shared/color so the renderer preview and the
 * hardware frames are guaranteed to agree; this module only adds the
 * built-in palettes.
 */

import type { Interpolation, Palette } from '@shared/types'
import { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, samplePalette, paletteToCssGradient } from '@shared/color'

export { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, samplePalette, paletteToCssGradient }

function palette(
  id: string,
  name: string,
  interpolation: Interpolation,
  stops: [number, string][]
): Palette {
  return {
    id,
    name,
    interpolation,
    stops: stops.map(([position, color]) => ({ position, color }))
  }
}

export const BUILTIN_PALETTES: Palette[] = [
  palette('rainbow', 'Arco-íris', 'hsv', [
    [0, '#ff0040'],
    [0.25, '#ffd000'],
    [0.5, '#00ff66'],
    [0.75, '#00c8ff'],
    [1, '#ff0040']
  ]),
  palette('sunset', 'Pôr do sol', 'rgb', [
    [0, '#ff2d55'],
    [0.35, '#ff7a18'],
    [0.7, '#ffd166'],
    [1, '#4a1f8f']
  ]),
  palette('ocean', 'Oceano', 'rgb', [
    [0, '#03045e'],
    [0.5, '#0077b6'],
    [1, '#00f5d4']
  ]),
  palette('fire', 'Fogo', 'rgb', [
    [0, '#7a0000'],
    [0.4, '#ff4500'],
    [0.75, '#ffb703'],
    [1, '#fff3b0']
  ]),
  palette('neon', 'Neon', 'hsv', [
    [0, '#00fff0'],
    [0.5, '#ff00e5'],
    [1, '#7000ff']
  ]),
  palette('pastel', 'Pastel', 'rgb', [
    [0, '#ffd6e0'],
    [0.5, '#c7f9cc'],
    [1, '#bde0fe']
  ]),
  palette('mono', 'Monocromático', 'rgb', [
    [0, '#000000'],
    [1, '#ffffff']
  ]),
  palette('gaming-red', 'Gaming vermelho', 'rgb', [
    [0, '#3b0000'],
    [0.5, '#e10600'],
    [1, '#ff6b6b']
  ]),
  palette('matrix', 'Matrix', 'rgb', [
    [0, '#001100'],
    [0.6, '#00ff41'],
    [1, '#aaffaa']
  ]),
  palette('cyan-magenta', 'Cyan / Magenta', 'hsv', [
    [0, '#00ffff'],
    [1, '#ff00ff']
  ]),
  palette('lava', 'Lava', 'rgb', [
    [0, '#0b0b0b'],
    [0.5, '#8b0000'],
    [1, '#ff8c00']
  ]),
  palette('ice', 'Gelo', 'rgb', [
    [0, '#001f3f'],
    [0.5, '#4cc9f0'],
    [1, '#caf0f8']
  ])
]
