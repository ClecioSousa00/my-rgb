/**
 * Session accumulation and report.
 *
 * A session is just a list of classified samples: the report is the
 * distribution of limiters over time plus the averages and peaks that explain
 * it. The original computes the same numbers in `BottleneckSession`; keeping
 * this pure means the whole report can be tested without a clock or a sensor.
 */

import type {
  BottleneckDistributionEntry,
  BottleneckLimiter,
  BottleneckSessionMinutes,
  BottleneckSessionReport,
  LoadSample
} from '@shared/features/bottleneck'
import { advice, title } from './classify'

export interface ClassifiedSample {
  sample: LoadSample
  limiter: BottleneckLimiter
}

export interface SessionInput {
  minutes: BottleneckSessionMinutes
  startedAt: number
  finishedAt: number
  samples: ClassifiedSample[]
}

function average(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value)
  )
  if (numbers.length === 0) return undefined
  return numbers.reduce((total, value) => total + value, 0) / numbers.length
}

function maximum(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value)
  )
  if (numbers.length === 0) return undefined
  return Math.max(...numbers)
}

/**
 * Limiter share over the session, most frequent first.
 *
 * Ties keep the order in which the limiter first appeared, which is what the
 * stable LINQ sort in the original does - so the same samples produce the same
 * order here and there.
 */
export function distribution(samples: ClassifiedSample[]): BottleneckDistributionEntry[] {
  const counts = new Map<BottleneckLimiter, number>()
  for (const entry of samples) {
    counts.set(entry.limiter, (counts.get(entry.limiter) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([limiter, count]) => ({
      limiter,
      title: title(limiter),
      percent: (100 * count) / Math.max(1, samples.length),
      samples: count
    }))
    .sort((a, b) => b.samples - a.samples)
}

/** The limiter with the most samples, or undefined for an empty session. */
export function leadingLimiter(samples: ClassifiedSample[]): BottleneckLimiter | undefined {
  return distribution(samples)[0]?.limiter
}

export function buildReport(input: SessionInput): BottleneckSessionReport {
  const { samples } = input
  const main = leadingLimiter(samples)

  return {
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMinutes: input.minutes,
    samples: samples.length,
    main,
    title: main ? title(main) : 'Sem amostras',
    advice: main
      ? advice(main)
      : 'Nenhuma amostra foi coletada durante a análise. Deixe o app aberto e o jogo em primeiro ' +
        'plano enquanto a sessão roda.',
    distribution: distribution(samples),
    avgGpuLoad: average(samples.map((entry) => entry.sample.gpuLoad)),
    avgCpuLoad: average(samples.map((entry) => entry.sample.cpuTotal)),
    avgCpuMaxCore: average(samples.map((entry) => entry.sample.cpuMaxCore)),
    maxVramPct: maximum(samples.map((entry) => entry.sample.vramPct)),
    maxRamPct: maximum(samples.map((entry) => entry.sample.ramPct)),
    maxGpuTemp: maximum(samples.map((entry) => entry.sample.gpuTemp)),
    maxCpuTemp: maximum(samples.map((entry) => entry.sample.cpuTemp)),
    // Only a real measurement counts; the overlay arrives in phase 7.
    avgFps: average(samples.map((entry) => (entry.sample.fps && entry.sample.fps > 0 ? entry.sample.fps : undefined)))
  }
}
