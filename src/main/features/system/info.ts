/**
 * Static system information.
 *
 * `systeminformation` is the single source for both platforms: on Windows it
 * reads WMI/CIM, on Linux it reads the kernel and DMI. A field is never
 * invented - when a category cannot be read, the snapshot carries a note
 * explaining it and the UI shows what it has.
 *
 * The collection is cached: it is expensive (DMI/SMBIOS queries take a few
 * hundred milliseconds) and nothing in it changes while the app is open.
 * The "Atualizar" button asks for a forced refresh.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import si from 'systeminformation'
import type {
  BoardInfo,
  CpuInfo,
  GpuInfo,
  PhysicalDisk,
  RamInfo,
  RamModule,
  SystemSnapshot
} from '@shared/features/system'

const run = promisify(execFile)

/** Values that OEMs write when the field is effectively empty. */
const JUNK = new Set([
  '',
  '-',
  'n/a',
  'na',
  'none',
  'unknown',
  'oem',
  'not specified',
  'not available',
  'default string',
  'system product name',
  'system version',
  'system manufacturer',
  'to be filled by o.e.m.',
  'chassis manufacture',
  'base board product name'
])

function clean(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return undefined
  return JUNK.has(text.toLowerCase()) ? undefined : text
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function attempt<T>(
  label: string,
  read: () => Promise<T>,
  notes: string[]
): Promise<T | null> {
  try {
    return await read()
  } catch (err) {
    notes.push(`Não foi possível ler ${label}: ${errorMessage(err)}`)
    return null
  }
}

// --- categories ------------------------------------------------------------

type OsData = Awaited<ReturnType<typeof si.osInfo>>

function osName(os: OsData): string {
  if (os.platform === 'win32') {
    // Windows 11 still reports release "10" in many builds; the build number
    // is what really separates 10 from 11.
    const build = Number(os.build)
    const major = Number.isFinite(build) && build >= 22000 ? '11' : '10'
    const edition = os.release.replace(/^10\s*/, '').trim()
    return `Windows ${major}${edition ? ` ${edition}` : ''}`
  }
  if (os.platform === 'darwin') return `macOS ${os.release}`.trim()
  return `${os.distro} ${os.release}`.replace(/\s+/g, ' ').trim()
}

type MemLayout = Awaited<ReturnType<typeof si.memLayout>>
type Graphics = Awaited<ReturnType<typeof si.graphics>>
type DiskLayout = Awaited<ReturnType<typeof si.diskLayout>>

/**
 * Channel count from the slot names: DIMM_A1 + DIMM_B1 are two channels.
 * Only an estimate - the label in the UI says so.
 */
function inferChannels(modules: RamModule[]): number | undefined {
  const slots = modules.map((m) => m.slot).filter((slot): slot is string => Boolean(slot))
  if (slots.length < 2) return undefined
  const letters = new Set(
    slots
      .map((slot) => slot.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase())
      .filter(Boolean)
  )
  if (letters.size >= 2) return letters.size
  return undefined
}

function buildRam(
  mem: Awaited<ReturnType<typeof si.mem>> | null,
  layout: MemLayout | null,
  notes: string[]
): RamInfo {
  const mapped: RamModule[] = (layout ?? [])
    .filter((m) => m.size > 0)
    .map((m) => ({
      slot: clean(m.bank),
      manufacturer: clean(m.manufacturer),
      partNumber: clean(m.partNum),
      serial: clean(m.serialNum),
      sizeBytes: m.size,
      type: clean(m.type),
      formFactor: clean(m.formFactor),
      speedConfiguredMts: m.clockSpeed && m.clockSpeed > 0 ? m.clockSpeed : undefined,
      voltageV:
        m.voltageConfigured && m.voltageConfigured > 0 ? m.voltageConfigured : undefined,
      ecc: m.ecc === true ? true : undefined
    }))

  // A single anonymous entry that matches the total is the aggregate reported
  // by the kernel, not a module. Keeping it would invent a slot that does not
  // exist; a note is more honest.
  const detailed = mapped.filter((m) => m.slot || m.manufacturer || m.partNumber)
  const modules = mapped.length > 1 || detailed.length > 0 ? mapped : []
  if (modules.length === 0) {
    notes.push(
      'Sem detalhes por módulo de RAM: no Linux o dmidecode exige root e no Windows o WMI pode estar bloqueado.'
    )
  }

  const speed = modules
    .map((m) => m.speedConfiguredMts ?? 0)
    .reduce((a, b) => Math.max(a, b), 0)

  return {
    totalBytes: mem?.total ?? modules.reduce((sum, m) => sum + m.sizeBytes, 0),
    availableBytes: mem?.available,
    modules,
    type: modules.find((m) => m.type)?.type,
    speedMts: speed > 0 ? speed : undefined,
    channels: inferChannels(modules),
    ecc: modules.some((m) => m.ecc) || undefined
  }
}

/**
 * NVIDIA cards often show up as "Device 2d05" on Linux, because the PCI id is
 * not in the local database. `nvidia-smi` knows the real name, the VRAM and
 * the driver version, and its PCI bus id matches the one we already have.
 */
async function enrichNvidia(gpus: GpuInfo[]): Promise<void> {
  if (process.platform !== 'linux') return
  if (!gpus.some((g) => /nvidia/i.test(g.vendor ?? '') && /^device\s/i.test(g.name))) return

  try {
    const { stdout } = await run(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,driver_version,pci.bus_id', '--format=csv,noheader,nounits'],
      { timeout: 4000 }
    )
    const rows = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(',').map((part) => part.trim()))

    for (const gpu of gpus) {
      if (!/nvidia/i.test(gpu.vendor ?? '')) continue
      const bus = gpu.busAddress?.toLowerCase()
      const row = (bus ? rows.find((r) => r[3]?.toLowerCase().endsWith(bus)) : undefined) ?? rows[0]
      if (!row) continue
      if (row[0]) gpu.name = row[0]
      const mb = Number(row[1])
      if (Number.isFinite(mb) && mb > 0) gpu.vramBytes = mb * 1024 * 1024
      if (row[2]) gpu.driver = row[2]
    }
  } catch {
    // nvidia-smi not installed: the PCI name stays, which is still useful.
  }
}

function isIntegrated(gpu: GpuInfo): boolean {
  if (/raphael|renoir|cezanne|barcelo|rembrandt|phoenix|radeon graphics|uhd graphics|iris/i.test(gpu.name))
    return true
  return gpu.vramBytes !== undefined && gpu.vramBytes > 0 && gpu.vramBytes < 1024 * 1024 * 1024
}

function buildGpus(graphics: Graphics | null): GpuInfo[] {
  return (graphics?.controllers ?? [])
    .map((c) => ({
      name: clean(c.model) ?? 'Placa de vídeo',
      vendor: clean(c.vendor),
      vramBytes: c.vram && c.vram > 0 ? c.vram * 1024 * 1024 : undefined,
      driver: clean(c.driverVersion),
      bus: clean(c.bus),
      busAddress: clean(c.busAddress)
    }))
    .map((g) => ({ ...g, integrated: isIntegrated(g) }))
    .sort((a, b) => Number(a.integrated) - Number(b.integrated))
}

function buildDisks(layout: DiskLayout | null): PhysicalDisk[] {
  return (layout ?? [])
    .filter((d) => d.size > 0)
    .map((d) => ({
      device: d.device,
      name: clean(d.name) ?? 'Disco',
      type: d.type || 'Desconhecido',
      interfaceType: clean(d.interfaceType),
      sizeBytes: d.size,
      serial: clean(d.serialNum),
      firmware: clean(d.firmwareRevision),
      vendor: clean(d.vendor)
    }))
}

function buildCpu(cpu: Awaited<ReturnType<typeof si.cpu>> | null): CpuInfo {
  if (!cpu) return { brand: 'Processador', physicalCores: 0, threads: 0 }
  return {
    brand: clean(cpu.brand) ?? clean(cpu.manufacturer) ?? 'Processador',
    vendor: clean(cpu.manufacturer),
    physicalCores: cpu.physicalCores,
    threads: cpu.cores,
    speedGhz: cpu.speed > 0 ? cpu.speed : undefined,
    maxGhz: cpu.speedMax > 0 ? cpu.speedMax : undefined,
    cacheL3Mb: cpu.cache?.l3 ? Math.round(cpu.cache.l3 / 1024 / 1024) : undefined,
    socket: clean(cpu.socket),
    virtualization: cpu.virtualization
  }
}

function buildBoard(
  system: Awaited<ReturnType<typeof si.system>> | null,
  baseboard: Awaited<ReturnType<typeof si.baseboard>> | null,
  bios: Awaited<ReturnType<typeof si.bios>> | null
): BoardInfo {
  return {
    vendor: clean(baseboard?.manufacturer) ?? clean(system?.manufacturer),
    model: clean(baseboard?.model) ?? clean(system?.model),
    version: clean(baseboard?.version) ?? clean(system?.version),
    serial: clean(baseboard?.serial) ?? clean(system?.serial),
    biosVendor: clean(bios?.vendor),
    biosVersion: clean(bios?.version),
    biosDate: clean(bios?.releaseDate),
    memSlots: baseboard?.memSlots ?? undefined
  }
}

// --- public API ------------------------------------------------------------

interface Cache {
  at: number
  value: SystemSnapshot
}

let cache: Cache | null = null
const CACHE_MS = 60_000

export async function getSystem(force = false): Promise<SystemSnapshot> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value

  const notes: string[] = []
  const [os, system, baseboard, bios, cpu, mem, layout, graphics, disks] = await Promise.all([
    attempt('as informações do sistema operacional', () => si.osInfo(), notes),
    attempt('a placa-mãe', () => si.system(), notes),
    attempt('a placa-mãe', () => si.baseboard(), notes),
    attempt('a BIOS', () => si.bios(), notes),
    attempt('o processador', () => si.cpu(), notes),
    attempt('a memória', () => si.mem(), notes),
    attempt('os módulos de memória', () => si.memLayout(), notes),
    attempt('a placa de vídeo', () => si.graphics(), notes),
    attempt('os discos', () => si.diskLayout(), notes)
  ])

  const gpus = buildGpus(graphics)
  await enrichNvidia(gpus)
  if (gpus.some((gpu) => /nvidia/i.test(gpu.vendor ?? '') && /^device\s/i.test(gpu.name))) {
    notes.push(
      'A placa NVIDIA aparece como "Device ..." porque o nome comercial e o driver vêm do nvidia-smi, que não está instalado.'
    )
  }

  const snapshot: SystemSnapshot = {
    at: Date.now(),
    source: 'systeminformation',
    os: {
      name: os ? osName(os) : 'Desconhecido',
      version: os
        ? os.platform === 'win32'
          ? `build ${os.build}`
          : `kernel ${os.kernel}`
        : '—',
      arch: os?.arch ?? process.arch,
      hostname: clean(os?.hostname),
      uefi: os?.uefi === true ? true : undefined
    },
    board: buildBoard(system, baseboard, bios),
    cpu: buildCpu(cpu),
    ram: buildRam(mem, layout, notes),
    gpus,
    disks: buildDisks(disks),
    notes
  }

  cache = { at: Date.now(), value: snapshot }
  return snapshot
}
