/**
 * Hardware output tests.
 *
 * The engine talks to the device through a single method, so a fake device
 * is enough to prove what actually reaches the LEDs. This is where the
 * "lights off" behaviour is checked: turning the output off has to actually
 * darken the hardware, not just stop sending frames.
 */

import { describe, expect, it } from 'vitest'
import { EffectEngine } from '@main/engine/engine'
import { BUILTIN_PALETTES } from '@main/engine/palette'
import { buildZones } from '@main/zones'
import { reconcileProfile } from '@main/store/profileStore'
import type { AuraUsbDevice } from '@main/aura/auraDevice'
import type { Profile, RGB, ZoneState } from '@shared/types'

const LAYOUT = { argbChannels: 3, mainboardLeds: 1, rgbHeaders: 2 }

interface Write {
  channel: number
  colors: RGB[]
}

class FakeDevice {
  connected = true
  writes: Write[] = []
  /** Number of times the next call should throw. */
  failNext = 0

  setChannelLeds(channel: number, colors: RGB[]): void {
    if (this.failNext > 0) {
      this.failNext--
      throw new Error('device busy')
    }
    this.writes.push({ channel, colors: colors.map((c) => ({ ...c })) })
  }

  /** Writes that carry only black. */
  get blackWrites(): Write[] {
    return this.writes.filter((w) => w.colors.every((c) => c.r === 0 && c.g === 0 && c.b === 0))
  }
}

function buildProfile(outputEnabled = true): { profile: Profile; zones: ZoneState[] } {
  const zones = buildZones(LAYOUT)
  const profile = reconcileProfile(
    {
      version: 1,
      name: 'test',
      zones: [],
      palettes: BUILTIN_PALETTES.map((p) => ({ ...p, stops: p.stops.map((s) => ({ ...s })) })),
      global: { brightness: 1, speed: 1, fps: 30, outputEnabled }
    },
    zones
  )

  for (const zone of zones) {
    const config = profile.zones.find((z) => z.zoneId === zone.id)!
    config.enabled = true
    config.ledCount = zone.kind === 'addressable' ? 72 : zone.maxLedCount
  }
  return { profile, zones }
}

function attach(
  engine: EffectEngine,
  device: FakeDevice
): void {
  engine.setDevice(device as unknown as AuraUsbDevice)
}

describe('engine output', () => {
  it('darkens every zone when the output is disabled', () => {
    const { profile, zones } = buildProfile(false)
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const device = new FakeDevice()

    attach(engine, device)

    expect(device.blackWrites).toHaveLength(4)
    for (const write of device.blackWrites) {
      expect(write.colors.length).toBeGreaterThan(0)
    }
  })

  it('does not darken anything when the output is enabled', () => {
    const { profile, zones } = buildProfile(true)
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const device = new FakeDevice()

    attach(engine, device)

    expect(device.writes).toHaveLength(0)
  })

  it('darkens the LEDs when the user turns the output off', () => {
    const { profile, zones } = buildProfile(true)
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const device = new FakeDevice()
    attach(engine, device)

    engine.setProfile({ ...profile, global: { ...profile.global, outputEnabled: false } })

    expect(device.blackWrites).toHaveLength(4)
  })

  it('does not darken the LEDs again when the output is turned back on', () => {
    const { profile, zones } = buildProfile(true)
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const device = new FakeDevice()
    attach(engine, device)

    engine.setProfile({ ...profile, global: { ...profile.global, outputEnabled: false } })
    const afterOff = device.writes.length

    engine.setProfile({ ...profile, global: { ...profile.global, outputEnabled: true } })

    expect(device.writes).toHaveLength(afterOff)
  })

  it('darkens the LEDs again after the device is reconnected', () => {
    const { profile, zones } = buildProfile(false)
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const device = new FakeDevice()
    attach(engine, device)
    expect(device.blackWrites).toHaveLength(4)

    // Unplug and plug back in: the controller may be showing anything now.
    engine.setDevice(null)
    attach(engine, device)

    expect(device.blackWrites).toHaveLength(8)
  })

  it('retries after a failed write', () => {
    const { profile, zones } = buildProfile(false)
    const errors: string[] = []
    const engine = new EffectEngine(profile, zones, {
      onFrame: () => {},
      onError: (message) => errors.push(message)
    })
    const device = new FakeDevice()
    device.failNext = 1

    attach(engine, device)
    expect(errors).toHaveLength(1)
    expect(device.writes).toHaveLength(0)

    engine.syncOutput()
    expect(device.blackWrites).toHaveLength(4)
  })
})
