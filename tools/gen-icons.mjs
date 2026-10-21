/**
 * Minimal PNG writer + icon generator.
 *
 * Electron cannot reliably use SVG for the tray icon on Linux, so we ship
 * real PNGs. This script renders the MyRGB mark (a rainbow strip) and writes
 * the application and tray icons into build/.
 *
 * Usage: node tools/gen-icons.mjs
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// --- minimal PNG encoder ---------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/** @param {number} width @param {number} height @param {Buffer} rgba */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0 // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// --- the mark --------------------------------------------------------------

/** HSV -> RGB, 0..1 in, 0..255 out. */
function hsv(h, s, v) {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  let r, g, b
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    default: r = v; g = p; b = q; break
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Draws the MyRGB mark: a rounded dark square with a diagonal rainbow bar.
 */
function drawIcon(size, { withBackground = true } = {}) {
  const rgba = Buffer.alloc(size * size * 4)
  const radius = size * 0.22

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4
      const fx = x + 0.5
      const fy = y + 0.5

      let r = 0
      let g = 0
      let b = 0
      let a = 0

      if (withBackground) {
        // rounded square mask
        const dx = Math.max(radius - fx, 0, fx - (size - radius))
        const dy = Math.max(radius - fy, 0, fy - (size - radius))
        const dist = Math.hypot(dx, dy)
        const mask = 1 - smoothstep(radius - 1.5, radius + 0.5, dist)
        if (mask > 0) {
          r = 16; g = 18; b = 24
          a = Math.round(mask * 255)
        }
      }

      // diagonal rainbow bar
      const u = (fx / size) * 0.75 + (1 - fy / size) * 0.25
      const barHalf = size * 0.13
      const distToBar = Math.abs((fx + fy) / 2 - size / 2) - barHalf
      const bar = 1 - smoothstep(-1, 1.5, distToBar)
      if (bar > 0) {
        const [br, bg, bb] = hsv((u * 1.05) % 1, 0.85, 1)
        const alpha = withBackground ? bar : bar
        r = Math.round(r * (1 - alpha) + br * alpha)
        g = Math.round(g * (1 - alpha) + bg * alpha)
        b = Math.round(b * (1 - alpha) + bb * alpha)
        a = Math.max(a, Math.round(alpha * 255))
      }

      rgba[o] = r
      rgba[o + 1] = g
      rgba[o + 2] = b
      rgba[o + 3] = a
    }
  }

  return encodePng(size, size, rgba)
}

const outDir = join(process.cwd(), 'build')
mkdirSync(outDir, { recursive: true })

const targets = [
  ['icon.png', 512, {}],
  ['icon-256.png', 256, {}],
  ['icon-128.png', 128, {}],
  ['tray.png', 32, { withBackground: false }],
  ['tray@2x.png', 64, { withBackground: false }]
]

for (const [name, size, opts] of targets) {
  const png = drawIcon(size, opts)
  writeFileSync(join(outDir, name), png)
  console.log(`wrote build/${name} (${size}x${size}, ${png.length} bytes)`)
}
