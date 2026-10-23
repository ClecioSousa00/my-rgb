/**
 * Profile persistence.
 *
 * Profiles are plain JSON files with a single schema, stored under the
 * Electron userData folder. The exact same file format is used on Linux and
 * on Windows, so a profile can be copied between them.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type {
  EffectDefinition,
  GlobalSettings,
  Palette,
  Profile,
  ZoneConfig,
  ZoneState
} from '@shared/types'
import { BUILTIN_PALETTES } from '../engine/palette'
import { defaultParams } from '../engine/patterns'

export const DEFAULT_GLOBAL: GlobalSettings = {
  brightness: 1,
  speed: 1,
  fps: 30,
  outputEnabled: true,
  applyToAllZones: false
}

/** Default LED count for an addressable header. */
export const DEFAULT_HEADER_LEDS = 72

/** How long to wait before writing the profile to disk. */
const WRITE_DEBOUNCE_MS = 150

export function defaultProfile(zones: ZoneState[] = []): Profile {
  // Every zone starts with the same effect, matching what reconcileProfile
  // does for zones that have none yet.
  const zoneConfigs: ZoneConfig[] = zones.map((zone) => ({
    zoneId: zone.id,
    enabled: true,
    ledCount: zone.kind === 'addressable' ? DEFAULT_HEADER_LEDS : zone.maxLedCount,
    effect: {
      patternId: 'rainbow',
      paletteId: BUILTIN_PALETTES[0].id,
      params: defaultParams('rainbow')
    },
    followZoneId: null
  }))

  return {
    version: 1,
    name: 'Padrão',
    zones: zoneConfigs,
    palettes: BUILTIN_PALETTES.map((p) => ({ ...p, stops: p.stops.map((s) => ({ ...s })) })),
    global: { ...DEFAULT_GLOBAL }
  }
}

/**
 * Ensure the profile describes every zone the hardware exposes, and that
 * every zone has an effect. Called after the device is opened and whenever
 * the layout changes.
 */
export function reconcileProfile(profile: Profile, zones: ZoneState[]): Profile {
  const next: Profile = {
    ...profile,
    zones: zones.map((zone) => {
      const existing = profile.zones.find((z) => z.zoneId === zone.id)
      if (existing) {
        return {
          ...existing,
          ledCount: Math.max(
            0,
            Math.min(existing.ledCount || 0, zone.maxLedCount) || existing.ledCount || 0
          )
        }
      }
      return {
        zoneId: zone.id,
        enabled: true,
        ledCount: zone.kind === 'addressable' ? DEFAULT_HEADER_LEDS : zone.maxLedCount,
        effect: null,
        followZoneId: null
      }
    })
  }

  // Every zone gets a valid effect, so switching one on later shows something
  // sensible straight away.
  for (const zone of next.zones) {
    if (zone.followZoneId) continue
    if (!zone.effect || !zone.effect.patternId) {
      zone.effect = {
        patternId: 'rainbow',
        paletteId: next.palettes[0]?.id ?? '',
        params: defaultParams('rainbow')
      }
    } else {
      zone.effect.params = { ...defaultParams(zone.effect.patternId), ...zone.effect.params }
    }
  }

  // Make sure at least one palette exists.
  if (next.palettes.length === 0) {
    next.palettes = BUILTIN_PALETTES.map((p) => ({ ...p, stops: p.stops.map((s) => ({ ...s })) }))
  }

  return next
}

export class ProfileStore {
  private readonly dir: string
  private current: Profile
  private writeTimer: NodeJS.Timeout | null = null
  /** Path of the file this store last wrote to. */
  private writtenPath: string | null = null
  /** Called after every successful write to disk. */
  private readonly onSaved: ((name: string) => void) | null

  constructor(userDataPath: string, initial: Profile, onSaved?: (name: string) => void) {
    this.dir = join(userDataPath, 'profiles')
    this.current = initial
    this.onSaved = onSaved ?? null
  }

  get profile(): Profile {
    return this.current
  }

  /** Load a profile by id, or the last used one. */
  load(id?: string): Profile {
    const target = id ? this.pathFor(id) : this.lastUsedPath()
    if (target && existsSync(target)) {
      try {
        const parsed = JSON.parse(readFileSync(target, 'utf8')) as Profile
        if (parsed && parsed.version === 1) {
          this.current = parsed
          this.writeCurrent()
        }
      } catch (err) {
        throw new Error(`Could not read profile: ${errorMessage(err)}`)
      }
    }
    return this.current
  }

  list(): string[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .sort()
  }

  save(profile: Profile): Profile {
    this.current = profile
    this.writeCurrent()
    return this.current
  }

  delete(id: string): void {
    const path = this.pathFor(id)
    if (existsSync(path)) unlinkSync(path)
    if (this.writtenPath === path) this.writtenPath = null
    if (this.current.name === id) {
      this.current = defaultProfile()
      this.writeCurrent()
    }
  }

  /** Replace the effect of one zone. */
  setZoneEffect(zoneId: string, effect: EffectDefinition | null): Profile {
    const zone = this.current.zones.find((z) => z.zoneId === zoneId)
    if (!zone) throw new Error(`Unknown zone: ${zoneId}`)
    const next = effect ? { ...effect, params: { ...effect.params } } : null

    if (this.current.global?.applyToAllZones && this.current.zones.length > 1) {
      for (const z of this.current.zones) {
        z.effect = next ? { ...next, params: { ...next.params } } : null
        z.followZoneId = null
      }
      return this.save(this.current)
    }

    zone.effect = next
    return this.save(this.current)
  }

  setZoneConfig(zoneId: string, patch: Partial<ZoneConfig>): Profile {
    const zone = this.current.zones.find((z) => z.zoneId === zoneId)
    if (!zone) throw new Error(`Unknown zone: ${zoneId}`)
    Object.assign(zone, patch)
    return this.save(this.current)
  }

  /**
   * Copy one zone's effect to every other zone.
   *
   * The LED count and the on/off switch of each zone are left alone - they
   * describe the hardware, not the effect. The "follow another zone" link is
   * cleared, because a zone that mirrors someone else would ignore the copy.
   */
  applyEffectToAll(sourceZoneId: string): Profile {
    const source = this.current.zones.find((z) => z.zoneId === sourceZoneId)
    if (!source) throw new Error(`Unknown zone: ${sourceZoneId}`)
    if (!source.effect) throw new Error(`Zone ${sourceZoneId} has no effect to copy`)

    const effect: EffectDefinition = {
      ...source.effect,
      params: { ...source.effect.params }
    }

    for (const zone of this.current.zones) {
      zone.effect = { ...effect, params: { ...effect.params } }
      zone.followZoneId = null
    }

    return this.save(this.current)
  }

  setPalette(palette: Palette): Profile {
    const index = this.current.palettes.findIndex((p) => p.id === palette.id)
    if (index >= 0) this.current.palettes[index] = palette
    else this.current.palettes.push(palette)
    return this.save(this.current)
  }

  removePalette(paletteId: string): Profile {
    if (this.current.palettes.length <= 1) {
      throw new Error('At least one palette is required')
    }
    this.current.palettes = this.current.palettes.filter((p) => p.id !== paletteId)
    // Point effects that used it at the first remaining palette.
    const fallback = this.current.palettes[0].id
    for (const zone of this.current.zones) {
      if (zone.effect && zone.effect.paletteId === paletteId) {
        zone.effect.paletteId = fallback
      }
    }
    return this.save(this.current)
  }

  setGlobal(patch: Partial<GlobalSettings>): Profile {
    this.current.global = { ...this.current.global, ...patch }
    return this.save(this.current)
  }

  /**
   * Copy the current profile under a new name.
   *
   * The copy becomes the current profile, so the user can go on editing it
   * without touching the original.
   */
  duplicateProfile(newName: string): Profile {
    const name = newName.trim() || `${this.current.name} cópia`
    const copy: Profile = {
      ...this.current,
      name,
      zones: this.current.zones.map((z) => ({
        ...z,
        effect: z.effect
          ? { ...z.effect, params: { ...z.effect.params } }
          : null
      })),
      palettes: this.current.palettes.map((p) => ({
        ...p,
        stops: p.stops.map((s) => ({ ...s }))
      })),
      global: { ...this.current.global }
    }
    return this.save(copy)
  }

  /**
   * Rename the current profile.
   *
   * The file moves with it, so the profile list does not end up holding a
   * stale copy under the old name.
   */
  renameProfile(newName: string): Profile {
    const oldName = this.current.name
    const name = newName.trim()
    if (!name || name === oldName) return this.current

    const oldPath = this.pathFor(oldName)
    if (existsSync(oldPath)) unlinkSync(oldPath)
    if (this.writtenPath === oldPath) this.writtenPath = null

    this.current = { ...this.current, name }
    return this.save(this.current)
  }

  private writeCurrent(): void {
    // Dragging a slider fires dozens of changes per second. Debounce the disk
    // write so the profile is persisted once the user settles.
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      this.writeNow()
    }, WRITE_DEBOUNCE_MS)
  }

  /** Write the profile to disk right now, cancelling any pending write. */
  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    this.writeNow()
  }

  private writeNow(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    const file = join(this.dir, `${sanitize(this.current.name)}.json`)
    writeFileSync(file, JSON.stringify(this.current, null, 2), 'utf8')
    this.writtenPath = file
    // The UI shows a "saved" indicator, so it has to know when the disk was
    // really written - not when the change was made.
    this.onSaved?.(this.current.name)
  }

  private pathFor(id: string): string {
    return join(this.dir, `${sanitize(id)}.json`)
  }

  private lastUsedPath(): string {
    return this.pathFor(this.current.name)
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '_').trim() || 'profile'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
