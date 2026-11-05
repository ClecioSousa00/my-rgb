/**
 * Storage view helpers.
 *
 * The ranking itself is trusted to the walk; these tests cover the part the
 * user controls - search, extension filter and ordering - including the two
 * easy mistakes: mutating the report and comparing "file10" before "file2".
 */

import { describe, expect, it } from 'vitest'
import type { StorageFile } from '@shared/features/storage'
import {
  filterStorageFiles,
  storageExtensions,
  storageShare
} from '@shared/features/storage-view'

function file(name: string, bytes: number, ext = ''): StorageFile {
  return { name, path: `/tmp/${name}`, bytes, ext }
}

const files: StorageFile[] = [
  file('b.iso', 300, 'iso'),
  file('a.iso', 100, 'iso'),
  file('Vídeo.mp4', 200, 'mp4'),
  file('README', 50)
]

describe('storageExtensions', () => {
  it('lists each extension once, sorted, without the empty one', () => {
    expect(storageExtensions(files)).toEqual(['iso', 'mp4'])
  })
})

describe('filterStorageFiles', () => {
  it('sorts by size, biggest first, with the name as the tie-breaker', () => {
    const result = filterStorageFiles(files, { text: '', ext: '', sort: 'size' })
    expect(result.map((entry) => entry.name)).toEqual(['b.iso', 'Vídeo.mp4', 'a.iso', 'README'])
  })

  it('sorts by name naturally, ignoring case', () => {
    const result = filterStorageFiles(
      [file('file10.txt', 1, 'txt'), file('file2.txt', 1, 'txt'), file('File1.txt', 1, 'txt')],
      { text: '', ext: '', sort: 'name' }
    )
    expect(result.map((entry) => entry.name)).toEqual(['File1.txt', 'file2.txt', 'file10.txt'])
  })

  it('searches by name, ignoring case and accents', () => {
    expect(
      filterStorageFiles(files, { text: 'video', ext: '', sort: 'size' }).map((f) => f.name)
    ).toEqual(['Vídeo.mp4'])
    expect(
      filterStorageFiles(files, { text: 'vídeo', ext: '', sort: 'size' }).map((f) => f.name)
    ).toEqual(['Vídeo.mp4'])
  })

  it('filters by extension, with or without a leading dot', () => {
    expect(
      filterStorageFiles(files, { text: '', ext: 'ISO', sort: 'size' }).map((f) => f.name)
    ).toEqual(['b.iso', 'a.iso'])
    expect(
      filterStorageFiles(files, { text: '', ext: '.iso', sort: 'size' }).map((f) => f.name)
    ).toEqual(['b.iso', 'a.iso'])
  })

  it('combines search and extension', () => {
    expect(
      filterStorageFiles(files, { text: 'iso', ext: 'iso', sort: 'size' }).map((f) => f.name)
    ).toEqual(['b.iso', 'a.iso'])
    expect(
      filterStorageFiles(files, { text: 'readme', ext: 'iso', sort: 'size' })
    ).toHaveLength(0)
  })

  it('never reorders the report array', () => {
    const original = files.map((entry) => entry.name)
    filterStorageFiles(files, { text: '', ext: '', sort: 'name' })
    expect(files.map((entry) => entry.name)).toEqual(original)
  })
})

describe('storageShare', () => {
  it('is the percentage of the analysed total', () => {
    expect(storageShare(25, 100)).toBe(25)
    expect(storageShare(1, 3)).toBeCloseTo(33.333, 3)
  })

  it('has no value when there is nothing to compare against', () => {
    expect(storageShare(0, 0)).toBeUndefined()
    expect(storageShare(10, 0)).toBeUndefined()
  })

  it('clamps to 0-100 instead of showing a negative or over-100 share', () => {
    expect(storageShare(-5, 100)).toBe(0)
    expect(storageShare(150, 100)).toBe(100)
  })
})
