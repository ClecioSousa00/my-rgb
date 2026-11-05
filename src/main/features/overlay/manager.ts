/**
 * Overlay window and its settings.
 *
 * The window is transparent, borderless, always on top and click-through: it
 * never takes focus from the game, never appears in the taskbar and ignores
 * the mouse. It shows on the display chosen in the page, in the chosen corner,
 * and follows the content size reported by the overlay bundle (scale changes
 * the card, the renderer measures it and asks for a new window size).
 *
 * The main process owns the frames: every 500 ms it formats one from the last
 * sensor batch and the FPS sample and pushes it. The overlay bundle has no
 * access to hardware and no polling of its own.
 *
 * Opening the overlay holds a reference on `SensorsStore` and on `FpsService`,
 * so both keep running while the main window is hidden over a game; closing
 * releases exactly what it took.
 */

import { BrowserWindow, globalShortcut, screen, type Display } from 'electron'
import type { SensorsSnapshot } from '@shared/features/sensors'
import type { SystemSnapshot } from '@shared/features/system'
import type {
  OverlayConfig,
  OverlayDisplay,
  OverlayFrame,
  OverlayState,
  OverlayStatus
} from '@shared/features/overlay'
import {
  DEFAULT_OVERLAY_CONFIG,
  formatAccelerator,
  normalizeOverlayConfig
} from '@shared/features/overlay'
import { IPC } from '@shared/types'
import type { SettingsStore } from '../../store/settings'
import { getSystem } from '../system/info'
import { FpsService } from './fps'
import { buildOverlayFrame } from './frame'
import { positionOverlay } from './position'

/** The two calls the overlay needs from `SensorsStore`. */
export interface SensorSource {
  start(): void
  stop(): void
  snapshot(): SensorsSnapshot | null
}

export interface OverlayServiceOptions {
  settings: SettingsStore
  sensors: SensorSource
  fps: FpsService
  /** Preload script, shared with the main window. */
  preload: string
  /** Loads `overlay.html` from the dev server or from `out/`. */
  load: (window: BrowserWindow) => void
  /** Sends the state to the settings page (main window). */
  onState?: (state: OverlayState) => void
  onError?: (message: string) => void
  /** Injected by the tests. */
  loadSystem?: () => Promise<SystemSnapshot>
  now?: () => number
  /** Frame push cadence. */
  frameMs?: number
}

const DEFAULT_SIZE = { width: 320, height: 150 }
const FRAME_MS = 500

function displayLabel(display: Display, index: number, primary: boolean): string {
  const name = display.label?.trim()
  const suffix = `${display.size.width}×${display.size.height}`
  if (name) return `${name} · ${suffix}`
  return `Tela ${index + 1}${primary ? ' (principal)' : ''} · ${suffix}`
}

export class OverlayService {
  private config: OverlayConfig
  private overlay: BrowserWindow | null = null
  private frameTimer: NodeJS.Timeout | null = null
  private size: { width: number; height: number } | null = null
  private sensorsHeld = false
  private fpsHeld = false
  private registeredShortcut: string | null = null
  private status: OverlayStatus = 'off'
  private message: string | undefined
  private lastStateKey = ''
  private disposed = false
  private ramTotalBytes: number | undefined
  private vramTotalBytes: number | undefined
  private readonly onDisplaysChanged = (): void => this.applyBounds()

  constructor(private readonly options: OverlayServiceOptions) {
    this.config = normalizeOverlayConfig(
      options.settings.settings.overlay ?? DEFAULT_OVERLAY_CONFIG
    )
  }

  /** Register the shortcut and restore the overlay if it was on. */
  async start(): Promise<OverlayState> {
    if (!this.registerShortcut(this.config.shortcut)) {
      this.message = `Não foi possível registrar o atalho ${formatAccelerator(this.config.shortcut)}.`
    }
    void this.loadHardware()
    screen.on('display-added', this.onDisplaysChanged)
    screen.on('display-removed', this.onDisplaysChanged)
    screen.on('display-metrics-changed', this.onDisplaysChanged)

    if (this.config.enabled) this.open()
    this.emitState()
    return this.state()
  }

  state(): OverlayState {
    return {
      config: this.config,
      open: this.overlay !== null && !this.overlay.isDestroyed(),
      status: this.status,
      ...(this.message ? { message: this.message } : {}),
      fps: this.options.fps.capabilities(),
      displays: this.displays()
    }
  }

  /** Whether the sensor poll must stay alive for the overlay. */
  needsSensors(): boolean {
    return this.overlay !== null && !this.overlay.isDestroyed()
  }

  displays(): OverlayDisplay[] {
    const primary = screen.getPrimaryDisplay()
    return screen.getAllDisplays().map((display, index) => ({
      id: display.id,
      label: displayLabel(display, index, display.id === primary.id),
      primary: display.id === primary.id,
      width: display.size.width,
      height: display.size.height
    }))
  }

  /** Apply a partial patch from the page and persist it. */
  async update(patch: Partial<OverlayConfig>): Promise<OverlayState> {
    const next = normalizeOverlayConfig({ ...this.config, ...patch }, this.config)
    this.message = undefined

    if (next.shortcut !== this.config.shortcut) {
      const previous = this.config.shortcut
      if (!this.registerShortcut(next.shortcut)) {
        // Put the working shortcut back before giving up on the new one.
        this.registerShortcut(previous)
        next.shortcut = previous
        this.message = `Não foi possível registrar o atalho ${formatAccelerator(
          normalizeOverlayConfig({ shortcut: patch.shortcut }).shortcut
        )}.`
      }
    }

    this.config = next
    this.options.settings.set({ overlay: next })

    if (this.config.enabled && !this.overlay) this.open()
    else if (!this.config.enabled && this.overlay) this.closeWindow()

    if (!this.config.enabled) this.status = 'off'
    else if (this.overlay) this.status = 'active'

    this.applyBounds()
    if (this.overlay) this.pushFrame()
    this.emitState()
    return this.state()
  }

  /** The switch and the global shortcut both come here. */
  async toggle(): Promise<OverlayState> {
    return this.update({ enabled: !this.config.enabled })
  }

  /** New content size reported by the overlay bundle. */
  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    this.size = {
      width: Math.max(1, Math.min(4000, Math.round(width))),
      height: Math.max(1, Math.min(4000, Math.round(height)))
    }
    this.applyBounds()
    this.showIfReady()
  }

  /** Try the helper again after a failure (UAC refused, helper killed). */
  retryFps(): OverlayState {
    this.options.fps.retry()
    this.emitState()
    return this.state()
  }

  dispose(): void {
    this.disposed = true
    screen.off('display-added', this.onDisplaysChanged)
    screen.off('display-removed', this.onDisplaysChanged)
    screen.off('display-metrics-changed', this.onDisplaysChanged)
    this.clearFrameTimer()
    if (this.registeredShortcut) {
      globalShortcut.unregister(this.registeredShortcut)
      this.registeredShortcut = null
    }
    this.releaseSensors()
    this.releaseFps()
    const window = this.overlay
    this.overlay = null
    if (window && !window.isDestroyed()) {
      window.removeAllListeners('closed')
      window.destroy()
    }
  }

  // --- window -------------------------------------------------------------

  private open(): void {
    if (this.overlay || this.disposed) return

    try {
      const window = new BrowserWindow({
        width: DEFAULT_SIZE.width,
        height: DEFAULT_SIZE.height,
        x: 0,
        y: 0,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        focusable: false,
        alwaysOnTop: true,
        title: 'MyRGB overlay',
        webPreferences: {
          preload: this.options.preload,
          sandbox: false,
          contextIsolation: true,
          nodeIntegration: false,
          // The overlay is the only window on screen while a game runs; it must
          // keep painting even when Chromium thinks it is in the background.
          backgroundThrottling: false
        }
      })
      this.overlay = window
      this.status = 'active'
      this.message = undefined
      this.size = null

      window.setAlwaysOnTop(true, 'screen-saver')
      window.setIgnoreMouseEvents(true)
      window.setSkipTaskbar(true)
      try {
        // macOS keeps it over full-screen apps; other platforms ignore it.
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      } catch {
        // Not supported everywhere; the window is still always on top.
      }

      window.webContents.once('did-finish-load', () => {
        if (this.overlay !== window) return
        this.pushFrame()
        this.showIfReady()
      })

      window.on('closed', () => {
        if (this.overlay !== window) return
        this.overlay = null
        this.clearFrameTimer()
        this.releaseSensors()
        this.releaseFps()
        this.status = 'off'
        this.size = null
        this.emitState()
      })

      this.options.load(window)
      this.options.sensors.start()
      this.sensorsHeld = true
      this.options.fps.start()
      this.fpsHeld = true

      this.applyBounds()
      this.clearFrameTimer()
      this.frameTimer = setInterval(() => this.pushFrame(), this.options.frameMs ?? FRAME_MS)
      this.frameTimer.unref?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.closeWindow()
      this.status = 'error'
      this.message = `Não foi possível abrir o overlay: ${message}`
      this.options.onError?.(this.message)
    }
  }

  private closeWindow(): void {
    this.clearFrameTimer()
    const window = this.overlay
    this.overlay = null
    this.status = 'off'
    this.size = null
    this.releaseSensors()
    this.releaseFps()
    if (window && !window.isDestroyed()) window.destroy()
  }

  private showIfReady(): void {
    if (!this.overlay || !this.size || this.overlay.isVisible()) return
    this.overlay.showInactive()
  }

  private applyBounds(): void {
    const window = this.overlay
    if (!window || window.isDestroyed()) return

    const display = this.display()
    const size = this.size ?? DEFAULT_SIZE
    const point = positionOverlay(display.bounds, size, this.config.corner)

    window.setBounds({ x: point.x, y: point.y, width: size.width, height: size.height }, false)
  }

  private display(): Display {
    const displays = screen.getAllDisplays()
    return (
      displays.find((display) => display.id === this.config.displayId) ??
      screen.getPrimaryDisplay()
    )
  }

  // --- frames -------------------------------------------------------------

  private pushFrame(): void {
    const window = this.overlay
    if (!window || window.isDestroyed()) return

    const frame: OverlayFrame = buildOverlayFrame({
      at: (this.options.now ?? Date.now)(),
      snapshot: this.options.sensors.snapshot(),
      fps: this.options.fps.latest(),
      config: this.config,
      ramTotalBytes: this.ramTotalBytes,
      vramTotalBytes: this.vramTotalBytes,
      now: new Date((this.options.now ?? Date.now)())
    })

    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC.overlayFrame, frame)
    }
    this.emitState()
  }

  private async loadHardware(): Promise<void> {
    try {
      const system = await (this.options.loadSystem ?? getSystem)()
      this.ramTotalBytes = system.ram.totalBytes > 0 ? system.ram.totalBytes : undefined
      const vram = system.gpus[0]?.vramBytes
      this.vramTotalBytes = vram !== undefined && vram > 0 ? vram : undefined
    } catch {
      // The overlay still works without the totals: "Usada (GB)" becomes "—".
      this.ramTotalBytes = undefined
      this.vramTotalBytes = undefined
    }
  }

  private clearFrameTimer(): void {
    if (!this.frameTimer) return
    clearInterval(this.frameTimer)
    this.frameTimer = null
  }

  private releaseSensors(): void {
    if (!this.sensorsHeld) return
    this.sensorsHeld = false
    this.options.sensors.stop()
  }

  private releaseFps(): void {
    if (!this.fpsHeld) return
    this.fpsHeld = false
    this.options.fps.stop()
  }

  // --- shortcut and state -------------------------------------------------

  private registerShortcut(accelerator: string): boolean {
    if (this.registeredShortcut) {
      globalShortcut.unregister(this.registeredShortcut)
      this.registeredShortcut = null
    }
    try {
      const ok = globalShortcut.register(accelerator, () => {
        void this.toggle()
      })
      if (!ok) return false
      this.registeredShortcut = accelerator
      return true
    } catch {
      return false
    }
  }

  private emitState(): void {
    const state = this.state()
    const key = JSON.stringify(state)
    if (key === this.lastStateKey) return
    this.lastStateKey = key
    this.options.onState?.(state)
  }
}
