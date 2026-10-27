/**
 * Turns a sensor batch into one `LoadSample`.
 *
 * The readings already carry their group and kind, so the selection is by what
 * the number means, not by the collector that produced it: the first GPU load,
 * the new "VRAM em uso", the CPU total, the busiest core, the RAM usage and
 * the temperatures.
 *
 * A temperature can appear under many names (Tctl, Tdie, edge, hotspot). For
 * the CPU the hottest one is used - the thermal rule is about the sensor that
 * is closest to the limit. For the GPU the plain "Temperatura" is preferred,
 * because the hotspot runs hotter and would trigger the rule early.
 */

import type { SensorReading } from '@shared/features/sensors'
import type { LoadSample } from '@shared/features/bottleneck'

export interface SampledBatch {
  sample: LoadSample
  /** What could not be read, in the page's words. */
  notes: string[]
}

function find(
  readings: SensorReading[],
  predicate: (reading: SensorReading) => boolean
): SensorReading | undefined {
  return readings.find(predicate)
}

function maxOf(readings: SensorReading[]): number | undefined {
  if (readings.length === 0) return undefined
  return Math.max(...readings.map((reading) => reading.value))
}

export function sampleFromReadings(readings: SensorReading[]): SampledBatch {
  const gpuLoad = find(
    readings,
    (reading) => reading.group === 'gpu' && reading.kind === 'load'
  )?.value

  const vramPct = find(
    readings,
    (reading) => reading.group === 'gpu' && reading.kind === 'memory' && /vram/i.test(reading.label)
  )?.value

  const cpuTotal = find(readings, (reading) => reading.id === 'cpu:load:total')?.value

  const cores = readings.filter(
    (reading) =>
      reading.group === 'cpu' &&
      reading.kind === 'load' &&
      reading.id.startsWith('cpu:load:') &&
      reading.id !== 'cpu:load:total'
  )
  const busiest = cores.reduce<SensorReading | undefined>(
    (best, reading) => (best === undefined || reading.value > best.value ? reading : best),
    undefined
  )

  const ramPct = find(
    readings,
    (reading) => reading.id === 'mem:used' || (reading.group === 'ram' && reading.label === 'RAM em uso')
  )?.value

  const gpuTemps = readings.filter(
    (reading) => reading.group === 'gpu' && reading.kind === 'temperature'
  )
  const gpuTemp =
    (gpuTemps.find((reading) => reading.label === 'Temperatura') ?? gpuTemps[0])?.value

  // The hottest CPU sensor is the one that can throttle, so it is the honest
  // input for the rule (k10temp exposes Tctl and Tdie; Intel exposes package
  // and cores).
  const cpuTemp = maxOf(
    readings.filter((reading) => reading.group === 'cpu' && reading.kind === 'temperature')
  )

  const sample: LoadSample = {
    gpuLoad,
    cpuTotal,
    cpuMaxCore: busiest?.value,
    busiestCore: busiest?.label,
    vramPct,
    ramPct,
    gpuTemp,
    cpuTemp,
    // Approximation of the NVML thermal slowdown bit, documented in the page.
    gpuThermalCap: gpuTemp !== undefined && gpuTemp >= 90
  }

  const notes: string[] = []
  if (gpuLoad === undefined) {
    notes.push(
      'A carga da GPU não foi lida (sem nvidia-smi ou sem placa NVIDIA): as regras de GPU e ' +
        'VRAM ficam de fora do veredito.'
    )
  } else if (vramPct === undefined) {
    notes.push('A VRAM em uso não foi lida: a regra de memória de vídeo fica de fora do veredito.')
  }
  if (cpuTotal === undefined) notes.push('A carga total da CPU não foi lida.')
  if (cpuTemp === undefined && gpuTemp === undefined) {
    notes.push(
      'Nenhuma temperatura foi lida: a regra térmica fica de fora. No Linux, isso costuma ' +
        'acontecer quando o driver de sensores não está carregado.'
    )
  } else if (cpuTemp === undefined) {
    notes.push('A temperatura da CPU não foi lida: a regra térmica considera só a GPU.')
  } else if (gpuTemp === undefined) {
    notes.push('A temperatura da GPU não foi lida: a regra térmica considera só a CPU.')
  }
  if (ramPct === undefined) notes.push('A RAM em uso não foi lida.')

  return { sample, notes }
}
