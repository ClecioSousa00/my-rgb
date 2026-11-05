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

/** A drive with less than this share of free space gets a suggestion. */
export const STORAGE_LOW_SPACE_PERCENT = 10

/**
 * A file, or a group of folders of the same kind, worth mentioning.
 *
 * One gigabyte, not "whatever looks big": a suggestion with a hidden rule
 * cannot be checked by the user.
 */
export const STORAGE_NOTABLE_BYTES = 1_000_000_000

/** Growth below this is not worth a suggestion. */
export const STORAGE_GROWTH_MIN_BYTES = 1_000_000_000

/** Growth also needs to be at least this share of the previous size. */
export const STORAGE_GROWTH_PERCENT = 10

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
  /**
   * Advice built from the report, the drives and the previous scan of the
   * same root. Always a suggestion: nothing here is an obligation, and an
   * empty list is not a guarantee that the disk is healthy.
   */
  suggestions: StorageSuggestion[]
}

/** What kind of advice a suggestion carries. */
export type StorageSuggestionKind =
  | 'drive-low-space'
  | 'large-files'
  | 'temp-folders'
  | 'downloads'
  | 'caches'
  | 'growth'

/** One path shown inside a suggestion. */
export interface StorageSuggestionItem {
  /** Absolute path, revealed in the file manager by the UI. */
  path: string
  /** Short right-side note, e.g. "1,2 GB" or "8,4% livres". */
  note?: string
}

/**
 * One piece of advice about the analysed storage.
 *
 * `detail` is a whole sentence because the rule matters: the user has to know
 * that "grande" means "1 GB or more", not whatever felt large that day.
 */
export interface StorageSuggestion {
  kind: StorageSuggestionKind
  title: string
  detail: string
  /** Total bytes involved, when the suggestion has a number. */
  bytes?: number
  /** Paths to show, biggest first; the UI caps what it renders. */
  items: StorageSuggestionItem[]
}

/** Caps used by the walk; the page does not need to know them. */
export interface StorageLimits {
  maxChildren: number
  maxNodes: number
  topFiles: number
}
