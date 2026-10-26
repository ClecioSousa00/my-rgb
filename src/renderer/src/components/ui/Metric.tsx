/**
 * One labelled value.
 *
 * The label is muted and uppercase, the value is monospaced - so a grid of
 * metrics reads like a data sheet and the numbers line up between cards.
 * A missing value arrives as "—" from the format helpers, never as a blank.
 */

export function Metric({
  label,
  value,
  hint
}: {
  label: string
  value: React.ReactNode
  /** Extra line under the value, for a caveat or a unit. */
  hint?: string
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="metric-label">{label}</div>
      <div className="mt-1 truncate font-mono text-[12.5px] text-ink-100" title={typeof value === 'string' ? value : undefined}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10.5px] text-ink-500">{hint}</div>}
    </div>
  )
}

/** The two/three column grid the metrics sit in. */
export function MetricGrid({
  children,
  columns = 2
}: {
  children: React.ReactNode
  columns?: 2 | 3
}): React.JSX.Element {
  return (
    <div
      className={`grid gap-x-6 gap-y-4 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
    >
      {children}
    </div>
  )
}
