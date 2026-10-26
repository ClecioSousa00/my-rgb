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
  ParamValue,
  Profile,
  ZoneConfig,
  ZoneState
} from '@shared/types'
import { BUILTIN_PALETTES, hexToRgb, rgbToHex } from '../engine/palette'
import { defaultParams, getPattern } from '../engine/patterns'

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

/**
 * Turn a profile name into the file name used on disk.
 *
 * Accents and other characters that are not safe in a file name become "_"
 * here. The file name is only an identifier: the profile keeps the real name
 * inside the JSON, and that is what the UI shows.
 */
export function profileFileId(name: string): string {
  return sanitize(name)
}

/**
 * LED counts must be whole, finite numbers. A fractional count reaches the
 * engine and `new Array(1.5)` throws `RangeError`, taking the whole main
 * process down.
 */
export function normalizeLedCount(value: unknown, max = Number.POSITIVE_INFINITY): number {
  const count = Math.round(Number(value))
  if (!Number.isFinite(count)) return 0
  const limit = Number.isFinite(max) ? Math.max(0, Math.round(max)) : Number.POSITIVE_INFINITY
  return Math.max(0, Math.min(count, limit))
}

/** Deep copy of the built-in palettes, so callers can edit them freely. */
function copyBuiltinPalettes(): Palette[] {
  return BUILTIN_PALETTES.map((p) => ({ ...p, stops: p.stops.map((s) => ({ ...s })) }))
}

const HEX_COLOR = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * Validate a profile imported from a file.
 *
 * The file comes from outside the app, so nothing in it can be trusted: an
 * invalid `global`, a NaN LED count or a pattern that no longer exists would
 * reach the engine and break it. Structurally invalid files are rejected;
 * single bad values are repaired or dropped.
 */
export function validateImportedProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Arquivo de perfil inválido')
  }
  const raw = value as Partial<Profile> & Record<string, unknown>
  if (raw.version !== 1) throw new Error('Versão de perfil não suportada')
  if (!Array.isArray(raw.palettes)) throw new Error('Perfil sem paletas')
  if (!Array.isArray(raw.zones)) throw new Error('Perfil sem zonas')
  if (!raw.global || typeof raw.global !== 'object') throw new Error('Perfil sem opções globais')

  const palettes = sanitizePalettes(raw.palettes)
  const paletteIds = new Set(palettes.map((p) => p.id))
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Importado'

  return {
    version: 1,
    name,
    zones: sanitizeZones(raw.zones, paletteIds, palettes[0].id),
    palettes,
    global: sanitizeGlobal(raw.global)
  }
}

function sanitizePalettes(input: unknown[]): Palette[] {
  const result: Palette[] = []
  const ids = new Set<string>()

  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const palette = item as Partial<Palette>
    if (typeof palette.id !== 'string' || !palette.id || ids.has(palette.id)) continue
    if (!Array.isArray(palette.stops)) continue

    const stops = palette.stops
      .filter((stop): stop is { position: number; color: string } => {
        if (!stop || typeof stop !== 'object') return false
        return Number.isFinite(Number(stop.position)) && typeof stop.color === 'string'
      })
      .map((stop) => ({
        position: Math.min(1, Math.max(0, Number(stop.position))),
        // Repair odd colours (3 digits, missing #) and drop anything that is
        // not a colour at all instead of handing it to the CSS/engine.
        color: HEX_COLOR.test(stop.color) ? rgbToHex(hexToRgb(stop.color)) : '#ff00ff'
      }))
      .sort((a, b) => a.position - b.position)

    if (stops.length === 0) continue

    result.push({
      id: palette.id,
      name:
        typeof palette.name === 'string' && palette.name.trim()
          ? palette.name.trim()
          : palette.id,
      interpolation: palette.interpolation === 'hsv' ? 'hsv' : 'rgb',
      stops
    })
    ids.add(palette.id)
  }

  return result.length > 0 ? result : copyBuiltinPalettes()
}

function sanitizeZones(
  input: unknown[],
  paletteIds: Set<string>,
  fallbackPaletteId: string
): ZoneConfig[] {
  const result: ZoneConfig[] = []
  const ids = new Set<string>()

  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const zone = item as Partial<ZoneConfig>
    if (typeof zone.zoneId !== 'string' || !zone.zoneId || ids.has(zone.zoneId)) continue
    ids.add(zone.zoneId)

    const name = typeof zone.name === 'string' ? zone.name.trim() : ''
    result.push({
      zoneId: zone.zoneId,
      enabled: typeof zone.enabled === 'boolean' ? zone.enabled : true,
      ledCount: normalizeLedCount(zone.ledCount),
      ...(name ? { name } : {}),
      effect: sanitizeEffect(zone.effect, paletteIds, fallbackPaletteId),
      followZoneId:
        typeof zone.followZoneId === 'string' && zone.followZoneId ? zone.followZoneId : null
    })
  }

  return result
}

function sanitizeEffect(
  value: unknown,
  paletteIds: Set<string>,
  fallbackPaletteId: string
): EffectDefinition | null {
  if (!value || typeof value !== 'object') return null
  const effect = value as Partial<EffectDefinition>
  if (typeof effect.patternId !== 'string' || !getPattern(effect.patternId)) return null

  const params: Record<string, ParamValue> = {}
  if (effect.params && typeof effect.params === 'object') {
    for (const [key, param] of Object.entries(effect.params)) {
      if (typeof param === 'boolean' || typeof param === 'string') {
        params[key] = param
      } else if (typeof param === 'number' && Number.isFinite(param)) {
        params[key] = param
      }
    }
  }

  return {
    patternId: effect.patternId,
    paletteId:
      typeof effect.paletteId === 'string' && paletteIds.has(effect.paletteId)
        ? effect.paletteId
        : fallbackPaletteId,
    params
  }
}

function sanitizeGlobal(value: object): GlobalSettings {
  const global = value as Partial<GlobalSettings>
  const brightness = Number(global.brightness)
  const speed = Number(global.speed)
  const fps = Number(global.fps)

  return {
    brightness: Number.isFinite(brightness) ? Math.min(1, Math.max(0, brightness)) : 1,
    speed: Number.isFinite(speed) ? Math.max(0.05, Math.min(10, speed)) : 1,
    fps: Number.isFinite(fps) ? Math.max(1, Math.min(240, Math.round(fps))) : 30,
    outputEnabled: typeof global.outputEnabled === 'boolean' ? global.outputEnabled : true,
    applyToAllZones: global.applyToAllZones === true
  }
}

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
  // No hardware layout means there is nothing to reconcile. Clearing the
  // zones here would erase the user's profile - names, effects, LED counts -
  // whenever the controller is unplugged or the udev rule is missing.
  const zoneConfigs: ZoneConfig[] =
    zones.length === 0
      ? profile.zones.map((zone) => ({
          ...zone,
          effect: zone.effect ? { ...zone.effect, params: { ...zone.effect.params } } : null
        }))
      : zones.map((zone) => {
          const existing = profile.zones.find((z) => z.zoneId === zone.id)
          if (existing) {
            return {
              ...existing,
              ledCount: normalizeLedCount(existing.ledCount, zone.maxLedCount)
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

  const next: Profile = { ...profile, zones: zoneConfigs }

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

  /** Load a profile by name (or file id), or the last used one. */
  load(id?: string): Profile {
    const target = id ? this.resolvePath(id) : this.lastUsedPath()
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

  /** Names shown in the profile selector, read from the JSON, not the file name. */
  list(): string[] {
    if (!existsSync(this.dir)) return []
    const names: string[] = []
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue
      const fallback = file.slice(0, -5)
      const full = join(this.dir, file)
      try {
        const parsed = JSON.parse(readFileSync(full, 'utf8')) as Partial<Profile>
        const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
        names.push(name || fallback)
      } catch {
        // A damaged file still has a name on disk; show it instead of hiding it.
        names.push(fallback)
      }
    }
    return names.sort()
  }

  save(profile: Profile): Profile {
    this.current = profile
    this.writeCurrent()
    return this.current
  }

  delete(id: string): void {
    const path = this.resolvePath(id)
    const currentPath = this.pathFor(this.current.name)
    if (path && existsSync(path)) unlinkSync(path)
    if (path && this.writtenPath === path) this.writtenPath = null
    if (id === this.current.name || path === currentPath) {
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
    const next = { ...patch }
    if (next.ledCount !== undefined) {
      // The number input can produce 1.5 or NaN; keep the profile (and the
      // engine) on whole LED counts only.
      next.ledCount = normalizeLedCount(next.ledCount)
    }
    Object.assign(zone, next)
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
   * First name not used by an existing profile: "X", "X (2)", "X (3)"...
   * Used when importing a file whose name is already taken.
   */
  availableName(base: string): string {
    const clean = base.trim() || 'Perfil'
    const names = new Set(this.list())
    if (!names.has(clean)) return clean
    for (let i = 2; i < 1000; i++) {
      const candidate = `${clean} (${i})`
      if (!names.has(candidate)) return candidate
    }
    return `${clean} ${Date.now()}`
  }

  /**
   * Rename the current profile.
   *
   * The file moves with it, so the profile list does not end up holding a
   * stale copy under the old name. An existing profile is never overwritten
   * unless the caller explicitly says so (the UI asks the user first).
   */
  renameProfile(newName: string, overwrite = false): Profile {
    const oldName = this.current.name
    const name = newName.trim()
    if (!name || name === oldName) return this.current

    const oldPath = this.writtenPath ?? this.resolvePath(oldName)
    const targetPath = this.pathFor(name)
    if (!overwrite && targetPath !== oldPath && existsSync(targetPath)) {
      throw new Error(`Já existe um perfil chamado "${name}".`)
    }

    if (oldPath && existsSync(oldPath)) unlinkSync(oldPath)
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
    const file = this.pathFor(this.current.name)
    writeFileSync(file, JSON.stringify(this.current, null, 2), 'utf8')
    this.writtenPath = file
    // The UI shows a "saved" indicator, so it has to know when the disk was
    // really written - not when the change was made.
    this.onSaved?.(this.current.name)
  }

  /**
   * Resolve a profile name to its file.
   *
   * The direct hit covers both the sanitised file id ("Padr_o" for "Padrão")
   * and names that need no sanitising. The scan adds two fallbacks: old files
   * are also addressable by their raw file name, and profiles whose file was
   * renamed by hand still load by the name stored inside the JSON.
   */
  private resolvePath(id: string): string | null {
    const direct = this.pathFor(id)
    if (existsSync(direct)) return direct
    if (!existsSync(this.dir)) return null

    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue
      if (file.slice(0, -5) === id) return join(this.dir, file)
      try {
        const parsed = JSON.parse(readFileSync(join(this.dir, file), 'utf8')) as Partial<Profile>
        if (parsed.name === id) return join(this.dir, file)
      } catch {
        /* ignore damaged files here; load() reports them */
      }
    }
    return null
  }

  private pathFor(id: string): string {
    return join(this.dir, `${profileFileId(id)}.json`)
  }

  private lastUsedPath(): string | null {
    return this.resolvePath(this.current.name) ?? this.pathFor(this.current.name)
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '_').trim() || 'profile'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
