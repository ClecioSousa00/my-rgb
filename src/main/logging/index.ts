/**
 * Main-process log file.
 *
 * Everything printed by the main process is also appended to a file in the
 * user data directory. A failure on someone else's machine leaves no other
 * trace: the terminal is gone as soon as the app is opened from the menu, and
 * "the lights stopped" is not something a user can report without a file.
 *
 * Two rules make it safe to leave this on permanently:
 *  - the file rotates instead of growing forever (2 MB, three files kept);
 *  - a logging failure never breaks the app. If the file cannot be written,
 *    the console keeps working and the file is abandoned for the session.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { format } from 'util'
import {
  LOG_LEVEL_ORDER,
  normalizeLogLevel,
  type LogLevel
} from '@shared/logging'

/** Rotate once the current file passes this size (2 MB). */
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

/** Rotated files kept as `.1` … `.3`; the total stays under 8 MB. */
export const DEFAULT_KEEP = 3

export const LOG_FILE_NAME = 'my-rgb.log'

/** `<userData>/logs`, where both the log and the crash dumps live. */
export function logDirectory(userData: string): string {
  return join(userData, 'logs')
}

/**
 * `<time> <LEVEL> <message>` in one line, with the continuation of a stack
 * trace aligned under the message instead of breaking the column.
 */
export function formatLine(level: LogLevel, at: Date, args: unknown[]): string {
  // `util.format` is what `console.log` already uses, so an object or an
  // Error lands in the file the same way it lands in the terminal.
  const text = format(...args)
  const head = `${at.toISOString()} ${level.toUpperCase().padEnd(5)} `
  const indent = ' '.repeat(head.length)
  const body = text
    .split('\n')
    .map((line, index) => (index === 0 ? line : indent + line))
    .join('\n')
  return `${head}${body}\n`
}

export interface FileLoggerOptions {
  /** Directory that holds the log files; created on the first write. */
  dir: string
  /** Base name without the extension, so tests do not share a file. */
  name?: string
  /** Messages below this level are dropped. Defaults to `info`. */
  level?: LogLevel
  /** Rotate once the current file passes this many bytes. */
  maxBytes?: number
  /** Rotated files to keep; `0` truncates instead of archiving. */
  keep?: number
  /** Clock for the prefix and the rotation; injectable for tests. */
  now?: () => Date
}

export class FileLogger {
  readonly dir: string
  readonly file: string
  private level: LogLevel
  private readonly maxBytes: number
  private readonly keep: number
  private readonly now: () => Date
  /** Set when the file could not be written; stops retrying on every line. */
  private broken = false

  constructor(options: FileLoggerOptions) {
    this.dir = options.dir
    this.file = join(options.dir, `${options.name ?? 'my-rgb'}.log`)
    this.level = normalizeLogLevel(options.level)
    this.maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES)
    this.keep = Math.max(0, options.keep ?? DEFAULT_KEEP)
    this.now = options.now ?? (() => new Date())
  }

  get currentLevel(): LogLevel {
    return this.level
  }

  /** Change the threshold while the app runs (settings screen). */
  setLevel(level: LogLevel): void {
    this.level = normalizeLogLevel(level)
  }

  /** Writes one line when `level` is at least as severe as the threshold. */
  log(level: LogLevel, ...args: unknown[]): void {
    if (LOG_LEVEL_ORDER[level] > LOG_LEVEL_ORDER[this.level]) return
    this.append(formatLine(level, this.now(), args))
  }

  private append(line: string): void {
    if (this.broken) return
    try {
      mkdirSync(this.dir, { recursive: true })
      this.rotateIfNeeded(Buffer.byteLength(line))
      appendFileSync(this.file, line, 'utf8')
    } catch {
      // A log that cannot be written must not take the app with it, and must
      // not retry (and fail) on every single line. The console still works.
      this.broken = true
    }
  }

  private rotateIfNeeded(incoming: number): void {
    let size: number
    try {
      size = statSync(this.file).size
    } catch {
      return // No file yet: nothing to rotate.
    }
    if (size + incoming <= this.maxBytes) return

    if (this.keep === 0) {
      try {
        unlinkSync(this.file)
      } catch {
        /* already gone */
      }
      return
    }

    // Drop the oldest, shift every archive up one slot, then archive the file
    // that just filled up. A rename that loses a race is not worth reporting.
    try {
      unlinkSync(`${this.file}.${this.keep}`)
    } catch {
      /* nothing to drop */
    }
    for (let index = this.keep - 1; index >= 1; index -= 1) {
      const from = `${this.file}.${index}`
      if (existsSync(from)) renameSync(from, `${this.file}.${index + 1}`)
    }
    renameSync(this.file, `${this.file}.1`)
  }
}

let installed = false

/**
 * Mirror the console into the file.
 *
 * The main process already talks to the console (startup errors, renderer
 * messages, hardware failures); mirroring turns those messages into something
 * a user can attach to a report without touching every call site.
 */
export function installConsoleLogging(logger: FileLogger): void {
  // A second call would double every line, so it is a one-shot installation.
  if (installed) return
  installed = true
  const methods: Array<[keyof Console, LogLevel]> = [
    ['error', 'error'],
    ['warn', 'warn'],
    ['log', 'info'],
    ['info', 'info'],
    ['debug', 'debug']
  ]
  for (const [method, level] of methods) {
    const original = (console[method] as (...args: unknown[]) => void).bind(console)
    ;(console as unknown as Record<string, (...args: unknown[]) => void>)[method] = (
      ...args: unknown[]
    ) => {
      original(...args)
      logger.log(level, ...args)
    }
  }
}

let active: FileLogger | null = null

/** The logger installed by `startLogging`, or null before the bootstrap. */
export function activeLogger(): FileLogger | null {
  return active
}

/** Path of the log file, for the "open logs" action and the self test. */
export function activeLogFile(): string | null {
  return active?.file ?? null
}

/** Change the threshold of the running logger, if there is one. */
export function applyLogLevel(level: LogLevel): void {
  active?.setLevel(level)
}

export interface StartLoggingOptions extends FileLoggerOptions {
  /** Written on the first line, so a report always says which build it is. */
  version?: string
}

/**
 * Open the log file and mirror the console into it.
 *
 * Called before the window exists: when startup itself fails, the file is the
 * only record of why.
 */
export function startLogging(options: StartLoggingOptions): FileLogger {
  const logger = new FileLogger(options)
  active = logger
  installConsoleLogging(logger)
  const version = options.version ? `v${options.version} ` : ''
  logger.log(
    'info',
    `MyRGB ${version}started on ${process.platform} (Electron ${process.versions.electron}, Node ${process.versions.node})`
  )
  logger.log('info', `log file: ${logger.file}`)
  return logger
}
