/**
 * Main process.
 *
 * Owns the hardware, the engine and the profile store, and exposes them to
 * the renderer over a narrow IPC surface. The renderer never touches HID.
 */

import { app, BrowserWindow, globalShortcut, shell } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { AuraUsbDevice } from './aura/auraDevice'
import { EffectEngine } from './engine/engine'
import { LightRouter } from './light/router'
import { AuraBackend } from './light/backends/aura'
import { defaultProfile, ProfileStore, reconcileProfile } from './store/profileStore'
import { SettingsStore } from './store/settings'
import { buildZones } from './zones'
import { createTray, type TrayHandle } from './tray'
import { resolveResource } from './resources'
import { detectConflicts, type ConflictReport } from './platform/conflict'
import { runFrameDump } from './dumpFrames'
import { buildEffectsDoc } from './docs/effectsDoc'
import { initAutoUpdater } from './updater'
import { registerIpc } from './ipc/register'
import { SensorsStore } from './features/sensors/store'
import { BottleneckService } from './features/bottleneck'
import { FpsService } from './features/overlay/fps'
import { OverlayService } from './features/overlay/manager'
import { findHelperPath, helperCandidates, HelperBridge } from './features/overlay/helper'
import type { OverlayState } from '@shared/features/overlay'
import type { DeviceInfo, Frame, Palette, Profile, RGB, ZoneState } from '@shared/types'
import { IPC } from '@shared/types'
import { samplePalette } from './engine/palette'
import type { EngineState } from '@shared/api'
import type { SensorsSnapshot } from '@shared/features/sensors'
import type { BottleneckUpdate } from '@shared/features/bottleneck'

const isDev = !app.isPackaged

/** How often to look for other programs fighting us for the controller. */
const CONFLICT_POLL_MS = 5000
/** How often to check whether the controller was plugged or unplugged. */
const DEVICE_POLL_MS = 3000

class MyRgbApp {
  private device = new AuraUsbDevice()
  zones: ZoneState[] = []
  engine!: EffectEngine
  /** Where frames are written. One backend today (AURA), one per target. */
  light!: LightRouter
  profileStore!: ProfileStore
  settings!: SettingsStore
  /** Live sensor stream, started by the Sensores page and stopped on quit. */
  sensors!: SensorsStore
  /** Live limiter and session report, fed by the sensor stream. */
  bottleneck!: BottleneckService
  /** FPS from the ETW helper (Windows) or an unavailable capability. */
  fps!: FpsService
  /** Transparent overlay over the game. */
  overlay!: OverlayService
  window: BrowserWindow | null = null
  private trayHandle: TrayHandle | null = null
  private conflicts: ConflictReport = { conflicting: false, processes: [], hint: '' }
  private conflictTimer: NodeJS.Timeout | null = null
  private deviceTimer: NodeJS.Timeout | null = null
  /** Whether the controller was attached during the previous check. */
  private devicePresent = false
  /** Last hardware write error, forwarded to the UI. */
  private lastEngineError: string | null = null
  /** Disk/app messages waiting for a window to show them. */
  private pendingAppErrors: string[] = []
  private quitting = false

  async start(): Promise<void> {
    this.settings = new SettingsStore(app.getPath('userData'), (message) =>
      this.emitAppError(message)
    )

    const initial = defaultProfile()
    this.profileStore = new ProfileStore(app.getPath('userData'), initial, {
      onSaved: (name) => this.emitProfileSaved(name),
      onError: (message) => this.emitAppError(message)
    })
    const startup = this.settings.settings.startupProfile || this.settings.settings.lastProfile
    try {
      this.profileStore.load(startup)
    } catch {
      /* keep the default profile */
    }

    // The pointer must match the profile that was really loaded. A profile
    // renamed outside the app (or saved under a sanitised file name) would
    // otherwise be looked up by the old name on the next start.
    this.settings.set({ lastProfile: this.profileStore.profile.name })

    // "Open with the lights off" means the output starts disabled - the
    // window still opens normally. Applying it here, before the device is
    // opened, is what actually darkens the LEDs on startup.
    if (
      this.settings.settings.startWithLightingOff &&
      this.profileStore.profile.global.outputEnabled
    ) {
      this.profileStore.setGlobal({ outputEnabled: false })
    }

    this.engine = new EffectEngine(this.profileStore.profile, this.zones, {
      onFrame: (frame) => this.pushFrame(frame),
      onError: (message) => this.pushError(message)
    })

    // The router owns the write path (and, later, the other backends). The
    // AURA controller stays opened by this class, so registering it changes
    // nothing about when the device is claimed or released.
    this.light = new LightRouter({
      onError: (message) => this.emitAppError(`Iluminação externa: ${message}`)
    })
    this.light.register(new AuraBackend(this.device))
    this.engine.setOutput(this.light)

    // The sensor poll runs only while a page is subscribed (and the window is
    // visible), so creating it here costs nothing.
    this.fps = new FpsService({
      createBridge: () => {
        // Absent helper is a capability, not an error: no FPS, overlay still on.
        const executable = findHelperPath(
          helperCandidates(app.getAppPath(), process.resourcesPath)
        )
        return executable ? new HelperBridge({ executable }) : null
      },
      onStatus: () => this.pushOverlayState()
    })

    this.sensors = new SensorsStore({
      onBatch: (snapshot) => this.pushSensors(snapshot),
      // The overlay must keep collecting while the main window is hidden over
      // a game, so it counts as a reason to poll.
      canPoll: () =>
        this.overlay?.needsSensors() === true ||
        (this.window !== null && !this.window.isDestroyed() && this.window.isVisible()),
      onError: (message) => this.emitAppError(`Sensores: ${message}`)
    })

    // The bottleneck reads the same batches; it never collects on its own.
    this.bottleneck = new BottleneckService({
      sensors: this.sensors,
      fps: this.fps,
      onUpdate: (update) => this.pushBottleneck(update),
      onError: (message) => this.emitAppError(`Gargalo: ${message}`)
    })

    this.overlay = new OverlayService({
      settings: this.settings,
      sensors: this.sensors,
      fps: this.fps,
      preload: join(app.getAppPath(), 'out', 'preload', 'index.js'),
      load: (window) => {
        const devUrl = process.env.ELECTRON_RENDERER_URL
        if (isDev && devUrl) {
          void window.loadURL(`${devUrl}/overlay.html`)
        } else {
          void window.loadFile(join(app.getAppPath(), 'out', 'renderer', 'overlay.html'))
        }
      },
      onState: (state) => this.pushOverlayState(state),
      onError: (message) => this.emitAppError(`Overlay: ${message}`)
    })

    await this.openDevice()
    this.refreshConflicts()
    this.startConflictWatch()
    this.startDeviceWatch()

    this.createWindow()
    this.createTray()
    this.installIpc()
    await this.overlay.start()

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
    if (ok) this.lastEngineError = null
    this.reconcile()
    this.engine.setZones(this.zones)
    // Targets follow the profile; reconcile() has just (re)derived the AURA
    // ones from the layout, so the router addresses exactly the zones above.
    // Set before the profile, because `setProfile` re-applies the output state.
    this.light.setTargets(this.profileStore.profile.targets ?? [])
    // reconcile() may have added zones or fixed their LED counts. The engine
    // holds its own reference to the profile, so it has to be told about the
    // new one - otherwise the first start (and every newly connected zone)
    // renders with the old, zoneless profile.
    this.engine.setProfile(this.profileStore.profile)
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

  get deviceInfo(): DeviceInfo {
    return { ...this.device.info, conflictSuspected: this.conflicts.conflicting }
  }

  /** Reopen the controller. Used by the "Reconectar" button. */
  async reconnect(): Promise<DeviceInfo> {
    this.device.close()
    await this.openDevice()
    await this.refreshConflicts()
    return this.deviceInfo
  }

  /** Redraw the tray menu after something it displays changed. */
  refreshTray(): void {
    this.trayHandle?.refresh()
  }

  /** Forget the last hardware error before starting the engine again. */
  clearEngineError(): void {
    this.lastEngineError = null
  }

  private async refreshConflicts(): Promise<void> {
    const before = this.conflicts.conflicting
    try {
      this.conflicts = await detectConflicts()
    } catch {
      this.conflicts = { conflicting: false, processes: [], hint: '' }
    }

    // Another program may start driving the controller at any time - the
    // Armoury Crate service in particular comes up after the user logs in.
    // Tell the UI as soon as the situation changes.
    if (before !== this.conflicts.conflicting) {
      this.pushDeviceInfo()
    }
  }

  /**
   * Keep an eye on other programs that may fight us for the controller.
   *
   * The check is cheap (one process listing) but it has to run periodically:
   * a conflict that appears after startup is exactly the one that causes
   * flickering the user cannot explain.
   */
  private startConflictWatch(): void {
    if (this.conflictTimer) clearInterval(this.conflictTimer)
    this.conflictTimer = setInterval(() => {
      void this.refreshConflicts()
    }, CONFLICT_POLL_MS)
  }

  /**
   * Watch the USB bus for the controller being unplugged or plugged back in.
   *
   * Without this, pulling the cable leaves the engine stopped on the first
   * write error while the UI still says "connected". The handle can also
   * survive an unplug on some platforms, so the presence check uses the HID
   * device list instead of `device.connected`.
   */
  private startDeviceWatch(): void {
    if (this.deviceTimer) clearInterval(this.deviceTimer)
    this.devicePresent = AuraUsbDevice.list().length > 0
    this.deviceTimer = setInterval(() => {
      void this.checkDevicePresence()
    }, DEVICE_POLL_MS)
  }

  private async checkDevicePresence(): Promise<void> {
    const present = AuraUsbDevice.list().length > 0
    if (present === this.devicePresent) return
    this.devicePresent = present

    if (!present) {
      this.device.markDisconnected(
        'O controlador AURA foi desconectado. Reconecte o cabo USB.'
      )
      this.zones = []
      this.engine.setZones([])
      this.light.setTargets([])
      this.lastEngineError = null
      this.pushDeviceInfo()
      this.emitEngineState()
      return
    }

    // Plugged back in: claim the channels and restore the current profile.
    await this.openDevice()
    await this.refreshConflicts()
    this.pushDeviceInfo()
    this.emitProfile(this.profileStore.profile)
    this.emitEngineState()
  }

  // --- window & tray ------------------------------------------------------

  createWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      return
    }
    this.window = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 1120,
      minHeight: 680,
      show: false,
      backgroundColor: '#000000',
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
      // Only the autostart flag hides the window. "Open with the lights off"
      // affects the hardware output, never the window.
      if (!process.argv.includes('--hidden')) this.window?.show()
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

    // Tell the UI about writes that failed before it was even open.
    this.window.webContents.once('did-finish-load', () => this.flushAppErrors())

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
        // The renderer owns the "Luzes" button; without this push the first
        // click in the window looks like it did nothing.
        this.emitProfile(profile)
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
    this.lastEngineError = message
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.engineState, this.engineState)
    }
  }

  private pushSensors(snapshot: SensorsSnapshot): void {
    // Even when the Sensores page is closed, a bottleneck session may be
    // running on this batch; it keeps its own reference on the poll. The FPS
    // sample comes from the same 500 ms poll the overlay uses.
    this.bottleneck.ingest(snapshot, this.fps?.latest()?.fps)
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.sensorsBatch, snapshot)
    }
  }

  private pushBottleneck(update: BottleneckUpdate): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.bottleneckSample, update)
    }
  }

  /** Overlay state to the settings page (never to the overlay itself). */
  private pushOverlayState(state?: OverlayState): void {
    const current = state ?? this.overlay?.state()
    if (!current) return
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.overlayState, current)
    }
  }

  private pushDeviceInfo(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.deviceInfo, this.deviceInfo)
    }
  }

  emitEngineState(): void {
    const state = this.engineState
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.engineState, state)
    }
  }

  get engineState(): EngineState {
    return {
      running: this.engine.isRunning,
      fps: this.profileStore.profile.global.fps,
      lastFrameSeq: -1,
      error: this.lastEngineError
    }
  }

  // --- IPC ----------------------------------------------------------------

  /**
   * Hand the application to the IPC layer. All channels live in
   * `ipc/register.ts`, so the surface stays auditable in one place.
   */
  private installIpc(): void {
    registerIpc(this)
  }

  /**
   * Register (or remove) the app as a login item.
   *
   * Electron maps this to the Windows registry on Windows and to a
   * .desktop autostart entry on Linux, so the same code covers both.
   */
  applyAutostart(enabled: boolean): void {
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

  emitProfile(profile: Profile): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.profileGet, profile)
    }
  }

  /**
   * Keep the startup pointers in sync when a profile is renamed or saved
   * under a new name. Otherwise the next start looks for the old file, does
   * not find it and silently falls back to the default profile.
   */
  rememberProfileName(before: string, after: string): void {
    if (!before || before === after) return
    this.settings.set({
      lastProfile: after,
      ...(this.settings.settings.startupProfile === before ? { startupProfile: after } : {})
    })
    this.trayHandle?.refresh()
  }

  /**
   * Tell the UI that the profile really reached the disk.
   *
   * The renderer writes nothing itself, so this is the only way it can tell
   * "still in memory" from "saved".
   */
  private emitProfileSaved(name: string): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.profileSaved, { name, at: Date.now() })
    }
  }

  /**
   * Report a failure outside the lighting engine - typically a profile or
   * settings write that the disk refused.
   *
   * Failures during startup happen before the window exists, so those are
   * kept and delivered once the renderer is ready instead of being lost.
   */
  private emitAppError(message: string): void {
    console.error(`[app] ${message}`)
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.appError, message)
      return
    }
    if (this.pendingAppErrors.length < 5) this.pendingAppErrors.push(message)
  }

  private flushAppErrors(): void {
    if (!this.window || this.window.isDestroyed()) return
    for (const message of this.pendingAppErrors.splice(0)) {
      this.window.webContents.send(IPC.appError, message)
    }
  }

  get mainWindow(): BrowserWindow | null {
    return this.window
  }

  /** Release everything before the app quits. */
  shutdown(): void {
    this.engine?.stop()
    this.overlay?.dispose()
    this.bottleneck?.dispose()
    this.fps?.dispose()
    this.sensors?.dispose()
    this.light?.dispose()
    if (this.conflictTimer) {
      clearInterval(this.conflictTimer)
      this.conflictTimer = null
    }
    if (this.deviceTimer) {
      clearInterval(this.deviceTimer)
      this.deviceTimer = null
    }
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

  // Wait for the renderer to finish loading its data and for the engine to
  // actually produce frames. A fixed delay is flaky: an AppImage has to
  // mount its filesystem first and can take a while to get there.
  const deadline = Date.now() + 20000
  for (;;) {
    const settled = await window.webContents.executeJavaScript(
      `window.__myRgbReady === true`
    )
    if (settled) break
    if (Date.now() > deadline) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  // Give the engine a moment to emit frames.
  const frameDeadline = Date.now() + 8000
  for (;;) {
    const frames = await window.webContents.executeJavaScript(
      `window.__myRgbFrameCount ?? 0`
    )
    if (frames > 0 || Date.now() > frameDeadline) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  // The app may have been left on another page on the previous run. Every
  // check below is about the lighting screen, so open it explicitly - and use
  // the round trip to prove the sidebar really swaps pages.
  //
  // The diagnostic pages are visited too: their data arrives from the main
  // process, so this is the only place that proves the whole path (collector
  // -> IPC -> bridge -> card) works in a packaged app.
  await window.webContents.executeJavaScript(`
    (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const waitFor = async (check, timeout = 8000) => {
        const end = Date.now() + timeout
        while (Date.now() < end) {
          if (check()) return true
          await sleep(150)
        }
        return check()
      }
      const text = () => document.body.innerText

      window.__myRgbNavigate && window.__myRgbNavigate('system')
      await waitFor(
        () => /Sistema operacional/.test(text()) && document.querySelectorAll('section.card').length >= 4
      )
      const systemHeader = document.querySelector('header')
      window.__myRgbPageSwitch =
        document.querySelector('.page-title')?.textContent === 'Sistema' &&
        systemHeader?.querySelector('select') === null &&
        !/Salvar/.test(systemHeader?.textContent ?? '')
      window.__myRgbSystemReady =
        document.querySelectorAll('section.card').length >= 5 &&
        /processador/i.test(text()) &&
        !/lendo o hardware/i.test(text())

      // Sensores: the stream arrives from the main process, so this proves
      // the poll -> IPC -> bridge -> table path. Pausing and resuming has to
      // work too, otherwise the stream would keep running after leaving.
      window.__myRgbNavigate && window.__myRgbNavigate('sensors')
      await waitFor(
        () => document.querySelectorAll('.sensor-row').length > 0 && /ao vivo/.test(text()),
        12000
      )
      const sensorRows = document.querySelectorAll('.sensor-row').length
      const pauseButton = Array.from(document.querySelectorAll('button')).find((button) =>
        /Pausar/.test(button.textContent ?? '')
      )
      if (pauseButton instanceof HTMLElement) pauseButton.click()
      await waitFor(() => /pausado/.test(text()), 3000)
      const paused = /pausado/.test(text())
      if (pauseButton instanceof HTMLElement) pauseButton.click()
      await waitFor(() => /ao vivo/.test(text()), 5000)
      window.__myRgbSensorsReady =
        sensorRows > 0 &&
        paused &&
        /ao vivo/.test(text()) &&
        document.querySelector('.page-title')?.textContent === 'Sensores'

      // Cards that share a grid row must end on the same line: a long list
      // used to stretch its own row and leave a hole under the shorter card.
      // The sensor groups are bounded, so a machine with 40 readings scrolls
      // inside the card instead of pushing the rest of the page down.
      const rowHeight = new Map()
      let cardsAligned = true
      for (const card of document.querySelectorAll('section.card')) {
        const rect = card.getBoundingClientRect()
        const key = Math.round(rect.top)
        const height = Math.round(rect.height)
        const seen = rowHeight.get(key)
        if (seen === undefined) rowHeight.set(key, height)
        else if (Math.abs(seen - height) > 1) cardsAligned = false
      }
      window.__myRgbCardsAligned = cardsAligned
      const bounded = Array.from(document.querySelectorAll('section.card.card-scroll'))
      const cap = Math.min(window.innerHeight * 0.62, 620)
      window.__myRgbSensorsScroll =
        bounded.length >= 2 &&
        bounded.every(
          (card) =>
            card.scrollHeight <= card.clientHeight + 1 &&
            card.getBoundingClientRect().height <= cap + 1
        )

      window.__myRgbNavigate && window.__myRgbNavigate('disks')
      await waitFor(() => document.querySelectorAll('svg circle').length >= 2)
      window.__myRgbDrivesReady =
        document.querySelectorAll('svg circle').length >= 2 && /Unidades/.test(text())

      const healthTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
        /Saúde/.test(tab.textContent ?? '')
      )
      if (healthTab instanceof HTMLElement) healthTab.click()
      // The health read crosses smartctl / CIM; 15 s covers a slow disk or a
      // first-time PowerShell start.
      await waitFor(() => document.querySelectorAll('.disk-health').length >= 1, 15000)
      window.__myRgbHealthTab =
        document.querySelectorAll('.disk-health').length >= 1 && /Saúde/.test(text())

      // Rede: the full test saturates the link for ~30 s, too long for the
      // self test. Starting it and cancelling proves the IPC, the progress
      // push and the cancellation path without holding the network.
      window.__myRgbNavigate && window.__myRgbNavigate('network')
      await waitFor(() => /o que o teste mede/i.test(text()), 8000)
      const intro = /o que o teste mede/i.test(text())
      const diagnose = Array.from(document.querySelectorAll('button')).find((button) =>
        /Diagnosticar/.test(button.textContent ?? '')
      )
      if (diagnose instanceof HTMLElement) diagnose.click()
      await waitFor(() => /Medindo latência e perda/.test(text()), 8000)
      const started = /Medindo latência e perda/.test(text())
      const cancelNet = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Cancelar'
      )
      if (cancelNet instanceof HTMLElement) cancelNet.click()
      await waitFor(() => /Teste cancelado/.test(text()), 10000)
      window.__myRgbNetworkReady =
        intro &&
        started &&
        /Teste cancelado/.test(text()) &&
        document.querySelector('.page-title')?.textContent === 'Rede'

      // Jogos: the local estimate needs no key and no network, so the table
      // must fill with 32 rows. Changing the resolution has to recompute the
      // numbers, which proves the options reach the main process.
      window.__myRgbNavigate && window.__myRgbNavigate('games')
      await waitFor(
        () => document.querySelectorAll('tbody tr').length >= 30 && /estimativa local/i.test(text()),
        15000
      )
      const gameRows = document.querySelectorAll('tbody tr').length
      const firstFps = () =>
        document.querySelector('tbody tr td:nth-child(2) .font-mono')?.textContent?.trim()
      const fpsBefore = firstFps()
      const chip4k = Array.from(document.querySelectorAll('button.chip')).find(
        (button) => button.textContent?.trim() === '4K'
      )
      if (chip4k instanceof HTMLElement) chip4k.click()
      await waitFor(() => firstFps() !== fpsBefore, 8000)
      window.__myRgbGamesReady =
        gameRows >= 30 &&
        fpsBefore !== undefined &&
        fpsBefore.length > 0 &&
        firstFps() !== fpsBefore &&
        /estimativa local/i.test(text()) &&
        document.querySelector('.page-title')?.textContent === 'Jogos'

      // Gargalo: the live block is fed by the same sensor poll as the Sensores
      // page. Starting and cancelling a session proves the extra reference and
      // the cancellation path without waiting a whole minute.
      window.__myRgbNavigate && window.__myRgbNavigate('bottleneck')
      await waitFor(
        () =>
          document.querySelectorAll('[data-meter]').length >= 5 &&
          /Limitador agora/.test(text()),
        15000
      )
      const liveMeters = document.querySelectorAll('[data-meter]').length
      const startBottleneck = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Iniciar análise'
      )
      if (startBottleneck instanceof HTMLElement) startBottleneck.click()
      await waitFor(() => /Coletando/.test(text()), 8000)
      const collecting = /Coletando/.test(text())
      const cancelBottleneck = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Cancelar'
      )
      if (cancelBottleneck instanceof HTMLElement) cancelBottleneck.click()
      await waitFor(() => /Análise cancelada/.test(text()), 8000)
      window.__myRgbBottleneckReady =
        liveMeters >= 5 &&
        collecting &&
        /Análise cancelada/.test(text()) &&
        document.querySelector('.page-title')?.textContent === 'Gargalo'

      // Overlay: the switch has to create the real transparent window in the
      // main process (state.open), reflect it on the page, and close it again.
      // Creating a BrowserWindow is exactly what the shortcut does, so this
      // covers the path that runs over a game.
      window.__myRgbNavigate && window.__myRgbNavigate('overlay')
      await waitFor(
        () => /Mostrar por cima do jogo/.test(text()) && /Atalho global/.test(text()),
        10000
      )
      const overlayTitle = document.querySelector('.page-title')?.textContent === 'Overlay'
      const overlaySwitch = document.querySelector('input[aria-label="Ligar o overlay"]')

      const overlayState = async (open) => {
        const end = Date.now() + 10000
        for (;;) {
          const state = await window.myrgb.getOverlayState()
          if (state.open === open || Date.now() > end) return state
          await sleep(200)
        }
      }

      let overlayOpened = false
      let overlayClosed = false
      if (overlaySwitch instanceof HTMLInputElement) {
        if (!overlaySwitch.checked) overlaySwitch.click()
        overlayOpened = (await overlayState(true)).open === true
        await waitFor(() => document.querySelector('.verdict')?.textContent === 'Ligado', 5000)
        const shownOnPage = document.querySelector('.verdict')?.textContent === 'Ligado'

        if (overlaySwitch instanceof HTMLInputElement && overlaySwitch.checked) {
          overlaySwitch.click()
        }
        overlayClosed = (await overlayState(false)).open === false
        await waitFor(() => document.querySelector('.verdict')?.textContent === 'Desligado', 5000)
        window.__myRgbOverlayReady =
          overlayTitle &&
          overlayOpened &&
          shownOnPage &&
          overlayClosed &&
          document.querySelector('.verdict')?.textContent === 'Desligado'
      }

      window.__myRgbNavigate && window.__myRgbNavigate('lighting')
      await sleep(400)
      // The profile controls only make sense on the lighting screen, and they
      // have to be back when it is open again.
      window.__myRgbProfileVisible = /Salvar/.test(
        document.querySelector('header')?.textContent ?? ''
      )
    })()
  `)

  const report = await window.webContents.executeJavaScript(`
    (async () => {
      // Probe every call the renderer makes on startup. One of them hanging
      // is what leaves the UI empty, and this says which one.
      const probe = {}
      const calls = [
        'getDeviceInfo',
        'listZones',
        'listPatterns',
        'getProfile',
        'getEngineState',
        'getSystem',
        'listDrives'
      ]
      for (const key of calls) {
        try {
          const value = await window.myrgb[key]()
          probe[key] = Array.isArray(value)
            ? 'array(' + value.length + ')'
            : typeof value === 'object' && value !== null
              ? JSON.stringify(value).slice(0, 120)
              : String(value)
        } catch (err) {
          probe[key] = 'ERROR: ' + String(err)
        }
      }

      return {
        mounted: (document.getElementById('root')?.children.length ?? 0) > 0,
        bridge: typeof window.myrgb === 'object',
        buttons: document.querySelectorAll('button').length,
        canvases: document.querySelectorAll('canvas').length,
        sliders: document.querySelectorAll('input[type=range]').length,
        frames: window.__myRgbFrameCount ?? 0,
        nav: document.querySelectorAll('.nav-item').length,
        pageSwitch: window.__myRgbPageSwitch === true,
        profileVisible: window.__myRgbProfileVisible === true,
        systemReady: window.__myRgbSystemReady === true,
        drivesReady: window.__myRgbDrivesReady === true,
        healthTab: window.__myRgbHealthTab === true,
        networkReady: window.__myRgbNetworkReady === true,
        gamesReady: window.__myRgbGamesReady === true,
        bottleneckReady: window.__myRgbBottleneckReady === true,
        overlayReady: window.__myRgbOverlayReady === true,
        sensorsReady: window.__myRgbSensorsReady === true,
        cardsAligned: window.__myRgbCardsAligned === true,
        sensorsScroll: window.__myRgbSensorsScroll === true,
        zoneRail: /zonas/i.test(document.body.innerText),
        effects: /efeitos/i.test(document.body.innerText),
        gradient: /gradiente/i.test(document.body.innerText),
        text: document.body.innerText.slice(0, 400),
        probe
      }
    })()
  `)

  // The global shortcut is what toggles the overlay over a game; registering
  // it is the part that can silently fail when another app owns the combo.
  report.shortcutRegistered = globalShortcut.isRegistered(
    instance.overlay.state().config.shortcut
  )

  console.log('SELFTEST ' + JSON.stringify(report, null, 2))
  const ok =
    report.mounted &&
    report.bridge &&
    report.buttons > 10 &&
    report.canvases === 1 &&
    report.frames > 0 &&
    report.nav > 0 &&
    report.pageSwitch === true &&
    report.profileVisible === true &&
    report.systemReady === true &&
    report.drivesReady === true &&
    report.healthTab === true &&
    report.networkReady === true &&
    report.gamesReady === true &&
    report.bottleneckReady === true &&
    report.overlayReady === true &&
    report.shortcutRegistered === true &&
    report.sensorsReady === true &&
    report.cardsAligned === true &&
    report.sensorsScroll === true
  console.log(ok ? 'SELFTEST PASS' : 'SELFTEST FAIL')
  app.exit(ok ? 0 : 1)
}

/**
 * Rewrites the effect catalogue from the pattern registry.
 *
 * The documentation is generated instead of written by hand, so it can never
 * describe an effect that does not exist (or hide one that does).
 */
async function runDocGeneration(): Promise<void> {
  const target = argValue('--gen-docs') ?? join(process.cwd(), 'documentation', 'efeitos.md')
  const content = buildEffectsDoc()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
  console.log(`wrote ${target} (${content.split('\n').length} lines)`)
  app.exit(0)
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
    if (process.argv.includes('--gen-docs')) {
      await runDocGeneration()
      return
    }

    app.setAppUserModelId('com.myrgb.app')
    initAutoUpdater()

    const instance = new MyRgbApp()
    ;(globalThis as { __myRgbApp?: MyRgbApp }).__myRgbApp = instance
    await instance.start()

    app.on('activate', () => {
      // The overlay window is also a BrowserWindow; count only the dashboard.
      if (!instance.mainWindow) instance.createWindow()
    })
  })

  app.on('window-all-closed', () => {
    // The tray keeps the app alive on both platforms.
  })

  app.on('before-quit', () => {
    ;(globalThis as { __myRgbApp?: MyRgbApp }).__myRgbApp?.shutdown()
  })
}
