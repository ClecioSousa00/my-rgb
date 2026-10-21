/**
 * ASUS AURA USB transport.
 *
 * Everything here is plain HID I/O, which behaves identically on Linux
 * (hidraw) and Windows (hid.dll). There is no OS-specific code path, which is
 * what allows a single build to drive the same hardware with the same
 * effects on both platforms.
 */

import { devices, HID } from 'node-hid'
import type { DeviceInfo, RGB } from '@shared/types'
import {
  AURA_CONFIG_TABLE_SIZE,
  AURA_DIRECT_CHANNEL_FIXED,
  AURA_FRAME_SIZE,
  AURA_MAX_LEDS_PER_CHANNEL,
  buildConfigRequest,
  buildDirectPackets,
  buildFirmwareRequest,
  buildSetDirectMode,
  buildStopGen1,
  parseConfigTable,
  parseFirmware,
  type AuraLayout
} from './auraProtocol'

export const AURA_VENDOR_ID = 0x0b05
export const AURA_PRODUCT_ID = 0x19af

const READ_TIMEOUT_MS = 1000
const MAX_READ_ATTEMPTS = 8

export interface AuraDeviceDescriptor {
  path: string
  product: string
  vendorId: number
  productId: number
}

export class AuraUsbDevice {
  private handle: HID | null = null
  private descriptor: AuraDeviceDescriptor | null = null
  private firmware = ''
  private layout: AuraLayout | null = null
  private lastError: string | null = null

  get connected(): boolean {
    return this.handle !== null
  }

  get info(): DeviceInfo {
    return {
      connected: this.connected,
      path: this.descriptor?.path ?? null,
      product: this.descriptor?.product ?? '',
      vendorId: this.descriptor?.vendorId ?? AURA_VENDOR_ID,
      productId: this.descriptor?.productId ?? AURA_PRODUCT_ID,
      firmware: this.firmware,
      layout: this.layout,
      error: this.lastError,
      conflictSuspected: false
    }
  }

  /** Enumerate AURA controllers currently attached to the machine. */
  static list(): AuraDeviceDescriptor[] {
    let all: ReturnType<typeof devices>
    try {
      all = devices()
    } catch {
      return []
    }
    return all
      .filter((d) => d.vendorId === AURA_VENDOR_ID && d.productId === AURA_PRODUCT_ID)
      .map((d) => ({
        path: d.path ?? '',
        product: d.product ?? 'AURA LED Controller',
        vendorId: d.vendorId,
        productId: d.productId
      }))
  }

  /**
   * Open the device and run the mandatory init sequence.
   *
   * Order matters: stop_gen1 releases the controller from its own animation
   * engine, then we read the configuration table, then we claim every channel
   * for host-controlled (direct) mode.
   */
  async open(): Promise<boolean> {
    if (this.handle) return true

    const found = AuraUsbDevice.list()
    if (found.length === 0) {
      this.lastError =
        'AURA LED Controller (0b05:19af) not found. On Linux check the udev rule granting access to /dev/hidraw* for this device.'
      return false
    }

    const descriptor = found[0]
    try {
      // nonExclusive lets us open the device even when another application
      // (Armoury Crate) currently holds a handle to it on Windows.
      this.handle = new HID(descriptor.path, { nonExclusive: true })
    } catch (err) {
      this.lastError = `Could not open ${descriptor.path}: ${errorMessage(err)}`
      this.handle = null
      return false
    }

    this.descriptor = descriptor
    this.lastError = null

    try {
      // 1. release the controller's internal animation engine
      this.writeFrame(buildStopGen1())

      // 2. firmware string (informational, failure is not fatal)
      this.writeFrame(buildFirmwareRequest())
      const fwReply = this.readMatching(0x02)
      this.firmware = fwReply ? parseFirmware(fwReply) : ''

      // 3. configuration table - this is the only mandatory read
      this.writeFrame(buildConfigRequest())
      const cfgReply = this.readMatching(0x30)
      if (!cfgReply) {
        this.lastError = 'Device did not answer the configuration table request.'
        this.close()
        return false
      }
      const table = cfgReply.subarray(4, 4 + AURA_CONFIG_TABLE_SIZE)
      this.layout = parseConfigTable(table)

      // 4. claim every channel for direct (host controlled) mode
      this.claimAllChannels()

      return true
    } catch (err) {
      this.lastError = errorMessage(err)
      this.close()
      return false
    }
  }

  /** Put the mainboard and every addressable header into direct mode. */
  claimAllChannels(): void {
    if (!this.layout) return
    // effect channel 0 = mainboard, 1..n = addressable headers
    for (let ch = 0; ch <= this.layout.argbChannels; ch++) {
      this.writeFrame(buildSetDirectMode(ch))
    }
  }

  /** Stream colours to one channel. Splits into 20-LED sub-packets. */
  setChannelLeds(directChannel: number, colors: RGB[]): void {
    if (!this.handle) return
    if (colors.length > AURA_MAX_LEDS_PER_CHANNEL) {
      colors = colors.slice(0, AURA_MAX_LEDS_PER_CHANNEL)
    }
    for (const packet of buildDirectPackets(directChannel, colors)) {
      this.writeFrame(packet)
    }
  }

  /** Direct channel id for a fixed (on-board) zone. */
  static get fixedDirectChannel(): number {
    return AURA_DIRECT_CHANNEL_FIXED
  }

  writeFrame(buf: Buffer): void {
    if (!this.handle) throw new Error('AURA device is not open')
    if (buf.length !== AURA_FRAME_SIZE) {
      throw new Error(`AURA frames must be ${AURA_FRAME_SIZE} bytes, got ${buf.length}`)
    }
    this.handle.write(buf)
  }

  /**
   * Read frames until one with the expected opcode arrives, discarding noise.
   */
  private readMatching(expectedOpcode: number): Buffer | null {
    if (!this.handle) return null
    for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt++) {
      let raw: number[] | undefined
      try {
        raw = this.handle.readTimeout(READ_TIMEOUT_MS)
      } catch {
        return null
      }
      if (!raw || raw.length < 2) continue
      const data = Buffer.from(raw)
      if (data[0] === 0xec && data[1] === expectedOpcode) return data
    }
    return null
  }

  close(): void {
    if (this.handle) {
      try {
        this.handle.close()
      } catch {
        /* ignore */
      }
      this.handle = null
    }
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
