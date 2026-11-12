/**
 * One sensors collection: CPU/memory (systeminformation), Linux hwmon,
 * NVIDIA (nvidia-smi) and Windows board sensors (LibreHardwareMonitorLib
 * via the .NET helper).
 *
 * Each source is independent and can fail on its own. A failure never removes
 * the other readings - it adds a note explaining what is missing, so the page
 * can show the values it has and say why the rest is not there.
 *
 * Windows has no hwmon, so board temperatures, fans and voltages come from
 * LibreHardwareMonitorLib through the helper (.NET). The helper is started on
 * demand for FPS; the same process answers `sensors.poll` over the named pipe.
 */

import type { SensorsSnapshot, SensorReading } from '@shared/features/sensors'
import { getSystem } from '../system/info'
import { readHwmonSensors } from './hwmon'
import { readNvidiaSensors } from './nvidia'
import { readSystemSensors } from './system'
import { readWindowsSensors } from './windows'

const GROUP_ORDER: Record<SensorReading['group'], number> = {
  cpu: 0,
  gpu: 1,
  board: 2,
  ram: 3,
  storage: 4,
  network: 5,
  other: 6
}

const KIND_ORDER: Record<SensorReading['kind'], number> = {
  clock: 0,
  temperature: 1,
  load: 2,
  fan: 3,
  power: 4,
  voltage: 5,
  memory: 6
}

/**
 * Stable order: hardware group first, then the kind order used by GPU-Z
 * (clocks and temperatures before loads and fans), then the input index.
 *
 * The UI groups by `chip`; sorting here means every group keeps the same
 * order on every poll instead of following the file listing.
 */
export function sortReadings(readings: SensorReading[]): SensorReading[] {
  return [...readings].sort((a, b) => {
    const group = GROUP_ORDER[a.group] - GROUP_ORDER[b.group]
    if (group !== 0) return group
    if (a.chip !== b.chip) return a.chip.localeCompare(b.chip, 'pt-BR')
    const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    if (kind !== 0) return kind
    if (a.order !== b.order) return a.order - b.order
    return a.label.localeCompare(b.label, 'pt-BR')
  })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function collectSensors(now = Date.now()): Promise<SensorsSnapshot> {
  const notes: string[] = []

  // The CPU name is only used to label the group, so a failure here is not
  // worth a note of its own: getSystem already reports what it could not read.
  const system = await getSystem().catch(() => null)
  const cpuBrand = system?.cpu.brand

  const [base, board, nvidia] = await Promise.all([
    readSystemSensors(cpuBrand).catch((err: unknown) => {
      notes.push(`Não foi possível ler carga, clocks e memória: ${errorMessage(err)}`)
      return [] as SensorReading[]
    }),
    process.platform === 'linux'
      ? readHwmonSensors({ cpuBrand }).catch((err: unknown) => {
          notes.push(`Não foi possível ler /sys/class/hwmon: ${errorMessage(err)}`)
          return [] as SensorReading[]
        })
      : process.platform === 'win32'
        ? readWindowsSensors().then((result) => {
            if (result?.note) notes.push(result.note)
            return result?.readings ?? [] as SensorReading[]
          })
        : Promise.resolve([] as SensorReading[]),
    readNvidiaSensors().catch((err: unknown) => {
      notes.push(`Não foi possível ler os sensores da NVIDIA: ${errorMessage(err)}`)
      return { readings: [] as SensorReading[], available: false }
    })
  ])

  if (process.platform === 'linux' && board.length === 0) {
    notes.push(
      'Nenhum sensor de temperatura, ventoinha ou tensão apareceu em /sys/class/hwmon. ' +
        'Isso costuma acontecer quando o driver de sensores da placa-mãe não está carregado.'
    )
  }

  if (process.platform === 'win32') {
    const hasNvidia = nvidia.readings.length > 0
    if (!hasNvidia && system && system.gpus.some((gpu) => /nvidia/i.test(gpu.name))) {
      notes.push(
        'A placa NVIDIA foi identificada, mas o nvidia-smi não está disponível: os sensores ' +
          'da GPU não puderam ser lidos.'
      )
    }
  }

  return {
    at: now,
    readings: sortReadings([...base, ...board, ...nvidia.readings]),
    notes
  }
}
