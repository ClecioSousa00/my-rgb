/**
 * Wave patterns - smooth, continuous movement along the strip.
 */

import type { Pattern } from '../types'
import { clamp, lerp, noise, wrap01 } from './helpers'
import { RATE } from './params'

export const wavePatterns: Pattern[] = [
  {
    id: 'wave',
    name: 'Onda',
    category: 'Ondulação',
    description: 'Onda senoidal que atravessa a fita.',
    params: [
      RATE,
      {
        key: 'wavelength',
        label: 'Comprimento de onda',
        type: 'number',
        min: 2,
        max: 144,
        step: 1,
        default: 16,
        unit: 'LEDs',
        description:
          'Quantos LEDs ocupa uma onda completa. Menor dá ondas curtas e agitadas; maior dá ondas largas e calmas.'
      },
      {
        key: 'amplitude',
        label: 'Amplitude',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 1,
        description:
          'O quanto a onda se afasta da cor do meio do gradiente. 0 deixa a fita com uma cor só.'
      },
      {
        key: 'sharpness',
        label: 'Definição',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0,
        description: '0 = onda suave, 1 = onda em picos'
      }
    ],
    render: (ctx) => {
      const wavelength = Math.max(1, Number(ctx.params.wavelength ?? 16))
      const amplitude = Number(ctx.params.amplitude ?? 1)
      const sharpness = Number(ctx.params.sharpness ?? 0)
      const phase =
        (ctx.position * ctx.ledCount * 2) / wavelength -
        ctx.time * Number(ctx.params.rate ?? 1) * 2
      let s = 0.5 + 0.5 * Math.sin(phase * Math.PI)
      if (sharpness > 0) s = lerp(s, Math.pow(s, 1 + sharpness * 6), sharpness)
      return { u: 0.5 + (s - 0.5) * amplitude }
    }
  },
  {
    id: 'wave-double',
    name: 'Onda dupla',
    category: 'Ondulação',
    description: 'Duas ondas cruzadas em direções opostas.',
    params: [
      RATE,
      {
        key: 'wavelength',
        label: 'Comprimento de onda',
        type: 'number',
        min: 2,
        max: 144,
        step: 1,
        default: 20,
        unit: 'LEDs',
        description:
          'Quantos LEDs ocupa uma onda completa em cada uma das duas direções.'
      },
      {
        key: 'separation',
        label: 'Separação',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        description:
          'O quanto as duas ondas se misturam. 0 mostra só a primeira; 0.5 mostra as duas em partes iguais; 1 junta as duas numa só.'
      }
    ],
    render: (ctx) => {
      const wavelength = Math.max(1, Number(ctx.params.wavelength ?? 20))
      const sep = Number(ctx.params.separation ?? 0.5)
      const rate = Number(ctx.params.rate ?? 1)
      const a = 0.5 + 0.5 * Math.sin(((ctx.position * ctx.ledCount * 2) / wavelength - ctx.time * rate * 2) * Math.PI)
      const b = 0.5 + 0.5 * Math.sin(((ctx.position * ctx.ledCount * 2) / wavelength + ctx.time * rate * 2) * Math.PI)
      return { u: lerp(a, b, sep) }
    }
  },
  {
    id: 'interference',
    name: 'Interferência',
    category: 'Ondulação',
    description: 'Ondas de frequências diferentes criam um padrão de moiré.',
    params: [
      RATE,
      {
        key: 'wavelength',
        label: 'Comprimento de onda',
        type: 'number',
        min: 2,
        max: 144,
        step: 1,
        default: 14,
        unit: 'LEDs',
        description: 'Quantos LEDs ocupa a onda mais lenta, que serve de base do desenho.'
      },
      {
        key: 'ratio',
        label: 'Razão de frequência',
        type: 'number',
        min: 0.2,
        max: 3,
        step: 0.05,
        default: 1.37,
        description:
          'Quantas vezes a segunda onda é mais rápida que a primeira. Razões como 1.5 ou 2 criam padrões geométricos; 2.5 e 3 ficam caóticas.'
      }
    ],
    render: (ctx) => {
      const wavelength = Math.max(1, Number(ctx.params.wavelength ?? 14))
      const ratio = Number(ctx.params.ratio ?? 1.37)
      const rate = Number(ctx.params.rate ?? 1)
      const base = (ctx.position * ctx.ledCount * 2) / wavelength - ctx.time * rate
      const a = Math.sin(base * Math.PI)
      const b = Math.sin(base * ratio * Math.PI)
      return { u: clamp(0.5 + 0.5 * (a * b), 0, 1) }
    }
  },
  {
    id: 'water',
    name: 'Água',
    category: 'Ondulação',
    description: 'Ondulação irregular, como ondas em um lago.',
    params: [
      RATE,
      {
        key: 'scale',
        label: 'Escala',
        type: 'number',
        min: 1,
        max: 24,
        step: 0.5,
        default: 6,
        description:
          'Tamanho das ondulações. Valores altos deixam a fita agitada; valores baixos deixam ondas largas.'
      },
      {
        key: 'depth',
        label: 'Profundidade',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.6,
        description:
          'O quanto as ondas mudam de cor. 0 deixa a fita com uma cor só; 1 faz as ondas aparecerem com todo o contraste do gradiente.'
      }
    ],
    render: (ctx) => {
      const scale = Number(ctx.params.scale ?? 6)
      const depth = Number(ctx.params.depth ?? 0.6)
      const n = noise(ctx.position * scale + ctx.time * Number(ctx.params.rate ?? 1) * 2)
      const detail = noise(ctx.position * scale * 2.7 + ctx.time * 3.1) * 0.35
      return { u: clamp(0.5 + 0.5 * (n + detail) * depth, 0, 1) }
    }
  },
  {
    id: 'plasma',
    name: 'Plasma',
    category: 'Ondulação',
    description: 'Soma de várias senoides, com aparência de plasma.',
    params: [
      RATE,
      {
        key: 'scale',
        label: 'Escala',
        type: 'number',
        min: 1,
        max: 20,
        step: 0.5,
        default: 5,
        description: 'Quantas ondas cabem na fita. Maior escala dá um desenho mais apertado.'
      },
      {
        key: 'complexity',
        label: 'Complexidade',
        type: 'number',
        min: 1,
        max: 6,
        step: 1,
        default: 3,
        description:
          'Quantas ondas são somadas para formar o plasma. Poucas dão formas simples; seis dão um desenho confuso e cheio de detalhes.'
      }
    ],
    render: (ctx) => {
      const scale = Number(ctx.params.scale ?? 5)
      const complexity = Math.round(Number(ctx.params.complexity ?? 3))
      const rate = Number(ctx.params.rate ?? 1)
      let v = 0
      for (let i = 0; i < complexity; i++) {
        const k = i + 1
        v += Math.sin(ctx.position * scale * k + ctx.time * rate * 2 * k)
      }
      return { u: clamp(0.5 + 0.5 * (v / complexity), 0, 1) }
    }
  },
  {
    id: 'pulse',
    name: 'Pulso',
    category: 'Ondulação',
    description: 'Onda circular que se expande a partir do início da fita.',
    params: [
      RATE,
      {
        key: 'width',
        label: 'Largura do pulso',
        type: 'number',
        min: 1,
        max: 72,
        step: 1,
        default: 14,
        unit: 'LEDs',
        description: 'Quantos LEDs tem a onda de luz que atravessa a fita.'
      }
    ],
    render: (ctx) => {
      const width = Number(ctx.params.width ?? 14)
      const travel = wrap01(ctx.time * Number(ctx.params.rate ?? 1) * 0.35) * (ctx.ledCount + width * 2)
      const d = ctx.position * ctx.ledCount - travel
      return { u: clamp(0.5 - 0.5 * (d / width), 0, 1) }
    }
  },
  {
    id: 'pulse-center',
    name: 'Pulso central',
    category: 'Ondulação',
    description: 'Respiração que nasce no centro da fita e se espalha.',
    params: [
      RATE,
      {
        key: 'width',
        label: 'Alcance',
        type: 'number',
        min: 0.1,
        max: 1,
        step: 0.01,
        default: 0.6,
        description:
          'Que parte da fita respira. 0.2 só o miolo acende; 1 a fita inteira acende ao mesmo tempo.'
      }
    ],
    render: (ctx) => {
      const width = Number(ctx.params.width ?? 0.6)
      const rate = Number(ctx.params.rate ?? 1)
      const wave = 0.5 + 0.5 * Math.sin(ctx.time * rate * Math.PI * 2)
      const d = Math.abs(ctx.position - 0.5) * 2
      const falloff = clamp(1 - d / Math.max(0.001, width), 0, 1)
      return { u: clamp(0.5 + (wave - 0.5) * falloff, 0, 1) }
    }
  }
]
