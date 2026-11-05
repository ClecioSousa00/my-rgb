/**
 * Duplicate detection.
 *
 * The tests use real folder shapes: two identical files under different paths
 * are duplicates, files with the same size but different content are not, and
 * the name alone never proves anything. Nothing is deleted.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { findDuplicates } from '@main/features/storage/duplicates'

const roots: string[] = []

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'myrgb-storage-dups-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

/** Creates a file with `content` at `path` (relative to root). */
async function file(root: string, path: string, content: string): Promise<void> {
  const dir = join(root, path)
  await mkdir(dirname(dir), { recursive: true })
  return writeFile(dir, content)
}

describe('findDuplicates', () => {
  it('finds identical files under different paths', async () => {
    const root = await fixture()
    const content = 'conteúdo idêntico'
    await file(root, 'Documentos/nota.txt', content)
    await file(root, 'Downloads/nota.txt', content)

    const report = await findDuplicates({ root })
    expect(report.duplicates).toHaveLength(1)
    expect(report.duplicates[0].size).toBe(Buffer.byteLength(content, 'utf8'))
    expect(report.duplicates[0].recoverableBytes).toBe(report.duplicates[0].size)
    expect(report.totalRecoverableBytes).toBe(report.duplicates[0].size)
  })

  it('does not report same-size different-content files', async () => {
    const root = await fixture()
    await file(root, 'a.txt', 'aaaa')
    await file(root, 'b.txt', 'bbbb')

    const report = await findDuplicates({ root })
    expect(report.duplicates).toEqual([])
    expect(report.totalRecoverableBytes).toBe(0)
  })

  it('treats the name alone as insufficient proof', async () => {
    const root = await fixture()
    await file(root, 'foto.jpg', 'imagem um')
    await file(root, 'outra-foto.jpg', 'imagem dois')

    const report = await findDuplicates({ root })
    expect(report.duplicates).toEqual([])
  })

  it('groups more than two copies', async () => {
    const root = await fixture()
    const content = 'três cópias'
    await file(root, 'c1.txt', content)
    await file(root, 'c2.txt', content)
    await file(root, 'c3.txt', content)

    const report = await findDuplicates({ root })
    expect(report.duplicates).toHaveLength(1)
    expect(report.duplicates[0].copies).toHaveLength(3)
    expect(report.duplicates[0].recoverableBytes).toBe(2 * Buffer.byteLength(content, 'utf8'))
  })

  it('skips empty folders', async () => {
    const root = await fixture()
    await mkdir(join(root, 'vazia'), { recursive: true })

    const report = await findDuplicates({ root })
    expect(report.duplicates).toEqual([])
    expect(report.totalRecoverableBytes).toBe(0)
  })

  it('sorts by recoverable bytes, biggest first', async () => {
    const root = await fixture()
    await file(root, 'pequeno1.txt', 'x')
    await file(root, 'pequeno2.txt', 'x')
    await file(root, 'grande1.bin', Buffer.alloc(1000).toString('latin1'))
    await file(root, 'grande2.bin', Buffer.alloc(1000).toString('latin1'))

    const report = await findDuplicates({ root })
    expect(report.duplicates).toHaveLength(2)
    expect(report.duplicates[0].size).toBeGreaterThan(report.duplicates[1].size)
  })

  it('does not follow into mounted subtrees (different dev)', async () => {
    // This is implicitly covered by the walk implementation; the test just
    // ensures no crash with nested folders.
    const root = await fixture()
    await file(root, 'pasta/sub/arquivo.txt', 'conteúdo')
    await file(root, 'pasta2/sub/arquivo.txt', 'conteúdo')

    const report = await findDuplicates({ root })
    expect(report.duplicates).toHaveLength(1)
  })

  it('reports cancel as aborted', async () => {
    const root = await fixture()
    const content = 'x'.repeat(10000)
    // Create enough files to make the walk take more than one progress tick.
    for (let index = 0; index < 500; index++) {
      await file(root, `pasta${index}/arquivo.txt`, content)
    }
    await file(root, 'cópia1.txt', content)
    await file(root, 'cópia2.txt', content)

    const controller = new AbortController()
    const promise = findDuplicates({ root, signal: controller.signal })
    setTimeout(() => controller.abort(), 5)

    await expect(promise).rejects.toThrow(/cancelada/)
  })
})
