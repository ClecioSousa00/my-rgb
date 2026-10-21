#!/usr/bin/env node
/**
 * Check that node-hid has a usable prebuilt binary for this machine.
 *
 * node-hid 3.x ships N-API v4 prebuilds for every supported platform. N-API
 * is ABI stable, so the same binary works in Node and in Electron and there
 * is no need to compile anything - which is what lets the Windows installer
 * be produced from a Linux machine.
 *
 * This replaces the old `electron-builder install-app-deps` postinstall
 * step: compiling from source produced a host-specific binary that the
 * Windows package would then have shipped by mistake.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hidDir = join(root, 'node_modules', 'node-hid')
const prebuilds = join(hidDir, 'prebuilds')

const platform = process.platform
const arch = process.arch

// On Linux node-hid uses the hidraw backend unless a driver type is set.
const name = platform === 'linux' ? 'HID_hidraw' : 'HID'

const candidates = [
  join(prebuilds, `${name}-${platform}-${arch}`, 'node-napi-v4.node')
]

if (platform === 'linux') {
  // Alpine and other musl systems need their own build.
  candidates.push(join(prebuilds, `${name}-${platform}-${arch}-musl`, 'node-napi-v4.node'))
}

const found = candidates.find((candidate) => existsSync(candidate))

if (!found) {
  console.error(`[my-rgb] node-hid has no prebuilt binary for ${platform}-${arch}.`)
  console.error(`[my-rgb] Looked for:`)
  for (const candidate of candidates) console.error(`[my-rgb]   ${candidate}`)
  console.error('[my-rgb] Install the toolchain and run: npm rebuild node-hid')
  process.exit(1)
}

console.log(`[my-rgb] node-hid prebuild ready: ${found.replace(`${root}/`, '')}`)
