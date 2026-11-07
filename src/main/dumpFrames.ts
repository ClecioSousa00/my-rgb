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
import type { AuraLayout } from './aura/auraProtocol'
import { EffectEngine } from './engine/engine'
import type { AuraUsbDevice } from './aura/auraDevice'
import { defaultProfile, reconcileProfile } from './store/profileStore'
import { buildZones } from './zones'

const MAGIC = 'MYRGBFRM'
const VERSION = 1

/**
 * Fake layout used by `--dump-frames --dump-offline`.
 *
 * A real dump reads the layout from the controller, which means two machines
 * can only be compared when they have the same motherboard. The offline dump
 * exists to be reproducible anywhere - including CI, which has no AURA
 * hardware at all - so it uses this fixed layout instead. It mirrors the
 * layout used by the automated parity test.
 */
export const SYNTHETIC_LAYOUT: AuraLayout = {
  argbChannels: 3,
  mainboardLeds: 1,
  rgbHeaders: 2
}

/**
 * Profile and zones for a hardware-free dump.
 *
 * This is the exact input of `--dump-frames --dump-offline` and of
 * `tests/parity.test.ts`. Keeping it in one place means the test compares the
 * same bytes the CLI writes, so a green test and a green manual comparison
 * cannot disagree about the profile.
 */
export function syntheticDumpInput(): { profile: Profile; zones: ZoneState[] } {
  const zones = buildZones(SYNTHETIC_LAYOUT)
  return { zones, profile: reconcileProfile(defaultProfile(zones), zones) }
}

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
