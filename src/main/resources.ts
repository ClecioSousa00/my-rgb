/**
 * Resource path resolution.
 *
 * In development the assets live in <project>/build. In a packaged app they
 * are copied to <resources>/build by electron-builder's extraResources, while
 * the app code itself lives inside app.asar. This helper finds the assets in
 * both layouts.
 */

import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

/** Find a packaged asset, or null when it does not exist. */
export function resolveResource(...segments: string[]): string | null {
  const candidates = [
    join(app.getAppPath(), ...segments),
    join(process.resourcesPath ?? '', ...segments)
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}
