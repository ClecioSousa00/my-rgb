/**
 * Resolving one game into one answer.
 *
 * Order of preference, from the plan:
 *
 * 1. a measured run for exactly this game, GPU, resolution, preset and
 *    upscaler - shown as measured, never recalculated;
 * 2. otherwise the public estimate, with the source's own factors, marked as
 *    an estimate and with its confidence reduced outside 1080p/High;
 * 3. otherwise no number at all ("dados insuficientes").
 *
 * Cross-GPU adaptation of a measured run is deliberately absent: the only
 * measured GPU in the shipped snapshot is one card, and its ray-traced /
 * upscaled runs cannot be scaled by a raster score without inventing a number.
 * The estimate already covers that ground and says it is one.
 */

import type {
  GameOptions,
  GameResult,
  GameUpscaling,
  GpuMatch
} from '@shared/features/games'
import { describeOptions, GAME_RESOLUTIONS, GAME_UPSCALING } from '@shared/features/games'
import type { Dataset, DatasetGame, MeasuredRun } from './dataset'
import { canonicalGpu, matchGpu } from './dataset'
import { capOf, estimateFps, isBaseOptions } from './estimate'

/** Index key: game + GPU + the three options. */
export function measuredKey(
  game: string,
  gpu: string,
  options: Pick<GameOptions, 'resolution' | 'preset' | 'upscaling'>
): string {
  return [game, canonicalGpu(gpu), options.resolution, options.preset, options.upscaling].join('|')
}

export function buildMeasuredIndex(dataset: Dataset): Map<string, MeasuredRun> {
  const index = new Map<string, MeasuredRun>()
  for (const run of dataset.measured) {
    // The measured source names the exact card ("... Founders Edition") while
    // the GPU table names the model ("GeForce RTX 5080"). Register both keys so
    // the run is found whichever spelling the hardware matching produced.
    const matched = matchGpu(dataset, run.gpu)
    const names = new Set([run.gpu, matched?.name].filter((name): name is string => Boolean(name)))
    for (const name of names) {
      index.set(measuredKey(run.game, name, run), run)
    }
  }
  return index
}

export interface ResolveInput {
  game: DatasetGame
  gpu?: GpuMatch
  options: GameOptions
}

function resolutionLabel(options: GameOptions): string {
  return GAME_RESOLUTIONS.find((item) => item.id === options.resolution)?.label ?? options.resolution
}

function upscalingLabel(upscaling: GameUpscaling): string {
  return GAME_UPSCALING.find((item) => item.id === upscaling)?.label ?? upscaling
}

function noData(input: ResolveInput, reason: string): GameResult {
  return {
    game: input.game.name,
    year: input.game.year,
    avg: null,
    low1: null,
    source: 'none',
    confidence: 'unknown',
    gpu: input.gpu?.name,
    explanation: reason,
    warnings: ['Nenhum valor foi estimado: a base não sustenta uma previsão para esta combinação.']
  }
}

/** Turn a dataset row into the answer the page shows. */
export function resolveGame(
  dataset: Dataset,
  index: Map<string, MeasuredRun>,
  input: ResolveInput
): GameResult {
  const { game, gpu, options } = input

  if (!gpu) {
    return noData(
      input,
      'A placa de vídeo não foi identificada na base; escolha o modelo manualmente para ver uma estimativa.'
    )
  }

  const measured = index.get(measuredKey(game.name, gpu.name, options))
  if (measured) {
    const warnings: string[] = []
    if (measured.samples === 1) {
      warnings.push('Uma única execução medida; outra partida pode variar.')
    }
    if (measured.low1 === null) {
      warnings.push('A execução não publicou o 1% low.')
    }

    return {
      game: game.name,
      year: game.year,
      avg: Math.round(measured.avg),
      low1: measured.low1 === null ? null : Math.round(measured.low1),
      source: 'measured',
      confidence: 'high',
      gpu: gpu.name,
      cpu: measured.cpu,
      sampleCount: measured.samples,
      sourceRef: measured.ref,
      explanation:
        `Média de ${measured.samples} execução${measured.samples > 1 ? 'ões' : ''} medida` +
        `${measured.samples > 1 ? 's' : ''} em ${gpu.name}` +
        `${measured.date ? ` em ${measured.date}` : ''}, em ${describeOptions(options)}.`,
      warnings
    }
  }

  const estimate = estimateFps(game, gpu.g3d, options, dataset.referenceGpus, dataset.sourceCap)

  if (!estimate) {
    const weakest = dataset.referenceGpus[0]
    const allCapped = dataset.referenceGpus.every(
      (_reference, position) => game.fps[position] >= capOf(game, dataset.sourceCap)
    )
    const reason = allCapped
      ? `A base só publica este jogo na trava de ${capOf(game, dataset.sourceCap)} FPS, ` +
        'o que não permite estimar outra configuração.'
      : gpu.g3d < weakest.g3d
        ? `A ${gpu.name} é mais fraca que a GPU de referência mínima da base (${weakest.name}).`
        : 'A base não tem dados suficientes para esta combinação.'
    return noData(input, reason)
  }

  const warnings: string[] = []
  const base = isBaseOptions(options)
  const isReference = dataset.referenceGpus.some((reference) => reference.g3d === gpu.g3d)

  if (!base) {
    warnings.push(
      'Resolução e preset ajustados a partir de 1080p/Alto pelos fatores que a fonte documenta.'
    )
  }
  if (options.upscaling !== 'Native') {
    warnings.push(
      `A base não modela DLSS/FSR: o número é de rasterização nativa, não de ${upscalingLabel(
        options.upscaling
      )}.`
    )
  }
  if (estimate.capped) {
    warnings.push(
      `Teto de ${capOf(game, dataset.sourceCap)} FPS aplicado, então o valor é um piso ("≥").`
    )
  }
  if (estimate.extrapolated) {
    warnings.push('Estimativa extrapolada além da GPU de referência mais rápida da base.')
  }
  if (!isReference) {
    warnings.push(`Interpolada entre as 12 GPUs de referência da base para a ${gpu.name}.`)
  }

  const explanation = estimate.published
    ? `A ${gpu.name} é uma das GPUs de referência; a base publica este valor para 1080p/Alto.`
    : base
      ? `Estimativa para a ${gpu.name} pelo score G3D (${gpu.g3d}), entre as GPUs de referência da base.`
      : `Estimativa para ${describeOptions(options)} a partir de 1080p/Alto: ${
          resolutionLabel(options)
        } e preset aplicados sobre a curva das GPUs de referência.`

  return {
    game: game.name,
    year: game.year,
    avg: Math.round(estimate.avg),
    // Never derived: a fixed percentage of the average would be a made-up
    // number, and the label would make it look measured.
    low1: null,
    source: 'estimated',
    confidence: estimate.confidence,
    gpu: gpu.name,
    cap: estimate.capped ? capOf(game, dataset.sourceCap) : undefined,
    explanation,
    warnings
  }
}
