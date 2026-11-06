# How MyRGB works

This document explains MyRGB from the inside: what happens between clicking an effect and the LED strip lighting up, and why the result is exactly the same on Linux and Windows.

---

## The architecture in one figure

```
   ┌───────────────────────────────────────────────────────────┐
   │ renderer (React)                                        │
   │  TopBar · ZoneRail · StripPreview · PatternPicker ·      │
   │  GradientEditor · ParamSliders                           │
   │                                                           │
   │  Does not know the hardware. No timers. Does not write    │
   │  anything to disk.                                        │
   └───────────────┬───────────────────────────────────────────┘
                   │  window.myrgb.*  (contextBridge)
   ┌───────────────▼───────────────────────────────────────────┐
   │ preload                                                  │
   │  Typed API: call → invoke, event → onX(callback)         │
   └───────────────┬───────────────────────────────────────────┘
                   │  IPC (invoke / send)
   ┌───────────────▼───────────────────────────────────────────┐
   │ main                                                     │
   │  EffectEngine  ──►  AuraUsbDevice  ──►  HID (node-hid)   │
   │  ProfileStore  ──►  JSON on disk                          │
   │  SettingsStore ──►  JSON on disk                          │
   │  Tray · conflict detection                               │
   └───────────────────────────────────────────────────────────┘
```

Three rules the code respects:

1. **The renderer never talks to HID.** It only asks things through the preload bridge. The main process opens the device.
2. **The effects engine owns the frames.** The renderer draws no frame: it receives the buffer already destined for the hardware and paints it on the canvas.
3. **The main process owns the disk.** The renderer never writes a file; it calls an API and the main process writes.

---

## The path of a click

1. You click a pattern in the **Effects** panel.
2. The renderer calls `window.myrgb.setZoneEffect(zoneId, effect)`.
3. The preload does `ipcRenderer.invoke('profile:setZone', ...)`.
4. The main process applies the change to the profile, **writes the JSON to disk** (with a 250 ms delay to group consecutive changes) and returns the updated profile.
5. The renderer receives the new profile and redraws.
6. The effects engine, which is in the main process, starts using the new profile on the next frame.

No step has a copy of the truth: the profile on disk, the profile in the main process memory and the profile in the renderer are the same object, synchronized via IPC.

---

## The effects engine

### One frame

Every frame (30 fps by default), the engine:

1. Calculates the time in seconds since the engine started.
2. For each zone, resolves the effect (if the zone is following another, uses the other zone's effect).
3. For each LED in the zone, calls the pattern and receives a number between 0 and 1.
4. Converts that number into a color using the palette gradient.
5. Applies intensity and global brightness.
6. Delivers the ready buffer: the hardware receives the same buffer the interface receives.

### The contract with patterns

A pattern (`src/main/engine/patterns/*.ts`) receives a `PatternContext`:

| Field | What it is |
|---|---|
| `ledIndex` | the LED index within the zone, starting at 0 |
| `ledCount` | how many LEDs the zone has |
| `position` | normalized position, from 0 (first LED) to 1 (last) |
| `time` | seconds since the engine started |
| `speed` | the global speed multiplier |
| `params` | the effect parameters, already filled with defaults |
| `sampleGradient(u)` | the gradient color at position `u` |

And returns one of two things:

```ts
{ u: 0.42 }                       // position in the gradient
{ color: { r, g, b }, intensity }  // a direct color
```

Plus `intensity` (0 to 1), which multiplies the result — that's how a pattern "turns off" part of the strip without touching the gradient.

### Why the result is identical on every system

Rendering is a **pure function of `(time, profile)`**:

- No pattern calls `Math.random`. Whoever needs randomness uses `hash()`, a deterministic hash function.
- No pattern reads the clock. Time comes from the context.
- No pattern depends on screen size, mouse position or interface state.

As a consequence, frame 42 is the same on Linux, Windows and any machine — and this can be proven by comparing files.

### The preview is not a simulation

`StripPreview` draws the buffer the engine just produced. It does not run a second version of the engine, nor recalculate anything: it just paints pixels. If the preview shows purple, the LED turns purple.

The only difference between the preview and the hardware is **scale**: the large strip in the interface represents the zone being edited, and the thin strips represent the other zones.

---

## The AURA USB protocol

The controller appears as a raw HID device (`0b05:19af`). The implementation is in `src/main/aura/`:

- `auraProtocol.ts` — **bytes only**. Builds and interprets frames, without touching hardware. Pure and testable.
- `auraDevice.ts` — the **transport**. Opens the device, performs the initialization sequence and writes the frames.

The transport is pure HID (`node-hid`), which behaves the same on Linux (`hidraw`) and Windows (`hid.dll`). There is no OS-specific code path: **there is no way for behavior to diverge**.

### Initialization sequence

```
1. EC 52 53 00 01   stop_gen1  — takes the controller out of its animation engine
2. EC 82            firmware    — response: EC 02 <ascii>
3. EC B0            config      — response: EC 30 <60 bytes of table>
4. EC 35 <ch> 00 00 FF         — puts each channel in direct mode
```

Step 3 is the most important: it is the **hardware configuration table**, and from it MyRGB takes the board layout. Nothing is hardcoded — the number of ARGB headers, onboard LEDs and 12V headers comes from the controller itself.

### Channel map

| Zone | Direct channel (`0x40`) | Effect channel (`0x35`) |
|---|---|---|
| Onboard LEDs | `0x04` | 0 |
| ARGB Header 1 | `0x00` | 1 |
| ARGB Header 2 | `0x01` | 2 |
| ARGB Header 3 | `0x02` | 3 |

Step 4 puts **all** channels in direct mode (`0xFF`), meaning "whoever writes the byte commands": this is what ensures MyRGB controls the board instead of the firmware.

### Direct stream (`0x40`)

Each frame has 65 bytes. Opcode `0x40` carries at most 20 LEDs per packet, and bit `0x80` in the command byte marks the last packet of the channel — the "apply now". Packet division is in `buildDirectPackets()`, implemented byte by byte as in OpenRGB's `AuraUSBController::SendDirect()`, and a test compares the two, packet by packet.

With 217 LEDs (1 onboard + 3 headers of 72) there are **13 HID writes per frame**.

---

## Linux ↔ Windows parity proof

Since rendering is a pure function, you can record the exact frames that would be sent to the hardware and compare the files byte by byte.

```bash
# on Linux
npx electron . --dump-frames frames-linux --dump-count 60

# on Windows
MyRGB.exe --dump-frames frames-windows --dump-count 60

# compare (on either machine)
node tools/compare-frames.mjs frames-linux frames-windows
```

Expected output:

```
IDENTICAL: 60 frames match byte for byte
```

Each `.bin` file contains the format header, the LED count per zone, and the RGB triplets of all LEDs. The `manifest.json` brings the profile used, to ensure both runs used the same configuration.

### The two conditions that must hold

1. **The same profile.** `--dump-frames` uses the default profile reconciled with the real hardware layout. Since the layout comes from the controller's configuration table, both machines need the same board (or at least the same number of headers).
2. **The same clock.** The dump uses a deterministic clock: frame *n* is always at exactly `n / fps` seconds from a fixed origin. It doesn't matter what the system time is, nor the machine load.

---

## Zones: what is a zone

A zone is a physical part of the board that the controller knows how to address:

| Type | What it is | Channels | LEDs |
|---|---|---|---|
| `fixed` | onboard LEDs (chipset, I/O cover, logo) | `0x04` | what the configuration table reports |
| `addressable` | a 5V ARGB 3-pin header | `0x00`, `0x01`, ... | **you inform** |

5V ARGB headers are addressable: each LED has its own color channel. 4-pin 12V RGB headers are **not addressable** and are not supported by this controller — it's an AURA USB limitation, not a MyRGB limitation.

The number of LEDs on a header **is not reported by the hardware**: it depends on what you connected. That's why it's a setting, and the default is 72. OpenRGB 1.0 does exactly the same, for the same reason.

The layout is read at runtime and reconciled with the profile at every start: if you change the board, or change a header, the program adjusts without erasing the effects.

---

## Conflict with other programs

Two programs writing to the same controller produce **flickering** — the hardware alternates between the two sets of colors. There is no arbitration in the protocol.

That's why MyRGB:

- opens the device with `nonExclusive: true`, which allows opening even with another program holding a handle (on Windows);
- **detects the conflict continuously**, every 5 seconds, and shows a warning in the top bar.

On Windows, the suspects are `LightingService` and Armoury Crate processes. On Linux, it's OpenRGB. The check runs all the time, so if you open Armoury Crate after MyRGB is already running, the warning appears without restarting anything.

The step-by-step to resolve it is in [windows.md](windows.md).

---

## Where things are

| | Path | Content |
|---|---|---|
| Profiles | `profiles/<name>.json` | zones, effects, palettes, global configuration |
| Settings | `settings.json` | autostart, minimize to tray, last profile, start with lights off |

`profiles/` is inside the application data folder:

- Linux: `~/.config/my-rgb/`
- Windows: `%APPDATA%\my-rgb\`

Profile writing is **debounced at 250 ms**: moving a slider doesn't generate a write per mouse pixel. On exit, a `flush()` ensures the last change is written.

The main process notifies the interface when writing actually happens (event `profile:saved`), and that's what feeds the **✓ saved / ● not saved** indicator in the top bar.

---

## The profile file

```jsonc
{
  "version": 1,
  "name": "Default",
  "zones": [
    {
      "zoneId": "argb0",
      "enabled": true,
      "name": "Front of case",   // optional: the name you gave
      "ledCount": 72,
      "effect": {
        "patternId": "wave",
        "paletteId": "rainbow",
        "params": { "rate": 1, "wavelength": 16, "amplitude": 1, "sharpness": 0 }
      },
      "followZoneId": null         // when filled, this zone mirrors another
    }
  ],
  "palettes": [ /* multi-stop gradients */ ],
  "global": {
    "brightness": 1,
    "speed": 1,
    "fps": 30,
    "outputEnabled": true
  }
}
```

The schema is the same on Linux and Windows: you can copy the file from one machine to the other without converting anything.

---

## Where each thing lives in the code

```
src/
  shared/            types + color math (used by both sides)
    types.ts         ZoneConfig, ParamSpec, Profile, IPC channels
    color.ts         HSV, RGB, gradient sampling
    api.ts           the typed bridge surface
  main/
    aura/
      auraProtocol.ts  pure frames, without hardware
      auraDevice.ts    HID transport
    engine/
      engine.ts        the frame loop
      palette.ts       built-in palettes + sampling
      patterns/        the 50 patterns and the registry
    store/
      profileStore.ts  profiles on disk, hardware reconciliation
      settings.ts      application settings
    platform/
      conflict.ts      Armoury Crate / OpenRGB detection
    docs/
      effectsDoc.ts    effects catalog generator
    index.ts           the main process, IPC, window, tray, CLI modes
    dumpFrames.ts      the frame recorder
    zones.ts           builds zones from the hardware layout
    tray.ts            tray icon and menu
  preload/index.ts   the contextBridge bridge
  renderer/src/
    store.ts          state (zustand) and the API bridge
    components/       TopBar, ZoneRail, StripPreview, PatternPicker,
                       GradientEditor, ParamSliders, HelpTip, Toast
tests/               vitest
tools/               command-line scripts
documentation/       this folder
```
