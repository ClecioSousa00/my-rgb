/**
 * Storage scan worker.
 *
 * Runs inside an Electron `utilityProcess`: a separate OS process, so a walk
 * over a million files cannot delay a frame or any other IPC call. It has no
 * access to `app`, the device or the stores - only to the folder it was asked
 * to scan, and only to read.
 */

import { StorageAbortError, walkStorage } from './walk'
import type { StorageProgress, StorageReport } from '@shared/features/storage'

type Request =
  | { type: 'start'; root: string; expectedBytes?: number }
  | { type: 'cancel' }

type Reply =
  | { type: 'progress'; progress: StorageProgress }
  | { type: 'done'; report: StorageReport }
  | { type: 'aborted' }
  | { type: 'error'; message: string }

const port = process.parentPort
const controller = new AbortController()

port.on('message', (event) => {
  const request = event.data as Request | undefined
  if (request?.type === 'cancel') {
    // The walk checks this between files and folders and unwinds on its own;
    // killing the process here would lose the reason.
    controller.abort()
    return
  }
  if (request?.type === 'start') void run(request)
})

async function run(request: Extract<Request, { type: 'start' }>): Promise<void> {
  try {
    const report = await walkStorage({
      root: request.root,
      expectedBytes: request.expectedBytes,
      signal: controller.signal,
      onProgress: (progress): void => {
        port.postMessage({ type: 'progress', progress } satisfies Reply)
      }
    })
    port.postMessage({ type: 'done', report } satisfies Reply)
  } catch (error) {
    if (error instanceof StorageAbortError) {
      port.postMessage({ type: 'aborted' } satisfies Reply)
      return
    }
    port.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    } satisfies Reply)
  }
}
