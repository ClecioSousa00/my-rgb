/**
 * ASUS AURA USB protocol - pure packet construction.
 *
 * The wire format is identical on every OS: raw 65-byte HID frames, no report
 * ID, byte 0 is always 0xEC. Keeping this module free of any HID dependency
 * means it can be unit tested byte-for-byte without hardware.
 *
 * References:
 *  - OpenRGB: Controllers/AsusAuraUSBController/AsusAuraUSBController
 *  - inlart, "Adding Asus X570 Support To OpenRGB"
 *  - liquidctl: liquidctl/driver/aura_led.py
 */

import type { RGB } from '@shared/types'

export const AURA_FRAME_SIZE = 65
export const AURA_HEADER = 0xec

/** Maximum LEDs that fit in a single direct sub-packet (5 byte header + 60). */
export const AURA_MAX_LEDS_PER_PACKET = 20
/** Hardware ceiling for a single addressable channel. */
export const AURA_MAX_LEDS_PER_CHANNEL = 120
/** Set on the last sub-packet of a channel: "apply now". */
export const AURA_DIRECT_APPLY = 0x80
/** Set when the LED offset exceeds 255. */
export const AURA_DIRECT_OVERFLOW = 0x10
/** Direct channel used for the fixed on-board LEDs. */
export const AURA_DIRECT_CHANNEL_FIXED = 0x04

// Opcodes
export const AURA_OP_EFFECT = 0x35
export const AURA_OP_EFFECT_COLOR = 0x36
export const AURA_OP_LIGHTING = 0x38
export const AURA_OP_COMMIT = 0x3f
export const AURA_OP_DIRECT = 0x40
export const AURA_OP_STOP_GEN1 = 0x52
export const AURA_OP_FIRMWARE = 0x82
export const AURA_OP_CONFIG = 0xb0

/** Mode value that hands a channel over to the host. */
export const AURA_MODE_DIRECT = 0xff

/** Number of bytes of the configuration table carried in a reply frame. */
export const AURA_CONFIG_TABLE_SIZE = 60

// Configuration table offsets (relative to the 60-byte table at resp[4..64]).
const CFG_ARGB_CHANNELS = 0x02
const CFG_MAINBOARD_LEDS = 0x1b
const CFG_RGB_HEADERS = 0x1d

export interface AuraLayout {
  argbChannels: number
  mainboardLeds: number
  rgbHeaders: number
}

/** Build a zero-padded 65-byte frame from the leading bytes. */
export function auraFrame(...bytes: number[]): Buffer {
  const buf = Buffer.alloc(AURA_FRAME_SIZE, 0)
  for (let i = 0; i < bytes.length && i < AURA_FRAME_SIZE; i++) buf[i] = bytes[i] & 0xff
  return buf
}

/**
 * Release the controller from its own animation engine.
 * Must be the very first command sent to the device.
 */
export function buildStopGen1(): Buffer {
  return auraFrame(AURA_HEADER, 0x52, 0x53, 0x00, 0x01)
}

/** Request the firmware string. Reply: 0xEC 0x02 <ascii...> */
export function buildFirmwareRequest(): Buffer {
  return auraFrame(AURA_HEADER, AURA_OP_FIRMWARE)
}

/** Request the configuration table. Reply: 0xEC 0x30 <table>. */
export function buildConfigRequest(): Buffer {
  return auraFrame(AURA_HEADER, AURA_OP_CONFIG)
}

/**
 * Put a channel into direct (host controlled) mode.
 * @param effectChannel 0 = mainboard, 1..n = addressable headers.
 */
export function buildSetDirectMode(effectChannel: number): Buffer {
  return auraFrame(AURA_HEADER, AURA_OP_EFFECT, effectChannel & 0xff, 0x00, 0x00, AURA_MODE_DIRECT)
}

/** Persist the current effect so it survives a power cycle. */
export function buildCommit(): Buffer {
  return auraFrame(AURA_HEADER, AURA_OP_COMMIT, 0x55)
}

/** Turn the controller lighting on or off. */
export function buildLighting(on: boolean): Buffer {
  return auraFrame(AURA_HEADER, AURA_OP_LIGHTING, 0x00, on ? 0x01 : 0x00)
}

/**
 * Split a colour array into direct-stream sub-packets.
 *
 * Mirrors OpenRGB's SendDirect() exactly: the last sub-packet carries the
 * apply bit, and the LED offset wraps with the overflow flag past 255 LEDs.
 */
export function buildDirectPackets(directChannel: number, colors: RGB[]): Buffer[] {
  const packets: Buffer[] = []
  const total = colors.length
  if (total === 0) return packets

  let command = directChannel & 0xff
  let offset = 0
  let configured = 0
  let inPacket = AURA_MAX_LEDS_PER_PACKET

  while (configured < total) {
    let count: number
    if (configured + inPacket < total) {
      count = inPacket
      configured += inPacket
    } else {
      command |= AURA_DIRECT_APPLY
      count = total - configured
      configured = total
    }

    const buf = auraFrame(AURA_HEADER, AURA_OP_DIRECT, command, offset & 0xff, count)
    const start = configured - count
    for (let i = 0; i < count; i++) {
      const c = colors[start + i]
      buf[5 + i * 3] = clamp8(c.r)
      buf[6 + i * 3] = clamp8(c.g)
      buf[7 + i * 3] = clamp8(c.b)
    }
    packets.push(buf)

    offset += count
    if (configured > 255) {
      command |= AURA_DIRECT_OVERFLOW
      offset = configured - 256
    }
  }

  return packets
}

/**
 * Parse the 60-byte configuration table.
 *
 * Note: the controller does NOT report the LED count of each addressable
 * header. OpenRGB 1.0 exposes those as manually configurable zone sizes for
 * the same reason - they are a property of what the user physically plugged
 * in, not of the controller.
 */
export function parseConfigTable(table: Buffer): AuraLayout {
  const argbChannels = Math.min(table[CFG_ARGB_CHANNELS] ?? 0, 9)
  const mainboardLeds = table[CFG_MAINBOARD_LEDS] ?? 0
  const rgbHeaders = table[CFG_RGB_HEADERS] ?? 0
  return { argbChannels, mainboardLeds, rgbHeaders }
}

/** Extract the printable firmware string from a 0xEC 0x02 reply. */
export function parseFirmware(reply: Buffer): string {
  return reply
    .subarray(2, 18)
    .toString('latin1')
    .replace(/\0.*$/, '')
    .trim()
}

function clamp8(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
