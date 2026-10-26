/**
 * The effect engine.
 *
 * Renders a full frame (every zone, every LED) and pushes it to the hardware
 * and to the UI preview. The preview and the hardware consume the exact same
 * buffer, so what you see is what the LEDs do.
 *
 * Rendering is a pure function of (time, profile). No Math.random, no wall
 * clock reads inside a pattern - that is what makes the frame dump identical
 * on Linux and on Windows.
 */

import type { Frame, Profile, RGB, ZoneConfig, ZoneState } from '@shared/types'
import type { AuraUsbDevice } from '../aura/auraDevice'
import { samplePalette } from './palette'
import { getPattern, resolveParams } from './patterns'
import { hash, noise } from './patterns/helpers'
import type { PatternContext } from './types'

export interface EngineOptions {
  onFrame: (frame: Frame) => void
  /** Called when a frame could not be written to the hardware. */
  onError?: (message: string) => void
}

export class EffectEngine {
  private device: AuraUsbDevice | null = null
  private profile: Profile
  private zones: ZoneState[] = []
  private readonly onFrame: (frame: Frame) => void
  private readonly onError?: (message: string) => void

  private timer: NodeJS.Timeout | null = null
  private running = false
  private seq = 0
  private origin = 0
  private lastTick = 0
  /** Whether the LEDs currently hold a colour we wrote. */
  private lightsState: 'unknown' | 'on' | 'off' = 'unknown'

  constructor(profile: Profile, zones: ZoneState[], options: EngineOptions) {
    this.profile = profile
    this.zones = zones
    this.onFrame = options.onFrame
    this.onError = options.onError
  }

  setDevice(device: AuraUsbDevice | null): void {
    this.device = device
    // A freshly connected device may be showing anything - another program,
    // or the last state before the cable was unplugged. The output state has
    // to be applied again from scratch.
    this.lightsState = 'unknown'
    this.syncOutput()
  }

  setProfile(profile: Profile): void {
    this.profile = profile
    // Turning the output off must actually darken the LEDs, otherwise the
    // hardware keeps showing the last frame.
    this.syncOutput()
  }

  /**
   * Push the current output state to the hardware.
   *
   * When the output is disabled every zone is driven to black once. Doing it
   * here (and not on every frame) keeps the "lights off" state cheap.
   */
  syncOutput(): void {
    if (!this.device || !this.device.connected) return

    if (this.profile.global.outputEnabled) {
      this.lightsState = 'on'
      return
    }

    if (this.lightsState === 'off') return
    this.lightsState = 'off'

    for (const zone of this.zones) {
      const config = this.profile.zones.find((z) => z.zoneId === zone.id)
      const count = ledCountFor(config, zone)
      if (count <= 0) continue
      try {
        this.device.setChannelLeds(
          zone.directChannel,
          new Array<RGB>(count).fill({ r: 0, g: 0, b: 0 })
        )
      } catch (err) {
        this.onError?.(`Failed to clear zone ${zone.id}: ${errorMessage(err)}`)
        // The zone is still lit, so try again on the next sync.
        this.lightsState = 'unknown'
        return
      }
    }
  }

  setZones(zones: ZoneState[]): void {
    this.zones = zones
  }

  get isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.origin = Date.now()
    this.lastTick = performance.now()
    this.schedule()
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** Render a single frame and return it, without touching hardware. */
  renderFrame(atMs: number): Frame {
    const time = (atMs - this.origin) / 1000
    const speed = this.profile.global.speed
    const brightness = this.profile.global.brightness

    const zoneLedCounts: number[] = []
    const pixels: number[] = []

    for (const zone of this.zones) {
      const config = this.profile.zones.find((z) => z.zoneId === zone.id)
      const ledCount = ledCountFor(config, zone)
      zoneLedCounts.push(ledCount)

      const colors = this.renderZone(config, ledCount, time, speed)
      for (const c of colors) {
        pixels.push(
          Math.round(c.r * brightness),
          Math.round(c.g * brightness),
          Math.round(c.b * brightness)
        )
      }
    }

    return {
      seq: this.seq++,
      time,
      zoneLedCounts,
      pixels: new Uint8Array(pixels)
    }
  }

  private renderZone(
    config: ZoneConfig | undefined,
    ledCount: number,
    time: number,
    speed: number
  ): RGB[] {
    if (!config || ledCount <= 0) {
      return []
    }

    // A disabled zone is not skipped - it is explicitly driven to black, so
    // the LEDs actually turn off instead of keeping their last colour.
    if (!config.enabled) {
      return new Array<RGB>(ledCount).fill({ r: 0, g: 0, b: 0 })
    }

    // Resolve the effect, following the "mirror another zone" link if set.
    let effect = config.effect
    if (config.followZoneId) {
      const source = this.profile.zones.find((z) => z.zoneId === config.followZoneId)
      effect = source?.effect ?? effect
    }
    if (!effect) return []

    const pattern = getPattern(effect.patternId)
    if (!pattern) return []

    const palette =
      this.profile.palettes.find((p) => p.id === effect.paletteId) ?? this.profile.palettes[0]
    if (!palette) return []

    const params = resolveParams(effect.patternId, effect.params)
    const sampleGradient = (u: number): RGB => samplePalette(palette, u)

    const colors: RGB[] = new Array(ledCount)
    for (let i = 0; i < ledCount; i++) {
      const ctx: PatternContext = {
        ledIndex: i,
        ledCount,
        position: ledCount > 1 ? i / (ledCount - 1) : 0,
        time,
        speed,
        params,
        sampleGradient,
        hash,
        noise
      }
      const out = pattern.render(ctx)

      let rgb: RGB
      if ('color' in out) {
        rgb = out.color
      } else {
        rgb = sampleGradient(out.u)
      }

      const intensity = out.intensity ?? 1
      colors[i] = {
        r: clamp255(rgb.r * intensity),
        g: clamp255(rgb.g * intensity),
        b: clamp255(rgb.b * intensity)
      }
    }
    return colors
  }

  /** Push a rendered frame to the hardware. */
  private applyFrame(frame: Frame): void {
    if (!this.device || !this.device.connected) return
    if (!this.profile.global.outputEnabled) return

    let offset = 0
    for (let zi = 0; zi < this.zones.length; zi++) {
      const zone = this.zones[zi]
      const count = frame.zoneLedCounts[zi]
      const colors: RGB[] = []
      for (let i = 0; i < count; i++) {
        const p = (offset + i) * 3
        colors.push({ r: frame.pixels[p], g: frame.pixels[p + 1], b: frame.pixels[p + 2] })
      }
      offset += count

      if (count === 0) continue
      try {
        this.device.setChannelLeds(zone.directChannel, colors)
      } catch (err) {
        this.onError?.(`Failed to write zone ${zone.id}: ${errorMessage(err)}`)
        this.stop()
        return
      }
    }
  }

  private schedule(): void {
    if (!this.running) return
    const interval = 1000 / Math.max(1, this.profile.global.fps)
    const now = performance.now()
    let delay = interval - (now - this.lastTick)
    if (delay < 0) delay = 0
    this.timer = setTimeout(() => {
      this.lastTick = performance.now()
      this.tick()
      this.schedule()
    }, delay)
  }

  private tick(): void {
    const frame = this.renderFrame(Date.now())
    this.applyFrame(frame)
    this.onFrame(frame)
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * Whole LED count for a zone, clamped to what the hardware can address.
 *
 * The store already normalises this, but a profile copied from another
 * machine (or edited by hand) can carry `1.5` or `NaN`. That reaches
 * `new Array(ledCount)` and throws `RangeError`, killing the main process.
 */
function ledCountFor(config: ZoneConfig | undefined, zone: ZoneState): number {
  const count = Math.round(Number(config?.ledCount ?? 0))
  if (!Number.isFinite(count)) return 0
  const max = Number(zone.maxLedCount)
  const limit = Number.isFinite(max) ? Math.max(0, Math.round(max)) : count
  return Math.max(0, Math.min(count, limit))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
