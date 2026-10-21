/**
 * Small confirmation messages.
 *
 * Some actions (like copying an effect to every zone) are hard to notice from
 * the result alone, so they leave a short note on the corner of the window.
 */

import { useEffect, useState } from 'react'

interface ToastMessage {
  id: number
  text: string
  durationMs: number
}

let nextId = 1
let emit: ((message: ToastMessage) => void) | null = null

/** Shows a short message on the corner of the window. */
export function showToast(text: string, durationMs = 2800): void {
  emit?.({ id: nextId++, text, durationMs })
}

export function ToastHost(): React.JSX.Element {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  useEffect(() => {
    emit = (message) => {
      setMessages((current) => [...current, message])
      window.setTimeout(() => {
        setMessages((current) => current.filter((m) => m.id !== message.id))
      }, message.durationMs)
    }
    return () => {
      emit = null
    }
  }, [])

  if (messages.length === 0) return <></>

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {messages.map((message) => (
        <div
          key={message.id}
          className="rounded-lg border border-ink-600 bg-ink-850/95 px-3 py-2 text-[11.5px] text-ink-100 shadow-2xl backdrop-blur"
        >
          {message.text}
        </div>
      ))}
    </div>
  )
}
