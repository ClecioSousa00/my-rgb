/**
 * Storage advice.
 *
 * Everything here is a suggestion, never a verdict: "this folder is a cache"
 * does not mean it should be deleted, and an empty list does not mean the disk
 * is healthy. The rules are explicit in the suggestion text and in the page
 * footnote, so the user can disagree with them.
 *
 * The input is what the scan measured: the tree (pruned to the 20 biggest
 * subfolders per folder) and the 500 biggest files. A cache hidden under 20
 * bigger siblings is not seen - that limitation belongs in the docs, not in a
 * guess.
 */

import { dirname } from 'path'
import { formatBytes, formatPercent } from '@shared/format'
import type { DriveInfo } from '@shared/features/system'
import type {
  StorageNode,
  StorageReport,
  StorageSuggestion,
  StorageSuggestionKind,
  StorageSuggestionItem
} from '@shared/features/storage'
import {
  STORAGE_GROWTH_MIN_BYTES,
  STORAGE_GROWTH_PERCENT,
  STORAGE_LOW_SPACE_PERCENT,
  STORAGE_NOTABLE_BYTES
} from '@shared/features/storage'
import type { StorageSnapshot } from './history'

/** Paths listed under one suggestion; the rest is summarised by the totals. */
const MAX_ITEMS = 5

/** Folder names that hold temporary files, already normalised. */
const TEMP_NAMES = new Set([
  'tmp',
  'temp',
  '.tmp',
  '.temp',
  'temporary',
  'temp files',
  'temporary files'
])

/** Folder names that hold downloads. */
const DOWNLOAD_NAMES = new Set(['download', 'downloads'])

/**
 * Folder names that are caches on purpose. The list is deliberately small:
 * matching every folder with "cache" in the name would flag project sources.
 */
const CACHE_NAMES = new Set([
  'cache',
  'caches',
  '.cache',
  'cache2',
  'cachestorage',
  'code cache',
  'gpu cache',
  'gpucache',
  'shadercache',
  'service worker cache'
])

export interface DiagnoseInput {
  report: StorageReport
  drives: DriveInfo[]
  /** Previous scan of the same root, when there is one. */
  previous?: StorageSnapshot | null
}

/** Suggestions for one completed scan, in the order the page shows them. */
export function diagnoseStorage(input: DiagnoseInput): StorageSuggestion[] {
  const suggestions: StorageSuggestion[] = []
  const lowSpace = lowSpaceSuggestion(input.drives)
  if (lowSpace) suggestions.push(lowSpace)

  const growth = growthSuggestion(input.report, input.previous)
  if (growth) suggestions.push(growth)

  const largeFiles = largeFilesSuggestion(input.report)
  if (largeFiles) suggestions.push(largeFiles)

  // A folder already named by an earlier category is not named again: a cache
  // inside Temp would otherwise appear as a second, overlapping suggestion.
  const claimed = new Set<string>()

  const temporary = folderSuggestion(
    'temp-folders',
    'Pastas temporárias',
    TEMP_NAMES,
    input.report.tree,
    claimed,
    (count, bytes) =>
      `${count} pasta(s) com nome de temporária somam ${bytes}. Apagar arquivos temporários em uso pode atrapalhar um programa; feche-o antes.`
  )
  if (temporary) suggestions.push(temporary)

  const downloads = folderSuggestion(
    'downloads',
    'Downloads acumulados',
    DOWNLOAD_NAMES,
    input.report.tree,
    claimed,
    (count, bytes) =>
      `${count} pasta(s) de downloads somam ${bytes}. Vale revisar o que ainda é útil antes de liberar espaço.`
  )
  if (downloads) suggestions.push(downloads)

  const caches = folderSuggestion(
    'caches',
    'Caches',
    CACHE_NAMES,
    input.report.tree,
    claimed,
    (count, bytes) =>
      `${count} pasta(s) de cache somam ${bytes}. Caches costumam ser recriados, mas isso depende do programa.`
  )
  if (caches) suggestions.push(caches)

  return suggestions
}

/** Drives that are almost full, with the free share as the note. */
function lowSpaceSuggestion(drives: DriveInfo[]): StorageSuggestion | null {
  const low = drives
    .filter((drive) => drive.totalBytes > 0)
    .map((drive) => {
      const freePercent = (drive.freeBytes / drive.totalBytes) * 100
      return { drive, freePercent }
    })
    .filter(({ freePercent }) => freePercent < STORAGE_LOW_SPACE_PERCENT)
    .sort((a, b) => a.freePercent - b.freePercent)

  if (low.length === 0) return null

  const items: StorageSuggestionItem[] = low.map(({ drive, freePercent }) => ({
    path: drive.mount,
    note: `${formatPercent(freePercent, 1)} livres`
  }))

  return {
    kind: 'drive-low-space',
    title: 'Pouco espaço livre',
    detail: `${low.length} unidade(s) com menos de ${STORAGE_LOW_SPACE_PERCENT}% de espaço livre. O percentual está ao lado de cada caminho.`,
    items: items.slice(0, MAX_ITEMS)
  }
}

/** Files of 1 GB or more among the 500 biggest of the scan. */
function largeFilesSuggestion(report: StorageReport): StorageSuggestion | null {
  const large = report.topFiles
    .filter((file) => file.bytes >= STORAGE_NOTABLE_BYTES)
    .sort((a, b) => b.bytes - a.bytes)
  if (large.length === 0) return null

  const total = large.reduce((sum, file) => sum + file.bytes, 0)
  return {
    kind: 'large-files',
    title: 'Arquivos muito grandes',
    detail: `${large.length} arquivo(s) com ${formatBytes(
      STORAGE_NOTABLE_BYTES
    )} ou mais somam ${formatBytes(total)}. A lista cobre os 500 maiores da análise.`,
    bytes: total,
    items: large
      .slice(0, MAX_ITEMS)
      .map((file) => ({ path: file.path, note: formatBytes(file.bytes) }))
  }
}

/**
 * Folders whose name matches one category, grouped into one suggestion.
 *
 * A matched folder is not searched again: a `.cache` inside `Temp` would
 * otherwise be counted twice, and its bytes shown as extra savings that do not
 * exist. `claimed` carries the paths already named by an earlier category.
 */
function folderSuggestion(
  kind: StorageSuggestionKind,
  title: string,
  names: Set<string>,
  tree: StorageNode,
  claimed: Set<string>,
  detail: (count: number, bytes: string) => string
): StorageSuggestion | null {
  const matches = matchingFolders(tree, names, claimed)
  const total = matches.reduce((sum, node) => sum + node.bytes, 0)
  if (total < STORAGE_NOTABLE_BYTES) return null

  for (const node of matches) claimed.add(node.path)

  return {
    kind,
    title,
    detail: detail(matches.length, formatBytes(total)),
    bytes: total,
    items: matches
      .slice(0, MAX_ITEMS)
      .map((node) => ({ path: node.path, note: formatBytes(node.bytes) }))
  }
}

/** Search never starts at the root: the chosen folder itself is not advice. */
function matchingFolders(
  tree: StorageNode,
  names: Set<string>,
  claimed: Set<string>
): StorageNode[] {
  const found: StorageNode[] = []
  const stack: StorageNode[] = [...tree.children]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    if (claimed.has(node.path)) continue
    if (names.has(normalizeName(node.name))) {
      found.push(node)
      continue
    }
    for (const child of node.children) stack.push(child)
  }
  return found.sort((a, b) => b.bytes - a.bytes)
}

function normalizeName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Folders that grew since the previous scan of the same root.
 *
 * Both conditions are needed: 1 GB of growth in a 2 TB folder is noise, and
 * 50% growth in a 10 MB folder is not worth a card.
 *
 * The scanned root itself only appears when nothing inside it qualifies: its
 * change is the total, which the summary already shows, and naming it next to
 * a child would count the same bytes twice. When both a folder and its parent
 * grew, the parent is kept - the child's bytes are part of the parent's, and
 * two cards for one pile of files help nobody.
 */
function growthSuggestion(
  report: StorageReport,
  previous: StorageSnapshot | null | undefined
): StorageSuggestion | null {
  if (!previous) return null
  const before = new Map(previous.folders.map((folder) => [folder.path, folder.bytes]))
  const candidates: Array<{ node: StorageNode; delta: number }> = []
  let rootDelta: number | null = null

  const stack: StorageNode[] = [report.tree]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    for (const child of node.children) stack.push(child)

    const previousBytes = before.get(node.path)
    if (previousBytes === undefined) continue
    const delta = node.bytes - previousBytes
    if (delta < STORAGE_GROWTH_MIN_BYTES) continue
    const percent = previousBytes > 0 ? (delta / previousBytes) * 100 : Number.POSITIVE_INFINITY
    if (percent < STORAGE_GROWTH_PERCENT) continue
    if (node.path === report.root) {
      rootDelta = delta
      continue
    }
    candidates.push({ node, delta })
  }

  const topmost = withoutNestedCandidates(candidates)
  if (topmost.length === 0) {
    if (rootDelta === null) return null
    return growthResult([{ node: report.tree, delta: rootDelta }])
  }
  return growthResult(topmost)
}

/** Drops a candidate whose parent is also a candidate (same bytes, twice). */
function withoutNestedCandidates(
  candidates: Array<{ node: StorageNode; delta: number }>
): Array<{ node: StorageNode; delta: number }> {
  const paths = new Set(candidates.map((entry) => entry.node.path))
  // The topmost candidate of each branch is always kept: it has no candidate
  // ancestor by definition, so the list can never become empty here.
  return candidates.filter((entry) => {
    let parent = dirname(entry.node.path)
    while (parent !== entry.node.path) {
      if (paths.has(parent)) return false
      const next = dirname(parent)
      if (next === parent) break
      parent = next
    }
    return true
  })
}

function growthResult(entries: Array<{ node: StorageNode; delta: number }>): StorageSuggestion {
  const grown = entries.slice().sort((a, b) => b.delta - a.delta)
  return {
    kind: 'growth',
    title: 'Pastas que cresceram',
    detail: `${grown.length} pasta(s) cresceram pelo menos ${formatBytes(
      STORAGE_GROWTH_MIN_BYTES
    )} e ${STORAGE_GROWTH_PERCENT}% desde a análise anterior.`,
    bytes: grown.reduce((sum, entry) => sum + entry.delta, 0),
    items: grown
      .slice(0, MAX_ITEMS)
      .map((entry) => ({ path: entry.node.path, note: `+${formatBytes(entry.delta)}` }))
  }
}
