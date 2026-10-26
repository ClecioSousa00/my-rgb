/**
 * Occupancy ring.
 *
 * A track in dark grey and an arc in white - the only two colours the theme
 * uses. The arc is drawn with a dash pattern on an SVG circle, which keeps it
 * crisp at any size and needs no canvas.
 *
 * The percentage inside is monospaced so a column of rings lines up.
 */

export function Ring({
  percent,
  label,
  size = 84,
  stroke = 8,
  title
}: {
  percent: number
  /** Text in the middle. Defaults to the rounded percentage. */
  label?: string
  size?: number
  stroke?: number
  title?: string
}): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const arc = (clamped / 100) * circumference
  const text = label ?? `${Math.round(clamped)}%`

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={title ? `${title}: ${text}` : text}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-ink-600)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-ink-100)"
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${arc} ${circumference - arc}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-mono text-[13px] text-ink-100"
        aria-hidden="true"
      >
        {text}
      </span>
    </div>
  )
}
