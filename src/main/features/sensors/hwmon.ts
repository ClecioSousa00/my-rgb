/**
 * Linux hardware sensors (`/sys/class/hwmon`).
 *
 * The kernel exposes one directory per chip and one file per input. The raw
 * values are integers in the driver's own unit (millidegrees, millivolts,
 * microwatts, hertz), so the scale is applied here and the value is checked
 * for plausibility before it reaches the UI - an NVMe sensor that returns
 * 65 261 850 proves the file can contain garbage.
 *
 * Windows has no hwmon; this module is not called there.
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { SensorGroup, SensorKind, SensorReading } from '@shared/features/sensors'

export interface HwmonContext {
  /** Used to name the CPU chip, so all its sensors form one group. */
  cpuBrand?: string
}

const KIND_OF_INPUT: Record<string, SensorKind> = {
  temp: 'temperature',
  fan: 'fan',
  in: 'voltage',
  power: 'power',
  freq: 'clock'
}

const UNIT_OF_KIND: Record<string, string> = {
  temperature: '°C',
  fan: 'RPM',
  voltage: 'V',
  power: 'W',
  clock: 'MHz'
}

/** Driver units -> display units. */
const SCALE: Record<string, number> = {
  temp: 1 / 1000,
  fan: 1,
  in: 1 / 1000,
  power: 1 / 1_000_000,
  freq: 1 / 1_000_000
}

/** Some labels are firmware shorthand; these read better in Portuguese. */
const FRIENDLY_LABEL: Record<string, string> = {
  composite: 'Temperatura',
  edge: 'Temperatura',
  junction: 'Temperatura (hotspot)',
  'package id 0': 'Temperatura do pacote',
  vddgfx: 'Tensão (vddgfx)',
  vddnb: 'Tensão (vddnb)',
  ppt: 'Consumo (PPT)',
  sclk: 'Clock (sclk)'
}

const INPUT_FILE = /^(temp|fan|in|power|freq)(\d+)_input$/

/** Precision per kind; a fan speed or a clock has no decimals. */
function round(kind: SensorKind, value: number): number {
  const digits = kind === 'temperature' ? 1 : kind === 'voltage' ? 3 : kind === 'power' ? 2 : 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function plausible(kind: SensorKind, value: number): boolean {
  switch (kind) {
    case 'temperature':
      return value > 0 && value < 150
    case 'fan':
      return value >= 0 && value < 20_000
    case 'voltage':
      return value > 0 && value < 25
    case 'power':
      return value > 0 && value < 2_000
    case 'clock':
      return value > 0 && value < 10_000
    default:
      return true
  }
}

function clean(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

/**
 * Friendly name and group for a hwmon driver.
 *
 * Exported because the mapping is the part worth testing: it is what decides
 * whether a temperature shows up under "CPU" or under "Placa-mãe".
 */
export function describeHwmon(
  driver: string,
  model: string | undefined,
  context: HwmonContext
): { group: SensorGroup; chip: string } {
  const name = driver.toLowerCase()

  if (/^(k10temp|zenpower|coretemp|k8temp)$/.test(name)) {
    return { group: 'cpu', chip: `CPU · ${context.cpuBrand ?? 'Processador'}` }
  }
  if (name === 'nvme' || name === 'drivetemp') {
    const kind = name === 'nvme' ? 'SSD' : 'Disco'
    return { group: 'storage', chip: `${kind} · ${model ?? 'NVMe'}` }
  }
  if (/^(spd5118|jc42|ee1004)$/.test(name)) {
    return { group: 'ram', chip: 'Memória · SPD' }
  }
  if (name === 'amdgpu' || name === 'radeon') {
    return { group: 'gpu', chip: 'GPU AMD' }
  }
  if (name === 'nouveau') {
    return { group: 'gpu', chip: 'GPU NVIDIA (nouveau)' }
  }
  if (name === 'asus') {
    return { group: 'board', chip: 'Placa-mãe · ASUS EC' }
  }
  if (/^(nct|it8|f71|w83|smsc|sch)/.test(name)) {
    return { group: 'board', chip: `Placa-mãe · ${name.toUpperCase()}` }
  }
  if (/^(r8169|r8125|r8152|igb|igc|e1000|atlantic)/.test(name)) {
    return { group: 'network', chip: `Rede · ${name}` }
  }
  if (/^(iwlwifi|mt79|rtw|rtl8|ath|brcm)/.test(name)) {
    return { group: 'network', chip: `Wi-Fi · ${name}` }
  }
  if (name === 'acpitz') {
    return { group: 'other', chip: 'ACPI' }
  }
  return { group: 'other', chip: `Sensores · ${driver}` }
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return (await readFile(path, 'utf8')).trim()
  } catch {
    // A sensor file can exist and still fail to read (EIO on an unavailable
    // NVMe input, for instance). That is a missing value, not an error.
    return undefined
  }
}

function labelFor(kind: SensorKind, raw: string | undefined, index: number): string {
  const friendly = raw ? FRIENDLY_LABEL[raw.toLowerCase()] : undefined
  if (friendly) return friendly
  if (raw) return raw

  switch (kind) {
    case 'fan':
      return `Ventoinha ${index}`
    case 'voltage':
      return `Tensão ${index}`
    case 'power':
      return 'Consumo'
    case 'clock':
      return 'Clock'
    default:
      return index > 1 ? `Temperatura ${index}` : 'Temperatura'
  }
}

/** Read every hwmon chip. A chip without readable inputs is skipped. */
export async function readHwmonSensors(
  context: HwmonContext,
  base = '/sys/class/hwmon'
): Promise<SensorReading[]> {
  let entries: string[]
  try {
    entries = await readdir(base)
  } catch {
    return []
  }

  const readings: SensorReading[] = []

  for (const entry of entries.filter((name) => /^hwmon\d+$/.test(name)).sort()) {
    const dir = join(base, entry)
    const driver = clean(await readText(join(dir, 'name')))
    if (!driver) continue
    const model = clean(await readText(join(dir, 'device', 'model')))
    const { group, chip } = describeHwmon(driver, model, context)

    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      continue
    }

    for (const file of files.sort()) {
      const match = file.match(INPUT_FILE)
      if (!match) continue

      const [, prefix, indexText] = match
      const kind = KIND_OF_INPUT[prefix]
      if (!kind) continue

      const raw = await readText(join(dir, file))
      const parsed = Number(raw)
      if (!raw || !Number.isFinite(parsed)) continue

      const value = parsed * SCALE[prefix]
      if (!plausible(kind, value)) continue

      const index = Number(indexText)
      const baseName = file.replace(/_input$/, '')
      const rawLabel = clean(await readText(join(dir, `${baseName}_label`)))
      const rawCrit = await readText(join(dir, `${baseName}_crit`))
      const crit = rawCrit ? Number(rawCrit) / 1000 : Number.NaN

      readings.push({
        id: `hwmon:${entry}:${baseName}`,
        kind,
        group,
        chip,
        label: labelFor(kind, rawLabel, index),
        value: round(kind, value),
        unit: UNIT_OF_KIND[kind] ?? '',
        order: index,
        critical:
          kind === 'temperature' && Number.isFinite(crit) && crit > 20 && crit < 130
            ? Math.round(crit * 10) / 10
            : undefined
      })
    }
  }

  return readings
}
