/**
 * Pure view helpers for the storage analysis.
 *
 * The rendering is easy to get wrong in a way tests do not see; the sorting,
 * the search and the extension filter are not, so they live here, free of
 * React, and are covered by unit tests.
 *
 * The ranking is already capped by the walk (the 500 largest files). These
 * helpers never widen it; they only decide the order and what is visible.
 */

import type { StorageFile } from './storage'

export type StorageFileSort = 'size' | 'name'

export interface StorageFileQuery {
  /** Free text matched against the file name, case-insensitive. */
  text: string
  /** Lower-case extension without the dot; empty means every extension. */
  ext: string
  sort: StorageFileSort
}

/** Extensions present in the ranking, sorted, without the dot. */
export function storageExtensions(files: StorageFile[]): string[] {
  const seen = new Set<string>()
  for (const file of files) {
    if (file.ext) seen.add(file.ext)
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Case- and accent-insensitive text, so "video" finds "Vídeo". */
function normalizeText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

/** What the list shows after search, extension filter and ordering. */
export function filterStorageFiles(
  files: StorageFile[],
  query: StorageFileQuery
): StorageFile[] {
  const text = normalizeText(query.text)
  const ext = normalizeText(query.ext).replace(/^\./, '')

  const filtered = files.filter((file) => {
    if (ext && file.ext !== ext) return false
    if (text && !normalizeText(file.name).includes(text)) return false
    return true
  })

  // `slice` keeps the caller's array untouched: the report is shared with the
  // page and with the main process, and reordering it in place would change
  // the "last report" shown when the page is opened again.
  return filtered.slice().sort((a, b) => {
    if (query.sort === 'name') {
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true })
    }
    // Biggest first; equal sizes fall back to the name so the list is stable.
    if (b.bytes !== a.bytes) return b.bytes - a.bytes
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true })
  })
}

/**
 * Share of the analysed total, 0-100.
 *
 * `undefined` when the total is not positive: a 0% label on an empty scan
 * would look measured, and there is nothing to compare against.
 */
export function storageShare(bytes: number, total: number): number | undefined {
  if (!Number.isFinite(bytes) || !Number.isFinite(total) || total <= 0) return undefined
  return Math.max(0, Math.min(100, (bytes / total) * 100))
}
