/**
 * Storage walk tests.
 *
 * These run against real folders built in a temporary directory: sparse files
 * for the sizes, a symlink, a hard link and a folder without permission. That
 * is the only way to check the two rules that silently break a disk analyser -
 * not following links and not counting the same inode twice.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { StorageAbortError, walkStorage } from '@main/features/storage/walk'
import type { StorageProgress } from '@shared/features/storage'

const MB = 1024 * 1024
const tempDirs: string[] = []
/** Folders that must get their permission back before the cleanup. */
const locked: string[] = []

afterEach(() => {
  for (const path of locked.splice(0)) {
    try {
      chmodSync(path, 0o755)
    } catch {
      /* already gone */
    }
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'myrgb-storage-'))
  tempDirs.push(dir)
  return dir
}

/** A sparse file: the size is real, the disk use is not. */
function file(path: string, bytes: number): void {
  writeFileSync(path, '')
  truncateSync(path, bytes)
}

/**
 *   root/
 *     a.txt            1 MB
 *     b.log            2 MB
 *     sub/
 *       c.bin          4 MB
 *       deep/
 *         d.dat      512 KB
 *     empty/
 */
function fixture(): string {
  const root = tempDir()
  file(join(root, 'a.txt'), 1 * MB)
  file(join(root, 'b.log'), 2 * MB)
  mkdirSync(join(root, 'sub', 'deep'), { recursive: true })
  file(join(root, 'sub', 'c.bin'), 4 * MB)
  file(join(root, 'sub', 'deep', 'd.dat'), 512 * 1024)
  mkdirSync(join(root, 'empty'))
  return root
}

describe('walkStorage', () => {
  it('adds up sizes, files and folders', async () => {
    const root = fixture()
    const report = await walkStorage({ root })

    expect(report.bytes).toBe(7.5 * MB)
    expect(report.files).toBe(4)
    expect(report.dirs).toBe(3)
    expect(report.root).toBe(root)
    expect(report.denied).toBe(0)
    expect(report.durationMs).toBeGreaterThanOrEqual(0)
    expect(report.notes).toEqual([])
  })

  it('builds a tree with the folder totals', async () => {
    const root = fixture()
    const { tree } = await walkStorage({ root })

    expect(tree.path).toBe(root)
    expect(tree.files).toBe(4)
    expect(tree.dirs).toBe(3)
    expect(tree.bytes).toBe(7.5 * MB)

    const sub = tree.children.find((child) => child.name === 'sub')
    expect(sub?.bytes).toBe(4.5 * MB)
    expect(sub?.files).toBe(2)
    expect(sub?.dirs).toBe(1)
    expect(sub?.mtimeMs).toBeTypeOf('number')

    const empty = tree.children.find((child) => child.name === 'empty')
    expect(empty?.bytes).toBe(0)
    expect(empty?.files).toBe(0)
  })

  it('ranks the largest files and keeps their extension and date', async () => {
    const root = fixture()
    const { topFiles } = await walkStorage({ root })

    expect(topFiles.map((entry) => entry.name)).toEqual(['c.bin', 'b.log', 'a.txt', 'd.dat'])
    const first = topFiles[0]
    expect(first.bytes).toBe(4 * MB)
    expect(first.path).toBe(join(root, 'sub', 'c.bin'))
    expect(first.ext).toBe('bin')
    expect(first.mtimeMs).toBeTypeOf('number')
  })

  it('keeps only the requested number of large files', async () => {
    const root = fixture()
    const { topFiles } = await walkStorage({ root, limits: { topFiles: 2 } })
    expect(topFiles).toHaveLength(2)
    expect(topFiles[0].bytes).toBeGreaterThanOrEqual(topFiles[1].bytes)
  })

  it('never follows a symlink, to a file or to a folder', async () => {
    const root = fixture()
    const before = await walkStorage({ root })

    symlinkSync(join(root, 'sub'), join(root, 'link-to-sub'), 'dir')
    symlinkSync(join(root, 'a.txt'), join(root, 'link-to-file'), 'file')

    const after = await walkStorage({ root })
    // The same bytes, not double: following the folder link alone would add
    // another 4.5 MB, and the file link another 1 MB.
    expect(after.bytes).toBe(before.bytes)
    expect(after.files).toBe(before.files)
    expect(after.links).toBe(2)
    expect(after.notes.join(' ')).toContain('não foram seguidos')
  })

  it('counts a hard-linked file once', async () => {
    const root = fixture()
    const before = await walkStorage({ root })

    linkSync(join(root, 'a.txt'), join(root, 'a-copy.txt'))
    const after = await walkStorage({ root })

    // Same inode: the disk does not hold two copies, so the total cannot grow.
    expect(after.bytes).toBe(before.bytes)
    expect(after.files).toBe(before.files)
    expect(after.hardLinks).toBe(1)
    expect(after.notes.join(' ')).toContain('hard link')
  })

  it('keeps going when a folder cannot be read', async () => {
    if (process.getuid?.() === 0) return // root reads everything
    const root = fixture()
    const lockedDir = join(root, 'private')
    mkdirSync(lockedDir)
    file(join(lockedDir, 'secret.bin'), 8 * MB)
    chmodSync(lockedDir, 0o000)
    locked.push(lockedDir)

    const report = await walkStorage({ root })
    expect(report.denied).toBeGreaterThanOrEqual(1)
    expect(report.deniedSamples).toContain(lockedDir)
    // The rest is still counted, and the total says it is incomplete.
    expect(report.bytes).toBe(7.5 * MB)
    expect(report.notes.join(' ')).toContain('sem permissão')
  })

  it('caps the children kept per folder but keeps the totals', async () => {
    const root = tempDir()
    for (let index = 0; index < 12; index += 1) {
      const dir = join(root, `folder-${String(index).padStart(2, '0')}`)
      mkdirSync(dir)
      file(join(dir, 'payload.bin'), (index + 1) * MB)
    }

    const report = await walkStorage({ root, limits: { maxChildren: 5 } })
    expect(report.tree.children).toHaveLength(5)
    expect(report.tree.more).toBe(true)
    // 1+2+...+12 MB
    expect(report.tree.bytes).toBe(78 * MB)
    // Biggest first.
    expect(report.tree.children.map((child) => child.bytes)).toEqual([
      12 * MB,
      11 * MB,
      10 * MB,
      9 * MB,
      8 * MB
    ])
  })

  it('reports progress with the folder being read', async () => {
    const root = fixture()
    const seen: StorageProgress[] = []
    await walkStorage({
      root,
      progressMs: 0,
      onProgress: (progress) => seen.push(progress)
    })

    expect(seen.length).toBeGreaterThan(0)
    const last = seen[seen.length - 1]
    expect(last.files).toBe(4)
    expect(last.bytes).toBeGreaterThan(0)
    expect(last.currentPath.startsWith(root)).toBe(true)
    // No expected size, no invented fraction.
    expect(last.fraction).toBeUndefined()
    // The counters rise while the walk runs, not only at the end: the live
    // line and the bar depend on this.
    expect(seen.some((progress) => progress.files > 0 && progress.files < 4)).toBe(true)
  })

  it('fills the fraction only when the volume size is known', async () => {
    const root = fixture()
    const seen: number[] = []
    await walkStorage({
      root,
      progressMs: 0,
      expectedBytes: 15 * MB,
      onProgress: (progress) => {
        if (progress.fraction !== undefined) seen.push(progress.fraction)
      }
    })
    expect(seen.length).toBeGreaterThan(0)
    for (const fraction of seen) {
      expect(fraction).toBeGreaterThanOrEqual(0)
      expect(fraction).toBeLessThanOrEqual(1)
    }
    expect(Math.max(...seen)).toBeCloseTo(0.5, 5)
    // Partial values before the end, so the bar actually moves.
    expect(seen.some((fraction) => fraction > 0 && fraction < 0.5)).toBe(true)
  })

  it('keeps the totals complete when the tree node budget runs out', async () => {
    const root = tempDir()
    for (let index = 0; index < 10; index += 1) {
      const dir = join(root, `folder-${String(index).padStart(2, '0')}`)
      mkdirSync(join(dir, 'deep'), { recursive: true })
      file(join(dir, 'payload.bin'), (index + 1) * MB)
      file(join(dir, 'deep', 'inner.bin'), MB)
    }

    // Only the root and one child fit in the tree.
    const report = await walkStorage({ root, limits: { maxNodes: 2 } })

    // 10 + 10 MB: everything counted, even the folders without a node.
    expect(report.bytes).toBe(65 * MB)
    expect(report.files).toBe(20)
    expect(report.dirs).toBe(20)
    // The tree itself is pruned and says so; the biggest files are still all
    // there, because they do not depend on the node budget.
    expect(report.tree.children.length).toBe(1)
    expect(report.topFiles).toHaveLength(20)
    expect(report.notes.join(' ')).toContain('máximo 2 pastas')
    expect(report.notes.join(' ')).toContain('totais')
  })

  it('stops when the caller aborts', async () => {
    const root = fixture()
    const controller = new AbortController()
    await expect(
      walkStorage({
        root,
        signal: controller.signal,
        progressMs: 0,
        onProgress: () => controller.abort()
      })
    ).rejects.toBeInstanceOf(StorageAbortError)
  })

  it('refuses a path that is not a folder', async () => {
    const root = tempDir()
    const path = join(root, 'file.txt')
    writeFileSync(path, 'x')
    await expect(walkStorage({ root: path })).rejects.toThrow(/não é uma pasta/)
  })

  it('refuses a path that does not exist', async () => {
    await expect(walkStorage({ root: join(tempDir(), 'gone') })).rejects.toThrow(
      /Não foi possível abrir/
    )
  })
})
