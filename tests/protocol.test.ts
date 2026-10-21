/**
 * Protocol level tests.
 *
 * The reference implementation below is a direct transcription of OpenRGB's
 * AuraUSBController::SendDirect(). Our implementation has to produce byte
 * identical packets, otherwise the hardware silently ignores frames.
 */

import { describe, expect, it } from 'vitest'
import {
  AURA_CONFIG_TABLE_SIZE,
  AURA_DIRECT_APPLY,
  AURA_FRAME_SIZE,
  AURA_MAX_LEDS_PER_PACKET,
  AURA_OP_DIRECT,
  buildCommit,
  buildConfigRequest,
  buildDirectPackets,
  buildFirmwareRequest,
  buildLighting,
  buildSetDirectMode,
  buildStopGen1,
  parseConfigTable,
  parseFirmware
} from '@main/aura/auraProtocol'
import type { RGB } from '@shared/types'

function rgb(r: number, g: number, b: number): RGB {
  return { r, g, b }
}

/** Transcription of OpenRGB's SendDirect(). */
function referenceDirectPackets(device: number, colors: RGB[]): Buffer[] {
  const packets: Buffer[] = []
  const ledCount = colors.length
  let command = device
  let ledsOffset = 0
  let ledsInPacket = 20
  let ledsConfigured = 0

  while (ledsConfigured < ledCount) {
    if (ledsConfigured + ledsInPacket < ledCount) {
      ledsConfigured += ledsInPacket
    } else {
      command |= AURA_DIRECT_APPLY
      ledsInPacket = ledCount - ledsConfigured
      ledsConfigured = ledCount
    }

    const buf = Buffer.alloc(AURA_FRAME_SIZE, 0)
    buf[0x00] = 0xec
    buf[0x01] = AURA_OP_DIRECT
    buf[0x02] = command
    buf[0x03] = ledsOffset
    buf[0x04] = ledsInPacket

    for (let ledIdx = 0; ledIdx < ledsInPacket; ledIdx++) {
      const c = colors[ledsConfigured - ledsInPacket + ledIdx]
      buf[0x05 + ledIdx * 3] = c.r
      buf[0x06 + ledIdx * 3] = c.g
      buf[0x07 + ledIdx * 3] = c.b
    }
    packets.push(buf)

    ledsOffset += ledsInPacket
    if (ledsConfigured > 255) {
      command |= 0x10
      ledsOffset = ledsConfigured - 256
    }
  }
  return packets
}

describe('frames', () => {
  it('always produces 65 bytes', () => {
    expect(buildStopGen1()).toHaveLength(AURA_FRAME_SIZE)
    expect(buildFirmwareRequest()).toHaveLength(AURA_FRAME_SIZE)
    expect(buildConfigRequest()).toHaveLength(AURA_FRAME_SIZE)
    expect(buildCommit()).toHaveLength(AURA_FRAME_SIZE)
    expect(buildLighting(true)).toHaveLength(AURA_FRAME_SIZE)
    expect(buildSetDirectMode(0)).toHaveLength(AURA_FRAME_SIZE)
  })

  it('starts every frame with 0xEC', () => {
    for (const frame of [
      buildStopGen1(),
      buildFirmwareRequest(),
      buildConfigRequest(),
      buildCommit(),
      buildLighting(false),
      buildSetDirectMode(2)
    ]) {
      expect(frame[0]).toBe(0xec)
    }
  })

  it('builds the stop_gen1 frame exactly as specified', () => {
    expect([...buildStopGen1().subarray(0, 5)]).toEqual([0xec, 0x52, 0x53, 0x00, 0x01])
  })

  it('builds the direct-mode claim frame', () => {
    // effect channel 0 = mainboard, 1..n = addressable headers
    expect([...buildSetDirectMode(0).subarray(0, 6)]).toEqual([0xec, 0x35, 0x00, 0x00, 0x00, 0xff])
    expect([...buildSetDirectMode(2).subarray(0, 6)]).toEqual([0xec, 0x35, 0x02, 0x00, 0x00, 0xff])
  })

  it('builds the lighting frames', () => {
    expect([...buildLighting(true).subarray(0, 4)]).toEqual([0xec, 0x38, 0x00, 0x01])
    expect([...buildLighting(false).subarray(0, 4)]).toEqual([0xec, 0x38, 0x00, 0x00])
  })
})

describe('direct stream', () => {
  it('matches the OpenRGB reference implementation byte for byte', () => {
    for (const count of [1, 5, 19, 20, 21, 40, 41, 72, 120]) {
      const colors = Array.from({ length: count }, (_, i) => rgb(i * 2, 255 - i, (i * 7) % 256))
      const mine = buildDirectPackets(0x02, colors)
      const reference = referenceDirectPackets(0x02, colors)
      expect(mine).toHaveLength(reference.length)
      mine.forEach((packet, i) => {
        expect([...packet]).toEqual([...reference[i]])
      })
    }
  })

  it('splits into packets of at most 20 LEDs', () => {
    const colors = Array.from({ length: 72 }, () => rgb(1, 2, 3))
    const packets = buildDirectPackets(0, colors)
    expect(packets).toHaveLength(4)
    expect(packets[0][4]).toBe(20)
    expect(packets[1][4]).toBe(20)
    expect(packets[2][4]).toBe(20)
    expect(packets[3][4]).toBe(12)
  })

  it('sets the apply bit only on the last packet', () => {
    const colors = Array.from({ length: 45 }, () => rgb(0, 0, 0))
    const packets = buildDirectPackets(0, colors)
    expect(packets[0][2] & AURA_DIRECT_APPLY).toBe(0)
    expect(packets[1][2] & AURA_DIRECT_APPLY).toBe(0)
    expect(packets[2][2] & AURA_DIRECT_APPLY).toBe(AURA_DIRECT_APPLY)
  })

  it('keeps the channel id in the command byte', () => {
    const colors = [rgb(1, 1, 1)]
    // The apply bit is only set on the last packet, so mask it out.
    const command = (channel: number): number =>
      buildDirectPackets(channel, colors)[0][2] & ~AURA_DIRECT_APPLY
    expect(command(0x04)).toBe(0x04)
    expect(command(0)).toBe(0x00)
    expect(command(2)).toBe(0x02)
  })

  it('writes RGB triplets in order', () => {
    const packets = buildDirectPackets(0, [rgb(10, 20, 30), rgb(40, 50, 60)])
    expect([...packets[0].subarray(5, 11)]).toEqual([10, 20, 30, 40, 50, 60])
  })

  it('returns nothing for an empty strip', () => {
    expect(buildDirectPackets(0, [])).toHaveLength(0)
  })

  it('never exceeds the hardware limit of 20 LEDs per packet', () => {
    const colors = Array.from({ length: 120 }, () => rgb(0, 0, 0))
    for (const packet of buildDirectPackets(0, colors)) {
      expect(packet[4]).toBeLessThanOrEqual(AURA_MAX_LEDS_PER_PACKET)
    }
  })
})

describe('configuration table', () => {
  it('parses the layout of the real B650 board', () => {
    // Captured from the user's ASUS TUF GAMING B650M-E WIFI, six bytes per row.
    const rows = [
      [0x1e, 0x9f, 0x03, 0x01, 0x00, 0x00],
      [0x78, 0x3c, 0x00, 0x01, 0x00, 0x00],
      [0x78, 0x3c, 0x00, 0x01, 0x00, 0x00],
      [0x78, 0x3c, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x00, 0x00, 0x01, 0x04, 0x02],
      [0x01, 0xf4, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    ]
    const table = Buffer.from(rows.flat())
    expect(table).toHaveLength(AURA_CONFIG_TABLE_SIZE)

    const layout = parseConfigTable(table)
    expect(layout.argbChannels).toBe(3)
    expect(layout.mainboardLeds).toBe(1)
    expect(layout.rgbHeaders).toBe(2)
  })

  it('caps the addressable channel count at 9', () => {
    const table = Buffer.alloc(AURA_CONFIG_TABLE_SIZE)
    table[0x02] = 0xff
    expect(parseConfigTable(table).argbChannels).toBe(9)
  })

  it('extracts the firmware string', () => {
    const reply = Buffer.alloc(AURA_FRAME_SIZE)
    reply[0] = 0xec
    reply[1] = 0x02
    reply.write('AULA3-AR32-0309', 2, 'latin1')
    expect(parseFirmware(reply)).toBe('AULA3-AR32-0309')
  })
})
