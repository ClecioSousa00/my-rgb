import { useCallback, useEffect, useRef } from 'react'
import { subscribeFrames, useApp, zoneDisplayName } from '../store'
import { HelpTip } from './HelpTip'
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

/** Where one zone ends up in the preview. */
interface StripLayout {
  zoneIndex: number
  labelY: number
  stripY: number
  stripH: number
  selected: boolean
}

export function StripPreview(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const zones = useApp((s) => s.zones)
  const profile = useApp((s) => s.profile)
  const selectedZoneId = useApp((s) => s.selectedZoneId)

  const frameRef = useRef<Frame | null>(null)
  const zonesRef = useRef(zones)
  const profileRef = useRef(profile)
  zonesRef.current = zones
  profileRef.current = profile

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

    // The stack grows from the bottom up: one thin strip per zone that is not
    // the one being edited, and the selected zone on top of them.
    const labelH = 15
    const thinH = 12
    const gap = 6
    const layouts: StripLayout[] = []

    let cursor = height - 2
    const secondary = list.filter((_, i) => i !== selectedIndex)
    for (let idx = secondary.length - 1; idx >= 0; idx--) {
      const zoneIndex = list.findIndex((z) => z.id === secondary[idx].id)
      cursor -= thinH
      const stripY = cursor
      cursor -= labelH + gap
      layouts.unshift({ zoneIndex, labelY: cursor + gap, stripY, stripH: thinH, selected: false })
    }

    if (selectedIndex >= 0) {
      const stackTop = cursor
      const stripH = Math.max(24, Math.min(110, stackTop - labelH - 6))
      const stripY = Math.max(0, stackTop - stripH)
      layouts.unshift({
        zoneIndex: selectedIndex,
        labelY: stripY - labelH,
        stripY,
        stripH,
        selected: true
      })
    }

    const configs = profileRef.current?.zones ?? []

    for (const layout of layouts) {
      const zone = list[layout.zoneIndex]
      if (!zone) continue
      const config = configs.find((c) => c.zoneId === zone.id)
      const name = zoneDisplayName(zone, config)

      ctx.save()
      ctx.textBaseline = 'alphabetic'
      ctx.font = layout.selected
        ? '600 12px Inter, "Segoe UI", system-ui, sans-serif'
        : '500 10.5px Inter, "Segoe UI", system-ui, sans-serif'
      ctx.fillStyle = layout.selected ? '#e8ecf5' : '#6b748c'
      ctx.fillText(name, 2, layout.labelY + labelH - 4)

      if (zone.kind === 'addressable') {
        const count = `${config?.ledCount ?? 0} LEDs`
        ctx.font = '500 10px JetBrains Mono, ui-monospace, monospace'
        ctx.fillStyle = '#3d4457'
        ctx.textAlign = 'right'
        ctx.fillText(count, width - 2, layout.labelY + labelH - 4)
        ctx.textAlign = 'left'
      }
      ctx.restore()

      drawStrip(
        ctx,
        0,
        layout.stripY,
        width,
        layout.stripH,
        colorsByZone[layout.zoneIndex],
        layout.selected ? 18 : 6
      )
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
    paint()
  }, [paint, profile])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver(() => paint())
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [paint])

  const zone = zones.find((z) => z.id === selectedZoneId)
  const zoneName = zone
    ? zoneDisplayName(zone, profile?.zones.find((c) => c.zoneId === zone.id))
    : null

  return (
    <div className="panel relative z-0 flex min-h-0 flex-1 flex-col">
      <div className="panel-header">
        <span className="flex items-center gap-1.5">
          Pré-visualização
          <HelpTip text="Vista ao vivo e idêntica ao que é enviado ao controlador. A faixa maior é a zona selecionada; as faixas menores mostram as demais. Clique em qualquer faixa para selecioná-la." />
        </span>
        <span className="font-mono normal-case tracking-normal text-ink-400">
          {zoneName ? `${zoneName} · ${zone?.kind === 'addressable' ? 'addressable' : 'fixo'}` : '—'}
        </span>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  )
}
