/**
 * Compares two frame dumps byte for byte.
 *
 * This is the tool that proves the Windows build behaves exactly like the
 * Linux build: run
 *
 *   my-rgb --dump-frames frames-linux
 *   my-rgb --dump-frames frames-windows      (on the other OS)
 *   node tools/compare-frames.mjs frames-linux frames-windows
 *
 * and every file has to match.
 *
 * Usage: node tools/compare-frames.mjs <dirA> <dirB>
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'path'

const [dirA, dirB] = process.argv.slice(2)

if (!dirA || !dirB) {
  console.error('usage: node tools/compare-frames.mjs <dirA> <dirB>')
  process.exit(2)
}

function framesOf(dir) {
  return readdirSync(dir)
    .filter((f) => f.startsWith('frame-') && f.endsWith('.bin'))
    .sort()
}

const framesA = framesOf(dirA)
const framesB = framesOf(dirB)

if (framesA.length !== framesB.length) {
  console.error(
    `MISMATCH: ${dirA} has ${framesA.length} frames, ${dirB} has ${framesB.length}`
  )
  process.exit(1)
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
      console.error(
        `MISMATCH ${framesA[i]}: first differing byte at ${offset} ` +
          `(${a[offset]} vs ${b[offset]})`
      )
    }
  }
}

if (mismatches === 0) {
  console.log(`IDENTICAL: ${compared} frames match byte for byte`)
  process.exit(0)
}

console.error(`MISMATCH: ${mismatches} of ${compared} frames differ`)
process.exit(1)
