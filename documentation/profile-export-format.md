# Profile export format — `.myrgb.json`

> **Format version:** 1  
> **Suggested extension:** `.myrgb.json`  
> **Envelope:** none — the file is the `Profile` object itself, version 1.

MyRGB stores profiles as plain JSON files under the `profiles/` folder of the
user data directory. The same file works on Linux and Windows: just copy it
from one machine to the other.

## Schema

```json
{
  "version": 1,
  "name": "Default",
  "zones": [
    {
      "zoneId": "argb0",
      "enabled": true,
      "name": "Front of case",
      "ledCount": 72,
      "effect": {
        "patternId": "wave",
        "paletteId": "rainbow",
        "params": {
          "rate": 1,
          "wavelength": 16,
          "amplitude": 1,
          "sharpness": 0
        }
      },
      "followZoneId": null
    }
  ],
  "palettes": [
    {
      "id": "rainbow",
      "name": "Rainbow",
      "interpolation": "hsv",
      "stops": [
        { "position": 0, "color": "#ff0040" },
        { "position": 0.25, "color": "#ffd000" },
        { "position": 0.5, "color": "#00ff66" },
        { "position": 0.75, "color": "#00c8ff" },
        { "position": 1, "color": "#ff0040" }
      ]
    }
  ],
  "global": {
    "brightness": 1,
    "speed": 1,
    "fps": 30,
    "outputEnabled": true,
    "applyToAllZones": false
  },
  "targets": [
    {
      "id": "aura:argb0",
      "backend": "aura",
      "deviceId": "aura",
      "zoneIndex": 0,
      "label": "LEDs onboard",
      "ledCount": 72,
      "enabled": true
    }
  ]
}
```

## Top-level fields

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | `1` | yes | Schema version. Only `1` is accepted; anything else rejects import. |
| `name` | string | yes | Profile name, as shown in the selector. |
| `zones` | array | yes | One entry per controller zone. |
| `palettes` | array | yes | At least one palette; without it the importer falls back to the 12 built-ins. |
| `global` | object | yes | Global settings: brightness, speed, fps, outputEnabled. |
| `targets` | array | no | Where each zone is written. Absent = AURA targets are synthesized from hardware on open. |

## Zone

| Field | Type | Required | Description |
|---|---|---|---|
| `zoneId` | string | yes | Zone identifier (`argb0`, `mainboard`, ...). Unique within the profile. |
| `enabled` | boolean | yes | Zone on or off. |
| `name` | string | no | Name given by the user. Empty = hardware name. |
| `ledCount` | number | yes | Number of LEDs in the zone. AURA USB does not report it; it is configurable. |
| `effect` | object or `null` | yes | Zone effect. `null` only makes sense with `followZoneId` set. |
| `followZoneId` | string or `null` | yes | Zone whose effect this one mirrors. `null` = own effect. |

### Effect

| Field | Type | Required | Description |
|---|---|---|---|
| `patternId` | string | yes | Pattern identifier (`wave`, `chase`, `aurora`, ...). |
| `paletteId` | string | yes | Palette identifier used by the effect. |
| `params` | object | yes | Pattern parameters, key → value (number, string or boolean). |

## Palette

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Palette identifier. Unique within the profile. |
| `name` | string | yes | Name shown in the gradient selector. |
| `interpolation` | `"rgb"` \| `"hsv"` | yes | Color space for interpolation. |
| `stops` | array | yes | At least one stop. Ordered by position. |

### Palette stop

| Field | Type | Required | Description |
|---|---|---|---|
| `position` | number (0 to 1) | yes | Position in the gradient. |
| `color` | string | yes | Color in hex (`#rrggbb` or `#rgb`). |

## Global settings

| Field | Type | Required | Description |
|---|---|---|---|
| `brightness` | number (0 to 1) | yes | Intensity multiplier for all LEDs. |
| `speed` | number (0.05 to 10) | yes | Speed multiplier for all effects. |
| `fps` | number integer (1 to 240) | yes | Frames per second of the effects engine. |
| `outputEnabled` | boolean | yes | When false, the engine renders but never writes to hardware. |
| `applyToAllZones` | boolean | no | Apply effect changes to every zone at once. |

## Targets (optional)

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Target identifier (`aura:argb0`, ...). Unique. |
| `backend` | string | yes | Lighting backend (`aura`, `openrgb`, `razer`, `corsair`). |
| `deviceId` | string | yes | Device identifier within the backend. |
| `zoneIndex` | number integer ≥ 0 | yes | Zone index within the device. |
| `label` | string | yes | Display name of the target. |
| `ledCount` | number integer ≥ 0 | yes | Number of LEDs of the target. |
| `enabled` | boolean | yes | Whether the target participates in output. |

## Import rules

The importer (`validateImportedProfile`) is defensive: nothing from the
external file is blindly trusted.

1. `version` must be `1`; otherwise the file is rejected.
2. `zones` and `palettes` must be arrays; otherwise rejected.
3. `global` must be an object; otherwise rejected.
4. Duplicate zone/palette names are discarded (first occurrence kept).
5. Palette stops without a valid position or color are dropped; a palette with
   no valid stops is replaced by the built-in palettes.
6. Effect parameters that are not number, string or boolean are ignored.
7. A `patternId` that does not exist makes the effect `null` (zone without effect).
8. A `paletteId` that does not exist makes the effect use the first palette.
9. Targets with unknown backend or negative `zoneIndex` are dropped.
10. If a profile with the same name already exists, the imported one gets a
    suffix (`"Name (2)"`) — it never overwrites an existing profile without
    confirmation.

## Linux ↔ Windows parity

The schema is identical on both systems. A file exported on Windows opens on
Linux without conversion, and vice versa. The only platform-specific field is
`targets.backend` (`aura` today; `openrgb`, `razer` and `corsair` are future
work) — and that field is optional.

## Minimal valid example

```json
{
  "version": 1,
  "name": "Minimal",
  "zones": [
    {
      "zoneId": "argb0",
      "enabled": true,
      "ledCount": 72,
      "effect": {
        "patternId": "solid",
        "paletteId": "monochrome",
        "params": {}
      },
      "followZoneId": null
    }
  ],
  "palettes": [
    {
      "id": "monochrome",
      "name": "Monochrome",
      "interpolation": "rgb",
      "stops": [
        { "position": 0, "color": "#000000" },
        { "position": 1, "color": "#ffffff" }
      ]
    }
  ],
  "global": {
    "brightness": 1,
    "speed": 1,
    "fps": 30,
    "outputEnabled": true
  }
}
```

## How to export and import in the UI

- **Export:** there is no dedicated export button today; the profile file is at
  `profiles/<name>.json` inside the app data directory
  (`~/.config/my-rgb/` on Linux, `%APPDATA%\my-rgb\` on Windows). Copy it to
  share.
- **Import:** use the import profile option in the top bar; the importer
  validates and never overwrites an existing profile.
