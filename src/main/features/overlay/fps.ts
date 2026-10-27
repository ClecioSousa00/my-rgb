/**
 * FPS of the game in the foreground.
 *
 * Windows has a real source: the .NET helper reads the ETW "Present" events,
 * the same technique as PresentMon, so nothing is injected into the game.
 * Linux has no equivalent without a compositor hook, so the service reports
 * `supported: false` and the overlay keeps showing sensors - the page points
 * to MangoHud/gamescope instead of inventing a number.
 *
 * The service is reference counted like `SensorsStore`: the overlay and a
 * bottleneck session can both need FPS, and the helper must live until the
 * last one leaves. Starting is lazy and a failure is a capability, never an
 * exception: no helper means no FPS, not no overlay.
 */

import type { OverlayFps, OverlayFpsCapabilities } from '@shared/features/overlay'
import { FPS_HELPER_NOTE, FPS_IDLE_NOTE, FPS_LINUX_NOTE } from '@shared/features/overlay'

/** The part of `HelperBridge` used here, so the tests can inject a stub. */
export interface FpsBridge {
  start(): Promise<void>
  request<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
  dispose(): void
}

export interface FpsServiceOptions {
  platform?: NodeJS.Platform
  /** Null when the helper executable does not exist. */
  createBridge?: () => FpsBridge | null
  pollMs?: number
  /** Injected by the tests. */
  now?: () => number
  onStatus?: (capabilities: OverlayFpsCapabilities) => void
}

/** What the helper returns for `fps.poll`. */
interface HelperStats {
  pid: number
  process: string
  fps: number
  frameTimeMs: number
  low1Fps: number
  recent: number[]
}

const POLL_MS = 500
const STALE_AFTER_MS = 3_000
const MAX_POLL_FAILURES = 3

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toFps(stats: HelperStats | null): OverlayFps | null {
  if (!stats || !isNumber(stats.fps) || stats.fps <= 0) return null
  return {
    fps: stats.fps,
    frameTimeMs: isNumber(stats.frameTimeMs) ? stats.frameTimeMs : 1000 / stats.fps,
    low1Fps: isNumber(stats.low1Fps) ? stats.low1Fps : stats.fps,
    game: typeof stats.process === 'string' && stats.process ? stats.process : 'jogo',
    recent: Array.isArray(stats.recent) ? stats.recent.filter(isNumber) : []
  }
}

export class FpsService {
  private subscribers = 0
  private bridge: FpsBridge | null = null
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private failures = 0
  private last: OverlayFps | null = null
  private lastAt = 0
  private supported: boolean
  private available = false
  private reason: string | undefined
  private disposed = false
  private starting = false
  private lastStatus = ''

  constructor(private readonly options: FpsServiceOptions = {}) {
    this.supported = (options.platform ?? process.platform) === 'win32'
    if (!this.supported) this.reason = FPS_LINUX_NOTE
  }

  /** Add a subscriber, starting the helper on the first one. */
  start(): void {
    if (this.disposed) return
    this.subscribers++
    if (this.subscribers === 1) void this.begin()
  }

  /** Remove a subscriber; the helper is closed when the last one leaves. */
  stop(): void {
    this.subscribers = Math.max(0, this.subscribers - 1)
    if (this.subscribers > 0) return
    this.clearTimer()
    this.bridge?.dispose()
    this.bridge = null
    this.last = null
  }

  /** Forget a previous failure and try again (the page's "Tentar novamente"). */
  retry(): void {
    if (!this.supported || this.subscribers === 0) return
    this.stopPoll()
    this.bridge?.dispose()
    this.bridge = null
    this.available = false
    this.reason = undefined
    void this.begin()
  }

  capabilities(): OverlayFpsCapabilities {
    if (!this.supported) {
      return { supported: false, available: false, reason: FPS_LINUX_NOTE }
    }
    // Nobody needs frames right now: the helper is deliberately off, which is
    // not a failure and must not offer a pointless "try again".
    if (this.subscribers === 0 && !this.starting) {
      return { supported: true, available: false, reason: FPS_IDLE_NOTE }
    }
    return {
      supported: true,
      available: this.available,
      ...(this.reason ? { reason: this.reason } : {})
    }
  }

  /** The last sample, or null when it is old enough to be a frozen game. */
  latest(): OverlayFps | null {
    if (!this.last) return null
    const now = (this.options.now ?? Date.now)()
    return now - this.lastAt <= STALE_AFTER_MS ? this.last : null
  }

  dispose(): void {
    this.disposed = true
    this.subscribers = 0
    this.stopPoll()
    this.bridge?.dispose()
    this.bridge = null
  }

  private async begin(): Promise<void> {
    if (this.starting || this.disposed || this.subscribers === 0) return

    if (!this.supported) {
      this.available = false
      this.reason = FPS_LINUX_NOTE
      this.emitStatus()
      return
    }

    const bridge = this.options.createBridge?.() ?? null
    if (!bridge) {
      this.available = false
      this.reason = FPS_HELPER_NOTE
      this.emitStatus()
      return
    }

    this.starting = true
    this.bridge = bridge
    try {
      await bridge.start()
      const started = await bridge.request<{ running?: boolean; error?: string }>('fps.start')
      if (!started?.running) {
        throw new Error(started?.error ?? 'O helper não conseguiu iniciar a captura de frames.')
      }

      if (this.subscribers === 0 || this.disposed) {
        bridge.dispose()
        this.bridge = null
        return
      }

      this.available = true
      this.reason = undefined
      this.failures = 0
      this.emitStatus()
      void this.poll()
      this.timer = setInterval(() => void this.poll(), this.options.pollMs ?? POLL_MS)
      this.timer.unref?.()
    } catch (error) {
      bridge.dispose()
      this.bridge = null
      this.available = false
      this.reason = messageOf(error)
      this.emitStatus()
    } finally {
      this.starting = false
    }
  }

  private async poll(): Promise<void> {
    if (!this.bridge || this.polling || this.disposed) return
    this.polling = true
    try {
      const stats = await this.bridge.request<HelperStats | null>('fps.poll')
      this.failures = 0
      this.last = toFps(stats)
      this.lastAt = (this.options.now ?? Date.now)()
    } catch (error) {
      this.failures++
      if (this.failures >= MAX_POLL_FAILURES) {
        this.stopPoll()
        this.bridge?.dispose()
        this.bridge = null
        this.available = false
        this.last = null
        this.reason = `A leitura de FPS parou: ${messageOf(error)}`
        this.emitStatus()
      }
    } finally {
      this.polling = false
    }
  }

  private stopPoll(): void {
    this.clearTimer()
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private emitStatus(): void {
    const capabilities = this.capabilities()
    const key = `${capabilities.supported}|${capabilities.available}|${capabilities.reason ?? ''}`
    if (key === this.lastStatus) return
    this.lastStatus = key
    this.options.onStatus?.(capabilities)
  }
}
