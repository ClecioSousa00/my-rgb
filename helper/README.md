# MyRgb.Helper

Elevated sidecar used by the Windows overlay to read frame times from ETW,
the same source PresentMon uses. It exists because ETW sessions are
machine-wide and need administrator rights, and the app itself must not run
elevated.

## Protocol

One JSON object per line, both directions:

```json
{"id": 1, "cmd": "fps.start"}
{"id": 1, "ok": true, "result": {"running": true}}
{"id": 2, "cmd": "fps.poll"}
{"id": 2, "ok": true, "result": {"pid": 4242, "process": "Cyberpunk2077", "fps": 143.8, "frameTimeMs": 6.95, "low1Fps": 121.2, "recent": [6.9, 7.1]}}
{"id": 3, "cmd": "fps.poll"}
{"id": 3, "ok": true, "result": null}
```

Commands:

| Command     | Result                                                        |
| ----------- | ------------------------------------------------------------- |
| `ping`      | `{ pong, version, elevated, running }`                        |
| `fps.start` | `{ running: true }` or `ok: false` with the reason             |
| `fps.poll`  | Foreground game stats, or `null` when nothing is presenting   |
| `fps.stop`  | `{ running: false }`                                          |
| `fps.status`| `{ running, error, elevated }`                                |
| `shutdown`  | `{ stopped: true }` and the process exits                     |

`fps.poll` returns null when the foreground process presented fewer than
three frames in the last two seconds, so a menu or the desktop is not shown as
"0 FPS".

## Transports

- **`--pipe <name>`** (used by the app): connects to `\\.\pipe\<name>`, a
  server created by Electron. An elevated child does not inherit stdio, and a
  named pipe is the only practical channel across integrity levels.
- **no arguments** (used by hand): reads stdin, writes stdout.

`--parent <pid>` makes the helper exit when the app that started it dies.

## Build

Requires the .NET 8 SDK **on Windows** (TargetFramework is `net8.0-windows`).

```sh
npm run build:helper
```

It publishes a self-contained single file to `helper/publish/win-x64/`. The
app looks for it there in development, and `electron-builder` copies it to
`resources/helper/` in the installed app. Without the executable the overlay
still opens; it just shows no FPS, and the Overlay page explains that.
