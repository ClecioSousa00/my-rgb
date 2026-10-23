/**
 * Documentation tests.
 *
 * The effect catalogue is generated from the pattern registry, so the code and
 * the documentation cannot drift apart: if a pattern changes, the test fails
 * until documentation/efeitos.md is regenerated.
 *
 * The hand written pages are checked too - a broken link or a page that
 * disappeared would otherwise only show up when someone tried to follow it.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { buildEffectsDoc } from '@main/docs/effectsDoc'
import { ALL_PATTERNS } from '@main/engine/patterns'

const DOCS_DIR = join(process.cwd(), 'documentation')

function readDoc(name: string): string {
  return readFileSync(join(DOCS_DIR, name), 'utf8')
}

describe('documentation', () => {
  it('has the documentation folder', () => {
    expect(existsSync(DOCS_DIR)).toBe(true)
  })

  it('keeps the effect catalogue in sync with the code', () => {
    const onDisk = readDoc('efeitos.md')
    expect(onDisk).toBe(buildEffectsDoc())
  })

  it('documents every effect', () => {
    const onDisk = readDoc('efeitos.md')
    for (const pattern of ALL_PATTERNS) {
      expect(onDisk, `falta o efeito ${pattern.id}`).toContain(`### ${pattern.name} — \`${pattern.id}\``)
      expect(onDisk, `falta a descrição de ${pattern.id}`).toContain(pattern.description)
    }
  })

  it('documents every parameter of every effect', () => {
    const onDisk = readDoc('efeitos.md')
    for (const pattern of ALL_PATTERNS) {
      for (const spec of pattern.params) {
        expect(onDisk, `falta o parâmetro ${pattern.id}/${spec.key}`).toContain(`\`${spec.key}\``)
      }
    }
  })

  it('has an index that lists every page', () => {
    const index = readDoc('README.md')
    const pages = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')
    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      expect(index, `o índice não menciona ${page}`).toContain(page)
    }
  })

  it('has no broken links between the pages', () => {
    const pages = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'))
    for (const page of pages) {
      const content = readDoc(page)
      const links = [...content.matchAll(/\]\(([^)#:]+\.md)\)/g)].map((m) => m[1])
      for (const link of links) {
        expect(existsSync(join(DOCS_DIR, link)), `${page} aponta para ${link}, que não existe`).toBe(true)
      }
    }
  })

  it('keeps the README pointing at the documentation folder', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')
    expect(readme).toContain('documentation/')
  })
})
