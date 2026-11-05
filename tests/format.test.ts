import { describe, expect, it } from 'vitest'
import {
  formatAgo,
  formatBiosDate,
  formatBytes,
  formatCount,
  formatGhz,
  formatMbps,
  formatMs,
  formatMts,
  formatPercent,
  formatSensor
} from '@shared/format'

describe('formatBytes', () => {
  it('keeps small values in bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })

  it('drops a trailing zero decimal', () => {
    expect(formatBytes(500_000_000_000)).toBe('500 GB')
    expect(formatBytes(1_000_000_000_000)).toBe('1 TB')
  })

  it('keeps one decimal for large units', () => {
    expect(formatBytes(97_800_000_000)).toBe('97,8 GB')
    expect(formatBytes(1_500_000_000_000)).toBe('1,5 TB')
  })

  it('shows an em dash instead of inventing a value', () => {
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
    expect(formatBytes(-1)).toBe('—')
  })
})

describe('other formatters', () => {
  it('formats percentages with a comma', () => {
    expect(formatPercent(34)).toBe('34%')
    expect(formatPercent(34.25, 1)).toBe('34,3%')
    expect(formatPercent(undefined)).toBe('—')
  })

  it('formats clocks in GHz', () => {
    expect(formatGhz(4.77)).toBe('4,77 GHz')
    expect(formatGhz(0)).toBe('—')
  })

  it('formats memory speed as MT/s', () => {
    expect(formatMts(4800)).toBe('4800 MT/s')
    expect(formatMts(undefined)).toBe('—')
  })

  it('separates thousands in counters', () => {
    expect(formatCount(1234)).toBe('1.234')
    expect(formatCount(25000)).toBe('25.000')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(undefined)).toBe('—')
  })

  it('formats network latency and throughput', () => {
    expect(formatMs(12.345)).toBe('12,3 ms')
    expect(formatMs(0)).toBe('0,0 ms')
    expect(formatMs(undefined)).toBe('—')
    expect(formatMbps(300.44)).toBe('300,4 Mbps')
    expect(formatMbps(undefined)).toBe('—')
  })

  it('gives each sensor unit the precision it deserves', () => {
    expect(formatSensor(57.875, '°C')).toBe('57,9 °C')
    expect(formatSensor(1.31, 'V')).toBe('1,310 V')
    expect(formatSensor(78.54, 'W')).toBe('78,5 W')
    expect(formatSensor(2100, 'MHz')).toBe('2100 MHz')
    expect(formatSensor(1240, 'RPM')).toBe('1240 RPM')
    expect(formatSensor(13, '%')).toBe('13%')
    expect(formatSensor(undefined, '°C')).toBe('—')
  })

  it('normalises the BIOS date regardless of the firmware order', () => {
    expect(formatBiosDate('2025-13-11')).toBe('13/11/2025')
    expect(formatBiosDate('11/13/2025')).toBe('13/11/2025')
    expect(formatBiosDate('11/13/25')).toBe('13/11/2025')
    expect(formatBiosDate('')).toBe('—')
  })

  it('describes relative time', () => {
    const now = 1_700_000_000_000
    expect(formatAgo(now, now)).toBe('agora')
    expect(formatAgo(now - 8_000, now)).toBe('há 8 s')
    expect(formatAgo(now - 180_000, now)).toBe('há 3 min')
    expect(formatAgo(now - 7_200_000, now)).toBe('há 2 h')
    expect(formatAgo(undefined, now)).toBe('—')
  })
})
