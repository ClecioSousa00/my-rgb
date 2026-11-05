/**
 * Static system information and drives.
 *
 * Everything here is optional except the sizes: a field is absent when the
 * operating system could not answer, never zero or a fake placeholder. The UI
 * shows "—" for absent fields and explains why when a whole category is
 * unavailable.
 */

export interface OsInfo {
  /** "Ubuntu 24.04.5 LTS", "Windows 11 Pro", "macOS 15.3". */
  name: string
  /** Kernel on Linux, build number on Windows. */
  version: string
  arch: string
  hostname?: string
  installedAt?: number
  uefi?: boolean
}

export interface BoardInfo {
  vendor?: string
  model?: string
  version?: string
  serial?: string
  biosVendor?: string
  biosVersion?: string
  biosDate?: string
  memSlots?: number
}

export interface CpuInfo {
  brand: string
  vendor?: string
  physicalCores: number
  threads: number
  /** Clock read at collection time, not the nominal base clock. */
  speedGhz?: number
  maxGhz?: number
  cacheL3Mb?: number
  socket?: string
  virtualization?: boolean
}

export interface RamModule {
  slot?: string
  manufacturer?: string
  partNumber?: string
  serial?: string
  sizeBytes: number
  type?: string
  formFactor?: string
  speedConfiguredMts?: number
  speedRatedMts?: number
  voltageV?: number
  ecc?: boolean
}

export interface RamInfo {
  totalBytes: number
  availableBytes?: number
  modules: RamModule[]
  /** DDR4/DDR5/LPDDR5, when a module reported it. */
  type?: string
  /** Negotiated speed (the one actually in use). */
  speedMts?: number
  channels?: number
  ecc?: boolean
}

export interface GpuInfo {
  name: string
  vendor?: string
  vramBytes?: number
  driver?: string
  bus?: string
  busAddress?: string
  /** Heuristic: an integrated GPU rather than a discrete card. */
  integrated?: boolean
}

export interface PhysicalDisk {
  device: string
  name: string
  type: string
  interfaceType?: string
  sizeBytes: number
  serial?: string
  firmware?: string
  vendor?: string
}

export interface SystemSnapshot {
  /** Epoch milliseconds of the collection. */
  at: number
  /** Where the data came from. `helper` will be used on Windows later. */
  source: 'systeminformation' | 'helper'
  os: OsInfo
  board: BoardInfo
  cpu: CpuInfo
  ram: RamInfo
  gpus: GpuInfo[]
  disks: PhysicalDisk[]
  /** Limitations worth showing under the affected category. */
  notes: string[]
}

// ---------------------------------------------------------------------------
// Drives (volumes)
// ---------------------------------------------------------------------------

export type DriveKind = 'ssd' | 'hdd' | 'usb' | 'network' | 'optical' | 'unknown'

export interface DrivePhysical {
  device?: string
  name?: string
  /** SSD, HDD, NVMe... as reported. */
  type?: string
  interfaceType?: string
  sizeBytes?: number
  serial?: string
}

export interface DriveInfo {
  /** Stable id for React keys: mount point, or device when there is none. */
  id: string
  /** "C:" on Windows, "/" or "/home" on Linux. */
  mount: string
  label?: string
  kind: DriveKind
  fsType?: string
  totalBytes: number
  usedBytes: number
  freeBytes: number
  /** 0-100, already rounded to one decimal. */
  usedPercent: number
  removable: boolean
  readOnly: boolean
  /** Disk that holds this volume, when it could be matched. */
  physical?: DrivePhysical
}
