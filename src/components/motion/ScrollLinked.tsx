import type { CSSProperties, ElementType, ReactNode } from 'react'
import { useScrollProgress } from '../../motion/scroll'
import { cx } from '../../utils/cx'
import styles from './ScrollLinked.module.scss'

interface ScrollLinkedProps {
  as?: ElementType
  /**
   * `shift`: parallax, the content moves a little against the scroll (depth, never information).
   * `fill`: the element carries `--sp` for its own CSS (a line that fills as the section passes).
   */
  mode?: 'shift' | 'fill'
  /** For `shift`: how far the content travels at most, as a CSS length at intensity 1 (negative moves it up). */
  range?: string
  className?: string
  /** The accessible name, when the element is a landmark such as a <nav>. */
  'aria-label'?: string
  children: ReactNode
}

/**
 * An element that follows the scroll position without touching the scroll: while it is on screen it
 * gets two numbers (`--sp`, 0 to 1 through its pass, and `--sp-c`, -1 to 1 around the middle) and
 * CSS turns them into a transform. Nothing scrolls, snaps or waits (see motion/scroll.ts); how far it
 * moves is `range` × the scope's intensity × the touch factor, so the shop moves less, a phone moves
 * half as much, and reduced motion moves nothing (the numbers are then never written at all and the
 * content sits at rest).
 */
export function ScrollLinked({ as, mode = 'shift', range = '-24px', className, 'aria-label': ariaLabel, children }: ScrollLinkedProps) {
  const Tag: ElementType = as ?? 'div'
  const ref = useScrollProgress<HTMLElement>()
  return (
    <Tag ref={ref} aria-label={ariaLabel} className={cx(mode === 'shift' && styles.shift, className)} style={mode === 'shift' ? ({ '--range': range } as CSSProperties) : undefined} data-scroll={mode}>
      {children}
    </Tag>
  )
}
