/**
 * Types shared between the main process, the preload bridge and the renderer.
 * Kept dependency-free so it can be imported from any of the three.
 */

import type { LightTarget } from './features/light'
import type { OverlayConfig } from './features/overlay'

export interface RGB {
  r: number
  g: number
  b: number
}

// ---------------------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------------------

/** Physical layout reported by the AURA USB configuration table. */
export interface AuraLayout {
  /** Number of 5V addressable (ARGB) headers. */
  argbChannels: number
  /** Total fixed on-board LEDs (chipset, I/O cover, ...). */
  mainboardLeds: number
  /** Number of 12V non-addressable RGB headers. */
  rgbHeaders: number
}

export interface DeviceInfo {
  connected: boolean
  path: string | null
  product: string
  vendorId: number
  productId: number
  firmware: string
  layout: AuraLayout | null
  error: string | null
  /** True when another process (Armoury Crate, OpenRGB) is likely writing frames. */
  conflictSuspected: boolean
}

export type ZoneKind = 'fixed' | 'addressable'

export interface ZoneState {
  id: string
  label: string
  kind: ZoneKind
  /** Channel used by the 0x40 direct-stream opcode. */
  directChannel: number
  /** Channel used by the 0x35 effect-mode opcode. */
  effectChannel: number
  /** Number of LEDs currently addressed on this zone. */
  ledCount: number
  maxLedCount: number
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export type ParamValue = number | boolean | string

export type ParamSpec =
  | {
      key: string
      label: string
      type: 'number'
      min: number
      max: number
      step: number
      default: number
      unit?: string
      description?: string
    }
  | {
      key: string
      label: string
      type: 'boolean'
      default: boolean
      description?: string
    }
  | {
      key: string
      label: string
      type: 'select'
      default: string
      options: { value: string; label: string }[]
      description?: string
    }

export interface PatternMeta {
  id: string
  name: string
  category: string
  description: string
  params: ParamSpec[]
}

export interface PaletteStop {
  position: number
  color: string
}

export type Interpolation = 'rgb' | 'hsv'

export interface Palette {
  id: string
  name: string
  interpolation: Interpolation
  stops: PaletteStop[]
}

export interface EffectDefinition {
  patternId: string
  paletteId: string
  params: Record<string, ParamValue>
}

// ---------------------------------------------------------------------------
// Zones & profiles
// ---------------------------------------------------------------------------

export interface ZoneConfig {
  zoneId: string
  enabled: boolean
  /**
   * Name the user gave to this zone.
   *
   * The hardware only reports what a zone is ("Header ARGB 1", "LEDs
   * onboard"); this is what the user calls it ("Frente da caixa", "Ventoinha
   * da esquerda"). Empty means "use the hardware name".
   */
  name?: string
  /**
   * Number of LEDs addressed on this zone.
   *
   * The AURA controller does not report the length of the addressable headers
   * - it is a property of what the user plugged in, so it is configured here
   * (OpenRGB 1.0 exposes the exact same thing as a manually sized zone).
   */
  ledCount: number
  /** Null means "mirror another zone". */
  effect: EffectDefinition | null
  followZoneId: string | null
}

export interface GlobalSettings {
  brightness: number
  speed: number
  fps: number
  /** When false the engine renders but never touches the hardware. */
  outputEnabled: boolean
  /** Apply effect changes to every zone at once. */
  applyToAllZones?: boolean
}

export interface Profile {
  version: 1
  name: string
  zones: ZoneConfig[]
  palettes: Palette[]
  global: GlobalSettings
  /**
   * Where each zone is written.
   *
   * Optional on purpose: a profile saved before the lighting router existed
   * has no targets, and `reconcileProfile` synthesizes the AURA ones from the
   * hardware layout, so it opens exactly as it did. `ZoneConfig.zoneId` is
   * still the key that ties a config to its target.
   */
  targets?: LightTarget[]
}

/** Pages reachable from the sidebar. */
export type PageId =
  | 'overview'
  | 'lighting'
  | 'system'
  | 'sensors'
  | 'disks'
  | 'network'
  | 'games'
  | 'bottleneck'
  | 'overlay'
  | 'integrations'

/** Navigation state that survives a restart. */
export interface UiSettings {
  /** Page shown on the next start. */
  lastPage?: PageId
  /** Sidebar groups the user collapsed. */
  collapsedGroups?: string[]
}

/** Application level preferences, stored outside the profiles. */
export interface AppSettings {
  /** Start the engine as soon as the app launches. */
  autoStart: boolean
  /** Launch the app when the user logs in. */
  autostartAtLogin: boolean
  /** Close to the tray instead of quitting. */
  minimizeToTray: boolean
  /** Last profile that was open. */
  lastProfile: string
  /** Start with the lighting off. */
  startWithLightingOff: boolean
  /** Profile to load on startup (overrides lastProfile if set). */
  startupProfile?: string | null
  /** Window state that is not a preference but should be remembered. */
  ui?: UiSettings
  /** On-screen display: switch, metrics, position and shortcut. */
  overlay?: OverlayConfig
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** One rendered frame: RGB triplets for every LED of every zone, in order. */
export interface Frame {
  /** Monotonic frame counter. */
  seq: number
  /** Milliseconds since engine start. */
  time: number
  /** Per-zone LED counts, matching the zone order. */
  zoneLedCounts: number[]
  /** Flat RGB triplets, zone by zone. */
  pixels: Uint8Array
}

// ---------------------------------------------------------------------------
// IPC channel names
// ---------------------------------------------------------------------------

export const IPC = {
  deviceInfo: 'device:info',
  deviceReconnect: 'device:reconnect',
  zonesList: 'zones:list',
  patternsList: 'patterns:list',
  profileGet: 'profile:get',
  profileSave: 'profile:save',
  /** Pushed by the main process once the profile really reached the disk. */
  profileSaved: 'profile:saved',
  profileDuplicate: 'profile:duplicate',
  profileRename: 'profile:rename',
  profileList: 'profile:list',
  profileLoad: 'profile:load',
  profileDelete: 'profile:delete',
  profileSetZone: 'profile:setZone',
  profileSetZoneConfig: 'profile:setZoneConfig',
  profileApplyToAll: 'profile:applyToAll',
  profileSetPalette: 'profile:setPalette',
  profileRemovePalette: 'profile:removePalette',
  profileSetGlobal: 'profile:setGlobal',
  profileExport: 'profile:export',
  profileImport: 'profile:import',
  profileFlush: 'profile:flush',
  engineStart: 'engine:start',
  engineStop: 'engine:stop',
  engineFrame: 'engine:frame',
  engineState: 'engine:state',
  /** Pushed when something outside the engine fails (disk write, ...). */
  appError: 'app:error',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  systemGet: 'system:get',
  drivesList: 'drives:list',
  /** Subscribe to the live sensor stream (starts the poll in the main). */
  sensorsStart: 'sensors:start',
  sensorsStop: 'sensors:stop',
  /** Pushed once per collection, with session min/max/history attached. */
  sensorsBatch: 'sensors:batch',
  /** S.M.A.R.T. health of the physical disks. */
  healthList: 'health:list',
  /** One privileged read (pkexec) for disks smartctl cannot open. */
  healthElevated: 'health:elevated',
  /** Runs the full network diagnostic and resolves with the report. */
  netDiagnose: 'net:diagnose',
  /** Aborts the diagnostic; the pending call resolves to null. */
  netCancel: 'net:cancel',
  /** Last completed report, without running the test again. */
  netLast: 'net:last',
  /** Pushed while the diagnostic runs. */
  netProgress: 'net:progress',
  /** Local FPS estimate for the whole catalog. */
  gamesList: 'games:list',
  /** Measured FPS from HowManyFPS for the games it knows. */
  gamesFps: 'games:fps',
  /** Store or erase the HowManyFPS key (never returned to the renderer). */
  gamesSetApiKey: 'games:setApiKey',
  /** Whether a key is stored, and whether it is encrypted. */
  gamesHasApiKey: 'games:hasApiKey',
  /** Subscribe to the bottleneck stream (starts the shared sensor poll). */
  bottleneckStart: 'bottleneck:start',
  /** Remove the page subscription. A running session keeps the poll alive. */
  bottleneckStop: 'bottleneck:stop',
  /** Start a 1, 3 or 5 minute analysis. */
  bottleneckSessionStart: 'bottleneck:sessionStart',
  /** Cancel the running analysis. */
  bottleneckSessionStop: 'bottleneck:sessionStop',
  /** Last finished report, kept in memory. */
  bottleneckReport: 'bottleneck:report',
  /** Pushed once per sensor batch, plus once when a session finishes. */
  bottleneckSample: 'bottleneck:sample',
  /** Current overlay configuration and capabilities. */
  overlayGet: 'overlay:get',
  /** Apply a partial change and return the new state. */
  overlayUpdate: 'overlay:update',
  /** Flip the switch (used by the page and by the global shortcut path). */
  overlayToggle: 'overlay:toggle',
  /** Try the FPS helper again after a failure. */
  overlayRetryFps: 'overlay:retryFps',
  /** Content size reported by the overlay bundle, for the window bounds. */
  overlayResize: 'overlay:resize',
  /** Pushed when the configuration or the FPS capability changes. */
  overlayState: 'overlay:state',
  /** Pushed every 500 ms while the overlay is open. */
  overlayFrame: 'overlay:frame'
} as const
