/**
 * Dashboard card.
 *
 * One shape for every panel of the new pages: 16px radius, 20px padding,
 * near-black fill and a 1px line. The lighting screen keeps its denser
 * `.panel` so it does not lose vertical space.
 */

export function Card({
  children,
  className = ''
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return <section className={`card ${className}`}>{children}</section>
}
