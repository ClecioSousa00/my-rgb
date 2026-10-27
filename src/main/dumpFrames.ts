/**
 * Frame dumping.
 *
 * The engine is a pure function of (time, profile), so recording the frames
 * it produces on Linux and on Windows and comparing the files byte for byte
 * is a hard proof that the two platforms behave identically.
 *
 * File format (little endian):
 *   magic   8 bytes  "MYRGBFRM"
 *   u32     version
 *   u32     frame index
 *   u32     zone count
 *   u32[]   LEDs per zone
 *   u32     pixel byte length
 *   bytes   RGB triplets
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Profile, ZoneState } from '@shared/types'
import { EffectEngine } from './engine/engine'
import type { AuraUsbDevice } from './aura/auraDevice'

const MAGIC = 'MYRGBFRM'
const VERSION = 1

export interface DumpOptions {
  outDir: string
  frameCount: number
  profile: Profile
  zones: ZoneState[]
  device: AuraUsbDevice | null
}

export async function runFrameDump(options: DumpOptions): Promise<string[]> {
  const { outDir, frameCount, profile, zones } = options
  mkdirSync(outDir, { recursive: true })

  const fps = profile.global.fps || 30
  const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
  // The dump only renders: it never writes to the hardware, so the router (and
  // the device) is deliberately not attached here.

  // Deterministic clock: frame N is always at exactly N/fps seconds.
  const origin = 1_700_000_000_000
  const files: string[] = []

  for (let i = 0; i < frameCount; i++) {
    const at = origin + (i * 1000) / fps
    const frame = engine.renderFrame(at)
    const file = join(outDir, `frame-${String(i).padStart(6, '0')}.bin`)
    writeFileSync(file, encodeFrame(i, frame.zoneLedCounts, frame.pixels))
    files.push(file)
  }

  const manifest = {
    magic: MAGIC,
    version: VERSION,
    fps,
    frameCount,
    zones: zones.map((z) => ({ id: z.id, ledCount: profile.zones.find((p) => p.zoneId === z.id)?.ledCount ?? 0 })),
    profile
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  return files
}

function encodeFrame(index: number, zoneLedCounts: number[], pixels: Uint8Array): Buffer {
  const headerSize = 8 + 4 + 4 + 4 + zoneLedCounts.length * 4 + 4
  const buf = Buffer.alloc(headerSize + pixels.length)

  buf.write(MAGIC, 0, 'ascii')
  buf.writeUInt32LE(VERSION, 8)
  buf.writeUInt32LE(index, 12)
  buf.writeUInt32LE(zoneLedCounts.length, 16)

  let offset = 20
  for (const count of zoneLedCounts) {
    buf.writeUInt32LE(count, offset)
    offset += 4
  }
  buf.writeUInt32LE(pixels.length, offset)
  offset += 4

  Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength).copy(buf, offset)
  return buf
}
