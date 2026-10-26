/**
 * What a page shows while it is still a placeholder.
 *
 * The point is to look deliberate: the title, the promise of the page and the
 * list of what it will contain. A blank screen would look broken.
 */

import type { PageId } from '@shared/types'
import { PAGE_META } from '../navigation'
import { Card } from './ui/Card'

export function PagePlaceholder({ page }: { page: PageId }): React.JSX.Element {
  const meta = PAGE_META[page]

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <h1 className="page-title">{meta.title}</h1>
      <p className="page-subtitle">{meta.subtitle}</p>

      <Card className="mt-6 max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <span className="metric-label">Em construção</span>
          <span className="chip">{meta.phase}</span>
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-300">
          Esta página faz parte do plano de incorporação do Reset Explode e vai mostrar:
        </p>

        <ul className="mt-3 space-y-1.5">
          {meta.planned.map((item) => (
            <li key={item} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-200">
              <span className="text-ink-500">—</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
