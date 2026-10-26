/**
 * Renderer state.
 *
 * Frames arrive at the engine's frame rate (30-60 fps), so they are kept
 * outside React's render cycle: the store notifies subscribers directly and
 * the preview canvas paints itself. React only re-renders when something the
 * user actually sees changes.
 */

import { create } from 'zustand'
import type {
  DeviceInfo,
  EffectDefinition,
  Frame,
  GlobalSettings,
  Palette,
  ParamValue,
  PatternMeta,
  Profile,
  ZoneConfig,
  ZoneState
} from '@shared/types'

type FrameListener = (frame: Frame) => void

const frameListeners = new Set<FrameListener>()

/** Subscribe to raw frames, outside of React. */
export function subscribeFrames(listener: FrameListener): () => void {
  frameListeners.add(listener)
  return () => {
    frameListeners.delete(listener)
  }
}

interface AppState {
  device: DeviceInfo | null
  zones: ZoneState[]
  patterns: PatternMeta[]
  profile: Profile | null
  selectedZoneId: string
  engineRunning: boolean
  ready: boolean
  error: string | null
  /** True while there are changes that are not on disk yet. */
  dirty: boolean

  init(): Promise<void>
  selectZone(zoneId: string): void
  setZoneEffect(zoneId: string, effect: EffectDefinition | null): Promise<void>
  setZoneConfig(zoneId: string, patch: Partial<ZoneConfig>): Promise<void>
  applyToAll(): Promise<void>
  setPalette(palette: Palette): Promise<void>
  removePalette(paletteId: string): Promise<void>
  setGlobal(patch: Partial<GlobalSettings>): Promise<void>
  loadProfile(id: string): Promise<void>
  saveProfile(profile: Profile): Promise<void>
  duplicateProfile(name: string): Promise<void>
  renameProfile(name: string, overwrite?: boolean): Promise<void>
  exportProfile(): Promise<string | null>
  importProfile(): Promise<Profile | null>
  toggleEngine(): Promise<void>
  reconnect(): Promise<void>
}

/**
 * Mutations that are still on their way to the main process.
 *
 * The main process writes the profile to disk a moment after the change, so a
 * "saved" event that arrives while a mutation is still in flight must not
 * clear the dirty flag.
 */
let pendingMutations = 0

export const useApp = create<AppState>((set, get) => ({
  device: null,
  zones: [],
  patterns: [],
  profile: null,
  selectedZoneId: '',
  engineRunning: false,
  ready: false,
  error: null,
  dirty: false,

  async init() {
    try {
      const [device, zones, patterns, profile, engineState] = await Promise.all([
        window.myrgb.getDeviceInfo(),
        window.myrgb.listZones(),
        window.myrgb.listPatterns(),
        window.myrgb.getProfile(),
        window.myrgb.getEngineState()
      ])

      set({
        device,
        zones,
        patterns,
        profile,
        engineRunning: engineState.running,
        selectedZoneId: zones[0]?.id ?? '',
        ready: true,
        error: device.connected ? null : (device.error ?? 'Dispositivo não encontrado')
      })

      // The self test waits for this instead of a fixed delay, so a slow
      // start (an AppImage mounting, for instance) is not mistaken for a
      // broken UI.
      ;(window as unknown as { __myRgbReady?: boolean }).__myRgbReady = true

      window.myrgb.onFrame((frame) => {
        // Counted so the self test can prove frames are really flowing.
        const w = window as unknown as { __myRgbFrameCount?: number }
        w.__myRgbFrameCount = (w.__myRgbFrameCount ?? 0) + 1
        for (const listener of frameListeners) listener(frame)
      })
      window.myrgb.onProfileChange((next) => set({ profile: next }))
      window.myrgb.onProfileSaved(() => {
        // Only trust the event when nothing else is being changed right now.
        if (pendingMutations === 0) set({ dirty: false })
      })
      window.myrgb.onEngineState((state) =>
        set({
          engineRunning: state.running,
          // Engine write errors (unplugged cable, busy device) must reach the
          // banner; a null error only means "no new error".
          ...(state.error ? { error: state.error } : {})
        })
      )
      // The conflict with another program can start at any time, so the
      // device status has to be pushed rather than only read once.
      window.myrgb.onDeviceChange((info) => {
        const wasConnected = get().device?.connected ?? false
        set({ device: info })
        if (wasConnected === info.connected) return

        // Plugged or unplugged: the zone list and the reconciled profile
        // changed too, so pull them instead of leaving a stale UI.
        void Promise.all([window.myrgb.listZones(), window.myrgb.getProfile()])
          .then(([zones, profile]) => {
            set((prev) => ({
              zones,
              profile,
              selectedZoneId: zones.some((z) => z.id === prev.selectedZoneId)
                ? prev.selectedZoneId
                : (zones[0]?.id ?? ''),
              error: info.connected ? null : (info.error ?? 'Dispositivo não encontrado')
            }))
          })
          .catch((err) => set({ error: errorMessage(err) }))
      })
    } catch (err) {
      set({ error: errorMessage(err), ready: true })
      ;(window as unknown as { __myRgbReady?: boolean }).__myRgbReady = true
    }
  },

  selectZone(zoneId) {
    set({ selectedZoneId: zoneId })
  },

  async setZoneEffect(zoneId, effect) {
    const profile = await mutate(set, () => window.myrgb.setZoneEffect(zoneId, effect))
    set({ profile })
  },

  async setZoneConfig(zoneId, patch) {
    const profile = await mutate(set, () => window.myrgb.setZoneConfig(zoneId, patch))
    set({ profile })
  },

  /** Copy the effect of the zone being edited to every other zone. */
  async applyToAll() {
    const zoneId = get().selectedZoneId
    if (!zoneId) return
    const profile = await mutate(set, () => window.myrgb.applyEffectToAll(zoneId))
    set({ profile })
  },

  async setPalette(palette) {
    const profile = await mutate(set, () => window.myrgb.setPalette(palette))
    set({ profile })
  },

  async removePalette(paletteId) {
    const profile = await mutate(set, () => window.myrgb.removePalette(paletteId))
    set({ profile })
  },

  async setGlobal(patch) {
    const profile = await mutate(set, () => window.myrgb.setGlobal(patch))
    set({ profile })
  },

  async loadProfile(id) {
    const profile = await window.myrgb.loadProfile(id)
    set({ profile })
  },

  async saveProfile(profile) {
    if (!profile) return
    const saved = await mutate(set, () => window.myrgb.saveProfile(profile))
    set({ profile: saved })
    try {
      await window.myrgb.flushProfile?.()
    } catch {}
    set({ dirty: false })
  },

  async duplicateProfile(name) {
    const profile = await mutate(set, () => window.myrgb.duplicateProfile(name))
    set({ profile })
  },

  async renameProfile(name, overwrite = false) {
    const profile = await mutate(set, () => window.myrgb.renameProfile(name, overwrite))
    set({ profile })
  },

  async exportProfile() {
    return await window.myrgb.exportProfile()
  },

  async importProfile() {
    const profile = await window.myrgb.importProfile()
    if (profile) set({ profile })
    return profile
  },

  async toggleEngine() {
    const state = get().engineRunning
      ? await window.myrgb.stopEngine()
      : await window.myrgb.startEngine()
    set({ engineRunning: state.running })
  },

  async reconnect() {
    const device = await window.myrgb.reconnect()
    const zones = await window.myrgb.listZones()
    const profile = await window.myrgb.getProfile()
    set({
      device,
      zones,
      profile,
      selectedZoneId: zones.some((z) => z.id === get().selectedZoneId)
        ? get().selectedZoneId
        : (zones[0]?.id ?? ''),
      error: device.connected ? null : (device.error ?? 'Dispositivo não encontrado')
    })
  }
}))

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Run a change that reaches the main process and marks the profile as dirty.
 *
 * The flag is only cleared when the main process confirms the write, so the
 * indicator never promises something that is not on disk yet.
 */
async function mutate<T>(
  set: (partial: Partial<AppState>) => void,
  run: () => Promise<T>
): Promise<T> {
  pendingMutations++
  set({ dirty: true })
  try {
    return await run()
  } finally {
    pendingMutations--
  }
}

/** Convenience selector: the zone currently being edited. */
export function useSelectedZone(): ZoneState | undefined {
  return useApp((s) => s.zones.find((z) => z.id === s.selectedZoneId))
}

/** Convenience selector: the profile of the zone currently being edited. */
export function useSelectedZoneConfig(): ZoneConfig | undefined {
  return useApp((s) => s.profile?.zones.find((z) => z.zoneId === s.selectedZoneId))
}

/** Convenience selector: the pattern currently applied to the selected zone. */
export function useSelectedPattern(): PatternMeta | undefined {
  const patternId = useSelectedZoneConfig()?.effect?.patternId
  return useApp((s) => s.patterns.find((p) => p.id === patternId))
}

/**
 * The name shown for a zone.
 *
 * The user can rename a zone per profile; when they did not, the name the
 * hardware reports is used.
 */
export function zoneDisplayName(zone: ZoneState, config?: ZoneConfig): string {
  const custom = config?.name?.trim()
  return custom ? custom : zone.label
}

export type { ParamValue }
