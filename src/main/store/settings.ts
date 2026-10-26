/**
 * Application settings - small key/value store outside the profiles.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '@shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  autoStart: true,
  autostartAtLogin: false,
  minimizeToTray: true,
  lastProfile: 'Padrão',
  startWithLightingOff: false,
  startupProfile: null
}

export class SettingsStore {
  private readonly file: string
  private data: AppSettings
  /** Called when the settings cannot be written to disk. */
  private readonly onError: ((message: string) => void) | null
  /** Last write error, so a failing disk does not spam the UI. */
  private lastWriteError: string | null = null

  constructor(userDataPath: string, onError?: (message: string) => void) {
    this.file = join(userDataPath, 'settings.json')
    this.data = { ...DEFAULT_SETTINGS }
    this.onError = onError ?? null
    this.load()
  }

  get settings(): AppSettings {
    return this.data
  }

  set(patch: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...patch }
    this.write()
    return this.data
  }

  private load(): void {
    if (!existsSync(this.file)) return
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppSettings>
      this.data = { ...DEFAULT_SETTINGS, ...parsed }
    } catch {
      this.data = { ...DEFAULT_SETTINGS }
    }
  }

  private write(): void {
    try {
      const dir = join(this.file, '..')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
      this.lastWriteError = null
    } catch (err) {
      // Settings are written from IPC handlers and startup: an uncaught
      // exception here would take the whole main process down.
      const message = `Não foi possível salvar as configurações: ${errorMessage(err)}`
      if (message !== this.lastWriteError) {
        this.lastWriteError = message
        this.onError?.(message)
      }
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
