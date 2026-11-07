/**
 * Windows board sensors: helper lifecycle.
 *
 * The sensors page polls once per second. Creating a `HelperBridge` (and an
 * elevated helper process) per poll would raise a UAC prompt every second, so
 * the collector must reuse one bridge and back off after a failure. These
 * tests pin that behaviour without Windows or hardware: the helper module and
 * Electron are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  request: vi.fn(),
  dispose: vi.fn(),
  getSharedHelper: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getAppPath: () => '/app' }
}))

vi.mock('@main/features/overlay/helper', () => ({
  getSharedHelper: mocks.getSharedHelper,
  helperCandidates: () => ['/app/helper/MyRgb.Helper.exe'],
  findHelperPath: () => '/app/helper/MyRgb.Helper.exe'
}))

async function loadCollector(): Promise<typeof import('@main/features/sensors/windows')> {
  return import('@main/features/sensors/windows')
}

beforeEach(() => {
  vi.resetModules()
  mocks.start.mockReset()
  mocks.request.mockReset()
  mocks.dispose.mockReset()
  mocks.getSharedHelper.mockReset()
  mocks.getSharedHelper.mockReturnValue({
    start: mocks.start,
    request: mocks.request,
    dispose: mocks.dispose
  })
})

describe('Windows board sensors', () => {
  it('reuses one helper across polls instead of starting one per second', async () => {
    mocks.start.mockResolvedValue(undefined)
    mocks.request.mockResolvedValue({ readings: [] })

    const { readWindowsSensors } = await loadCollector()

    await readWindowsSensors()
    await readWindowsSensors()
    await readWindowsSensors()

    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.request).toHaveBeenCalledTimes(3)
    expect(mocks.dispose).not.toHaveBeenCalled()
  })

  it('closes the helper after the page stops polling', async () => {
    vi.useFakeTimers()
    try {
      mocks.start.mockResolvedValue(undefined)
      mocks.request.mockResolvedValue({ readings: [] })

      const { readWindowsSensors } = await loadCollector()
      await readWindowsSensors()
      expect(mocks.dispose).not.toHaveBeenCalled()

      vi.advanceTimersByTime(20_000)
      expect(mocks.dispose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('backs off after a failure instead of retrying every poll', async () => {
    mocks.start.mockRejectedValue(new Error('UAC recusado'))

    const { readWindowsSensors } = await loadCollector()

    const first = await readWindowsSensors()
    const second = await readWindowsSensors()

    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(first?.note).toContain('UAC recusado')
    expect(second?.note).toContain('UAC recusado')
    // The shared helper released its own lease on failure; the next poll must
    // not have tried to launch it again.
    expect(mocks.getSharedHelper).toHaveBeenCalledTimes(1)
  })
})
