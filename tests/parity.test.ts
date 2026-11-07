/**
 * Linux ↔ Windows frame parity.
 *
 * The engine is a pure function of (time, profile), so a dump rendered on
 * Linux and a dump rendered on Windows must be byte identical. The manual
 * proof is `--dump-frames` + `tools/compare-frames.mjs`; this test makes the
 * same proof run in CI, where there is no AURA hardware:
 *
 *   - it renders a dump with the fixed synthetic layout (the same one used by
 *     `--dump-offline`), through the real `runFrameDump` path;
 *   - it compares every frame against a golden fixture committed to the repo.
 *
 * The Linux CI job and the Windows CI job both run this test. If either
 * platform drifts, its hash no longer matches the fixture and the build fails.
 * The golden file is platform independent by construction: it is only a list
 * of SHA-256 digests.
 *
 * Regenerate it after an intentional rendering change:
 *
 *   npm run parity:golden
 */

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { runFrameDump, SYNTHETIC_LAYOUT, syntheticDumpInput } from '@main/dumpFrames'

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/parity-frames.json', import.meta.url))
const COMPARE_TOOL = fileURLToPath(new URL('../tools/compare-frames.mjs', import.meta.url))
const FRAME_COUNT = 60
const FPS = 30

interface ParityFixture {
  layout: typeof SYNTHETIC_LAYOUT
  fps: number
  frameCount: number
  zoneLedCounts: number[]
  sha256: string[]
}

const tempDirs: string[] = []

function tempDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `myrgb-${label}-`))
  tempDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

async function renderFixture(): Promise<ParityFixture> {
  const { profile, zones } = syntheticDumpInput()
  const outDir = tempDir('parity')

  const files = await runFrameDump({
    outDir,
    frameCount: FRAME_COUNT,
    profile,
    zones,
    device: null
  })

  const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) as {
    fps: number
    frameCount: number
    zones: Array<{ id: string; ledCount: number }>
  }

  return {
    layout: SYNTHETIC_LAYOUT,
    fps: manifest.fps,
    frameCount: manifest.frameCount,
    zoneLedCounts: manifest.zones.map((zone) => zone.ledCount),
    sha256: files.map((file) => sha256(readFileSync(file)))
  }
}

function runCompare(dirA: string, dirB: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [COMPARE_TOOL, dirA, dirB], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
}

describe('Linux/Windows frame parity', () => {
  it('renders the committed number of frames with the fixed layout', async () => {
    if (process.env.MYRGB_UPDATE_PARITY === '1') return // the next test writes it
    const actual = await renderFixture()
    const golden = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as ParityFixture

    expect(actual.layout).toEqual(golden.layout)
    expect(actual.fps).toBe(FPS)
    expect(actual.frameCount).toBe(golden.frameCount)
    expect(actual.zoneLedCounts).toEqual(golden.zoneLedCounts)
    expect(actual.sha256).toHaveLength(golden.frameCount)
  })

  it('matches the golden frames byte for byte', async () => {
    const actual = await renderFixture()

    // Update the fixture on purpose, not by accident.
    if (process.env.MYRGB_UPDATE_PARITY === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8')
      return
    }

    const golden = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as ParityFixture

    const differing = actual.sha256
      .map((hash, index) => (hash === golden.sha256[index] ? null : index))
      .filter((index): index is number => index !== null)

    expect(
      differing,
      differing.length === 0
        ? ''
        : `frame(s) ${differing.slice(0, 5).join(', ')} differ from the golden ` +
            'fixture. If the rendering change was intentional, run `npm run parity:golden`.'
    ).toEqual([])
  })

  it('proves the compare-frames tool accepts identical dumps', async () => {
    const dirA = tempDir('compare-a')
    const dirB = tempDir('compare-b')
    const { profile, zones } = syntheticDumpInput()

    for (const outDir of [dirA, dirB]) {
      await runFrameDump({ outDir, frameCount: 5, profile, zones, device: null })
    }

    const result = runCompare(dirA, dirB)
    expect(result.status, String(result.stderr)).toBe(0)
    expect(result.stdout).toContain('IDENTICAL: 5 frames match byte for byte')
  })

  it('rejects a dump whose profile/layout differs', async () => {
    const dirA = tempDir('compare-manifest-a')
    const dirB = tempDir('compare-manifest-b')
    const { profile, zones } = syntheticDumpInput()

    await runFrameDump({ outDir: dirA, frameCount: 5, profile, zones, device: null })
    await runFrameDump({ outDir: dirB, frameCount: 5, profile, zones, device: null })

    // Same frames, different manifest: this is what a dump from another
    // motherboard (or another profile) looks like.
    const manifest = JSON.parse(readFileSync(join(dirB, 'manifest.json'), 'utf8')) as {
      zones: Array<{ id: string; ledCount: number }>
    }
    manifest.zones[0].ledCount += 1
    writeFileSync(join(dirB, 'manifest.json'), JSON.stringify(manifest), 'utf8')

    const result = runCompare(dirA, dirB)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('manifest.json differs')
  })

  it('rejects a dump with a single altered byte', async () => {
    const dirA = tempDir('compare-byte-a')
    const dirB = tempDir('compare-byte-b')
    const { profile, zones } = syntheticDumpInput()

    await runFrameDump({ outDir: dirA, frameCount: 5, profile, zones, device: null })
    await runFrameDump({ outDir: dirB, frameCount: 5, profile, zones, device: null })

    const frame = join(dirB, 'frame-000000.bin')
    const bytes = readFileSync(frame)
    bytes[bytes.length - 1] ^= 0xff
    writeFileSync(frame, bytes)

    const result = runCompare(dirA, dirB)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('MISMATCH frame-000000.bin')
  })
})
