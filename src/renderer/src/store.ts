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

  init(): Promise<void>
  selectZone(zoneId: string): void
  setZoneEffect(zoneId: string, effect: EffectDefinition | null): Promise<void>
  setZoneConfig(zoneId: string, patch: Partial<ZoneConfig>): Promise<void>
  setPalette(palette: Palette): Promise<void>
  removePalette(paletteId: string): Promise<void>
  setGlobal(patch: Partial<GlobalSettings>): Promise<void>
  loadProfile(id: string): Promise<void>
  saveProfile(profile: Profile): Promise<void>
  duplicateProfile(name: string): Promise<void>
  renameProfile(name: string): Promise<void>
  toggleEngine(): Promise<void>
  reconnect(): Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  device: null,
  zones: [],
  patterns: [],
  profile: null,
  selectedZoneId: '',
  engineRunning: false,
  ready: false,
  error: null,

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

      window.myrgb.onFrame((frame) => {
        // Counted so the self test can prove frames are really flowing.
        const w = window as unknown as { __myRgbFrameCount?: number }
        w.__myRgbFrameCount = (w.__myRgbFrameCount ?? 0) + 1
        for (const listener of frameListeners) listener(frame)
      })
      window.myrgb.onProfileChange((next) => set({ profile: next }))
      window.myrgb.onEngineState((state) => set({ engineRunning: state.running }))
    } catch (err) {
      set({ error: errorMessage(err), ready: true })
    }
  },

  selectZone(zoneId) {
    set({ selectedZoneId: zoneId })
  },

  async setZoneEffect(zoneId, effect) {
    const profile = await window.myrgb.setZoneEffect(zoneId, effect)
    set({ profile })
  },

  async setZoneConfig(zoneId, patch) {
    const profile = await window.myrgb.setZoneConfig(zoneId, patch)
    set({ profile })
  },

  async setPalette(palette) {
    const profile = await window.myrgb.setPalette(palette)
    set({ profile })
  },

  async removePalette(paletteId) {
    const profile = await window.myrgb.removePalette(paletteId)
    set({ profile })
  },

  async setGlobal(patch) {
    const profile = await window.myrgb.setGlobal(patch)
    set({ profile })
  },

  async loadProfile(id) {
    const profile = await window.myrgb.loadProfile(id)
    set({ profile })
  },

  async saveProfile(profile) {
    const saved = await window.myrgb.saveProfile(profile)
    set({ profile: saved })
  },

  async duplicateProfile(name) {
    const profile = await window.myrgb.duplicateProfile(name)
    set({ profile })
  },

  async renameProfile(name) {
    const profile = await window.myrgb.renameProfile(name)
    set({ profile })
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

export type { ParamValue }
