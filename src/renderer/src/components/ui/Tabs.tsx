/**
 * Tabs.
 *
 * A thin underline under the active tab and nothing else - no pills, no
 * colour. The arrow keys move between tabs, which is what the ARIA tabs
 * pattern expects and what makes the page usable without a mouse.
 */

import { useRef } from 'react'

export interface TabItem<T extends string> {
  id: T
  label: string
  /** Optional number in a small chip, e.g. the amount of drives. */
  count?: number
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label
}: {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** Accessible name of the tab list. */
  label: string
}): React.JSX.Element {
  const refs = useRef(new Map<T, HTMLButtonElement>())

  function onKeyDown(event: React.KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = items[(index + delta + items.length) % items.length]
    onChange(next.id)
    refs.current.get(next.id)?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-ink-700">
      {items.map((item, index) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) refs.current.set(item.id, node)
              else refs.current.delete(item.id)
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-active={active}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[12px] transition-colors ${
              active
                ? 'border-ink-100 text-ink-100'
                : 'border-transparent text-ink-400 hover:text-ink-200'
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="font-mono text-[10.5px] text-ink-500">{item.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
