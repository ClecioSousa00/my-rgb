/**
 * Game detection.
 *
 * The detection is by install layout, not by a database, so the tests are
 * real folder shapes: Steam's `steamapps/common`, `Epic Games/...`,
 * `Riot Games/...`. The point of every "not a game" case is that nothing is
 * invented: a runtime, a launcher or an unrelated folder is not listed.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { StorageReport } from '@shared/features/storage'
import { walkStorage } from '@main/features/storage/walk'

const roots: string[] = []

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'myrgb-storage-games-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

/** Creates `path` (relative to root) with a file of `bytes` inside. */
async function folder(root: string, path: string, bytes: number, file = 'dados.bin'): Promise<void> {
  const dir = join(root, path)
  await mkdir(dir, { recursive: true })
  if (bytes > 0) await writeFile(join(dir, file), Buffer.alloc(bytes))
}

async function scan(root: string): Promise<StorageReport> {
  return walkStorage({ root })
}

function names(report: StorageReport): string[] {
  return report.games.map((game) => game.name)
}

describe('Steam', () => {
  it('lists a game folder under steamapps/common with its size', async () => {
    const root = await fixture()
    await folder(root, 'SteamLibrary/steamapps/common/Jogo A', 4000)
    await folder(root, 'SteamLibrary/steamapps/common/Jogo B', 9000)

    const report = await scan(root)
    expect(report.games.map((game) => [game.name, game.platform, game.bytes])).toEqual([
      ['Jogo B', 'steam', 9000],
      ['Jogo A', 'steam', 4000]
    ])
    expect(report.games[0].files).toBe(1)
    expect(report.games[0].path).toBe(join(root, 'SteamLibrary/steamapps/common/Jogo B'))
    expect(report.games[0].nameSource).toBe('folder')
  })

  it('uses the name from appmanifest when there is one', async () => {
    const root = await fixture()
    await folder(root, 'steamapps/common/Jogo Pasta', 1000)
    await writeFile(
      join(root, 'steamapps/appmanifest_10.acf'),
      '"AppState"\n{\n\t"appid"\t\t"10"\n\t"name"\t\t"Jogo Nome Bonito"\n\t"installdir"\t\t"Jogo Pasta"\n}\n'
    )

    const report = await scan(root)
    expect(report.games).toHaveLength(1)
    expect(report.games[0].name).toBe('Jogo Nome Bonito')
    expect(report.games[0].nameSource).toBe('manifest')
  })

  it('ignores a manifest that names a folder that is not there', async () => {
    const root = await fixture()
    await folder(root, 'steamapps/common/Jogo Pasta', 1000)
    await writeFile(
      join(root, 'steamapps/appmanifest_11.acf'),
      '"AppState"\n{\n\t"name"\t\t"Jogo Removido"\n\t"installdir"\t\t"Outra Pasta"\n}\n'
    )

    expect(names(await scan(root))).toEqual(['Jogo Pasta'])
  })

  it('survives a malformed manifest', async () => {
    const root = await fixture()
    await folder(root, 'steamapps/common/Jogo Pasta', 1000)
    await writeFile(join(root, 'steamapps/appmanifest_12.acf'), '\u0000lixo sem chaves')

    expect(names(await scan(root))).toEqual(['Jogo Pasta'])
  })

  it('does not list Proton or Steam Linux Runtime as games', async () => {
    const root = await fixture()
    await folder(root, 'steamapps/common/Proton - Experimental', 7000)
    await folder(root, 'steamapps/common/SteamLinuxRuntime_sniper', 8000)
    await folder(root, 'steamapps/common/SteamVR', 6000)
    await folder(root, 'steamapps/common/Steamworks Shared', 5000)
    await folder(root, 'steamapps/common/Jogo de Verdade', 1000)

    expect(names(await scan(root))).toEqual(['Jogo de Verdade'])
  })

  it('does not treat common/ outside steamapps as a library', async () => {
    const root = await fixture()
    await folder(root, 'outra/common/Jogo Falso', 1000)

    expect(await scan(root).then((report) => report.games)).toEqual([])
  })
})

describe('Epic and Riot', () => {
  it('lists Epic Games folders', async () => {
    const root = await fixture()
    await folder(root, 'Program Files/Epic Games/Fortnite', 12_000)
    await folder(root, 'Program Files/Epic Games/Launcher', 9000)

    const report = await scan(root)
    expect(report.games.map((game) => [game.name, game.platform])).toEqual([['Fortnite', 'epic']])
  })

  it('lists Riot Games folders', async () => {
    const root = await fixture()
    await folder(root, 'Riot Games/League of Legends', 3000)
    await folder(root, 'Riot Games/VALORANT', 5000)
    await folder(root, 'Riot Games/Riot Client', 9000)

    const report = await scan(root)
    expect(report.games.map((game) => [game.name, game.platform])).toEqual([
      ['VALORANT', 'riot'],
      ['League of Legends', 'riot']
    ])
  })

  it('is case-insensitive about the launcher folder', async () => {
    const root = await fixture()
    await folder(root, 'epic games/Meu Jogo', 1000)
    await folder(root, 'RIOT GAMES/Outro Jogo', 2000)

    expect((await scan(root)).games.map((game) => game.platform).sort()).toEqual(['epic', 'riot'])
  })
})

describe('sizes, order and limits', () => {
  it('keeps a game that the tree had to prune', async () => {
    const root = await fixture()
    // 25 games under one launcher folder: the tree keeps 20 children, but the
    // list of games must not lose any.
    for (let index = 0; index < 25; index++) {
      await folder(root, `Epic Games/Jogo ${index}`, 1000 + index)
    }

    const report = await scan(root)
    expect(report.games).toHaveLength(25)
    expect(report.tree.children[0].children).toHaveLength(20)
    expect(report.tree.children[0].more).toBe(true)
  })

  it('sorts by size, biggest first', async () => {
    const root = await fixture()
    await folder(root, 'Epic Games/Pequeno', 100)
    await folder(root, 'Epic Games/Grande', 9000)
    await folder(root, 'Riot Games/Medio', 5000)

    expect(names(await scan(root))).toEqual(['Grande', 'Medio', 'Pequeno'])
  })

  it('caps the list and says how many were left out', async () => {
    const root = await fixture()
    const total = 305
    for (let index = 0; index < total; index++) {
      await folder(root, `Epic Games/Jogo ${index}`, 1)
    }

    const report = await scan(root)
    expect(report.games).toHaveLength(300)
    expect(report.notes.join(' ')).toMatch(new RegExp(`Foram encontradas ${total} pastas de jogos`))
  })

  it('finds nothing in a folder without launchers', async () => {
    const root = await fixture()
    await folder(root, 'Documentos', 1000)
    await folder(root, 'Downloads/Jogo A', 1000)

    const report = await scan(root)
    expect(report.games).toEqual([])
    expect(report.notes).toEqual([])
  })
})
