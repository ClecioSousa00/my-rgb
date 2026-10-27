import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SensorReading, SensorsSnapshot } from '@shared/features/sensors'
import { describeHwmon, readHwmonSensors } from '@main/features/sensors/hwmon'
import { buildNvidiaReadings, parseNvidiaSmi } from '@main/features/sensors/nvidia'
import { mergeReadings, SensorsStore, type SensorStats } from '@main/features/sensors/store'

/**
 * The sensors have three parts worth testing without the machine they run on:
 * the hwmon driver mapping, the nvidia-smi parser and the session statistics.
 * The collectors themselves only read files and processes, so the tests feed
 * them fixtures instead.
 */

describe('describeHwmon', () => {
  it('groups the CPU drivers under the CPU chip', () => {
    expect(describeHwmon('k10temp', undefined, { cpuBrand: 'Ryzen 5 7600X' })).toEqual({
      group: 'cpu',
      chip: 'CPU · Ryzen 5 7600X'
    })
    expect(describeHwmon('coretemp', undefined, {}).group).toBe('cpu')
  })

  it('names the disk with the model the kernel reports', () => {
    expect(describeHwmon('nvme', 'KINGSTON SNV3S1000G', {})).toEqual({
      group: 'storage',
      chip: 'SSD · KINGSTON SNV3S1000G'
    })
  })

  it('separates RAM, GPU, board and network sensors', () => {
    expect(describeHwmon('spd5118', undefined, {}).group).toBe('ram')
    expect(describeHwmon('amdgpu', undefined, {}).group).toBe('gpu')
    expect(describeHwmon('asus', undefined, {}).group).toBe('board')
    expect(describeHwmon('r8169_0_800:00', undefined, {}).group).toBe('network')
  })

  it('keeps an unknown driver visible instead of dropping it', () => {
    const result = describeHwmon('acpi_fake', undefined, {})
    expect(result.group).toBe('other')
    expect(result.chip).toContain('acpi_fake')
  })
})

describe('readHwmonSensors', () => {
  let base = ''

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'myrgb-hwmon-'))

    // A CPU chip with a labelled temperature and a critical limit.
    await mkdir(join(base, 'hwmon0'))
    await writeFile(join(base, 'hwmon0', 'name'), 'k10temp\n')
    await writeFile(join(base, 'hwmon0', 'temp1_input'), '57875\n')
    await writeFile(join(base, 'hwmon0', 'temp1_label'), 'Tctl\n')
    await writeFile(join(base, 'hwmon0', 'temp1_crit'), '95000\n')

    // An NVMe chip: one good sensor and one that reads garbage (the file
    // exists but the driver returns a value no thermometer can produce).
    await mkdir(join(base, 'hwmon1'))
    await writeFile(join(base, 'hwmon1', 'name'), 'nvme\n')
    await mkdir(join(base, 'hwmon1', 'device'))
    await writeFile(join(base, 'hwmon1', 'device/model'), 'KINGSTON SNV3S1000G\n')
    await writeFile(join(base, 'hwmon1', 'temp1_input'), '41850\n')
    await writeFile(join(base, 'hwmon1', 'temp1_label'), 'Composite\n')
    await writeFile(join(base, 'hwmon1', 'temp2_input'), '65261850\n')

    // A fan and a voltage, to prove the scale is applied per unit.
    await mkdir(join(base, 'hwmon2'))
    await writeFile(join(base, 'hwmon2', 'name'), 'nct6799\n')
    await writeFile(join(base, 'hwmon2', 'fan1_input'), '1240\n')
    await writeFile(join(base, 'hwmon2', 'in0_input'), '1310\n')
  })

  afterAll(async () => {
    if (base) await rm(base, { recursive: true, force: true })
  })

  it('scales driver units and drops implausible values', async () => {
    const readings = await readHwmonSensors({ cpuBrand: 'Ryzen 5 7600X' }, base)
    const id = (suffix: string): SensorReading | undefined =>
      readings.find((reading) => reading.id === suffix)

    const tctl = id('hwmon:hwmon0:temp1')
    expect(tctl?.value).toBe(57.9)
    expect(tctl?.unit).toBe('°C')
    expect(tctl?.label).toBe('Tctl')
    expect(tctl?.critical).toBe(95)

    const composite = id('hwmon:hwmon1:temp1')
    expect(composite?.chip).toBe('SSD · KINGSTON SNV3S1000G')
    expect(composite?.label).toBe('Temperatura')

    // 65 261 850 °C would be a plausible file only in a broken driver.
    expect(id('hwmon:hwmon1:temp2')).toBeUndefined()

    expect(id('hwmon:hwmon2:fan1')).toMatchObject({ value: 1240, unit: 'RPM', kind: 'fan' })
    expect(id('hwmon:hwmon2:in0')).toMatchObject({ value: 1.31, unit: 'V', kind: 'voltage' })
  })

  it('returns an empty list when the directory does not exist', async () => {
    await expect(readHwmonSensors({}, join(base, 'missing'))).resolves.toEqual([])
  })
})

describe('parseNvidiaSmi', () => {
  it('reads one line per GPU and turns N/A into undefined', () => {
    const stdout = [
      'NVIDIA GeForce RTX 4070, 52, 13, 2100, 78.5, 31, 6144, 12288',
      'NVIDIA GeForce RTX 4070, [N/A], [N/A], 405, [Not Supported], [N/A], [N/A], 12288'
    ].join('\n')

    const [first, second] = parseNvidiaSmi(stdout)
    expect(first).toEqual({
      name: 'NVIDIA GeForce RTX 4070',
      temperature: 52,
      utilization: 13,
      clockMhz: 2100,
      powerW: 78.5,
      fanPct: 31,
      vramPct: 50
    })
    expect(second.temperature).toBeUndefined()
    expect(second.powerW).toBeUndefined()
    expect(second.vramPct).toBeUndefined()
  })

  it('reads the optional memory clock and memory temperature when present', () => {
    const stdout = 'NVIDIA GeForce RTX 4070, 52, 13, 2100, 78.5, 31, 6144, 12288, 10501, 78'

    const [sample] = parseNvidiaSmi(stdout)
    expect(sample.memoryClockMhz).toBe(10501)
    expect(sample.memoryTemperature).toBe(78)
  })

  it('still parses an older driver that does not return the optional columns', () => {
    const [sample] = parseNvidiaSmi('NVIDIA GeForce RTX 4070, 52, 13, 2100, 78.5, 31, 6144, 12288')

    expect(sample.memoryClockMhz).toBeUndefined()
    expect(sample.memoryTemperature).toBeUndefined()
    expect(sample.vramPct).toBe(50)
  })

  it('builds only the readings the card actually reported', () => {
    const readings = buildNvidiaReadings([
      { name: 'RTX 4070', temperature: 52, utilization: 13, clockMhz: 2100, powerW: 78.5 }
    ])

    expect(readings.map((reading) => reading.kind)).toEqual([
      'temperature',
      'load',
      'clock',
      'power'
    ])
    expect(readings.every((reading) => reading.group === 'gpu')).toBe(true)
    expect(readings[0]).toMatchObject({ chip: 'GPU · RTX 4070', unit: '°C', critical: 90 })
  })
})

function reading(id: string, value: number, unit = '°C'): SensorReading {
  return {
    id,
    kind: 'temperature',
    group: 'cpu',
    chip: 'CPU · Teste',
    label: id,
    value,
    unit,
    order: 0
  }
}

describe('mergeReadings', () => {
  it('accumulates the session minimum and maximum', () => {
    const stats = new Map<string, SensorStats>()

    mergeReadings(stats, [reading('cpu', 50)])
    mergeReadings(stats, [reading('cpu', 70)])
    const merged = mergeReadings(stats, [reading('cpu', 40)])

    expect(merged[0].min).toBe(40)
    expect(merged[0].max).toBe(70)
    expect(merged[0].value).toBe(40)
  })

  it('caps the history at the requested size', () => {
    const stats = new Map<string, SensorStats>()

    for (const value of [10, 20, 30, 40, 50]) {
      mergeReadings(stats, [reading('cpu', value)], 3)
    }
    const merged = mergeReadings(stats, [reading('cpu', 60)], 3)

    expect(merged[0].history).toEqual([40, 50, 60])
  })

  it('forgets a reading that disappeared', () => {
    const stats = new Map<string, SensorStats>()
    mergeReadings(stats, [reading('a', 10), reading('b', 20)])
    expect(stats.size).toBe(2)

    mergeReadings(stats, [reading('a', 11)])
    expect([...stats.keys()]).toEqual(['a'])
  })
})

function snapshotWith(readings: SensorReading[]): SensorsSnapshot {
  return { at: 0, readings: readings.map((item) => ({ ...item })), notes: [] }
}

describe('SensorsStore', () => {
  it('does not poll while the window is not visible', async () => {
    const onBatch = vi.fn()
    const collect = vi.fn(async () => snapshotWith([reading('cpu', 50)]))
    const store = new SensorsStore({ onBatch, collect, canPoll: () => false })

    await expect(store.poll()).resolves.toBeNull()
    expect(collect).not.toHaveBeenCalled()
    expect(onBatch).not.toHaveBeenCalled()
    store.dispose()
  })

  it('attaches stats and reports every batch', async () => {
    const batches: SensorsSnapshot[] = []
    const store = new SensorsStore({
      onBatch: (snapshot) => batches.push(snapshot),
      collect: async () => snapshotWith([reading('cpu', batches.length === 0 ? 50 : 60)])
    })

    expect(store.snapshot()).toBeNull()

    await store.poll()
    await store.poll()

    expect(batches).toHaveLength(2)
    expect(batches[1].readings[0]).toMatchObject({ value: 60, min: 50, max: 60 })
    expect(store.snapshot()).toBe(batches[1])
    store.dispose()
  })

  it('is reference counted, so one page leaving does not stop the other', () => {
    const store = new SensorsStore({
      onBatch: () => {},
      collect: async () => snapshotWith([]),
      canPoll: () => false
    })

    store.start()
    store.start()
    expect(store.running).toBe(true)

    store.stop()
    expect(store.running).toBe(true)

    store.stop()
    expect(store.running).toBe(false)
    store.dispose()
  })

  it('keeps the last good batch when the collector throws', async () => {
    const onError = vi.fn()
    let shouldThrow = false
    const store = new SensorsStore({
      onBatch: () => {},
      onError,
      collect: async () => {
        if (shouldThrow) throw new Error('boom')
        return snapshotWith([reading('cpu', 50)])
      }
    })

    await store.poll()
    shouldThrow = true
    const result = await store.poll()

    expect(onError).toHaveBeenCalledWith('boom')
    expect(result?.readings[0].value).toBe(50)
    store.dispose()
  })
})
