/**
 * Card with a title row.
 *
 * Every dashboard section has the same anatomy: a small uppercase title, an
 * optional chip on the right (the count, the source, a caveat) and the
 * content. Keeping it here stops each page from inventing its own header.
 *
 * A section marked `collapsible` folds to a single title bar, which lets a
 * long page (Sistema) fit on a small window without hiding anything for good.
 *
 * A section marked `scroll` bounds its own height and scrolls the content
 * inside, so a list of unknown length (the sensor groups) cannot stretch the
 * whole grid row and push the rest of the page down.
 */

import { useState } from 'react'
import { Card } from './Card'

export function Section({
  title,
  chip,
  action,
  collapsible = false,
  scroll = false,
  className = '',
  children
}: {
  title: string
  /** Short status text on the right of the title. */
  chip?: string
  /** Anything else on the right, e.g. a button. */
  action?: React.ReactNode
  /** Adds a chevron and lets the content fold away. */
  collapsible?: boolean
  /** Caps the card height and scrolls its content instead. */
  scroll?: boolean
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(true)

  return (
    <Card
      className={[
        // Folded away, the card keeps its own height instead of being
        // stretched to the neighbour's: folding it is a request for less space.
        collapsible && !open ? 'self-start' : '',
        scroll ? 'card-scroll' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex shrink-0 items-start justify-between gap-3">
        <h2 className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
          {collapsible ? (
            <button
              type="button"
              className="-mx-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:text-ink-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-100"
              aria-expanded={open}
              title={open ? 'Recolher' : 'Expandir'}
              onClick={() => setOpen((value) => !value)}
            >
              <span aria-hidden="true" className="text-[9px] leading-none">
                {open ? '▾' : '▸'}
              </span>
              <span>{title}</span>
            </button>
          ) : (
            title
          )}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {chip && <span className="chip">{chip}</span>}
          {action}
        </div>
      </div>
      {open && (
        <div className={scroll ? 'card-scroll-body mt-4 pr-1' : 'mt-4'}>{children}</div>
      )}
    </Card>
  )
}
