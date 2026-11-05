/**
 * Lighting targets and backends.
 *
 * A target is one addressable piece of hardware: the on-board LEDs of an ASUS
 * controller, one ARGB header, a Razer keyboard, a Corsair fan hub. Until now
 * the app had exactly one backend (the AURA USB controller), so the profile's
 * zone id and the hardware channel were the same thing. The target makes that
 * separation explicit without changing anything that already exists:
 *
 *   - `ZoneConfig.zoneId` keeps the short AURA ids ("argb0", "mainboard"),
 *     which is what saved profiles and the UI already use.
 *   - The target id is the qualified name ("aura:argb0"), stable across
 *     backends and usable as an input id in the lighting router.
 *   - A profile without `targets` (every profile written before this existed)
 *     gets them synthesized from the hardware layout, so it opens unchanged.
 *
 * `enabled` describes the target, not the effect: a zone switched off in the
 * profile is still written, in black, so the LEDs actually go dark. That is
 * why every AURA target derived from a real device is enabled.
 */

import type { ZoneConfig, ZoneState } from '../types'

export type LightBackendId = 'aura' | 'openrgb' | 'razer' | 'corsair'

/** Backends the router knows how to register, in the order the UI lists them. */
export const LIGHT_BACKENDS: LightBackendId[] = ['aura', 'openrgb', 'razer', 'corsair']

/** Human name of each backend, for chips and messages. */
export const LIGHT_BACKEND_LABEL: Record<LightBackendId, string> = {
  aura: 'ASUS AURA',
  openrgb: 'OpenRGB',
  razer: 'Razer Chroma',
  corsair: 'Corsair iCUE'
}

export interface LightTarget {
  /** Backend-qualified id, e.g. `aura:argb0`, `openrgb:0:2`, `razer:keyboard`. */
  id: string
  backend: LightBackendId
  /** Physical device the target belongs to. AURA always uses `aura`. */
  deviceId: string
  /**
   * Backend-specific address of the zone inside the device.
   *
   * For AURA this is the direct channel of the controller (0..n for the
   * addressable headers, 4 for the on-board LEDs), which is exactly what the
   * HID packet carries.
   */
  zoneIndex: number
  /** What the user sees: the custom zone name, or the hardware name. */
  label: string
  ledCount: number
  /** Whether the target is part of the output at all. */
  enabled: boolean
}

/** The AURA controller is one device, so its targets share this id. */
export const AURA_DEVICE_ID = 'aura'

const AURA_PREFIX = 'aura:'

export function auraTargetId(zoneId: string): string {
  return `${AURA_PREFIX}${zoneId}`
}

export function isAuraTarget(targetId: string): boolean {
  return targetId.startsWith(AURA_PREFIX)
}

/** Zone id (as stored in the profile) inside an AURA target id. */
export function auraZoneId(targetId: string): string {
  return isAuraTarget(targetId) ? targetId.slice(AURA_PREFIX.length) : targetId
}

/**
 * Profile id used to look a target up.
 *
 * AURA keeps the short id it always had; a target from another backend uses
 * its full id, which cannot collide with a hardware zone name.
 */
export function configIdForTarget(target: LightTarget): string {
  return target.backend === 'aura' ? auraZoneId(target.id) : target.id
}

/** Inverse of `configIdForTarget`, for the engine's zone ids. */
export function targetIdForConfigId(configId: string): string {
  return configId.includes(':') ? configId : auraTargetId(configId)
}

/** One AURA target per hardware zone, with the profile's name and LED count. */
export function auraTargetsFromZones(zones: ZoneState[], configs: ZoneConfig[]): LightTarget[] {
  return zones.map((zone) => {
    const config = findConfig(configs, auraTargetId(zone.id)) ?? findConfig(configs, zone.id)
    const name = config?.name?.trim()
    return {
      id: auraTargetId(zone.id),
      backend: 'aura',
      deviceId: AURA_DEVICE_ID,
      zoneIndex: zone.directChannel,
      label: name ? name : zone.label,
      ledCount: ledCountOf(config?.ledCount, zone.ledCount),
      // A zone present in the layout is always addressable; the on/off switch
      // lives in the profile, not in the target.
      enabled: true
    }
  })
}

/**
 * Replace the AURA targets with freshly derived ones, keeping the targets of
 * other backends. Order follows the hardware, which is the order the UI uses.
 */
export function mergeTargets(
  existing: LightTarget[] | undefined,
  derived: LightTarget[]
): LightTarget[] {
  // A profile edited by hand can carry anything in `targets`; a damaged field
  // must not take the main process down, so only a real array is trusted.
  const kept = Array.isArray(existing) ? existing : []
  const others = kept.filter((target) => target?.backend !== 'aura')
  return [...derived, ...others]
}

/**
 * Refresh the label and LED count of the AURA targets from the profile.
 *
 * Called after every save: the zone configs own those two values, and a
 * profile that carries a stale pair would be wrong as soon as it is exported.
 * Targets of other backends are left alone - their zone list comes from the
 * backend, not from the profile.
 */
export function syncAuraTargets(targets: LightTarget[], configs: ZoneConfig[]): LightTarget[] {
  if (!Array.isArray(targets)) return []
  let changed = false

  const next = targets.map((target) => {
    if (target.backend !== 'aura') return target
    const config = findConfig(configs, target.id) ?? findConfig(configs, auraZoneId(target.id))
    if (!config) return target

    const name = config.name?.trim()
    const ledCount = ledCountOf(config.ledCount, target.ledCount)
    const label = name ? name : target.label
    if (ledCount === target.ledCount && label === target.label) return target

    changed = true
    return { ...target, ledCount, label }
  })

  return changed ? next : targets
}

function findConfig(configs: ZoneConfig[], id: string): ZoneConfig | undefined {
  return configs.find((config) => config.zoneId === id)
}

function ledCountOf(value: unknown, fallback: number): number {
  const count = Math.round(Number(value))
  if (!Number.isFinite(count)) return Math.max(0, Math.round(Number(fallback) || 0))
  return Math.max(0, count)
}
