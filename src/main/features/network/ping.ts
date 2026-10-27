/**
 * ICMP latency, through the system `ping`.
 *
 * Node cannot send ICMP without raw sockets (which need root), so the
 * diagnostic does what the Reset Explode does: one `ping` process per target,
 * reading the per-packet times from its output. That is also why the command
 * is checked first - a machine without `ping` gets an honest "sem dados"
 * instead of "sem internet".
 *
 * The output is parsed by the `time=` / `tempo=` token and only on lines that
 * also carry `TTL`. TTL is the one word Windows does not translate, and the
 * summary lines ("Minimum = 12ms") have no TTL, so they cannot pollute the
 * samples.
 */

import { execFile } from 'child_process'
import type { NetworkPingStat } from '@shared/features/network'

/** Windows relays one packet per second; Linux honors `-i 0.2`. */
const WINDOWS_INTERVAL_MS = 1000

export interface PingRun {
  /** Round trip times, in milliseconds, in arrival order. */
  times: number[]
  /** Packets the command was asked to send. */
  sent: number
}

let availability: Promise<boolean> | null = null

/** Whether the system has a usable `ping`. Cached for the process lifetime. */
export async function pingAvailable(): Promise<boolean> {
  if (availability) return availability
  availability = new Promise<boolean>((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which'
    execFile(finder, ['ping'], { timeout: 4000 }, (error) => resolve(!error))
  })
  return availability
}

/**
 * Times from a `ping` output.
 *
 * `time<1ms` becomes 1, the same floor the Reset Explode uses: a reply that
 * took less than a millisecond is still a reply.
 */
export function parsePingTimes(output: string): number[] {
  const times: number[] = []

  for (const line of output.split(/\r?\n/)) {
    if (!/ttl/i.test(line)) continue
    const match = line.match(/[=<]\s*([\d.,]+)\s*ms/i)
    if (!match) continue
    const value = Number(match[1].replace(',', '.'))
    if (!Number.isFinite(value)) continue
    times.push(Math.max(1, Math.round(value * 10) / 10))
  }

  return times
}

function pingArgs(address: string, count: number, intervalMs: number): string[] {
  if (process.platform === 'win32') {
    // `-w` is the per-packet timeout, `-n` the count; the interval is fixed.
    return ['-n', String(count), '-w', '1000', address]
  }
  const interval = Math.max(0.2, intervalMs / 1000)
  return ['-n', '-c', String(count), '-i', String(interval), '-W', '1', address]
}

/** How many packets a ping lasts, given the platform's interval. */
export function pingCountFor(durationMs: number, intervalMs: number): number {
  const interval = process.platform === 'win32' ? WINDOWS_INTERVAL_MS : intervalMs
  return Math.max(1, Math.ceil(durationMs / interval) + 1)
}

function runPing(
  address: string,
  count: number,
  intervalMs: number,
  signal?: AbortSignal
): Promise<string> {
  const interval = process.platform === 'win32' ? WINDOWS_INTERVAL_MS : intervalMs
  const timeoutMs = count * interval + 8000

  return new Promise((resolve, reject) => {
    execFile(
      'ping',
      pingArgs(address, count, intervalMs),
      { timeout: timeoutMs, signal, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (!error) {
          resolve(stdout)
          return
        }
        // A lost packet (or a killed process) still leaves usable replies on
        // stdout, and ping exits non-zero for both.
        const partial = stdout ?? ''
        const code = (error as { code?: string | number }).code
        if (code === 'ENOENT') {
          reject(new Error('O comando ping não está disponível neste sistema.'))
          return
        }
        resolve(partial)
      }
    )
  })
}

export interface PingOptions {
  count: number
  intervalMs: number
  signal?: AbortSignal
}

/** Send `count` packets and return the replies that came back. */
export async function pingHost(address: string, options: PingOptions): Promise<PingRun> {
  const output = await runPing(address, options.count, options.intervalMs, options.signal)
  return { times: parsePingTimes(output), sent: options.count }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Fold the replies into min/avg/max/jitter and the loss percentage. */
export function summarizePing(
  name: string,
  address: string,
  run: PingRun
): NetworkPingStat {
  const sent = Math.max(run.sent, run.times.length)
  const lost = Math.max(0, sent - run.times.length)
  const lossPercent = sent === 0 ? 0 : round1((100 * lost) / sent)

  if (run.times.length === 0) {
    return { name, address, sent, lost, lossPercent, answered: false }
  }

  let jitter = 0
  for (let i = 1; i < run.times.length; i++) {
    jitter += Math.abs(run.times[i] - run.times[i - 1])
  }
  jitter = run.times.length > 1 ? jitter / (run.times.length - 1) : 0

  return {
    name,
    address,
    sent,
    lost,
    lossPercent,
    answered: true,
    minMs: round1(Math.min(...run.times)),
    avgMs: round1(run.times.reduce((sum, value) => sum + value, 0) / run.times.length),
    maxMs: round1(Math.max(...run.times)),
    jitterMs: round1(jitter)
  }
}
