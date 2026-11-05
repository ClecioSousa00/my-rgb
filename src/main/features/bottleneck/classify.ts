/**
 * The bottleneck rules.
 *
 * A direct port of `BottleneckAnalyzer`: the order of the checks, the
 * thresholds and the texts are the original ones. The only difference is the
 * source of the thermal flag, which the caller fills in (the Reset reads NVML
 * throttle bits, the app approximates them from the GPU temperature).
 *
 * Kept free of I/O so the fixtures in `tests/bottleneck.test.ts` can pin every
 * boundary: this is the part that has to behave exactly like the Windows app.
 *
 * Derived in part from the Reset Explode
 * (https://github.com/GustavoReset/ResetExplode), MIT © 2026 Gustavo.

 */

import type { BottleneckLimiter, LoadSample } from '@shared/features/bottleneck'

/** Nullable comparison: an absent reading never crosses a threshold. */
function atLeast(value: number | undefined, limit: number): boolean {
  return value !== undefined && value >= limit
}

/**
 * Rules, in order: VRAM full → thermal → GPU ≥ 90 % (normal in a heavy game) →
 * CPU/core ≥ 85 % → RAM full → nothing at the limit (frame cap, V-Sync, menu).
 *
 * The order is deliberate. A full VRAM stutters even with the GPU at 99 %, and
 * a thermal slowdown explains a clock below the expected one even when the
 * load is ordinary.
 */
export function classify(sample: LoadSample): BottleneckLimiter {
  if (atLeast(sample.vramPct, 97)) return 'vram'
  if (sample.gpuThermalCap === true || atLeast(sample.cpuTemp, 95)) return 'thermal'
  if (atLeast(sample.gpuLoad, 90)) return 'gpu'
  if (atLeast(sample.cpuMaxCore, 85) || atLeast(sample.cpuTotal, 85)) return 'cpu'
  if (atLeast(sample.ramPct, 92)) return 'ram'
  return 'capped'
}

const TITLES: Record<BottleneckLimiter, string> = {
  gpu: 'GPU no limite',
  cpu: 'Gargalo de CPU',
  vram: 'Memória de vídeo cheia',
  ram: 'Memória RAM cheia',
  thermal: 'Limitado por temperatura',
  capped: 'Nada no limite'
}

const ADVICE: Record<BottleneckLimiter, string> = {
  gpu:
    'Normal em jogos pesados: a placa de vídeo está sendo bem aproveitada. Para mais FPS, reduza ' +
    'resolução ou qualidade gráfica, ou ative DLSS/FSR.',
  cpu:
    'A CPU (ou um núcleo dela) não acompanha a GPU. Subir resolução/gráficos quase não custa FPS. ' +
    'Para ganhar FPS: reduza opções que pesam na CPU (distância de visão, multidões, física), feche ' +
    'programas em segundo plano e confira se o XMP/EXPO da RAM está ativo na BIOS.',
  vram:
    'A memória da placa de vídeo encheu, o que causa travadas. Reduza a qualidade das texturas ' +
    'ou a resolução.',
  ram:
    'Pouca RAM livre: o sistema passa a usar o disco e o jogo engasga. Feche navegadores e outros ' +
    'programas.',
  thermal:
    'Temperatura alta está derrubando o clock. Verifique ventilação do gabinete, poeira e pasta ' +
    'térmica.',
  capped:
    'Nem CPU nem GPU estão no limite: provavelmente há trava de FPS, V-Sync/G-Sync limitando, ou o ' +
    'jogo está em menu/pausa. Normal se o FPS já é o desejado.'
}

export function title(limiter: BottleneckLimiter): string {
  return TITLES[limiter]
}

export function advice(limiter: BottleneckLimiter): string {
  return ADVICE[limiter]
}

/**
 * Theoretical balance from the relative performance indices (GPU: RTX 4070 =
 * 100; CPU: Ryzen 7 7700X = 100).
 *
 * The five bands and their sentences are the original ones. They describe the
 * same hardware at different resolutions: a CPU much stronger than the GPU is
 * the ideal pairing, the opposite is a permanent GPU cap.
 */
export function balance(gpuIndex: number, cpuIndex: number): { ratio: number; text: string } {
  const ratio = cpuIndex > 0 ? gpuIndex / cpuIndex : 0

  let text: string
  if (ratio > 1.8) {
    text =
      'GPU muito mais forte que a CPU: em boa parte dos jogos a CPU vai limitar o FPS, ' +
      'principalmente em 1080p.'
  } else if (ratio > 1.3) {
    text =
      'GPU um pouco à frente da CPU: jogos competitivos em 1080p tendem a ficar limitados pela ' +
      'CPU; em 1440p/4K a GPU volta a ser o limite.'
  } else if (ratio >= 0.7) {
    text = 'Hardware equilibrado: na maioria dos jogos a GPU será o limite, que é o cenário ideal.'
  } else if (ratio > 0.4) {
    text =
      'CPU mais forte que a GPU: a placa de vídeo é o limite. Upgrade de GPU traria o maior ganho.'
  } else {
    text = 'GPU muito fraca para esta CPU: a placa de vídeo limita quase tudo.'
  }

  return { ratio, text }
}
