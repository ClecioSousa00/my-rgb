/**
 * Atmosphere patterns - organic, noisy, softer looks.
 */

import type { Pattern } from '../types'
import { clamp, hash, noise2, pulse } from './helpers'
import { RATE } from './params'

export const atmospherePatterns: Pattern[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    category: 'Atmosfera',
    description: 'Cortinas de luz ondulante, como as auroras boreais.',
    params: [
      RATE,
      {
        key: 'layers',
        label: 'Camadas',
        type: 'number',
        min: 1,
        max: 6,
        step: 1,
        default: 3,
        description:
          'Quantas cortinas de luz se sobrepõem. Poucas dão uma aurora limpa; seis dão um céu cheio de camadas.'
      },
      {
        key: 'intensity',
        label: 'Intensidade',
        type: 'number',
        min: 0.1,
        max: 1,
        step: 0.01,
        default: 0.8,
        description: 'O brilho geral das cortinas. Valores baixo deixam tudo apagado.'
      }
    ],
    render: (ctx) => {
      const layers = Math.round(Number(ctx.params.layers ?? 3))
      const intensity = Number(ctx.params.intensity ?? 0.8)
      const rate = Number(ctx.params.rate ?? 1)
      let value = 0
      for (let i = 0; i < layers; i++) {
        const seed = hash(i * 23.7)
        const center =
          0.5 + 0.42 * Math.sin(ctx.time * rate * (0.12 + seed * 0.12) + seed * 10)
        const width = 0.1 + 0.09 * hash(i + 11)
        value += pulse(ctx.position - center, width) * (0.55 + 0.45 * hash(i + 29))
      }
      value = clamp(value * intensity, 0, 1)
      return { u: value, intensity: 0.25 + 0.75 * value }
    }
  },
  {
    id: 'fire',
    name: 'Fogo',
    category: 'Atmosfera',
    description: 'Chamas subindo, com tremulação irregular.',
    params: [
      RATE,
      {
        key: 'scale',
        label: 'Escala',
        type: 'number',
        min: 1,
        max: 16,
        step: 0.5,
        default: 4,
        description: 'Tamanho das labaredas. Escala alta dá chamas miúdas; escala baixa, chamas grandes.'
      },
      {
        key: 'height',
        label: 'Altura',
        type: 'number',
        min: 0.2,
        max: 1,
        step: 0.01,
        default: 0.7,
        description:
          'O quanto a chama se estica pela fita. 1 deixa o fogo baixo e concentrado; valores baixos esticam a chama por quase toda a fita.'
      }
    ],
    render: (ctx) => {
      const scale = Number(ctx.params.scale ?? 4)
      const height = Number(ctx.params.height ?? 0.7)
      const rate = Number(ctx.params.rate ?? 1)
      const t = ctx.time * rate * 1.6
      const n = noise2(ctx.position * scale, -t)
      const n2 = noise2(ctx.position * scale * 2.3 + 11, -t * 1.8) * 0.4
      const heat = clamp((n + n2 + 1) * 0.5, 0, 1)
      const shaped = Math.pow(heat, 1 + (1 - height) * 3)
      return { u: shaped, intensity: 0.3 + 0.7 * shaped }
    }
  },
  {
    id: 'starfield',
    name: 'Campo de estrelas',
    category: 'Atmosfera',
    description: 'Estrelas que acendem e apagam aleatoriamente.',
    params: [
      RATE,
      {
        key: 'density',
        label: 'Densidade',
        type: 'number',
        min: 0.05,
        max: 1,
        step: 0.01,
        default: 0.25,
        description: 'Que fração da fita tem uma estrela acesa ao mesmo tempo.'
      },
      {
        key: 'twinkle',
        label: 'Cintilação',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.7,
        description:
          'O quanto as estrelas piscam. 0 deixa tudo aceso sem mudar; 1 faz cada estrela acender e apagar depressa.'
      }
    ],
    render: (ctx) => {
      const density = Number(ctx.params.density ?? 0.25)
      const twinkle = Number(ctx.params.twinkle ?? 0.7)
      const rate = Number(ctx.params.rate ?? 1)
      const cell = Math.floor(ctx.position * 60)
      const seed = hash(cell * 7.13)
      if (seed > density) return { u: 0, intensity: 0 }
      const phase = hash(cell * 3.7) * Math.PI * 2
      const v = 0.5 + 0.5 * Math.sin(ctx.time * rate * (1 + hash(cell) * 2) + phase)
      const brightness = lerp01(1 - twinkle, 1, v)
      return { u: brightness, intensity: brightness }
    }
  },
  {
    id: 'sparkle',
    name: 'Cintilação',
    category: 'Atmosfera',
    description: 'Pisca-pisca aleatório, como glitter.',
    params: [
      RATE,
      {
        key: 'density',
        label: 'Densidade',
        type: 'number',
        min: 0.02,
        max: 1,
        step: 0.01,
        default: 0.15,
        description: 'Que fração da fita pisca ao mesmo tempo.'
      }
    ],
    render: (ctx) => {
      const density = Number(ctx.params.density ?? 0.15)
      const rate = Number(ctx.params.rate ?? 1)
      const cell = Math.floor(ctx.position * 90)
      const seed = hash(cell * 13.7)
      if (seed > density) return { u: 0, intensity: 0 }
      const blink = Math.floor(ctx.time * rate * 4 + hash(cell * 5.1) * 10)
      const on = hash(cell * 9.3 + blink) > 0.45
      return on ? { u: 1, intensity: 1 } : { u: 0, intensity: 0 }
    }
  },
  {
    id: 'dissolve',
    name: 'Dissolve',
    category: 'Atmosfera',
    description: 'A cor se desfaz em fragmentos granulados.',
    params: [
      RATE,
      {
        key: 'grain',
        label: 'Granulação',
        type: 'number',
        min: 1,
        max: 40,
        step: 1,
        default: 12,
        description:
          'Quantos pedaços a fita é dividida. Poucos pedaços dão blocos grandes; muitos dão um grão fino.'
      }
    ],
    render: (ctx) => {
      const grain = Number(ctx.params.grain ?? 12)
      const rate = Number(ctx.params.rate ?? 1)
      const cell = Math.floor(ctx.position * grain)
      const v = hash(cell * 5.1 + Math.floor(ctx.time * rate * 3) * 0.37)
      return { u: v, intensity: 0.15 + 0.85 * v }
    }
  },
  {
    id: 'fog',
    name: 'Névoa',
    category: 'Atmosfera',
    description: 'Nuvens lentas e sobrepostas.',
    params: [
      RATE,
      {
        key: 'scale',
        label: 'Escala',
        type: 'number',
        min: 0.5,
        max: 12,
        step: 0.5,
        default: 2.5,
        description: 'Tamanho das nuvens. Escala baixa dá manchas largas e lentas.'
      }
    ],
    render: (ctx) => {
      const scale = Number(ctx.params.scale ?? 2.5)
      const rate = Number(ctx.params.rate ?? 1)
      const a = noise2(ctx.position * scale, ctx.time * rate * 0.3)
      const b = noise2(ctx.position * scale * 1.7 + 31, ctx.time * rate * 0.45)
      return { u: clamp(0.5 + 0.5 * (a * 0.6 + b * 0.4), 0, 1) }
    }
  }
]

function lerp01(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
