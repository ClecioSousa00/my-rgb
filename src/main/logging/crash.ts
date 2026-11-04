/**
 * Crash reports kept on disk, never uploaded.
 *
 * There is no crash server behind this app (and shipping one just for this
 * would be worse than the problem), so the reporter runs with uploads off: a
 * crash writes a minidump under `logs/crash` and nothing leaves the machine.
 *
 * It is optional because Crashpad is a second process costing a few MB, and
 * because a packaged Linux build may not be allowed to start it at all:
 * `MYRGB_CRASH_REPORTER=0` or `--no-crash-reporter` turns it off, and a
 * reporter that fails to start is simply reported as absent.
 */

import { app, crashReporter } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { logDirectory } from './index'

export interface CrashReporterOptions {
  /** Where the minidumps go; `<userData>/logs/crash` from the caller. */
  dir: string
  /** `process.env.MYRGB_CRASH_REPORTER`; `0`, `false` or `off` disables. */
  env?: string | undefined
  /** `process.argv`, so the command line can disable it too. */
  argv?: string[]
  version?: string
  /** Product name written into the report annotations. */
  productName?: string
}

/** Where the minidumps are, next to the log file. */
export function crashDumpDirectory(userData: string): string {
  return join(logDirectory(userData), 'crash')
}

/** Whether the reporter should run, from the environment and the command line. */
export function crashReporterEnabled(env: string | undefined, argv: string[] = []): boolean {
  if (argv.includes('--no-crash-reporter')) return false
  const value = (env ?? '').trim().toLowerCase()
  return !(value === '0' || value === 'false' || value === 'off' || value === 'no')
}

/**
 * Start Crashpad with uploads disabled.
 *
 * Must run before `app.whenReady()`: only processes created after it are
 * monitored, so a renderer or GPU crash before this point would be lost.
 * Returns false when disabled or when it could not start - a crash reporter
 * that breaks the app would be worse than none.
 */
export function startCrashReporter(options: CrashReporterOptions): boolean {
  if (!crashReporterEnabled(options.env, options.argv)) return false
  try {
    mkdirSync(options.dir, { recursive: true })
    // The dumps live next to the log, so a single folder covers a report.
    app.setPath('crashDumps', options.dir)
    crashReporter.start({
      uploadToServer: false,
      compress: true,
      productName: options.productName ?? 'MyRGB',
      globalExtra: {
        app: 'my-rgb',
        version: options.version ?? 'unknown'
      }
    })
    return true
  } catch {
    return false
  }
}
