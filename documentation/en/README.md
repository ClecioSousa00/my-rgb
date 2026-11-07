# MyRGB

RGB lighting control for ASUS AURA boards — **the same program, the same effects, on Linux and Windows**.

MyRGB talks directly to the AURA USB controller HID protocol (`0b05:19af`). It is not an OpenRGB wrapper: it is its own protocol implementation, which makes behavior identical on both operating systems.

![MyRGB](build/icon-256.png)

> **Documentation:** the [`documentation/`](documentation/) folder explains the program from the inside, what each part of the interface does, the catalog of 50 effects, zones and profiles, and how to develop.

---

## What it does

- **50 ready-to-use effects**, organized into 6 categories (more than OpenRGB offers).
- **Visual effect authoring**: pick a pattern, a gradient, and adjust parameters with sliders — no scripting, no timeline.
- **Multi-stop gradients** with RGB or HSV interpolation, editable by dragging stops.
- **Live preview** identical to what goes out to the hardware (the preview consumes the same pixel buffer sent to the LEDs).
- **Profiles** saved in JSON, with the same schema on both systems — you can copy the file from one to the other.
- **Independent zones** (onboard LED + 3 ARGB headers), with an option for one zone to "follow" another, to **rename** each zone, and to **apply the same effect to all zones** at once.
- **Built-in help**: a **?** on each panel and on each parameter explains what that control does.
- **System tray** with quick light control.
- **Continuous conflict detection**: warns when another program (Armoury Crate, OpenRGB) is also controlling the same controller — even if it started after the app.
- **Diagnostic dashboard**: side navigation with Overview, System, Sensors, Disks, Network, Games, Bottleneck, Overlay and Integrations, in the monochrome Reset Explode look. Overview brings hardware, live limiter, disks, health, network and what needs attention on one screen; Integrations is the only one that still says what it will contain instead of showing an invented number.
- **Game overlay**: transparent, always-on-top window that ignores the mouse and does not appear on the taskbar. Shows FPS, frametime, 1% low and the sensors you choose; toggles with a global shortcut.

### Dashboard status

| Page | Status |
|---|---|
| Lighting | ready (original screen) |
| System | ready: OS, motherboard/BIOS, CPU, memory, GPU and physical disks |
| Sensors | ready: live reading (1 s), filters, min/max, history and the cooling card (pump and fan RPM) |
| Disks | ready: Units and Health tabs (S.M.A.R.T. / CIM) |
| Network | ready: latency, jitter, loss, DNS, speed and bufferbloat |
| Games | ready: offline base with 17 thousand games, measured or estimated FPS, with source and confidence ([methodology](documentation/jogos.md)) |
| Bottleneck | ready: GPU × CPU balance, live limiter and 1/3/5 min session |
| Overlay | ready: metrics over the game, global shortcut and choice of what to show; real FPS on Windows, "unavailable" on Linux |
| Overview | ready: hardware summary, live limiter, disks, health, network and shortcuts to what needs attention |
| Integrations | **not implemented**: the reason and the plan are in [documentation/planejamento-iluminacao-externa.md](documentation/planejamento-iluminacao-externa.md) |

The lighting router already exists and accepts other backends without touching the engine; OpenRGB, Razer and Corsair are for later, and the Integrations page is the only one that still has no content.


## Requirements

| | |
|---|---|
| Board | Any ASUS with the AURA USB controller (`0b05:19af`) |
| OS | Linux (x64) or Windows (x64) |
| Node | 20+ for development |

The AURA USB controller is present on ASUS boards from the X470/Z390 generation. It controls the 5V addressable headers and the onboard LEDs.

---

## Installation on Linux

### 1. Device access permission

The controller appears as a raw HID device. Without a udev rule, only root can open it.

The `.deb` installs the rule automatically during `dpkg -i`:

```bash
sudo dpkg -i release/my-rgb_0.2.0_amd64.deb
```

Then, **unplug and replug the controller cable** (or reboot) so the rule takes effect.

If you prefer to install the AppImage, or are installing manually, the rule is in `packaging/linux/udev/60-my-rgb.rules`:

```bash
sudo cp packaging/linux/udev/60-my-rgb.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
```

> If you already use OpenRGB, the rule `/etc/udev/rules.d/60-openrgb-asus.rules` does the same job — but MyRGB's rule is the one the project maintains.

### 2. Run

```bash
npm install
npm run dev          # development mode
```

To generate installers:

```bash
npm run build:linux  # AppImage + .deb in release/
```

## Installation on Windows

1. Install MyRGB (`MyRGB-<version>-setup.exe`).
2. **Disable Armoury Crate / Aura Sync lighting** — see [documentation/windows.md](documentation/windows.md) for the step-by-step and to diagnose flickering.

The NSIS installer registers the Windows autostart entry when "Start with system" is enabled in MyRGB settings.

### FPS in the overlay

Real game FPS comes from a .NET helper (ETW) that needs administrator permission. It is started on demand: the first time you turn on the overlay (or FPS), Windows shows **one** UAC prompt; refusing does not break anything, the overlay continues showing sensors and the Overlay page says what was missing.

The installer only includes the helper if it has been generated before:

```bash
npm run build:helper     # needs .NET 8 SDK, on Windows
npm run build:win
```

Without the helper, the Overlay page shows "unavailable" and offers **Try again** — no FPS is invented.

---

## Using

| Action | How |
|---|---|
| Choose zone | Click the zone in the left bar |
| Choose effect | Pattern grid, grouped by category |
| Choose gradient | Selector at the top of the **Gradient** panel |
| Adjust | Sliders appear from the pattern parameters |
| Create gradient | Click on the gradient bar to add a stop; drag to move |
| Turn on/off | **Lights on** button in the top bar (preview keeps running) |
| Apply to all zones | **⇉ Apply to all zones** button at the top of the zones bar |
| Rename a zone | **✎** button on the zone card |
| Profiles | The profile is saved automatically on each change; **Save as…** creates a copy with another name; **✎** renames |

Each zone has its own effect. The eye/style button in the **Gradient** panel duplicates a palette so you can experiment without losing the original.

Every panel has a **?** that explains what it does, and each parameter has a **?** next to the label that explains that control. The complete effects catalog is in [documentation/efeitos.md](documentation/efeitos.md).

### The 50 effects

| Category | Effects |
|---|---|
| **Basics** | Solid · Gradient · Pulsing Gradient · Breathing · Fade · Color Cycle · Beat · Strobe · Fill |
| **Wave** | Wave · Double Wave · Interference · Water · Plasma · Pulse · Center Pulse · Ripples · Gradient Wave · Noise Map |
| **Motion** | Chase · Smooth Chase · Comet · Meteors · Rain · End to End · Scan · Tunnel · Spiral · Bouncing Ball · Visor · Marquee · Sinelon · Popcorn · Bubbles |
| **Atmosphere** | Aurora · Fire · Starfield · Sparkle · Dissolve · Fog · Lightning · Fireworks · Candle · Sunrise |
| **Spectrum** | Rainbow · Pulsing Rainbow · Hue Sweep |
| **Dots** | Dot Chase · Dot Hunt · Trail |

### About the number of LEDs

The controller **does not report** how many LEDs are on each addressable header — it depends on what you physically connected. That is why it is configurable per zone (number field in the zone bar). OpenRGB 1.0 does exactly the same, for the same reason. MyRGB's default is 72.

### If something goes wrong

The app writes a log at `<user data>/logs/my-rgb.log` (`~/.config/my-rgb/logs/` on Linux, `%APPDATA%\my-rgb\logs\` on Windows), with 2 MB rotation and three old files. In **⚙ Settings → Diagnostics** you can choose the level (errors only up to debug) and open the folder. Crash reports are in `logs/crash/` and **are never sent to any server**.

---

## Linux ↔ Windows parity proof

The effects engine is a pure function of `(time, profile)`: no pattern uses `Math.random` nor reads the clock. This allows recording the exact frames that would be sent to the hardware and comparing the files byte by byte.

```bash
# on Linux
npx electron . --dump-frames frames-linux --dump-count 60

# on Windows
MyRGB.exe --dump-frames frames-windows --dump-count 60

# compare (can be done on either machine)
node tools/compare-frames.mjs frames-linux frames-windows
```

Expected output:

```
IDENTICAL: 60 frames match byte for byte
```

Each `.bin` file contains the format header, the LED count per zone, and the RGB triplets of all LEDs. The `manifest.json` brings the profile used, to ensure both runs used the same configuration.

---

## Development

```bash
npm install          # installs and checks the node-hid native binary
npm run dev          # electron-vite dev
npm run typecheck    # tsc for both projects (node + web)
npm test             # vitest (318 tests, 18 files)
npm run build        # production build in out/
npm run build:helper # Windows FPS helper (needs .NET 8 SDK)
npm run selftest     # starts the packaged UI and checks pages, IPC and frames
```

### Tools

| Command | What for |
|---|---|
| `node tools/probe-aura.mjs` | Reads the hardware config table and shows the layout |
| `node tools/gen-icons.mjs` | Regenerates app and tray icons |
| `npm run games:data` | Downloads and normalizes the FPS database (PCGameBenchmarks + Open GPU Benchmarks) |
| `node tools/compare-frames.mjs <a> <b>` | Compares two frame dumps |
| `node tools/check-hid-binary.mjs` | Checks if the node-hid native binary exists for this platform |
| `npx electron . --write-test` | Writes a rainbow on all zones (hardware test) |
| `npx electron . --selftest` | Starts the UI and verifies it mounted and is receiving frames |

### The native binary

`node-hid` 3.x ships prebuilt binaries (N-API v4) for every platform MyRGB uses. N-API has a stable ABI, so the same binary works in Node and in Electron — **no compilation involved**:

```bash
npm run build:win:dir    # generates release/win-unpacked/ from Linux
```

The locally compiled native binary (`node_modules/node-hid/build`) is **excluded** from the package on purpose: at runtime `pkg-prebuilds` prefers that directory over the prebuilds, and it would contain the Linux binary inside the Windows installer. What goes in the package are only the prebuilds, each with the binary for the right platform.

### The Windows installer

The NSIS installer (`MyRGB-<version>-setup.exe`) needs to be generated **on Windows** or on a machine with `wine` installed: the NSIS target of electron-builder runs the freshly generated installer to extract the uninstaller, and that requires `wine` on Linux.

```bash
# on Windows
npm run build:win        # release/MyRGB-0.2.0-setup.exe
```

`build:win:dir` works on any system and is useful for checking packaging (asar structure, native binary, icons) before going to Windows.

The FPS helper enters as an extra resource (`resources/helper/MyRgb.Helper.exe`) when `helper/publish/win-x64/MyRgb.Helper.exe` exists. It is published separately with `npm run build:helper`, because it needs the .NET 8 SDK on Windows; the installer generated without it is still valid, just without FPS.

---

## Continuous integration

`.github/workflows/ci.yml` runs on two systems:

- **Linux**: `npm run typecheck`, the test suite (except `conflict.test.ts`, which reads real processes and is flaky on shared runners) and `npm run build`.
- **Windows**: `npm install`, `npm run build:helper` with .NET 8 and `npm run build:win:dir`. Finally, it checks that the generated package has `MyRGB.exe`, the helper in `resources/helper/`, `icon.png` and `tray.png`. This check prevents the package from shipping without icons again.

The NSIS installer itself is not generated in CI: it needs Windows (or `wine`) to extract the uninstaller.

---

## License and attribution

- [LICENSE](../LICENSE): MIT © 2026 ClecioSousa00.
- [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md): the MIT text from Reset Explode, the attribution sentence, the derived files table, runtime dependencies and their licenses, and the note about the AURA protocol (reimplemented from behavior, without OpenRGB code).
- Every file derived from Reset carries the notice in its header.
