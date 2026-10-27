/**
 * IPC registration.
 *
 * Every channel the renderer can call is declared here, away from the window,
 * the tray and the device lifecycle. The main process passes itself as the
 * host, so a handler can still reach the engine, the stores and the window
 * without this module owning them.
 *
 * Feature channels (system, sensors, disks, network, games, overlay, light)
 * are registered here as they arrive, keeping one place to audit the surface.
 */

import { dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import type { EngineState } from '@shared/api'
import type { DeviceInfo, EffectDefinition, Palette, Profile, ZoneConfig, ZoneState } from '@shared/types'
import { IPC } from '@shared/types'
import type { EffectEngine } from '../engine/engine'
import { patternMetadata } from '../engine/patterns'
import type { ProfileStore } from '../store/profileStore'
import { reconcileProfile, validateImportedProfile } from '../store/profileStore'
import type { SettingsStore } from '../store/settings'
import { getSystem } from '../features/system/info'
import { listDrives } from '../features/system/drives'
import type { SensorsStore } from '../features/sensors/store'
import { listDiskHealth } from '../features/health'
import {
  cancelNetworkDiagnosis,
  diagnoseNetwork,
  lastNetworkReport
} from '../features/network'

/** What a handler needs from the application. */
export interface IpcHost {
  /** Main window, or null while it is closed. */
  window: BrowserWindow | null
  /** Zones of the connected controller. */
  zones: ZoneState[]
  engine: EffectEngine
  profileStore: ProfileStore
  settings: SettingsStore
  /** Live sensor poll and its session buffer. */
  sensors: SensorsStore
  /** Device state with the conflict flag already merged in. */
  readonly deviceInfo: DeviceInfo
  readonly engineState: EngineState

  reconnect(): Promise<DeviceInfo>
  rememberProfileName(before: string, after: string): void
  emitProfile(profile: Profile): void
  emitEngineState(): void
  refreshTray(): void
  applyAutostart(enabled: boolean): void
  clearEngineError(): void
}

export function registerIpc(host: IpcHost): void {
  const store = host.profileStore
  const { engine, settings } = host

  ipcMain.handle(IPC.deviceInfo, () => host.deviceInfo)
  ipcMain.handle(IPC.deviceReconnect, () => host.reconnect())
  ipcMain.handle(IPC.zonesList, () => host.zones)
  ipcMain.handle(IPC.patternsList, () => patternMetadata())

  // --- profiles -----------------------------------------------------------

  ipcMain.handle(IPC.profileGet, () => store.profile)

  ipcMain.handle(IPC.profileSave, (_e, profile: Profile) => {
    const before = store.profile.name
    const saved = store.save(profile)
    host.rememberProfileName(before, saved.name)
    return saved
  })

  ipcMain.handle(IPC.profileDuplicate, (_e, name: string) => {
    const before = store.profile.name
    const profile = store.duplicateProfile(name)
    store.flush?.()
    engine.setProfile(profile)
    host.rememberProfileName(before, profile.name)
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileRename, (_e, name: string, overwrite = false) => {
    const before = store.profile.name
    const profile = store.renameProfile(name, overwrite)
    store.flush?.()
    engine.setProfile(profile)
    host.rememberProfileName(before, profile.name)
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileList, () => store.list())

  ipcMain.handle(IPC.profileLoad, (_e, id: string) => {
    const profile = store.load(id)
    engine.setProfile(profile)
    settings.set({ lastProfile: profile.name })
    host.refreshTray()
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileDelete, (_e, id: string) => {
    const deleted = store.displayName(id)
    const profile = store.delete(id)
    engine.setProfile(profile)
    // The delete may have moved the app to another profile, and the deleted
    // one may be the profile chosen for startup.
    const startup = settings.settings.startupProfile
    settings.set({
      lastProfile: profile.name,
      ...(startup && startup === deleted ? { startupProfile: null } : {})
    })
    host.refreshTray()
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileSetZone, (_e, zoneId: string, effect: EffectDefinition | null) => {
    const profile = store.setZoneEffect(zoneId, effect)
    engine.setProfile(profile)
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileSetZoneConfig, (_e, zoneId: string, patch: Partial<ZoneConfig>) => {
    const profile = store.setZoneConfig(zoneId, patch)
    engine.setProfile(profile)
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileApplyToAll, (_e, zoneId: string) => {
    const profile = store.applyEffectToAll(zoneId)
    engine.setProfile(profile)
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileSetPalette, (_e, palette: Palette) => {
    const profile = store.setPalette(palette)
    engine.setProfile(profile)
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileRemovePalette, (_e, paletteId: string) => {
    const profile = store.removePalette(paletteId)
    engine.setProfile(profile)
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileSetGlobal, (_e, patch) => {
    const profile = store.setGlobal(patch)
    engine.setProfile(profile)
    host.emitProfile(profile)
    return profile
  })

  ipcMain.handle(IPC.profileFlush, () => {
    store.flush?.()
  })

  ipcMain.handle(IPC.profileExport, async () => {
    if (!host.window) return null
    const profile = store.profile
    const result = await dialog.showSaveDialog(host.window, {
      title: 'Exportar perfil',
      defaultPath: `${profile.name.replace(/[\\/:*?"<>|]/g, '_')}.myrgb.json`,
      filters: [
        { name: 'MyRGB Profile', extensions: ['myrgb.json', 'json'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, JSON.stringify(profile, null, 2), 'utf8')
    return result.filePath
  })

  ipcMain.handle(IPC.profileImport, async () => {
    if (!host.window) return null
    const result = await dialog.showOpenDialog(host.window, {
      title: 'Importar perfil',
      properties: ['openFile'],
      filters: [
        { name: 'MyRGB Profile', extensions: ['myrgb.json', 'json'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const content = readFileSync(result.filePaths[0], 'utf8')
    const parsed = JSON.parse(content) as unknown
    const imported = validateImportedProfile(parsed)
    // Never overwrite a profile with the same name: give the import the
    // first free variant ("Nome (2)", ...) and save it once, validated.
    const name = store.availableName(imported.name)
    const before = store.profile.name
    const saved = store.save(reconcileProfile({ ...imported, name }, host.zones))
    store.flush?.()
    engine.setProfile(saved)
    host.rememberProfileName(before, saved.name)
    host.emitProfile(saved)
    return saved
  })

  // --- engine -------------------------------------------------------------

  ipcMain.handle(IPC.engineStart, () => {
    host.clearEngineError()
    engine.start()
    host.emitEngineState()
    return host.engineState
  })

  ipcMain.handle(IPC.engineStop, () => {
    engine.stop()
    host.emitEngineState()
    return host.engineState
  })

  ipcMain.handle(IPC.engineState, () => host.engineState)

  // --- settings -----------------------------------------------------------

  ipcMain.handle(IPC.settingsGet, () => settings.settings)

  ipcMain.handle(IPC.settingsSet, (_e, patch) => {
    const next = settings.set(patch)
    if (patch.autostartAtLogin !== undefined) {
      host.applyAutostart(next.autostartAtLogin)
    }
    return next
  })

  // --- system & drives ----------------------------------------------------

  ipcMain.handle(IPC.systemGet, (_e, force = false) => getSystem(force === true))
  ipcMain.handle(IPC.drivesList, () => listDrives())

  // --- sensors ------------------------------------------------------------

  ipcMain.handle(IPC.sensorsStart, () => {
    host.sensors.start()
    return host.sensors.snapshot()
  })

  ipcMain.handle(IPC.sensorsStop, () => {
    host.sensors.stop()
  })

  // --- disk health --------------------------------------------------------

  ipcMain.handle(IPC.healthList, (_e, force = false) => listDiskHealth({ force: force === true }))
  ipcMain.handle(IPC.healthElevated, () => listDiskHealth({ elevated: true }))

  // --- network ------------------------------------------------------------

  ipcMain.handle(IPC.netDiagnose, () =>
    diagnoseNetwork((progress) => host.window?.webContents.send(IPC.netProgress, progress))
  )
  ipcMain.handle(IPC.netCancel, () => {
    cancelNetworkDiagnosis()
  })
  ipcMain.handle(IPC.netLast, () => lastNetworkReport())
}
