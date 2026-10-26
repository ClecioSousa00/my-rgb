import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp, useSelectedZoneConfig } from '../store'
import { paletteToCssGradient, samplePalette, rgbToHex, normalizeHexColor } from '@shared/color'
import { HelpTip } from './HelpTip'
import type { Palette } from '@shared/types'

export function GradientEditor(): React.JSX.Element {
  const profile = useApp((s) => s.profile)
  const selectedZoneId = useApp((s) => s.selectedZoneId)
  const setZoneEffect = useApp((s) => s.setZoneEffect)
  const setPalette = useApp((s) => s.setPalette)
  const removePalette = useApp((s) => s.removePalette)
  const zoneConfig = useSelectedZoneConfig()

  const barRef = useRef<HTMLDivElement>(null)
  const [activeStop, setActiveStop] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  /** Local position while dragging, so the store is not hammered. */
  const [dragPosition, setDragPosition] = useState<number | null>(null)
  /**
   * Text being typed in the hex field.
   *
   * Null means "show the stored colour". Keeping the raw text in local state
   * lets the user type an incomplete value like "#7c5c" without the store
   * receiving (#7c5c is not a colour) and without the field jumping back to
   * the old value before they finish.
   */
  const [colorDraft, setColorDraft] = useState<string | null>(null)

  const palettes = profile?.palettes ?? []
  const paletteId = zoneConfig?.effect?.paletteId ?? palettes[0]?.id
  const stored = palettes.find((p) => p.id === paletteId) ?? palettes[0]

  // While a stop is being dragged we render a local preview of the palette.
  const palette: Palette | undefined =
    stored && dragPosition !== null && dragging !== null
      ? {
          ...stored,
          stops: stored.stops.map((s, i) => (i === dragging ? { ...s, position: dragPosition } : s))
        }
      : stored

  // Keep the selection valid when the palette list changes.
  useEffect(() => {
    if (palette && activeStop !== null && activeStop >= palette.stops.length) {
      setActiveStop(palette.stops.length - 1)
    }
  }, [palette, activeStop])

  /** Colour the hex field should display when nothing is being typed. */
  const activeStopColor =
    palette && activeStop !== null ? (palette.stops[activeStop]?.color ?? null) : null

  // A draft belongs to a single stop. Switching stops, palettes or the stored
  // colour (colour picker, drag, other window) discards it, so the field
  // never keeps showing text that no longer describes the palette.
  useEffect(() => {
    setColorDraft(null)
  }, [activeStop, palette?.id, activeStopColor])

  const commit = useCallback(
    (next: Palette) => {
      void setPalette(next)
    },
    [setPalette]
  )

  const positionFromEvent = useCallback((clientX: number): number => {
    const bar = barRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    const raw = (clientX - rect.left) / Math.max(1, rect.width)
    return Math.min(1, Math.max(0, raw))
  }, [])

  useEffect(() => {
    if (dragging === null) return

    const move = (event: PointerEvent): void => {
      setDragPosition(positionFromEvent(event.clientX))
    }

    const up = (): void => {
      // Commit the final position once, when the button is released.
      setDragPosition((position) => {
        if (position !== null && stored && dragging !== null) {
          const stops = stored.stops.map((s, i) =>
            i === dragging ? { ...s, position } : s
          )
          commit({ ...stored, stops })
        }
        return null
      })
      setDragging(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging, positionFromEvent, commit, stored])

  if (!palette) {
    return (
      <div className="panel p-3 text-[11.5px] text-ink-400">Nenhuma paleta disponível.</div>
    )
  }

  const selected = activeStop !== null ? palette.stops[activeStop] : null

  const handleBarClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).dataset.stop !== undefined) return
    const position = positionFromEvent(event.clientX)
    const color = rgbToHex(samplePalette(palette, position))
    const stops = [...palette.stops, { position, color }].sort((a, b) => a.position - b.position)
    commit({ ...palette, stops })
    setActiveStop(stops.findIndex((s) => s.position === position && s.color === color))
  }

  const updateStop = (index: number, patch: Partial<{ position: number; color: string }>): void => {
    const stops = palette.stops.map((s, i) => (i === index ? { ...s, ...patch } : s))
    commit({ ...palette, stops })
  }

  const colorDraftInvalid = colorDraft !== null && normalizeHexColor(colorDraft) === null

  /**
   * Turn the typed text into a colour, or throw it away.
   *
   * Only complete hex values reach the store. Invalid text is discarded on
   * blur/Enter and the stop keeps its last valid colour - otherwise the
   * gradient CSS breaks and the engine paints magenta.
   */
  const commitColorDraft = (): void => {
    if (activeStop === null || colorDraft === null) return
    const color = normalizeHexColor(colorDraft)
    if (!color) {
      setColorDraft(null)
      return
    }
    if (color !== selected?.color) updateStop(activeStop, { color })
    else setColorDraft(null)
  }

  const removeStop = (index: number): void => {
    if (palette.stops.length <= 2) return
    const stops = palette.stops.filter((_, i) => i !== index)
    commit({ ...palette, stops })
    setActiveStop(null)
  }

  const handlePaletteSelect = (id: string): void => {
    if (!zoneConfig?.effect) return
    void setZoneEffect(selectedZoneId, { ...zoneConfig.effect, paletteId: id })
  }

  const handleDuplicate = (): void => {
    const id = `palette-${Date.now().toString(36)}`
    const copy: Palette = {
      ...palette,
      id,
      name: `${palette.name} cópia`,
      stops: palette.stops.map((s) => ({ ...s }))
    }
    void setPalette(copy)
    if (zoneConfig?.effect) {
      void setZoneEffect(selectedZoneId, { ...zoneConfig.effect, paletteId: id })
    }
  }

  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span className="flex items-center gap-1.5">
          Gradiente
          <HelpTip text="A paleta define as cores. Cada LED do efeito pega uma cor do gradiente - o padrão escolhe qual ponto. Clique na barra para adicionar uma parada e arraste as bolinhas para mover." />
        </span>
        <div className="flex items-center gap-1.5">
          <select
            className="field h-7 w-32 py-0 text-[11px] normal-case tracking-normal"
            value={palette.id}
            onChange={(e) => handlePaletteSelect(e.target.value)}
          >
            {palettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-ghost h-7 px-2"
            onClick={handleDuplicate}
            title="Duplicar paleta"
          >
            ⧉
          </button>
          <button
            className="btn btn-danger h-7 px-2"
            onClick={() => void removePalette(palette.id)}
            disabled={palettes.length <= 1}
            title="Remover paleta"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-3">
        {/* the gradient bar */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10.5px] uppercase tracking-wider text-ink-400">Pré-visualização</span>
        </div>

        <div
          ref={barRef}
          onClick={handleBarClick}
          className="relative h-14 cursor-copy rounded-xl border border-ink-600 shadow-inner"
          style={{ background: paletteToCssGradient(palette) }}
          title="Clique para adicionar uma parada"
        >
          {palette.stops.map((stop, index) => (
            <button
              key={`${index}-${stop.color}`}
              data-stop={index}
              onPointerDown={(e) => {
                e.stopPropagation()
                setDragging(index)
                setActiveStop(index)
                setDragPosition(stop.position)
              }}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-lg transition-transform active:cursor-grabbing"
              style={{
                left: `${stop.position * 100}%`,
                background: stop.color,
                borderColor: activeStop === index ? '#fff' : 'rgba(0,0,0,0.7)',
                boxShadow:
                  activeStop === index
                    ? '0 0 0 2px rgba(99, 102, 241, 0.6), 0 2px 6px rgba(0,0,0,0.6)'
                    : '0 2px 6px rgba(0,0,0,0.6)',
                transform: `translate(-50%, -50%) scale(${activeStop === index ? 1.22 : 1})`
              }}
              title={`${stop.color} @ ${(stop.position * 100).toFixed(0)}%`}
            />
          ))}
        </div>

        {/* interpolation */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-wider text-ink-400">Interpolação</span>
          <div className="flex overflow-hidden rounded-lg border border-ink-600">
            {(['rgb', 'hsv'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => commit({ ...palette, interpolation: mode })}
                className={`px-3 py-1 text-[11px] font-semibold uppercase transition-colors ${
                  palette.interpolation === mode
                    ? 'bg-brand-500 text-white'
                    : 'bg-ink-850 text-ink-400 hover:bg-ink-800'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <span className="text-[10.5px] text-ink-500">{palette.stops.length} paradas</span>
        </div>

        {/* selected stop editor */}
        {selected && activeStop !== null && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 p-2">
            <input
              type="color"
              className="h-8 w-11"
              value={selected.color}
              onChange={(e) => updateStop(activeStop, { color: e.target.value })}
              title="Cor da parada"
            />
            <input
              type="text"
              className={`field w-20 font-mono text-[11px] ${
                colorDraftInvalid ? 'border-bad-500 text-bad-500' : ''
              }`}
              value={colorDraft ?? selected.color}
              onChange={(e) => setColorDraft(e.target.value)}
              onBlur={commitColorDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitColorDraft()
                } else if (e.key === 'Escape') {
                  setColorDraft(null)
                }
              }}
              spellCheck={false}
              aria-invalid={colorDraftInvalid}
              title="Cor da parada em hexadecimal (#rrggbb)"
            />
            <input
              type="range"
              className="flex-1"
              min={0}
              max={1}
              step={0.005}
              value={selected.position}
              onChange={(e) => updateStop(activeStop, { position: Number(e.target.value) })}
            />
            <span className="w-10 text-right font-mono text-[11px] text-ink-400">
              {(selected.position * 100).toFixed(1)}%
            </span>
            <button
              className="btn btn-danger h-7 px-2"
              onClick={() => removeStop(activeStop)}
              disabled={palette.stops.length <= 2}
              title="Remover parada"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
