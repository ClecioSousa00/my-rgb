/**
 * Linux login autostart.
 *
 * `app.setLoginItemSettings()` is a no-op on Linux: Electron has an empty
 * implementation for the whole platform. The freedesktop way to start a GUI
 * application at login is an entry in `$XDG_CONFIG_HOME/autostart`, which is
 * exactly what `app.getPath('appData')` returns on Linux (`~/.config`).
 *
 * Everything here is pure except `applyAutostartEntry`, which only touches the
 * file it is given, so the format is testable without Electron.
 *
 * The generated file looks like this:
 *
 *     [Desktop Entry]
 *     Type=Application
 *     Name=MyRGB
 *     Comment=Controle de iluminação RGB ASUS AURA
 *     Exec="/opt/MyRGB/my-rgb" --hidden
 *     Terminal=false
 *     StartupNotify=false
 *     X-GNOME-Autostart-enabled=true
 *     Icon=my-rgb
 *
 * `--hidden` is what makes the app start in the tray: the window only shows
 * when that argument is absent (`ready-to-show` in `index.ts`).
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

/** File name inside the autostart directory. */
export const AUTOSTART_FILE = 'my-rgb.desktop'

/** Directory the login session reads on Linux. */
export function autostartDirectory(appData: string): string {
  return join(appData, 'autostart')
}

/** Full path of the entry this program owns. */
export function autostartEntryPath(appData: string): string {
  return join(autostartDirectory(appData), AUTOSTART_FILE)
}

/** Whether an argument can be written without quotes. */
const SAFE_ARG = /^[A-Za-z0-9_./:@+,-]+$/

/**
 * Escape one argument for the `Exec` key.
 *
 * The desktop entry spec has its own quoting rules, not shell ones: the value
 * is split on spaces, double quotes group an argument, and inside the quotes
 * `"`, `` ` ``, `$` and `\` must be escaped with a backslash. A literal `%`
 * is a field-code introducer and has to be written `%%`.
 */
export function escapeExecArg(arg: string): string {
  const withPercent = arg.replace(/%/g, '%%')
  if (SAFE_ARG.test(withPercent)) return withPercent
  const escaped = withPercent.replace(/(["`$\\])/g, '\\$1')
  return `"${escaped}"`
}

/** Build the value of the `Exec` key from the already resolved command. */
export function buildExecCommand(program: string[]): string {
  return program.map(escapeExecArg).join(' ')
}

/** What the main process knows about how it was launched. */
export interface LaunchInfo {
  /** `app.isPackaged`. */
  packaged: boolean
  /** `process.execPath`. */
  execPath: string
  /** `app.getAppPath()`, only used in development. */
  appPath: string
  /**
   * `process.env.APPIMAGE`: the real file path when running from an AppImage.
   * `process.execPath` points at the temporary mount in that case.
   */
  appImage?: string
}

/**
 * The command that starts this same build, hidden in the tray.
 *
 * - AppImage: the `.AppImage` file itself, never the temporary mount.
 * - Installed (`.deb`): the executable in `/opt/MyRGB`.
 * - Development: the Electron binary plus the project path.
 */
export function autostartCommand(info: LaunchInfo): string[] {
  if (info.appImage && info.appImage.length > 0) return [info.appImage, '--hidden']
  if (info.packaged) return [info.execPath, '--hidden']
  return [info.execPath, info.appPath, '--hidden']
}

export interface AutostartEntryInput {
  /** Command that starts the app, `--hidden` included. */
  program: string[]
  /** Shown in some desktop environments' startup lists. */
  name?: string
  comment?: string
  icon?: string
}

/** Render the `.desktop` file contents. Always ends with a newline. */
export function buildAutostartEntry(input: AutostartEntryInput): string {
  const name = input.name ?? 'MyRGB'
  const comment = input.comment ?? 'Controle de iluminação RGB ASUS AURA'
  const icon = input.icon ?? 'my-rgb'
  return (
    [
      '[Desktop Entry]',
      'Type=Application',
      'Version=1.0',
      `Name=${name}`,
      `Comment=${comment}`,
      `Exec=${buildExecCommand(input.program)}`,
      'Terminal=false',
      'StartupNotify=false',
      'X-GNOME-Autostart-enabled=true',
      `Icon=${icon}`
    ].join('\n') + '\n'
  )
}

export interface ApplyAutostartOptions extends AutostartEntryInput {
  /** Whether the entry should exist after the call. */
  enabled: boolean
  /** `app.getPath('appData')` — `~/.config` on Linux. */
  appData: string
}

export interface ApplyAutostartResult {
  /** Path of the entry, whether it was written or removed. */
  path: string
  /** Whether the file on disk changed. */
  changed: boolean
}

/**
 * Write or remove the autostart entry.
 *
 * Idempotent: writing the same content again reports `changed: false`, so the
 * startup repair is free. Failures propagate; the caller logs them.
 */
export function applyAutostartEntry(options: ApplyAutostartOptions): ApplyAutostartResult {
  const path = autostartEntryPath(options.appData)

  if (!options.enabled) {
    if (!existsSync(path)) return { path, changed: false }
    unlinkSync(path)
    return { path, changed: true }
  }

  const content = buildAutostartEntry(options)
  if (existsSync(path) && readFileSync(path, 'utf8') === content) {
    return { path, changed: false }
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o644 })
  return { path, changed: true }
}
