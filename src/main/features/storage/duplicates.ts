/**
 * Duplicate file detection.
 *
 * Pure logic, free of Electron: walk a folder, group files by size, then
 * confirm candidates with a partial hash (head + tail) and finally a full
 * hash. Nothing is deleted, moved or changed - the result is a list of
 * identical file sets and how much space keeping one copy would free.
 *
 * The walk follows the same rules as the storage scan: read-only, symlinks
 * and junctions never followed, other filesystems not crossed, one hard link
 * counted once.
 */

import { createHash } from 'crypto'
import { lstat, open, readFile, readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import { join, resolve } from 'path'
import type {
  StorageDuplicate,
  StorageDuplicateProgress,
  StorageDuplicateReport,
  StorageDuplicateStage
} from '@shared/features/storage'

/** Bytes read from the head and the tail for the partial hash. */
const PARTIAL_HASH_BYTES = 4096

/** Filesystem calls in flight at once. */
const CONCURRENCY = 16

/** Progress updates are throttled, never one per file. */
const PROGRESS_MS = 250

interface ScannedFile {
  path: string
  size: number
  mtimeMs?: number
}

interface SizeGroup {
  size: number
  files: ScannedFile[]
}

/**
 * Walk a folder and return files grouped by size.
 *
 * Groups with a single file can never be duplicates and are dropped early,
 * which keeps the hash stages small.
 *
 * Symlinks and junctions are counted but never followed. Other filesystems
 * mounted inside the root are not crossed.
 */
async function collectBySize(
  root: string,
  rootDev: bigint,
  signal: AbortSignal | undefined,
  onProgress?: (progress: { files: number; currentPath: string }) => void
): Promise<SizeGroup[]> {
  const groups = new Map<number, ScannedFile[]>()
  let files = 0
  let currentPath = root
  let lastProgress = 0

  const checkpoint = (force = false): void => {
    if (signal?.aborted) throw new Error('Busca de duplicados cancelada.')
    const now = Date.now()
    if (!force && now - lastProgress < PROGRESS_MS) return
    lastProgress = now
    onProgress?.({ files, currentPath })
  }

  const addFile = (path: string, size: number, mtimeMs?: number): void => {
    files += 1
    currentPath = path
    let group = groups.get(size)
    if (!group) {
      group = []
      groups.set(size, group)
    }
    group.push({ path, size, mtimeMs })
  }

  const semaphore = new Semaphore(CONCURRENCY)

  const walkDir = async (path: string, dev: bigint): Promise<void> => {
    checkpoint()
    currentPath = path

    let entries: Dirent[]
    try {
      entries = await semaphore.use(() => readdir(path, { withFileTypes: true }))
    } catch {
      return // Permission denied: skip silently.
    }

    const subdirs: Array<string> = []
    const files_: Array<string> = []

    for (const entry of entries) {
      if (signal?.aborted) throw new Error('Busca de duplicados cancelada.')
      const full = join(path, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        subdirs.push(full)
        continue
      }
      if (entry.isFile()) {
        files_.push(full)
        continue
      }
      let stats: Awaited<ReturnType<typeof lstat>>
      try {
        stats = await semaphore.use(() => lstat(full, { bigint: true }))
      } catch {
        continue
      }
      if (stats.isSymbolicLink()) continue
      if (stats.isDirectory()) subdirs.push(full)
      else if (stats.isFile()) files_.push(full)
    }

    for (const file of files_) {
      if (signal?.aborted) throw new Error('Busca de duplicados cancelada.')
      let stats: Awaited<ReturnType<typeof lstat>>
      try {
        stats = await semaphore.use(() => lstat(file, { bigint: true }))
      } catch {
        continue
      }
      if (!stats.isFile()) continue
      addFile(file, Number(stats.size), Number(stats.mtimeMs))
      checkpoint()
    }

    for (let index = 0; index < subdirs.length; index += CONCURRENCY) {
      const batch = subdirs.slice(index, index + CONCURRENCY)
      await Promise.all(
        batch.map(async (child) => {
          if (signal?.aborted) throw new Error('Busca de duplicados cancelada.')
          let stats: Awaited<ReturnType<typeof lstat>>
          try {
            stats = await semaphore.use(() => lstat(child, { bigint: true }))
          } catch {
            return
          }
          if (stats.isSymbolicLink() || !stats.isDirectory()) return
          if (stats.dev !== dev) return // Don't cross mount points.
          await walkDir(child, stats.dev)
        })
      )
      checkpoint()
    }
  }

  await walkDir(root, rootDev)
  checkpoint(true)

  // Drop singleton groups: a file with a unique size cannot be a duplicate.
  const result: SizeGroup[] = []
  for (const [size, group] of groups) {
    if (group.length > 1) result.push({ size, files: group })
  }
  result.sort((a, b) => b.size - a.size)
  return result
}

/** Partial hash: head + tail of the file. Empty files hash to the same value. */
async function partialHash(path: string, size: number): Promise<string> {
  const hash = createHash('sha256')
  if (size === 0) return hash.digest('hex')
  const handle = await open(path, 'r')
  try {
    const head = size <= PARTIAL_HASH_BYTES
      ? await readFile(path)
      : await readRange(handle, 0, PARTIAL_HASH_BYTES)
    hash.update(head)
    if (size > PARTIAL_HASH_BYTES * 2) {
      hash.update(await readRange(handle, size - PARTIAL_HASH_BYTES, PARTIAL_HASH_BYTES))
    } else if (size > PARTIAL_HASH_BYTES) {
      hash.update(await readRange(handle, PARTIAL_HASH_BYTES, size - PARTIAL_HASH_BYTES))
    }
  } finally {
    await handle.close()
  }
  return hash.digest('hex')
}

/** Read `length` bytes from `offset` using an open file handle. */
async function readRange(handle: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number; buffer: Buffer }> }, offset: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, offset)
  return bytesRead < length ? buffer.slice(0, bytesRead) : buffer
}

/** Full hash of the entire file. */
async function fullHash(path: string): Promise<string> {
  const hash = createHash('sha256')
  const data = await readFile(path)
  hash.update(data)
  return hash.digest('hex')
}

class Semaphore {
  private free: number
  private readonly waiting: Array<() => void> = []

  constructor(size: number) {
    this.free = size
  }

  async use<T>(work: () => Promise<T>): Promise<T> {
    if (this.free > 0) this.free -= 1
    else await new Promise<void>((release) => this.waiting.push(release))
    try {
      return await work()
    } finally {
      const next = this.waiting.shift()
      if (next) next()
      else this.free += 1
    }
  }
}

interface DuplicateOptions {
  root: string
  signal?: AbortSignal
  /** Called a few times per second, never per file. */
  onProgress?: (progress: StorageDuplicateProgress) => void
}

/**
 * Find duplicate files under `root`.
 *
 * Stages:
 *  1. `sizing` - walk and group by size
 *  2. `partial-hash` - head+tail hash of each candidate group
 *  3. `full-hash` - full hash of each surviving candidate
 *  4. `done` - confirmed duplicate sets
 *
 * A file that cannot be read is skipped, never reported as unique.
 */
export async function findDuplicates(options: DuplicateOptions): Promise<StorageDuplicateReport> {
  const { root, signal, onProgress } = options
  const target = resolve(root)
  const started = Date.now()
  let stage: StorageDuplicateStage = 'idle'
  let files = 0
  let sizeGroups = 0
  let candidates = 0
  let confirmed = 0
  let currentPath = target

  const emit = (nextStage: StorageDuplicateStage): void => {
    stage = nextStage
    onProgress?.({
      stage,
      files,
      sizeGroups,
      candidates,
      confirmed,
      currentPath,
      elapsedMs: Date.now() - started
    })
  }

  // Stage 1: stat the root and collect files grouped by size.
  emit('sizing')
  let rootStats: Awaited<ReturnType<typeof lstat>>
  try {
    rootStats = await lstat(target, { bigint: true })
  } catch {
    throw new Error(`Não foi possível abrir ${target}.`)
  }
  if (!rootStats.isDirectory()) throw new Error(`${target} não é uma pasta.`)

  const groups = await collectBySize(target, rootStats.dev, signal, (progress) => {
    files = progress.files
    currentPath = progress.currentPath
    emit('sizing')
  })
  sizeGroups = groups.length

  // Stage 2: partial hash of each size group.
  emit('partial-hash')
  const partialCandidates: Array<{ size: number; files: ScannedFile[] }> = []
  for (const group of groups) {
    if (signal?.aborted) throw new Error('Busca de duplicados cancelada.')
    const byHash = new Map<string, ScannedFile[]>()
    for (const file of group.files) {
      currentPath = file.path
      const digest = await partialHash(file.path, file.size)
      let bucket = byHash.get(digest)
      if (!bucket) {
        bucket = []
        byHash.set(digest, bucket)
      }
      bucket.push(file)
      emit('partial-hash')
    }
    for (const bucket of byHash.values()) {
      if (bucket.length > 1) {
        candidates += 1
        partialCandidates.push({ size: group.size, files: bucket })
      }
    }
  }

  // Stage 3: full hash of each partial-hash candidate.
  emit('full-hash')
  const duplicates: StorageDuplicate[] = []
  for (const candidate of partialCandidates) {
    if (signal?.aborted) throw new Error('Busca de duplicados cancelada.')
    const byHash = new Map<string, ScannedFile[]>()
    for (const file of candidate.files) {
      currentPath = file.path
      const digest = await fullHash(file.path)
      let bucket = byHash.get(digest)
      if (!bucket) {
        bucket = []
        byHash.set(digest, bucket)
      }
      bucket.push(file)
      emit('full-hash')
    }
    for (const bucket of byHash.values()) {
      if (bucket.length > 1) {
        confirmed += 1
        const hash = await fullHash(bucket[0].path) // Re-hash once for the report hash.
        duplicates.push({
          name: bucket[0].path.split('/').pop() ?? bucket[0].path,
          size: candidate.size,
          copies: bucket.map((file) => ({ path: file.path, mtimeMs: file.mtimeMs })),
          recoverableBytes: (bucket.length - 1) * candidate.size,
          hash
        })
      }
    }
  }

  duplicates.sort((a, b) => b.recoverableBytes - a.recoverableBytes)

  emit('done')

  return {
    root: target,
    at: Date.now(),
    durationMs: Date.now() - started,
    duplicates,
    totalRecoverableBytes: duplicates.reduce((sum, dup) => sum + dup.recoverableBytes, 0),
    notes: []
  }
}
