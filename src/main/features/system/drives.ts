/**
 * Volumes (the cards on the "Unidades" tab).
 *
 * A volume is what the user sees in the file manager; a physical disk is the
 * hardware behind it. The two lists come from different sources, so the match
 * is done by device name and degrades to "not identified" instead of guessing
 * the wrong disk.
 *
 * On Linux `/` is usually a partition (`sda1`, `nvme0n1p1`), and the model and
 * the SSD/HDD type belong to the parent disk (`sda`, `nvme0n1`) - which is why
 * the parent is resolved before anything is reported.
 */

import si from 'systeminformation'
import type { DriveInfo, DriveKind, DrivePhysical } from '@shared/features/system'

/** Filesystems that are not storage the user can fill. */
const PSEUDO_FS = new Set([
  'efivarfs',
  'tmpfs',
  'devtmpfs',
  'squashfs',
  'overlay',
  'proc',
  'sysfs',
  'cgroup',
  'cgroup2',
  'devpts',
  'ramfs',
  'autofs',
  'debugfs',
  'tracefs',
  'securityfs',
  'pstore',
  'bpf',
  'configfs',
  'fusectl',
  'mqueue',
  'hugetlbfs',
  'nsfs',
  'binfmt_misc',
  'selinuxfs'
])

/** Mount points that are system plumbing, not a drive the user thinks about. */
const SKIP_MOUNT = [
  /^\/boot(\/|$)/,
  /^\/snap(\/|$)/,
  /^\/var\/snap(\/|$)/,
  /^\/var\/lib\/docker(\/|$)/,
  /^\/var\/lib\/snapd(\/|$)/
]

const NETWORK_FS = /^(nfs4?|cifs|smbfs|smb3|davfs|afpfs|9p|fuse\.(sshfs|rclone|smbnetfs|davfs2))$/i
const OPTICAL_FS = /^(iso9660|udf)$/i

type FsSize = Awaited<ReturnType<typeof si.fsSize>>[number]
type BlockDevice = Awaited<ReturnType<typeof si.blockDevices>>[number]
type DiskLayout = Awaited<ReturnType<typeof si.diskLayout>>[number]

function normalizePath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed
}

function isSkipped(volume: FsSize): boolean {
  const type = (volume.type ?? '').toLowerCase()
  if (PSEUDO_FS.has(type)) return true
  if (!volume.size || volume.size <= 0) return true
  const mount = volume.mount ?? ''
  return SKIP_MOUNT.some((pattern) => pattern.test(mount))
}

function findBlock(volume: FsSize, blocks: BlockDevice[]): BlockDevice | undefined {
  const mount = normalizePath(volume.mount ?? '')
  const direct = blocks.find((b) => b.mount && normalizePath(b.mount) === mount)
  if (direct) return direct
  // On some systems the volume is identified by device ("/dev/sda1").
  return blocks.find((b) => b.device && b.device === volume.fs)
}

/**
 * The disk a partition belongs to.
 *
 * `sda1` -> `sda`, `nvme0n1p3` -> `nvme0n1`, `mmcblk0p1` -> `mmcblk0`. The
 * pattern is applied to the whole name, so a disk name comes back unchanged.
 */
function baseName(name: string): string {
  const nvme = name.match(/^(nvme\d+n\d+)(?:p\d+)?$/i)
  if (nvme) return nvme[1]
  const emmc = name.match(/^(mmcblk\d+|md\d+)(?:p\d+)?$/i)
  if (emmc) return emmc[1]
  const classic = name.match(/^([a-z]+)\d+$/i)
  if (classic) return classic[1]
  return name
}

/** The whole disk behind a block device, which may already be the disk. */
function parentBlock(block: BlockDevice | undefined, blocks: BlockDevice[]): BlockDevice | undefined {
  if (!block) return undefined
  const name = block.name ?? ''
  if (!name || block.type === 'disk') return block
  const base = baseName(name)
  if (base === name) return block
  return blocks.find((b) => b.name === base && b.type === 'disk') ?? block
}

function kindOf(volume: FsSize, disk: BlockDevice | undefined): DriveKind {
  const type = volume.type ?? ''
  if (NETWORK_FS.test(type)) return 'network'
  if (OPTICAL_FS.test(type)) return 'optical'

  if (disk) {
    if (disk.removable) return 'usb'
    if (/ssd/i.test(disk.physical ?? '') || /nvme/i.test(disk.protocol ?? '')) return 'ssd'
    if (/hdd|^hd$/i.test(disk.physical ?? '')) return 'hdd'
  }

  return 'unknown'
}

function physicalOf(
  block: BlockDevice | undefined,
  disk: BlockDevice | undefined,
  disks: DiskLayout[]
): DrivePhysical | undefined {
  const names = [block?.name, disk?.name].filter((name): name is string => Boolean(name))
  const layout = disks.find((d) => names.some((name) => d.device === `/dev/${name}`))
  const layoutBySuffix = layout ?? disks.find((d) => names.some((name) => d.device.endsWith(name)))

  if (layoutBySuffix) {
    return {
      device: layoutBySuffix.device,
      name: layoutBySuffix.name || undefined,
      type: layoutBySuffix.type || undefined,
      interfaceType: layoutBySuffix.interfaceType || undefined,
      sizeBytes: layoutBySuffix.size,
      serial: layoutBySuffix.serialNum || undefined
    }
  }

  if (!disk || (!disk.device && !disk.model && !disk.physical)) return undefined
  return {
    device: disk.device || undefined,
    name: disk.model || undefined,
    type: disk.physical || undefined,
    interfaceType: disk.protocol || undefined,
    sizeBytes: disk.size || undefined,
    serial: disk.serial || undefined
  }
}

function buildDrive(
  volume: FsSize,
  blocks: BlockDevice[],
  disks: DiskLayout[]
): DriveInfo {
  const block = findBlock(volume, blocks)
  const disk = parentBlock(block, blocks)

  const total = volume.size ?? 0
  const used = volume.used ?? 0
  const free = volume.available ?? Math.max(0, total - used)
  const percent = total > 0 ? (used / total) * 100 : 0

  return {
    id: volume.mount || volume.fs || String(total),
    mount: volume.mount ?? volume.fs ?? '—',
    label: block?.label?.trim() || disk?.label?.trim() || undefined,
    kind: kindOf(volume, disk),
    fsType: volume.type || undefined,
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    usedPercent: Math.max(0, Math.min(100, Math.round(percent * 10) / 10)),
    removable: disk?.removable ?? false,
    readOnly: volume.rw === false,
    physical: physicalOf(block, disk, disks)
  }
}

/** Order: fixed disks first, then removable, then network. */
function rank(drive: DriveInfo): number {
  if (drive.kind === 'network') return 3
  if (drive.removable || drive.kind === 'usb') return 2
  return 1
}

export async function listDrives(): Promise<DriveInfo[]> {
  const [volumes, blocks, disks] = await Promise.all([
    si.fsSize(),
    si.blockDevices().catch(() => []),
    si.diskLayout().catch(() => [])
  ])

  return volumes
    .filter((volume) => !isSkipped(volume))
    .map((volume) => buildDrive(volume, blocks, disks))
    .sort((a, b) => rank(a) - rank(b) || a.mount.localeCompare(b.mount))
}
