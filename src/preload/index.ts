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

  // events
  onFrame: (callback: (frame: Frame) => void) => subscribe(IPC.engineFrame, callback),
  onDeviceChange: (callback: (info: DeviceInfo) => void) => subscribe(IPC.deviceInfo, callback),
  onEngineState: (callback: (state: EngineState) => void) => subscribe(IPC.engineState, callback),
  onProfileChange: (callback: (profile: Profile) => void) => subscribe(IPC.profileGet, callback),
  onProfileSaved: (callback: (event: ProfileSavedEvent) => void) =>
    subscribe(IPC.profileSaved, callback),
  onTrayCommand: (callback: (command: string) => void) => subscribe(IPC.engineState, callback)
}

contextBridge.exposeInMainWorld('myrgb', api)
