/**
 * File log and crash reporter tests.
 *
 * The log is the only trace a failure leaves on someone else's machine, so the
 * parts that can fail silently are pinned here: the level filter, the
 * rotation, the "never throw" rule, and the crash reporter switch (which must
 * never upload anything).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DEFAULT_LOG_LEVEL, LOG_LEVELS, normalizeLogLevel } from '@shared/logging'
import { FileLogger, formatLine, logDirectory } from '@main/logging'
import { crashDumpDirectory, crashReporterEnabled, startCrashReporter } from '@main/logging/crash'
import { SettingsStore } from '@main/store/settings'

// The crash module touches `app` and `crashReporter`; the test asserts what it
// is told, not what Electron does with it.
const electron = vi.hoisted(() => ({ setPath: vi.fn(), start: vi.fn() }))
vi.mock('electron', () => ({
  app: { setPath: electron.setPath },
  crashReporter: { start: electron.start }
}))

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.clearAllMocks()
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'myrgb-log-'))
  tempDirs.push(dir)
  return dir
}

describe('log level', () => {
  it('accepts the four levels, in any case', () => {
    expect(normalizeLogLevel('error')).toBe('error')
    expect(normalizeLogLevel('WARN')).toBe('warn')
    expect(normalizeLogLevel(' Info ')).toBe('info')
    expect(normalizeLogLevel('debug')).toBe('debug')
  })

  it('falls back to info for anything else', () => {
    // A typo in the settings file or in MYRGB_LOG_LEVEL must not silence the
    // log; `trace` is not one of our levels.
    expect(normalizeLogLevel(undefined)).toBe(DEFAULT_LOG_LEVEL)
    expect(normalizeLogLevel('')).toBe(DEFAULT_LOG_LEVEL)
    expect(normalizeLogLevel('trace')).toBe(DEFAULT_LOG_LEVEL)
    expect(normalizeLogLevel(42)).toBe(DEFAULT_LOG_LEVEL)
    expect(normalizeLogLevel(null)).toBe(DEFAULT_LOG_LEVEL)
  })

  it('offers one label per level to the settings screen', () => {
    expect(LOG_LEVELS.map((level) => level.id)).toEqual(['error', 'warn', 'info', 'debug'])
    for (const level of LOG_LEVELS) expect(level.label.length).toBeGreaterThan(0)
  })
})

describe('formatLine', () => {
  const at = new Date('2026-11-03T12:00:00.000Z')

  it('writes time, padded level and message on one line', () => {
    expect(formatLine('info', at, ['a', 1, true])).toBe(
      '2026-11-03T12:00:00.000Z INFO  a 1 true\n'
    )
    expect(formatLine('error', at, ['boom'])).toBe('2026-11-03T12:00:00.000Z ERROR boom\n')
  })

  it('formats objects like the console does', () => {
    expect(formatLine('warn', at, [{ zone: 'argb0', leds: 120 }])).toBe(
      '2026-11-03T12:00:00.000Z WARN  { zone: \'argb0\', leds: 120 }\n'
    )
  })

  it('aligns the continuation of a stack trace under the message', () => {
    const line = formatLine('error', at, ['failed\n  at one\n  at two'])
    const [first, second, third] = line.trimEnd().split('\n')
    expect(first).toBe('2026-11-03T12:00:00.000Z ERROR failed')
    expect(second).toBe(`${' '.repeat(31)}  at one`)
    expect(third).toBe(`${' '.repeat(31)}  at two`)
  })
})

describe('FileLogger', () => {
  it('drops messages below the threshold', () => {
    const dir = tempDir()
    const logger = new FileLogger({ dir, level: 'warn' })
    logger.log('debug', 'debug line')
    logger.log('info', 'info line')
    logger.log('warn', 'warn line')
    logger.log('error', 'error line')

    const text = readFileSync(logger.file, 'utf8')
    expect(text).toContain('warn line')
    expect(text).toContain('error line')
    expect(text).not.toContain('info line')
    expect(text).not.toContain('debug line')
  })

  it('applies a new level without reopening the file', () => {
    const dir = tempDir()
    const logger = new FileLogger({ dir, level: 'error' })
    logger.log('info', 'hidden')
    logger.setLevel('debug')
    logger.log('info', 'shown')
    // An unknown level from the settings screen is normalized, not trusted.
    logger.setLevel('nonsense' as never)
    expect(logger.currentLevel).toBe('info')
    logger.log('debug', 'hidden again')

    const text = readFileSync(logger.file, 'utf8')
    expect(text).toContain('shown')
    expect(text).not.toContain('hidden')
    expect(text).not.toContain('hidden again')
  })

  it('creates the directory on the first line', () => {
    const dir = join(tempDir(), 'nested', 'logs')
    const logger = new FileLogger({ dir })
    logger.log('info', 'hello')
    expect(existsSync(logger.file)).toBe(true)
  })

  it('rotates instead of growing forever', () => {
    const dir = tempDir()
    const logger = new FileLogger({ dir, maxBytes: 120, keep: 3 })
    for (let index = 0; index < 40; index += 1) logger.log('info', `line ${index} ${'x'.repeat(20)}`)

    const files = readdirSync(dir).sort()
    expect(files).toEqual(['my-rgb.log', 'my-rgb.log.1', 'my-rgb.log.2', 'my-rgb.log.3'])
    for (const name of files) {
      // One line can exceed the cap, but never two.
      expect(readFileSync(join(dir, name), 'utf8').length).toBeLessThan(120 + 80)
    }
    // The current file keeps the newest lines and the archives the older ones.
    expect(readFileSync(join(dir, 'my-rgb.log'), 'utf8')).toContain('line 39')
    expect(readFileSync(join(dir, 'my-rgb.log.3'), 'utf8')).not.toContain('line 39')
  })

  it('truncates when no archive is kept', () => {
    const dir = tempDir()
    const logger = new FileLogger({ dir, maxBytes: 60, keep: 0 })
    for (let index = 0; index < 6; index += 1) logger.log('info', `line ${index} ${'y'.repeat(10)}`)
    expect(readdirSync(dir)).toEqual(['my-rgb.log'])
  })

  it('never throws when the file cannot be written', () => {
    const dir = tempDir()
    // A regular file where the log directory should be: mkdir fails.
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'x')
    const logger = new FileLogger({ dir: join(blocker, 'logs') })

    expect(() => logger.log('error', 'first')).not.toThrow()
    expect(() => logger.log('error', 'second')).not.toThrow()
    expect(existsSync(logger.file)).toBe(false)
  })

  it('never writes twice to the same file from two loggers by accident', () => {
    const dir = tempDir()
    const a = new FileLogger({ dir, name: 'one' })
    const b = new FileLogger({ dir, name: 'two' })
    a.log('info', 'from a')
    b.log('info', 'from b')
    expect(readFileSync(a.file, 'utf8')).toContain('from a')
    expect(readFileSync(a.file, 'utf8')).not.toContain('from b')
    expect(readFileSync(b.file, 'utf8')).toContain('from b')
  })
})

describe('log paths', () => {
  it('puts the log folder under the user data directory', () => {
    expect(logDirectory('/home/user/.config/my-rgb')).toBe('/home/user/.config/my-rgb/logs')
    expect(crashDumpDirectory('/home/user/.config/my-rgb')).toBe(
      '/home/user/.config/my-rgb/logs/crash'
    )
  })
})

describe('crash reporter', () => {
  it('runs by default and can be switched off from the environment or argv', () => {
    expect(crashReporterEnabled(undefined)).toBe(true)
    expect(crashReporterEnabled('1')).toBe(true)
    expect(crashReporterEnabled('0')).toBe(false)
    expect(crashReporterEnabled('FALSE')).toBe(false)
    expect(crashReporterEnabled('off')).toBe(false)
    expect(crashReporterEnabled(undefined, ['--no-crash-reporter'])).toBe(false)
  })

  it('never uploads and stores the dumps next to the log', () => {
    const dir = join(tempDir(), 'crash')
    expect(startCrashReporter({ dir, env: '1', version: '0.2.0' })).toBe(true)

    expect(electron.setPath).toHaveBeenCalledWith('crashDumps', dir)
    expect(electron.start).toHaveBeenCalledTimes(1)
    const options = electron.start.mock.calls[0][0] as {
      uploadToServer: boolean
      globalExtra: Record<string, string>
    }
    // No server exists behind the app; a report must stay on the machine.
    expect(options.uploadToServer).toBe(false)
    expect(options.globalExtra).toEqual({ app: 'my-rgb', version: '0.2.0' })
    expect(existsSync(dir)).toBe(true)
  })

  it('does nothing when switched off that way', () => {
    const dir = join(tempDir(), 'crash')
    expect(startCrashReporter({ dir, env: '0' })).toBe(false)
    expect(electron.start).not.toHaveBeenCalled()
    expect(existsSync(dir)).toBe(false)
  })
})

describe('settings', () => {
  it('keeps a valid log level and repairs an invalid one', () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ autoStart: false, logLevel: 'debug' }),
      'utf8'
    )
    expect(new SettingsStore(dir).settings.logLevel).toBe('debug')

    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ logLevel: 'banana' }), 'utf8')
    expect(new SettingsStore(dir).settings.logLevel).toBe(DEFAULT_LOG_LEVEL)
  })

  it('normalizes the level on write', () => {
    const store = new SettingsStore(tempDir())
    expect(store.set({ logLevel: 'warn' }).logLevel).toBe('warn')
    expect(store.set({ logLevel: 'nope' as never }).logLevel).toBe(DEFAULT_LOG_LEVEL)
  })
})
