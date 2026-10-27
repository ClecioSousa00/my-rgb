/**
 * The overlay itself.
 *
 * A separate, tiny renderer: it receives one prepared frame every 500 ms and
 * only draws it. No hardware, no polling, no state beyond "last frame" - the
 * numbers are formatted in the main process, so they can be tested without a
 * window and the overlay never disagrees with the Gargalo page.
 *
 * The window is sized to the card. The card is `max-content`, so whenever the
 * content changes size (a longer game name, another metric) a `ResizeObserver`
 * reports the new size and the main process moves/resizes the window. The
 * scale is applied as the root font size, which keeps every spacing in `em`.
 *
 * Click-through, always-on-top and "not in the taskbar" are window properties
 * set by the main process, not CSS.
 */

import { useEffect, useRef, useState } from 'react'
import type { OverlayFrame, OverlayGroup, OverlayItem, OverlayItemKey } from '@shared/features/overlay'
import { OVERLAY_GROUPS, OVERLAY_METRICS } from '@shared/features/overlay'

const LABELS = new Map<OverlayItemKey, string>(
  OVERLAY_METRICS.map((metric) => [metric.key, metric.label])
)

/** Groups drawn as sections; "Outros" is the header (game name and clock). */
const SECTION_GROUPS = OVERLAY_GROUPS.filter((group) => group !== 'Outros')

function groupOf(items: OverlayItem[], group: OverlayGroup): OverlayItem[] {
  return items.filter((item) => item.group === group)
}

/** Frame time graph, 0 at the bottom. A 60 FPS frame sits at a quarter. */
function FrameGraph({ recent }: { recent: number[] }): React.JSX.Element | null {
  if (recent.length < 2) return null

  const max = Math.max(...recent, 16.7)
  const step = 100 / (recent.length - 1)
  const points = recent
    .map((value, index) => `${(index * step).toFixed(2)},${(30 - (value / max) * 30).toFixed(2)}`)
    .join(' ')
  const area = `0,30 ${points} 100,30`

  return (
    <svg
      className="overlay-graph"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      role="img"
      aria-label="Frametime dos últimos segundos"
    >
      <polygon points={area} />
      <polyline points={points} />
    </svg>
  )
}

function Row({ item, recent }: { item: OverlayItem; recent?: number[] }): React.JSX.Element {
  if (item.key === 'graph') {
    const hasGraph = recent !== undefined && recent.length >= 2
    return (
      <div className="overlay-row overlay-row-graph">
        <span className="overlay-label">{LABELS.get(item.key)}</span>
        {hasGraph ? <FrameGraph recent={recent} /> : <span className="overlay-value">—</span>}
      </div>
    )
  }

  return (
    <div className="overlay-row">
      <span className="overlay-label">{LABELS.get(item.key)}</span>
      <span className="overlay-value">{item.text}</span>
    </div>
  )
}

export function OverlayApp(): React.JSX.Element | null {
  const [frame, setFrame] = useState<OverlayFrame | null>(null)
  const card = useRef<HTMLElement | null>(null)
  const sent = useRef({ width: 0, height: 0 })

  useEffect(() => window.myrgb.onOverlayFrame(setFrame), [])

  // The card only exists after the first frame; once it does, keep reporting
  // its size until it changes (scale, opacity, another metric).
  const mounted = frame !== null
  useEffect(() => {
    const element = card.current
    if (!element) return

    const report = (): void => {
      const bounds = element.getBoundingClientRect()
      const size = { width: Math.ceil(bounds.width), height: Math.ceil(bounds.height) }
      if (size.width <= 0 || size.height <= 0) return
      if (size.width === sent.current.width && size.height === sent.current.height) return
      sent.current = size
      void window.myrgb.resizeOverlay(size.width, size.height)
    }

    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mounted])

  if (!frame) return null

  const { config, items, fps } = frame
  const game = items.find((item) => item.key === 'game')?.text
  const clock = items.find((item) => item.key === 'clock')?.text

  return (
    <article
      ref={card}
      className="overlay-card"
      style={{
        background: `rgba(0, 0, 0, ${config.opacity})`,
        fontSize: `${13 * config.scale}px`
      }}
    >
      {(game || clock) && (
        <header className="overlay-head">
          {game && <span className="overlay-game">{game === '—' ? 'MyRGB' : game}</span>}
          {clock && <span className="overlay-clock">{clock}</span>}
        </header>
      )}

      {SECTION_GROUPS.map((group) => {
        const rows = groupOf(items, group)
        if (rows.length === 0) return null
        return (
          <section key={group} className="overlay-group">
            <h2 className="overlay-group-title">{group}</h2>
            {rows.map((item) => (
              <Row key={item.key} item={item} recent={fps?.recent} />
            ))}
          </section>
        )
      })}
    </article>
  )
}
