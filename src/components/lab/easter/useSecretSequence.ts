import { useEffect, useRef } from 'react'
import { advanceSequence, ignoresKey, SECRET_KEYS } from './eggConfig'

/** Typing N F S U 2 on the Lab page opens the hidden racing experience: the way in for a keyboard. */
export function useSecretSequence(onFound: () => void, enabled = true): void {
  const latest = useRef(onFound)
  useEffect(() => {
    latest.current = onFound
  })
  useEffect(() => {
    if (!enabled) return
    let progress = 0
    const onKey = (event: KeyboardEvent) => {
      if (ignoresKey(event) || event.key.length !== 1) return
      progress = advanceSequence(progress, event.key)
      if (progress === SECRET_KEYS.length) {
        progress = 0
        latest.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
