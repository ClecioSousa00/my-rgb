/**
 * One small snapshot per analysed root, kept between runs.
 *
 * "This folder grew" is only honest with a previous measurement. The whole
 * report is far too big to keep (a tree of 200k folders plus 500 files), so
 * the snapshot stores what the comparison needs: the total and the 1000
 * biggest folders. A folder that was outside that list in the previous scan
 * cannot be compared and is simply not reported as growth.
 *
 * The file is `<userData>/storage/scans.json`. It is read and written by the
 * main process only, never by the renderer, and a corrupted file is ignored
 * instead of breaking the analysis.
 */

import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { StorageNode, StorageReport } from '@shared/features/storage'

/** Biggest folders kept per scan, enough to compare the ones that matter. */
export const STORAGE_SNAPSHOT_FOLDERS = 1000

/** Roots remembered at once; the oldest is dropped past this. */
export const STORAGE_SNAPSHOT_ROOTS = 12

export interface StorageSnapshot {
  root: string
  /** Epoch milliseconds of the scan that produced it. */
  at: number
  /** Total bytes of that scan, for the summary line. */
  bytes: number
  /** Folder totals, biggest first. */
  folders: Array<{ path: string; bytes: number }>
}

interface HistoryFile {
  version: 1
  snapshots: StorageSnapshot[]
}

function historyPath(userData: string): string {
  return join(userData, 'storage', 'scans.json')
}

/** Reduce a report to what the growth comparison needs. */
export function snapshotFromReport(report: StorageReport): StorageSnapshot {
  const folders: Array<{ path: string; bytes: number }> = []
  const stack: StorageNode[] = [report.tree]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    folders.push({ path: node.path, bytes: node.bytes })
    for (const child of node.children) stack.push(child)
  }

  folders.sort((a, b) => b.bytes - a.bytes)
  const kept = folders.slice(0, STORAGE_SNAPSHOT_FOLDERS)
  // The root is the biggest by construction, but the comparison also needs it
  // when a tree was capped in an odd way.
  if (!kept.some((folder) => folder.path === report.root)) {
    kept.pop()
    kept.unshift({ path: report.root, bytes: report.bytes })
  }

  return { root: report.root, at: report.at, bytes: report.bytes, folders: kept }
}

/** All valid snapshots, newest first. A missing or corrupt file is empty. */
export async function loadStorageSnapshots(userData: string): Promise<StorageSnapshot[]> {
  let raw: string
  try {
    raw = await readFile(historyPath(userData), 'utf8')
  } catch {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!isHistoryFile(parsed)) return []
  const snapshots = parsed.snapshots.filter(isSnapshot)
  return snapshots.sort((a, b) => b.at - a.at)
}

/** The previous snapshot of one root, or null when it was never scanned. */
export async function loadStorageSnapshot(
  userData: string,
  root: string
): Promise<StorageSnapshot | null> {
  const snapshots = await loadStorageSnapshots(userData)
  return snapshots.find((snapshot) => snapshot.root === root) ?? null
}

/**
 * Writes are serialised: two scans finishing close together must not replace
 * the file with a copy loaded before the other write.
 */
let writing: Promise<void> = Promise.resolve()

/** Remember one scan, replacing an older snapshot of the same root. */
export function saveStorageSnapshot(userData: string, snapshot: StorageSnapshot): Promise<void> {
  const run = writing.then(() => writeHistory(userData, snapshot))
  // Keep the chain usable after a failure; the caller still gets the error.
  writing = run.catch(() => undefined)
  return run
}

async function writeHistory(userData: string, snapshot: StorageSnapshot): Promise<void> {
  const snapshots = await loadStorageSnapshots(userData)
  const next = [snapshot, ...snapshots.filter((entry) => entry.root !== snapshot.root)]
    .sort((a, b) => b.at - a.at)
    .slice(0, STORAGE_SNAPSHOT_ROOTS)
  const file = historyPath(userData)
  const payload: HistoryFile = { version: 1, snapshots: next }

  await mkdir(dirname(file), { recursive: true })
  // Write-then-rename: an interrupted run leaves the old snapshot intact.
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(payload), 'utf8')
  await rename(temporary, file)
}

function isHistoryFile(value: unknown): value is HistoryFile {
  if (typeof value !== 'object' || value === null) return false
  const file = value as Partial<HistoryFile>
  return file.version === 1 && Array.isArray(file.snapshots)
}

function isSnapshot(value: unknown): value is StorageSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const snapshot = value as Partial<StorageSnapshot>
  return (
    typeof snapshot.root === 'string' &&
    snapshot.root.length > 0 &&
    typeof snapshot.at === 'number' &&
    Number.isFinite(snapshot.at) &&
    typeof snapshot.bytes === 'number' &&
    Number.isFinite(snapshot.bytes) &&
    Array.isArray(snapshot.folders) &&
    snapshot.folders.every(
      (folder) =>
        typeof folder === 'object' &&
        folder !== null &&
        typeof (folder as { path?: unknown }).path === 'string' &&
        typeof (folder as { bytes?: unknown }).bytes === 'number' &&
        Number.isFinite((folder as { bytes: number }).bytes)
    )
  )
}
