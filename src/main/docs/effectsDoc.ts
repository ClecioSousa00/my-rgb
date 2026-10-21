/**
 * Effect catalogue generator.
 *
 * The catalogue in documentation/efeitos.md is generated from the pattern
 * registry, so it can never drift from the code. `npm test` fails when the
 * file on disk is out of date, and `npm run docs` rewrites it.
 */

import { ALL_PATTERNS } from '../engine/patterns'
import { BUILTIN_PALETTES } from '../engine/palette'
import type { ParamSpec } from '@shared/types'

/** How a parameter value is written in the catalogue. */
function formatRange(spec: ParamSpec): string {
  if (spec.type === 'number') {
    const min = Number.isInteger(spec.min) ? spec.min : spec.min.toFixed(2)
    const max = Number.isInteger(spec.max) ? spec.max : spec.max.toFixed(2)
    return `${min} – ${max}`
  }
  if (spec.type === 'boolean') return 'ligado / desligado'
  return spec.options.map((o) => o.label).join(' | ')
}

function formatDefault(spec: ParamSpec): string {
  if (spec.type === 'number') {
    return Number.isInteger(spec.default) ? String(spec.default) : spec.default.toFixed(2)
  }
  if (spec.type === 'boolean') return spec.default ? 'ligado' : 'desligado'
  const option = spec.options.find((o) => o.value === spec.default)
  return option?.label ?? spec.default
}

function formatUnit(spec: ParamSpec): string {
  return spec.type === 'number' && spec.unit ? ` ${spec.unit}` : ''
}

/** One line per parameter, with the explanation that shows in the "?" tip. */
function formatParam(spec: ParamSpec): string {
  const label = `**${spec.label}** (\`${spec.key}\`, ${formatRange(spec)}${
    spec.type === 'number' ? formatUnit(spec) : ''
  }, padrão ${formatDefault(spec)})`
  return `- ${label} — ${spec.description ?? ''}`
}

/** The whole catalogue, as markdown. */
export function buildEffectsDoc(): string {
  const categories: string[] = []
  for (const pattern of ALL_PATTERNS) {
    if (!categories.includes(pattern.category)) categories.push(pattern.category)
  }

  const lines: string[] = []

  lines.push('# Efeitos')
  lines.push('')
  lines.push(
    '<!-- Arquivo gerado. Para atualizar: npm run docs. As mudanças feitas à mão são perdidas. -->'
  )
  lines.push('')
  lines.push(
    `O MyRGB tem **${ALL_PATTERNS.length} efeitos** em **${categories.length} categorias**. Cada efeito é um *padrão de movimento*: ele diz como a luz se distribui ao longo da fita. As cores vêm do gradiente, que é uma peça separada — por isso dá para combinar qualquer efeito com qualquer paleta.`
  )
  lines.push('')
  lines.push('## Como um efeito é montado')
  lines.push('')
  lines.push(
    'Um padrão recebe, para cada LED da fita, o seu índice, o total de LEDs da zona, a posição normalizada (0 no começo, 1 no fim), o tempo em segundos e os parâmetros que você ajustou. Ele devolve um número entre 0 e 1 — a posição no gradiente — e o MyRGB transforma esse número na cor.'
  )
  lines.push('')
  lines.push(
    'Isso significa que o mesmo efeito com gradientes diferentes dá resultados bem diferentes: "Onda" com o gradiente *Arco-íris* dá uma onda colorida, e com *Monocromático* dá uma onda que acende e apaga. Nenhum dos dois é "mais certo" que o outro.'
  )
  lines.push('')
  lines.push('## Resumo')
  lines.push('')
  lines.push('| Categoria | Efeitos |')
  lines.push('|---|---|')
  for (const category of categories) {
    const names = ALL_PATTERNS.filter((p) => p.category === category).map((p) => p.name)
    lines.push(`| **${category}** | ${names.join(' · ')} |`)
  }
  lines.push('')
  lines.push('## Paletas')
  lines.push('')
  lines.push(
    `As ${BUILTIN_PALETTES.length} paletas embutidas são gradientes multi-parada, com interpolação em RGB ou HSV. O botão ⧉ no painel **Gradiente** duplica a paleta escolhida, para você poder mexer sem perder a original.`
  )
  lines.push('')
  lines.push('| Paleta | Interpolação | Paradas |')
  lines.push('|---|---|---|')
  for (const palette of BUILTIN_PALETTES) {
    const stops = palette.stops
      .map((s) => `${Math.round(s.position * 100)}% ${s.color}`)
      .join(' · ')
    lines.push(`| ${palette.name} | ${palette.interpolation.toUpperCase()} | ${stops} |`)
  }
  lines.push('')

  for (const category of categories) {
    lines.push(`## ${category}`)
    lines.push('')
    for (const pattern of ALL_PATTERNS.filter((p) => p.category === category)) {
      lines.push(`### ${pattern.name} — \`${pattern.id}\``)
      lines.push('')
      lines.push(pattern.description)
      lines.push('')
      if (pattern.params.length === 0) {
        lines.push('_Este efeito não tem parâmetros._')
        lines.push('')
        continue
      }
      lines.push('**Parâmetros**')
      lines.push('')
      for (const spec of pattern.params) {
        lines.push(formatParam(spec))
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}
