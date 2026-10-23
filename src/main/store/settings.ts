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

  constructor(userDataPath: string) {
    this.file = join(userDataPath, 'settings.json')
    this.data = { ...DEFAULT_SETTINGS }
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
    const dir = join(this.file, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
  }
}
