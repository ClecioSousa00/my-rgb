/**
 * Download and upload, through Cloudflare's public speed endpoint.
 *
 * The same endpoints the Reset Explode uses (`speed.cloudflare.com`), with the
 * same method: several parallel streams for a fixed number of seconds, then
 * bytes * 8 / seconds. Measuring for a fixed time instead of waiting for a
 * fixed payload keeps a slow link from turning the page into a five minute
 * wait, and the parallel streams fill the link the way a real download does.
 *
 * Nothing is written to disk, and every request is aborted together with the
 * diagnostic (the page's "Cancelar").
 *
 * Derived in part from the Reset Explode
 * (https://github.com/GustavoReset/ResetExplode), MIT © 2026 Gustavo.

 */

const DOWN_URL = 'https://speed.cloudflare.com/__down?bytes=25000000'
const UP_URL = 'https://speed.cloudflare.com/__up'
const DOWNLOAD_STREAMS = 4
const UPLOAD_STREAMS = 3
const UPLOAD_PAYLOAD_BYTES = 1_000_000

const uploadPayload = Buffer.alloc(UPLOAD_PAYLOAD_BYTES, 0x5a)

/** The endpoint answered, but refused the measurement (429, 403...). */
export class SpeedTestError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SpeedTestError'
    this.status = status
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function abortError(): Error {
  const error = new Error('Diagnóstico cancelado')
  error.name = 'AbortError'
  return error
}

interface LinkedAbort {
  controller: AbortController
  dispose: () => void
}

/** An abort controller that follows the caller and also stops after `ms`. */
function linkedAbort(signal: AbortSignal | undefined, ms: number): LinkedAbort {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const forward = (): void => controller.abort()
  signal?.addEventListener('abort', forward)
  return {
    controller,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forward)
    }
  }
}

/**
 * Download throughput in Mbps, or `undefined` when nothing came through.
 *
 * A stream that fails is dropped; the others keep measuring, so one blocked
 * connection does not throw away the whole result.
 */
export async function measureDownload(
  seconds: number,
  signal?: AbortSignal
): Promise<number | undefined> {
  if (signal?.aborted) throw abortError()

  const { controller, dispose } = linkedAbort(signal, seconds * 1000)
  const started = performance.now()
  let bytes = 0
  let refused: number | undefined

  async function stream(): Promise<void> {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(DOWN_URL, { signal: controller.signal })
        if (!response.ok || !response.body) {
          refused ??= response.status
          return
        }

        const reader = response.body.getReader()
        while (!controller.signal.aborted) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value?.byteLength ?? 0
        }
        // The deadline can arrive between chunks; release the socket.
        await reader.cancel().catch(() => undefined)
      } catch {
        return
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: DOWNLOAD_STREAMS }, () => stream()))
  } finally {
    dispose()
  }

  if (signal?.aborted) throw abortError()
  if (bytes === 0) {
    // The server answered "no" (usually 429 after repeated tests). That is
    // different from an offline machine, and the page says which one it was.
    if (refused !== undefined) throw new SpeedTestError(`HTTP ${refused}`, refused)
    return undefined
  }

  const elapsed = (performance.now() - started) / 1000
  return elapsed > 0 ? round1((bytes * 8) / 1e6 / elapsed) : undefined
}

/** Upload throughput in Mbps, or `undefined` when nothing was accepted. */
export async function measureUpload(
  seconds: number,
  signal?: AbortSignal
): Promise<number | undefined> {
  if (signal?.aborted) throw abortError()

  const { controller, dispose } = linkedAbort(signal, seconds * 1000)
  const started = performance.now()
  let bytes = 0
  let refused: number | undefined

  async function stream(): Promise<void> {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(UP_URL, {
          method: 'POST',
          body: uploadPayload,
          signal: controller.signal
        })
        if (!response.ok) {
          refused ??= response.status
          return
        }
        // The payload was accepted; the body of the reply is irrelevant.
        bytes += uploadPayload.length
        await response.arrayBuffer()
      } catch {
        return
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: UPLOAD_STREAMS }, () => stream()))
  } finally {
    dispose()
  }

  if (signal?.aborted) throw abortError()
  if (bytes === 0) {
    if (refused !== undefined) throw new SpeedTestError(`HTTP ${refused}`, refused)
    return undefined
  }

  const elapsed = (performance.now() - started) / 1000
  return elapsed > 0 ? round1((bytes * 8) / 1e6 / elapsed) : undefined
}
