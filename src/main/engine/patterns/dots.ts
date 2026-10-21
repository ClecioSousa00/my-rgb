/**
 * Dot patterns - discrete points of light moving around.
 */

import type { Pattern } from '../types'
import { clamp, hash, pulse, wrap01 } from './helpers'

const RATE = {
  key: 'rate',
  label: 'Velocidade',
  type: 'number' as const,
  min: 0.05,
  max: 4,
  step: 0.05,
  default: 1
}

export const dotPatterns: Pattern[] = [
  {
    id: 'dot-chase',
    name: 'Dot chase',
    category: 'Pontos',
    description: 'Pontos equidistantes correndo pela fita.',
    params: [
      RATE,
      {
        key: 'dots',
        label: 'Quantidade de pontos',
        type: 'number',
        min: 1,
        max: 16,
        step: 1,
        default: 4
      },
      {
        key: 'width',
        label: 'Largura do ponto',
        type: 'number',
        min: 0.5,
        max: 12,
        step: 0.5,
        default: 1.5
      }
    ],
    render: (ctx) => {
      const dots = Math.max(1, Math.round(Number(ctx.params.dots ?? 4)))
      const width = Number(ctx.params.width ?? 1.5)
      const phase = wrap01(ctx.time * Number(ctx.params.rate ?? 1) * 0.15)
      const x = ctx.position * ctx.ledCount
      let v = 0
      for (let i = 0; i < dots; i++) {
        const p = wrap01(phase + i / dots)
        v = Math.max(v, pulse(x - p * ctx.ledCount, width))
      }
      return { u: v, intensity: v }
    }
  },
  {
    id: 'dot-hunt',
    name: 'Caça aos pontos',
    category: 'Pontos',
    description: 'Pontos que se movem e mudam de direção de forma imprevisível.',
    params: [
      RATE,
      {
        key: 'dots',
        label: 'Quantidade de pontos',
        type: 'number',
        min: 1,
        max: 10,
        step: 1,
        default: 3
      },
      {
        key: 'width',
        label: 'Largura do ponto',
        type: 'number',
        min: 0.5,
        max: 8,
        step: 0.5,
        default: 2
      }
    ],
    render: (ctx) => {
      const dots = Math.max(1, Math.round(Number(ctx.params.dots ?? 3)))
      const width = Number(ctx.params.width ?? 2)
      const rate = Number(ctx.params.rate ?? 1)
      const x = ctx.position * ctx.ledCount
      let v = 0
      for (let i = 0; i < dots; i++) {
        const seed = hash(i * 19.7)
        const step = Math.floor(ctx.time * rate * (0.5 + seed) + seed * 20)
        const from = hash(seed * 100 + step) * ctx.ledCount
        const to = hash(seed * 100 + step + 1) * ctx.ledCount
        const t = wrap01(ctx.time * rate * (0.5 + seed) + seed * 20)
        const eased = t * t * (3 - 2 * t)
        v = Math.max(v, pulse(x - (from + (to - from) * eased), width))
      }
      return { u: v, intensity: v }
    }
  },
  {
    id: 'trail',
    name: 'Rastro',
    category: 'Pontos',
    description: 'Um ponto que deixa um rastro suave que se dissipa.',
    params: [
      RATE,
      {
        key: 'width',
        label: 'Largura do rastro',
        type: 'number',
        min: 2,
        max: 72,
        step: 1,
        default: 20,
        unit: 'LEDs'
      }
    ],
    render: (ctx) => {
      const width = Number(ctx.params.width ?? 20)
      const head = wrap01(ctx.time * Number(ctx.params.rate ?? 1) * 0.2) * (ctx.ledCount + width)
      const d = head - ctx.position * ctx.ledCount
      let v = 0
      if (d >= 0 && d < width) v = Math.pow(1 - d / width, 2)
      return { u: clamp(v, 0, 1), intensity: 0.12 + 0.88 * v }
    }
  }
]
