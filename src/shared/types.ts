/**
 * Types shared between the main process, the preload bridge and the renderer.
 * Kept dependency-free so it can be imported from any of the three.
 */

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
}

export interface Profile {
  version: 1
  name: string
  zones: ZoneConfig[]
  palettes: Palette[]
  global: GlobalSettings
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
  settingsGet: 'settings:get',
  settingsSet: 'settings:set'
} as const
