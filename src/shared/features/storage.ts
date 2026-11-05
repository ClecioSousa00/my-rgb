/**
 * Storage analysis (what is filling a drive).
 *
 * One scan starts at a folder, walks it once and returns an aggregated tree:
 * the totals of every folder, the largest files and what had to be skipped.
 * The tree is aggregated on purpose - keeping one entry per file would need
 * gigabytes on a full disk, and the page only ever shows the biggest ones.
 *
 * Totals are the sum of the file sizes that could be read. A folder that could
 * not be opened is counted in `denied` and named in a note; it is never
 * silently reported as empty, and nothing is guessed.
 */

/** Largest files kept from one scan, already ordered. */
export const STORAGE_TOP_FILES = 500

/** Subfolders kept per folder in the tree (the biggest ones). */
export const STORAGE_MAX_CHILDREN = 20

/**
 * Directory nodes kept in memory. A disk can have more folders than the tree
 * can hold; past this point totals keep counting but no nodes are attached,
 * and the report says so.
 */
export const STORAGE_MAX_NODES = 200_000

/** A file in the "largest files" ranking. */
export interface StorageFile {
  name: string
  /** Absolute path. */
  path: string
  bytes: number
  /** Lower-case extension without the dot; empty when there is none. */
  ext: string
  /** Last modification, epoch milliseconds; absent when the stat failed. */
  mtimeMs?: number
}

/** One folder of the aggregated tree. */
export interface StorageNode {
  /** Last path segment; the root shows the whole path. */
  name: string
  path: string
  /** Sum of the file sizes below this folder. */
  bytes: number
  /** Files below this folder, recursively. */
  files: number
  /** Subfolders below this folder, recursively (not counting itself). */
  dirs: number
  /** When the folder itself was last modified; absent when unavailable. */
  mtimeMs?: number
  /** Biggest subfolders, ordered by size. */
  children: StorageNode[]
  /** Some subfolders were omitted because of `STORAGE_MAX_CHILDREN`. */
  more?: boolean
}

/** Live counters while the scan runs; throttled to a few per second. */
export interface StorageProgress {
  files: number
  dirs: number
  bytes: number
  /** Folder being read, for the live line. */
  currentPath: string
  /**
   * 0-1 when the volume's used size is known and the root is its mount
   * point. Absent otherwise: an estimate that turns out wrong is worse than
   * no progress bar.
   */
  fraction?: number
  elapsedMs: number
}

export interface StorageStatus {
  running: boolean
  progress: StorageProgress | null
  /** Root of the run in flight, so the page can show what is being scanned. */
  root?: string
}

/** Result of one completed scan. */
export interface StorageReport {
  root: string
  /** Volume that holds the root, when it could be matched. */
  driveId?: string
  /** Epoch milliseconds of the last write to the report. */
  at: number
  durationMs: number
  /** Total bytes counted (sum of the file sizes that could be read). */
  bytes: number
  files: number
  dirs: number
  /** Folders that could not be opened (permission, I/O error). */
  denied: number
  /** A few of those paths, so the note can name them. */
  deniedSamples: string[]
  /** Symlinks and junctions found. They are never followed. */
  links: number
  /** Files skipped because another path already counted the same inode. */
  hardLinks: number
  /** Other filesystems mounted inside the root; not crossed. */
  mounts: number
  mountSamples: string[]
  /** Largest files, ordered by size. */
  topFiles: StorageFile[]
  /** Aggregated tree, pruned to `STORAGE_MAX_CHILDREN` per folder. */
  tree: StorageNode
  /** What the totals exclude, in the user's language. */
  notes: string[]
}

/** Caps used by the walk; the page does not need to know them. */
export interface StorageLimits {
  maxChildren: number
  maxNodes: number
  topFiles: number
}
