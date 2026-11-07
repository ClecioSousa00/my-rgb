/**
 * Compares two frame dumps byte for byte.
 *
 * This is the tool that proves the Windows build behaves exactly like the
 * Linux build: run
 *
 *   my-rgb --dump-frames frames-linux --dump-count 60
 *   MyRGB.exe --dump-frames frames-windows --dump-count 60
 *   node tools/compare-frames.mjs frames-linux frames-windows
 *
 * and every file has to match.
 *
 * The manifest is compared as well. Without it, two dumps taken with
 * different profiles (or different LED counts) could still have the same
 * number of bytes and pass, which would prove nothing. It is also the only
 * way to catch a comparison between machines with different hardware.
 *
 * Usage: node tools/compare-frames.mjs <dirA> <dirB>
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const [dirA, dirB] = process.argv.slice(2)

if (!dirA || !dirB) {
  console.error('usage: node tools/compare-frames.mjs <dirA> <dirB>')
  process.exit(2)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** Sorted list of `frame-*.bin` files in a dump directory. */
function framesOf(dir) {
  try {
    if (!statSync(dir).isDirectory()) fail(`NOT A DIRECTORY: ${dir}`)
  } catch {
    fail(`MISSING DIRECTORY: ${dir}`)
  }
  return readdirSync(dir)
    .filter((f) => f.startsWith('frame-') && f.endsWith('.bin'))
    .sort()
}

/** Reads and parses `<dir>/manifest.json`, or returns null when absent. */
function manifestOf(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * JSON with sorted object keys, so property order cannot make two identical
 * manifests look different.
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    )
  }
  return value
}

const framesA = framesOf(dirA)
const framesB = framesOf(dirB)

if (framesA.length === 0) fail(`NO FRAMES in ${dirA} (nothing to compare)`)
if (framesB.length === 0) fail(`NO FRAMES in ${dirB} (nothing to compare)`)

// Compare the file names, not only the counts: two dumps with 60 frames each
// but with different sequences (e.g. one starting at frame 1) must not pass.
const nameMismatch = framesA.findIndex((name, i) => name !== framesB[i])
if (framesA.length !== framesB.length || nameMismatch >= 0) {
  const at = nameMismatch >= 0 ? ` first difference at index ${nameMismatch}` : ''
  fail(
    `MISMATCH: ${dirA} has ${framesA.length} frames, ${dirB} has ${framesB.length}${at}`
  )
}

// The manifest carries the profile and the zone layout. If it differs, the
// frames are not comparable: the two runs rendered different work.
const manifestA = manifestOf(dirA)
const manifestB = manifestOf(dirB)

if (!manifestA && !manifestB) {
  console.warn('warning: neither dump has manifest.json; cannot verify the profile')
} else if (!manifestA || !manifestB) {
  const missing = manifestA ? dirB : dirA
  fail(`MISMATCH: ${missing} has no manifest.json; cannot verify the profile`)
} else if (
  JSON.stringify(canonical(manifestA)) !== JSON.stringify(canonical(manifestB))
) {
  fail(
    'MISMATCH: manifest.json differs - the two dumps used a different ' +
      'profile, LED layout or frame count. Compare the manifest files first.'
  )
}

let mismatches = 0
let compared = 0

for (let i = 0; i < framesA.length; i++) {
  const a = readFileSync(join(dirA, framesA[i]))
  const b = readFileSync(join(dirB, framesB[i]))
  compared++
  if (!a.equals(b)) {
    mismatches++
    if (mismatches <= 5) {
      // Report the first differing byte for an easy diagnosis.
      let offset = 0
      const limit = Math.min(a.length, b.length)
      while (offset < limit && a[offset] === b[offset]) offset++
      const detail =
        offset === limit
          ? `length ${a.length} vs ${b.length}`
          : `first differing byte at ${offset} (${a[offset]} vs ${b[offset]})`
      console.error(`MISMATCH ${framesA[i]}: ${detail}`)
    }
  }
}

if (mismatches === 0) {
  const manifestNote = manifestA ? ', manifest identical' : ''
  console.log(`IDENTICAL: ${compared} frames match byte for byte${manifestNote}`)
  process.exit(0)
}

console.error(`MISMATCH: ${mismatches} of ${compared} frames differ`)
process.exit(1)
