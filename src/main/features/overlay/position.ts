/**
 * Where the overlay sits.
 *
 * Kept free of Electron so the corner math can be tested: the window is
 * positioned in the display's own coordinates, which is what Electron's
 * `screen` module returns. A margin keeps it clear of the bezel; when the card
 * is larger than the display (a very small screen with a big scale) it is
 * clamped to the top-left instead of disappearing off-screen.
 */

import type { OverlayCorner } from '@shared/features/overlay'

export interface OverlayRect {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayPoint {
  x: number
  y: number
}

export const OVERLAY_MARGIN = 12

export function positionOverlay(
  display: OverlayRect,
  size: { width: number; height: number },
  corner: OverlayCorner,
  margin = OVERLAY_MARGIN
): OverlayPoint {
  const right = display.x + display.width
  const bottom = display.y + display.height

  const x = corner.endsWith('r') ? right - size.width - margin : display.x + margin
  const y = corner.startsWith('b') ? bottom - size.height - margin : display.y + margin

  return {
    x: Math.max(display.x, Math.round(x)),
    y: Math.max(display.y, Math.round(y))
  }
}
