/**
 * Disk health collection.
 *
 * Linux reads S.M.A.R.T. through `smartctl`; Windows reads the storage API
 * (CIM). In both cases the card is assembled here, so the page sees the same
 * shape and the verdict comes from one place (`verdict.ts`).
 *
 * `smartctl` usually needs root. The normal read is tried first, and the page
 * offers a single privileged read (`pkexec`) for the disks that failed with a
 * permission error - never automatically, and never more than once.
 *
 * The result is cached for a minute: `smartctl -a` on a sleeping HDD wakes it
 * up, and the page has an explicit "Atualizar" button for a fresh read.
 */

import si from 'systeminformation'
import type { DiskHealthCard, DiskHealthSnapshot } from '@shared/features/health'
import type { DriveInfo } from '@shared/features/system'
import { formatBytes } from '@shared/format'
import { listDrives } from '../system/drives'
import {
  parseSmartctl,
  pkexecAvailable,
  readSmartctl,
  readSmartctlElevated,
  smartctlAvailable,
  smartctlDevice,
  type ParsedSmartctl
} from './smartctl'
import { buildVerdict, hasSmartMetrics, type DiskMedia } from './verdict'
import { readWindowsHealth } from './windows'

const CACHE_MS = 60_000

type DiskLayout = Awaited<ReturnType<typeof si.diskLayout>>[number]

let cache: { at: number; snapshot: DiskHealthSnapshot } | null = null

export interface DiskHealthOptions {
  /** Skip the cache (the "Atualizar" button). */
  force?: boolean
  /** Read with `pkexec`. */
  elevated?: boolean
}

function mediaOf(layout: DiskLayout): DiskMedia {
  const bus = (layout.interfaceType ?? '').toLowerCase()
  const type = (layout.type ?? '').toLowerCase()
  if (bus.includes('usb')) return 'usb'
  if (type.includes('nvme') || type.includes('ssd')) return 'ssd'
  if (type === 'hd' || type.includes('hdd')) return 'hdd'
  return 'unknown'
}

function mediaLabel(layout: DiskLayout): string | undefined {
  const type = (layout.type ?? '').toLowerCase()
  if (type.includes('nvme')) return 'NVMe'
  if (type.includes('ssd')) return 'SSD'
  if (type === 'hd' || type.includes('hdd')) return 'HDD'
  return layout.type || undefined
}

function mountsByDevice(drives: DriveInfo[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const drive of drives) {
    const device = drive.physical?.device
    if (!device) continue
    const list = map.get(device)
    if (list) list.push(drive.mount)
    else map.set(device, [drive.mount])
  }
  return map
}

interface CardInput {
  layout: DiskLayout
  index: number
  mounts: string[]
  parsed?: ParsedSmartctl
  notes?: string[]
}

function buildCard({ layout, index, mounts, parsed, notes = [] }: CardInput): DiskHealthCard {
  const media = mediaOf(layout)
  const metrics = parsed?.metrics
  const dataAvailable = metrics ? hasSmartMetrics(metrics) : false
  const result = buildVerdict({
    media,
    dataAvailable,
    smartPassed: metrics?.smartPassed,
    criticalWarning: metrics?.criticalWarning,
    failedAttribute: metrics?.failedAttribute,
    temperatureC: metrics?.temperatureC,
    wearPercent: metrics?.wearPercent,
    reallocatedSectors: metrics?.reallocatedSectors,
    pendingSectors: metrics?.pendingSectors,
    uncorrectableSectors: metrics?.uncorrectableSectors,
    mediaErrors: metrics?.mediaErrors
  })

  const meta = [
    mediaLabel(layout),
    layout.interfaceType,
    formatBytes(layout.size),
    mounts.length > 0 ? `Unidades: ${mounts.join(' ')}` : undefined
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')

  return {
    device: layout.device || `Disco ${index + 1}`,
    title: parsed?.model || layout.name || `Disco ${index + 1}`,
    meta,
    serial: parsed?.serial || layout.serialNum || undefined,
    firmware: parsed?.firmware || layout.firmwareRevision || undefined,
    verdict: result.verdict,
    reasons: result.reasons,
    temperatureC: metrics?.temperatureC,
    wearPercent: metrics?.wearPercent,
    powerOnHours: metrics?.powerOnHours,
    powerCycles: metrics?.powerCycles,
    reallocatedSectors: metrics?.reallocatedSectors,
    pendingSectors: metrics?.pendingSectors,
    uncorrectableSectors: metrics?.uncorrectableSectors,
    mediaErrors: metrics?.mediaErrors,
    smartStatus: metrics?.smartStatus,
    availableSpare: metrics?.availableSpare,
    writtenBytes: metrics?.writtenBytes,
    readBytes: metrics?.readBytes,
    notes: [...(metrics?.notes ?? []), ...notes],
    dataAvailable
  }
}

interface LinuxContext {
  layouts: DiskLayout[]
  mounts: Map<string, string[]>
  smartctl: boolean
  pkexec: boolean
}

async function linuxContext(): Promise<LinuxContext> {
  const [layouts, drives, smartctl, pkexec] = await Promise.all([
    si.diskLayout().catch(() => [] as DiskLayout[]),
    listDrives().catch(() => [] as DriveInfo[]),
    smartctlAvailable(),
    pkexecAvailable()
  ])
  return { layouts, mounts: mountsByDevice(drives), smartctl, pkexec }
}

function permissionNotes(context: LinuxContext, affected: number): string[] {
  if (affected === 0) return []
  return context.pkexec
    ? [
        `A leitura de ${affected} ${affected === 1 ? 'disco precisa' : 'discos precisam'} de ` +
          'privilégio. Use "Ler com privilégio" para autorizar uma única vez.'
      ]
    : [
        'A leitura S.M.A.R.T. precisa de privilégio e o pkexec não está disponível. ' +
          'Instale o polkit ou abra o MyRGB como administrador.'
      ]
}

async function readLinuxSnapshot(elevated: boolean): Promise<DiskHealthSnapshot> {
  const context = await linuxContext()

  if (elevated) {
    if (!context.smartctl || !context.pkexec) {
      return readLinuxNormal(context)
    }

    const devices = context.layouts
      .map((layout) => smartctlDevice(layout.device))
      .filter((device): device is string => Boolean(device))
    const read = await readSmartctlElevated(devices)

    if (read.canceled) {
      const normal = await readLinuxNormal(context)
      return {
        ...normal,
        notes: [
          ...normal.notes,
          'A leitura com privilégio foi cancelada; a página segue com o que foi possível ler sem ela.'
        ]
      }
    }

    if (read.error && read.byDevice.size === 0) {
      const normal = await readLinuxNormal(context)
      return {
        ...normal,
        notes: [...normal.notes, `A leitura com privilégio falhou: ${read.error}`]
      }
    }

    const cards = context.layouts.map((layout, index) => {
      const device = smartctlDevice(layout.device)
      const json = read.byDevice.get(device)
      return buildCard({
        layout,
        index,
        mounts: context.mounts.get(layout.device) ?? [],
        parsed: json ? parseSmartctl(json) : undefined,
        notes: json
          ? []
          : ['O smartctl não devolveu dados deste disco nem com privilégio.']
      })
    })

    return {
      at: Date.now(),
      source: 'smartctl',
      cards,
      notes: read.error ? [`A leitura com privilégio falhou em parte: ${read.error}`] : [],
      needsElevation: false,
      elevated: true
    }
  }

  return readLinuxNormal(context)
}

async function readLinuxNormal(context: LinuxContext): Promise<DiskHealthSnapshot> {
  const notes: string[] = []

  if (!context.smartctl) {
    notes.push(
      'O smartmontools não está instalado, então nenhum dado S.M.A.R.T. foi lido. ' +
        'No Ubuntu/Debian: sudo apt install smartmontools.'
    )
  }

  let affected = 0

  const outcomes = await Promise.all(
    context.layouts.map(async (layout, index) => {
      const mounts = context.mounts.get(layout.device) ?? []

      if (!context.smartctl) {
        return {
          card: buildCard({ layout, index, mounts }),
          permission: false,
          error: undefined as string | undefined
        }
      }

      const device = smartctlDevice(layout.device)
      const result = await readSmartctl(device)
      if (result.json) {
        return {
          card: buildCard({
            layout,
            index,
            mounts,
            parsed: parseSmartctl(result.json),
            notes: result.permission
              ? ['A leitura foi parcial: parte dos dados exige privilégio.']
              : []
          }),
          permission: result.permission === true,
          error: undefined
        }
      }

      return {
        card: buildCard({
          layout,
          index,
          mounts,
          notes: [
            result.permission
              ? 'Sem permissão para abrir o dispositivo.'
              : `smartctl: ${result.error ?? 'falha desconhecida'}`
          ]
        }),
        permission: result.permission === true,
        error: result.error
      }
    })
  )

  for (const outcome of outcomes) {
    if (outcome.permission) affected++
  }

  notes.push(...permissionNotes(context, affected))

  return {
    at: Date.now(),
    source: context.smartctl ? 'smartctl' : 'none',
    cards: outcomes.map((outcome) => outcome.card),
    notes,
    needsElevation: context.smartctl && context.pkexec && affected > 0,
    elevated: false
  }
}

async function readWindowsSnapshot(): Promise<DiskHealthSnapshot> {
  const windows = await readWindowsHealth()
  if (windows.cards.length > 0) {
    return {
      at: Date.now(),
      source: 'cim',
      cards: windows.cards,
      notes: windows.notes,
      needsElevation: false,
      elevated: false
    }
  }

  // The CIM query failed (or returned nothing): show the disks without health
  // instead of an empty page.
  const layouts = await si.diskLayout().catch(() => [] as DiskLayout[])
  const cards = layouts.map((layout, index) =>
    buildCard({
      layout,
      index,
      mounts: [],
      notes: ['A API de armazenamento do Windows não devolveu dados deste disco.']
    })
  )

  return {
    at: Date.now(),
    source: 'none',
    cards,
    notes: [
      ...windows.notes,
      ...(cards.length > 0
        ? ['A saúde não pôde ser lida; cada cartão mostra apenas a identificação do disco.']
        : [])
    ],
    needsElevation: false,
    elevated: false
  }
}

/** Read the health of every physical disk. Cached for a minute. */
export async function listDiskHealth(
  options: DiskHealthOptions = {}
): Promise<DiskHealthSnapshot> {
  if (!options.force && !options.elevated && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.snapshot
  }

  const snapshot =
    process.platform === 'win32'
      ? await readWindowsSnapshot()
      : await readLinuxSnapshot(options.elevated === true)

  cache = { at: Date.now(), snapshot }
  return snapshot
}

/** Forget the cached snapshot (used by tests and the privileged read). */
export function clearDiskHealthCache(): void {
  cache = null
}
