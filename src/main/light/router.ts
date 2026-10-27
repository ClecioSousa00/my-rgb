/**
 * Lighting router.
 *
 * The engine renders frames; the router decides where each zone's colours go.
 * Today every target is an AURA channel, so this file changes no behaviour -
 * it only moves the `setChannelLeds` call one level down. Keeping the split
 * here is what lets a second backend (OpenRGB, Razer, Corsair) be added
 * without touching the engine.
 *
 * Three rules make an external backend safe to add:
 *
 *   1. One backend failing never stops the others. Only a *critical* backend
 *      (the AURA controller, the one the app was built for) can take the
 *      output down; the engine keeps running for the rest.
 *   2. Every backend can declare a minimum interval between writes to the same
 *      target, because some (OpenRGB) choke on 30 updates per second.
 *   3. A backend is *held* while it has enabled targets: `acquire()` when it
 *      starts being used, `release()` when the last target goes away.
 *
 * Nothing here throws: the result of `write` says what happened, and the
 * caller decides whether to surface the reason.
 */

import type { RGB } from '@shared/types'
import type { LightBackendId, LightTarget } from '@shared/features/light'
import { configIdForTarget } from '@shared/features/light'

export interface LightBackend {
  readonly id: LightBackendId
  /** A failure here stops the lighting output; the primary hardware. */
  readonly critical: boolean
  /** Minimum gap between two writes to the same target, in ms (0 = all). */
  readonly minIntervalMs: number
  /** Whether the backend can accept a write right now. */
  available(): boolean
  /** Take hold of the device. Returning false leaves the targets unwritten. */
  acquire?(): boolean
  /** Let go of the device, called when the last target disappears. */
  release?(): void
  /** Send one target's colours. Throwing is expected on hardware failure. */
  write(target: LightTarget, colors: RGB[]): void
}

export interface LightWriteResult {
  /** The colours reached the backend. */
  ok: boolean
  /** Nothing was written on purpose: no target, unavailable, throttled. */
  skipped?: boolean
  /** The backend failed and the output cannot continue. */
  fatal?: boolean
  /** Raw backend message, so the caller can keep its own wording. */
  error?: string
}

export interface LightRouterOptions {
  /** Reports a failed write on a backend that is not the primary one. */
  onError?: (message: string) => void
  /** Injectable clock, so the throttle is testable without waiting. */
  now?: () => number
}

export class LightRouter {
  private readonly backends = new Map<LightBackendId, LightBackend>()
  /** Target by profile id (the engine speaks zone ids). */
  private byConfigId = new Map<string, LightTarget>()
  /** Backends currently acquired. */
  private readonly held = new Set<LightBackendId>()
  /** Last write timestamp per target id, for `minIntervalMs`. */
  private readonly lastWrite = new Map<string, number>()
  private readonly onError?: (message: string) => void
  private readonly now: () => number

  constructor(options: LightRouterOptions = {}) {
    this.onError = options.onError
    this.now = options.now ?? Date.now
  }

  register(backend: LightBackend): void {
    this.backends.set(backend.id, backend)
    this.syncHeld()
  }

  /**
   * Adopt the profile's targets. Targets of an unregistered backend stay in
   * the list (the profile is not rewritten), they are just not writable.
   */
  setTargets(targets: LightTarget[]): void {
    this.byConfigId = new Map()
    this.lastWrite.clear()

    for (const target of Array.isArray(targets) ? targets : []) {
      if (!target || !this.backends.has(target.backend)) continue
      this.byConfigId.set(configIdForTarget(target), target)
    }

    this.syncHeld()
  }

  /** Targets the router can address, in the order they were given. */
  targets(): LightTarget[] {
    return [...this.byConfigId.values()]
  }

  /** Ids of the backends currently held, for the UI and the selftest. */
  activeBackends(): LightBackendId[] {
    return [...this.held]
  }

  /** Whether anything can be written right now. */
  get outputAvailable(): boolean {
    for (const id of this.held) {
      if (this.backends.get(id)?.available() === true) return true
    }
    return false
  }

  /**
   * Write one zone.
   *
   * `configId` is the profile's zone id ("argb0", "openrgb:0:2"), not the
   * qualified target id, because that is what the engine and the UI hold.
   */
  write(configId: string, colors: RGB[]): LightWriteResult {
    const target = this.byConfigId.get(configId)
    if (!target) return { ok: false, skipped: true }

    const backend = this.backends.get(target.backend)
    if (!backend) return { ok: false, skipped: true }
    if (!target.enabled) return { ok: false, skipped: true }
    if (!this.held.has(backend.id)) return { ok: false, skipped: true }
    if (!backend.available()) return { ok: false, skipped: true }

    const at = this.now()
    const last = this.lastWrite.get(target.id)
    if (backend.minIntervalMs > 0 && last !== undefined && at - last < backend.minIntervalMs) {
      return { ok: false, skipped: true }
    }
    this.lastWrite.set(target.id, at)

    try {
      backend.write(target, colors)
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // The primary hardware is the engine's business: it stops and shows the
      // same message it always showed. For anything else, the failure is
      // reported here and the frame carries on.
      if (backend.critical) return { ok: false, fatal: true, error: message }

      this.onError?.(`${target.label}: ${message}`)
      return { ok: false, error: message }
    }
  }

  /** Release every backend, for shutdown. */
  dispose(): void {
    for (const id of this.held) {
      this.backends.get(id)?.release?.()
    }
    this.held.clear()
    this.byConfigId = new Map()
    this.lastWrite.clear()
  }

  /**
   * Hold the backends that have enabled targets and release the rest.
   *
   * `acquire` is retried on every `setTargets`, which is what happens when a
   * device is plugged back in - no timer of its own.
   */
  private syncHeld(): void {
    const needed = new Set<LightBackendId>()
    for (const target of this.byConfigId.values()) {
      if (target.enabled) needed.add(target.backend)
    }

    for (const id of [...this.held]) {
      if (needed.has(id)) continue
      this.backends.get(id)?.release?.()
      this.held.delete(id)
    }

    for (const id of needed) {
      if (this.held.has(id)) continue
      const backend = this.backends.get(id)
      if (!backend) continue
      if (backend.acquire && !backend.acquire()) continue
      this.held.add(id)
    }
  }
}
