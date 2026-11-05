/**
 * Slider value that does not travel on every pixel.
 *
 * A range input fires `onChange` on each step of the drag, and the old code
 * sent the whole profile to the main process every time. The value only came
 * back through IPC, so the thumb lagged behind the cursor on a fast drag.
 *
 * This keeps a local draft (the thumb follows the pointer immediately) and
 * commits the last value after a short pause. When the stored value changes
 * from outside (another window, a loaded profile) the draft is dropped so the
 * slider shows the truth again.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** Trailing delay before a drag is written; short enough to feel live. */
export const SLIDER_COMMIT_MS = 120

export function useDebouncedNumber(
  value: number,
  commit: (next: number) => void,
  delay = SLIDER_COMMIT_MS
): [number, (next: number) => void] {
  const [draft, setDraft] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(commit)
  latest.current = commit

  // Follow an external change, but never fight the user mid-drag.
  useEffect(() => {
    if (timer.current === null) setDraft(null)
  }, [value])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const set = useCallback(
    (next: number) => {
      setDraft(next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        latest.current(next)
      }, delay)
    },
    [delay]
  )

  return [draft ?? value, set]
}
