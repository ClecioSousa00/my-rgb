/**
 * Profile store tests.
 *
 * The reconciliation logic decides which zones get an effect and how many
 * LEDs each one drives, so a mistake here shows up as LEDs that silently
 * stay dark.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  DEFAULT_GLOBAL,
  ProfileStore,
  defaultProfile,
  reconcileProfile,
  validateImportedProfile
} from '@main/store/profileStore'
import { SettingsStore } from '@main/store/settings'
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

  it('keeps the zones when no hardware is present', () => {
    const profile = defaultProfile(ZONES)
    profile.zones[1].name = 'Ventoinha'
    profile.zones[1].ledCount = 30

    const reconciled = reconcileProfile(profile, [])

    expect(reconciled.zones).toHaveLength(profile.zones.length)
    expect(reconciled.zones[1].name).toBe('Ventoinha')
    expect(reconciled.zones[1].ledCount).toBe(30)
    expect(reconciled.zones[1].effect?.patternId).toBe('rainbow')
  })

  it('normalises fractional and invalid LED counts to whole numbers', () => {
    const profile = emptyProfile()
    profile.zones = [
      { zoneId: 'argb0', enabled: true, ledCount: 1.5, effect: null, followZoneId: null },
      { zoneId: 'argb1', enabled: true, ledCount: Number.NaN, effect: null, followZoneId: null },
      { zoneId: 'argb2', enabled: true, ledCount: 500, effect: null, followZoneId: null }
    ]

    const reconciled = reconcileProfile(profile, ZONES)

    expect(reconciled.zones.find((z) => z.zoneId === 'argb0')?.ledCount).toBe(2)
    expect(reconciled.zones.find((z) => z.zoneId === 'argb1')?.ledCount).toBe(0)
    expect(reconciled.zones.find((z) => z.zoneId === 'argb2')?.ledCount).toBe(120)
  })
})

describe('validateImportedProfile', () => {
  it('rejects files that are not profiles', () => {
    expect(() => validateImportedProfile(null)).toThrow()
    expect(() => validateImportedProfile('perfil')).toThrow()
    expect(() => validateImportedProfile({ version: 2, zones: [], palettes: [], global: {} })).toThrow()
    expect(() => validateImportedProfile({ version: 1, palettes: [], global: {} })).toThrow()
  })

  it('repairs invalid values instead of handing them to the engine', () => {
    const profile = validateImportedProfile({
      version: 1,
      name: '  Importado  ',
      zones: [
        {
          zoneId: 'argb0',
          enabled: true,
          ledCount: 1.5,
          effect: {
            patternId: 'wave',
            paletteId: 'nao-existe',
            params: { rate: Number.NaN, width: 'largo' }
          },
          followZoneId: null
        },
        { zoneId: 'argb0', ledCount: 999 },
        { semZona: true }
      ],
      palettes: [
        {
          id: 'p1',
          name: '  ',
          interpolation: 'invalida',
          stops: [
            { position: 2, color: '#abc' },
            { position: -1, color: 'não-é-cor' }
          ]
        }
      ],
      global: {
        brightness: 2,
        speed: -1,
        fps: Number.NaN,
        outputEnabled: 'sim',
        applyToAllZones: true
      }
    })

    expect(profile.name).toBe('Importado')
    expect(profile.zones).toHaveLength(1)
    expect(profile.zones[0].ledCount).toBe(2)
    expect(profile.zones[0].effect?.paletteId).toBe('p1')
    // NaN is dropped, strings are kept for the pattern to resolve.
    expect(profile.zones[0].effect?.params).toEqual({ width: 'largo' })
    expect(profile.palettes[0].name).toBe('p1')
    expect(profile.palettes[0].interpolation).toBe('rgb')
    expect(profile.palettes[0].stops).toEqual([
      { position: 0, color: '#ff00ff' },
      { position: 1, color: '#aabbcc' }
    ])
    expect(profile.global.brightness).toBe(1)
    expect(profile.global.speed).toBe(0.05)
    expect(profile.global.fps).toBe(30)
    expect(profile.global.outputEnabled).toBe(true)
    expect(profile.global.applyToAllZones).toBe(true)
  })

  it('drops effects whose pattern no longer exists', () => {
    const profile = validateImportedProfile({
      version: 1,
      name: 'antigo',
      zones: [
        {
          zoneId: 'argb0',
          ledCount: 30,
          effect: { patternId: 'efeito-removido', paletteId: 'rainbow', params: {} },
          followZoneId: null
        }
      ],
      palettes: [{ id: 'rainbow', stops: [{ position: 0, color: '#ff0000' }] }],
      global: { brightness: 1, speed: 1, fps: 30, outputEnabled: true }
    })

    expect(profile.zones[0].effect).toBeNull()
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

  it('refuses to rename over another profile unless told to', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'perfil a' })
    store.flush()
    store.save({ ...store.profile, name: 'perfil b' })
    store.flush()

    expect(() => store.renameProfile('perfil a')).toThrow()
    expect(store.list()).toEqual(['perfil a', 'perfil b'])

    const renamed = store.renameProfile('perfil a', true)
    store.flush()
    expect(renamed.name).toBe('perfil a')
    expect(store.list()).toEqual(['perfil a'])
  })

  it('suggests the first free name for an import', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'Gamer' })
    store.flush()
    store.save({ ...store.profile, name: 'Gamer (2)' })
    store.flush()

    expect(store.availableName('Gamer')).toBe('Gamer (3)')
    expect(store.availableName('Novo')).toBe('Novo')
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

  it('lists names with accents as they were typed, not as file names', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'Padrão' })
    store.flush()

    expect(store.list()).toEqual(['Padrão'])

    const reopened = new ProfileStore(dir, defaultProfile())
    expect(reopened.load('Padrão').name).toBe('Padrão')
    // The sanitised file identifier still works for older callers.
    expect(reopened.load('Padr_o').name).toBe('Padrão')
  })

  it('renames a profile with accents without leaving the old file behind', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'Padrão' })
    store.flush()

    store.renameProfile('Coração')
    store.flush()

    expect(store.list()).toEqual(['Coração'])
    const reopened = new ProfileStore(dir, defaultProfile())
    expect(reopened.load('Coração').name).toBe('Coração')
  })

  it('normalises the LED count when a zone is configured', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))

    store.setZoneConfig('argb0', { ledCount: 1.5 })
    expect(store.profile.zones.find((z) => z.zoneId === 'argb0')?.ledCount).toBe(2)

    store.setZoneConfig('argb1', { ledCount: Number.NaN })
    expect(store.profile.zones.find((z) => z.zoneId === 'argb1')?.ledCount).toBe(0)

    store.setZoneConfig('argb2', { ledCount: -7 })
    expect(store.profile.zones.find((z) => z.zoneId === 'argb2')?.ledCount).toBe(0)
  })

  it('rejects unknown zones', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    expect(() => store.setZoneEffect('inexistente', null)).toThrow()
  })

  it('keeps the name the user gave to a zone', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.setZoneConfig('argb0', { name: 'Frente da caixa' })
    store.flush()

    const reopened = new ProfileStore(dir, defaultProfile())
    const loaded = reopened.load('Padrão')
    expect(loaded.zones.find((z) => z.zoneId === 'argb0')?.name).toBe('Frente da caixa')
  })

  it('keeps the zone name when the profile is reconciled with the hardware', () => {
    const profile = defaultProfile(ZONES)
    profile.zones[1].name = 'Ventoinha'
    const reconciled = reconcileProfile(profile, ZONES)
    expect(reconciled.zones.find((z) => z.zoneId === 'argb0')?.name).toBe('Ventoinha')
  })

  it('copies one zone effect to every other zone', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.setZoneEffect('argb0', {
      patternId: 'wave',
      paletteId: store.profile.palettes[1].id,
      params: { rate: 2, wavelength: 4 }
    })
    store.setZoneConfig('argb2', { ledCount: 30, enabled: false })

    const profile = store.applyEffectToAll('argb0')

    for (const zone of profile.zones) {
      expect(zone.effect?.patternId).toBe('wave')
      expect(zone.effect?.paletteId).toBe(store.profile.palettes[1].id)
      expect(zone.effect?.params).toEqual({ rate: 2, wavelength: 4 })
    }
  })

  it('keeps the LED count and the on/off switch of each zone when applying to all', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.setZoneConfig('argb2', { ledCount: 30, enabled: false })

    const profile = store.applyEffectToAll('argb0')
    const target = profile.zones.find((z) => z.zoneId === 'argb2')

    expect(target?.ledCount).toBe(30)
    expect(target?.enabled).toBe(false)
  })

  it('breaks the "follow another zone" link when applying to all', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.setZoneConfig('argb1', { followZoneId: 'mainboard' })

    const profile = store.applyEffectToAll('argb0')

    for (const zone of profile.zones) {
      expect(zone.followZoneId).toBeNull()
    }
  })

  it('refuses to apply to all when the zone has no effect', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.setZoneEffect('argb0', null)
    expect(() => store.applyEffectToAll('argb0')).toThrow()
  })
})

describe('ProfileStore delete', () => {
  it('switches to another saved profile when the current one is deleted', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'Gamer' })
    store.flush()
    store.save({ ...store.profile, name: 'Estudo' })
    store.flush()

    const profile = store.delete('Estudo')

    expect(profile.name).toBe('Gamer')
    expect(store.profile.name).toBe('Gamer')
    expect(store.list()).toEqual(['Gamer'])
    expect(existsSync(join(dir, 'profiles', 'Estudo.json'))).toBe(false)
  })

  it('keeps the hardware zones when the last profile is deleted', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.setZoneConfig('argb0', { ledCount: 42, name: 'Fita' })
    store.flush()

    const profile = store.delete(store.profile.name)

    // Falling back to a zoneless profile would silently wipe the layout.
    expect(profile.zones).toHaveLength(ZONES.length)
    expect(profile.zones.find((z) => z.zoneId === 'argb0')?.ledCount).toBe(42)
    expect(profile.name).toBe('Padrão')
    expect(store.list()).toEqual(['Padrão'])
  })

  it('leaves the current profile alone when another one is deleted', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    store.save({ ...store.profile, name: 'Gamer' })
    store.flush()
    store.save({ ...store.profile, name: 'Estudo' })
    store.flush()

    const profile = store.delete('Gamer')

    expect(profile.name).toBe('Estudo')
    expect(store.profile.name).toBe('Estudo')
    expect(store.list()).toEqual(['Estudo'])
  })

  it('reports a profile that does not exist', () => {
    const dir = tempDir()
    const store = new ProfileStore(dir, defaultProfile(ZONES))
    expect(() => store.delete('nao-existe')).toThrow()
  })
})

describe('write failures', () => {
  it('reports a profile write error instead of crashing', () => {
    const dir = tempDir()
    // A file where the profiles directory should be makes every write fail.
    writeFileSync(join(dir, 'profiles'), 'nao é um diretório')
    const errors: string[] = []
    const store = new ProfileStore(dir, defaultProfile(ZONES), {
      onError: (message) => errors.push(message)
    })

    expect(() => store.flush()).not.toThrow()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('perfil')
  })

  it('reports a settings write error instead of crashing', () => {
    const dir = tempDir()
    // A directory where settings.json should be makes the write fail.
    mkdirSync(join(dir, 'settings.json'))
    const errors: string[] = []
    const settings = new SettingsStore(dir, (message) => errors.push(message))

    expect(() => settings.set({ lastProfile: 'Outro' })).not.toThrow()
    expect(settings.settings.lastProfile).toBe('Outro')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('configurações')
  })
})
