/**
 * Bring-up probe: reads the ASUS AURA USB configuration table from real hardware.
 *
 * This is the M1 milestone tool. It answers the questions that no single
 * reference document agrees on:
 *   - how many ARGB channels does this board report?
 *   - how many LEDs per channel?
 *   - where exactly are those numbers inside the 60-byte table?
 *
 * Usage: node tools/probe-aura.mjs
 */
import { devices, HID } from 'node-hid'

const FRAME = 65
const VENDOR = 0x0b05
const PRODUCT = 0x19af

const hex = (b) => b.toString(16).padStart(2, '0').toUpperCase()

function frame(...bytes) {
  const buf = Buffer.alloc(FRAME, 0)
  bytes.forEach((b, i) => (buf[i] = b))
  return buf
}

function openDevice() {
  const list = devices()
  console.log(`\nHID devices found: ${list.length}`)
  for (const d of list) {
    const tag = d.vendorId === VENDOR && d.productId === PRODUCT ? '  <== AURA' : ''
    console.log(
      `  ${hex(d.vendorId)}:${hex(d.productId)}  ${String(d.product).padEnd(34)} ${d.path}${tag}`
    )
  }

  const target = list.find((d) => d.vendorId === VENDOR && d.productId === PRODUCT)
  if (!target) {
    throw new Error(
      `AURA controller ${hex(VENDOR)}:${hex(PRODUCT)} not found.\n` +
        `Check the udev rule: SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0b05", ATTRS{idProduct}=="19af", TAG+="uaccess"`
    )
  }
  return new HID(target.path)
}

/** Read one 65-byte frame, retrying until the expected reply opcode shows up. */
function readMatching(dev, expectedOpcode, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const raw = dev.readSync()
    if (!raw || raw.length < 2) continue
    const data = Buffer.from(raw)
    if (data[0] === 0xec && data[1] === expectedOpcode) return data
    console.log(`    (discarded frame, opcode 0x${hex(data[1])})`)
  }
  return null
}

const dev = openDevice()

console.log('\n--- init sequence -------------------------------------------------')

// 1. stop_gen2: release the controller from its own animation engine
dev.write(frame(0xec, 0x52, 0x53, 0x00, 0x01))
console.log('stop_gen2        EC 52 53 00 01  sent')

// 2. firmware string
dev.write(frame(0xec, 0x82))
const fw = readMatching(dev, 0x02)
const firmware = fw
  ? fw.subarray(2, 18).toString('latin1').replace(/\0.*$/, '')
  : '(no reply)'
console.log(`firmware         ${firmware}`)

// 3. config table
dev.write(frame(0xec, 0xb0))
const cfgResp = readMatching(dev, 0x30)
if (!cfgResp) {
  console.error('config table    NO REPLY')
  process.exit(1)
}
const table = cfgResp.subarray(4, 64) // OpenRGB: memcpy(config_table, &usb_buf[4], 60)

console.log('\n--- raw 60-byte config table (resp[4..64]) -------------------------')
for (let i = 0; i < 60; i += 6) {
  const row = [...table.subarray(i, i + 6)].map(hex)
  const marks = []
  for (let j = 0; j < 6; j++) {
    const off = i + j
    if (off === 0x02) marks.push('<- ARGB count (0x02)')
    if (off === 0x1b) marks.push('<- mainboard LEDs (0x1B)')
    if (off === 0x1d) marks.push('<- RGB headers (0x1D)')
  }
  console.log(`  [${i.toString(16).padStart(2, '0')}] ${row.join(' ')}  ${marks.join(' ')}`)
}

console.log('\n--- candidate interpretations --------------------------------------')

const argbCount = Math.min(table[0x02], 9)
const mbLeds = table[0x1b]
const rgbHeaders = table[0x1d]
console.log(`ARGB channels    = table[0x02] = ${argbCount}`)
console.log(`mainboard LEDs   = table[0x1B] = ${mbLeds}`)
console.log(`12V RGB headers  = table[0x1D] = ${rgbHeaders}`)

console.log('\nper-channel LED count, candidate offsets:')
for (const base of [0, 4]) {
  const counts = []
  for (let i = 0; i < argbCount; i++) {
    const raw = table[base + i * 6 + 2]
    counts.push(raw === 0 ? 'default(30)' : Math.min(raw, 120))
  }
  console.log(`  base=${base}  ->  [${counts.join(', ')}]`)
}

console.log('\n--- raw bytes at candidate per-channel slots ----------------------')
for (let i = 0; i < argbCount; i++) {
  for (const base of [0, 4]) {
    const at = base + i * 6 + 2
    console.log(
      `  ch${i} base=${base}  table[${at}] = ${table[at]}   (neighbours ${hex(table[at - 2])} ${hex(table[at - 1])} | ${hex(table[at + 1])} ${hex(table[at + 2])})`
    )
  }
}

console.log('\n--- full table as decimal -----------------------------------------')
console.log([...table].join(','))
dev.close()
