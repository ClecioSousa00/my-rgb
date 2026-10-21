/**
 * Pattern registry.
 *
 * Adding a new effect is a single file plus one line here - the UI builds its
 * controls automatically from the pattern's parameter spec.
 */

import type { ParamValue, PatternMeta } from '@shared/types'
import type { Pattern } from '../types'
import { basicPatterns } from './basic'
import { wavePatterns } from './wave'
import { motionPatterns } from './motion'
import { atmospherePatterns } from './atmosphere'
import { spectrumPatterns } from './spectrum'
import { dotPatterns } from './dots'

export const ALL_PATTERNS: Pattern[] = [
  ...basicPatterns,
  ...wavePatterns,
  ...motionPatterns,
  ...atmospherePatterns,
  ...spectrumPatterns,
  ...dotPatterns
]

const PATTERN_MAP = new Map(ALL_PATTERNS.map((p) => [p.id, p]))

export function getPattern(id: string): Pattern | undefined {
  return PATTERN_MAP.get(id)
}

export function patternCategories(): string[] {
  const seen: string[] = []
  for (const p of ALL_PATTERNS) {
    if (!seen.includes(p.category)) seen.push(p.category)
  }
  return seen
}

/** Metadata sent to the renderer so it can build the controls. */
export function patternMetadata(): PatternMeta[] {
  return ALL_PATTERNS.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description,
    params: p.params
  }))
}

/** Default parameter values for a pattern, ready to be stored in a profile. */
export function defaultParams(patternId: string): Record<string, ParamValue> {
  const pattern = PATTERN_MAP.get(patternId)
  if (!pattern) return {}
  const out: Record<string, ParamValue> = {}
  for (const spec of pattern.params) out[spec.key] = spec.default
  return out
}

/** Merge stored parameters over the pattern defaults. */
export function resolveParams(
  patternId: string,
  stored: Record<string, ParamValue> | undefined
): Record<string, ParamValue> {
  const pattern = PATTERN_MAP.get(patternId)
  if (!pattern) return { ...(stored ?? {}) }
  const out: Record<string, ParamValue> = {}
  for (const spec of pattern.params) out[spec.key] = spec.default
  return { ...out, ...(stored ?? {}) }
}
