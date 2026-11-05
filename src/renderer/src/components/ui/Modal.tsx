/**
 * Small modal dialog.
 *
 * The profile prompts used to be plain `div`s: screen readers did not announce
 * them as dialogs, Tab reached the controls behind the overlay, and closing
 * left the focus nowhere. This wraps the same markup with the semantics and
 * the focus trap, keeping the visual style of the rest of the app.
 */

import { useEffect, useId, useRef } from 'react'

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

export function Modal({
  title,
  description,
  onClose,
  children
}: {
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  /** The control that opened the dialog, focused again on close. */
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => restoreRef.current?.focus()
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const items = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    )
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]

    // Keep Tab inside the dialog instead of moving to the page behind it.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="panel w-80 p-4 shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        <div id={titleId} className="mb-2 text-sm font-semibold">
          {title}
        </div>
        {description && (
          <div className="mb-1 text-[11px] text-ink-400">{description}</div>
        )}
        {children}
      </div>
    </div>
  )
}
