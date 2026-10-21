/**
 * Spectrum patterns - full hue sweeps across the gradient.
 */

import type { Pattern } from '../types'
import { clamp, wrap01 } from './helpers'
import { RATE } from './params'

export const spectrumPatterns: Pattern[] = [
  {
    id: 'rainbow',
    name: 'Arco-íris',
    category: 'Espectro',
    description: 'Todas as cores do gradiente lado a lado, rolando com o tempo.',
    params: [
      RATE,
      {
        key: 'spread',
        label: 'Repetições',
        type: 'number',
        min: 0.25,
        max: 8,
        step: 0.25,
        default: 1,
        description:
          'Quantas vezes o gradiente se repete na fita. Com 1 cada cor aparece uma vez; com 4 o arco-íris fica bem fechado.'
      }
    ],
    render: (ctx) => ({
      u: wrap01(ctx.position * Number(ctx.params.spread ?? 1) + ctx.time * Number(ctx.params.rate ?? 1) * 0.15)
    })
  },
  {
    id: 'rainbow-pulse',
    name: 'Arco-íris pulsante',
    category: 'Espectro',
    description: 'Arco-íris com respiração de brilho por cima.',
    params: [
      RATE,
      {
        key: 'spread',
        label: 'Repetições',
        type: 'number',
        min: 0.25,
        max: 8,
        step: 0.25,
        default: 1,
        description: 'Quantas vezes o gradiente se repete na fita.'
      },
      {
        key: 'depth',
        label: 'Intensidade da pulsação',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.6,
        description:
          'O quanto o brilho cai no fundo de cada ciclo. 0 mantém o arco-íris sempre igual; 1 faz a fita escurecer entre um ciclo e outro.'
      }
    ],
    render: (ctx) => {
      const wave = 0.5 + 0.5 * Math.sin(ctx.time * Number(ctx.params.rate ?? 1) * Math.PI * 2)
      const depth = Number(ctx.params.depth ?? 0.6)
      return {
        u: wrap01(ctx.position * Number(ctx.params.spread ?? 1) + ctx.time * 0.15),
        intensity: 1 - depth * 0.85 * (1 - wave)
      }
    }
  },
  {
    id: 'hue-sweep',
    name: 'Varredura de matiz',
    category: 'Espectro',
    description: 'Uma única cor que varre a fita, deixando rastro.',
    params: [
      RATE,
      {
        key: 'spread',
        label: 'Repetições',
        type: 'number',
        min: 0.25,
        max: 8,
        step: 0.25,
        default: 1,
        description:
          'Quantas vezes a varredura de cor se repete na fita. Acima de 1 mais de uma cor viaja junto.'
      }
    ],
    render: (ctx) => {
      const spread = Number(ctx.params.spread ?? 1)
      const head = wrap01(ctx.time * Number(ctx.params.rate ?? 1) * 0.2) * spread
      const d = ctx.position * spread - head
      const tail = 0.35
      const v = d >= 0 && d < tail ? 1 - d / tail : 0
      return { u: clamp(wrap01(head + v * 0.05), 0, 1), intensity: 0.1 + 0.9 * v }
    }
  }
]
