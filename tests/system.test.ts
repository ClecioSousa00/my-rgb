import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `drives.ts` calls three systeminformation readers. They are mocked here so
 * the test asserts the filtering and the disk matching, not the machine the
 * test happens to run on.
 */
const mocks = vi.hoisted(() => ({
  fsSize: vi.fn(),
  blockDevices: vi.fn(),
  diskLayout: vi.fn()
}))

vi.mock('systeminformation', () => ({ default: mocks }))

import { listDrives } from '@main/features/system/drives'

function volume(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fs: '/dev/sda1',
    type: 'ext4',
    size: 100_000_000_000,
    used: 34_000_000_000,
    available: 66_000_000_000,
    use: 34,
    mount: '/',
    rw: true,
    ...overrides
  }
}

function block(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'sda1',
    type: 'part',
    fs: 'ext4',
    mount: '/',
    label: '',
    model: '',
    serial: '',
    removable: false,
    protocol: '',
    physical: '',
    size: 100_000_000_000,
    ...overrides
  }
}

const SDA_DISK = block({
  name: 'sda',
  type: 'disk',
  mount: '',
  model: 'KBM SSD 256GB',
  protocol: 'sata',
  physical: 'SSD',
  size: 256_000_000_000
})

const SDA_LAYOUT = {
  device: '/dev/sda',
  name: 'KBM SSD 256GB',
  type: 'SSD',
  interfaceType: 'SATA',
  size: 256_000_000_000,
  serialNum: 'SN123'
}

describe('listDrives', () => {
  beforeEach(() => {
    mocks.fsSize.mockReset()
    mocks.blockDevices.mockReset()
    mocks.diskLayout.mockReset()
    mocks.blockDevices.mockResolvedValue([])
    mocks.diskLayout.mockResolvedValue([])
  })

  it('matches a partition to the physical disk behind it', async () => {
    mocks.fsSize.mockResolvedValue([volume()])
    mocks.blockDevices.mockResolvedValue([SDA_DISK, block()])
    mocks.diskLayout.mockResolvedValue([SDA_LAYOUT])

    const [drive] = await listDrives()

    expect(drive.mount).toBe('/')
    expect(drive.kind).toBe('ssd')
    expect(drive.usedPercent).toBe(34)
    expect(drive.physical?.name).toBe('KBM SSD 256GB')
    expect(drive.physical?.interfaceType).toBe('SATA')
  })

  it('drops pseudo filesystems and system mount points', async () => {
    mocks.fsSize.mockResolvedValue([
      volume(),
      volume({ fs: 'efivarfs', type: 'efivarfs', mount: '/sys/firmware/efi/efivars', rw: false }),
      volume({ fs: '/dev/sda2', type: 'vfat', mount: '/boot/efi', size: 1_100_000_000 }),
      volume({ fs: '/dev/sda3', type: 'ext4', mount: '/home', size: 151_000_000_000 }),
      volume({ fs: 'tmpfs', type: 'tmpfs', mount: '/run', size: 8_000_000_000 }),
      volume({ fs: 'cgroup2', type: 'cgroup2', mount: '/sys/fs/cgroup' })
    ])

    const drives = await listDrives()

    expect(drives.map((drive) => drive.mount)).toEqual(['/', '/home'])
  })

  it('marks a removable device as USB and sorts it after fixed disks', async () => {
    mocks.fsSize.mockResolvedValue([
      volume({ fs: '/dev/sdb1', mount: '/media/usb', size: 32_000_000_000 }),
      volume()
    ])
    mocks.blockDevices.mockResolvedValue([
      SDA_DISK,
      block(),
      block({ name: 'sdb', type: 'disk', mount: '', removable: true, physical: 'SSD' }),
      block({ name: 'sdb1', mount: '/media/usb', removable: true })
    ])

    const drives = await listDrives()

    expect(drives.map((drive) => drive.kind)).toEqual(['ssd', 'usb'])
    expect(drives[1].removable).toBe(true)
  })

  it('keeps a network share, ranked last', async () => {
    mocks.fsSize.mockResolvedValue([
      volume({ fs: '//nas/media', type: 'cifs', mount: '/mnt/nas', size: 2_000_000_000_000 }),
      volume()
    ])

    const drives = await listDrives()

    expect(drives.at(-1)?.mount).toBe('/mnt/nas')
    expect(drives.at(-1)?.kind).toBe('network')
  })

  it('leaves the drive type unknown when no block device matches', async () => {
    mocks.fsSize.mockResolvedValue([volume()])

    const [drive] = await listDrives()

    expect(drive.kind).toBe('unknown')
    expect(drive.physical).toBeUndefined()
    expect(drive.usedPercent).toBe(34)
    expect(drive.freeBytes).toBe(66_000_000_000)
  })

  it('clamps a nonsensical usage percentage', async () => {
    mocks.fsSize.mockResolvedValue([volume({ used: 200_000_000_000 })])

    const [drive] = await listDrives()

    expect(drive.usedPercent).toBe(100)
  })
})
