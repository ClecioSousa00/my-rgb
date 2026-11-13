/**
 * IPC registration.
 *
 * Every channel the renderer can call is declared here, away from the window,
 * the tray and the device lifecycle. The main process passes itself as the
 * host, so a handler can still reach the engine, the stores and the window
 * without this module owning them.
 *
 * Feature channels (system, sensors, disks, network, games, overlay, light,
 * logs) are registered here as they arrive, keeping one place to audit the
 * surface.
 */

import { app, dialog, ipcMain, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
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
  joinNetworkDiagnosis,
  lastNetworkReport,
  networkStatus
} from '../features/network'
import { GamesService } from '../features/games'
import type { BottleneckService } from '../features/bottleneck'
import type { OverlayService } from '../features/overlay/manager'
import type { OverlayConfig } from '@shared/features/overlay'
import { applyLogLevel, logDirectory } from '../logging'
import { listLogs, readLog } from '../features/logs'
import {
  cancelStorageDuplicateScan,
  cancelStorageScan,
  joinStorageScan,
  lastStorageDuplicateReport,
  lastStorageReport,
  startStorageDuplicateScan,
  startStorageScan,
  storageDuplicateStatus,
  storageStatus
} from '../features/storage'
import {
  checkForUpdates,
  downloadUpdate,
  getAutoUpdateState,
  quitAndInstall,
  subscribeAutoUpdate
} from '../updater'

/** Largest profile file accepted on import; real ones are a few kilobytes. */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024

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
  /** Live limiter and session reports, fed by the same sensor poll. */
  bottleneck: BottleneckService
  /** Transparent overlay window and its settings. */
  overlay: OverlayService
  /** Device state with the conflict flag already merged in. */
  readonly deviceInfo: DeviceInfo
  readonly engineState: EngineState

  reconnect(): Promise<DeviceInfo>
  startEngine(): void
  stopEngine(): void
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

    try {
      const file = result.filePaths[0]
      // A profile is a few kilobytes; a multi-megabyte file is a mistake (or a
      // whole disk image) and reading it synchronously would freeze the window.
      const { size } = statSync(file)
      if (size > MAX_IMPORT_BYTES) {
        throw new Error(
          `o arquivo tem ${(size / 1024 / 1024).toFixed(1)} MB; o limite é ` +
            `${MAX_IMPORT_BYTES / 1024 / 1024} MB.`
        )
      }

      const content = readFileSync(file, 'utf8')
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        throw new Error('o arquivo não é um JSON válido.')
      }
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
    } catch (err) {
      // The raw Electron message ("Error invoking remote method…") tells the
      // user nothing, and validation already writes in Portuguese.
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Não foi possível importar o perfil: ${message}`)
    }
  })

  // --- engine -------------------------------------------------------------

  ipcMain.handle(IPC.engineStart, () => {
    host.clearEngineError()
    host.startEngine()
    host.emitEngineState()
    return host.engineState
  })

  ipcMain.handle(IPC.engineStop, () => {
    host.stopEngine()
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
    // Applied live: switching to "Depuração" and having to restart to see the
    // lines would defeat the point of the setting.
    if (patch.logLevel !== undefined) applyLogLevel(next.logLevel ?? 'info')
    return next
  })

  // --- logs ---------------------------------------------------------------

  // --- storage ------------------------------------------------------------

  ipcMain.handle(IPC.storageStart, (_e, root: string) =>
    startStorageScan(root, (progress) => {
      if (!host.window || host.window.isDestroyed()) return
      host.window.webContents.send(IPC.storageProgress, progress)
    })
  )
  ipcMain.handle(IPC.storageCancel, () => {
    cancelStorageScan()
  })
  ipcMain.handle(IPC.storageStatus, () => storageStatus())
  ipcMain.handle(IPC.storageReport, () => lastStorageReport())
  ipcMain.handle(IPC.storageJoin, () => joinStorageScan())
  ipcMain.handle(IPC.storagePick, async () => {
    const options = {
      title: 'Escolher pasta para analisar',
      properties: ['openDirectory' as const]
    }
    // Without a parent the dialog is not modal on Linux; with one it follows
    // the window the user is looking at.
    const parent = host.window && !host.window.isDestroyed() ? host.window : null
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
  ipcMain.handle(IPC.storageReveal, (_e, path: string) => {
    if (typeof path !== 'string' || path.length === 0) return
    // Read-only: reveals the item, never opens or changes it.
    shell.showItemInFolder(path)
  })

  // --- storage duplicates ---------------------------------------------------

  ipcMain.handle(IPC.storageDuplicateStart, (_e, root: string) =>
    startStorageDuplicateScan(root, (progress) => {
      if (!host.window || host.window.isDestroyed()) return
      host.window.webContents.send(IPC.storageDuplicateProgress, progress)
    })
  )
  ipcMain.handle(IPC.storageDuplicateCancel, () => {
    cancelStorageDuplicateScan()
  })
  ipcMain.handle(IPC.storageDuplicateStatus, () => storageDuplicateStatus())
  ipcMain.handle(IPC.storageDuplicateReport, () => lastStorageDuplicateReport())

  ipcMain.handle(IPC.logsOpen, async () => {
    const path = logDirectory(app.getPath('userData'))
    try {
      // The folder only exists after the first line; opening an inexistent
      // path fails for the wrong reason.
      mkdirSync(path, { recursive: true })
    } catch {
      /* `openPath` below reports the real failure, with the path returned */
    }
    const error = await shell.openPath(path)
    return { path, error: error || null }
  })
  ipcMain.handle(IPC.logsList, () => listLogs())
  ipcMain.handle(IPC.logsRead, (_e, name: string) => readLog(name))
  ipcMain.handle(IPC.logsExport, async (_e, name: string) => {
    const read = readLog(name)
    const content = read.entries
      .map((entry) => `${entry.at} ${entry.level.toUpperCase()} ${entry.message}`)
      .join('\n')
    const options = {
      title: 'Exportar registo de erros',
      defaultPath: name.replace('.log', '.txt'),
      filters: [{ name: 'Texto', extensions: ['txt'] }]
    }
    const parent = host.window && !host.window.isDestroyed() ? host.window : undefined
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || result.filePath.length === 0) return null
    try {
      writeFileSync(result.filePath, content, 'utf8')
      return result.filePath
    } catch (error) {
      // A failed write is not a cancellation: reject so the page can show the
      // error instead of silently doing nothing.
      throw new Error(
        `Não foi possível gravar o registo: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })

  // --- auto-update --------------------------------------------------------

  ipcMain.handle(IPC.autoUpdateState, () => getAutoUpdateState())

  ipcMain.handle(IPC.autoUpdateCheck, async () => {
    await checkForUpdates()
  })

  ipcMain.handle(IPC.autoUpdateDownload, async () => {
    await downloadUpdate()
  })

  ipcMain.handle(IPC.autoUpdateQuitAndInstall, async () => {
    await quitAndInstall()
  })

  // Subscribe once to push state changes to the renderer window.
  let autoUpdateSubscribed = false
  if (!autoUpdateSubscribed && host.window) {
    autoUpdateSubscribed = true
    subscribeAutoUpdate((s) => {
      if (host.window && !host.window.isDestroyed()) {
        host.window.webContents.send(IPC.autoUpdateChanged, s)
      }
    })
  }

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
  ipcMain.handle(IPC.netStatus, () => networkStatus())
  ipcMain.handle(IPC.netJoin, () => joinNetworkDiagnosis())

  // --- games --------------------------------------------------------------

  // The dataset is bundled with the app; the service keeps no cache on disk.
  const games = new GamesService()

  ipcMain.handle(IPC.gamesList, (_e, query) => games.report(query))
  ipcMain.handle(IPC.gamesGpus, (_e, query: string, limit?: number) =>
    games.searchGpus(query, limit)
  )

  // --- bottleneck ---------------------------------------------------------

  ipcMain.handle(IPC.bottleneckStart, () => host.bottleneck.start())
  ipcMain.handle(IPC.bottleneckStop, () => host.bottleneck.stop())
  ipcMain.handle(IPC.bottleneckSessionStart, (_e, minutes: number) =>
    host.bottleneck.startSession(minutes)
  )
  ipcMain.handle(IPC.bottleneckSessionStop, () => host.bottleneck.stopSession())
  ipcMain.handle(IPC.bottleneckReport, () => host.bottleneck.report())

  // --- overlay ------------------------------------------------------------

  ipcMain.handle(IPC.overlayGet, () => host.overlay.state())
  ipcMain.handle(IPC.overlayUpdate, (_e, patch: Partial<OverlayConfig>) =>
    host.overlay.update(patch)
  )
  ipcMain.handle(IPC.overlayToggle, () => host.overlay.toggle())
  ipcMain.handle(IPC.overlayRetryFps, () => host.overlay.retryFps())
  ipcMain.handle(IPC.overlayResize, (_e, width: number, height: number) => {
    host.overlay.resize(width, height)
  })
}
