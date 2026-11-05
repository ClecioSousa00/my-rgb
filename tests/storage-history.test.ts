/**
 * Storage history.
 *
 * "This folder grew" only exists because the previous scan was kept, so the
 * file has to survive a restart, replace the old entry of the same root, stay
 * bounded and never crash the analysis when it is corrupt. Every case here is
 * a way that file can be wrong.
 */

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StorageNode, StorageReport } from '@shared/features/storage'
import {
  loadStorageSnapshot,
  loadStorageSnapshots,
  saveStorageSnapshot,
  snapshotFromReport,
  STORAGE_SNAPSHOT_FOLDERS,
  STORAGE_SNAPSHOT_ROOTS
} from '@main/features/storage/history'

let userData: string

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'myrgb-storage-history-'))
})

afterEach(async () => {
  await rm(userData, { recursive: true, force: true })
})

function snapshot(root: string, at: number, bytes = 1000) {
  return { root, at, bytes, folders: [{ path: root, bytes }] }
}

function node(path: string, bytes: number, children: StorageNode[] = []): StorageNode {
  return { name: path.split('/').pop() ?? path, path, bytes, files: 1, dirs: children.length, children }
}

function report(root: string, tree: StorageNode, bytes = tree.bytes): StorageReport {
  return {
    root,
    at: 1_700_000_000_000,
    durationMs: 1,
    bytes,
    files: 10,
    dirs: 3,
    denied: 0,
    deniedSamples: [],
    links: 0,
    hardLinks: 0,
    mounts: 0,
    mountSamples: [],
    topFiles: [],
    tree,
    notes: [],
    suggestions: []
  }
}

describe('snapshotFromReport', () => {
  it('keeps the folder totals, biggest first', () => {
    const tree = node('/a', 300, [node('/a/pequena', 50), node('/a/grande', 200)])
    const snapshot = snapshotFromReport(report('/a', tree))
    expect(snapshot.root).toBe('/a')
    expect(snapshot.bytes).toBe(300)
    expect(snapshot.folders.map((folder) => folder.path)).toEqual(['/a', '/a/grande', '/a/pequena'])
  })

  it('always keeps the root, even when a child is bigger', () => {
    // A tree whose root total is smaller than a child should not happen, but
    // the comparison must not lose the root if it does.
    const tree = node('/a', 100, [node('/a/estranha', 500)])
    const snapshot = snapshotFromReport(report('/a', tree))
    expect(snapshot.folders).toContainEqual({ path: '/a', bytes: 100 })
    expect(snapshot.folders).toContainEqual({ path: '/a/estranha', bytes: 500 })
  })

  it('caps the folders kept in one snapshot', () => {
    const children = Array.from({ length: 1200 }, (_, index) =>
      node(`/a/pasta${index}`, 2000 - index)
    )
    const snapshot = snapshotFromReport(report('/a', node('/a', 2000, children)))
    expect(snapshot.folders).toHaveLength(STORAGE_SNAPSHOT_FOLDERS)
  })
})

describe('loadStorageSnapshots', () => {
  it('is empty when nothing was ever stored', async () => {
    expect(await loadStorageSnapshots(userData)).toEqual([])
    expect(await loadStorageSnapshot(userData, '/a')).toBeNull()
  })

  it('reads back what was written, newest first', async () => {
    await saveStorageSnapshot(userData, snapshot('/a', 100))
    await saveStorageSnapshot(userData, snapshot('/b', 200))

    const all = await loadStorageSnapshots(userData)
    expect(all.map((entry) => entry.root)).toEqual(['/b', '/a'])
    expect(await loadStorageSnapshot(userData, '/a')).toEqual(snapshot('/a', 100))
  })

  it('replaces the older snapshot of the same root', async () => {
    await saveStorageSnapshot(userData, snapshot('/a', 100, 10))
    await saveStorageSnapshot(userData, snapshot('/a', 200, 20))

    const all = await loadStorageSnapshots(userData)
    expect(all).toHaveLength(1)
    expect(all[0]).toEqual(snapshot('/a', 200, 20))
  })

  it('keeps at most twelve roots', async () => {
    for (let index = 0; index < STORAGE_SNAPSHOT_ROOTS + 3; index++) {
      await saveStorageSnapshot(userData, snapshot(`/root${index}`, 1000 + index))
    }

    const all = await loadStorageSnapshots(userData)
    expect(all).toHaveLength(STORAGE_SNAPSHOT_ROOTS)
    // Oldest dropped, newest kept.
    expect(all[0].root).toBe(`/root${STORAGE_SNAPSHOT_ROOTS + 2}`)
    expect(all.some((entry) => entry.root === '/root0')).toBe(false)
  })

  it('ignores a corrupt file instead of failing the analysis', async () => {
    const file = join(userData, 'storage', 'scans.json')
    await saveStorageSnapshot(userData, snapshot('/a', 100))
    await writeFile(file, '{ isto não é json', 'utf8')

    expect(await loadStorageSnapshots(userData)).toEqual([])
    expect(await loadStorageSnapshot(userData, '/a')).toBeNull()
  })

  it('ignores a well-formed file with the wrong shape', async () => {
    const file = join(userData, 'storage', 'scans.json')
    await saveStorageSnapshot(userData, snapshot('/a', 100))
    await writeFile(file, JSON.stringify({ version: 2, snapshots: [] }), 'utf8')
    expect(await loadStorageSnapshots(userData)).toEqual([])
  })

  it('drops only the invalid snapshots', async () => {
    const file = join(userData, 'storage', 'scans.json')
    await saveStorageSnapshot(userData, snapshot('/a', 100))
    const payload = JSON.parse(await readFile(file, 'utf8'))
    payload.snapshots.push({ root: 42 })
    await writeFile(file, JSON.stringify(payload), 'utf8')

    const all = await loadStorageSnapshots(userData)
    expect(all.map((entry) => entry.root)).toEqual(['/a'])
  })

  it('recovers after a corrupt file is replaced by a real save', async () => {
    const file = join(userData, 'storage', 'scans.json')
    await saveStorageSnapshot(userData, snapshot('/a', 100))
    await writeFile(file, 'lixo', 'utf8')

    await saveStorageSnapshot(userData, snapshot('/b', 200))
    expect((await loadStorageSnapshots(userData)).map((entry) => entry.root)).toEqual(['/b'])
  })

  it('serialises concurrent writes instead of losing one', async () => {
    await Promise.all([
      saveStorageSnapshot(userData, snapshot('/a', 100)),
      saveStorageSnapshot(userData, snapshot('/b', 200)),
      saveStorageSnapshot(userData, snapshot('/c', 300))
    ])
    expect((await loadStorageSnapshots(userData)).map((entry) => entry.root).sort()).toEqual([
      '/a',
      '/b',
      '/c'
    ])
  })
})
