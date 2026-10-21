import { useApp, useSelectedZoneConfig } from '../store'
import { HelpTip } from './HelpTip'
import type { ParamSpec, ParamValue } from '@shared/types'

export function ParamSliders(): React.JSX.Element | null {
  const patterns = useApp((s) => s.patterns)
  const selectedZoneId = useApp((s) => s.selectedZoneId)
  const setZoneEffect = useApp((s) => s.setZoneEffect)
  const zoneConfig = useSelectedZoneConfig()

  const effect = zoneConfig?.effect
  const pattern = patterns.find((p) => p.id === effect?.patternId)

  if (!effect || !pattern) {
    return (
      <div className="panel p-3 text-[11.5px] text-ink-400">
        Escolha um efeito para ajustar os parâmetros.
      </div>
    )
  }

  const params = effect.params ?? {}

  const update = (key: string, value: ParamValue): void => {
    void setZoneEffect(selectedZoneId, {
      ...effect,
      params: { ...params, [key]: value }
    })
  }

  return (
    <div className="panel flex flex-col">
      <div className="panel-header">
        <span className="flex items-center gap-1.5">
          Parâmetros
          <HelpTip text="Ajuste fino do efeito escolhido. Cada padrão tem os seus próprios parâmetros - passe o mouse sobre o '?' ao lado de cada um para saber o que ele faz." />
        </span>
        <span className="font-mono normal-case tracking-normal text-ink-400">{pattern.name}</span>
      </div>

      <div className="p-3">
        <p className="mb-3 text-[11.5px] leading-relaxed text-ink-400">{pattern.description}</p>

        {pattern.params.length === 0 && (
          <p className="text-[11.5px] text-ink-500">Este efeito não tem parâmetros.</p>
        )}

        <div className="space-y-2.5">
          {pattern.params.map((spec) => (
            <ParamControl
              key={spec.key}
              spec={spec}
              value={params[spec.key] ?? spec.default}
              onChange={(v) => update(spec.key, v)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ParamControl({
  spec,
  value,
  onChange
}: {
  spec: ParamSpec
  value: ParamValue
  onChange: (value: ParamValue) => void
}): React.JSX.Element {
  if (spec.type === 'boolean') {
    return (
      <label className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-300">{spec.label}</span>
        <input
          type="checkbox"
          className="accent-brand-500"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    )
  }

  if (spec.type === 'select') {
    return (
      <label className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-300">{spec.label}</span>
        <select
          className="field w-32"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {spec.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  const numeric = Number(value)
  const pct = spec.max > spec.min ? ((numeric - spec.min) / (spec.max - spec.min)) * 100 : 0

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-ink-300">{spec.label}</span>
        <span className="font-mono text-[11px] text-ink-400">
          {formatNumber(numeric)}
          {spec.unit ? ` ${spec.unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={numeric}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}
