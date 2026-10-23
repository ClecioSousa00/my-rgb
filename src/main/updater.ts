/**
 * Auto-updater (skeleton).
 *
 * Uses electron-updater when available. Disabled by default until publishing
 * is configured (GitHub Releases / custom server).
 */
import { app } from 'electron'

export function initAutoUpdater(): void {
  if (process.env.MYRGB_ENABLE_AUTOUPDATE !== '1') return
  if (!app.isPackaged) return

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.checkForUpdatesAndNotify()
  } catch {
    // electron-updater not configured or unavailable
  }
}
