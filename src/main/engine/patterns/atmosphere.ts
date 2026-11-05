/**
 * Atmosphere patterns - organic, noisy, softer looks.
 */

import type { Pattern } from '../types'
import { clamp, hash, noise, noise2, pulse, wrap01 } from './helpers'
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
  },
  {
    id: 'lightning',
    name: 'Relâmpago',
    category: 'Atmosfera',
    description: 'Clarões brancos rápidos e irregulares, como uma tempestade.',
    params: [
      RATE,
      {
        key: 'frequency',
        label: 'Frequência',
        type: 'number',
        min: 0.2,
        max: 4,
        step: 0.1,
        default: 1.2,
        unit: 'x/s',
        description:
          'Quantos relâmpagos por segundo, em média. Valores altos deixam a tempestade violenta.'
      },
      {
        key: 'background',
        label: 'Brilho do céu',
        type: 'number',
        min: 0,
        max: 0.3,
        step: 0.01,
        default: 0.04,
        description:
          'O brilho que fica entre os relâmpagos. 0 deixa a fita apagada até o próximo clarão.'
      }
    ],
    render: (ctx) => {
      const rate = Number(ctx.params.rate ?? 1)
      const frequency = Number(ctx.params.frequency ?? 1.2)
      const background = Number(ctx.params.background ?? 0.04)
      const t = ctx.time * rate * frequency
      const strike = Math.floor(t)
      const ft = t - strike
      const active = hash(strike * 3.7 + 1.3) > 0.3
      let flash = 0

      if (active) {
        const seed = hash(strike * 7.1)
        // A quick main flash followed by a weaker echo, like a real strike.
        flash = Math.exp(-ft * (10 + seed * 12))
        flash += 0.55 * Math.exp(-Math.pow((ft - 0.09 - seed * 0.08) * 14, 2))
      }

      const center = hash(strike * 5.3 + 9.1)
      const d = Math.abs(ctx.position - center) * 2
      const bolt = flash * (0.55 + 0.45 * Math.exp(-d * 3))

      return { u: 0.85, intensity: clamp(background + bolt, 0, 1) }
    }
  },
  {
    id: 'fireworks',
    name: 'Fogos de artifício',
    category: 'Atmosfera',
    description: 'Explosões que se abrem em anéis e caem apagando.',
    params: [
      RATE,
      {
        key: 'count',
        label: 'Quantidade',
        type: 'number',
        min: 1,
        max: 10,
        step: 1,
        default: 3,
        description: 'Quantos fogos existem ao mesmo tempo, cada um com seu próprio ritmo.'
      },
      {
        key: 'spread',
        label: 'Alcance da explosão',
        type: 'number',
        min: 0.1,
        max: 1,
        step: 0.01,
        default: 0.45,
        description:
          'Que parte da fita a explosão cobre até desaparecer. 1 toma a fita inteira.'
      }
    ],
    render: (ctx) => {
      const count = Math.round(Number(ctx.params.count ?? 3))
      const spread = Number(ctx.params.spread ?? 0.45)
      const rate = Number(ctx.params.rate ?? 1)
      const x = ctx.position * ctx.ledCount
      let best = 0
      let bestU = 0

      for (let i = 0; i < count; i++) {
        const seed = hash(i * 31.7 + 2.9)
        const period = 1.1 + seed * 1.9
        const local = (ctx.time * rate) / period + seed * 13
        const n = Math.floor(local)
        const ft = local - n

        // Leave some slots empty so the fireworks feel random.
        if (hash(n * 5.9 + i * 7.3) < 0.2) continue

        const center = hash(n * 3.3 + i * 11.1) * ctx.ledCount
        const radius = (1 - Math.pow(1 - ft, 2)) * spread * ctx.ledCount
        const ring = pulse(Math.abs(x - center) - radius, 2.2) * Math.pow(1 - ft, 1.8)

        if (ring > best) {
          best = ring
          bestU = hash(n * 7.7 + i * 2.3)
        }
      }

      return { u: bestU, intensity: clamp(best, 0, 1) }
    }
  },
  {
    id: 'candle',
    name: 'Vela',
    category: 'Atmosfera',
    description: 'Brilho quente e trêmulo, como a chama de uma vela.',
    params: [
      RATE,
      {
        key: 'flicker',
        label: 'Tremulação',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.55,
        description:
          'O quanto a chama oscila. 0 dá uma luz constante; 1 dá uma tremulação forte e irregular.'
      },
      {
        key: 'point',
        label: 'Ponto do gradiente',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.35,
        description:
          'Qual cor do gradiente a chama usa. Nos gradientes quentes, valores baixos ficam alaranjados.'
      }
    ],
    render: (ctx) => {
      const rate = Number(ctx.params.rate ?? 1)
      const flicker = Number(ctx.params.flicker ?? 0.55)
      const point = Number(ctx.params.point ?? 0.35)
      const slow = noise2(ctx.position * 2.5, ctx.time * rate * 1.7)
      const fast = noise2(ctx.position * 9 + 17, ctx.time * rate * 6.5)
      const gust = noise(ctx.time * rate * 0.55 + 4)
      const wobble = slow * 0.55 + fast * 0.3 + gust * 0.35
      const brightness = clamp(0.65 + wobble * flicker, 0.08, 1)

      return {
        u: clamp(point + wobble * 0.12 * flicker, 0, 1),
        intensity: brightness
      }
    }
  },
  {
    id: 'sunrise',
    name: 'Amanhecer',
    category: 'Atmosfera',
    description: 'A fita clareia devagar, atravessando o gradiente em minutos.',
    params: [
      RATE,
      {
        key: 'duration',
        label: 'Duração',
        type: 'number',
        min: 30,
        max: 900,
        step: 10,
        default: 240,
        unit: 's',
        description: 'Quantos segundos leva um ciclo completo, do escuro ao claro e de volta.'
      },
      {
        key: 'floor',
        label: 'Brilho mínimo',
        type: 'number',
        min: 0,
        max: 0.4,
        step: 0.01,
        default: 0.03,
        description:
          'O brilho no ponto mais escuro do ciclo. 0 deixa a fita apagar por completo antes de clarear de novo.'
      }
    ],
    render: (ctx) => {
      const rate = Number(ctx.params.rate ?? 1)
      const duration = Math.max(1, Number(ctx.params.duration ?? 240))
      const floor = Number(ctx.params.floor ?? 0.03)
      const phase = wrap01((ctx.time * rate) / duration)
      const smooth = phase * phase * (3 - 2 * phase)

      return { u: smooth, intensity: floor + (1 - floor) * smooth }
    }
  }
]

function lerp01(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
