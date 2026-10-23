/**
 * Pattern metadata tests.
 *
 * The UI is built from the pattern specs: the effect list, the sliders and
 * the "?" explanations all come from here. A parameter without a description
 * shows up in the interface as a slider nobody can understand, so every
 * parameter must carry one.
 */

import { describe, expect, it } from 'vitest'
import { ALL_PATTERNS, defaultParams, patternCategories, patternMetadata } from '@main/engine/patterns'

describe('pattern metadata', () => {
  it('ships 50 patterns', () => {
    expect(ALL_PATTERNS).toHaveLength(50)
  })

  it('gives every pattern a name, a category and a description', () => {
    for (const pattern of ALL_PATTERNS) {
      expect(pattern.name.trim().length, `${pattern.id} sem nome`).toBeGreaterThan(0)
      expect(pattern.category.trim().length, `${pattern.id} sem categoria`).toBeGreaterThan(0)
      expect(pattern.description.trim().length, `${pattern.id} sem descrição`).toBeGreaterThan(0)
    }
  })

  it('uses unique pattern ids', () => {
    const ids = ALL_PATTERNS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every parameter a label and a description', () => {
    const missing: string[] = []
    for (const pattern of ALL_PATTERNS) {
      for (const spec of pattern.params) {
        if (!spec.label.trim()) missing.push(`${pattern.id}/${spec.key} sem rótulo`)
        if (!spec.description?.trim()) missing.push(`${pattern.id}/${spec.key} sem descrição`)
      }
    }
    expect(missing).toEqual([])
  })

  it('uses unique parameter keys inside each pattern', () => {
    for (const pattern of ALL_PATTERNS) {
      const keys = pattern.params.map((p) => p.key)
      expect(new Set(keys).size, `${pattern.id} tem parâmetros repetidos`).toBe(keys.length)
    }
  })

  it('keeps the number parameters inside their range', () => {
    for (const pattern of ALL_PATTERNS) {
      for (const spec of pattern.params) {
        if (spec.type !== 'number') continue
        expect(spec.min, `${pattern.id}/${spec.key}`).toBeLessThan(spec.max)
        expect(spec.default, `${pattern.id}/${spec.key}`).toBeGreaterThanOrEqual(spec.min)
        expect(spec.default, `${pattern.id}/${spec.key}`).toBeLessThanOrEqual(spec.max)
      }
    }
  })

  it('sends the descriptions to the renderer', () => {
    const metadata = patternMetadata()
    expect(metadata).toHaveLength(50)
    for (const pattern of metadata) {
      for (const spec of pattern.params) {
        expect(spec.description, `${pattern.id}/${spec.key}`).toBeTruthy()
      }
    }
  })

  it('lists the categories in the order they appear', () => {
    const categories = patternCategories()
    expect(categories).toContain('Básicos')
    expect(categories).toContain('Movimento')
    expect(new Set(categories).size).toBe(categories.length)
  })

  it('defaults every parameter of a pattern', () => {
    for (const pattern of ALL_PATTERNS) {
      const defaults = defaultParams(pattern.id)
      for (const spec of pattern.params) {
        expect(defaults).toHaveProperty(spec.key)
      }
    }
  })
})
