/**
 * One sensors collection: CPU/memory (systeminformation), Linux hwmon and
 * NVIDIA (nvidia-smi).
 *
 * Each source is independent and can fail on its own. A failure never removes
 * the other readings - it adds a note explaining what is missing, so the page
 * can show the values it has and say why the rest is not there.
 *
 * Windows has no hwmon. Temperatures, fans and board voltages there come from
 * the helper planned for phase 7; until then the page shows load, clocks,
 * memory and (with an NVIDIA card) the GPU sensors, plus a note.
 */

import type { SensorsSnapshot, SensorReading } from '@shared/features/sensors'
import { getSystem } from '../system/info'
import { readHwmonSensors } from './hwmon'
import { readNvidiaSensors } from './nvidia'
import { readSystemSensors } from './system'

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

  const [base, hwmon, nvidia] = await Promise.all([
    readSystemSensors(cpuBrand).catch((err: unknown) => {
      notes.push(`Não foi possível ler carga, clocks e memória: ${errorMessage(err)}`)
      return [] as SensorReading[]
    }),
    process.platform === 'linux'
      ? readHwmonSensors({ cpuBrand }).catch((err: unknown) => {
          notes.push(`Não foi possível ler /sys/class/hwmon: ${errorMessage(err)}`)
          return [] as SensorReading[]
        })
      : Promise.resolve([] as SensorReading[]),
    readNvidiaSensors().catch((err: unknown) => {
      notes.push(`Não foi possível ler os sensores da NVIDIA: ${errorMessage(err)}`)
      return { readings: [] as SensorReading[], available: false }
    })
  ])

  if (process.platform === 'linux' && hwmon.length === 0) {
    notes.push(
      'Nenhum sensor de temperatura, ventoinha ou tensão apareceu em /sys/class/hwmon. ' +
        'Isso costuma acontecer quando o driver de sensores da placa-mãe não está carregado.'
    )
  }

  if (process.platform === 'win32') {
    const hasNvidia = nvidia.readings.length > 0
    notes.push(
      'Temperaturas do processador, ventoinhas, tensões e consumo da placa-mãe dependem do ' +
        'helper do Windows (Fase 7). Por enquanto só carga, clocks e memória são lidos' +
        (hasNvidia ? ', além dos sensores da GPU NVIDIA.' : '.')
    )
    if (!hasNvidia && system && system.gpus.some((gpu) => /nvidia/i.test(gpu.name))) {
      notes.push(
        'A placa NVIDIA foi identificada, mas o nvidia-smi não está disponível: os sensores ' +
          'da GPU não puderam ser lidos.'
      )
    }
  }

  return {
    at: now,
    readings: sortReadings([...base, ...hwmon, ...nvidia.readings]),
    notes
  }
}
