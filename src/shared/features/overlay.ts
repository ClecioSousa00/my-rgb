/**
 * Overlay: what the on-screen display shows, and the contract with the window
 * that draws it.
 *
 * The catalogue is a port of the Reset Explode one, in the same order and with
 * the same defaults, so the picker feels identical. The overlay itself is a
 * separate, tiny renderer: the main process builds one frame every 500 ms and
 * pushes it, and that bundle only draws what it receives. Keeping the texts in
 * the main process means the formatting is testable without a window.
 *
 * FPS is the only metric that needs Windows: it comes from the ETW helper.
 * On Linux the overlay still works for sensors, and the page says why the FPS
 * is missing instead of showing a fake number.
 */

export type OverlayCorner = 'tl' | 'tr' | 'bl' | 'br'

export type OverlayGroup = 'FPS' | 'GPU' | 'VRAM' | 'CPU' | 'RAM' | 'Outros'

export type OverlayItemKey =
  | 'fps'
  | 'frametime'
  | 'low1'
  | 'graph'
  | 'gpu_load'
  | 'gpu_temp'
  | 'gpu_hotspot'
  | 'gpu_clock'
  | 'gpu_memclock'
  | 'gpu_power'
  | 'gpu_volt'
  | 'gpu_fan'
  | 'gpu_perfcap'
  | 'vram_used'
  | 'vram_pct'
  | 'vram_temp'
  | 'cpu_load'
  | 'cpu_maxcore'
  | 'cpu_temp'
  | 'cpu_clock'
  | 'cpu_clockmax'
  | 'cpu_power'
  | 'ram_used'
  | 'ram_pct'
  | 'game'
  | 'clock'

export interface OverlayMetric {
  key: OverlayItemKey
  group: OverlayGroup
  label: string
  /** Selected by the "Padrão" preset and on a fresh install. */
  default: boolean
}

/** The picker, in the order the overlay draws it. */
export const OVERLAY_METRICS: OverlayMetric[] = [
  { key: 'fps', group: 'FPS', label: 'FPS', default: true },
  { key: 'frametime', group: 'FPS', label: 'Frametime (ms)', default: true },
  { key: 'low1', group: 'FPS', label: '1% low', default: true },
  { key: 'graph', group: 'FPS', label: 'Gráfico de frametime', default: true },

  { key: 'gpu_load', group: 'GPU', label: 'Uso', default: true },
  { key: 'gpu_temp', group: 'GPU', label: 'Temperatura', default: true },
  { key: 'gpu_hotspot', group: 'GPU', label: 'Hotspot', default: false },
  { key: 'gpu_clock', group: 'GPU', label: 'Clock do núcleo', default: true },
  { key: 'gpu_memclock', group: 'GPU', label: 'Clock da memória', default: false },
  { key: 'gpu_power', group: 'GPU', label: 'Consumo', default: true },
  { key: 'gpu_volt', group: 'GPU', label: 'Tensão do núcleo', default: false },
  { key: 'gpu_fan', group: 'GPU', label: 'Ventoinha', default: false },
  { key: 'gpu_perfcap', group: 'GPU', label: 'Limitador (NVIDIA)', default: false },

  { key: 'vram_used', group: 'VRAM', label: 'Usada (GB)', default: true },
  { key: 'vram_pct', group: 'VRAM', label: 'Uso (%)', default: false },
  { key: 'vram_temp', group: 'VRAM', label: 'Temperatura', default: false },

  { key: 'cpu_load', group: 'CPU', label: 'Uso total', default: true },
  { key: 'cpu_maxcore', group: 'CPU', label: 'Núcleo mais ocupado', default: false },
  { key: 'cpu_temp', group: 'CPU', label: 'Temperatura', default: true },
  { key: 'cpu_clock', group: 'CPU', label: 'Clock médio', default: true },
  { key: 'cpu_clockmax', group: 'CPU', label: 'Clock máximo (núcleo)', default: false },
  { key: 'cpu_power', group: 'CPU', label: 'Consumo', default: true },

  { key: 'ram_used', group: 'RAM', label: 'Usada (GB)', default: true },
  { key: 'ram_pct', group: 'RAM', label: 'Uso (%)', default: false },

  { key: 'game', group: 'Outros', label: 'Nome do jogo', default: true },
  { key: 'clock', group: 'Outros', label: 'Hora', default: false }
]

export const OVERLAY_GROUPS: OverlayGroup[] = ['FPS', 'GPU', 'VRAM', 'CPU', 'RAM', 'Outros']

const ITEM_KEYS = new Set<string>(OVERLAY_METRICS.map((metric) => metric.key))

/** Sizes offered by the page, matching the original's three chips. */
export const OVERLAY_SCALES = [0.85, 1, 1.3] as const
export type OverlayScale = (typeof OVERLAY_SCALES)[number]

export const OVERLAY_SCALE_LABEL: Record<number, string> = {
  0.85: 'Pequeno',
  1: 'Médio',
  1.3: 'Grande'
}

/** Background opacity range. 1 = solid black card, 0.4 = barely there. */
export const OVERLAY_OPACITY_MIN = 0.4
export const OVERLAY_OPACITY_MAX = 1
export const OVERLAY_OPACITY_OPTIONS = [0.55, 0.7, 0.85, 1] as const

export const OVERLAY_CORNERS: Array<{ value: OverlayCorner; label: string }> = [
  { value: 'tl', label: 'Superior esquerdo' },
  { value: 'tr', label: 'Superior direito' },
  { value: 'bl', label: 'Inferior esquerdo' },
  { value: 'br', label: 'Inferior direito' }
]

/** Ctrl+Shift+O, the same shortcut as the Reset Explode. */
export const DEFAULT_OVERLAY_SHORTCUT = 'CommandOrControl+Shift+O'

export interface OverlayConfig {
  enabled: boolean
  items: OverlayItemKey[]
  /** Card background opacity, 0.4–1. Text stays fully opaque. */
  opacity: number
  /** Content scale: 0.85, 1 or 1.3. */
  scale: number
  corner: OverlayCorner
  /** Electron display id; 0 means the primary display. */
  displayId: number
  /** Electron accelerator. */
  shortcut: string
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  enabled: false,
  items: OVERLAY_METRICS.filter((metric) => metric.default).map((metric) => metric.key),
  opacity: 0.85,
  scale: 1,
  corner: 'tl',
  displayId: 0,
  shortcut: DEFAULT_OVERLAY_SHORTCUT
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Keep a config coming from disk or from the renderer usable.
 *
 * Unknown item keys are dropped (a profile from a newer version must not break
 * the overlay), the scale snaps to one of the three buttons and the opacity is
 * clamped. Omitted fields keep the default, so a partial patch is safe.
 */
export function normalizeOverlayConfig(
  input?: Partial<OverlayConfig> | null,
  fallback: OverlayConfig = DEFAULT_OVERLAY_CONFIG
): OverlayConfig {
  const source = input ?? {}
  const enabled = typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled

  const items =
    source.items === undefined
      ? [...fallback.items]
      : OVERLAY_METRICS.map((metric) => metric.key).filter((key) =>
          (source.items ?? []).includes(key)
        )

  const opacity =
    typeof source.opacity === 'number' && Number.isFinite(source.opacity)
      ? Math.round(clamp(source.opacity, OVERLAY_OPACITY_MIN, OVERLAY_OPACITY_MAX) * 100) / 100
      : fallback.opacity

  const scale =
    typeof source.scale === 'number' && OVERLAY_SCALES.some((value) => value === source.scale)
      ? source.scale
      : fallback.scale

  const corner =
    source.corner !== undefined && OVERLAY_CORNERS.some((entry) => entry.value === source.corner)
      ? source.corner
      : fallback.corner

  const displayId =
    typeof source.displayId === 'number' && Number.isInteger(source.displayId) && source.displayId >= 0
      ? source.displayId
      : fallback.displayId

  const shortcut =
    typeof source.shortcut === 'string' &&
    source.shortcut.trim().length >= 3 &&
    source.shortcut.trim().length <= 64
      ? source.shortcut.trim()
      : fallback.shortcut

  return { enabled, items, opacity, scale, corner, displayId, shortcut }
}

/** True when the key is part of the catalogue. */
export function isOverlayItemKey(value: string): value is OverlayItemKey {
  return ITEM_KEYS.has(value)
}

/**
 * Platform name for the shortcut labels.
 *
 * This module is imported by both the main process (Node, `process.platform`)
 * and the renderer (no Node globals with context isolation), so neither is
 * assumed: the browser's `navigator` is the fallback, and the tests pass the
 * platform explicitly.
 */
function hostPlatform(): string {
  const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator
  if (!nav) return 'linux'
  const name = `${nav.platform ?? ''} ${nav.userAgent ?? ''}`
  if (/mac/i.test(name)) return 'darwin'
  if (/win/i.test(name)) return 'win32'
  return 'linux'
}

/** Human form for the page: "Ctrl + Shift + O". */
export function formatAccelerator(accelerator: string, platform = hostPlatform()): string {
  const name = platform === 'darwin' ? 'Cmd' : 'Ctrl'
  return accelerator
    .replace(/CommandOrControl/gi, name)
    .replace(/Control/gi, name)
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' + ')
}

/** One row of the overlay, already formatted ("GPU" / "98 %  65 °C"). */
export interface OverlayItem {
  key: OverlayItemKey
  group: OverlayGroup
  text: string
}

/** Frame stats for the program in the foreground, as the helper reports them. */
export interface OverlayFps {
  fps: number
  frameTimeMs: number
  low1Fps: number
  /** Process name, e.g. "Cyberpunk2077". */
  game: string
  /** Recent frame times in ms, oldest first (at most 120). */
  recent: number[]
}

/** Everything the overlay window needs to draw one frame. */
export interface OverlayFrame {
  at: number
  config: OverlayConfig
  /** Null while no game presented in the last two seconds. */
  fps: OverlayFps | null
  items: OverlayItem[]
  /** Local time, HH:mm. */
  clock: string
}

export interface OverlayFpsCapabilities {
  /** The platform has an FPS source at all (Windows ETW). */
  supported: boolean
  /** The helper is connected and measuring. */
  available: boolean
  /** What to tell the user when the FPS is not available. */
  reason?: string
}

export const FPS_LINUX_NOTE =
  'A leitura de FPS usa o ETW do Windows e não existe no Linux: o overlay mostra os ' +
  'sensores normalmente. Para FPS no Linux, use MangoHud ou gamescope.'

/** The FPS is only read while the overlay or a bottleneck session needs it. */
export const FPS_IDLE_NOTE =
  'O FPS é lido enquanto o overlay está aberto ou uma análise do Gargalo está em andamento.'

export const FPS_HELPER_NOTE =
  'O helper do Windows (MyRgb.Helper.exe) não foi encontrado. Gere com ' +
  '`npm run build:helper` ou instale a versão empacotada.'

export interface OverlayDisplay {
  id: number
  label: string
  primary: boolean
  width: number
  height: number
}

export type OverlayStatus = 'off' | 'active' | 'error'

/** State of the service, sent to the page on every change. */
export interface OverlayState {
  config: OverlayConfig
  /** Whether the overlay window exists and is visible. */
  open: boolean
  status: OverlayStatus
  /** Explanation for the page when something is not available. */
  message?: string
  fps: OverlayFpsCapabilities
  displays: OverlayDisplay[]
}
