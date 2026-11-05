/**
 * CPU, memory and clock sensors from `systeminformation`.
 *
 * These work on both platforms without any driver, which is why they are the
 * baseline the page always has: even on Windows without the helper, load,
 * clocks and memory are real. Temperatures and fans come from hwmon on Linux
 * and from the helper on Windows, so they are not here.
 */

import si from 'systeminformation'
import type { SensorReading } from '@shared/features/sensors'

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export async function readSystemSensors(cpuBrand = 'Processador'): Promise<SensorReading[]> {
  const [load, speed, mem] = await Promise.all([
    si.currentLoad().catch(() => null),
    si.cpuCurrentSpeed().catch(() => null),
    si.mem().catch(() => null)
  ])

  const readings: SensorReading[] = []
  const cpuChip = `CPU · ${cpuBrand}`

  if (load) {
    readings.push({
      id: 'cpu:load:total',
      kind: 'load',
      group: 'cpu',
      chip: cpuChip,
      label: 'CPU total',
      value: round1(load.currentLoad),
      unit: '%',
      order: 0
    })

    load.cpus.forEach((core, index) => {
      readings.push({
        id: `cpu:load:${index}`,
        kind: 'load',
        group: 'cpu',
        chip: cpuChip,
        label: `Núcleo ${index + 1}`,
        value: round1(core.load),
        unit: '%',
        order: index + 1
      })
    })
  }

  if (speed) {
    speed.cores.forEach((ghz, index) => {
      readings.push({
        id: `cpu:clock:${index}`,
        kind: 'clock',
        group: 'cpu',
        chip: cpuChip,
        label: `Núcleo ${index + 1}`,
        value: Math.round(ghz * 1000),
        unit: 'MHz',
        order: index + 1
      })
    })
  }

  if (mem) {
    // "Available" is what the kernel thinks a new program can get, so it is
    // the honest denominator - /proc/meminfo already subtracts what is
    // reclaimable from caches.
    const used = mem.total > 0 ? ((mem.total - mem.available) / mem.total) * 100 : 0
    readings.push({
      id: 'mem:used',
      kind: 'memory',
      group: 'ram',
      chip: 'Memória · Sistema',
      label: 'RAM em uso',
      value: round1(used),
      unit: '%',
      order: 0
    })

    if (mem.swaptotal > 0) {
      readings.push({
        id: 'mem:swap',
        kind: 'memory',
        group: 'ram',
        chip: 'Memória · Sistema',
        label: 'Swap em uso',
        value: round1((mem.swapused / mem.swaptotal) * 100),
        unit: '%',
        order: 1
      })
    }
  }

  return readings
}
