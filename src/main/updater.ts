/**
 * Auto-update for MyRGB.
 *
 * Uses electron-updater against GitHub Releases. The app checks for updates
 * on startup and exposes the state to the renderer over IPC so the Settings
 * page can show "check for updates", download progress and a "restart to
 * install" button.
 *
 * The updater is enabled in packaged builds (app.isPackaged). In development
 * it is a no-op: electron-updater has no release server to talk to, and
 * checking would only log errors.
 */

import { app, dialog, BrowserWindow } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'

export interface AutoUpdateState {
  /** A check is currently in flight. */
  checking: boolean
  /** An update is available (checked state). */
  available: boolean
  /** Version of the available update. */
  version: string | null
  /** Human readable release notes. */
  releaseNotes: string | null
  /** Release date (ISO string). */
  releaseDate: string | null
  /** Download progress, 0-100, or null when not downloading. */
  progress: number | null
  /** Last error message, or null. */
  error: string | null
  /** An update has been downloaded and is ready to install. */
  downloaded: boolean
  /** Whether quitAndInstall() can be called. */
  canQuitAndInstall: boolean
}

const initialState: AutoUpdateState = {
  checking: false,
  available: false,
  version: null,
  releaseNotes: null,
  releaseDate: null,
  progress: null,
  error: null,
  downloaded: false,
  canQuitAndInstall: false
}

let state: AutoUpdateState = { ...initialState }
const subscribers = new Set<(state: AutoUpdateState) => void>()

function setState(patch: Partial<AutoUpdateState>): void {
  state = { ...state, ...patch }
  for (const fn of subscribers) fn(state)
}

/** Called by the renderer to subscribe to state changes. */
export function subscribeAutoUpdate(fn: (state: AutoUpdateState) => void): () => void {
  subscribers.add(fn)
  fn(state)
  return () => subscribers.delete(fn)
}

/** Snapshot for IPC calls. */
export function getAutoUpdateState(): AutoUpdateState {
  return { ...state }
}

/**
 * Start listening for updates. Safe to call multiple times; the check only
 * runs once per start unless `checkForUpdates()` is invoked again.
 */
export function initAutoUpdater(mainWindow: BrowserWindow | null = null): void {
  if (!app.isPackaged) {
    // Dev mode: no update server to talk to.
    setState({ checking: false, available: false, error: null })
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    setState({ checking: true, available: false, error: null, downloaded: false })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    const notes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : info.releaseNotes === null
          ? null
          : JSON.stringify(info.releaseNotes)
    setState({
      checking: false,
      available: true,
      version: info.version ?? null,
      releaseNotes: notes,
      releaseDate: info.releaseDate ?? null,
      error: null,
      progress: null,
      downloaded: false
    })
    // Notify the main window so the UI can show an update banner.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-update:available', {
        version: info.version ?? null,
        releaseNotes: info.releaseNotes ?? null
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    setState({ checking: false, available: false, error: null, downloaded: false })
  })

  autoUpdater.on('error', (err: Error) => {
    setState({ checking: false, error: err.message ?? String(err) })
  })

  autoUpdater.on('download-progress', (progress) => {
    setState({
      checking: false,
      available: true,
      progress: progress.percent ?? null
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    const notes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : info.releaseNotes === null
          ? null
          : JSON.stringify(info.releaseNotes)
    setState({
      checking: false,
      available: true,
      version: info.version ?? null,
      releaseNotes: notes,
      releaseDate: info.releaseDate ?? null,
      progress: null,
      downloaded: true,
      canQuitAndInstall: true,
      error: null
    })
  })

  // Initial check on startup (non-blocking).
  void checkForUpdates()
}

/** Ask electron-updater to check the release server now. */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return
  setState({ checking: true, error: null })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    setState({
      checking: false,
      error: err instanceof Error ? err.message : String(err)
    })
  }
}

/** Download the available update. */
export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged || !state.available || state.downloaded) return
  setState({ progress: 0, error: null })
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    setState({
      progress: null,
      error: err instanceof Error ? err.message : String(err)
    })
  }
}

/** Quit the app and install the downloaded update. */
export async function quitAndInstall(): Promise<void> {
  if (!app.isPackaged || !state.canQuitAndInstall) return
  try {
    await autoUpdater.quitAndInstall()
  } catch (err) {
    setState({
      error: err instanceof Error ? err.message : String(err)
    })
  }
}

/** Show a native dialog with the update details, if available. */
export async function showUpdateDialog(mainWindow: BrowserWindow): Promise<void> {
  if (!state.available && !state.downloaded) {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Sem atualização disponível',
      message: 'Não há atualização disponível para o MyRGB.',
      detail: `Versão instalada: ${app.getVersion()}`,
      buttons: ['OK']
    })
    return
  }

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Atualização disponível',
    message: `Versão ${state.version ?? 'desconhecida'} está pronta para instalar.`,
    detail: state.releaseNotes ?? '',
    buttons: state.downloaded ? ['Instalar agora', 'Mais tarde'] : ['Baixar agora', 'Mais tarde'],
    defaultId: 0,
    cancelId: 1
  })

  if (response === 0) {
    if (state.downloaded) {
      await quitAndInstall()
    } else {
      await downloadUpdate()
    }
  }
}
