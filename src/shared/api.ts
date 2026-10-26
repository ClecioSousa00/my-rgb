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
import type { DriveInfo, SystemSnapshot } from './features/system'
import type { SensorsSnapshot } from './features/sensors'

export type Unsubscribe = () => void

export interface EngineState {
  running: boolean
  fps: number
  lastFrameSeq: number
  /** Last hardware error, or null when everything is fine. */
  error?: string | null
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
  renameProfile(name: string, overwrite?: boolean): Promise<Profile>
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

  // system & drives
  /** Static hardware snapshot. Cached in the main process for a minute. */
  getSystem(force?: boolean): Promise<SystemSnapshot>
  listDrives(): Promise<DriveInfo[]>

  // sensors
  /**
   * Subscribe to the live stream. Returns the last batch (or null on the
   * first call) so the page can paint before the next poll arrives.
   */
  startSensors(): Promise<SensorsSnapshot | null>
  stopSensors(): Promise<void>
  onSensors(callback: (snapshot: SensorsSnapshot) => void): Unsubscribe

  // events
  onFrame(callback: (frame: Frame) => void): Unsubscribe
  onDeviceChange(callback: (info: DeviceInfo) => void): Unsubscribe
  onEngineState(callback: (state: EngineState) => void): Unsubscribe
  onProfileChange(callback: (profile: Profile) => void): Unsubscribe
  onProfileSaved(callback: (event: ProfileSavedEvent) => void): Unsubscribe
  /** Emitted when the main process cannot persist data (disk full, ...). */
  onAppError(callback: (message: string) => void): Unsubscribe
  onTrayCommand(callback: (command: string) => void): Unsubscribe
}

export interface PatternParamMeta extends PatternMeta {
  defaults: Record<string, ParamValue>
}
