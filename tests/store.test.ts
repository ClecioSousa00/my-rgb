/**
 * Profile store tests.
 *
 * The reconciliation logic decides which zones get an effect and how many
 * LEDs each one drives, so a mistake here shows up as LEDs that silently
 * stay dark.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  DEFAULT_GLOBAL,
  ProfileStore,
  defaultProfile,
  reconcileProfile
} from '@main/store/profileStore'
import { buildZones } from '@main/zones'
import { BUILTIN_PALETTES } from '@main/engine/palette'
import { defaultParams } from '@main/engine/patterns'
import type { Profile, ZoneState } from '@shared/types'

const LAYOUT = { argbChannels: 3, mainboardLeds: 1, rgbHeaders: 2 }
const ZONES: ZoneState[] = buildZones(LAYOUT)

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'myrgb-test-'))
  tempDirs.push(dir)
  return dir
}

function emptyProfile(): Profile {
  return {
    version: 1,
    name: 'teste',
    zones: [],
    palettes: BUILTIN_PALETTES.map((p) => ({ ...p, stops: p.stops.map((s) => ({ ...s })) })),
    global: { ...DEFAULT_GLOBAL }
  }
}

describe('defaultProfile', () => {
  it('creates one zone entry per hardware zone', () => {
    const profile = defaultProfile(ZONES)
    expect(profile.zones.map((z) => z.zoneId)).toEqual(['mainboard', 'argb0', 'argb1', 'argb2'])
  })

  it('enables every zone', () => {
    const profile = defaultProfile(ZONES)
    expect(profile.zones.every((z) => z.enabled)).toBe(true)
  })

  it('uses 72 LEDs for addressable headers and the real count for fixed ones', () => {
    const profile = defaultProfile(ZONES)
    expect(profile.zones.find((z) => z.zoneId === 'argb0')?.ledCount).toBe(72)
    expect(profile.zones.find((z) => z.zoneId === 'mainboard')?.ledCount).toBe(1)
  })

  it('gives the first zone an effect', () => {
    const profile = defaultProfile(ZONES)
    expect(profile.zones[0].effect?.patternId).toBe('rainbow')
  })
})

describe('reconcileProfile', () => {
  it('adds zones that the profile does not know about', () => {
    const reconciled = reconcileProfile(emptyProfile(), ZONES)
    expect(reconciled.zones).toHaveLength(4)
    expect(reconciled.zones.map((z) => z.zoneId)).toEqual(['mainboard', 'argb0', 'argb1', 'argb2'])
  })

  it('keeps the LED count the user configured', () => {
    const profile = emptyProfile()
    profile.zones = [
      { zoneId: 'argb0', enabled: true, ledCount: 30, effect: null, followZoneId: null }
    ]
    const reconciled = reconcileProfile(profile, ZONES)
    expect(reconciled.zones.find((z) => z.zoneId === 'argb0')?.ledCount).toBe(30)
  })

  it('gives every zone a valid effect', () => {
    const reconciled = reconcileProfile(emptyProfile(), ZONES)
    for (const zone of reconciled.zones) {
      expect(zone.effect).not.toBeNull()
      expect(zone.effect?.patternId).toBe('rainbow')
    }
  })

  it('fills in parameters that a pattern gained later', () => {
    const profile = emptyProfile()
    profile.zones = [
      {
        zoneId: 'argb0',
        enabled: true,
        ledCount: 30,
        effect: { patternId: 'wave', paletteId: 'rainbow', params: {} },
        followZoneId: null
      }
    ]
    const reconciled = reconcileProfile(profile, ZONES)
    const params = reconciled.zones.find((z) => z.zoneId === 'argb0')?.effect?.params ?? {}
    expect(params).toEqual(defaultParams('wave'))
  })

  it('does not touch a zone that follows another one', () => {
    const profile = emptyProfile()
    profile.zones = [
      {
        zoneId: 'argb1',
        enabled: true,
        ledCount: 30,
        effect: null,
        followZoneId: 'argb0'
      }
    ]
    const reconciled = reconcileProfile(profile, ZONES)
    expect(reconciled.zones.find((z) => z.zoneId === 'argb1')?.effect).toBeNull()
  })

  it('never leaves the profile without a palette', () => {
    const profile = emptyProfile()
    profile.palettes = []
    const reconciled = reconcileProfile(profile, ZONES)
    expect(reconciled.palettes.length).toBeGreaterThan(0)
  })
})

describe('ProfileStore', () => {
  it('saves and reloads a profile', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'meu perfil' })
    store.flush()

    const reopened = new ProfileStore(dir, defaultProfile())
    const loaded = reopened.load('meu perfil')
    expect(loaded.name).toBe('meu perfil')
    expect(loaded.zones).toHaveLength(4)
  })

  it('lists the saved profiles', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'perfil a' })
    store.flush()
    store.save({ ...store.profile, name: 'perfil b' })
    store.flush()
    expect(store.list()).toContain('perfil a')
    expect(store.list()).toContain('perfil b')
  })

  it('moves the file when a profile is renamed', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'antes' })
    store.flush()
    store.renameProfile('depois')
    store.flush()

    expect(store.list()).toEqual(['depois'])
  })

  it('duplicates a profile under a new name', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'original' })
    store.flush()

    const zoneCount = store.profile.zones.length
    const copy = store.duplicateProfile('copia')
    store.flush()

    expect(copy.name).toBe('copia')
    expect(copy.zones).toHaveLength(zoneCount)
    expect(store.list()).toEqual(['copia', 'original'])
  })

  it('does not share palette stops between the original and the copy', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    const original = store.profile
    const copy = store.duplicateProfile('copia')
    copy.palettes[0].stops[0].color = '#00ff00'
    expect(original.palettes[0].stops[0].color).not.toBe('#00ff00')
  })

  it('updates a single zone effect', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    const profile = store.setZoneEffect('argb1', {
      patternId: 'fire',
      paletteId: 'fire',
      params: defaultParams('fire')
    })
    expect(profile.zones.find((z) => z.zoneId === 'argb1')?.effect?.patternId).toBe('fire')
    expect(profile.zones.find((z) => z.zoneId === 'argb0')?.effect?.patternId).toBe('rainbow')
  })

  it('reassigns effects that pointed at a deleted palette', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.setPalette({
      id: 'temporaria',
      name: 'Temporária',
      interpolation: 'rgb',
      stops: [{ position: 0, color: '#ff0000' }]
    })
    store.setZoneEffect('argb0', {
      patternId: 'solid',
      paletteId: 'temporaria',
      params: defaultParams('solid')
    })

    const profile = store.removePalette('temporaria')
    const zone = profile.zones.find((z) => z.zoneId === 'argb0')
    expect(zone?.effect?.paletteId).not.toBe('temporaria')
    expect(profile.palettes.some((p) => p.id === zone?.effect?.paletteId)).toBe(true)
  })

  it('refuses to delete the last palette', () => {
    const dir = tempDir()
    const profile = emptyProfile()
    profile.palettes = [profile.palettes[0]]
    const store = new ProfileStore(dir, profile)
    expect(() => store.removePalette(store.profile.palettes[0].id)).toThrow()
  })

  it('writes to disk on flush', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'persistido' })
    store.flush()

    const reopened = new ProfileStore(dir, defaultProfile())
    expect(reopened.load('persistido').name).toBe('persistido')
  })

  it('rejects unknown zones', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    expect(() => store.setZoneEffect('inexistente', null)).toThrow()
  })
})
