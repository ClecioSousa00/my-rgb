/**
 * Log level, shared by the main process (which writes the file) and the
 * settings popover (which picks it).
 *
 * Kept in `shared` so the label shown in the UI and the threshold used by the
 * writer can never disagree.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/** Labels for the settings screen, most severe first. */
export const LOG_LEVELS: ReadonlyArray<{ id: LogLevel; label: string }> = [
  { id: 'error', label: 'Só erros' },
  { id: 'warn', label: 'Avisos' },
  { id: 'info', label: 'Informação' },
  { id: 'debug', label: 'Depuração' }
]

export const DEFAULT_LOG_LEVEL: LogLevel = 'info'

/** Numeric order used to filter; lower is more severe. */
export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
}

/**
 * Whatever a settings file, an environment variable or an IPC patch contains,
 * turned into a level.
 *
 * An unknown value falls back to `info`: a typo must not silence the log, and
 * a corrupt settings file must not turn logging off.
 */
export function normalizeLogLevel(value: unknown): LogLevel {
  if (typeof value !== 'string') return DEFAULT_LOG_LEVEL
  const level = value.trim().toLowerCase()
  if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') return level
  return DEFAULT_LOG_LEVEL
}
