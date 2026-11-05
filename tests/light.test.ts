import { describe, expect, it } from 'vitest'
import type { Profile, RGB, ZoneConfig, ZoneState } from '@shared/types'
import type { LightTarget } from '@shared/features/light'
import {
  AURA_DEVICE_ID,
  auraTargetId,
  auraTargetsFromZones,
  configIdForTarget,
  mergeTargets,
  syncAuraTargets,
  targetIdForConfigId
} from '@shared/features/light'
import {
  defaultProfile,
  reconcileProfile,
  validateImportedProfile
} from '@main/store/profileStore'
import { LightRouter, type LightBackend } from '@main/light/router'
import { buildZones } from '@main/zones'

/**
 * Lighting router.
 *
 * Two things have to stay true while the router exists: an old profile opens
 * unchanged (it simply gains AURA targets), and writing a frame reaches the
 * same channel with the same colours as before. The router tests cover the
 * rules an external backend will rely on - throttling, acquire/release and
 * error isolation - with a stub backend, no hardware.
 */

const LAYOUT = { argbChannels: 3, mainboardLeds: 1, rgbHeaders: 2 }
const zones: ZoneState[] = buildZones(LAYOUT)

const colors: RGB[] = [{ r: 1, g: 2, b: 3 }]

function config(zoneId: string, patch: Partial<ZoneConfig> = {}): ZoneConfig {
  return {
    zoneId,
    enabled: true,
    ledCount: 12,
    effect: null,
    followZoneId: null,
    ...patch
  }
}

/** A profile written before targets existed: zones only, version 1. */
function legacyProfile(): Profile {
  return {
    version: 1,
    name: 'antigo',
    zones: [config('mainboard', { ledCount: 1 }), config('argb0', { ledCount: 72 })],
    palettes: [{ id: 'rainbow', name: 'Rainbow', interpolation: 'rgb', stops: [] }],
    global: { brightness: 1, speed: 1, fps: 30, outputEnabled: true }
  }
}

describe('light targets', () => {
  it('derives one AURA target per hardware zone, with the HID channel', () => {
    const targets = auraTargetsFromZones(
      zones,
      [config('mainboard', { ledCount: 1 }), config('argb0', { ledCount: 30, name: ' Frente ' })]
    )

    expect(targets.map((t) => t.id)).toEqual([
      'aura:mainboard',
      'aura:argb0',
      'aura:argb1',
      'aura:argb2'
    ])
    expect(targets.map((t) => t.zoneIndex)).toEqual([4, 0, 1, 2])
    expect(targets[0]).toMatchObject({
      backend: 'aura',
      deviceId: AURA_DEVICE_ID,
      label: 'LEDs onboard',
      ledCount: 1,
      enabled: true
    })
    // A custom name wins over the hardware one; the LED count comes from the
    // profile, which is the only place that knows how long the strip is.
    expect(targets[1].label).toBe('Frente')
    expect(targets[1].ledCount).toBe(30)
  })

  it('accepts a profile that already stores the qualified id', () => {
    const targets = auraTargetsFromZones(zones, [config('aura:argb1', { ledCount: 48 })])
    expect(targets.find((t) => t.id === 'aura:argb1')?.ledCount).toBe(48)
  })

  it('keeps the short AURA id as the config key and the full id otherwise', () => {
    const aura = auraTargetsFromZones(zones, [])[1]
    expect(configIdForTarget(aura)).toBe('argb0')
    expect(targetIdForConfigId('argb0')).toBe('aura:argb0')
    expect(targetIdForConfigId(auraTargetId('argb0'))).toBe('aura:argb0')

    const openrgb: LightTarget = {
      id: 'openrgb:0:2',
      backend: 'openrgb',
      deviceId: '0',
      zoneIndex: 2,
      label: 'RAM',
      ledCount: 10,
      enabled: true
    }
    expect(configIdForTarget(openrgb)).toBe('openrgb:0:2')
    expect(targetIdForConfigId('openrgb:0:2')).toBe('openrgb:0:2')
  })

  it('merges derived AURA targets without dropping other backends', () => {
    const other: LightTarget = {
      id: 'razer:keyboard',
      backend: 'razer',
      deviceId: 'keyboard',
      zoneIndex: 0,
      label: 'Teclado',
      ledCount: 100,
      enabled: false
    }
    const derived = auraTargetsFromZones(zones, [])

    expect(mergeTargets([other, { ...derived[0], label: 'velho' }], derived)).toEqual([
      ...derived,
      other
    ])
  })

  it('refreshes only what the profile owns and reuses the array when nothing changed', () => {
    const targets = auraTargetsFromZones(zones, [config('argb0', { ledCount: 30 })])
    const updated = syncAuraTargets(targets, [config('argb0', { ledCount: 60, name: 'Topo' })])
    expect(updated[1]).toMatchObject({ label: 'Topo', ledCount: 60, enabled: true })

    expect(syncAuraTargets(updated, [config('argb0', { ledCount: 60, name: 'Topo' })])).toBe(
      updated
    )
  })
})

describe('profile migration', () => {
  it('synthesizes AURA targets for a profile that has none', () => {
    const legacy = legacyProfile()
    const reconciled = reconcileProfile(legacy, zones)

    expect(reconciled.version).toBe(1)
    expect(reconciled.targets?.map((t) => t.id)).toEqual([
      'aura:mainboard',
      'aura:argb0',
      'aura:argb1',
      'aura:argb2'
    ])
    // The zones themselves are untouched: an old file opens as it was.
    expect(reconciled.zones.map((z) => z.zoneId)).toEqual([
      'mainboard',
      'argb0',
      'argb1',
      'argb2'
    ])
    expect(reconciled.zones[0].ledCount).toBe(1)
    expect(reconciled.zones[1].ledCount).toBe(72)
  })

  it('opens a serialized legacy file and adds the targets on the way in', () => {
    const legacy = legacyProfile()
    const fromDisk = JSON.parse(JSON.stringify(legacy)) as Profile
    expect(fromDisk.targets).toBeUndefined()

    const reconciled = reconcileProfile(fromDisk, zones)
    expect(reconciled.targets).toHaveLength(4)
    expect(reconciled.zones).toHaveLength(4)
  })

  it('survives a hand-edited targets field instead of crashing', () => {
    const damaged = { ...legacyProfile(), targets: 'aura:argb0' } as unknown as Profile
    const reconciled = reconcileProfile(damaged, zones)
    expect(reconciled.targets?.map((t) => t.id)).toEqual([
      'aura:mainboard',
      'aura:argb0',
      'aura:argb1',
      'aura:argb2'
    ])
    expect(mergeTargets('nada' as never, [])).toEqual([])
  })

  it('keeps the stored targets when no device is attached', () => {
    const withTargets = reconcileProfile(legacyProfile(), zones)
    const offline = reconcileProfile(withTargets, [])

    expect(offline.targets).toEqual(withTargets.targets)
    expect(offline.targets?.map((t) => t.id)).toContain('aura:argb2')
  })

  it('ships targets in a brand new profile', () => {
    const profile = defaultProfile(zones)
    expect(profile.targets?.map((t) => t.zoneIndex)).toEqual([4, 0, 1, 2])
    expect(profile.targets?.every((t) => t.enabled)).toBe(true)
  })

  it('sanitizes targets in an imported file and drops what it cannot trust', () => {
    const profile = validateImportedProfile({
      ...legacyProfile(),
      targets: [
        { id: 'aura:argb0', backend: 'aura', deviceId: 'aura', zoneIndex: 0, ledCount: 30 },
        { id: 'aura:argb0', backend: 'aura', zoneIndex: 1 },
        { id: 'x', backend: 'desconhecido', zoneIndex: 0 },
        { id: 'aura:argb1', backend: 'aura', zoneIndex: -3 },
        { id: 'razer:kb', backend: 'razer', zoneIndex: 2.4, label: '  ' }
      ]
    })

    expect(profile.targets).toHaveLength(2)
    expect(profile.targets?.[0]).toMatchObject({
      id: 'aura:argb0',
      label: 'aura:argb0',
      ledCount: 30,
      enabled: true
    })
    expect(profile.targets?.[1]).toMatchObject({
      id: 'razer:kb',
      backend: 'razer',
      deviceId: 'razer',
      zoneIndex: 2,
      label: 'razer:kb'
    })
  })

  it('leaves a file without targets without any', () => {
    expect(validateImportedProfile(legacyProfile()).targets).toBeUndefined()
  })
})

interface StubOptions {
  id?: LightBackend['id']
  critical?: boolean
  minIntervalMs?: number
  available?: boolean
  acquire?: boolean
  fail?: string
}

function stub(options: StubOptions = {}): LightBackend & {
  writes: { target: LightTarget; colors: RGB[] }[]
  held: number
  releases: number
} {
  return {
    id: options.id ?? 'aura',
    critical: options.critical ?? true,
    minIntervalMs: options.minIntervalMs ?? 0,
    writes: [],
    held: 0,
    releases: 0,
    available() {
      return options.available !== false
    },
    acquire() {
      this.held++
      return options.acquire !== false
    },
    release() {
      this.releases++
    },
    write(target: LightTarget, colors: RGB[]) {
      if (options.fail) throw new Error(options.fail)
      this.writes.push({ target, colors })
    }
  }
}

function targets(): LightTarget[] {
  return auraTargetsFromZones(zones, [])
}

describe('LightRouter', () => {
  it('writes a zone to the AURA channel that serves it', () => {
    const aura = stub()
    const router = new LightRouter()
    router.register(aura)
    router.setTargets(targets())

    expect(router.write('argb0', colors)).toEqual({ ok: true })
    expect(router.write('mainboard', colors)).toEqual({ ok: true })

    expect(aura.writes.map((w) => w.target.zoneIndex)).toEqual([0, 4])
    expect(aura.writes[0].colors).toEqual(colors)
    expect(router.activeBackends()).toEqual(['aura'])
    expect(router.outputAvailable).toBe(true)
  })

  it('ignores a zone it does not know, and one that is switched off', () => {
    const aura = stub()
    const router = new LightRouter()
    router.register(aura)
    router.setTargets(targets())
    router.setTargets(targets().map((t) => ({ ...t, enabled: false })))

    expect(router.write('argb0', colors)).toEqual({ ok: false, skipped: true })
    expect(aura.writes).toHaveLength(0)
    expect(router.outputAvailable).toBe(false)
  })

  it('does not write when the backend is unavailable or refuses to be held', () => {
    const offline = stub({ available: false })
    const router = new LightRouter()
    router.register(offline)
    router.setTargets(targets())
    expect(router.write('argb0', colors)).toEqual({ ok: false, skipped: true })
    expect(offline.writes).toHaveLength(0)

    const busy = stub({ acquire: false })
    const second = new LightRouter()
    second.register(busy)
    second.setTargets(targets())
    expect(second.write('argb0', colors)).toEqual({ ok: false, skipped: true })
    expect(busy.writes).toHaveLength(0)
  })

  it('keeps the minimum interval per target and lets the next window through', () => {
    let now = 1_000
    const slow = stub({ id: 'openrgb', critical: false, minIntervalMs: 100 })
    const router = new LightRouter({ now: () => now })
    router.register(slow)
    router.setTargets([
      {
        id: 'openrgb:0:0',
        backend: 'openrgb',
        deviceId: '0',
        zoneIndex: 0,
        label: 'Placa',
        ledCount: 10,
        enabled: true
      }
    ])

    expect(router.write('openrgb:0:0', colors).ok).toBe(true)
    now += 40
    expect(router.write('openrgb:0:0', colors)).toEqual({ ok: false, skipped: true })
    now += 60
    expect(router.write('openrgb:0:0', colors).ok).toBe(true)
    // A second target of the same backend has its own window.
    expect(router.write('openrgb:0:0', colors)).toEqual({ ok: false, skipped: true })
    expect(slow.writes).toHaveLength(2)
  })

  it('isolates a failing external backend instead of stopping the output', () => {
    const errors: string[] = []
    const aura = stub()
    const razer = stub({ id: 'razer', critical: false, fail: 'OpenRazer fora do ar' })
    const router = new LightRouter({ onError: (message) => errors.push(message) })
    router.register(aura)
    router.register(razer)
    router.setTargets([
      ...targets(),
      {
        id: 'razer:kb',
        backend: 'razer',
        deviceId: 'kb',
        zoneIndex: 0,
        label: 'Teclado',
        ledCount: 10,
        enabled: true
      }
    ])

    expect(router.write('argb0', colors).ok).toBe(true)
    expect(router.write('razer:kb', colors)).toEqual({
      ok: false,
      error: 'OpenRazer fora do ar'
    })
    expect(errors).toEqual(['Teclado: OpenRazer fora do ar'])
    // The AURA keeps receiving frames.
    expect(router.write('argb1', colors).ok).toBe(true)
    expect(router.outputAvailable).toBe(true)
  })

  it('marks a primary backend failure as fatal and leaves the message to the caller', () => {
    const errors: string[] = []
    const aura = stub({ fail: 'device busy' })
    const router = new LightRouter({ onError: (message) => errors.push(message) })
    router.register(aura)
    router.setTargets(targets())

    expect(router.write('argb0', colors)).toEqual({
      ok: false,
      fatal: true,
      error: 'device busy'
    })
    // The engine formats the message the UI already knows.
    expect(errors).toHaveLength(0)
  })

  it('holds a backend while it has targets and releases it on the way out', () => {
    const aura = stub()
    const router = new LightRouter()
    router.register(aura)

    router.setTargets(targets())
    router.setTargets(targets())
    expect(aura.held).toBe(1)

    router.setTargets([])
    expect(aura.releases).toBe(1)
    expect(router.activeBackends()).toEqual([])

    router.setTargets(targets())
    router.dispose()
    expect(aura.releases).toBe(2)
  })

  it('retries the acquire when the targets are set again', () => {
    const aura = stub({ acquire: false })
    const router = new LightRouter()
    router.register(aura)
    router.setTargets(targets())
    expect(router.outputAvailable).toBe(false)

    // Whatever made it unavailable is gone; reconcile() sets the targets again.
    ;(aura as unknown as { acquire: () => boolean }).acquire = () => true
    router.setTargets(targets())
    expect(router.outputAvailable).toBe(true)
    expect(router.write('argb0', colors).ok).toBe(true)
  })
})
