/**
 * Thermal alert.
 *
 * The feature has three separable parts: the pure decision (which source is
 * hot, with hysteresis), the store batch that carries it, and the engine
 * override that paints every enabled zone. All three are tested here without
 * touching a real sensor: the readings and the settings are fixtures.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { SensorReading, SensorsSnapshot } from '@shared/features/sensors'
import type { Profile, ZoneState } from '@shared/types'
import {
  DEFAULT_THERMAL_ALERT,
  THERMAL_HYSTERESIS_C,
  normalizeThermalAlert,
  type ThermalAlertConfig
} from '@shared/features/thermal'
import {
  COLD_WATCH,
  evaluateThermal,
  hottestTemperature,
  nextWatch
} from '@main/features/sensors/thermal'
import { SensorsStore } from '@main/features/sensors/store'
import { SettingsStore } from '@main/store/settings'
import { EffectEngine } from '@main/engine/engine'
import { BUILTIN_PALETTES } from '@main/engine/palette'
import { defaultParams } from '@main/engine/patterns'
import { reconcileProfile } from '@main/store/profileStore'
import { buildZones } from '@main/zones'

const LAYOUT = { argbChannels: 3, mainboardLeds: 1, rgbHeaders: 2 }

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'myrgb-thermal-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function reading(
  id: string,
  value: number,
  group: SensorReading['group'] = 'cpu',
  kind: SensorReading['kind'] = 'temperature'
): SensorReading {
  return {
    id,
    kind,
    group,
    chip: `${group} · Teste`,
    label: id,
    value,
    unit: kind === 'temperature' ? '°C' : '%',
    order: 0
  }
}

function config(patch: Partial<ThermalAlertConfig> = {}): ThermalAlertConfig {
  return { enabled: true, thresholdC: 85, color: '#ff2d2d', ...patch }
}

function snapshotWith(readings: SensorReading[]): SensorsSnapshot {
  return { at: 0, readings, notes: [] }
}

function buildProfile(): { profile: Profile; zones: ZoneState[] } {
  const zones = buildZones(LAYOUT)
  const profile = reconcileProfile(
    {
      version: 1,
      name: 'test',
      zones: [],
      palettes: BUILTIN_PALETTES.map((p) => ({ ...p, stops: p.stops.map((s) => ({ ...s })) })),
      global: { brightness: 1, speed: 1, fps: 30, outputEnabled: true }
    },
    zones
  )

  for (const zone of zones) {
    const entry = profile.zones.find((z) => z.zoneId === zone.id)!
    entry.enabled = true
    entry.ledCount = zone.kind === 'addressable' ? 72 : zone.maxLedCount
    entry.effect = {
      patternId: 'rainbow',
      paletteId: 'rainbow',
      params: defaultParams('rainbow')
    }
  }
  return { profile, zones }
}

describe('hottestTemperature', () => {
  it('takes the hottest reading and ignores other kinds', () => {
    const readings = [
      reading('cpu-tctl', 60, 'cpu'),
      reading('cpu-core', 72, 'cpu'),
      reading('gpu', 55, 'gpu'),
      // A hot drive is real, but it is not what this alert watches.
      reading('ssd', 90, 'storage'),
      // A load percentage is not a temperature, even in the CPU group.
      reading('cpu-load', 99, 'cpu', 'load')
    ]
    expect(hottestTemperature(readings, 'cpu')).toBe(72)
    expect(hottestTemperature(readings, 'gpu')).toBe(55)
    expect(hottestTemperature([reading('ssd', 90, 'storage')], 'cpu')).toBeUndefined()
  })

  it('ignores a non-finite value instead of treating it as zero', () => {
    expect(hottestTemperature([reading('cpu', Number.NaN)], 'cpu')).toBeUndefined()
  })
})

describe('evaluateThermal', () => {
  it('returns undefined when the feature is off', () => {
    expect(evaluateThermal([reading('cpu', 99)], config({ enabled: false }))).toBeUndefined()
  })

  it('does not trigger below the threshold', () => {
    const state = evaluateThermal([reading('cpu', 84.9), reading('gpu', 70, 'gpu')], config())
    expect(state).toMatchObject({
      active: false,
      cpuHot: false,
      gpuHot: false,
      cpuC: 84.9,
      gpuC: 70,
      thresholdC: 85,
      color: '#ff2d2d'
    })
    expect(state?.source).toBeUndefined()
  })

  it('triggers on the CPU at the threshold', () => {
    const state = evaluateThermal([reading('cpu', 85), reading('gpu', 70, 'gpu')], config())
    expect(state).toMatchObject({ active: true, cpuHot: true, gpuHot: false, source: 'cpu' })
  })

  it('triggers on the GPU alone', () => {
    const state = evaluateThermal([reading('cpu', 60), reading('gpu', 92, 'gpu')], config())
    expect(state).toMatchObject({ active: true, cpuHot: false, gpuHot: true, source: 'gpu' })
  })

  it('never triggers on a missing sensor', () => {
    const state = evaluateThermal([reading('gpu', 70, 'gpu')], config())
    expect(state?.cpuC).toBeUndefined()
    expect(state?.active).toBe(false)
  })

  it('keeps the alert on until the source drops by the hysteresis', () => {
    const hot = evaluateThermal([reading('cpu', 90)], config())
    const stillHot = evaluateThermal(
      [reading('cpu', 85 - THERMAL_HYSTERESIS_C + 1)],
      config(),
      nextWatch(hot)
    )
    const cooled = evaluateThermal(
      [reading('cpu', 85 - THERMAL_HYSTERESIS_C - 1)],
      config(),
      nextWatch(stillHot)
    )

    expect(stillHot?.active).toBe(true)
    expect(cooled?.active).toBe(false)
  })

  it('tracks each source separately, so a cooled CPU does not hold the GPU alert', () => {
    const previous = { cpu: true, gpu: false }
    // GPU at 84 is above the release point (82) but below the arming threshold
    // (85); a global hysteresis would keep it active, per-source does not.
    const state = evaluateThermal(
      [reading('cpu', 70), reading('gpu', 84, 'gpu')],
      config(),
      previous
    )
    expect(state).toMatchObject({ cpuHot: false, gpuHot: false, active: false })
  })

  it('starts from a cold watch after being disabled', () => {
    expect(nextWatch(undefined)).toEqual(COLD_WATCH)
    expect(nextWatch(undefined)).not.toBe(COLD_WATCH)
  })
})

describe('normalizeThermalAlert', () => {
  it('uses the defaults when nothing was saved', () => {
    expect(normalizeThermalAlert(undefined)).toEqual(DEFAULT_THERMAL_ALERT)
  })

  it('clamps the threshold and keeps both ends valid', () => {
    expect(normalizeThermalAlert({ thresholdC: 20 }).thresholdC).toBe(50)
    expect(normalizeThermalAlert({ thresholdC: 120 }).thresholdC).toBe(100)
    expect(normalizeThermalAlert({ thresholdC: 84.6 }).thresholdC).toBe(85)
  })

  it('rejects an invalid colour instead of letting the engine paint magenta', () => {
    expect(normalizeThermalAlert({ color: 'vermelho' }).color).toBe(
      DEFAULT_THERMAL_ALERT.color
    )
    expect(normalizeThermalAlert({ color: '#0f0' }).color).toBe('#00ff00')
  })

  it('keeps a partial patch from an older settings file usable', () => {
    expect(normalizeThermalAlert({ enabled: true })).toEqual({
      ...DEFAULT_THERMAL_ALERT,
      enabled: true
    })
  })
})

describe('SettingsStore thermal alert', () => {
  it('saves and reloads a normalized config', () => {
    const dir = tempDir()
    const store = new SettingsStore(dir)
    expect(store.settings.thermal).toEqual(DEFAULT_THERMAL_ALERT)

    store.set({ thermal: { enabled: true, thresholdC: 200, color: '#0f0' } })

    const reloaded = new SettingsStore(dir)
    expect(reloaded.settings.thermal).toEqual({
      enabled: true,
      thresholdC: 100,
      color: '#00ff00'
    })
  })

  it('repairs a hand-edited file on load', () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ thermal: { enabled: true, thresholdC: 10, color: 'nope' } })
    )

    const store = new SettingsStore(dir)
    expect(store.settings.thermal).toEqual({
      enabled: true,
      thresholdC: 50,
      color: DEFAULT_THERMAL_ALERT.color
    })
  })
})

describe('SensorsStore thermal state', () => {
  it('attaches the decision to every batch and applies the hysteresis', async () => {
    const batches: SensorsSnapshot[] = []
    let cpu = 90
    const store = new SensorsStore({
      onBatch: (snapshot) => batches.push(snapshot),
      collect: async () => snapshotWith([reading('cpu', cpu)]),
      thermal: () => config()
    })

    await store.poll()
    expect(batches[0].thermal).toMatchObject({ active: true, source: 'cpu' })

    cpu = 84 // below the threshold, but above the release point
    await store.poll()
    expect(batches[1].thermal?.active).toBe(true)

    cpu = 80
    await store.poll()
    expect(batches[2].thermal?.active).toBe(false)

    store.dispose()
  })

  it('leaves the field absent while the feature is off', async () => {
    const batches: SensorsSnapshot[] = []
    const store = new SensorsStore({
      onBatch: (snapshot) => batches.push(snapshot),
      collect: async () => snapshotWith([reading('cpu', 99)]),
      thermal: () => config({ enabled: false })
    })

    await store.poll()
    expect(batches[0].thermal).toBeUndefined()
    store.dispose()
  })

  it('clears the per-source state after the feature is switched off', async () => {
    let armed = true
    const batches: SensorsSnapshot[] = []
    const store = new SensorsStore({
      onBatch: (snapshot) => batches.push(snapshot),
      collect: async () => snapshotWith([reading('cpu', 90)]),
      thermal: () => config({ enabled: armed })
    })

    await store.poll()
    expect(batches[0].thermal?.active).toBe(true)

    // Off while still hot: next enabled batch must arm again at the threshold,
    // not inherit the previous hysteresis.
    armed = false
    await store.poll()
    expect(batches[1].thermal).toBeUndefined()

    armed = true
    await store.poll()
    expect(batches[2].thermal?.active).toBe(true)
    store.dispose()
  })
})

describe('engine thermal override', () => {
  it('paints every enabled zone in the selected colour', () => {
    const { profile, zones } = buildProfile()
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    engine.setThermalOverride({ r: 255, g: 0, b: 0 })

    const frame = engine.renderFrame(1_700_000_000_000)
    expect([...frame.pixels.slice(0, 3)]).toEqual([255, 0, 0])
    // Every pixel is red, including the last LED of the last header.
    for (let i = 0; i < frame.pixels.length; i += 3) {
      expect([frame.pixels[i], frame.pixels[i + 1], frame.pixels[i + 2]]).toEqual([255, 0, 0])
    }
  })

  it('respects a zone the user turned off', () => {
    const { profile, zones } = buildProfile()
    profile.zones[1].enabled = false
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    engine.setThermalOverride({ r: 0, g: 0, b: 255 })

    const frame = engine.renderFrame(1_700_000_000_000)
    const offset = 1 * 3 // first addressable header, after the onboard LED
    expect([frame.pixels[offset], frame.pixels[offset + 1], frame.pixels[offset + 2]]).toEqual([
      0, 0, 0
    ])
  })

  it('still applies the global brightness', () => {
    const { profile, zones } = buildProfile()
    profile.global.brightness = 0.5
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    engine.setThermalOverride({ r: 200, g: 100, b: 50 })

    const frame = engine.renderFrame(1_700_000_000_000)
    expect([...frame.pixels.slice(0, 3)]).toEqual([100, 50, 25])
  })

  it('returns to the profile effect when cleared', () => {
    const { profile, zones } = buildProfile()
    const engine = new EffectEngine(profile, zones, { onFrame: () => {} })
    const at = 1_700_000_000_000
    const normal = [...engine.renderFrame(at).pixels]

    engine.setThermalOverride({ r: 255, g: 0, b: 0 })
    const alert = [...engine.renderFrame(at).pixels]
    engine.setThermalOverride(null)
    const restored = [...engine.renderFrame(at).pixels]

    expect(alert).not.toEqual(normal)
    expect(restored).toEqual(normal)
  })
})
