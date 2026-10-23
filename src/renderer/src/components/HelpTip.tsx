/**
 * Help tooltip.
 *
 * A small "?" that opens a short explanation. It opens on hover and also on
 * click, so it works with the mouse, with the keyboard and on a touch screen.
 *
 * The bubble is rendered in a portal on top of everything and positioned
 * against the window, so panels that scroll or clip their content never cut
 * the explanation in half.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MARGIN = 8

export function HelpTip({
  text,
  label = 'Ajuda'
}: {
  text: string
  label?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false })

  // Clicking anywhere else closes the tooltip.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (buttonRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const place = (): void => {
    const button = buttonRef.current
    const bubble = bubbleRef.current
    if (!button || !bubble) return
    const anchor = button.getBoundingClientRect()
    const box = bubble.getBoundingClientRect()

    let left = anchor.left + anchor.width / 2 - box.width / 2
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - box.width - MARGIN))

    let top = anchor.bottom + 6
    if (top + box.height > window.innerHeight - MARGIN) {
      // Not enough room below - put it above the button instead.
      top = Math.max(MARGIN, anchor.top - box.height - 6)
    }

    setPosition({ left, top, ready: true })
  }

  useLayoutEffect(() => {
    if (!open) {
      setPosition((p) => ({ ...p, ready: false }))
      return
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, text])

  return (
    <>
      <span
        ref={buttonRef}
        className="relative inline-flex shrink-0"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold leading-none transition-colors ${
            open
              ? 'border-brand-400 bg-brand-500/25 text-brand-300'
              : 'border-ink-500 text-ink-400 hover:border-brand-400 hover:text-brand-300'
          }`}
        >
          ?
        </button>
      </span>

      {open &&
        createPortal(
          <span
            ref={bubbleRef}
            role="tooltip"
            style={{
              left: position.left,
              top: position.top,
              visibility: position.ready ? 'visible' : 'hidden'
            }}
            className="panel fixed z-[9999] w-64 p-2.5 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-ink-200 shadow-2xl"
          >
            {text}
          </span>,
          document.body
        )}
    </>
  )
}
