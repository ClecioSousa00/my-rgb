/**
 * Builds the zone list from the layout reported by the device.
 *
 * The channel numbering follows OpenRGB's Aura USB driver:
 *   - the fixed on-board LEDs use direct channel 0x04 and effect channel 0
 *   - addressable header i (0 based) uses direct channel i and effect channel i+1
 */

import type { ZoneState } from '@shared/types'
import { AURA_DIRECT_CHANNEL_FIXED, AURA_MAX_LEDS_PER_CHANNEL, type AuraLayout } from './aura/auraProtocol'

export function buildZones(layout: AuraLayout): ZoneState[] {
  const zones: ZoneState[] = []

  if (layout.mainboardLeds > 0) {
    zones.push({
      id: 'mainboard',
      label: 'LEDs onboard',
      kind: 'fixed',
      directChannel: AURA_DIRECT_CHANNEL_FIXED,
      effectChannel: 0,
      ledCount: layout.mainboardLeds,
      maxLedCount: layout.mainboardLeds
    })
  }

  for (let i = 0; i < layout.argbChannels; i++) {
    zones.push({
      id: `argb${i}`,
      label: `Header ARGB ${i + 1}`,
      kind: 'addressable',
      directChannel: i,
      effectChannel: i + 1,
      ledCount: 0,
      maxLedCount: AURA_MAX_LEDS_PER_CHANNEL
    })
  }

  return zones
}
