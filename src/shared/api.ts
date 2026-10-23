/**
 * The typed API exposed to the renderer through the preload bridge.
 *
 * The renderer never touches HID directly - it only talks to the main
 * process through these calls, which keeps the hardware layer in one place
 * and makes the same code path work on every OS.
 */

import type {
  AppSettings,
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
} from './types'

export type Unsubscribe = () => void

export interface EngineState {
  running: boolean
  fps: number
  lastFrameSeq: number
}

/** Emitted after the profile was written to disk. */
export interface ProfileSavedEvent {
  /** Name of the profile that was written. */
  name: string
  /** Epoch milliseconds of the write. */
  at: number
}

export interface MyRgbApi {
  // device
  getDeviceInfo(): Promise<DeviceInfo>
  reconnect(): Promise<DeviceInfo>

  // zones & patterns
  listZones(): Promise<ZoneState[]>
  listPatterns(): Promise<PatternMeta[]>
  listPalettes(): Promise<Palette[]>

  // profiles
  getProfile(): Promise<Profile>
  saveProfile(profile: Profile): Promise<Profile>
  duplicateProfile(name: string): Promise<Profile>
  renameProfile(name: string): Promise<Profile>
  listProfiles(): Promise<string[]>
  loadProfile(id: string): Promise<Profile>
  deleteProfile(id: string): Promise<Profile>
  setZoneEffect(zoneId: string, effect: EffectDefinition | null): Promise<Profile>
  setZoneConfig(zoneId: string, patch: Partial<ZoneConfig>): Promise<Profile>
  applyEffectToAll(zoneId: string): Promise<Profile>
  setPalette(palette: Palette): Promise<Profile>
  removePalette(paletteId: string): Promise<Profile>
  setGlobal(patch: Partial<GlobalSettings>): Promise<Profile>
  exportProfile(): Promise<string | null>
  importProfile(): Promise<Profile | null>
  flushProfile(): Promise<void>

  // engine
  startEngine(): Promise<EngineState>
  stopEngine(): Promise<EngineState>
  getEngineState(): Promise<EngineState>

  // settings
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>

  // events
  onFrame(callback: (frame: Frame) => void): Unsubscribe
  onDeviceChange(callback: (info: DeviceInfo) => void): Unsubscribe
  onEngineState(callback: (state: EngineState) => void): Unsubscribe
  onProfileChange(callback: (profile: Profile) => void): Unsubscribe
  onProfileSaved(callback: (event: ProfileSavedEvent) => void): Unsubscribe
  onTrayCommand(callback: (command: string) => void): Unsubscribe
}

export interface PatternParamMeta extends PatternMeta {
  defaults: Record<string, ParamValue>
}
