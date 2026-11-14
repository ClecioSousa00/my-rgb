# MyRGB on Windows

Windows needs an extra step that Linux doesn't: **turn off Armoury Crate / Aura Sync**.

## Why this is necessary

Armoury Crate installs a service (`LightingService`) that holds the AURA USB controller and continuously writes frames to it. MyRGB writes frames to the same device. Two writers on the same controller = the hardware alternates between the two color sets, and you see **flickering**.

It's not possible to split control by zone: the protocol has no arbitration, and the Armoury Crate service rewrites the entire channel as soon as it detects activity.

The solution is to turn off Armoury Crate lighting and leave MyRGB as the sole controller owner.

## Step by step

### 1. Install MyRGB

Run `MyRGB-<version>-setup.exe`. The NSIS installer does not require administrator by default (installs in your user folder).

### 2. Turn off Armoury Crate lighting

1. Open **Armoury Crate**.
2. Go to **Devices → AURA**.
3. On each device with lighting, select **All off**.
4. Close Armoury Crate.

> If you never use Armoury Crate, you can uninstall it. But note: other Armoury Crate features (fan profiles, overclocking) depend on their own services — what MyRGB needs to turn off is just the **lighting**.

### 3. Turn off the lighting service (recommended)

To prevent Armoury Crate from reactivating lighting on its own, stop the lighting service. Open **PowerShell as Administrator**:

```powershell
Get-Service | Where-Object { $_.Name -like "*Lighting*" -or $_.DisplayName -like "*Aura*" }
```

If a `LightingService` (or `AsusOptimization`) service appears, stop it and disable automatic startup:

```powershell
Stop-Service -Name LightingService
Set-Service -Name LightingService -StartupType Disabled
```

> The exact service name varies between Armoury Crate versions. The command above lists what exists on your machine.

If you prefer not to disable the service, just kill it before opening MyRGB:

```powershell
Stop-Process -Name LightingService -Force -ErrorAction SilentlyContinue
```

### 4. Keep the AURA BIOS option enabled

The BIOS needs to keep AURA lighting enabled (the board default). If the option is off, the hardware won't light up the LEDs even receiving frames.

On your board: **Advanced → Onboard Devices → Aura** (exact name varies).

### 5. Verify

Open MyRGB. The top bar should show the controller firmware and the status **without** the conflict label.

The conflict check runs all the time (every 5 seconds), so if you open Armoury Crate after MyRGB is running, the **conflict** label appears in the top bar without restarting anything.

---

## Diagnosis

### Lights are flickering

1. Check if the lighting service is stopped:
   ```powershell
   Get-Process LightingService -ErrorAction SilentlyContinue
   ```
2. If it appears, Armoury Crate is still in command. Stop it.
3. If it doesn't appear and there's still flickering, another program is probably interfering (iCUE, RGB Fusion, an overlay). MyRGB shows a "conflict" warning in the top bar when it detects known processes.

### MyRGB doesn't find the device

- Check in Device Manager that "AURA LED Controller" appears. In `Device Manager → USB controllers`, it lists as a USB device with ID `VID_0B05&PID_19AF`.
- Close Armoury Crate completely (tray icon) and try again — it may keep the device handle open.
- Restart Windows after installing: sometimes the lighting service needs to be restarted to release the device.

### Lights don't turn on, but MyRGB says it's connected

- The AURA BIOS option may be disabled.
- If your board has **12V RGB** headers (4-pin, non-addressable) instead of **5V ARGB** headers (3-pin), those headers **are not** supported by this controller — the AURA USB only controls addressable ones and onboard LEDs. Your controller reports 2 12V headers and 3 5V headers, so use the 5V ones.

### How to confirm it's MyRGB controlling

Use the frame dump tool — it doesn't depend on what's running:

```powershell
MyRGB.exe --dump-frames frames-windows --dump-count 60
```

And compare with the Linux dump:

```powershell
node tools\compare-frames.mjs frames-linux frames-windows
```

Expected result: `IDENTICAL: 60 frames match byte for byte`.

---

## FPS and motherboard sensors

Real game FPS (the overlay and the Bottleneck session) and the motherboard
sensors (temperatures, fans and power draw on the Sensors page) come from the
.NET helper shipped with the installer. It needs administrator permission and
starts on demand: the first time you turn on the overlay, start a Bottleneck
session or open Sensors, Windows shows **one** UAC prompt.

Refusing it breaks nothing: the overlay still opens with FPS shown as `—`, and
the pages say what could not be read and offer **Try again**. No value is
invented. The helper is only included in the installer if
`npm run build:helper` ran before `npm run build:win` (see
[desenvolvimento.md](../desenvolvimento.md#o-helper-do-windows-fps-e-sensores),
in Portuguese).

---

## Portable installation

The NSIS installer is optional. To install without registration, extract the generated `.exe` with 7-Zip and run `MyRGB.exe` from inside the extracted folder. Autostart and tray work the same.
