/**
 * Conflict detection tests.
 *
 * The detection shells out to the process list, so these are integration
 * tests: they put a process with a conflicting name on the machine and check
 * that the app notices it.
 *
 * The fake process is a copy of `sleep` renamed to the name of the program
 * we are looking for - `ps -eo comm=` reports the executable name, which is
 * exactly what the detector reads.
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
    child.kill('SIGKILL')
  }
  await new Promise((resolve) => setTimeout(resolve, 100))
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Start a process whose name looks like a conflicting program. */
function startFakeConflict(name = FAKE_NAME): ChildProcess {
  const dir = mkdtempSync(join(tmpdir(), 'myrgb-conflict-'))
  tempDirs.push(dir)
  const binary = join(dir, name)
  copyFileSync('/bin/sleep', binary)
  const child = spawn(binary, ['30'], { stdio: 'ignore' })
  started.push(child)
  return child
}

/** Stop a process and wait until it is really gone from the process list. */
async function stopFake(child: ChildProcess): Promise<void> {
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  child.kill('SIGKILL')
  await exited
  // A killed process stays in the list as a zombie until the parent reaps
  // it, so give the reaper a moment.
  await new Promise((resolve) => setTimeout(resolve, 200))
}

/** Wait until the detector sees the fake process, or give up. */
async function waitForDetection(timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const report = await detectConflicts('linux')
    if (report.conflicting) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

describe('conflict detection', () => {
  it('never reports the application itself as a conflict', async () => {
    const report = await detectConflicts('linux')
    const own = ['my-rgb', 'electron', 'vitest', 'node']
    for (const process of report.processes) {
      expect(own).not.toContain(process.name.toLowerCase())
    }
  })

  it('notices another program driving the controller', async () => {
    startFakeConflict()
    expect(await waitForDetection()).toBe(true)
  })

  it('gives a hint about what to do', async () => {
    startFakeConflict()
    expect(await waitForDetection()).toBe(true)

    const report = await detectConflicts('linux')
    expect(report.hint.length).toBeGreaterThan(0)
    expect(report.hint.toLowerCase()).toContain('openrgb')
  })

  it('stops reporting the conflict once the program is gone', async () => {
    const child = startFakeConflict()
    expect(await waitForDetection()).toBe(true)

    await stopFake(child)

    const report = await detectConflicts('linux')
    expect(report.conflicting).toBe(false)
  })

  it('has a known list of conflicting programs per platform', async () => {
    // Windows has its own suspects; the detector must not fall back to an
    // empty list there.
    const report = await detectConflicts('win32')
    expect(report.hint.length).toBeGreaterThan(0)
  })
})
