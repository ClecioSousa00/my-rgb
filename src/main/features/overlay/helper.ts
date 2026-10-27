/**
 * Bridge to the Windows helper.
 *
 * The helper measures FPS from ETW, which needs administrator rights. Electron
 * does not run elevated and must not, so the helper is started on demand with
 * `Start-Process -Verb RunAs` - one UAC prompt, and the user can refuse without
 * breaking anything. An elevated child does not inherit stdin/stdout, so the
 * JSON-lines protocol runs over a local named pipe instead: Electron is the
 * server, the helper connects back as a client.
 *
 * Everything is on demand: no helper process is alive until the overlay (or a
 * bottleneck session) asks for FPS, and a missing executable is a normal
 * capability, not an error.
 */

import { execFile } from 'child_process'
import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { createServer, type Server, type Socket } from 'net'
import { join } from 'path'

export interface HelperReply {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

/** One JSON object per line. Garbage (a driver message, a partial write) is ignored. */
export function parseHelperLine(line: string): HelperReply | null {
  const text = line.trim()
  if (!text.startsWith('{')) return null
  try {
    const parsed = JSON.parse(text) as {
      id?: unknown
      ok?: unknown
      result?: unknown
      error?: unknown
    }
    if (typeof parsed.id !== 'number' || !Number.isFinite(parsed.id)) return null
    return {
      id: parsed.id,
      ok: parsed.ok === true,
      result: parsed.result,
      error: typeof parsed.error === 'string' ? parsed.error : undefined
    }
  } catch {
    return null
  }
}

/** Where the packaged and development builds look for the helper. */
export function helperCandidates(appPath: string, resourcesPath: string): string[] {
  return [
    join(resourcesPath, 'helper', 'MyRgb.Helper.exe'),
    join(appPath, 'helper', 'publish', 'win-x64', 'MyRgb.Helper.exe'),
    join(process.cwd(), 'helper', 'publish', 'win-x64', 'MyRgb.Helper.exe')
  ]
}

export function findHelperPath(candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(candidate))
}

/** Windows named pipe path for the given name. */
export function helperPipePath(name: string): string {
  return `\\\\.\\pipe\\${name}`
}

export interface HelperBridgeOptions {
  executable: string
  /** How long to wait for UAC + the helper connecting. */
  connectTimeoutMs?: number
  /** Per-command timeout. */
  timeoutMs?: number
  /** Injected by the tests. */
  launch?: (executable: string, pipeName: string) => Promise<void>
  pipeName?: string
}

const CONNECT_TIMEOUT_MS = 30_000
const REQUEST_TIMEOUT_MS = 5_000

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Ask PowerShell to start the helper elevated.
 *
 * `Start-Process` returns as soon as the process is created; if the user
 * refuses the UAC prompt it exits with an error, which becomes the message the
 * page shows.
 */
function launchElevated(executable: string, pipeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const path = executable.replace(/'/g, "''")
    const script =
      `Start-Process -FilePath '${path}' ` +
      `-ArgumentList '--pipe','${pipeName}','--parent','${process.pid}' -Verb RunAs`
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', script],
      { windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }
        resolve()
      }
    )
  })
}

export class HelperBridge {
  private readonly options: HelperBridgeOptions
  private server: Server | null = null
  private socket: Socket | null = null
  private buffer = ''
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private connecting: Promise<void> | null = null
  private failure: string | null = null

  constructor(options: HelperBridgeOptions) {
    this.options = options
  }

  get connected(): boolean {
    return this.socket !== null
  }

  get error(): string | null {
    return this.failure
  }

  /** Listen, start the elevated helper and wait for it to connect. Idempotent. */
  async start(): Promise<void> {
    if (this.socket) return
    if (this.connecting) return this.connecting

    this.connecting = this.connect().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async connect(): Promise<void> {
    this.failure = null
    const pipeName = this.options.pipeName ?? `myrgb-helper-${randomBytes(6).toString('hex')}`
    const connectTimeout = this.options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS

    const server = await this.listen(pipeName)
    this.server = server

    const connected = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('O helper não conectou dentro do tempo esperado.'))
      }, connectTimeout)

      server.once('connection', (socket) => {
        clearTimeout(timer)
        this.attach(socket)
        resolve()
      })
    })
    // If the launch fails below, this promise is abandoned; the catch keeps
    // the timer's late rejection from becoming an unhandled rejection.
    void connected.catch(() => {})

    const launch = this.options.launch ?? launchElevated
    try {
      await launch(this.options.executable, pipeName)
    } catch (error) {
      this.teardown()
      throw new Error(`Não foi possível iniciar o helper: ${messageOf(error)}`)
    }

    try {
      await connected
    } catch (error) {
      this.teardown()
      throw error
    }

    // A ping proves the other side is speaking the same protocol before the
    // caller starts asking for frames.
    await this.request('ping')
  }

  private listen(pipeName: string): Promise<Server> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      const onError = (error: Error): void => {
        server.close()
        reject(new Error(`Não foi possível abrir o canal do helper: ${error.message}`))
      }
      server.once('error', onError)
      server.listen(helperPipePath(pipeName), () => {
        server.off('error', onError)
        resolve(server)
      })
    })
  }

  private attach(socket: Socket): void {
    this.socket = socket
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => this.onData(chunk))
    socket.on('error', (error) => this.fail(error.message))
    socket.on('close', () => this.fail('O helper encerrou a conexão.'))
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let index = this.buffer.indexOf('\n')
    while (index >= 0) {
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 1)
      const reply = parseHelperLine(line)
      if (reply) this.settle(reply)
      index = this.buffer.indexOf('\n')
    }
  }

  private settle(reply: HelperReply): void {
    const pending = this.pending.get(reply.id)
    if (!pending) return
    this.pending.delete(reply.id)
    clearTimeout(pending.timer)
    if (reply.ok) pending.resolve(reply.result)
    else pending.reject(new Error(reply.error ?? 'O helper recusou o comando.'))
  }

  private fail(reason: string): void {
    if (!this.failure) this.failure = reason
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
      this.pending.delete(id)
    }
    this.socket?.destroy()
    this.socket = null
  }

  async request<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!this.socket) {
      throw new Error(this.failure ?? 'O helper não está conectado.')
    }

    const id = this.nextId++
    const timeout = this.options.timeoutMs ?? REQUEST_TIMEOUT_MS
    const payload = `${JSON.stringify({ id, cmd, args })}\n`

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`O helper não respondeu a ${cmd} em ${timeout} ms.`))
      }, timeout)

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      })
      this.socket?.write(payload)
    })
  }

  /** Close the pipe and ask the helper to exit. Safe to call twice. */
  dispose(): void {
    if (this.socket) {
      try {
        this.socket.write(`${JSON.stringify({ id: 0, cmd: 'shutdown' })}\n`)
      } catch {
        // The pipe may already be gone; nothing else to do.
      }
    }
    this.socket?.destroy()
    this.socket = null
    this.server?.close()
    this.server = null
    for (const pending of this.pending.values()) clearTimeout(pending.timer)
    this.pending.clear()
  }

  private teardown(): void {
    this.server?.close()
    this.server = null
    this.socket?.destroy()
    this.socket = null
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
