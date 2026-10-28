import { useLayoutEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { cx } from '../../utils/cx'
import styles from './Reveal.module.scss'

interface RevealProps {
  as?: ElementType
  /** Delay in milliseconds, for a short sequence of siblings. */
  delay?: number
  className?: string
  children: ReactNode
}

/**
 * Lets its content arrive once, the first time it scrolls into view: a short rise and fade.
 * Content that is already on screen when it mounts is never hidden, and nothing is hidden at all
 * without IntersectionObserver or under reduced motion. The state lives in a data attribute, so
 * it costs React no renders.
 */
export function Reveal({ as, delay = 0, className, children }: RevealProps) {
  const Tag: ElementType = as ?? 'div'
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const box = element.getBoundingClientRect()
    if (box.top < window.innerHeight * 0.92 && box.bottom > 0) return

    element.dataset.reveal = 'hidden'
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        element.dataset.reveal = 'shown'
        observer.disconnect()
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
      delete element.dataset.reveal
    }
  }, [])

  return (
    <Tag ref={ref} className={cx(styles.reveal, className)} style={delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined}>
      {children}
    </Tag>
  )
}
