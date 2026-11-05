/**
 * Application logs.
 *
 * The main process mirrors `console.*` into `<userData>/logs/my-rgb.log`
 * (rotation at 2 MB, three archives). Crash dumps live next to it under
 * `logs/crash`. None of this leaves the machine: there is no crash server,
 * nothing is uploaded.
 *
 * These contracts let the renderer list the log files, read their content and
 * export a file as plain text. The renderer never touches the filesystem -
 * everything goes through the main process, which is also the one that owns
 * the file handles.
 */

/** One line of a log file. */
export interface LogEntry {
  /** ISO-8601 timestamp, e.g. `2026-11-05T14:32:00.123Z`. */
  at: string
  /** `error`, `warn`, `info`, `debug` (mapped from console). */
  level: 'error' | 'warn' | 'info' | 'debug'
  /** The message text, with stack traces preserved. */
  message: string
}

/** One log file on disk, current or rotated. */
export interface LogFile {
  /** File name, e.g. `my-rgb.log` or `my-rgb.log.1`. */
  name: string
  /** Size in bytes. */
  size: number
  /** Last modification, epoch milliseconds. */
  mtimeMs: number
  /** Whether this is the file currently being written to. */
  current: boolean
}

/** Result of listing the log directory. */
export interface LogList {
  /** Directory path, for "open in file manager". */
  directory: string
  /** Files, newest first. */
  files: LogFile[]
}

/** Result of reading one log file. */
export interface LogRead {
  name: string
  entries: LogEntry[]
  /** Lines skipped because they could not be parsed. */
  skipped: number
}

/** Level filter shown above the list. */
export type LogLevelFilter = 'all' | 'error' | 'warn' | 'info' | 'debug'
