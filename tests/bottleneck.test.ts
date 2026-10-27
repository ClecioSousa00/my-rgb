import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SensorReading } from '@shared/features/sensors'
import type { SensorsSnapshot } from '@shared/features/sensors'
import type { SystemSnapshot } from '@shared/features/system'
import type { BottleneckUpdate, LoadSample } from '@shared/features/bottleneck'
import { balance, classify, advice, title } from '@main/features/bottleneck/classify'
import { sampleFromReadings } from '@main/features/bottleneck/sample'
import { buildReport } from '@main/features/bottleneck/session'
import { BottleneckService } from '@main/features/bottleneck'

/**
 * The bottleneck is the one part that has to be identical to the Windows app,
 * so the fixtures pin the order of the rules at every boundary. The service
 * tests use an injected clock and a stub sensor source: no hardware, no timer
 * left behind.
 */

function reading(
  id: string,
  group: SensorReading['group'],
  kind: SensorReading['kind'],
  label: string,
  value: number
): SensorReading {
  return {
    id,
    group,
    kind,
    chip: `${group} · teste`,
    label,
    value,
    unit: kind === 'temperature' ? '°C' : '%',
    order: 0
  }
}

function batch(readings: SensorReading[], at = 1_000_000): SensorsSnapshot {
  return { at, readings, notes: [] }
}

function gpu(id: string, kind: SensorReading['kind'], label: string, value: number): SensorReading {
  return reading(id, 'gpu', kind, label, value)
}

function cpu(id: string, kind: SensorReading['kind'], label: string, value: number): SensorReading {
  return reading(id, 'cpu', kind, label, value)
}

describe('classify', () => {
  const allQuiet: LoadSample = {
    gpuLoad: 40,
    cpuTotal: 30,
    cpuMaxCore: 50,
    vramPct: 30,
    ramPct: 40,
    gpuTemp: 60,
    cpuTemp: 55,
    gpuThermalCap: false
  }

  it('returns "capped" when nothing is near a limit', () => {
    expect(classify(allQuiet)).toBe('capped')
    expect(classify({})).toBe('capped')
  })

  it('puts VRAM first: 97 % wins even with the GPU at 99 %', () => {
    expect(classify({ ...allQuiet, vramPct: 96.9, gpuLoad: 99 })).toBe('gpu')
    expect(classify({ ...allQuiet, vramPct: 97, gpuLoad: 99 })).toBe('vram')
  })

  it('puts the thermal flag before the GPU load', () => {
    expect(classify({ ...allQuiet, gpuThermalCap: true, gpuLoad: 99 })).toBe('thermal')
    // The CPU threshold is 95 °C, not 90.
    expect(classify({ ...allQuiet, cpuTemp: 94.9, gpuLoad: 20 })).toBe('capped')
    expect(classify({ ...allQuiet, cpuTemp: 95, gpuLoad: 20 })).toBe('thermal')
  })

  it('classifies the GPU at exactly 90 %', () => {
    expect(classify({ ...allQuiet, gpuLoad: 89.9, cpuMaxCore: 84 })).toBe('capped')
    expect(classify({ ...allQuiet, gpuLoad: 90 })).toBe('gpu')
  })

  it('classifies the CPU from the total or the busiest core, at 85 %', () => {
    expect(classify({ ...allQuiet, cpuTotal: 85 })).toBe('cpu')
    expect(classify({ ...allQuiet, cpuMaxCore: 85 })).toBe('cpu')
    expect(classify({ ...allQuiet, cpuTotal: 84.9, cpuMaxCore: 84.9, ramPct: 91.9 })).toBe(
      'capped'
    )
  })

  it('classifies RAM at exactly 92 %, after the CPU', () => {
    expect(classify({ ...allQuiet, ramPct: 92 })).toBe('ram')
    expect(classify({ ...allQuiet, ramPct: 99, cpuTotal: 85 })).toBe('cpu')
  })

  it('ignores a missing reading instead of treating it as zero', () => {
    // Only the RAM was read, and it is high: the verdict must be RAM, not GPU.
    expect(classify({ ramPct: 95 })).toBe('ram')
    expect(classify({ gpuTemp: 99 })).toBe('capped')
  })
})

describe('titles and advice', () => {
  it('uses the original titles', () => {
    expect(title('gpu')).toBe('GPU no limite')
    expect(title('cpu')).toBe('Gargalo de CPU')
    expect(title('vram')).toBe('Memória de vídeo cheia')
    expect(title('ram')).toBe('Memória RAM cheia')
    expect(title('thermal')).toBe('Limitado por temperatura')
    expect(title('capped')).toBe('Nada no limite')
  })

  it('explains what to do in each case', () => {
    expect(advice('gpu')).toMatch(/DLSS\/FSR/)
    expect(advice('cpu')).toMatch(/XMP\/EXPO/)
    expect(advice('vram')).toMatch(/texturas/)
    expect(advice('ram')).toMatch(/navegadores/)
    expect(advice('thermal')).toMatch(/pasta térmica/)
    expect(advice('capped')).toMatch(/V-Sync/)

    const texts = new Set(
      (['gpu', 'cpu', 'vram', 'ram', 'thermal', 'capped'] as const).map((limiter) =>
        advice(limiter)
      )
    )
    expect(texts.size).toBe(6)
  })
})

describe('theoretical balance', () => {
  it('uses the five original bands, boundaries included', () => {
    expect(balance(181, 100)).toMatchObject({ ratio: 1.81 })
    expect(balance(181, 100).text).toMatch(/GPU muito mais forte/)

    // Exactly 1.8 belongs to the second band (the original uses "> 1.8").
    expect(balance(180, 100).text).toMatch(/GPU um pouco à frente/)
    expect(balance(150, 100).text).toMatch(/GPU um pouco à frente/)

    // Exactly 1.3 belongs to the balanced band.
    expect(balance(130, 100).text).toMatch(/Hardware equilibrado/)
    expect(balance(100, 100).text).toMatch(/Hardware equilibrado/)
    expect(balance(70, 100).text).toMatch(/Hardware equilibrado/)

    expect(balance(50, 100).text).toMatch(/CPU mais forte que a GPU/)
    // Exactly 0.4 belongs to the last band ("> 0.4" in the original).
    expect(balance(40, 100).text).toMatch(/GPU muito fraca/)
    expect(balance(20, 100).text).toMatch(/GPU muito fraca/)
  })

  it('reports the raw ratio for the marker', () => {
    expect(balance(118, 96).ratio).toBeCloseTo(1.229, 3)
  })
})

describe('sampleFromReadings', () => {
  it('picks the right reading of each kind', () => {
    const { sample } = sampleFromReadings([
      gpu('nvidia:0:load', 'load', 'Uso da GPU', 77),
      gpu('nvidia:0:vram', 'memory', 'VRAM em uso', 61.5),
      gpu('nvidia:0:hotspot', 'temperature', 'Temperatura (hotspot)', 84),
      gpu('nvidia:0:temp', 'temperature', 'Temperatura', 71),
      cpu('cpu:load:total', 'load', 'CPU total', 48),
      cpu('cpu:load:1', 'load', 'Núcleo 1', 22),
      cpu('cpu:load:2', 'load', 'Núcleo 2', 96),
      cpu('cpu:load:3', 'load', 'Núcleo 3', 41),
      cpu('cpu:temp:0', 'temperature', 'Tctl', 63),
      cpu('cpu:temp:1', 'temperature', 'Tdie', 66),
      reading('mem:used', 'ram', 'memory', 'RAM em uso', 58.5)
    ])

    expect(sample).toMatchObject({
      gpuLoad: 77,
      vramPct: 61.5,
      cpuTotal: 48,
      cpuMaxCore: 96,
      busiestCore: 'Núcleo 2',
      ramPct: 58.5,
      gpuTemp: 71,
      cpuTemp: 66,
      // 71 °C is below the thermal cap.
      gpuThermalCap: false
    })
  })

  it('marks the thermal cap at 90 °C, the approximation of the NVML bit', () => {
    expect(
      sampleFromReadings([gpu('nvidia:0:temp', 'temperature', 'Temperatura', 89.9)]).sample
        .gpuThermalCap
    ).toBe(false)
    expect(
      sampleFromReadings([gpu('nvidia:0:temp', 'temperature', 'Temperatura', 90)]).sample
        .gpuThermalCap
    ).toBe(true)
  })

  it('leaves missing readings absent and says what that costs', () => {
    const { sample, notes } = sampleFromReadings([
      cpu('cpu:load:total', 'load', 'CPU total', 30)
    ])

    expect(sample.gpuLoad).toBeUndefined()
    expect(sample.vramPct).toBeUndefined()
    expect(sample.gpuTemp).toBeUndefined()
    expect(sample.cpuTemp).toBeUndefined()
    expect(notes.join(' ')).toMatch(/carga da GPU/)
    expect(notes.join(' ')).toMatch(/temperatura/i)
    expect(notes.join(' ')).toMatch(/RAM/)
  })
})

describe('buildReport', () => {
  it('summarises the distribution, averages and peaks', () => {
    const samples = [
      { sample: { gpuLoad: 95, cpuTotal: 30, cpuMaxCore: 50, vramPct: 40, ramPct: 50, gpuTemp: 70 }, limiter: 'gpu' as const },
      { sample: { gpuLoad: 60, cpuTotal: 40, cpuMaxCore: 90, vramPct: 45, ramPct: 52, gpuTemp: 72 }, limiter: 'cpu' as const },
      { sample: { gpuLoad: 60, cpuTotal: 40, cpuMaxCore: 40, vramPct: 98, ramPct: 54, gpuTemp: 74 }, limiter: 'vram' as const }
    ]

    const report = buildReport({
      minutes: 1,
      startedAt: 1_000,
      finishedAt: 61_000,
      samples
    })

    expect(report.samples).toBe(3)
    expect(report.main).toBe('gpu')
    expect(report.title).toBe('GPU no limite')
    expect(report.distribution.map((entry) => entry.limiter)).toEqual(['gpu', 'cpu', 'vram'])
    expect(report.distribution.map((entry) => entry.percent)).toEqual([100 / 3, 100 / 3, 100 / 3])
    expect(report.avgGpuLoad).toBeCloseTo((95 + 60 + 60) / 3, 5)
    expect(report.avgCpuLoad).toBeCloseTo(110 / 3, 5)
    expect(report.avgCpuMaxCore).toBeCloseTo(180 / 3, 5)
    expect(report.maxVramPct).toBe(98)
    expect(report.maxRamPct).toBe(54)
    expect(report.maxGpuTemp).toBe(74)
    expect(report.avgFps).toBeUndefined()
  })

  it('keeps the first appearance order for tied limiters', () => {
    const report = buildReport({
      minutes: 1,
      startedAt: 0,
      finishedAt: 1,
      samples: [
        { sample: {}, limiter: 'capped' },
        { sample: {}, limiter: 'cpu' }
      ]
    })

    expect(report.distribution.map((entry) => entry.limiter)).toEqual(['capped', 'cpu'])
  })

  it('averages only measured FPS, never the zero placeholder', () => {
    const report = buildReport({
      minutes: 1,
      startedAt: 0,
      finishedAt: 1,
      samples: [
        { sample: { fps: 60 }, limiter: 'gpu' },
        { sample: { fps: 0 }, limiter: 'gpu' }
      ]
    })

    expect(report.avgFps).toBe(60)
  })

  it('is honest about a session without samples', () => {
    const report = buildReport({ minutes: 1, startedAt: 0, finishedAt: 1, samples: [] })

    expect(report.main).toBeUndefined()
    expect(report.title).toBe('Sem amostras')
    expect(report.advice).toMatch(/Nenhuma amostra/)
    expect(report.distribution).toEqual([])
  })
})

function fakeSensors(): { start: () => void; stop: () => void; starts: number; stops: number } {
  return {
    starts: 0,
    stops: 0,
    start() {
      this.starts++
    },
    stop() {
      this.stops++
    }
  }
}

const system = {
  cpu: { brand: 'AMD Ryzen 7 7700X 8-Core Processor' },
  gpus: [{ name: 'NVIDIA GeForce RTX 4070' }]
} as unknown as SystemSnapshot

function setup(options: { now?: () => number } = {}): {
  service: BottleneckService
  sensors: ReturnType<typeof fakeSensors>
  updates: BottleneckUpdate[]
} {
  const sensors = fakeSensors()
  const updates: BottleneckUpdate[] = []
  const service = new BottleneckService({
    sensors,
    onUpdate: (update) => updates.push(update),
    now: options.now,
    loadSystem: async () => system
  })
  return { service, sensors, updates }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('BottleneckService', () => {
  it('subscribes once for two starts (StrictMode) and stops on the last leave', async () => {
    const { service, sensors } = setup()

    const snapshot = await service.start()
    await service.start()
    expect(sensors.starts).toBe(1)
    expect(snapshot.balance.ratio).toBe(1)
    expect(snapshot.balance.text).toMatch(/Hardware equilibrado/)

    service.stop()
    expect(sensors.stops).toBe(0)
    service.stop()
    expect(sensors.stops).toBe(1)
  })

  it('keeps the poll alive while a session runs, even if the page leaves', async () => {
    const { service, sensors } = setup()
    await service.start()

    const progress = service.startSession(1)
    expect(progress).toMatchObject({ durationMinutes: 1, samples: 0 })
    expect(progress.endsAt - progress.startedAt).toBe(60_000)
    expect(sensors.starts).toBe(2)

    service.stop() // page unmounted
    expect(sensors.stops).toBe(0) // the session still holds the poll

    service.stopSession()
    expect(sensors.stops).toBe(1)
  })

  it('classifies every batch and pushes it to the page', async () => {
    const { service, updates } = setup()
    await service.start()

    service.ingest(
      batch([
        gpu('nvidia:0:load', 'load', 'Uso da GPU', 95),
        cpu('cpu:load:total', 'load', 'CPU total', 40),
        reading('mem:used', 'ram', 'memory', 'RAM em uso', 50)
      ])
    )

    expect(updates).toHaveLength(1)
    expect(updates[0].live?.limiter).toBe('gpu')
    expect(updates[0].live?.title).toBe('GPU no limite')
    expect(updates[0].session).toBeNull()
  })

  it('finishes a session when the clock passes the end, with a report', async () => {
    let now = 1_000_000
    const { service, sensors, updates } = setup({ now: () => now })
    await service.start()
    service.startSession(1)

    service.ingest(
      batch([
        gpu('nvidia:0:load', 'load', 'Uso da GPU', 95),
        cpu('cpu:load:total', 'load', 'CPU total', 30),
        reading('mem:used', 'ram', 'memory', 'RAM em uso', 50)
      ])
    )
    now += 30_000
    service.ingest(
      batch([
        gpu('nvidia:0:load', 'load', 'Uso da GPU', 60),
        cpu('cpu:load:2', 'load', 'Núcleo 2', 90),
        reading('mem:used', 'ram', 'memory', 'RAM em uso', 51)
      ])
    )
    now += 30_000
    service.ingest(
      batch([
        gpu('nvidia:0:load', 'load', 'Uso da GPU', 60),
        gpu('nvidia:0:vram', 'memory', 'VRAM em uso', 98),
        cpu('cpu:load:total', 'load', 'CPU total', 40),
        reading('mem:used', 'ram', 'memory', 'RAM em uso', 52)
      ])
    )

    const report = service.report()
    expect(report).not.toBeNull()
    expect(report?.samples).toBe(3)
    expect(report?.distribution.map((entry) => entry.limiter)).toEqual(['gpu', 'cpu', 'vram'])
    expect(report?.main).toBe('gpu')

    // The finishing push carries the report once, and the session is gone.
    const last = updates.at(-1)
    expect(last?.session).toBeNull()
    expect(last?.report?.samples).toBe(3)

    // The session released its hold; the page still holds one.
    expect(sensors.stops).toBe(1)
    service.stop()
    expect(sensors.stops).toBe(2)
  })

  it('ends a hidden session through the safety timer', async () => {
    vi.useFakeTimers()
    let now = 5_000
    const { service, updates } = setup({ now: () => now })
    await service.start()
    service.startSession(1)
    expect(vi.getTimerCount()).toBe(1)

    // No batch arrives: the window is hidden and the poll is gated.
    now += 61_200
    vi.advanceTimersByTime(61_200)

    expect(service.report()).not.toBeNull()
    expect(service.report()?.samples).toBe(0)
    expect(service.report()?.title).toBe('Sem amostras')
    expect(service.snapshot().session).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(updates.at(-1)?.report?.samples).toBe(0)
  })

  it('cancels without leaving a timer behind', async () => {
    vi.useFakeTimers()
    const { service, sensors } = setup()
    await service.start()
    service.startSession(3)
    expect(vi.getTimerCount()).toBe(1)

    service.stopSession()

    expect(vi.getTimerCount()).toBe(0)
    expect(service.snapshot().session).toBeNull()
    expect(service.report()).toBeNull()
    expect(sensors.stops).toBe(1) // the page still holds the poll
  })

  it('dispose clears the session timer', async () => {
    vi.useFakeTimers()
    const { service, sensors } = setup()
    service.startSession(5)
    expect(vi.getTimerCount()).toBe(1)

    service.dispose()

    expect(vi.getTimerCount()).toBe(0)
    expect(service.snapshot().session).toBeNull()
    expect(sensors.stops).toBe(1)
  })

  it('falls back to the Reset indices for hardware outside the tables', async () => {
    const sensors = fakeSensors()
    const service = new BottleneckService({
      sensors,
      onUpdate: () => undefined,
      loadSystem: async () =>
        ({
          cpu: { brand: 'Processador Desconhecido' },
          gpus: [{ name: 'Placa Misteriosa 9000' }]
        }) as unknown as SystemSnapshot
    })

    const snapshot = await service.start()

    expect(snapshot.balance.gpu).toMatchObject({ index: 50, fallback: true })
    expect(snapshot.balance.cpu).toMatchObject({ index: 80, fallback: true })
    expect(snapshot.balance.notes).toHaveLength(2)
    expect(snapshot.balance.notes.join(' ')).toMatch(/índice padrão 50/)
  })
})
