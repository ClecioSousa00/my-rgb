/**
 * Regenerates tests/fixtures/parity-frames.json.
 *
 * The frame fixture is a list of SHA-256 digests of the deterministic dump.
 * Run this only after an intentional rendering change (a new pattern default,
 * a changed palette, a new encoder version). The normal test run never writes
 * the fixture, so a drift fails the build instead of being papered over.
 *
 * Cross-platform: the environment variable is set here, so the same command
 * works in PowerShell, cmd, bash and CI.
 */

import { spawnSync } from 'node:child_process'

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const result = spawnSync(npx, ['vitest', 'run', 'tests/parity.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, MYRGB_UPDATE_PARITY: '1' },
  shell: process.platform === 'win32'
})

process.exit(result.status ?? 1)
