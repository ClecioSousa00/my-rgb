/**
 * Linux autostart.
 *
 * Electron's `setLoginItemSettings` does nothing on Linux, so the app writes
 * its own freedesktop entry. The format is easy to get subtly wrong (quoting,
 * field codes), and a wrong `Exec` line means the app silently never starts —
 * which is exactly the bug this module fixes. These tests pin the format.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  applyAutostartEntry,
  autostartCommand,
  autostartEntryPath,
  buildAutostartEntry,
  buildExecCommand,
  escapeExecArg
} from '@main/platform/autostart'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'myrgb-autostart-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('escapeExecArg', () => {
  it('leaves a plain path alone', () => {
    expect(escapeExecArg('/opt/MyRGB/my-rgb')).toBe('/opt/MyRGB/my-rgb')
  })

  it('quotes a path with spaces', () => {
    expect(escapeExecArg('/home/Clecio Sousa/MyRGB.AppImage')).toBe(
      '"/home/Clecio Sousa/MyRGB.AppImage"'
    )
  })

  it('doubles a literal percent so it is not read as a field code', () => {
    expect(escapeExecArg('/tmp/100%/my-rgb')).toBe('"/tmp/100%%/my-rgb"')
  })

  it('escapes quote, dollar, backtick and backslash inside the quotes', () => {
    expect(escapeExecArg('/tmp/a"b$c`d\\e')).toBe('"/tmp/a\\"b\\$c\\`d\\\\e"')
  })

  it('leaves the --hidden flag unquoted', () => {
    expect(escapeExecArg('--hidden')).toBe('--hidden')
  })
})

describe('buildExecCommand', () => {
  it('joins the program and its arguments', () => {
    expect(buildExecCommand(['/opt/MyRGB/my-rgb', '--hidden'])).toBe(
      '/opt/MyRGB/my-rgb --hidden'
    )
  })

  it('quotes only the argument that needs it', () => {
    expect(buildExecCommand(['/home/My RGB/my-rgb', '--hidden'])).toBe(
      '"/home/My RGB/my-rgb" --hidden'
    )
  })
})

describe('autostartCommand', () => {
  it('uses the AppImage file, never the temporary mount', () => {
    expect(
      autostartCommand({
        packaged: true,
        execPath: '/tmp/.mount_MyRGB123/my-rgb',
        appPath: '/tmp/.mount_MyRGB123/resources/app.asar',
        appImage: '/home/clecio/Apps/MyRGB.AppImage'
      })
    ).toEqual(['/home/clecio/Apps/MyRGB.AppImage', '--hidden'])
  })

  it('uses the installed executable in a packaged build', () => {
    expect(
      autostartCommand({
        packaged: true,
        execPath: '/opt/MyRGB/my-rgb',
        appPath: '/opt/MyRGB/resources/app.asar'
      })
    ).toEqual(['/opt/MyRGB/my-rgb', '--hidden'])
  })

  it('adds the project path in development', () => {
    expect(
      autostartCommand({
        packaged: false,
        execPath: '/home/dev/my-rgb/node_modules/electron/dist/electron',
        appPath: '/home/dev/my-rgb'
      })
    ).toEqual([
      '/home/dev/my-rgb/node_modules/electron/dist/electron',
      '/home/dev/my-rgb',
      '--hidden'
    ])
  })
})

describe('buildAutostartEntry', () => {
  it('writes a desktop entry that starts hidden', () => {
    const entry = buildAutostartEntry({
      program: ['/opt/MyRGB/my-rgb', '--hidden']
    })
    expect(entry).toContain('[Desktop Entry]')
    expect(entry).toContain('Type=Application')
    expect(entry).toContain('Name=MyRGB')
    expect(entry).toContain('Exec=/opt/MyRGB/my-rgb --hidden')
    expect(entry).toContain('Terminal=false')
    expect(entry).toContain('X-GNOME-Autostart-enabled=true')
    expect(entry.endsWith('\n')).toBe(true)
  })

  it('keeps a quoted command intact in the Exec key', () => {
    const entry = buildAutostartEntry({
      program: ['/home/Clecio Sousa/MyRGB.AppImage', '--hidden'],
      name: 'MyRGB',
      comment: 'Test entry',
      icon: 'my-rgb'
    })
    expect(entry).toContain('Exec="/home/Clecio Sousa/MyRGB.AppImage" --hidden')
    expect(entry).toContain('Comment=Test entry')
  })
})

describe('applyAutostartEntry', () => {
  it('writes the entry and creates the autostart directory', () => {
    const appData = join(tempDir(), 'config')
    const path = autostartEntryPath(appData)
    expect(path).toBe(join(appData, 'autostart', 'my-rgb.desktop'))

    const result = applyAutostartEntry({
      enabled: true,
      appData,
      program: ['/opt/MyRGB/my-rgb', '--hidden']
    })

    expect(result).toEqual({ path, changed: true })
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('Exec=/opt/MyRGB/my-rgb --hidden')
  })

  it('does not rewrite an entry that is already right', () => {
    const appData = tempDir()
    const options = {
      enabled: true,
      appData,
      program: ['/opt/MyRGB/my-rgb', '--hidden']
    }
    applyAutostartEntry(options)
    expect(applyAutostartEntry(options)).toEqual({
      path: autostartEntryPath(appData),
      changed: false
    })
  })

  it('replaces an outdated entry', () => {
    const appData = tempDir()
    applyAutostartEntry({
      enabled: true,
      appData,
      program: ['/old/location/my-rgb', '--hidden']
    })
    const result = applyAutostartEntry({
      enabled: true,
      appData,
      program: ['/opt/MyRGB/my-rgb', '--hidden']
    })
    expect(result.changed).toBe(true)
    expect(readFileSync(result.path, 'utf8')).toContain('Exec=/opt/MyRGB/my-rgb --hidden')
  })

  it('removes the entry when disabled', () => {
    const appData = tempDir()
    const path = autostartEntryPath(appData)
    applyAutostartEntry({
      enabled: true,
      appData,
      program: ['/opt/MyRGB/my-rgb', '--hidden']
    })

    expect(
      applyAutostartEntry({
        enabled: false,
        appData,
        program: ['/opt/MyRGB/my-rgb', '--hidden']
      })
    ).toEqual({ path, changed: true })
    expect(existsSync(path)).toBe(false)
  })

  it('reports no change when there is nothing to remove', () => {
    const appData = tempDir()
    expect(
      applyAutostartEntry({
        enabled: false,
        appData,
        program: ['/opt/MyRGB/my-rgb', '--hidden']
      })
    ).toEqual({ path: autostartEntryPath(appData), changed: false })
  })
})
