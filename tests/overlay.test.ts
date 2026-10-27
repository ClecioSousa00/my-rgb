import { describe, expect, it, vi } from 'vitest'
import type { SensorReading, SensorsSnapshot } from '@shared/features/sensors'
import type { OverlayConfig } from '@shared/features/overlay'
import {
  DEFAULT_OVERLAY_CONFIG,
  OVERLAY_METRICS,
  formatAccelerator,
  normalizeOverlayConfig
} from '@shared/features/overlay'
import { buildOverlayFrame } from '@main/features/overlay/frame'
import { positionOverlay } from '@main/features/overlay/position'
import { FpsService, type FpsBridge } from '@main/features/overlay/fps'
import {
  findHelperPath,
  helperCandidates,
  helperPipePath,
  parseHelperLine
} from '@main/features/overlay/helper'

/**
 * The overlay has four testable halves without a window: the catalogue and its
 * normalisation, the corner math, the formatter that turns readings into text,
 * and the FPS service's refcount/failure handling. The window itself
 * (BrowserWindow, globalShortcut) is covered by the selftest.
 */

const GiB = 1024 ** 3

function reading(
  id: string,
  group: SensorReading['group'],
  kind: SensorReading['kind'],
  label: string,
  value: number,
  unit: string
): SensorReading {
  return { id, group, kind, chip: `${group} · teste`, label, value, unit, order: 0 }
}

function snapshot(readings: SensorReading[]): SensorsSnapshot {
  return { at: 1_000_000, readings, notes: [] }
}

function config(items: string[]): OverlayConfig {
  return normalizeOverlayConfig({ ...DEFAULT_OVERLAY_CONFIG, items: items as never })
}

describe('overlay catalogue', () => {
  it('has the same 26 metrics as the original, without duplicate keys', () => {
    expect(OVERLAY_METRICS).toHaveLength(26)
    expect(new Set(OVERLAY_METRICS.map((metric) => metric.key)).size).toBe(26)
  })

  it('selects the original default preset', () => {
    expect(DEFAULT_OVERLAY_CONFIG.items).toEqual([
      'fps',
      'frametime',
      'low1',
      'graph',
      'gpu_load',
      'gpu_temp',
      'gpu_clock',
      'gpu_power',
      'vram_used',
      'cpu_load',
      'cpu_temp',
      'cpu_clock',
      'cpu_power',
      'ram_used',
      'game'
    ])
    // The graph is a bar, the rest are text; all four FPS metrics are on.
    expect(OVERLAY_METRICS.filter((metric) => metric.group === 'FPS')).toHaveLength(4)
  })
})

describe('normalizeOverlayConfig', () => {
  it('drops unknown and duplicated keys and restores the catalogue order', () => {
    const result = normalizeOverlayConfig({
      items: ['game', 'nope', 'fps', 'fps', 'gpu_temp'] as never
    })
    expect(result.items).toEqual(['fps', 'gpu_temp', 'game'])
  })

  it('keeps a partial patch and falls back for the rest', () => {
    const base = { ...DEFAULT_OVERLAY_CONFIG, opacity: 0.55, displayId: 7 }
    const result = normalizeOverlayConfig({ enabled: true }, base)

    expect(result.enabled).toBe(true)
    expect(result.items).toEqual(base.items)
    expect(result.items).not.toBe(base.items)
    expect(result.opacity).toBe(0.55)
    expect(result.displayId).toBe(7)
  })

  it('clamps the opacity and rounds it to two decimals', () => {
    expect(normalizeOverlayConfig({ opacity: 0.2 }).opacity).toBe(0.4)
    expect(normalizeOverlayConfig({ opacity: 2 }).opacity).toBe(1)
    expect(normalizeOverlayConfig({ opacity: 0.6789 }).opacity).toBe(0.68)
    expect(normalizeOverlayConfig({ opacity: Number.NaN }).opacity).toBe(
      DEFAULT_OVERLAY_CONFIG.opacity
    )
  })

  it('snaps the scale to the three buttons', () => {
    expect(normalizeOverlayConfig({ scale: 0.85 }).scale).toBe(0.85)
    expect(normalizeOverlayConfig({ scale: 1.3 }).scale).toBe(1.3)
    expect(normalizeOverlayConfig({ scale: 1.1 }).scale).toBe(1)
  })

  it('rejects an unknown corner, a bad display and an empty shortcut', () => {
    expect(normalizeOverlayConfig({ corner: 'xx' as never }).corner).toBe('tl')
    expect(normalizeOverlayConfig({ displayId: -1 }).displayId).toBe(0)
    expect(normalizeOverlayConfig({ displayId: 1.5 }).displayId).toBe(0)
    expect(normalizeOverlayConfig({ shortcut: '   ' }).shortcut).toBe(
      DEFAULT_OVERLAY_CONFIG.shortcut
    )
    expect(normalizeOverlayConfig({ shortcut: 'x'.repeat(80) }).shortcut).toBe(
      DEFAULT_OVERLAY_CONFIG.shortcut
    )
  })

  it('trims a shortcut and accepts a partial one', () => {
    expect(normalizeOverlayConfig({ shortcut: ' Alt+F10 ' }).shortcut).toBe('Alt+F10')
    expect(normalizeOverlayConfig(undefined).items).toEqual(DEFAULT_OVERLAY_CONFIG.items)
    expect(normalizeOverlayConfig(null).enabled).toBe(false)
  })
})

describe('formatAccelerator', () => {
  it('writes the shortcut the way the page shows it', () => {
    expect(formatAccelerator('CommandOrControl+Shift+O', 'linux')).toBe('Ctrl + Shift + O')
    expect(formatAccelerator('CommandOrControl+Shift+O', 'darwin')).toBe('Cmd + Shift + O')
    expect(formatAccelerator('Control+Alt+F10', 'win32')).toBe('Ctrl + Alt + F10')
  })
})

describe('positionOverlay', () => {
  const display = { x: 0, y: 0, width: 1920, height: 1080 }
  const size = { width: 320, height: 150 }

  it('keeps a 12 px margin in every corner', () => {
    expect(positionOverlay(display, size, 'tl')).toEqual({ x: 12, y: 12 })
    expect(positionOverlay(display, size, 'tr')).toEqual({ x: 1588, y: 12 })
    expect(positionOverlay(display, size, 'bl')).toEqual({ x: 12, y: 918 })
    expect(positionOverlay(display, size, 'br')).toEqual({ x: 1588, y: 918 })
  })

  it('uses the display coordinates, including a second monitor', () => {
    const second = { x: 1920, y: 0, width: 2560, height: 1440 }
    expect(positionOverlay(second, size, 'tl')).toEqual({ x: 1932, y: 12 })
    expect(positionOverlay(second, size, 'br')).toEqual({ x: 1920 + 2560 - 320 - 12, y: 1440 - 150 - 12 })

    const left = { x: -1920, y: -100, width: 1920, height: 1080 }
    expect(positionOverlay(left, size, 'bl')).toEqual({ x: -1908, y: -100 + 1080 - 150 - 12 })
  })

  it('clamps a card bigger than the screen instead of pushing it off-screen', () => {
    expect(positionOverlay({ x: 0, y: 0, width: 800, height: 600 }, { width: 900, height: 700 }, 'br')).toEqual({
      x: 0,
      y: 0
    })
  })
})

describe('buildOverlayFrame', () => {
  const readings = [
    reading('cpu:load:total', 'cpu', 'load', 'CPU total', 48, '%'),
    reading('cpu:load:0', 'cpu', 'load', 'Núcleo 1', 30, '%'),
    reading('cpu:load:1', 'cpu', 'load', 'Núcleo 2', 80, '%'),
    reading('cpu:temp:0', 'cpu', 'temperature', 'Tctl', 60, '°C'),
    reading('cpu:temp:1', 'cpu', 'temperature', 'Tdie', 72, '°C'),
    reading('cpu:clock:0', 'cpu', 'clock', 'Núcleo 1', 4200, 'MHz'),
    reading('cpu:clock:1', 'cpu', 'clock', 'Núcleo 2', 3900, 'MHz'),
    reading('cpu:clock:2', 'cpu', 'clock', 'Núcleo 3', 4300, 'MHz'),
    reading('cpu:power:0', 'cpu', 'power', 'Package', 88.5, 'W'),
    reading('nvidia:0:load', 'gpu', 'load', 'Uso da GPU', 98, '%'),
    reading('nvidia:0:temp', 'gpu', 'temperature', 'Temperatura', 65, '°C'),
    reading('nvidia:0:temp-mem', 'gpu', 'temperature', 'Temperatura da memória', 78, '°C'),
    reading('nvidia:0:clock', 'gpu', 'clock', 'Clock', 2790, 'MHz'),
    reading('nvidia:0:memclock', 'gpu', 'clock', 'Clock da memória', 10501, 'MHz'),
    reading('nvidia:0:power', 'gpu', 'power', 'Consumo', 220.4, 'W'),
    reading('nvidia:0:fan', 'gpu', 'fan', 'Ventoinha', 31, '%'),
    reading('nvidia:0:vram', 'gpu', 'memory', 'VRAM em uso', 50, '%'),
    reading('mem:used', 'ram', 'memory', 'RAM em uso', 50, '%')
  ]

  const now = new Date(2026, 9, 27, 14, 5)

  it('formats every metric from the same readings the pages use', () => {
    const frame = buildOverlayFrame({
      at: now.getTime(),
      snapshot: snapshot(readings),
      fps: {
        fps: 143.8,
        frameTimeMs: 6.94,
        low1Fps: 121.2,
        game: 'Cyberpunk2077',
        recent: [6.9, 7.1]
      },
      config: config(OVERLAY_METRICS.map((metric) => metric.key)),
      ramTotalBytes: 32 * GiB,
      vramTotalBytes: 12 * GiB,
      now
    })

    const text = new Map(frame.items.map((item) => [item.key, item.text]))
    expect(text.get('fps')).toBe('144')
    expect(text.get('frametime')).toBe('6.9 ms')
    expect(text.get('low1')).toBe('121')
    expect(text.get('gpu_load')).toBe('98 %')
    expect(text.get('gpu_temp')).toBe('65 °C')
    expect(text.get('gpu_hotspot')).toBe('—')
    expect(text.get('gpu_clock')).toBe('2790 MHz')
    expect(text.get('gpu_memclock')).toBe('10501 MHz')
    expect(text.get('gpu_power')).toBe('220 W')
    expect(text.get('gpu_fan')).toBe('31 %')
    expect(text.get('vram_used')).toBe('6.0 GB')
    expect(text.get('vram_pct')).toBe('50 %')
    expect(text.get('vram_temp')).toBe('78 °C')
    expect(text.get('cpu_load')).toBe('48 %')
    expect(text.get('cpu_maxcore')).toBe('80 %')
    expect(text.get('cpu_temp')).toBe('72 °C')
    expect(text.get('cpu_clock')).toBe('4.13 GHz')
    expect(text.get('cpu_clockmax')).toBe('4.30 GHz')
    expect(text.get('cpu_power')).toBe('89 W')
    expect(text.get('ram_used')).toBe('16.0 GB')
    expect(text.get('ram_pct')).toBe('50 %')
    expect(text.get('game')).toBe('Cyberpunk2077')
    expect(text.get('clock')).toBe('14:05')
    expect(frame.clock).toBe('14:05')
  })

  it('draws the items in catalogue order, not in the config order', () => {
    const frame = buildOverlayFrame({
      at: 0,
      snapshot: snapshot(readings),
      fps: null,
      config: config(['ram_pct', 'game', 'gpu_load', 'fps']),
      now
    })

    expect(frame.items.map((item) => item.key)).toEqual(['fps', 'gpu_load', 'ram_pct', 'game'])
    expect(frame.items.map((item) => item.group)).toEqual(['FPS', 'GPU', 'RAM', 'Outros'])
  })

  it('shows "—" for every missing reading instead of zero', () => {
    const frame = buildOverlayFrame({
      at: 0,
      snapshot: null,
      fps: null,
      config: config(['fps', 'frametime', 'low1', 'graph', 'gpu_load', 'cpu_temp', 'vram_used', 'ram_used', 'game', 'clock']),
      now
    })

    const text = new Map(frame.items.map((item) => [item.key, item.text]))
    expect(text.get('fps')).toBe('—')
    expect(text.get('frametime')).toBe('—')
    expect(text.get('low1')).toBe('—')
    expect(text.get('gpu_load')).toBe('—')
    expect(text.get('cpu_temp')).toBe('—')
    expect(text.get('vram_used')).toBe('—')
    expect(text.get('ram_used')).toBe('—')
    expect(text.get('game')).toBe('—')
    expect(text.get('clock')).toBe('14:05')
    expect(frame.fps).toBeNull()
  })

  it('needs the total to convert the percentage into GB', () => {
    const frame = buildOverlayFrame({
      at: 0,
      snapshot: snapshot([reading('mem:used', 'ram', 'memory', 'RAM em uso', 25, '%')]),
      fps: null,
      config: config(['ram_used', 'ram_pct']),
      now
    })

    const text = new Map(frame.items.map((item) => [item.key, item.text]))
    expect(text.get('ram_used')).toBe('—')
    expect(text.get('ram_pct')).toBe('25 %')
  })

  it('does not confuse the memory temperature with the core temperature', () => {
    const frame = buildOverlayFrame({
      at: 0,
      snapshot: snapshot(readings),
      fps: null,
      config: config(['gpu_temp', 'vram_temp', 'gpu_clock', 'gpu_memclock']),
      now
    })

    const text = new Map(frame.items.map((item) => [item.key, item.text]))
    expect(text.get('gpu_temp')).toBe('65 °C')
    expect(text.get('vram_temp')).toBe('78 °C')
    expect(text.get('gpu_clock')).toBe('2790 MHz')
    expect(text.get('gpu_memclock')).toBe('10501 MHz')
  })
})

describe('helper protocol', () => {
  it('reads one JSON object per line and ignores anything else', () => {
    expect(parseHelperLine('{"id":1,"ok":true,"result":{"fps":144}}')).toEqual({
      id: 1,
      ok: true,
      result: { fps: 144 },
      error: undefined
    })
    expect(parseHelperLine('{"id":2,"ok":false,"error":"sem permissão"}')).toMatchObject({
      id: 2,
      ok: false,
      error: 'sem permissão'
    })

    expect(parseHelperLine('')).toBeNull()
    expect(parseHelperLine('driver: linha perdida')).toBeNull()
    expect(parseHelperLine('{"ok":true}')).toBeNull()
    expect(parseHelperLine('[1,2,3]')).toBeNull()
    expect(parseHelperLine('{"id":')).toBeNull()
  })

  it('looks for the helper next to the resources, then in the dev folder', () => {
    const candidates = helperCandidates('/app', '/resources')
    expect(candidates[0]).toBe('/resources/helper/MyRgb.Helper.exe')
    expect(candidates.some((path) => path.includes('helper/publish/win-x64/MyRgb.Helper.exe'))).toBe(
      true
    )
    expect(findHelperPath(candidates)).toBeUndefined()
    expect(findHelperPath([])).toBeUndefined()
  })

  it('builds the Windows named pipe path', () => {
    expect(helperPipePath('myrgb-helper-abc')).toBe('\\\\.\\pipe\\myrgb-helper-abc')
  })
})

interface HelperStats {
  pid: number
  process: string
  fps: number
  frameTimeMs: number
  low1Fps: number
  recent: number[]
}

const sample: HelperStats = {
  pid: 4242,
  process: 'Cyberpunk2077',
  fps: 143.8,
  frameTimeMs: 6.94,
  low1Fps: 121.2,
  recent: [6.9, 7.1]
}

class StubBridge implements FpsBridge {
  readonly requests: string[] = []
  disposed = false

  constructor(
    private readonly poll: () => Promise<HelperStats | null> | HelperStats | null = () => sample,
    private readonly failStart?: Error
  ) {}

  async start(): Promise<void> {}

  async request<T>(cmd: string): Promise<T> {
    this.requests.push(cmd)
    if (cmd === 'fps.start') {
      if (this.failStart) throw this.failStart
      return { running: true } as T
    }
    if (cmd === 'fps.poll') return (await this.poll()) as T
    return {} as T
  }

  dispose(): void {
    this.disposed = true
  }
}

describe('FpsService', () => {
  it('reports no source on Linux without creating a bridge', () => {
    const createBridge = vi.fn(() => new StubBridge())
    const service = new FpsService({ platform: 'linux', createBridge })
    service.start()

    expect(createBridge).not.toHaveBeenCalled()
    expect(service.capabilities()).toMatchObject({ supported: false, available: false })
    expect(service.capabilities().reason).toMatch(/MangoHud|gamescope/)
    expect(service.latest()).toBeNull()
    service.dispose()
  })

  it('explains a missing helper instead of failing', () => {
    const service = new FpsService({ platform: 'win32', createBridge: () => null })
    service.start()

    expect(service.capabilities()).toMatchObject({ supported: true, available: false })
    expect(service.capabilities().reason).toMatch(/build:helper/)
    service.dispose()
  })

  it('starts, polls and marks the sample stale after three seconds', async () => {
    let now = 1_000
    const bridge = new StubBridge()
    const service = new FpsService({
      platform: 'win32',
      createBridge: () => bridge,
      now: () => now,
      pollMs: 60_000
    })

    service.start()
    await vi.waitFor(() => expect(service.capabilities().available).toBe(true))
    await vi.waitFor(() => expect(service.latest()).not.toBeNull())

    expect(bridge.requests).toEqual(['fps.start', 'fps.poll'])
    expect(service.latest()).toEqual({
      fps: 143.8,
      frameTimeMs: 6.94,
      low1Fps: 121.2,
      game: 'Cyberpunk2077',
      recent: [6.9, 7.1]
    })

    now += 3_000
    expect(service.latest()).not.toBeNull()
    now += 1
    expect(service.latest()).toBeNull()

    service.stop()
    expect(bridge.disposed).toBe(true)
  })

  it('counts subscribers: the helper lives until the last one leaves', async () => {
    const bridges: StubBridge[] = []
    const service = new FpsService({
      platform: 'win32',
      createBridge: () => {
        const bridge = new StubBridge()
        bridges.push(bridge)
        return bridge
      },
      pollMs: 60_000
    })

    service.start()
    service.start()
    await vi.waitFor(() => expect(service.capabilities().available).toBe(true))
    expect(bridges).toHaveLength(1)

    service.stop()
    expect(bridges[0].disposed).toBe(false)
    expect(service.capabilities().available).toBe(true)

    service.stop()
    expect(bridges[0].disposed).toBe(true)
    service.dispose()
  })

  it('turns a refused elevation into a reason and retries on demand', async () => {
    let attempt = 0
    const service = new FpsService({
      platform: 'win32',
      createBridge: () => (attempt++ === 0 ? new StubBridge(undefined, new Error('UAC recusado')) : new StubBridge()),
      pollMs: 60_000
    })

    service.start()
    await vi.waitFor(() => expect(service.capabilities().reason).toMatch(/UAC recusado/))
    expect(service.capabilities().available).toBe(false)
    expect(service.latest()).toBeNull()

    service.retry()
    await vi.waitFor(() => expect(service.capabilities().available).toBe(true))
    service.dispose()
  })

  it('gives up after three failed polls and says why', async () => {
    const bridge = new StubBridge(() => {
      throw new Error('pipe fechou')
    })
    const service = new FpsService({
      platform: 'win32',
      createBridge: () => bridge,
      pollMs: 1
    })

    service.start()
    await vi.waitFor(() => expect(service.capabilities().reason).toMatch(/parou/), {
      timeout: 5_000
    })
    expect(service.capabilities().available).toBe(false)
    expect(service.latest()).toBeNull()
    expect(bridge.disposed).toBe(true)
    service.dispose()
  })

  it('stays dead after dispose', () => {
    const createBridge = vi.fn(() => new StubBridge())
    const service = new FpsService({ platform: 'win32', createBridge })
    service.dispose()
    service.start()

    expect(createBridge).not.toHaveBeenCalled()
  })
})
