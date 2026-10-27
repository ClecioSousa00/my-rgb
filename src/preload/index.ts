/**
 * Preload bridge.
 *
 * The only channel between the renderer and the main process. Everything is
 * an explicit, typed call - the renderer has no access to Node, HID or the
 * file system.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type { EngineState, MyRgbApi, ProfileSavedEvent, Unsubscribe } from '@shared/api'
import type {
  AppSettings,
  DeviceInfo,
  EffectDefinition,
  Frame,
  GlobalSettings,
  Palette,
  Profile,
  ZoneConfig,
  ZoneState
} from '@shared/types'
import type { DriveInfo, SystemSnapshot } from '@shared/features/system'
import type { SensorsSnapshot } from '@shared/features/sensors'
import type { DiskHealthSnapshot } from '@shared/features/health'
import type { NetworkProgress, NetworkReport } from '@shared/features/network'
import type {
  ApiKeyState,
  GamesApiResult,
  GamesReport,
  GameOptions
} from '@shared/features/games'
import type {
  BottleneckSessionProgress,
  BottleneckSessionReport,
  BottleneckSnapshot,
  BottleneckUpdate
} from '@shared/features/bottleneck'
import type {
  OverlayConfig,
  OverlayFrame,
  OverlayState
} from '@shared/features/overlay'

function subscribe<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: MyRgbApi = {
  // device
  getDeviceInfo: (): Promise<DeviceInfo> => ipcRenderer.invoke(IPC.deviceInfo),
  reconnect: (): Promise<DeviceInfo> => ipcRenderer.invoke(IPC.deviceReconnect),

  // zones & patterns
  listZones: (): Promise<ZoneState[]> => ipcRenderer.invoke(IPC.zonesList),
  listPatterns: () => ipcRenderer.invoke(IPC.patternsList),
  listPalettes: (): Promise<Palette[]> => ipcRenderer.invoke(IPC.profileGet).then((p: Profile) => p.palettes),

  // profiles
  getProfile: (): Promise<Profile> => ipcRenderer.invoke(IPC.profileGet),
  saveProfile: (profile: Profile): Promise<Profile> => ipcRenderer.invoke(IPC.profileSave, profile),
  duplicateProfile: (name: string): Promise<Profile> => ipcRenderer.invoke(IPC.profileDuplicate, name),
  renameProfile: (name: string, overwrite = false): Promise<Profile> =>
    ipcRenderer.invoke(IPC.profileRename, name, overwrite),
  listProfiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.profileList),
  loadProfile: (id: string): Promise<Profile> => ipcRenderer.invoke(IPC.profileLoad, id),
  deleteProfile: (id: string): Promise<Profile> => ipcRenderer.invoke(IPC.profileDelete, id),
  setZoneEffect: (zoneId: string, effect: EffectDefinition | null): Promise<Profile> =>
    ipcRenderer.invoke(IPC.profileSetZone, zoneId, effect),
  setZoneConfig: (zoneId: string, patch: Partial<ZoneConfig>): Promise<Profile> =>
    ipcRenderer.invoke(IPC.profileSetZoneConfig, zoneId, patch),
  applyEffectToAll: (zoneId: string): Promise<Profile> =>
    ipcRenderer.invoke(IPC.profileApplyToAll, zoneId),
  setPalette: (palette: Palette): Promise<Profile> =>
    ipcRenderer.invoke(IPC.profileSetPalette, palette),
  removePalette: (paletteId: string): Promise<Profile> =>
    ipcRenderer.invoke(IPC.profileRemovePalette, paletteId),
  setGlobal: (patch: Partial<GlobalSettings>): Promise<Profile> =>
    ipcRenderer.invoke(IPC.profileSetGlobal, patch),
  exportProfile: (): Promise<string | null> => ipcRenderer.invoke(IPC.profileExport),
  importProfile: (): Promise<Profile | null> => ipcRenderer.invoke(IPC.profileImport),
  flushProfile: (): Promise<void> => ipcRenderer.invoke(IPC.profileFlush),

  // engine
  startEngine: (): Promise<EngineState> => ipcRenderer.invoke(IPC.engineStart),
  stopEngine: (): Promise<EngineState> => ipcRenderer.invoke(IPC.engineStop),
  getEngineState: (): Promise<EngineState> => ipcRenderer.invoke(IPC.engineState),

  // settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.settingsSet, patch),

  // system & drives
  getSystem: (force = false): Promise<SystemSnapshot> => ipcRenderer.invoke(IPC.systemGet, force),
  listDrives: (): Promise<DriveInfo[]> => ipcRenderer.invoke(IPC.drivesList),

  // sensors
  startSensors: (): Promise<SensorsSnapshot | null> => ipcRenderer.invoke(IPC.sensorsStart),
  stopSensors: (): Promise<void> => ipcRenderer.invoke(IPC.sensorsStop),
  onSensors: (callback: (snapshot: SensorsSnapshot) => void) =>
    subscribe(IPC.sensorsBatch, callback),

  // disk health
  listDiskHealth: (force = false): Promise<DiskHealthSnapshot> =>
    ipcRenderer.invoke(IPC.healthList, force),
  readDiskHealthElevated: (): Promise<DiskHealthSnapshot> =>
    ipcRenderer.invoke(IPC.healthElevated),

  // network
  runNetworkDiagnosis: (): Promise<NetworkReport | null> => ipcRenderer.invoke(IPC.netDiagnose),
  cancelNetworkDiagnosis: (): Promise<void> => ipcRenderer.invoke(IPC.netCancel),
  getNetworkReport: (): Promise<NetworkReport | null> => ipcRenderer.invoke(IPC.netLast),
  onNetworkProgress: (callback: (progress: NetworkProgress) => void) =>
    subscribe(IPC.netProgress, callback),

  // games
  listGames: (options?: Partial<GameOptions>): Promise<GamesReport> =>
    ipcRenderer.invoke(IPC.gamesList, options),
  fetchGameFps: (options?: Partial<GameOptions>): Promise<GamesApiResult> =>
    ipcRenderer.invoke(IPC.gamesFps, options),
  setGamesApiKey: (key: string | null): Promise<ApiKeyState> =>
    ipcRenderer.invoke(IPC.gamesSetApiKey, key),
  getGamesApiKeyState: (): Promise<ApiKeyState> => ipcRenderer.invoke(IPC.gamesHasApiKey),

  // bottleneck
  startBottleneck: (): Promise<BottleneckSnapshot> =>
    ipcRenderer.invoke(IPC.bottleneckStart),
  stopBottleneck: (): Promise<void> => ipcRenderer.invoke(IPC.bottleneckStop),
  startBottleneckSession: (minutes: number): Promise<BottleneckSessionProgress> =>
    ipcRenderer.invoke(IPC.bottleneckSessionStart, minutes),
  stopBottleneckSession: (): Promise<void> => ipcRenderer.invoke(IPC.bottleneckSessionStop),
  getBottleneckReport: (): Promise<BottleneckSessionReport | null> =>
    ipcRenderer.invoke(IPC.bottleneckReport),
  onBottleneck: (callback: (update: BottleneckUpdate) => void) =>
    subscribe(IPC.bottleneckSample, callback),

  // overlay
  getOverlayState: (): Promise<OverlayState> => ipcRenderer.invoke(IPC.overlayGet),
  updateOverlay: (patch: Partial<OverlayConfig>): Promise<OverlayState> =>
    ipcRenderer.invoke(IPC.overlayUpdate, patch),
  toggleOverlay: (): Promise<OverlayState> => ipcRenderer.invoke(IPC.overlayToggle),
  retryOverlayFps: (): Promise<OverlayState> => ipcRenderer.invoke(IPC.overlayRetryFps),
  resizeOverlay: (width: number, height: number): Promise<void> =>
    ipcRenderer.invoke(IPC.overlayResize, width, height),
  onOverlayState: (callback: (state: OverlayState) => void) =>
    subscribe(IPC.overlayState, callback),
  onOverlayFrame: (callback: (frame: OverlayFrame) => void) =>
    subscribe(IPC.overlayFrame, callback),

  // events
  onFrame: (callback: (frame: Frame) => void) => subscribe(IPC.engineFrame, callback),
  onDeviceChange: (callback: (info: DeviceInfo) => void) => subscribe(IPC.deviceInfo, callback),
  onEngineState: (callback: (state: EngineState) => void) => subscribe(IPC.engineState, callback),
  onProfileChange: (callback: (profile: Profile) => void) => subscribe(IPC.profileGet, callback),
  onProfileSaved: (callback: (event: ProfileSavedEvent) => void) =>
    subscribe(IPC.profileSaved, callback),
  onAppError: (callback: (message: string) => void) => subscribe(IPC.appError, callback),
  onTrayCommand: (callback: (command: string) => void) => subscribe(IPC.engineState, callback)
}

contextBridge.exposeInMainWorld('myrgb', api)
