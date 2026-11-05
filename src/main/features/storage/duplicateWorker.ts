/**
 * Duplicate scan worker.
 *
 * Runs inside an Electron `utilityProcess`: a separate OS process, so hashing
 * gigabytes of files cannot delay a frame or any other IPC call. It has no
 * access to `app`, the device or the stores - only to the folder it was asked
 * to scan, and only to read.
 */

import { findDuplicates } from './duplicates'
import type { StorageDuplicateProgress, StorageDuplicateReport } from '@shared/features/storage'

type Request = { type: 'start'; root: string } | { type: 'cancel' }

type Reply =
  | { type: 'progress'; progress: StorageDuplicateProgress }
  | { type: 'done'; report: StorageDuplicateReport }
  | { type: 'aborted' }
  | { type: 'error'; message: string }

const port = process.parentPort
const controller = new AbortController()

port.on('message', (event) => {
  const request = event.data as Request | undefined
  if (request?.type === 'cancel') {
    controller.abort()
    return
  }
  if (request?.type === 'start') void run(request)
})

async function run(request: Extract<Request, { type: 'start' }>): Promise<void> {
  try {
    const report = await findDuplicates({
      root: request.root,
      signal: controller.signal,
      onProgress: (progress): void => {
        port.postMessage({ type: 'progress', progress } satisfies Reply)
      }
    })
    port.postMessage({ type: 'done', report } satisfies Reply)
  } catch (error) {
    if (error instanceof Error && error.message === 'Busca de duplicados cancelada.') {
      port.postMessage({ type: 'aborted' } satisfies Reply)
      return
    }
    port.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    } satisfies Reply)
  }
}
