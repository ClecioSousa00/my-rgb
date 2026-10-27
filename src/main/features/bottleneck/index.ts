/**
 * Bottleneck service.
 *
 * Fed by the same `SensorsStore` batch as the Sensores page - one collection
 * per second, shared by both pages. The page subscribes (`start`/`stop`), and
 * a running session holds an extra reference so the poll survives leaving the
 * page: closing the page in the middle of a three-minute analysis must not
 * freeze the sample count.
 *
 * A session ends when `now` passes the duration, either checked on the next
 * batch or by a safety timer. The timer is what closes the session when the
 * window is hidden and the poll is gated, and it is cleared on cancel, on
 * finish and on dispose - nothing is left behind.
 *
 * The last report lives in memory only; it is a diagnosis, not a document.
 */

import type { SensorsSnapshot } from '@shared/features/sensors'
import type { SystemSnapshot } from '@shared/features/system'
import type {
  BottleneckBalance,
  BottleneckLive,
  BottleneckSessionMinutes,
  BottleneckSessionProgress,
  BottleneckSessionReport,
  BottleneckSnapshot,
  BottleneckUpdate
} from '@shared/features/bottleneck'
import { normalizeSessionMinutes } from '@shared/features/bottleneck'
import { cpuPerf, gpuPerf, shortCpuName, shortGpuName } from '../games/catalog'
import { getSystem } from '../system/info'
import { balance, classify, title, advice } from './classify'
import { sampleFromReadings } from './sample'
import { buildReport, leadingLimiter, type ClassifiedSample } from './session'

/** The original fallbacks when a name is not in the reference tables. */
const DEFAULT_GPU_INDEX = 50
const DEFAULT_CPU_INDEX = 80

/** The poll is gated on window visibility; the grace lets the last batch land. */
const FINISH_GRACE_MS = 1200

/** The two calls the service needs from `SensorsStore` (a stub in the tests). */
export interface SensorSource {
  start(): void
  stop(): void
}

/** The two calls a bottleneck session needs from the FPS service. */
export interface FpsSource {
  start(): void
  stop(): void
  latest(): { fps: number } | null
}

export interface BottleneckServiceOptions {
  sensors: SensorSource
  /** Started while a session runs, so the report has a real average FPS. */
  fps?: FpsSource
  onUpdate: (update: BottleneckUpdate) => void
  onError?: (message: string) => void
  /** Injected by the tests. */
  now?: () => number
  /** Injected by the tests; `getSystem` is the default. */
  loadSystem?: () => Promise<SystemSnapshot>
  finishGraceMs?: number
}

interface SessionState {
  minutes: BottleneckSessionMinutes
  startedAt: number
  endsAt: number
  samples: ClassifiedSample[]
}

export class BottleneckService {
  private subscribers = 0
  private sessionHold = false
  private live: BottleneckLive | null = null
  private session: SessionState | null = null
  private lastReport: BottleneckSessionReport | null = null
  private timer: NodeJS.Timeout | null = null
  private balanceState: BottleneckBalance | null = null
  private balanceLoading: Promise<void> | null = null

  constructor(private readonly options: BottleneckServiceOptions) {}

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  /** Subscribe to the stream and return the current state. */
  async start(): Promise<BottleneckSnapshot> {
    this.subscribers++
    if (this.subscribers === 1) this.options.sensors.start()
    await this.ensureBalance()
    return this.snapshot()
  }

  /** Remove a subscriber; the poll stops when the last one leaves. */
  stop(): void {
    this.subscribers = Math.max(0, this.subscribers - 1)
    if (this.subscribers === 0 && !this.session) this.options.sensors.stop()
  }

  /** Start a session, keeping the poll alive even if the page is left. */
  startSession(minutes?: number): BottleneckSessionProgress {
    const duration = normalizeSessionMinutes(minutes)

    if (!this.session) {
      // A second reference: the page may unmount while the analysis runs.
      this.options.sensors.start()
      // The FPS helper is started only for the session (or earlier, by the
      // overlay) and released when it ends.
      this.options.fps?.start()
      this.sessionHold = true
    }

    const startedAt = this.now()
    this.session = {
      minutes: duration,
      startedAt,
      endsAt: startedAt + duration * 60_000,
      samples: []
    }
    this.armTimer()
    return this.progress()!
  }

  /** Cancel the running session and release its hold on the poll. */
  stopSession(): void {
    if (!this.session) return
    this.clearTimer()
    this.session = null
    this.releaseSessionHold()
  }

  /** Last finished session, or null. */
  report(): BottleneckSessionReport | null {
    return this.lastReport
  }

  snapshot(): BottleneckSnapshot {
    return {
      balance: this.balanceState ?? fallbackBalance(),
      live: this.live,
      session: this.progress(),
      report: this.lastReport
    }
  }

  /**
   * One sensor batch. Called by the main process for every collection,
   * including when only the session is holding the poll.
   */
  ingest(snapshot: SensorsSnapshot, fps?: number): void {
    if (this.subscribers === 0 && !this.session) return

    const { sample, notes } = sampleFromReadings(snapshot.readings)
    if (fps !== undefined && Number.isFinite(fps) && fps > 0) sample.fps = fps
    const limiter = classify(sample)
    this.live = {
      at: snapshot.at,
      limiter,
      title: title(limiter),
      advice: advice(limiter),
      sample,
      notes
    }

    let finished: BottleneckSessionReport | undefined
    if (this.session) {
      this.session.samples.push({ sample, limiter })
      if (this.now() >= this.session.endsAt) finished = this.finishSession()
    }

    if (this.subscribers === 0) return
    this.options.onUpdate({
      live: this.live,
      session: this.progress(),
      ...(finished ? { report: finished } : {})
    })
  }

  /** Clear the safety timer and subscriptions, for shutdown. */
  dispose(): void {
    this.subscribers = 0
    this.clearTimer()
    this.session = null
    this.releaseSessionHold()
  }

  private progress(): BottleneckSessionProgress | null {
    if (!this.session) return null
    const leading = leadingLimiter(this.session.samples)
    return {
      startedAt: this.session.startedAt,
      endsAt: this.session.endsAt,
      durationMinutes: this.session.minutes,
      samples: this.session.samples.length,
      ...(leading ? { leading } : {})
    }
  }

  private finishSession(): BottleneckSessionReport | undefined {
    const session = this.session
    if (!session) return undefined

    this.clearTimer()
    this.lastReport = buildReport({
      minutes: session.minutes,
      startedAt: session.startedAt,
      finishedAt: this.now(),
      samples: session.samples
    })
    this.session = null
    this.releaseSessionHold()
    return this.lastReport
  }

  private releaseSessionHold(): void {
    if (!this.sessionHold) return
    this.sessionHold = false
    this.options.fps?.stop()
    this.options.sensors.stop()
  }

  private armTimer(): void {
    this.clearTimer()
    if (!this.session) return

    const delay = Math.max(0, this.session.endsAt - this.now()) +
      (this.options.finishGraceMs ?? FINISH_GRACE_MS)

    this.timer = setTimeout(() => {
      this.timer = null
      const report = this.finishSession()
      if (!report || this.subscribers === 0) return
      this.options.onUpdate({ live: this.live ?? undefined, session: null, report })
    }, delay)
    // Do not keep the process alive for a report nobody will read.
    this.timer.unref?.()
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private async ensureBalance(): Promise<void> {
    if (this.balanceState) return
    if (!this.balanceLoading) {
      this.balanceLoading = this.loadBalance().finally(() => {
        this.balanceLoading = null
      })
    }
    await this.balanceLoading
  }

  private async loadBalance(): Promise<void> {
    let system: SystemSnapshot | null = null
    try {
      system = await (this.options.loadSystem ?? getSystem)()
    } catch (error) {
      this.options.onError?.(
        `Não foi possível ler o hardware: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const notes: string[] = []
    const cpuName = system?.cpu.brand?.trim() || 'Processador'
    const gpu = system?.gpus?.[0]
    const gpuName = gpu?.name?.trim() || 'Placa de vídeo'

    const cpuIndex = cpuPerf(cpuName)
    const gpuIndex = gpu ? gpuPerf(gpuName) : undefined
    const effectiveCpu = cpuIndex ?? DEFAULT_CPU_INDEX
    const effectiveGpu = gpuIndex ?? DEFAULT_GPU_INDEX

    if (cpuIndex === undefined) {
      notes.push(
        `O processador (${cpuName}) não está na tabela de referência; o equilíbrio usa o índice ` +
          `padrão ${DEFAULT_CPU_INDEX}, o mesmo do Reset Explode.`
      )
    }

    if (!gpu) {
      notes.push(
        `Nenhuma placa de vídeo foi detectada; o equilíbrio usa o índice padrão ` +
          `${DEFAULT_GPU_INDEX} e serve só como referência.`
      )
    } else if (gpuIndex === undefined) {
      notes.push(
        `A placa de vídeo (${gpuName}) não está na tabela de referência; o equilíbrio usa o índice ` +
          `padrão ${DEFAULT_GPU_INDEX} e serve só como referência.`
      )
    }

    const result = balance(effectiveGpu, effectiveCpu)
    this.balanceState = {
      ratio: result.ratio,
      text: result.text,
      cpu: {
        name: cpuName,
        short: shortCpuName(cpuName) || cpuName,
        index: effectiveCpu,
        fallback: cpuIndex === undefined
      },
      gpu: {
        name: gpuName,
        short: gpu ? shortGpuName(gpuName) || gpuName : '—',
        index: effectiveGpu,
        fallback: gpuIndex === undefined
      },
      notes
    }
  }
}

/** A usable balance even before the hardware read finishes. */
function fallbackBalance(): BottleneckBalance {
  const result = balance(DEFAULT_GPU_INDEX, DEFAULT_CPU_INDEX)
  return {
    ratio: result.ratio,
    text: result.text,
    cpu: {
      name: 'Processador',
      short: 'Processador',
      index: DEFAULT_CPU_INDEX,
      fallback: true
    },
    gpu: {
      name: 'Placa de vídeo',
      short: '—',
      index: DEFAULT_GPU_INDEX,
      fallback: true
    },
    notes: ['Lendo o hardware…']
  }
}
