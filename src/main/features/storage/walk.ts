/**
 * The folder walk.
 *
 * Deliberately free of Electron and of the device layer: this is the part that
 * has to be correct, so it runs the same inside the utility process and inside
 * a test. A `utilityProcess` is what keeps a million `lstat` calls away from
 * the frame timer in the main process.
 *
 * Rules that the code below is built around:
 *  - read only: nothing is created, changed, moved or deleted;
 *  - symlinks and junctions are counted, never followed (a link back to the
 *    root would make the scan endless and the totals wrong);
 *  - a folder that cannot be opened is counted and skipped, never reported as
 *    an empty folder;
 *  - other filesystems mounted inside the root are not crossed (only with
 *    `crossFilesystems`, which no caller uses today);
 *  - one hard-linked file is counted once: it occupies space once.
 */

import { lstat, readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import { extname, join, resolve } from 'path'
import type {
  StorageFile,
  StorageLimits,
  StorageNode,
  StorageProgress,
  StorageReport
} from '@shared/features/storage'
import {
  STORAGE_MAX_CHILDREN,
  STORAGE_MAX_NODES,
  STORAGE_TOP_FILES
} from '@shared/features/storage'

/** Thrown when the caller aborts; the manager turns it into a null result. */
export class StorageAbortError extends Error {
  constructor() {
    super('Busca cancelada.')
    this.name = 'StorageAbortError'
  }
}

export interface WalkOptions {
  /** Folder to analyse. Must be absolute. */
  root: string
  signal?: AbortSignal
  /** Called a few times per second, never per file. */
  onProgress?: (progress: StorageProgress) => void
  /** Progress interval in milliseconds. */
  progressMs?: number
  /** Known used bytes of the volume, for the progress bar. */
  expectedBytes?: number
  limits?: Partial<StorageLimits>
  /** Off by default: crossing into another disk would inflate the totals. */
  crossFilesystems?: boolean
}

/**
 * Filesystem calls in flight at once. Higher values finish sooner on a warm
 * cache but hurt more when the disk is busy; 16 is a middle ground between a
 * single-threaded walk and a burst of thousands of stats.
 */
const CONCURRENCY = 16

/** Directory entries read at once, so a 50k-entry folder does not stall. */
const PROGRESS_MS = 250

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

/**
 * Bounded ranking of the largest files.
 *
 * A full disk has millions of files; sorting all of them at the end would need
 * the paths in memory, which is exactly what this scan must avoid. The heap
 * keeps only the `capacity` biggest.
 */
class TopFiles {
  private readonly items: StorageFile[] = []

  constructor(private readonly capacity: number) {}

  add(file: StorageFile): void {
    if (this.items.length < this.capacity) {
      this.items.push(file)
      this.bubbleUp(this.items.length - 1)
      return
    }
    if (file.bytes <= this.items[0].bytes) return
    this.items[0] = file
    this.sinkDown(0)
  }

  /** Biggest first. */
  sorted(): StorageFile[] {
    return this.items.slice().sort((a, b) => b.bytes - a.bytes)
  }

  private bubbleUp(index: number): void {
    let current = index
    while (current > 0) {
      const parent = (current - 1) >> 1
      if (this.items[parent].bytes <= this.items[current].bytes) break
      ;[this.items[parent], this.items[current]] = [this.items[current], this.items[parent]]
      current = parent
    }
  }

  private sinkDown(index: number): void {
    let current = index
    for (;;) {
      const left = current * 2 + 1
      const right = left + 1
      let smallest = current
      if (left < this.items.length && this.items[left].bytes < this.items[smallest].bytes) {
        smallest = left
      }
      if (right < this.items.length && this.items[right].bytes < this.items[smallest].bytes) {
        smallest = right
      }
      if (smallest === current) return
      ;[this.items[smallest], this.items[current]] = [this.items[current], this.items[smallest]]
      current = smallest
    }
  }
}

interface Totals {
  bytes: number
  files: number
  dirs: number
  denied: number
  deniedSamples: string[]
  links: number
  hardLinks: number
  mounts: number
  mountSamples: string[]
  nodes: number
  /** Nodes dropped because `maxNodes` was reached. */
  dropped: number
}

const SAMPLE_LIMIT = 5

export async function walkStorage(options: WalkOptions): Promise<StorageReport> {
  const root = resolve(options.root)
  const limits: StorageLimits = {
    maxChildren: options.limits?.maxChildren ?? STORAGE_MAX_CHILDREN,
    maxNodes: options.limits?.maxNodes ?? STORAGE_MAX_NODES,
    topFiles: options.limits?.topFiles ?? STORAGE_TOP_FILES
  }
  const started = Date.now()
  const signal = options.signal
  const semaphore = new Semaphore(CONCURRENCY)
  const top = new TopFiles(limits.topFiles)
  const seen = new Set<string>()
  const totals: Totals = {
    bytes: 0,
    files: 0,
    dirs: 0,
    denied: 0,
    deniedSamples: [],
    links: 0,
    hardLinks: 0,
    mounts: 0,
    mountSamples: [],
    nodes: 0,
    dropped: 0
  }

  let rootDev: bigint | null = null
  try {
    const stats = await semaphore.use(() => lstat(root, { bigint: true }))
    if (!stats.isDirectory()) throw new Error('O caminho escolhido não é uma pasta.')
    rootDev = stats.dev
  } catch (error) {
    if (error instanceof Error && error.message.includes('não é uma pasta')) throw error
    throw new Error(`Não foi possível abrir ${root}: ${describe(error)}`)
  }

  const progressMs = options.progressMs ?? PROGRESS_MS
  let lastProgress = 0
  let currentPath = root

  const checkpoint = (force = false): void => {
    if (signal?.aborted) throw new StorageAbortError()
    const now = Date.now()
    if (!force && now - lastProgress < progressMs) return
    lastProgress = now
    if (!options.onProgress) return
    const fraction =
      options.expectedBytes && options.expectedBytes > 0
        ? Math.min(1, totals.bytes / options.expectedBytes)
        : undefined
    options.onProgress({
      files: totals.files,
      dirs: totals.dirs,
      bytes: totals.bytes,
      currentPath,
      fraction,
      elapsedMs: now - started
    })
  }

  /**
   * Walk a folder without keeping a tree node.
   *
   * Reached only when `STORAGE_MAX_NODES` is exhausted: the folder detail is
   * gone, but its files still count towards the totals and the largest-files
   * ranking. Without this the report would silently show a fraction of the
   * disk, which is worse than showing less detail.
   */
  const countDir = async (path: string, dev: bigint): Promise<void> => {
    checkpoint()
    currentPath = path

    let entries: Dirent[]
    try {
      entries = await semaphore.use(() => readdir(path, { withFileTypes: true }))
    } catch {
      totals.denied += 1
      if (totals.deniedSamples.length < SAMPLE_LIMIT) totals.deniedSamples.push(path)
      return
    }

    const subdirs: Array<{ path: string; name: string }> = []
    const files: Array<{ path: string; name: string }> = []

    for (const entry of entries) {
      if (signal?.aborted) throw new StorageAbortError()
      const full = join(path, entry.name)
      if (entry.isSymbolicLink()) {
        totals.links += 1
        continue
      }
      if (entry.isDirectory()) {
        subdirs.push({ path: full, name: entry.name })
        continue
      }
      if (entry.isFile()) {
        files.push({ path: full, name: entry.name })
        continue
      }
      let stats: Awaited<ReturnType<typeof lstat>>
      try {
        stats = await semaphore.use(() => lstat(full, { bigint: true }))
      } catch {
        totals.denied += 1
        if (totals.deniedSamples.length < SAMPLE_LIMIT) totals.deniedSamples.push(full)
        continue
      }
      if (stats.isSymbolicLink()) totals.links += 1
      else if (stats.isDirectory()) subdirs.push({ path: full, name: entry.name })
      else if (stats.isFile()) files.push({ path: full, name: entry.name })
    }

    for (const file of files) {
      if (signal?.aborted) throw new StorageAbortError()
      let stats: Awaited<ReturnType<typeof lstat>>
      try {
        stats = await semaphore.use(() => lstat(file.path, { bigint: true }))
      } catch {
        totals.denied += 1
        if (totals.deniedSamples.length < SAMPLE_LIMIT) totals.deniedSamples.push(file.path)
        continue
      }
      if (!stats.isFile()) continue
      const bytes = Number(stats.size)
      if (stats.nlink > 1n && stats.ino !== 0n) {
        const key = `${stats.dev}:${stats.ino}`
        if (seen.has(key)) {
          totals.hardLinks += 1
          continue
        }
        seen.add(key)
      }
      totals.bytes += bytes
      totals.files += 1
      top.add({
        name: file.name,
        path: file.path,
        bytes,
        ext: extname(file.name).slice(1).toLowerCase(),
        mtimeMs: Number(stats.mtimeMs)
      })
      checkpoint()
    }

    for (let index = 0; index < subdirs.length; index += CONCURRENCY) {
      const batch = subdirs.slice(index, index + CONCURRENCY)
      await Promise.all(
        batch.map(async (child) => {
          if (signal?.aborted) throw new StorageAbortError()
          let stats: Awaited<ReturnType<typeof lstat>>
          try {
            stats = await semaphore.use(() => lstat(child.path, { bigint: true }))
          } catch {
            totals.denied += 1
            if (totals.deniedSamples.length < SAMPLE_LIMIT) totals.deniedSamples.push(child.path)
            return
          }
          if (stats.isSymbolicLink() || !stats.isDirectory()) {
            totals.links += 1
            return
          }
          if (!options.crossFilesystems && stats.dev !== dev) {
            totals.mounts += 1
            if (totals.mountSamples.length < SAMPLE_LIMIT) totals.mountSamples.push(child.path)
            return
          }
          totals.dirs += 1
          await countDir(child.path, stats.dev)
        })
      )
      checkpoint()
    }
  }

  const scanDir = async (path: string, name: string, dev: bigint): Promise<StorageNode> => {
    checkpoint()
    currentPath = path
    const node: StorageNode = { name, path, bytes: 0, files: 0, dirs: 0, children: [] }
    totals.nodes += 1

    let entries: Dirent[]
    try {
      entries = await semaphore.use(() => readdir(path, { withFileTypes: true }))
    } catch (error) {
      totals.denied += 1
      if (totals.deniedSamples.length < SAMPLE_LIMIT) totals.deniedSamples.push(path)
      return node
    }

    const subdirs: Array<{ path: string; name: string; mtimeMs?: number }> = []
    const files: Array<{ path: string; name: string }> = []

    for (const entry of entries) {
      if (signal?.aborted) throw new StorageAbortError()
      const full = join(path, entry.name)
      // `join` normalises, but a name with a separator cannot come from
      // readdir; the check keeps the walk inside the scanned root regardless.
      if (entry.isSymbolicLink()) {
        totals.links += 1
        continue
      }
      if (entry.isDirectory()) {
        subdirs.push({ path: full, name: entry.name })
        continue
      }
      if (entry.isFile()) {
        files.push({ path: full, name: entry.name })
        continue
      }
      // FIFOs, sockets, devices and unknown types: stat decides.
      let stats: Awaited<ReturnType<typeof lstat>>
      try {
        stats = await semaphore.use(() => lstat(full, { bigint: true }))
      } catch {
        totals.denied += 1
        if (totals.deniedSamples.length < SAMPLE_LIMIT) totals.deniedSamples.push(full)
        continue
      }
      if (stats.isSymbolicLink()) {
        totals.links += 1
      } else if (stats.isDirectory()) {
        // A symlinked directory that `readdir` did not flag: treated as a
        // folder only when it is not a link, which was just checked.
        subdirs.push({ path: full, name: entry.name, mtimeMs: Number(stats.mtimeMs) })
      } else if (stats.isFile()) {
        files.push({ path: full, name: entry.name })
      }
    }

    for (const file of files) {
      if (signal?.aborted) throw new StorageAbortError()
      let stats: Awaited<ReturnType<typeof lstat>>
      try {
        stats = await semaphore.use(() => lstat(file.path, { bigint: true }))
      } catch {
        totals.denied += 1
        if (totals.deniedSamples.length < SAMPLE_LIMIT) totals.deniedSamples.push(file.path)
        continue
      }
      if (!stats.isFile()) continue
      const bytes = Number(stats.size)
      // A hard link is the same file under another name: counting it twice
      // would make the folder look bigger than the disk.
      if (stats.nlink > 1n && stats.ino !== 0n) {
        const key = `${stats.dev}:${stats.ino}`
        if (seen.has(key)) {
          totals.hardLinks += 1
          continue
        }
        seen.add(key)
      }
      totals.bytes += bytes
      totals.files += 1
      node.bytes += bytes
      node.files += 1
      top.add({
        name: file.name,
        path: file.path,
        bytes,
        ext: extname(file.name).slice(1).toLowerCase(),
        mtimeMs: Number(stats.mtimeMs)
      })
      checkpoint()
    }

    // Folders are scanned with bounded concurrency, but a folder with 50k
    // subfolders would still start 50k promises at once. Batching keeps the
    // burst (and the memory) proportional to the concurrency limit.
    for (let index = 0; index < subdirs.length; index += CONCURRENCY) {
      const batch = subdirs.slice(index, index + CONCURRENCY)
      const results = await Promise.all(
        batch.map(async (child) => {
          if (signal?.aborted) throw new StorageAbortError()
          let stats: Awaited<ReturnType<typeof lstat>>
          try {
            stats = await semaphore.use(() => lstat(child.path, { bigint: true }))
          } catch {
            totals.denied += 1
            if (totals.deniedSamples.length < SAMPLE_LIMIT) totals.deniedSamples.push(child.path)
            return null
          }
          // A link can appear between readdir and lstat; never cross it.
          if (stats.isSymbolicLink() || !stats.isDirectory()) {
            totals.links += 1
            return null
          }
          if (!options.crossFilesystems && stats.dev !== dev) {
            totals.mounts += 1
            if (totals.mountSamples.length < SAMPLE_LIMIT) totals.mountSamples.push(child.path)
            return null
          }
          if (totals.nodes >= limits.maxNodes) {
            // The tree is full, but the totals must not be: the subtree is
            // walked without keeping a node, so the numbers stay complete and
            // only the per-folder detail is lost.
            totals.dropped += 1
            totals.dirs += 1
            await countDir(child.path, stats.dev)
            return null
          }
          const childNode = await scanDir(child.path, child.name, stats.dev)
          return { node: childNode, mtimeMs: Number(stats.mtimeMs) }
        })
      )
      for (const result of results) {
        if (!result) continue
        result.node.mtimeMs = result.mtimeMs
        node.children.push(result.node)
        node.bytes += result.node.bytes
        node.files += result.node.files
        node.dirs += result.node.dirs + 1
        totals.dirs += 1
      }
      checkpoint()
    }

    return node
  }

  const tree = await scanDir(root, root, rootDev)
  prune(tree, limits.maxChildren)
  // Totals are accumulated as the walk goes, not copied from the tree: with
  // `countDir` subtrees the tree is smaller by design, and the live progress
  // needs real numbers before the end.
  checkpoint(true)

  return {
    root,
    at: Date.now(),
    durationMs: Date.now() - started,
    bytes: totals.bytes,
    files: totals.files,
    dirs: totals.dirs,
    denied: totals.denied,
    deniedSamples: totals.deniedSamples,
    links: totals.links,
    hardLinks: totals.hardLinks,
    mounts: totals.mounts,
    mountSamples: totals.mountSamples,
    topFiles: top.sorted(),
    tree,
    notes: buildNotes(totals, limits),
    // Advice needs the drives and the previous scan, which live in the main
    // process; the walk only reports what it measured.
    suggestions: []
  }
}

/** Keeps the biggest children of every node and drops the rest. */
function prune(node: StorageNode, maxChildren: number): void {
  for (const child of node.children) prune(child, maxChildren)
  if (node.children.length <= maxChildren) return
  node.children.sort((a, b) => b.bytes - a.bytes)
  node.children.length = maxChildren
  node.more = true
}

function buildNotes(totals: Totals, limits: StorageLimits): string[] {
  const notes: string[] = []
  if (totals.denied > 0) {
    notes.push(
      `${totals.denied} pasta(s)/arquivo(s) sem permissão de leitura: o total não as inclui.`
    )
  }
  if (totals.links > 0) {
    notes.push(
      `${totals.links} link(s) simbólico(s) ou junction(s) não foram seguidos, para não contar em dobro.`
    )
  }
  if (totals.hardLinks > 0) {
    notes.push(
      `${totals.hardLinks} arquivo(s) com hard link foram contados uma vez só, como ocupam espaço.`
    )
  }
  if (totals.mounts > 0) {
    notes.push(
      `${totals.mounts} ponto(s) de montagem dentro da pasta não foram atravessados (outra unidade).`
    )
  }
  if (totals.dropped > 0) {
    notes.push(
      `A árvore guarda no máximo ${limits.maxNodes} pastas; a partir daí o detalhe por pasta não aparece, mas os totais e os maiores arquivos continuam completos.`
    )
  }
  return notes
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
