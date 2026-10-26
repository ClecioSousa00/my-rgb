/**
 * Formatting helpers for the dashboard.
 *
 * Everything is Brazilian Portuguese, with a comma as the decimal separator
 * and thousands separated only when it helps. Numbers are never padded with
 * fake precision: `formatBytes` drops a trailing ",0" so "500 GB" does not
 * become "500,0 GB".
 *
 * A missing value is always an em dash, never "0" or "N/A" - the UI calls
 * `formatBytes(undefined)` and gets "—", which reads as "unknown" instead of
 * "empty".
 */

const EM_DASH = '—'

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 1514200000 -> "1,5 TB"; 978000000 -> "978 GB". */
export function formatBytes(bytes?: number | null): string {
  if (!isNumber(bytes) || bytes < 0) return EM_DASH

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }

  const digits = unit >= 3 ? 1 : 0
  const text = value.toFixed(digits).replace('.', ',').replace(/,0$/, '')
  return `${text} ${units[unit]}`
}

/** 1712345678 -> "1,7 GB" is handled by formatBytes; this is the rate form. */
export function formatPercent(percent?: number | null, digits = 0): string {
  if (!isNumber(percent)) return EM_DASH
  return `${percent.toFixed(digits).replace('.', ',')}%`
}

/** CPU clocks are reported in GHz by systeminformation. */
export function formatGhz(ghz?: number | null): string {
  if (!isNumber(ghz) || ghz <= 0) return EM_DASH
  return `${ghz.toFixed(2).replace('.', ',')} GHz`
}

/**
 * One live sensor value.
 *
 * The precision follows the unit, not the number: a temperature keeps one
 * decimal, a voltage keeps three (1,31 V reads as 1,31 V, not 1,3 V) and a
 * clock, fan speed or percentage is a whole number.
 */
export function formatSensor(value?: number | null, unit?: string): string {
  if (!isNumber(value)) return EM_DASH
  const digits = !unit ? 1 : unit === 'V' ? 3 : unit === '°C' || unit === 'W' ? 1 : 0
  const text = value.toFixed(digits).replace('.', ',')
  if (!unit) return text
  return unit === '%' ? `${text}%` : `${text} ${unit}`
}

/** Memory speeds are MT/s, not MHz - the label is always explicit. */
export function formatMts(mts?: number | null): string {
  if (!isNumber(mts) || mts <= 0) return EM_DASH
  return `${Math.round(mts)} MT/s`
}

/** "2025-13-11" (AMI's odd order) or "11/13/2025" -> "13/11/2025". */
export function formatBiosDate(raw?: string | null): string {
  if (!raw) return EM_DASH
  const parts = raw.split(/[-/.]/).map((part) => Number(part.trim()))
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return raw.trim()

  let [a, b, c] = parts
  // A four digit first part means the year came first. The month is whichever
  // of the two remaining numbers can be a month; if both can, the order the
  // firmware used (day first on most ASUS boards) is kept as-is.
  if (a > 31) {
    const year = a
    const month = b > 12 ? c : b
    const day = b > 12 ? b : c
    return `${pad(day)}/${pad(month)}/${year}`
  }

  // MM/DD/YYYY is what the DMI table stores, so the second number is the day.
  const month = a
  const day = b
  const year = c < 100 ? 2000 + c : c
  return `${pad(day)}/${pad(month)}/${year}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * "agora", "há 8 s", "há 3 min", "há 2 h".
 *
 * Relative time is what makes a cached snapshot honest: the page says how old
 * the data is instead of implying it is live.
 */
export function formatAgo(epoch: number | null | undefined, now = Date.now()): string {
  if (!isNumber(epoch) || epoch <= 0) return EM_DASH
  const seconds = Math.max(0, Math.round((now - epoch) / 1000))
  if (seconds < 5) return 'agora'
  if (seconds < 60) return `há ${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.round(hours / 24)} d`
}
