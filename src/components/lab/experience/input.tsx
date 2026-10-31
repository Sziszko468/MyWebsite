import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { cx } from '../../../utils/cx'
import styles from './input.module.scss'

/** Whether an event came from something the visitor is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * The keys held down right now, by `KeyboardEvent.code`. A game reads this every frame instead of
 * reacting to key events, so holding two keys works and a key that was released is never "stuck":
 * every key is forgotten when the window loses focus.
 *
 * `claim` lists the codes this experience takes (arrows, space): while it is active their default
 * action (scrolling the page) is cancelled, but only when the visitor is not typing in a field.
 * `onPress` is called once per press of any key (not for repeats), for one-shot actions.
 */
export function useKeyState(
  active: boolean,
  claim: readonly string[],
  onPress?: (code: string, event: KeyboardEvent) => void,
): RefObject<Set<string>> {
  const held = useRef(new Set<string>())
  const handler = useRef(onPress)
  useEffect(() => {
    handler.current = onPress
  })

  useEffect(() => {
    if (!active) return
    const keys = held.current
    const down = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      if (claim.includes(event.code)) event.preventDefault()
      if (!keys.has(event.code)) {
        keys.add(event.code)
        handler.current?.(event.code, event)
      }
    }
    const up = (event: KeyboardEvent) => {
      keys.delete(event.code)
    }
    const clear = () => keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
      keys.clear()
    }
  }, [active, claim])

  return held
}

interface HoldButtonProps {
  /** Called with true while the button is held and false when it is let go, for any reason. */
  onHold: (held: boolean) => void
  children: ReactNode
  label: string
  className?: string
  style?: CSSProperties
  /** A key that does the same on a keyboard, shown to assistive technology. */
  shortcut?: string
}

/**
 * A button that is "on" for as long as it is pressed: a mouse button, a finger or the Space/Enter
 * key. It captures its pointer, so sliding off the button does not leave it stuck on, and several
 * can be held at once (one thumb steering while the other has the throttle). It keeps the page
 * from scrolling, selecting text or showing a menu under the thumb.
 */
export function HoldButton({ onHold, children, label, className, style, shortcut }: HoldButtonProps) {
  const holding = useRef(false)
  const set = (value: boolean) => {
    if (holding.current === value) return
    holding.current = value
    onHold(value)
  }
  // A control that unmounts while held must not leave its input on.
  useEffect(() => () => {
    if (holding.current) onHold(false)
  })

  const onKey = (event: ReactKeyboardEvent<HTMLButtonElement>, value: boolean) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      set(value)
    }
  }

  return (
    <button
      type="button"
      className={cx(styles.hold, className)}
      style={style}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      onPointerDown={(event) => {
        event.preventDefault()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // The press still counts.
        }
        set(true)
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onKeyDown={(event) => onKey(event, true)}
      onKeyUp={(event) => onKey(event, false)}
      onBlur={() => set(false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  )
}
