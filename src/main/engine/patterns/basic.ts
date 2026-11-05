/**
 * Basic patterns - the foundation every other pattern builds on.
 */

import type { Pattern } from '../types'
import { lerp, wrap01 } from './helpers'
import { RATE } from './params'

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
        default: 0,
        description:
          'Qual cor do gradiente é usada. 0 é a primeira parada e 1 é a última; no meio fica a cor do meio.'
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
        default: 1,
        description:
          'Quantas vezes o gradiente cabe na fita. 1 mostra o gradiente inteiro uma vez; 2 mostra duas cópias.'
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
        default: 0.7,
        description:
          'O quanto a luz apaga e acende a cada ciclo. 0 mantém o brilho fixo; 1 faz a fita sumir e voltar.'
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
        key: 'point',
        label: 'Ponto do gradiente',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0,
        description:
          'Qual cor do gradiente respira. 0 é a primeira parada e 1 é a última; no meio fica a cor do meio.'
      },
      {
        key: 'floor',
        label: 'Brilho mínimo',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.08,
        description:
          'O ponto mais apagado do ciclo. 0 apaga de vez; acima de 0 a fita nunca chega a ficar preta.'
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
        default: 0,
        description:
          'De qual cor do gradiente a varredura parte. A cor muda ao longo do tempo, mas o ponto na fita é sempre o mesmo.'
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
  },
  {
    id: 'heartbeat',
    name: 'Batida',
    category: 'Básicos',
    description: 'Pulsação em dois tempos, como o batimento do coração.',
    params: [
      RATE,
      {
        key: 'point',
        label: 'Ponto do gradiente',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        description:
          'Qual cor do gradiente pulsa. 0 é a primeira parada e 1 é a última; no meio fica a cor do meio.'
      },
      {
        key: 'floor',
        label: 'Brilho mínimo',
        type: 'number',
        min: 0,
        max: 0.5,
        step: 0.01,
        default: 0.04,
        description:
          'O brilho que fica entre as batidas. 0 deixa a fita completamente apagada no intervalo.'
      },
      {
        key: 'rest',
        label: 'Pausa',
        type: 'number',
        min: 0,
        max: 0.7,
        step: 0.01,
        default: 0.42,
        description:
          'Fração de cada ciclo sem batida, como o intervalo de descanso entre um batimento e o próximo.'
      }
    ],
    render: (ctx) => {
      const rate = Number(ctx.params.rate ?? 1)
      const floor = Number(ctx.params.floor ?? 0.04)
      const rest = Number(ctx.params.rest ?? 0.42)
      const p = wrap01(ctx.time * rate * 1.1)
      const active = 1 - rest
      let beat = 0

      if (p < active) {
        const q = p / active
        // "lub" is the strong first thump, "dub" the weaker second one.
        const lub = Math.exp(-Math.pow((q - 0.12) / 0.13, 2) * 4)
        const dub = Math.exp(-Math.pow((q - 0.38) / 0.1, 2) * 4) * 0.7
        beat = Math.max(lub, dub)
      }

      return {
        u: Number(ctx.params.point ?? 0.5),
        intensity: floor + (1 - floor) * beat
      }
    }
  },
  {
    id: 'strobe',
    name: 'Estrobo',
    category: 'Básicos',
    description: 'Piscadas rápidas e regulares, com pausa entre os disparos.',
    params: [
      RATE,
      {
        key: 'point',
        label: 'Ponto do gradiente',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        description: 'Qual cor do gradiente aparece em cada piscada.'
      },
      {
        key: 'duty',
        label: 'Duração da piscada',
        type: 'number',
        min: 0.03,
        max: 0.6,
        step: 0.01,
        default: 0.18,
        description:
          'Quanto de cada ciclo fica aceso. Valores baixos dão flashes curtos; altos deixam quase tudo aceso.'
      },
      {
        key: 'spread',
        label: 'Variação de cor',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0,
        description:
          'O quanto a cor muda a cada piscada. 0 mantém sempre a mesma cor; 1 percorre o gradiente inteiro.'
      }
    ],
    render: (ctx) => {
      const rate = Number(ctx.params.rate ?? 1)
      const duty = Number(ctx.params.duty ?? 0.18)
      const spread = Number(ctx.params.spread ?? 0)
      const point = Number(ctx.params.point ?? 0.5)
      const cycle = ctx.time * rate * 2.4
      const phase = cycle - Math.floor(cycle)
      const on = phase < duty

      return {
        u: wrap01(point + Math.floor(cycle) * spread * 0.17),
        intensity: on ? 1 : 0
      }
    }
  },
  {
    id: 'fill',
    name: 'Preenchimento',
    category: 'Básicos',
    description: 'A cor preenche a fita LED a LED e depois se apaga.',
    params: [
      RATE,
      {
        key: 'point',
        label: 'Ponto do gradiente',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        description: 'Qual cor do gradiente preenche a fita.'
      },
      {
        key: 'background',
        label: 'Brilho do fundo',
        type: 'number',
        min: 0,
        max: 0.4,
        step: 0.01,
        default: 0.05,
        description:
          'O brilho da parte ainda não preenchida. 0 apaga de vez o resto da fita até a cor chegar.'
      },
      {
        key: 'mode',
        label: 'Movimento',
        type: 'select',
        default: 'wipe',
        options: [
          { value: 'wipe', label: 'Preencher e apagar' },
          { value: 'loop', label: 'Preencher e recomeçar' }
        ],
        description:
          'O que acontece quando o preenchimento chega ao fim: ele volta apagando ou recomeça do início de uma vez.'
      }
    ],
    render: (ctx) => {
      const rate = Number(ctx.params.rate ?? 1)
      const mode = String(ctx.params.mode ?? 'wipe')
      const point = Number(ctx.params.point ?? 0.5)
      const background = Number(ctx.params.background ?? 0.05)
      const phase = wrap01(ctx.time * rate * 0.22)
      const boundary = mode === 'loop' ? phase : phase < 0.5 ? phase * 2 : 2 - phase * 2
      const lit = ctx.position <= boundary

      return { u: point, intensity: lit ? 1 : background }
    }
  }
]
