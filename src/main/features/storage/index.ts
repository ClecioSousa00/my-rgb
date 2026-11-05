/**
 * Storage analysis, from the main process's point of view.
 *
 * Owns the single scan in flight: spawns the `utilityProcess`, forwards the
 * progress it emits, keeps the last report for when the page is opened again
 * and cancels on request. The walk itself lives in `walk.ts`, which knows
 * nothing about Electron.
 *
 * One scan at a time, like the network diagnostic: starting a second one while
 * the first runs returns the promise that is already running instead of
 * reading the same disk twice.
 */

import type { Stats } from 'fs'
import { lstat } from 'fs/promises'
import { isAbsolute, join, resolve } from 'path'
import { utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import type { StorageProgress, StorageReport, StorageStatus } from '@shared/features/storage'
import { listDrives } from '../system/drives'

interface ActiveScan {
  root: string
  promise: Promise<StorageReport | null>
  cancel: () => void
}

let active: ActiveScan | null = null
let lastReport: StorageReport | null = null
/** Latest counters of the run in flight, shown again when the page remounts. */
let lastProgress: StorageProgress | null = null

/** Whether a scan is running, and how far it got. */
export function storageStatus(): StorageStatus {
  return {
    running: active !== null,
    progress: active ? lastProgress : null,
    root: active?.root
  }
}

/** Last completed report, kept in memory so reopening the page is instant. */
export function lastStorageReport(): StorageReport | null {
  return lastReport
}

/** Ask the running scan to stop; its promise resolves to null. */
export function cancelStorageScan(): void {
  active?.cancel()
}

/**
 * Start a scan, or attach to the one already running.
 *
 * `onProgress` is called a few times per second (the walk throttles it), never
 * once per file.
 */
export function startStorageScan(
  root: string,
  onProgress: (progress: StorageProgress) => void
): Promise<StorageReport | null> {
  if (active) return active.promise
  const entry: ActiveScan = { root, promise: Promise.resolve(null), cancel: () => {} }
  entry.promise = run(root, onProgress, entry)
  active = entry
  return entry.promise
}

async function run(
  root: string,
  onProgress: (progress: StorageProgress) => void,
  entry: ActiveScan
): Promise<StorageReport | null> {
  let child: UtilityProcess | null = null
  let canceled = false
  try {
    // `prepare` runs before the worker exists; an invalid folder must clear
    // `active` too, or the page would wait forever for a scan that never began.
    const target = await prepare(root)
    child = utilityProcess.fork(join(__dirname, 'storageWorker.js'), [], {
      serviceName: 'MyRGB Armazenamento'
    })
    const worker = child

    entry.cancel = (): void => {
      canceled = true
      try {
        worker.postMessage({ type: 'cancel' })
      } catch {
        // The process may already be gone; `exit` handles that case.
      }
    }

    return await new Promise<StorageReport | null>((resolveScan, rejectScan) => {
      let settled = false
      const settle = (finish: () => void): void => {
        if (settled) return
        settled = true
        finish()
      }

      worker.on(
        'message',
        (message: {
          type?: string
          progress?: StorageProgress
          report?: StorageReport
          message?: string
        }) => {
          if (message?.type === 'progress' && message.progress) {
            lastProgress = message.progress
            try {
              onProgress(message.progress)
            } catch {
              // A closed window must not end the scan.
            }
            return
          }
          if (message?.type === 'done' && message.report) {
            // The volume match is decided here (it needs `listDrives`), but it
            // belongs in the report so the page can say which drive was read.
            const report: StorageReport = { ...message.report, driveId: target.driveId }
            lastReport = report
            lastProgress = null
            settle(() => resolveScan(report))
            return
          }
          if (message?.type === 'aborted') {
            lastProgress = null
            settle(() => resolveScan(null))
            return
          }
          if (message?.type === 'error') {
            lastProgress = null
            settle(() => rejectScan(new Error(message.message ?? 'A busca falhou.')))
          }
        }
      )

      // A crash is not a normal end: the report is incomplete, so there is
      // none to hand back and the page must say so.
      worker.on('exit', (code) => {
        lastProgress = null
        if (canceled) {
          settle(() => resolveScan(null))
          return
        }
        settle(() =>
          rejectScan(
            new Error(`A busca de armazenamento terminou inesperadamente (código ${code}).`)
          )
        )
      })

      worker.postMessage({
        type: 'start',
        root: target.root,
        expectedBytes: target.expectedBytes
      })
    })
  } finally {
    entry.cancel = (): void => {}
    try {
      child?.kill()
    } catch {
      /* already gone */
    }
    if (active === entry) active = null
  }
}

/**
 * Validate the folder and find the volume that holds it.
 *
 * `expectedBytes` is only set when the folder *is* a mount point: comparing a
 * subfolder's total against the whole volume used space would give a progress
 * bar that never reaches the end.
 */
async function prepare(
  root: string
): Promise<{ root: string; driveId?: string; expectedBytes?: number }> {
  if (!root || !isAbsolute(root)) {
    throw new Error('Escolha uma pasta pelo caminho completo.')
  }
  const target = resolve(root)
  let stats: Stats
  try {
    stats = await lstat(target)
  } catch {
    throw new Error(`Não foi possível abrir ${target}.`)
  }
  if (!stats.isDirectory()) {
    throw new Error(`${target} não é uma pasta.`)
  }

  let driveId: string | undefined
  let expectedBytes: number | undefined
  try {
    const drives = await listDrives()
    // The most specific mount wins: on Linux both "/" and "/home" can match.
    const match = drives
      .filter((drive) => isInside(target, drive.mount))
      .sort((a, b) => b.mount.length - a.mount.length)[0]
    if (match) {
      driveId = match.id
      if (samePath(target, match.mount)) expectedBytes = match.usedBytes
    }
  } catch {
    // The scan does not depend on the volume list; it only feeds the bar.
  }

  return { root: target, driveId, expectedBytes }
}

function isInside(target: string, mount: string): boolean {
  // Windows paths are case-insensitive, and `listDrives` reports the letter in
  // upper case; comparing them raw would miss `c:\Users`.
  const path = process.platform === 'win32' ? target.toLowerCase() : target
  const base = process.platform === 'win32' ? mount.toLowerCase() : mount
  const prefix = base.endsWith('\\') || base.endsWith('/') ? base : `${base}/`
  return path === base || path.startsWith(prefix) || path.startsWith(`${base}\\`)
}

function samePath(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    process.platform === 'win32'
      ? value.replace(/[\\/]+$/, '').toLowerCase()
      : value.replace(/[\\/]+$/, '')
  return normalize(a) === normalize(b)
}
