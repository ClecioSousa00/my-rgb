/**
 * Conflict detection tests.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { copyFileSync, mkdtempSync, rmSync } from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { detectConflicts } from '@main/platform/conflict'

const FAKE_NAME = 'openrgb'
const tempDirs: string[] = []
const started: ChildProcess[] = []

afterEach(async () => {
  for (const child of started.splice(0)) {
    try { child.kill('SIGKILL') } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 300))
  for (const dir of tempDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

function startFakeConflict(name = FAKE_NAME): ChildProcess {
  const dir = mkdtempSync(join(tmpdir(), 'myrgb-conflict-'))
  tempDirs.push(dir)
  const binary = join(dir, name)
  copyFileSync('/bin/sleep', binary)
  const child = spawn(binary, ['120'], { stdio: 'ignore' })
  started.push(child)
  return child
}

async function stopFake(child: ChildProcess): Promise<void> {
  try { child.kill('SIGKILL') } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

async function waitForDetection(timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const report = await detectConflicts('linux')
    if (report.conflicting && report.processes.some(p => p.name.toLowerCase().includes('openrgb'))) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

describe('conflict detection', () => {
  it('never reports the application itself as a conflict', async () => {
    const report = await detectConflicts('linux')
    const own = ['my-rgb', 'electron', 'vitest', 'node', 'npm', 'npx', 'pnpm', 'yarn']
    for (const process of report.processes) {
      expect(own).not.toContain(process.name.toLowerCase())
    }
  })

  it('notices another program driving the controller', async () => {
    startFakeConflict()
    expect(await waitForDetection()).toBe(true)
  }, 30000)

  it('gives a hint about what to do', async () => {
    startFakeConflict()
    expect(await waitForDetection()).toBe(true)
    const report = await detectConflicts('linux')
    expect(report.hint.length).toBeGreaterThan(0)
    expect(report.hint.toLowerCase()).toContain('openrgb')
  }, 30000)

  it('stops reporting the conflict once the program is gone', async () => {
    const child = startFakeConflict()
    expect(await waitForDetection()).toBe(true)
    await stopFake(child)
    const report = await detectConflicts('linux')
    expect(report.conflicting).toBe(false)
  }, 35000)

  it('has a known list of conflicting programs per platform', async () => {
    const report = await detectConflicts('win32')
    expect(report.hint.length).toBeGreaterThan(0)
  })
})
