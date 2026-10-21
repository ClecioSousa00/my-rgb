import { useMemo } from 'react'
import { useApp, useSelectedZoneConfig } from '../store'
import { HelpTip } from './HelpTip'
import type { PatternMeta } from '@shared/types'

/** Build the parameter map a pattern starts with. */
export function defaultsFor(pattern: PatternMeta): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const spec of pattern.params) out[spec.key] = spec.default
  return out
}

export function PatternPicker(): React.JSX.Element {
  const patterns = useApp((s) => s.patterns)
  const profile = useApp((s) => s.profile)
  const selectedZoneId = useApp((s) => s.selectedZoneId)
  const setZoneEffect = useApp((s) => s.setZoneEffect)
  const zoneConfig = useSelectedZoneConfig()

  const grouped = useMemo(() => {
    const map = new Map<string, PatternMeta[]>()
    for (const pattern of patterns) {
      const list = map.get(pattern.category) ?? []
      list.push(pattern)
      map.set(pattern.category, list)
    }
    return [...map.entries()]
  }, [patterns])

  const current = zoneConfig?.effect?.patternId

  const handleSelect = (pattern: PatternMeta): void => {
    void setZoneEffect(selectedZoneId, {
      patternId: pattern.id,
      paletteId: zoneConfig?.effect?.paletteId ?? profile?.palettes[0]?.id ?? '',
      params: { ...defaultsFor(pattern), ...(zoneConfig?.effect?.params ?? {}) }
    })
  }

  if (patterns.length === 0) {
    return (
      <div className="panel flex min-h-0 flex-1 flex-col">
        <div className="panel-header">Efeitos</div>
        <p className="p-4 text-[11.5px] text-ink-400">Carregando padrões…</p>
      </div>
    )
  }

  return (
    <div className="panel flex min-h-0 flex-1 flex-col">
      <div className="panel-header">
        <span className="flex items-center gap-1.5">
          Efeitos
          <HelpTip text="Cada padrão é um movimento diferente da luz ao longo da fita. Escolher um aqui aplica na zona selecionada, já na pré-visualização e na placa." />
        </span>
        <span className="font-mono normal-case tracking-normal text-ink-400">
          {patterns.length} padrões
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {grouped.map(([category, items]) => (
          <div key={category} className="mb-4">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">
              {category}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-1.5">
              {items.map((pattern) => {
                const active = current === pattern.id
                return (
                  <button
                    key={pattern.id}
                    onClick={() => handleSelect(pattern)}
                    title={pattern.description}
                    className={`rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors ${
                      active
                        ? 'border-brand-500 bg-brand-500/15 text-ink-100'
                        : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-600 hover:bg-ink-800'
                    }`}
                  >
                    <span className="block truncate font-medium">{pattern.name}</span>
                    {pattern.params.length > 0 && (
                      <span className="mt-0.5 block text-[10px] text-ink-500">
                        {pattern.params.length} parâm.
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
