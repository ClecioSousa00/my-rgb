/**
 * Main process.
 *
 * Owns the hardware, the engine and the profile store, and exposes them to
 * the renderer over a narrow IPC surface. The renderer never touches HID.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { AuraUsbDevice } from './aura/auraDevice'
import { EffectEngine } from './engine/engine'
import { patternMetadata } from './engine/patterns'
import { defaultProfile, ProfileStore, reconcileProfile } from './store/profileStore'
import { SettingsStore } from './store/settings'
import { buildZones } from './zones'
import { createTray, type TrayHandle } from './tray'
import { resolveResource } from './resources'
import { detectConflicts, type ConflictReport } from './platform/conflict'
import { runFrameDump } from './dumpFrames'
import type { DeviceInfo, Frame, Palette, Profile, RGB, ZoneState } from '@shared/types'
import { IPC } from '@shared/types'
import { samplePalette } from './engine/palette'
import type { EngineState } from '@shared/api'

const isDev = !app.isPackaged

class MyRgbApp {
  private device = new AuraUsbDevice()
  private zones: ZoneState[] = []
  engine!: EffectEngine
  private profileStore!: ProfileStore
  private settings!: SettingsStore
  private window: BrowserWindow | null = null
  private trayHandle: TrayHandle | null = null
  private conflicts: ConflictReport = { conflicting: false, processes: [], hint: '' }
  private quitting = false

  async start(): Promise<void> {
    this.settings = new SettingsStore(app.getPath('userData'))

    const initial = defaultProfile()
    this.profileStore = new ProfileStore(app.getPath('userData'), initial)
    try {
      this.profileStore.load(this.settings.settings.lastProfile)
    } catch {
      /* keep the default profile */
    }

    this.engine = new EffectEngine(this.profileStore.profile, this.zones, {
      onFrame: (frame) => this.pushFrame(frame),
      onError: (message) => this.pushError(message)
    })

    await this.openDevice()
    this.refreshConflicts()

    this.createWindow()
    this.createTray()
    this.registerIpc()

    if (this.settings.settings.autoStart) {
      this.engine.start()
    }
  }

  // --- device -------------------------------------------------------------

  private async openDevice(): Promise<boolean> {
    const ok = await this.device.open()
    if (!ok) {
      this.zones = []
    } else if (this.device.info.layout) {
      this.zones = buildZones(this.device.info.layout)
    }
    this.reconcile()
    this.engine.setZones(this.zones)
    this.engine.setDevice(ok ? this.device : null)
    // If the lights are supposed to be off, darken them right away instead of
    // leaving whatever the previous owner left on the controller.
    this.engine.syncOutput()
    return ok
  }

  /** Re-read the device layout and make sure the profile covers every zone. */
  private reconcile(): void {
    const reconciled = reconcileProfile(this.profileStore.profile, this.zones)
    this.profileStore.save(reconciled)
  }

  private get deviceInfo(): DeviceInfo {
    return { ...this.device.info, conflictSuspected: this.conflicts.conflicting }
  }

  private async refreshConflicts(): Promise<void> {
    try {
      this.conflicts = await detectConflicts()
    } catch {
      this.conflicts = { conflicting: false, processes: [], hint: '' }
    }
  }

  // --- window & tray ------------------------------------------------------

  createWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      return
    }
    this.window = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 960,
      minHeight: 620,
      show: false,
      backgroundColor: '#0b0d12',
      title: 'MyRGB',
      icon: resolveResource('build', 'icon.png') ?? undefined,
      webPreferences: {
        preload: join(app.getAppPath(), 'out', 'preload', 'index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.window.once('ready-to-show', () => {
      const hidden = process.argv.includes('--hidden')
      if (!hidden && !this.settings.settings.startWithLightingOff) this.window?.show()
    })

    this.window.on('close', (event) => {
      if (!this.quitting && this.settings.settings.minimizeToTray) {
        event.preventDefault()
        this.window?.hide()
      }
    })

    this.window.on('closed', () => {
      this.window = null
    })

    // External links open in the user's browser, never inside the app.
    this.window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    // Surface renderer problems in the terminal instead of hiding them.
    this.window.webContents.on('console-message', (event) => {
      const level = event.level
      if (level === 'error' || level === 'warning') {
        console.warn(`[renderer:${level}] ${event.message}`)
      }
    })
    this.window.webContents.on('render-process-gone', (_e, details) => {
      console.error(`[renderer] process gone: ${details.reason}`)
    })

    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (isDev && devUrl) {
      void this.window.loadURL(devUrl)
    } else {
      void this.window.loadFile(join(app.getAppPath(), 'out', 'renderer', 'index.html'))
    }
  }

  private createTray(): void {
    this.trayHandle = createTray({
      onShow: () => {
        this.createWindow()
        this.window?.show()
        this.window?.focus()
      },
      onToggle: () => {
        const next = !this.profileStore.profile.global.outputEnabled
        const profile = this.profileStore.setGlobal({ outputEnabled: next })
        this.engine.setProfile(profile)
      },
      onQuit: () => {
        this.quitting = true
        app.quit()
      },
      lightsEnabled: () => this.profileStore.profile.global.outputEnabled,
      profileName: () => this.profileStore.profile.name
    })
  }

  // --- engine -------------------------------------------------------------

  private pushFrame(frame: Frame): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.engineFrame, frame)
    }
  }

  private pushError(message: string): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.engineState, {
        running: this.engine.isRunning,
        fps: this.profileStore.profile.global.fps,
        lastFrameSeq: -1,
        error: message
      } as EngineState & { error: string })
    }
  }

  private emitEngineState(): void {
    const state = this.engineState
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.engineState, state)
    }
  }

  private get engineState(): EngineState {
    return {
      running: this.engine.isRunning,
      fps: this.profileStore.profile.global.fps,
      lastFrameSeq: -1
    }
  }

  // --- IPC ----------------------------------------------------------------

  private registerIpc(): void {
    const store = this.profileStore

    ipcMain.handle(IPC.deviceInfo, () => this.deviceInfo)
    ipcMain.handle(IPC.deviceReconnect, async () => {
      this.device.close()
      await this.openDevice()
      await this.refreshConflicts()
      return this.deviceInfo
    })
    ipcMain.handle(IPC.zonesList, () => this.zones)
    ipcMain.handle(IPC.patternsList, () => patternMetadata())
    ipcMain.handle(IPC.profileGet, () => store.profile)
    ipcMain.handle(IPC.profileSave, (_e, profile: Profile) => store.save(profile))
    ipcMain.handle(IPC.profileDuplicate, (_e, name: string) => {
      const profile = store.duplicateProfile(name)
      this.engine.setProfile(profile)
      this.emitProfile(profile)
      return profile
    })
    ipcMain.handle(IPC.profileRename, (_e, name: string) => {
      const profile = store.renameProfile(name)
      this.engine.setProfile(profile)
      this.emitProfile(profile)
      return profile
    })
    ipcMain.handle(IPC.profileList, () => store.list())
    ipcMain.handle(IPC.profileLoad, (_e, id: string) => {
      const profile = store.load(id)
      this.engine.setProfile(profile)
      this.settings.set({ lastProfile: id })
      this.emitProfile(profile)
      return profile
    })
    ipcMain.handle(IPC.profileDelete, (_e, id: string) => store.delete(id))
    ipcMain.handle(IPC.profileSetZone, (_e, zoneId: string, effect) => {
      const profile = store.setZoneEffect(zoneId, effect)
      this.engine.setProfile(profile)
      this.emitProfile(profile)
      return profile
    })
    ipcMain.handle(IPC.profileSetZoneConfig, (_e, zoneId: string, patch) => {
      const profile = store.setZoneConfig(zoneId, patch)
      this.engine.setProfile(profile)
      this.emitProfile(profile)
      return profile
    })
    ipcMain.handle(IPC.profileSetPalette, (_e, palette) => {
      const profile = store.setPalette(palette)
      this.engine.setProfile(profile)
      this.emitProfile(profile)
      return profile
    })
    ipcMain.handle(IPC.profileRemovePalette, (_e, paletteId: string) => {
      const profile = store.removePalette(paletteId)
      this.engine.setProfile(profile)
      this.emitProfile(profile)
      return profile
    })
    ipcMain.handle(IPC.profileSetGlobal, (_e, patch) => {
      const profile = store.setGlobal(patch)
      this.engine.setProfile(profile)
      this.emitProfile(profile)
      return profile
    })
    ipcMain.handle(IPC.engineStart, () => {
      this.engine.start()
      this.emitEngineState()
      return this.engineState
    })
    ipcMain.handle(IPC.engineStop, () => {
      this.engine.stop()
      this.emitEngineState()
      return this.engineState
    })
    ipcMain.handle(IPC.engineState, () => this.engineState)
    ipcMain.handle(IPC.settingsGet, () => this.settings.settings)
    ipcMain.handle(IPC.settingsSet, (_e, patch) => {
      const settings = this.settings.set(patch)
      if (patch.autostartAtLogin !== undefined) {
        this.applyAutostart(settings.autostartAtLogin)
      }
      return settings
    })
  }

  /**
   * Register (or remove) the app as a login item.
   *
   * Electron maps this to the Windows registry on Windows and to a
   * .desktop autostart entry on Linux, so the same code covers both.
   */
  private applyAutostart(enabled: boolean): void {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        // Start hidden in the tray when the user logs in.
        args: enabled ? ['--hidden'] : []
      })
    } catch (err) {
      console.warn(`Could not change the autostart entry: ${errorMessage(err)}`)
    }
  }

  private emitProfile(profile: Profile): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.profileGet, profile)
    }
  }

  get mainWindow(): BrowserWindow | null {
    return this.window
  }

  /** Release everything before the app quits. */
  shutdown(): void {
    this.engine?.stop()
    this.profileStore?.flush()
    this.trayHandle?.tray.destroy()
    this.trayHandle = null
    this.device.close()
  }
}

// ---------------------------------------------------------------------------
// CLI modes
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1]
  return undefined
}

async function runHeadlessDump(): Promise<void> {
  const outDir = argValue('--dump-frames')
  if (!outDir) return

  const frameCount = Number(argValue('--dump-count') ?? '120')
  const offline = process.argv.includes('--dump-offline')

  const device = new AuraUsbDevice()
  let zones: ZoneState[] = []
  if (!offline) {
    const ok = await device.open()
    if (ok && device.info.layout) zones = buildZones(device.info.layout)
  }

  const profile = defaultProfile(zones)
  const reconciled = reconcileProfile(profile, zones)
  const files = await runFrameDump({
    outDir,
    frameCount,
    profile: reconciled,
    zones,
    device: offline ? null : device
  })

  console.log(`wrote ${files.length} frames to ${outDir}`)
  device.close()
  app.exit(0)
}

/**
 * Hardware smoke test: writes a rainbow gradient to every zone.
 *
 * This exercises the exact production code path - the same protocol module,
 * the same device class - so a pass here means the real LEDs work.
 */
async function runWriteTest(): Promise<void> {
  const device = new AuraUsbDevice()
  const ok = await device.open()
  if (!ok) {
    console.error('could not open device:', device.info.error)
    app.exit(1)
    return
  }

  const layout = device.info.layout!
  const zones = buildZones(layout)
  console.log(`firmware : ${device.info.firmware}`)
  console.log(`layout   : ${JSON.stringify(layout)}`)
  console.log(`zones    : ${zones.map((z) => `${z.id}->ch${z.directChannel}`).join(', ')}`)

  const palette: Palette = {
    id: 'test',
    name: 'test',
    interpolation: 'hsv',
    stops: [
      { position: 0, color: '#ff0040' },
      { position: 0.25, color: '#ffd000' },
      { position: 0.5, color: '#00ff66' },
      { position: 0.75, color: '#00c8ff' },
      { position: 1, color: '#ff0040' }
    ]
  }

  for (const zone of zones) {
    const count = zone.kind === 'addressable' ? 72 : zone.maxLedCount
    const colors: RGB[] = []
    for (let i = 0; i < count; i++) {
      colors.push(samplePalette(palette, count > 1 ? i / (count - 1) : 0))
    }
    device.setChannelLeds(zone.directChannel, colors)
    console.log(`wrote ${count} LEDs to ${zone.id} (direct channel ${zone.directChannel})`)
  }

  console.log('OK')
  device.close()
  app.exit(0)
}

/**
 * UI self test.
 *
 * Boots the real app, lets the renderer settle, then inspects the DOM from
 * the main process. Verifies that the renderer mounted, that the IPC bridge
 * works and that frames are actually flowing.
 */
async function runSelfTest(): Promise<void> {
  const instance = new MyRgbApp()
  await instance.start()

  const window = instance.mainWindow
  if (!window) {
    console.error('SELFTEST FAIL: no window')
    app.exit(1)
    return
  }

  await new Promise<void>((resolve) => {
    if (!window.webContents.isLoading()) return resolve()
    window.webContents.once('did-finish-load', () => resolve())
    setTimeout(resolve, 8000)
  })

  await new Promise((resolve) => setTimeout(resolve, 2500))

  const report = await window.webContents.executeJavaScript(`
    (() => ({
      mounted: (document.getElementById('root')?.children.length ?? 0) > 0,
      bridge: typeof window.myrgb === 'object',
      buttons: document.querySelectorAll('button').length,
      canvases: document.querySelectorAll('canvas').length,
      sliders: document.querySelectorAll('input[type=range]').length,
      frames: window.__myRgbFrameCount ?? 0,
      zoneRail: /zonas/i.test(document.body.innerText),
      effects: /efeitos/i.test(document.body.innerText),
      gradient: /gradiente/i.test(document.body.innerText)
    }))()
  `)

  console.log('SELFTEST ' + JSON.stringify(report, null, 2))
  const ok =
    report.mounted && report.bridge && report.buttons > 10 && report.canvases === 1 && report.frames > 0
  console.log(ok ? 'SELFTEST PASS' : 'SELFTEST FAIL')
  app.exit(ok ? 0 : 1)
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const instance = (globalThis as { __myRgbApp?: MyRgbApp }).__myRgbApp
    instance?.createWindow()
  })

  void app.whenReady().then(async () => {
    if (process.argv.includes('--selftest')) {
      await runSelfTest()
      return
    }
    if (process.argv.includes('--write-test')) {
      await runWriteTest()
      return
    }
    if (process.argv.includes('--dump-frames')) {
      await runHeadlessDump()
      return
    }

    app.setAppUserModelId('com.myrgb.app')

    const instance = new MyRgbApp()
    ;(globalThis as { __myRgbApp?: MyRgbApp }).__myRgbApp = instance
    await instance.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) instance.createWindow()
    })
  })

  app.on('window-all-closed', () => {
    // The tray keeps the app alive on both platforms.
  })

  app.on('before-quit', () => {
    ;(globalThis as { __myRgbApp?: MyRgbApp }).__myRgbApp?.shutdown()
  })
}
