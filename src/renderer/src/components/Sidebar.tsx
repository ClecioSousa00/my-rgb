/**
 * Sidebar navigation.
 *
 * Groups collapse and the choice is remembered in the app settings, so the
 * next start looks exactly like the last one. The active item keeps a 2px
 * white bar on the left - shape instead of colour.
 */

import { useApp } from '../store'
import { NAV_GROUPS, PAGE_META } from '../navigation'

export function Sidebar(): React.JSX.Element {
  const page = useApp((s) => s.page)
  const setPage = useApp((s) => s.setPage)
  const collapsedGroups = useApp((s) => s.collapsedGroups)
  const toggleGroup = useApp((s) => s.toggleGroup)

  return (
    <nav
      aria-label="Navegação principal"
      className="flex w-[224px] shrink-0 flex-col border-r border-ink-700 bg-ink-900/40"
    >
      <div className="flex-1 overflow-y-auto pb-4">
        {NAV_GROUPS.map((group) => {
          const collapsed = collapsedGroups.includes(group.id)
          return (
            <div key={group.id}>
              <button
                type="button"
                className="nav-group-label"
                aria-expanded={!collapsed}
                onClick={() => toggleGroup(group.id)}
              >
                <span>{group.label}</span>
                <span className="text-[9px] leading-none">{collapsed ? '▸' : '▾'}</span>
              </button>

              {!collapsed &&
                group.items.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="nav-item"
                    data-active={page === id}
                    aria-current={page === id ? 'page' : undefined}
                    onClick={() => setPage(id)}
                  >
                    {PAGE_META[id].title}
                  </button>
                ))}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
