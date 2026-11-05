/**
 * AURA backend.
 *
 * The controller is opened, claimed and polled by the main process exactly as
 * before; this wrapper only names the two things the router needs: whether it
 * is usable, and how a target maps to a HID direct channel.
 *
 * It is the only critical backend: if a write fails, the engine stops and the
 * UI says the controller went away, which is the behaviour the app always had.
 */

import type { RGB } from '@shared/types'
import type { LightTarget } from '@shared/features/light'
import type { AuraUsbDevice } from '../../aura/auraDevice'
import type { LightBackend } from '../router'

export class AuraBackend implements LightBackend {
  readonly id = 'aura' as const
  readonly critical = true
  /** The controller takes a full frame per refresh without complaint. */
  readonly minIntervalMs = 0

  constructor(private readonly device: AuraUsbDevice) {}

  available(): boolean {
    return this.device.connected
  }

  /** Opening is the main process's job; claiming it here would reopen it. */
  acquire(): boolean {
    return this.device.connected
  }

  release(): void {
    // The device is shared with the conflict watcher and the reconnect
    // button, so it stays open for the life of the app.
  }

  write(target: LightTarget, colors: RGB[]): void {
    this.device.setChannelLeds(target.zoneIndex, colors)
  }
}
