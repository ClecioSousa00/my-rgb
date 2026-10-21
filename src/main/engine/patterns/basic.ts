/**
 * Basic patterns - the foundation every other pattern builds on.
 */

import type { Pattern } from '../types'
import { lerp, wrap01 } from './helpers'

const RATE = {
  key: 'rate',
  label: 'Velocidade',
  type: 'number' as const,
  min: 0.05,
  max: 4,
  step: 0.05,
  default: 1
}

export const basicPatterns: Pattern[] = [
  {
    id: 'solid',
    name: 'Sólido',
    category: 'Básicos',
    description: 'Uma cor única, retirada do gradiente numa posição fixa.',
    params: [
      {
        key: 'point',
        label: 'Ponto do gradiente',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0
      }
    ],
    render: (ctx) => ({ u: Number(ctx.params.point ?? 0) })
  },
  {
    id: 'gradient',
    name: 'Gradiente',
    category: 'Básicos',
    description: 'O gradiente estendido ao longo de toda a fita.',
    params: [
      {
        key: 'spread',
        label: 'Repetições',
        type: 'number',
        min: 0.25,
        max: 6,
        step: 0.25,
        default: 1
      }
    ],
    render: (ctx) => ({ u: wrap01(ctx.position * Number(ctx.params.spread ?? 1)) })
  },
  {
    id: 'gradient-pulse',
    name: 'Gradiente pulsante',
    category: 'Básicos',
    description: 'Gradiente fixo com respiração de intensidade.',
    params: [
      RATE,
      {
        key: 'depth',
        label: 'Intensidade da pulsação',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.7
      }
    ],
    render: (ctx) => {
      const wave = 0.5 + 0.5 * Math.sin(ctx.time * Number(ctx.params.rate ?? 1) * Math.PI * 2)
      const depth = Number(ctx.params.depth ?? 0.7)
      return {
        u: ctx.position,
        intensity: lerp(1, 0.12 + 0.88 * wave, depth)
      }
    }
  },
  {
    id: 'breathe',
    name: 'Respiração',
    category: 'Básicos',
    description: 'Cor fixa que expande e contrai suavemente.',
    params: [
      RATE,
      {
        key: 'floor',
        label: 'Brilho mínimo',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.08
      }
    ],
    render: (ctx) => {
      const wave = 0.5 + 0.5 * Math.sin(ctx.time * Number(ctx.params.rate ?? 1) * Math.PI * 2)
      const floor = Number(ctx.params.floor ?? 0.08)
      return {
        u: Number(ctx.params.point ?? 0),
        intensity: floor + (1 - floor) * wave
      }
    }
  },
  {
    id: 'fade',
    name: 'Fade',
    category: 'Básicos',
    description: 'Percorre o gradiente ida e volta, sem movimento espacial.',
    params: [
      RATE,
      {
        key: 'point',
        label: 'Ponto do gradiente',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0
      }
    ],
    render: (ctx) => {
      const phase = 0.5 + 0.5 * Math.sin(ctx.time * Number(ctx.params.rate ?? 1) * Math.PI * 2)
      const point = Number(ctx.params.point ?? 0)
      return { u: wrap01(point + phase) }
    }
  },
  {
    id: 'color-cycle',
    name: 'Ciclo de cores',
    category: 'Básicos',
    description: 'Percorre todo o gradiente em ciclo contínuo.',
    params: [RATE],
    render: (ctx) => ({ u: wrap01(ctx.time * Number(ctx.params.rate ?? 1)) })
  }
]
