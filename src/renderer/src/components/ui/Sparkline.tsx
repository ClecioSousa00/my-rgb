/**
 * Inline sparkline for one live reading.
 *
 * The chart is deliberately plain: a single polyline scaled to the samples it
 * has, no axes and no fill. Its only job is to show the shape of the last
 * minute, so the row can stay on one line.
 *
 * Fewer than two samples cannot describe a line, so an empty slot keeps the
 * column width and the table does not jump when the second sample arrives.
 */

export function Sparkline({
  values,
  alert = false,
  width = 72,
  height = 20
}: {
  values: number[]
  /** Bright instead of muted, following the same inversion rule as values. */
  alert?: boolean
  width?: number
  height?: number
}): React.JSX.Element {
  const samples = values.filter((value) => Number.isFinite(value))

  if (samples.length < 2) {
    return <span className="sparkline-spacer" aria-hidden="true" style={{ width, height }} />
  }

  const min = Math.min(...samples)
  const max = Math.max(...samples)
  // A sensor that never moves would divide by zero; a flat line at the middle
  // is the honest picture of "no variation".
  const span = max - min || 1
  const step = width / (samples.length - 1)

  const points = samples
    .map((value, index) => {
      const x = index * step
      const y = height - ((value - min) / span) * (height - 2) - 1
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      className="sparkline"
      data-alert={alert}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Histórico do último minuto"
    >
      <polyline points={points} fill="none" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
