/**
 * Application logs, from the main process's point of view.
 *
 * Owns the list of log files and the read of their content. The renderer
 * never touches the filesystem: every read goes through these functions,
 * which also guard against files that disappeared between the list and the
 * read.
 */

import { app } from 'electron'
import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { logDirectory, LOG_FILE_NAME } from '../../logging'
import type { LogEntry, LogFile, LogList, LogRead } from '@shared/features/log'

/** One line of the log file looks like:
 *  `2026-11-05T14:32:00.123Z ERROR something went wrong`
 *  Stack traces continue on following lines, indented under the message.
 */
const LINE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(ERROR|WARN|INFO|DEBUG)\s(.*)$/s

/** All log files, newest first. */
export function listLogs(): LogList {
  const directory = logDirectory(app.getPath('userData'))
  const files: LogFile[] = []

  if (!existsSync(directory)) {
    return { directory, files: [] }
  }

  for (const name of readdirSync(directory)) {
    const full = join(directory, name)
    let stats: ReturnType<typeof statSync>
    try {
      stats = statSync(full)
    } catch {
      continue
    }
    if (!stats.isFile()) continue
    files.push({
      name,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      current: name === LOG_FILE_NAME
    })
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return { directory, files }
}

/** Read one log file and parse its lines. */
export function readLog(name: string): LogRead {
  const directory = logDirectory(app.getPath('userData'))
  const full = join(directory, name)

  let text: string
  try {
    text = readFileSync(full, 'utf8')
  } catch {
    return { name, entries: [], skipped: 0 }
  }

  const entries: LogEntry[] = []
  let skipped = 0

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd()
    if (line.length === 0) continue

    const match = LINE_RE.exec(line)
    if (!match) {
      // A stack trace continues on the following lines. Keep them attached to
      // the event that produced them, otherwise exporting the log would lose
      // the part that actually explains the failure. A line with no event
      // before it cannot be attached and is counted as skipped.
      const previous = entries[entries.length - 1]
      if (previous) previous.message += `\n${rawLine}`
      else skipped += 1
      continue
    }

    entries.push({
      at: match[1],
      level: match[2].toLowerCase() as LogEntry['level'],
      message: match[3]
    })
  }

  return { name, entries, skipped }
}
