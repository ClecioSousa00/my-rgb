/**
 * Shared helper process.
 *
 * FPS (ETW) and the Windows board sensors need the same elevated .NET helper.
 * A `SharedHelper` keeps one process and one pipe for both, and closes it only
 * when the last consumer releases its lease. These tests use a fake bridge, so
 * they run on every platform.
 */

import { describe, expect, it, vi } from 'vitest'
import { SharedHelper, type HelperClientWithState } from '@main/features/overlay/helper'

type FakeBridge = HelperClientWithState & { connected: boolean }

function fakeBridge(): FakeBridge {
  const bridge: FakeBridge = {
    connected: false,
    start: vi.fn(async () => {
      bridge.connected = true
    }),
    request: (async () => ({})) as HelperClientWithState['request'],
    dispose: vi.fn(() => {
      bridge.connected = false
    })
  }
  return bridge
}

describe('shared helper', () => {
  it('starts one process for two consumers and closes it after the last', async () => {
    const bridge = fakeBridge()
    const create = vi.fn(() => bridge)
    const shared = new SharedHelper('/helper.exe', create)

    await shared.start() // FPS
    await shared.start() // sensors

    expect(create).toHaveBeenCalledTimes(1)
    expect(bridge.start).toHaveBeenCalledTimes(1)

    shared.dispose()
    expect(bridge.dispose).not.toHaveBeenCalled()
    expect(shared.connected).toBe(true)

    shared.dispose()
    expect(bridge.dispose).toHaveBeenCalledTimes(1)
    expect(shared.connected).toBe(false)
  })

  it('shares a start that is already in flight', async () => {
    const bridge = fakeBridge()
    const create = vi.fn(() => bridge)
    const shared = new SharedHelper('/helper.exe', create)

    await Promise.all([shared.start(), shared.start()])

    expect(create).toHaveBeenCalledTimes(1)
    expect(bridge.start).toHaveBeenCalledTimes(1)
  })

  it('launches a fresh helper when the previous one lost its connection', async () => {
    const first = fakeBridge()
    const second = fakeBridge()
    const create = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    const shared = new SharedHelper('/helper.exe', create)

    await shared.start()
    first.connected = false
    await shared.start()

    expect(create).toHaveBeenCalledTimes(2)
    expect(shared.connected).toBe(true)
    expect(second.start).toHaveBeenCalledTimes(1)
  })

  it('releases the lease when a start fails, so the next attempt can retry', async () => {
    const create = vi.fn(() => {
      const bridge = fakeBridge()
      bridge.start = vi.fn(async () => {
        throw new Error('UAC recusado')
      })
      return bridge
    })
    const shared = new SharedHelper('/helper.exe', create)

    await expect(shared.start()).rejects.toThrow('UAC recusado')
    expect(shared.connected).toBe(false)

    await expect(shared.start()).rejects.toThrow('UAC recusado')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('closes the helper if every consumer left while it was starting', async () => {
    let release: (() => void) | undefined
    const bridge = fakeBridge()
    bridge.start = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            bridge.connected = true
            resolve()
          }
        })
    )
    const shared = new SharedHelper('/helper.exe', () => bridge)

    const pending = shared.start() // e.g. the overlay opened the UAC prompt
    shared.dispose() // ...and was closed before the user answered

    release?.()
    await pending

    expect(shared.connected).toBe(false)
    expect(bridge.dispose).toHaveBeenCalledTimes(1)
  })
})
