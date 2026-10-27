/**
 * Disk health (S.M.A.R.T.).
 *
 * The card mirrors what the Reset Explode shows: one card per physical disk,
 * a verdict with reasons, and only the metrics that were actually read. A
 * field is absent when the drive or the system did not report it - the UI
 * shows "—" instead of zero.
 *
 * The verdict is never "good" on faith. A drive that answers nothing (a
 * pendrive behind an unsupported USB bridge, a disk without permission)
 * comes back as "unknown", never as healthy.
 */

export type DiskVerdict = 'good' | 'warning' | 'critical' | 'unknown'

export interface DiskHealthCard {
  /** `/dev/nvme0` on Linux, `PHYSICALDRIVE0` on Windows. */
  device: string
  /** Model, or "Disco N" when the model is unknown. */
  title: string
  /** Media, bus, size and mount points, ready to show. */
  meta: string
  serial?: string
  firmware?: string
  verdict: DiskVerdict
  /** Why the verdict is what it is, in the order the problems were found. */
  reasons: string[]
  /** Celsius. */
  temperatureC?: number
  /** 0-100; 80+ deserves planning, 95+ is the end of the useful life. */
  wearPercent?: number
  powerOnHours?: number
  powerCycles?: number
  reallocatedSectors?: number
  pendingSectors?: number
  uncorrectableSectors?: number
  /** NVMe media/integrity errors (not sectors). */
  mediaErrors?: number
  /** Uncorrected read/write errors, as counted by the Windows storage API. */
  uncorrectedErrors?: number
  /** "PASSED" / "FAILED!" as reported by the drive itself. */
  smartStatus?: string
  /** NVMe spare capacity, in percent. */
  availableSpare?: number
  /** Bytes written/read, when the drive keeps a counter. */
  writtenBytes?: number
  readBytes?: number
  /** Why a metric is missing, when the drive is the reason. */
  notes: string[]
  /** At least one S.M.A.R.T. metric was read (not just the health flag). */
  dataAvailable: boolean
}

export interface DiskHealthSnapshot {
  /** Epoch milliseconds of the collection. */
  at: number
  /** Where the numbers came from. `none` means only the disk identification. */
  source: 'smartctl' | 'cim' | 'helper' | 'none'
  cards: DiskHealthCard[]
  /** Page-level limitations (smartctl missing, no permission, ...). */
  notes: string[]
  /** smartctl exists, but at least one disk needs elevation to be read. */
  needsElevation: boolean
  /** This snapshot came from the privileged read. */
  elevated: boolean
}
