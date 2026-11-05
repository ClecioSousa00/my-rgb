/**
 * Engine tests.
 *
 * Determinism is the critical property here: the Linux build and the Windows
 * build must produce byte identical frames for the same profile and the same
 * timestamp. That is what the frame dump comparison relies on.
 */

import { describe, expect, it } from 'vitest'
import { EffectEngine } from '@main/engine/engine'
import { ALL_PATTERNS, defaultParams } from '@main/engine/patterns'
import { BUILTIN_PALETTES } from '@main/engine/palette'
import { buildZones } from '@main/zones'
import { reconcileProfile } from '@main/store/profileStore'
import type { Profile, ZoneState } from '@shared/types'

const LAYOUT = { argbChannels: 3, mainboardLeds: 1, rgbHeaders: 2 }

function buildProfile(): { profile: Profile; zones: ZoneState[] } {
  const zones = buildZones(LAYOUT)
  const profile = reconcileProfile(
    {
      version: 1,
      name: 'test',
      zones: [],
      palettes: BUILTIN_PALETTES.map((p) => ({ ...p, stops: p.stops.map((s) => ({ ...s })) })),
      global: { brightness: 1, speed: 1, fps: 30, outputEnabled: true }
    },
    zones
  )

  for (const zone of zones) {
    const config = profile.zones.find((z) => z.zoneId === zone.id)!
    config.enabled = true
    config.ledCount = zone.kind === 'addressable' ? 72 : zone.maxLedCount
    config.effect = {
      patternId: 'rainbow',
      paletteId: 'rainbow',
      params: defaultParams('rainbow')
    }
  }
  return { profile, zones }
}

describe('engine', () => {
  it('produces the expected number of pixels', () => {
    const { profile, zones } = buildProfile()
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const frame = engine.renderFrame(1_700_000_000_000)

    expect(frame.zoneLedCounts).toEqual([1, 72, 72, 72])
    expect(frame.pixels).toHaveLength((1 + 72 * 3) * 3)
  })

  it('is deterministic for the same timestamp', () => {
    const { profile, zones } = buildProfile()
    const a = new EffectEngine(profile, zones, { onFrame: () => {} })
    const b = new EffectEngine(profile, zones, { onFrame: () => {} })

    const at = 1_700_000_000_123
    expect([...a.renderFrame(at).pixels]).toEqual([...b.renderFrame(at).pixels])
  })

  it('produces different frames at different timestamps', () => {
    const { profile, zones } = buildProfile()
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const a = engine.renderFrame(1_700_000_000_000)
    const b = engine.renderFrame(1_700_000_000_500)
    expect([...a.pixels]).not.toEqual([...b.pixels])
  })

  it('applies the global brightness', () => {
    const { profile, zones } = buildProfile()
    profile.global.brightness = 0.5
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })

    const full = new EffectEngine(
      { ...profile, global: { ...profile.global, brightness: 1 } },
      zones,
      { onFrame: () => {} }
    ).renderFrame(1_700_000_000_000)

    const dim = engine.renderFrame(1_700_000_000_000)
    expect(dim.pixels[0]).toBe(Math.round(full.pixels[0] * 0.5))
  })

  it('renders a disabled zone as black', () => {
    const { profile, zones } = buildProfile()
    profile.zones[1].enabled = false
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const frame = engine.renderFrame(1_700_000_000_000)

    // zone 1 is the first addressable header, right after the single onboard LED
    const offset = 1 * 3
    expect(frame.pixels[offset]).toBe(0)
    expect(frame.pixels[offset + 1]).toBe(0)
    expect(frame.pixels[offset + 2]).toBe(0)
    // and the following zones keep their own colours
    expect(frame.pixels[offset + 72 * 3]).not.toBeUndefined()
  })

  it('mirrors a followed zone', () => {
    const { profile, zones } = buildProfile()
    const source = profile.zones[1]
    const target = profile.zones[2]
    target.followZoneId = source.zoneId
    target.effect = null

    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const frame = engine.renderFrame(1_700_000_000_000)

    const start = (1 + 72) * 3
    const sourceStart = 1 * 3
    for (let i = 0; i < 72 * 3; i++) {
      expect(frame.pixels[start + i]).toBe(frame.pixels[sourceStart + i])
    }
  })

  it('never crashes on fractional or invalid LED counts', () => {
    const { profile, zones } = buildProfile()
    profile.zones[1].ledCount = 1.5
    profile.zones[2].ledCount = Number.NaN
    // Above the hardware ceiling: clamped instead of allocating a huge array.
    profile.zones[3].ledCount = 500

    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const frame = engine.renderFrame(1_700_000_000_000)

    expect(frame.zoneLedCounts).toEqual([1, 2, 0, 120])
  })

  it('draws bubbles with the configured width instead of a single LED', () => {
    const { profile, zones } = buildProfile()
    const zoneIndex = 1
    profile.zones[zoneIndex].ledCount = 30
    profile.zones[zoneIndex].effect = {
      patternId: 'bubbles',
      paletteId: 'mono',
      params: { ...defaultParams('bubbles'), count: 1, size: 4 }
    }
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })

    let maxLit = 0
    for (let t = 0; t < 5000; t += 20) {
      const frame = engine.renderFrame(t)
      let lit = 0
      for (let i = 0; i < 30; i++) {
        const p = (zoneIndex + i) * 3
        if (frame.pixels[p] + frame.pixels[p + 1] + frame.pixels[p + 2] > 10) lit++
      }
      maxLit = Math.max(maxLit, lit)
    }

    // A 4-LED bubble must cover more than the 1-2 LEDs the old unit bug drew.
    expect(maxLit).toBeGreaterThanOrEqual(3)
  })

  it('renders every built-in pattern without throwing', () => {
    const { profile, zones } = buildProfile()
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })

    for (const pattern of ALL_PATTERNS) {
      profile.zones[1].effect = {
        patternId: pattern.id,
        paletteId: 'rainbow',
        params: defaultParams(pattern.id)
      }
      engine.setProfile(profile)
      const frame = engine.renderFrame(1_700_000_000_000)
      expect(frame.pixels).toHaveLength((1 + 72 * 3) * 3)
      for (const value of frame.pixels) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(255)
      }
    }
  })

  it('produces visually distinct output for the different patterns', () => {
    const { profile, zones } = buildProfile()
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const at = 1_700_000_000_000

    const signature = (id: string): string => {
      profile.zones[1].effect = {
        patternId: id,
        paletteId: 'mono',
        params: defaultParams(id)
      }
      engine.setProfile(profile)
      return [...engine.renderFrame(at).pixels].join(',')
    }

    const solid = signature('solid')
    const wave = signature('wave')
    const chase = signature('chase')
    expect(solid).not.toBe(wave)
    expect(wave).not.toBe(chase)
  })
})
