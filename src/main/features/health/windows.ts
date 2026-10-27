/**
 * Disk health on Windows, through the storage API (CIM).
 *
 * `MSFT_PhysicalDisk` gives the media, the bus and the overall health;
 * `MSFT_StorageReliabilityCounter` gives temperature, wear, hours and error
 * counters. `MSStorageDriver_FailurePredictStatus` is the drive's own "I will
 * fail" flag, matched to the disk through `Win32_DiskDrive`.
 *
 * The same data the Reset Explode reads from WMI, without waiting for the
 * phase 7 helper. The helper can replace this later - the card shape is the
 * same, so the page does not change.
 *
 * Everything is read-only and nothing is written to the disks.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import type { DiskHealthCard } from '@shared/features/health'
import { formatBytes } from '@shared/format'
import { buildVerdict, type DiskMedia } from './verdict'

const run = promisify(execFile)
const TIMEOUT_MS = 25_000
const MAX_BUFFER = 8 * 1024 * 1024

export interface WindowsDiskInfo {
  DeviceId?: string | number
  FriendlyName?: string
  SerialNumber?: string
  MediaType?: number
  BusType?: number
  HealthStatus?: number
  Size?: number | string
}

export interface WindowsCounter {
  DeviceId?: string | number
  Temperature?: number
  TemperatureMax?: number
  Wear?: number
  PowerOnHours?: number | string
  StartStopCycleCount?: number
  ReadErrorsTotal?: number
  ReadErrorsUncorrected?: number
  WriteErrorsTotal?: number
  WriteErrorsUncorrected?: number
}

export interface WindowsPhysical {
  Index?: number
  Model?: string
  SerialNumber?: string
  PNPDeviceID?: string
}

export interface WindowsPredict {
  InstanceName?: string
  PredictFailure?: boolean
}

export interface WindowsRaw {
  disks?: WindowsDiskInfo | WindowsDiskInfo[]
  counters?: WindowsCounter | WindowsCounter[]
  physical?: WindowsPhysical | WindowsPhysical[]
  predict?: WindowsPredict | WindowsPredict[]
}

const MEDIA: Record<number, { label: string; media: DiskMedia }> = {
  3: { label: 'HDD', media: 'hdd' },
  4: { label: 'SSD', media: 'ssd' },
  5: { label: 'SCM', media: 'ssd' }
}

const BUS: Record<number, string> = {
  1: 'SCSI',
  3: 'ATA',
  6: 'iSCSI',
  7: 'USB',
  8: 'RAID',
  10: 'SAS',
  11: 'SATA',
  17: 'NVMe'
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/** A numeric CIM value, ignoring the "not supported" sentinel. */
function counter(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return undefined
  if (parsed < 0 || parsed >= 0xffffffff) return undefined
  return parsed
}

function size(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

function temperature(value: unknown): number | undefined {
  const parsed = counter(value)
  if (parsed === undefined || parsed <= 0 || parsed >= 150) return undefined
  return Math.round(parsed * 10) / 10
}

function wear(value: unknown): number | undefined {
  const parsed = counter(value)
  if (parsed === undefined) return undefined
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function clean(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function idOf(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return clean(value)
}

export interface WindowsHealth {
  cards: DiskHealthCard[]
  notes: string[]
}

/**
 * Build the cards from the CIM payload.
 *
 * Exported because the parser is the part worth testing: the Windows machine
 * that runs the app is not the one that runs CI.
 */
export function parseWindowsHealth(raw: WindowsRaw): WindowsHealth {
  const disks = asArray(raw.disks)
  const counters = asArray(raw.counters)
  const physical = asArray(raw.physical)
  const predict = asArray(raw.predict)
  const notes: string[] = []

  const pnpByIndex = new Map<string, string>()
  for (const item of physical) {
    const index = idOf(item.Index)
    const pnp = clean(item.PNPDeviceID)
    if (index && pnp) pnpByIndex.set(index, pnp)
  }

  let matchedPrediction = false
  let unmatchedPrediction = false

  const cards = disks.map((disk, position): DiskHealthCard => {
    const id = idOf(disk.DeviceId) ?? String(position)
    const counterInfo = counters.find((item) => idOf(item.DeviceId) === id)
    const bus = counter(disk.BusType)
    const mediaInfo = MEDIA[counter(disk.MediaType) ?? -1]
    const media: DiskMedia =
      bus === 7 ? 'usb' : (mediaInfo?.media ?? 'unknown')

    const temp = temperature(counterInfo?.Temperature)
    const diskWear = wear(counterInfo?.Wear)
    const hours = counter(counterInfo?.PowerOnHours)
    const cycles = counter(counterInfo?.StartStopCycleCount)
    const readUncorrected = counter(counterInfo?.ReadErrorsUncorrected)
    const writeUncorrected = counter(counterInfo?.WriteErrorsUncorrected)
    const uncorrected =
      readUncorrected !== undefined || writeUncorrected !== undefined
        ? (readUncorrected ?? 0) + (writeUncorrected ?? 0)
        : undefined

    const healthStatus = counter(disk.HealthStatus)
    const pnp = pnpByIndex.get(id)
    let predictFailure: boolean | undefined
    if (predict.length > 0) {
      const mine = pnp ? predict.filter((item) => item.InstanceName?.startsWith(pnp)) : []
      if (mine.length > 0) {
        predictFailure = mine.some((item) => item.PredictFailure === true)
        matchedPrediction = true
      } else if (predict.some((item) => item.PredictFailure === true)) {
        unmatchedPrediction = true
      }
    }

    // Windows says "Healthy" for practically every USB stick, so on a USB
    // bridge only a real counter (wear, temperature, hours) counts as data.
    const hasCounters =
      temp !== undefined ||
      diskWear !== undefined ||
      hours !== undefined ||
      cycles !== undefined ||
      uncorrected !== undefined ||
      predictFailure !== undefined
    const dataAvailable =
      media === 'usb'
        ? temp !== undefined ||
          diskWear !== undefined ||
          hours !== undefined ||
          predictFailure === true
        : (healthStatus !== undefined && healthStatus !== 5) || hasCounters

    const { verdict, reasons } = buildVerdict({
      media,
      dataAvailable,
      healthStatus: healthStatus === 0 || healthStatus === 1 || healthStatus === 2 ? healthStatus : undefined,
      predictFailure,
      temperatureC: temp,
      wearPercent: diskWear,
      uncorrectedErrors: uncorrected
    })

    const meta = [
      media === 'usb' ? 'USB' : mediaInfo?.label,
      BUS[bus ?? -1],
      formatBytes(size(disk.Size))
    ].filter((part): part is string => Boolean(part))

    return {
      device: `PHYSICALDRIVE${id}`,
      title: clean(disk.FriendlyName) ?? `Disco ${Number(id) + 1}`,
      meta: [...new Set(meta)].join(' · '),
      serial: clean(disk.SerialNumber),
      verdict,
      reasons,
      temperatureC: temp,
      wearPercent: diskWear,
      powerOnHours: hours,
      powerCycles: cycles,
      uncorrectedErrors: uncorrected,
      notes: [],
      dataAvailable
    }
  })

  if (unmatchedPrediction && !matchedPrediction) {
    notes.push(
      'O Windows reporta previsão de falha S.M.A.R.T. em pelo menos um disco, mas não foi ' +
        'possível identificar qual deles.'
    )
  }

  return { cards, notes }
}

const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$storage = 'root/Microsoft/Windows/Storage'",
  '$disks = @(Get-CimInstance -Namespace $storage -ClassName MSFT_PhysicalDisk -ErrorAction Stop | Select-Object DeviceId,FriendlyName,SerialNumber,MediaType,BusType,HealthStatus,Size)',
  '$counters = @(Get-CimInstance -Namespace $storage -ClassName MSFT_StorageReliabilityCounter -ErrorAction SilentlyContinue | Select-Object DeviceId,Temperature,TemperatureMax,Wear,PowerOnHours,StartStopCycleCount,ReadErrorsTotal,ReadErrorsUncorrected,WriteErrorsTotal,WriteErrorsUncorrected)',
  '$physical = @(Get-CimInstance -ClassName Win32_DiskDrive -ErrorAction SilentlyContinue | Select-Object Index,Model,SerialNumber,PNPDeviceID)',
  '$predict = @(Get-CimInstance -Namespace root/wmi -ClassName MSStorageDriver_FailurePredictStatus -ErrorAction SilentlyContinue | Select-Object InstanceName,PredictFailure)',
  '[pscustomobject]@{ disks = $disks; counters = $counters; physical = $physical; predict = $predict } | ConvertTo-Json -Depth 4 -Compress'
].join('\n')

export async function readWindowsHealth(): Promise<WindowsHealth> {
  try {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }
    )
    const raw = JSON.parse(stdout.trim()) as WindowsRaw
    return parseWindowsHealth(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      cards: [],
      notes: [`Não foi possível ler a saúde dos discos pelo Windows: ${message}`]
    }
  }
}
