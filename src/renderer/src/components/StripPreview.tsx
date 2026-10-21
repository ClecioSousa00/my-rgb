import { useCallback, useEffect, useRef } from 'react'
import { subscribeFrames, useApp } from '../store'
import type { Frame, RGB } from '@shared/types'

/** Extract the colours belonging to one zone out of a full frame. */
function zoneColors(frame: Frame, zoneIndex: number, offset: { value: number }): RGB[] {
  const count = frame.zoneLedCounts[zoneIndex] ?? 0
  const out: RGB[] = new Array(count)
  const base = offset.value
  for (let i = 0; i < count; i++) {
    const p = (base + i) * 3
    out[i] = { r: frame.pixels[p] ?? 0, g: frame.pixels[p + 1] ?? 0, b: frame.pixels[p + 2] ?? 0 }
  }
  offset.value += count
  return out
}

function drawStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: RGB[],
  glow: number
): void {
  const n = colors.length
  if (n === 0 || width <= 0) return

  const gap = n > 80 ? 1 : n > 40 ? 2 : 3
  const cell = (width - gap * (n - 1)) / n
  const radius = Math.min(cell / 2, height / 2, 4)

  ctx.save()
  for (let i = 0; i < n; i++) {
    const cx = x + i * (cell + gap)
    const c = colors[i]
    ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`
    ctx.shadowColor = `rgba(${c.r}, ${c.g}, ${c.b}, 0.85)`
    ctx.shadowBlur = glow
    ctx.beginPath()
    ctx.roundRect(cx, y, cell, height, radius)
    ctx.fill()
  }
  ctx.restore()
}

export function StripPreview(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const zones = useApp((s) => s.zones)
  const selectedZoneId = useApp((s) => s.selectedZoneId)

  const frameRef = useRef<Frame | null>(null)
  const zonesRef = useRef(zones)
  zonesRef.current = zones

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const dpr = window.devicePixelRatio || 1
    const width = wrap.clientWidth
    const height = wrap.clientHeight
    if (width === 0 || height === 0) return

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const frame = frameRef.current
    const list = zonesRef.current
    if (!frame || list.length === 0) return

    // Slice every zone in frame order - the offsets are cumulative.
    const offset = { value: 0 }
    const colorsByZone = list.map((_, i) => zoneColors(frame, i, offset))
    const selectedIndex = list.findIndex((z) => z.id === selectedZoneId)

    // Secondary strips: every zone except the selected one, at the bottom.
    const secondary = list.filter((_, i) => i !== selectedIndex)
    const secondaryH = 14
    const secondaryGap = 8
    const secondaryTop = height - secondary.length * (secondaryH + secondaryGap) + secondaryGap

    secondary.forEach((zone, idx) => {
      const zoneIndex = list.findIndex((z) => z.id === zone.id)
      drawStrip(
        ctx,
        0,
        secondaryTop + idx * (secondaryH + secondaryGap),
        width,
        secondaryH,
        colorsByZone[zoneIndex],
        6
      )
    })

    // The selected zone gets the big strip.
    if (selectedIndex >= 0) {
      const stripH = Math.min(120, Math.max(48, height - secondaryTop - 40))
      const y = Math.max(16, secondaryTop - stripH - 26)
      drawStrip(ctx, 0, y, width, stripH, colorsByZone[selectedIndex], 18)
    }
  }, [selectedZoneId])

  useEffect(() => {
    const unsubscribe = subscribeFrames((frame) => {
      frameRef.current = frame
      paint()
    })
    return unsubscribe
  }, [paint])

  useEffect(() => {
    paint()
  }, [paint, zones])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver(() => paint())
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [paint])

  const zone = zones.find((z) => z.id === selectedZoneId)

  return (
    <div className="panel flex min-h-0 flex-1 flex-col">
      <div className="panel-header">
        <span>Pré-visualização</span>
        <span className="font-mono normal-case tracking-normal text-ink-400">
          {zone ? `${zone.label} · ${zone.kind === 'addressable' ? 'addressable' : 'fixo'}` : '—'}
        </span>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  )
}
