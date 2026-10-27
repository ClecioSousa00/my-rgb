/**
 * Percentage meter with a thin bar.
 *
 * A label, the value in monospace, an optional hint and a 1px track - the
 * shape the Gargalo card uses for the live sample and the Visão geral reuses
 * for the same numbers, so a value reads the same on both pages.
 *
 * The bar is white on dark grey; an absent value leaves the track empty
 * instead of drawing a zero.
 */

export function Meter({
  label,
  text,
  hint,
  value,
  max = 100
}: {
  label: string
  text: string
  /** Small line under the value, e.g. which core is the busiest. */
  hint?: string
  /** 0-100 when it is a percentage, null/undefined when not measured. */
  value?: number
  max?: number
}): React.JSX.Element {
  const ratio = value === undefined ? undefined : (value / max) * 100
  const width = ratio === undefined ? undefined : Math.max(0, Math.min(100, ratio))

  return (
    <div data-meter className="min-w-0">
      <div className="metric-label truncate" title={label}>
        {label}
      </div>
      <div className="mt-1 font-mono text-[15px] leading-none text-ink-100">{text}</div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-ink-500">{hint}</div>}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-700">
        {width !== undefined && <div className="h-full bg-ink-100" style={{ width: `${width}%` }} />}
      </div>
    </div>
  )
}
