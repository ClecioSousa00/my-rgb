/**
 * Title block shared by the dashboard pages.
 *
 * The title and subtitle come from the navigation map, so a page cannot drift
 * from its sidebar entry. Actions (refresh, export...) sit on the right.
 */

import type { PageId } from '@shared/types'
import { PAGE_META } from '../../navigation'

export function PageHeader({
  page,
  /** Replaces the subtitle from the navigation map. */
  subtitle,
  children
}: {
  page: PageId
  subtitle?: string
  children?: React.ReactNode
}): React.JSX.Element {
  const meta = PAGE_META[page]

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{meta.title}</h1>
        <p className="page-subtitle">{subtitle ?? meta.subtitle}</p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-3">{children}</div>}
    </div>
  )
}
