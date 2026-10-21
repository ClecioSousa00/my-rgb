/**
 * System tray.
 *
 * The tray is the app's home on both platforms: it shows the current profile,
 * toggles the lighting and offers the quit entry point.
 */

import { Menu, nativeImage, Tray } from 'electron'
import { resolveResource } from './resources'

export interface TrayOptions {
  onShow(): void
  onToggle(): void
  onQuit(): void
  /** Whether the lights are currently being sent to the hardware. */
  lightsEnabled(): boolean
  profileName(): string
}

export interface TrayHandle {
  tray: Tray
  /** Rebuild the context menu (after the lighting state changed). */
  refresh(): void
}

function resolveTrayIcon(): Electron.NativeImage {
  const path = resolveResource('build', 'tray.png')
  if (path) {
    const image = nativeImage.createFromPath(path)
    if (!image.isEmpty()) return image
  }
  // Last resort: a 1x1 transparent image so the tray never crashes.
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  )
}

export function createTray(options: TrayOptions): TrayHandle {
  const tray = new Tray(resolveTrayIcon())
  tray.setToolTip('MyRGB')

  const buildMenu = (): Electron.Menu => {
    const lit = options.lightsEnabled()
    return Menu.buildFromTemplate([
      { label: `Perfil: ${options.profileName()}`, enabled: false },
      { type: 'separator' },
      { label: 'Abrir MyRGB', click: () => options.onShow() },
      {
        label: lit ? 'Desligar luzes' : 'Ligar luzes',
        click: () => {
          options.onToggle()
          refresh()
        }
      },
      { type: 'separator' },
      { label: 'Sair', click: () => options.onQuit() }
    ])
  }

  const refresh = (): void => {
    tray.setContextMenu(buildMenu())
  }

  refresh()
  tray.on('click', () => options.onShow())
  tray.on('double-click', () => options.onShow())

  return { tray, refresh }
}
