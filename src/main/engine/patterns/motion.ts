/**
 * Motion patterns - light that travels along the strip.
 */

import type { Pattern } from '../types'
import { clamp, hash, lerp, pulse, wrap01 } from './helpers'
import { RATE } from './params'

export const motionPatterns: Pattern[] = [
  {
    id: 'chase',
    name: 'Chase',
    category: 'Movimento',
    description: 'Um bloco de cor que percorre a fita deixando um rastro.',
    params: [
      RATE,
      {
        key: 'size',
        label: 'Tamanho do bloco',
        type: 'number',
        min: 1,
        max: 72,
        step: 1,
        default: 8,
        unit: 'LEDs',
        description: 'Quantos LEDs tem o bloco de luz que corre pela fita.'
      },
      {
        key: 'trail',
        label: 'Comprimento do rastro',
        type: 'number',
        min: 0.2,
        max: 4,
        step: 0.05,
        default: 1,
        description:
          'O quanto o rastro se apaga atrás do bloco. Valores altos deixam um rabo longo e suave; valores baixos deixam o rastro curto e marcado.'
      }
    ],
    render: (ctx) => {
      const size = Math.max(1, Number(ctx.params.size ?? 8))
      const trail = Number(ctx.params.trail ?? 1)
      const head = wrap01(ctx.time * Number(ctx.params.rate ?? 1) * 0.25) * (ctx.ledCount + size)
      const d = head - ctx.position * ctx.ledCount
      let v = 0
      if (d >= 0 && d < size) v = Math.pow(1 - d / size, trail)
      return { u: v }
    }
  },
  {
    id: 'chase-soft',
    name: 'Chase suave',
    category: 'Movimento',
    description: 'Como o Chase, mas com transição contínua entre os blocos.',
    params: [
      RATE,
      {
        key: 'size',
        label: 'Tamanho do bloco',
        type: 'number',
        min: 1,
        max: 72,
        step: 1,
        default: 10,
        unit: 'LEDs',
        description: 'Quantos LEDs tem o bloco de luz que corre pela fita.'
      },
      {
        key: 'softness',
        label: 'Suavidade',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        description:
          'O quanto as bordas do bloco ficam suaves. 0 dá um bloco com corte seco; 1 dá uma transição contínua, sem nenhuma borda.'
      }
    ],
    render: (ctx) => {
      const size = Math.max(1, Number(ctx.params.size ?? 10))
      const softness = Number(ctx.params.softness ?? 0.5)
      const head = wrap01(ctx.time * Number(ctx.params.rate ?? 1) * 0.25) * (ctx.ledCount + size)
      const d = head - ctx.position * ctx.ledCount
      const hard = d >= 0 && d < size ? 1 - d / size : 0
      const soft = pulse(d, size) * 0.5
      return { u: clamp(lerp(hard, soft, softness), 0, 1) }
    }
  },
  {
    id: 'comet',
    name: 'Cometa',
    category: 'Movimento',
    description: 'Uma cabeça brilhante com cauda longa que desvanece.',
    params: [
      RATE,
      {
        key: 'head',
        label: 'Tamanho da cabeça',
        type: 'number',
        min: 1,
        max: 24,
        step: 1,
        default: 3,
        unit: 'LEDs',
        description: 'Quantos LEDs tem a parte mais brilhante da cometa.'
      },
      {
        key: 'tail',
        label: 'Comprimento da cauda',
        type: 'number',
        min: 2,
        max: 144,
        step: 1,
        default: 36,
        unit: 'LEDs',
        description: 'Quantos LEDs a cauda percorre antes de sumir.'
      }
    ],
    render: (ctx) => {
      const headSize = Math.max(1, Number(ctx.params.head ?? 3))
      const tail = Math.max(1, Number(ctx.params.tail ?? 36))
      const pos = wrap01(ctx.time * Number(ctx.params.rate ?? 1) * 0.2) * (ctx.ledCount + tail + headSize)
      const d = pos - ctx.position * ctx.ledCount
      let v = 0
      if (d >= 0 && d < headSize) v = 1
      else if (d >= headSize && d < headSize + tail) {
        v = Math.pow(1 - (d - headSize) / tail, 2.5) * 0.85
      }
      return { u: v }
    }
  },
  {
    id: 'meteor',
    name: 'Meteoros',
    category: 'Movimento',
    description: 'Vários meteoros independentes cruzando a fita.',
    params: [
      RATE,
      {
        key: 'count',
        label: 'Quantidade',
        type: 'number',
        min: 1,
        max: 12,
        step: 1,
        default: 3,
        description: 'Quantos meteoros correm ao mesmo tempo. Cada um tem sua própria velocidade.'
      },
      {
        key: 'tail',
        label: 'Comprimento do rastro',
        type: 'number',
        min: 2,
        max: 72,
        step: 1,
        default: 18,
        unit: 'LEDs',
        description: 'Quantos LEDs cada meteoro deixa para trás.'
      }
    ],
    render: (ctx) => {
      const count = Math.round(Number(ctx.params.count ?? 3))
      const tail = Number(ctx.params.tail ?? 18)
      const rate = Number(ctx.params.rate ?? 1)
      const x = ctx.position * ctx.ledCount
      let v = 0
      for (let i = 0; i < count; i++) {
        const seed = hash(i * 17.3)
        const speed = 0.12 + seed * 0.16
        const phase = wrap01(ctx.time * rate * speed + seed)
        const head = phase * (ctx.ledCount + tail * 2) - tail
        const d = x - head
        if (d >= 0 && d < tail) v = Math.max(v, Math.pow(1 - d / tail, 2))
      }
      return { u: v }
    }
  },
  {
    id: 'rain',
    name: 'Chuva',
    category: 'Movimento',
    description: 'Gotas que caem em posições aleatórias.',
    params: [
      RATE,
      {
        key: 'count',
        label: 'Quantidade de gotas',
        type: 'number',
        min: 1,
        max: 20,
        step: 1,
        default: 6,
        description: 'Quantas gotas caem ao mesmo tempo, cada uma em um ponto e uma velocidade diferentes.'
      },
      {
        key: 'width',
        label: 'Largura da gota',
        type: 'number',
        min: 0.5,
        max: 12,
        step: 0.5,
        default: 2,
        description: 'Quantos LEDs cada gota ocupa.'
      }
    ],
    render: (ctx) => {
      const count = Math.round(Number(ctx.params.count ?? 6))
      const width = Number(ctx.params.width ?? 2)
      const rate = Number(ctx.params.rate ?? 1)
      const x = ctx.position * ctx.ledCount
      let v = 0
      for (let i = 0; i < count; i++) {
        const seed = hash(i * 31.7 + 5)
        const speed = 0.25 + seed * 0.4
        const p = wrap01(seed + ctx.time * rate * speed)
        const drop = p * (ctx.ledCount + width * 4) - width * 2
        v = Math.max(v, pulse(x - drop, width))
      }
      return { u: v }
    }
  },
  {
    id: 'ping-pong',
    name: 'Ponta a ponta',
    category: 'Movimento',
    description: 'Um ponto que vai de uma ponta à outra e volta.',
    params: [
      RATE,
      {
        key: 'width',
        label: 'Largura do ponto',
        type: 'number',
        min: 1,
        max: 36,
        step: 1,
        default: 4,
        unit: 'LEDs',
        description: 'Quantos LEDs tem o ponto de luz que vai e volta.'
      }
    ],
    render: (ctx) => {
      const width = Number(ctx.params.width ?? 4)
      const phase = wrap01(ctx.time * Number(ctx.params.rate ?? 1) * 0.2)
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2
      const pos = tri * ctx.ledCount
      const d = ctx.position * ctx.ledCount - pos
      return { u: pulse(d, width) }
    }
  },
  {
    id: 'scan',
    name: 'Varredura',
    category: 'Movimento',
    description: 'Uma barra de luz que varre a fita de ponta a ponta.',
    params: [
      RATE,
      {
        key: 'width',
        label: 'Largura da barra',
        type: 'number',
        min: 1,
        max: 72,
        step: 1,
        default: 6,
        unit: 'LEDs',
        description: 'Quantos LEDs tem a barra de luz que percorre a fita.'
      }
    ],
    render: (ctx) => {
      const width = Number(ctx.params.width ?? 6)
      const pos = wrap01(ctx.time * Number(ctx.params.rate ?? 1) * 0.2) * (ctx.ledCount + width)
      const d = ctx.position * ctx.ledCount - pos
      return { u: pulse(d, width) }
    }
  },
  {
    id: 'tunnel',
    name: 'Túnel',
    category: 'Movimento',
    description: 'Perspectiva de túnel, como se os LEDs se aproximassem.',
    params: [
      RATE,
      {
        key: 'depth',
        label: 'Profundidade',
        type: 'number',
        min: 0.5,
        max: 8,
        step: 0.1,
        default: 2,
        description:
          'Quantas voltas o gradiente dá do centro até a ponta da fita. Mais profundidade deixa o túnel mais fechado.'
      }
    ],
    render: (ctx) => {
      const depth = Number(ctx.params.depth ?? 2)
      const d = Math.abs(ctx.position - 0.5) * 2
      const phase = (1 - d) * depth - ctx.time * Number(ctx.params.rate ?? 1) * 2
      return { u: wrap01(phase) }
    }
  },
  {
    id: 'spiral',
    name: 'Espiral',
    category: 'Movimento',
    description: 'Gradiente que gira ao longo da fita.',
    params: [
      RATE,
      {
        key: 'twist',
        label: 'Torção',
        type: 'number',
        min: 0,
        max: 8,
        step: 0.1,
        default: 1.5,
        description:
          'Quantas voltas o gradiente dá da ponta à outra. Valores altos deixam o desenho apertado.'
      }
    ],
    render: (ctx) => {
      const twist = Number(ctx.params.twist ?? 1.5)
      const phase = ctx.position * twist * 2 - ctx.time * Number(ctx.params.rate ?? 1)
      return { u: wrap01(phase) }
    }
  }
]
