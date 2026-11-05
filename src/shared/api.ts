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
import type { DiskHealthSnapshot } from './features/health'
import type { NetworkProgress, NetworkReport, NetworkStatus } from './features/network'
import type { GamesQuery, GamesReport, GpuMatch } from './features/games'
import type {
  BottleneckSessionProgress,
  BottleneckSessionReport,
  BottleneckSnapshot,
  BottleneckUpdate
} from './features/bottleneck'
import type {
  OverlayConfig,
  OverlayFrame,
  OverlayState
} from './features/overlay'
import type {
  StorageProgress,
  StorageReport,
  StorageStatus
} from './features/storage'

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

/** Result of "open the logs folder". */
export interface LogsFolderResult {
  /** Absolute path of the folder, whether or not it opened. */
  path: string
  /** What the file manager said, or null when it opened. */
  error: string | null
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

  /**
   * Open the folder with the log and the crash reports.
   *
   * Returns the path even when the file manager refused to open it, so the UI
   * can show the user where the file is instead of only saying it failed.
   */
  openLogsFolder(): Promise<LogsFolderResult>

  // storage
  /**
   * Analyse a folder. Starting a second scan while one runs returns the call
   * already in flight. Resolves to null when canceled.
   */
  startStorageScan(root: string): Promise<StorageReport | null>
  /** Ask the running scan to stop. */
  cancelStorageScan(): Promise<void>
  /** Whether a scan is running, and its latest counters. */
  getStorageStatus(): Promise<StorageStatus>
  /** Last completed report, without scanning again. */
  getStorageReport(): Promise<StorageReport | null>
  /** Pushed a few times per second while a scan runs. */
  onStorageProgress(callback: (progress: StorageProgress) => void): Unsubscribe

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

  // disk health
  /** S.M.A.R.T. snapshot for every physical disk. Cached for a minute. */
  listDiskHealth(force?: boolean): Promise<DiskHealthSnapshot>
  /** Read the disks that need root through one pkexec prompt. */
  readDiskHealthElevated(): Promise<DiskHealthSnapshot>

  // network
  /** Run the full diagnostic. Resolves to null when it is cancelled. */
  runNetworkDiagnosis(): Promise<NetworkReport | null>
  /** Stop the running diagnostic. */
  cancelNetworkDiagnosis(): Promise<void>
  /** The last completed report, or null when none has run yet. */
  getNetworkReport(): Promise<NetworkReport | null>
  /** Whether a diagnostic is already running (and its latest step). */
  getNetworkStatus(): Promise<NetworkStatus>
  /**
   * Wait for the run in flight, if there is one, without starting a test.
   * Resolves to null when nothing was running.
   */
  joinNetworkDiagnosis(): Promise<NetworkReport | null>
  /** Step-by-step progress of the running diagnostic. */
  onNetworkProgress(callback: (progress: NetworkProgress) => void): Unsubscribe

  // games
  /**
   * Resolve the catalog for the given query: options, search text and an
   * optional manual GPU. Everything comes from the dataset shipped with the
   * app, so the call works offline.
   */
  listGames(query?: GamesQuery): Promise<GamesReport>
  /** Search the GPU table (name, G3D score) for the manual picker. */
  searchGpus(query: string, limit?: number): Promise<GpuMatch[]>

  // bottleneck
  /** Subscribe to the live limiter and the current session state. */
  startBottleneck(): Promise<BottleneckSnapshot>
  /** Remove the subscription; a running session keeps collecting. */
  stopBottleneck(): Promise<void>
  /** Start a 1, 3 or 5 minute session. */
  startBottleneckSession(minutes: number): Promise<BottleneckSessionProgress>
  /** Cancel the running session. */
  stopBottleneckSession(): Promise<void>
  /** Last finished report, kept in memory. */
  getBottleneckReport(): Promise<BottleneckSessionReport | null>
  /** One update per second while the page is open. */
  onBottleneck(callback: (update: BottleneckUpdate) => void): Unsubscribe

  // overlay
  /** Current configuration, open state and FPS capabilities. */
  getOverlayState(): Promise<OverlayState>
  /** Apply a partial change and persist it. */
  updateOverlay(patch: Partial<OverlayConfig>): Promise<OverlayState>
  /** Flip the overlay switch. */
  toggleOverlay(): Promise<OverlayState>
  /** Try the FPS helper again after a refusal or a crash. */
  retryOverlayFps(): Promise<OverlayState>
  /** Content size reported by the overlay bundle. */
  resizeOverlay(width: number, height: number): Promise<void>
  /** Pushed when the configuration or the FPS capability changes. */
  onOverlayState(callback: (state: OverlayState) => void): Unsubscribe
  /** Pushed every 500 ms while the overlay is open. */
  onOverlayFrame(callback: (frame: OverlayFrame) => void): Unsubscribe

  // events
  onFrame(callback: (frame: Frame) => void): Unsubscribe
  onDeviceChange(callback: (info: DeviceInfo) => void): Unsubscribe
  onEngineState(callback: (state: EngineState) => void): Unsubscribe
  onProfileChange(callback: (profile: Profile) => void): Unsubscribe
  onProfileSaved(callback: (event: ProfileSavedEvent) => void): Unsubscribe
  /** Emitted when the main process cannot persist data (disk full, ...). */
  onAppError(callback: (message: string) => void): Unsubscribe
}

export interface PatternParamMeta extends PatternMeta {
  defaults: Record<string, ParamValue>
}
