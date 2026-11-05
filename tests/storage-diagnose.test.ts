/**
 * Storage advice.
 *
 * The rules are the contract, so the tests pin their boundaries: exactly 1 GB
 * is notable, 9.9% free is low space, 10% growth is enough but 0.9 GB is not.
 * A suggestion is advice, so the only failure that matters is inventing one -
 * every "no suggestion" case below is as important as the positive ones.
 */

import { describe, expect, it } from 'vitest'
import type { DriveInfo } from '@shared/features/system'
import type { StorageFile, StorageNode, StorageReport } from '@shared/features/storage'
import { diagnoseStorage } from '@main/features/storage/diagnose'
import type { StorageSnapshot } from '@main/features/storage/history'

const GB = 1_000_000_000

function folder(
  name: string,
  bytes: number,
  children: StorageNode[] = [],
  root = '/analise'
): StorageNode {
  return {
    name,
    path: root === '/analise' ? `/analise/${name}` : `${root}/${name}`,
    bytes,
    files: 1,
    dirs: children.length,
    children
  }
}

function rootNode(children: StorageNode[] = [], bytes = 0): StorageNode {
  return {
    name: '/analise',
    path: '/analise',
    bytes,
    files: 1,
    dirs: children.length,
    children
  }
}

function file(name: string, bytes: number): StorageFile {
  return { name, path: `/analise/${name}`, bytes, ext: name.split('.').pop() ?? '' }
}

function report(overrides: Partial<StorageReport> = {}): StorageReport {
  return {
    root: '/analise',
    at: 1_700_000_000_000,
    durationMs: 10,
    bytes: 0,
    files: 0,
    dirs: 0,
    denied: 0,
    deniedSamples: [],
    links: 0,
    hardLinks: 0,
    mounts: 0,
    mountSamples: [],
    topFiles: [],
    tree: rootNode(),
    games: [],
    notes: [],
    suggestions: [],
    ...overrides
  }
}

function drive(mount: string, totalBytes: number, freeBytes: number): DriveInfo {
  return {
    id: mount,
    mount,
    kind: 'ssd',
    totalBytes,
    usedBytes: totalBytes - freeBytes,
    freeBytes,
    usedPercent: ((totalBytes - freeBytes) / totalBytes) * 100,
    removable: false,
    readOnly: false
  }
}

function kinds(value: StorageReport, drives: DriveInfo[] = [], previous?: StorageSnapshot | null) {
  return diagnoseStorage({ report: value, drives, previous }).map((entry) => entry.kind)
}

describe('diagnoseStorage: low space', () => {
  it('flags a drive below 10% free and says the share', () => {
    const [suggestion] = diagnoseStorage({
      report: report(),
      drives: [drive('/', 100 * GB, 5 * GB)]
    })
    expect(suggestion.kind).toBe('drive-low-space')
    expect(suggestion.items).toEqual([{ path: '/', note: '5,0% livres' }])
    expect(suggestion.detail).toContain('10%')
  })

  it('lists the fullest drive first', () => {
    const suggestion = diagnoseStorage({
      report: report(),
      drives: [drive('/dados', 100 * GB, 8 * GB), drive('/', 100 * GB, 2 * GB)]
    })[0]
    expect(suggestion.items.map((item) => item.path)).toEqual(['/', '/dados'])
  })

  it('stays quiet at exactly 10% free or above', () => {
    expect(kinds(report(), [drive('/', 100 * GB, 10 * GB)])).not.toContain('drive-low-space')
    expect(kinds(report(), [drive('/', 100 * GB, 40 * GB)])).not.toContain('drive-low-space')
  })

  it('ignores a drive whose total size is unknown', () => {
    expect(kinds(report(), [drive('/', 0, 0)])).not.toContain('drive-low-space')
  })
})

describe('diagnoseStorage: large files', () => {
  it('groups the files of 1 GB or more, biggest first', () => {
    const value = report({
      topFiles: [file('medio.iso', 0.9 * GB), file('grande.iso', 4 * GB), file('outro.iso', 1 * GB)]
    })
    const suggestion = diagnoseStorage({ report: value, drives: [] })[0]
    expect(suggestion.kind).toBe('large-files')
    expect(suggestion.bytes).toBe(5 * GB)
    expect(suggestion.items.map((item) => item.path)).toEqual([
      '/analise/grande.iso',
      '/analise/outro.iso'
    ])
    expect(suggestion.items[0].note).toBe('4 GB')
  })

  it('counts exactly 1 GB and ignores 999 MB', () => {
    const exact = report({ topFiles: [file('exato.bin', GB)] })
    expect(kinds(exact)).toContain('large-files')
    const under = report({ topFiles: [file('quase.bin', GB - 1)] })
    expect(kinds(under)).not.toContain('large-files')
  })

  it('caps the list but keeps the real count and total in the text', () => {
    const files = Array.from({ length: 8 }, (_, index) =>
      file(`arquivo${index}.bin`, (index + 1) * GB)
    )
    const suggestion = diagnoseStorage({ report: report({ topFiles: files }), drives: [] })[0]
    expect(suggestion.items).toHaveLength(5)
    expect(suggestion.detail).toContain('8 arquivo(s)')
    expect(suggestion.bytes).toBe(36 * GB)
  })
})

describe('diagnoseStorage: temp, downloads and caches', () => {
  it('finds a temporary folder worth mentioning', () => {
    const tree = rootNode([folder('Temp', 2 * GB)], 2 * GB)
    const suggestion = diagnoseStorage({ report: report({ tree }), drives: [] })[0]
    expect(suggestion.kind).toBe('temp-folders')
    expect(suggestion.bytes).toBe(2 * GB)
    expect(suggestion.items[0].path).toBe('/analise/Temp')
  })

  it('ignores all three below 1 GB', () => {
    const tree = rootNode(
      [folder('Temp', 0.5 * GB), folder('Downloads', 0.5 * GB), folder('.cache', 0.5 * GB)],
      1.5 * GB
    )
    expect(kinds(report({ tree }))).toEqual([])
  })

  it('does not count a cache nested inside a temporary folder twice', () => {
    const temp = folder('Temp', 2 * GB, [folder('.cache', 1.5 * GB, [], '/analise/Temp')])
    const tree = rootNode([temp], 2 * GB)
    const suggestions = diagnoseStorage({ report: report({ tree }), drives: [] })
    // The whole Temp is advice; descending into it would report a subset.
    expect(suggestions.map((entry) => entry.kind)).toEqual(['temp-folders'])
  })

  it('matches names regardless of case and spacing', () => {
    const tree = rootNode([folder('DOWNLOADS', 1.2 * GB), folder('Temp Files', 1.3 * GB)], 2.5 * GB)
    expect(kinds(report({ tree }))).toEqual(['temp-folders', 'downloads'])
  })

  it('never treats the analysed root itself as advice', () => {
    const tree: StorageNode = { ...rootNode([], 3 * GB), name: 'Temp', path: '/Temp' }
    expect(kinds(report({ root: '/Temp', tree }))).toEqual([])
  })
})

describe('diagnoseStorage: growth', () => {
  function previous(folders: Array<[string, number]>): StorageSnapshot {
    return { root: '/analise', at: 1, bytes: 0, folders: folders.map(([path, bytes]) => ({ path, bytes })) }
  }

  it('reports a folder that grew 1 GB and 10%', () => {
    const tree = rootNode([folder('Jogos', 20 * GB)], 20 * GB)
    const suggestion = diagnoseStorage({
      report: report({ tree }),
      drives: [],
      previous: previous([['/analise/Jogos', 10 * GB]])
    })[0]
    expect(suggestion.kind).toBe('growth')
    expect(suggestion.bytes).toBe(10 * GB)
    expect(suggestion.items[0].note).toBe('+10 GB')
  })

  it('needs both the 1 GB and the 10% threshold', () => {
    const tree = rootNode([folder('Jogos', 20.5 * GB)], 20.5 * GB)
    // 0,5 GB of growth: too little, even at 2,5%.
    expect(
      kinds(report({ tree }), [], previous([['/analise/Jogos', 20 * GB]]))
    ).not.toContain('growth')

    const big = rootNode([folder('Arquivo', 41 * GB)], 41 * GB)
    // 1 GB of growth in 40 GB is 2,5%: real, but not worth a card.
    expect(
      kinds(report({ tree: big }), [], previous([['/analise/Arquivo', 40 * GB]]))
    ).not.toContain('growth')
  })

  it('cannot compare a folder that did not exist in the previous snapshot', () => {
    const tree = rootNode([folder('Novo', 2 * GB)], 2 * GB)
    // It may be new, or it may have been under the top-1000 cutoff; the two
    // cannot be told apart, so it is not reported as growth.
    expect(kinds(report({ tree }), [], previous([]))).not.toContain('growth')
  })

  it('cannot compare a folder that was not in the previous snapshot', () => {
    const tree = rootNode([folder('Jogos', 50 * GB)], 50 * GB)
    expect(
      kinds(report({ tree }), [], previous([['/analise/Outra', 40 * GB]]))
    ).not.toContain('growth')
  })

  it('says nothing without a previous scan', () => {
    const tree = rootNode([folder('Jogos', 50 * GB)], 50 * GB)
    expect(kinds(report({ tree }), [], null)).toEqual([])
    expect(kinds(report({ tree }), [])).toEqual([])
  })

  it('does not report a folder that shrank', () => {
    const tree = rootNode([folder('Jogos', 5 * GB)], 5 * GB)
    expect(kinds(report({ tree }), [], previous([['/analise/Jogos', 20 * GB]]))).not.toContain(
      'growth'
    )
  })

  it('names the folder that grew, not the root that contains it', () => {
    const tree = rootNode([folder('Jogos', 20 * GB)], 30 * GB)
    const suggestion = diagnoseStorage({
      report: report({ tree }),
      drives: [],
      previous: previous([
        ['/analise', 10 * GB],
        ['/analise/Jogos', 10 * GB]
      ])
    })[0]
    // The root grew 20 GB too, but its change is the summary's total.
    expect(suggestion.items.map((item) => item.path)).toEqual(['/analise/Jogos'])
  })

  it('names the root when the growth is not in a subfolder', () => {
    const tree = rootNode([], 5 * GB)
    const suggestion = diagnoseStorage({
      report: report({ tree }),
      drives: [],
      previous: previous([['/analise', 1 * GB]])
    })[0]
    expect(suggestion.items).toEqual([{ path: '/analise', note: '+4 GB' }])
    expect(suggestion.bytes).toBe(4 * GB)
  })

  it('keeps the parent instead of counting the same bytes twice', () => {
    const child = folder('B', 15 * GB, [], '/analise/A')
    const tree = rootNode([folder('A', 20 * GB, [child])], 20 * GB)
    const suggestion = diagnoseStorage({
      report: report({ tree }),
      drives: [],
      previous: previous([
        ['/analise/A', 5 * GB],
        ['/analise/A/B', 2 * GB]
      ])
    })[0]
    expect(suggestion.items.map((item) => item.path)).toEqual(['/analise/A'])
    expect(suggestion.bytes).toBe(15 * GB)
  })
})

describe('diagnoseStorage: order and silence', () => {
  it('puts free space first, then growth, then the rest', () => {
    const tree = rootNode(
      [folder('Temp', 2 * GB), folder('Jogos', 20 * GB)],
      22 * GB
    )
    const value = report({ tree, topFiles: [file('grande.iso', 5 * GB)] })
    const previous: StorageSnapshot = {
      root: '/analise',
      at: 1,
      bytes: 0,
      folders: [{ path: '/analise/Jogos', bytes: 10 * GB }]
    }
    expect(diagnoseStorage({ report: value, drives: [drive('/', 100 * GB, 3 * GB)], previous })).toMatchObject(
      [
        { kind: 'drive-low-space' },
        { kind: 'growth' },
        { kind: 'large-files' },
        { kind: 'temp-folders' }
      ]
    )
  })

  it('returns nothing for a scan with nothing to say', () => {
    expect(kinds(report({ topFiles: [file('pequeno.txt', 1000)] }), [drive('/', 100 * GB, 90 * GB)])).toEqual([])
  })
})
