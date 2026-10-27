/**
 * S.M.A.R.T. through `smartmontools`.
 *
 * `smartctl -a -j` is the only source that covers NVMe and SATA with the same
 * command, and it returns JSON that is stable across distributions. The catch
 * is that reading the device usually needs root: the normal read is tried
 * first, and when it fails for permission the page offers one privileged read
 * through `pkexec` (a single prompt for every disk, not one per disk).
 *
 * `smartctl` exits with a bitmask when it finds problems (a failing disk, an
 * attribute at its threshold...). That is not an execution error - the JSON is
 * still on stdout - so the exit status is ignored and the data is parsed.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const run = promisify(execFile)

const VERSION_TTL_MS = 60_000
const READ_TIMEOUT_MS = 10_000
const ELEVATED_TIMEOUT_MS = 120_000
const MAX_BUFFER = 16 * 1024 * 1024

/** ATA attributes we care about, by their well-known id. */
const ATTR_REALLOCATED = 5
const ATTR_POWER_ON_HOURS = 9
const ATTR_POWER_CYCLES = 12
const ATTR_REPORTED_UNCORRECT = 187
const ATTR_TEMPERATURE = 194
const ATTR_PENDING = 197
const ATTR_OFFLINE_UNCORRECTABLE = 198

/** Normalized attributes where 100 means "new" and 0 means "worn out". */
const ATTR_LIFE_LEFT = new Set([177, 202, 231, 232, 233])

export interface SmartctlAttribute {
  id?: number
  name?: string
  value?: number
  worst?: number
  thresh?: number
  /** "now" / "past" when the attribute crossed its threshold. */
  when_failed?: string
  raw?: { value?: number; string?: string }
}

export interface SmartctlJson {
  model_name?: string
  model_family?: string
  serial_number?: string
  firmware_version?: string
  device?: { type?: string; protocol?: string; name?: string }
  smart_status?: { passed?: boolean }
  temperature?: { current?: number }
  power_on_time?: { hours?: number }
  power_cycle_count?: number
  rotation_rate?: number
  ata_smart_attributes?: { table?: SmartctlAttribute[] }
  nvme_smart_health_information_log?: {
    critical_warning?: number
    temperature?: number
    available_spare?: number
    available_spare_threshold?: number
    percentage_used?: number
    data_units_read?: number
    data_units_written?: number
    host_reads?: number
    host_writes?: number
    power_cycles?: number
    power_on_hours?: number
    media_errors?: number
    num_err_log_entries?: number
  }
  smartctl?: {
    messages?: Array<{ severity?: string; string?: string }>
    exit_status?: number
  }
}

export interface SmartMetrics {
  temperatureC?: number
  wearPercent?: number
  powerOnHours?: number
  powerCycles?: number
  reallocatedSectors?: number
  pendingSectors?: number
  uncorrectableSectors?: number
  mediaErrors?: number
  /** NVMe spare capacity, in percent. */
  availableSpare?: number
  writtenBytes?: number
  readBytes?: number
  smartStatus?: string
  /** `undefined` when the drive does not answer this question. */
  smartPassed?: boolean
  criticalWarning?: number
  /** Worst `when_failed` found in the ATA attribute table. */
  failedAttribute?: 'now' | 'past'
  /** Messages worth showing from smartctl itself. */
  notes: string[]
}

export interface ParsedSmartctl {
  model?: string
  serial?: string
  firmware?: string
  metrics: SmartMetrics
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function countOrUndefined(value: unknown): number | undefined {
  const parsed = numberOrUndefined(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}

function clampPercent(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  return Math.max(0, Math.min(100, Math.round(value)))
}

function temperature(value: number | undefined): number | undefined {
  if (value === undefined || value <= 0 || value >= 150) return undefined
  return Math.round(value * 10) / 10
}

/** NVMe data units are 1000 * 512 bytes. */
function dataUnits(value: unknown): number | undefined {
  const units = countOrUndefined(value)
  if (units === undefined || units === 0) return undefined
  return units * 1000 * 512
}

/** The kernel exposes `nvme0n1`; smartctl addresses the controller (`nvme0`). */
export function smartctlDevice(device: string): string {
  const match = device.match(/^(\/dev\/nvme\d+)n\d+$/)
  return match ? match[1] : device
}

let versionCheckedAt = 0
let versionAvailable = false

/** Whether `smartctl` exists, cached for a minute. */
export async function smartctlAvailable(force = false): Promise<boolean> {
  if (!force && versionCheckedAt > 0 && Date.now() - versionCheckedAt < VERSION_TTL_MS) {
    return versionAvailable
  }
  try {
    await run('smartctl', ['--version'], { timeout: 4000 })
    versionAvailable = true
  } catch (err) {
    // Any answer that is not "command not found" means the binary is there;
    // an old build may exit non-zero for --version.
    versionAvailable = (err as { code?: string }).code !== 'ENOENT'
  }
  versionCheckedAt = Date.now()
  return versionAvailable
}

let pkexecCheckedAt = 0
let pkexecFound = false

export async function pkexecAvailable(force = false): Promise<boolean> {
  if (!force && pkexecCheckedAt > 0 && Date.now() - pkexecCheckedAt < VERSION_TTL_MS) {
    return pkexecFound
  }
  try {
    await run('pkexec', ['--version'], { timeout: 4000 })
    pkexecFound = true
  } catch (err) {
    // polkit is not required to be able to print a version; only a missing
    // binary rules it out.
    pkexecFound = (err as { code?: string }).code !== 'ENOENT'
  }
  pkexecCheckedAt = Date.now()
  return pkexecFound
}

export interface SmartctlRun {
  json?: SmartctlJson
  /** Why the command did not produce JSON. */
  error?: string
  /** The device exists but could not be opened without privileges. */
  permission?: boolean
  /** The user dismissed the polkit prompt (or it was not authorised). */
  canceled?: boolean
}

function errorText(err: unknown): string {
  const e = err as { message?: string; stderr?: string }
  return (e.stderr || e.message || '').trim()
}

function parseJson(stdout: string | undefined): SmartctlJson | undefined {
  const text = stdout?.trim()
  if (!text) return undefined
  try {
    return JSON.parse(text) as SmartctlJson
  } catch {
    // pkexec (or a wrapper) may print a line before the JSON. The payload
    // always starts at the first `{`, so try from there.
    const start = text.indexOf('{')
    if (start < 0) return undefined
    try {
      return JSON.parse(text.slice(start)) as SmartctlJson
    } catch {
      return undefined
    }
  }
}

const PERMISSION_PATTERN =
  /permission denied|operation not permitted|must be root|requires? root|not authorized|failed to open|access denied|cannot open/i

function interpretFailure(err: unknown): SmartctlRun {
  const e = err as { stdout?: string; stderr?: string; code?: number | string; message?: string }
  const json = parseJson(e.stdout)
  const text = errorText(err)
  const permission = PERMISSION_PATTERN.test(text)
  const canceled = e.code === 126 || e.code === 127 || /dismissed|not authorized/i.test(text)

  if (json) {
    // smartctl writes a valid JSON even when the disk is failing. Keep it.
    return { json, permission: permission || undefined, canceled: canceled || undefined }
  }

  return {
    error: text || 'o smartctl não devolveu dados',
    permission: permission || undefined,
    canceled: canceled || undefined
  }
}

/** Read one device. `device` must already be in smartctl's spelling. */
export async function readSmartctl(device: string): Promise<SmartctlRun> {
  try {
    const { stdout } = await run('smartctl', ['-a', '-j', device], {
      timeout: READ_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER
    })
    const json = parseJson(stdout)
    return json ? { json } : { error: 'o smartctl não devolveu JSON' }
  } catch (err) {
    return interpretFailure(err)
  }
}

export interface ElevatedSmartctlRead {
  /** JSON per device, keyed by the device string passed in. */
  byDevice: Map<string, SmartctlJson>
  canceled: boolean
  error?: string
}

/**
 * Split the concatenated output of the privileged batch read.
 *
 * Each device is preceded by a marker line, so a disk that fails (or prints
 * nothing) does not swallow the next one.
 */
export function splitElevatedOutput(stdout: string): Map<string, SmartctlJson> {
  const byDevice = new Map<string, SmartctlJson>()
  for (const part of stdout.split('@@MYRGB_DEVICE ')) {
    const newline = part.indexOf('\n')
    if (newline < 0) continue
    const device = part.slice(0, newline).trim()
    const body = part.slice(newline + 1).trim()
    if (!device || !body) continue
    const json = parseJson(body)
    if (json) byDevice.set(device, json)
  }
  return byDevice
}

/**
 * Read every device with one polkit prompt.
 *
 * `smartctl` takes one disk at a time, so the batch is a small fixed shell
 * loop that receives the devices as arguments - never interpolated into the
 * script.
 */
export async function readSmartctlElevated(devices: string[]): Promise<ElevatedSmartctlRead> {
  if (devices.length === 0) return { byDevice: new Map(), canceled: false }

  const script =
    'for d in "$@"; do printf "\\n@@MYRGB_DEVICE %s\\n" "$d"; smartctl -a -j "$d" 2>/dev/null || true; done'

  try {
    const { stdout } = await run('pkexec', ['sh', '-c', script, 'sh', ...devices], {
      timeout: ELEVATED_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER
    })
    return { byDevice: splitElevatedOutput(stdout), canceled: false }
  } catch (err) {
    const e = err as { stdout?: string; code?: number | string }
    const canceled = e.code === 126 || e.code === 127
    return {
      byDevice: splitElevatedOutput(e.stdout ?? ''),
      canceled,
      error: canceled ? undefined : errorText(err) || 'a leitura com privilégio falhou'
    }
  }
}

function attribute(table: SmartctlAttribute[], id: number): SmartctlAttribute | undefined {
  return table.find((item) => item.id === id)
}

function rawValue(table: SmartctlAttribute[], id: number): number | undefined {
  return countOrUndefined(attribute(table, id)?.raw?.value)
}

function fromAta(metrics: SmartMetrics, json: SmartctlJson): void {
  const table = json.ata_smart_attributes?.table ?? []
  if (table.length === 0) return

  metrics.reallocatedSectors ??= rawValue(table, ATTR_REALLOCATED)
  metrics.pendingSectors ??= rawValue(table, ATTR_PENDING)
  metrics.uncorrectableSectors ??=
    rawValue(table, ATTR_OFFLINE_UNCORRECTABLE) ?? rawValue(table, ATTR_REPORTED_UNCORRECT)
  metrics.powerOnHours ??= rawValue(table, ATTR_POWER_ON_HOURS)
  metrics.powerCycles ??= rawValue(table, ATTR_POWER_CYCLES)
  metrics.temperatureC ??= temperature(rawValue(table, ATTR_TEMPERATURE))

  // Life-left attributes store the remaining life in the normalized value,
  // so the wear is its complement. Only 0..100 is meaningful.
  for (const id of ATTR_LIFE_LEFT) {
    const item = attribute(table, id)
    const normalized = numberOrUndefined(item?.value)
    if (normalized === undefined || normalized > 100) continue
    metrics.wearPercent ??= clampPercent(100 - normalized)
    break
  }

  // `when_failed` is "now" when the attribute is at/below its threshold and
  // "past" when it crossed it at some point. "now" is the serious one.
  let failed: 'now' | 'past' | undefined
  for (const item of table) {
    if (item.when_failed === 'now') {
      failed = 'now'
      break
    }
    if (item.when_failed === 'past') failed = 'past'
  }
  metrics.failedAttribute = failed
}

function fromNvme(metrics: SmartMetrics, json: SmartctlJson): void {
  const log = json.nvme_smart_health_information_log
  if (!log) return

  metrics.temperatureC ??= temperature(numberOrUndefined(log.temperature))
  metrics.powerOnHours ??= countOrUndefined(log.power_on_hours)
  metrics.powerCycles ??= countOrUndefined(log.power_cycles)
  metrics.availableSpare ??= clampPercent(countOrUndefined(log.available_spare))
  metrics.wearPercent ??= clampPercent(countOrUndefined(log.percentage_used))
  metrics.mediaErrors ??= countOrUndefined(log.media_errors)
  metrics.writtenBytes ??= dataUnits(log.data_units_written)
  metrics.readBytes ??= dataUnits(log.data_units_read)

  const critical = countOrUndefined(log.critical_warning)
  if (critical !== undefined && critical > 0) metrics.criticalWarning = critical
}

function collectNotes(json: SmartctlJson, notes: string[]): void {
  for (const message of json.smartctl?.messages ?? []) {
    const text = message.string?.trim()
    if (!text) continue
    const severity = (message.severity ?? '').toLowerCase()
    // Informational messages ("SMART support is: Available") are noise here.
    if (severity !== 'warning' && severity !== 'error' && !/unsupported|not supported/i.test(text)) {
      continue
    }
    if (!notes.includes(text)) notes.push(text)
  }
}

/** Turn one `smartctl -a -j` payload into the metrics the card shows. */
export function parseSmartctl(json: SmartctlJson): ParsedSmartctl {
  const metrics: SmartMetrics = { notes: [] }

  metrics.smartPassed = json.smart_status?.passed
  if (json.smart_status?.passed === true) metrics.smartStatus = 'PASSED'
  else if (json.smart_status?.passed === false) metrics.smartStatus = 'FAILED!'

  metrics.temperatureC ??= temperature(numberOrUndefined(json.temperature?.current))
  metrics.powerOnHours ??= countOrUndefined(json.power_on_time?.hours)
  metrics.powerCycles ??= countOrUndefined(json.power_cycle_count)

  fromAta(metrics, json)
  fromNvme(metrics, json)
  collectNotes(json, metrics.notes)

  return {
    model: json.model_name?.trim() || json.device?.name?.trim() || undefined,
    serial: json.serial_number?.trim() || undefined,
    firmware: json.firmware_version?.trim() || undefined,
    metrics
  }
}
