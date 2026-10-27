/**
 * Storage for the HowManyFPS API key.
 *
 * The key is encrypted with `safeStorage` (DPAPI on Windows, libsecret or
 * KWallet on Linux) and written to `userData/secrets.bin`. The file records
 * whether the payload is encrypted, so a machine without a keyring can still
 * keep the key - in clear text, and the page says so and offers to delete it.
 *
 * Nothing here ever returns the key to the renderer: only `configured`,
 * `encrypted` and `available` cross the bridge.
 */

import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { ApiKeyState } from '@shared/features/games'

interface StoredSecret {
  encrypted: boolean
  /** Base64 of the encrypted buffer, or of the UTF-8 key in the fallback. */
  data: string
}

export class ApiKeyStore {
  private readonly file: string
  private loaded = false
  private secret: StoredSecret | null = null

  constructor(userDataPath: string) {
    this.file = join(userDataPath, 'secrets.bin')
  }

  /** Whether the OS keyring is usable right now. */
  available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    if (!existsSync(this.file)) return
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as StoredSecret
      if (parsed && typeof parsed.data === 'string' && typeof parsed.encrypted === 'boolean') {
        this.secret = parsed
      }
    } catch {
      this.secret = null
    }
  }

  /** The key in clear text, or null. Main process only. */
  read(): string | null {
    this.load()
    if (!this.secret) return null

    const buffer = Buffer.from(this.secret.data, 'base64')

    if (!this.secret.encrypted) return buffer.toString('utf8')

    try {
      return safeStorage.decryptString(buffer)
    } catch {
      // The keyring changed or the file came from another machine: the key is
      // unreadable, and pretending it is configured would only fail later.
      return null
    }
  }

  state(): ApiKeyState {
    this.load()
    const available = this.available()
    return {
      configured: this.secret !== null,
      encrypted: this.secret?.encrypted === true && available,
      available
    }
  }

  /** Store a key, or erase it when `key` is null/blank. */
  write(key: string | null): ApiKeyState {
    const trimmed = key?.trim() ?? ''
    if (trimmed.length === 0) {
      this.clear()
      return this.state()
    }

    const available = this.available()
    const stored: StoredSecret = available
      ? { encrypted: true, data: safeStorage.encryptString(trimmed).toString('base64') }
      : { encrypted: false, data: Buffer.from(trimmed, 'utf8').toString('base64') }

    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 })

    this.secret = stored
    this.loaded = true
    return this.state()
  }

  clear(): void {
    this.secret = null
    this.loaded = true
    try {
      if (existsSync(this.file)) unlinkSync(this.file)
    } catch {
      // Leaving the file behind is harmless; the next write replaces it.
    }
  }
}
