import { useLayoutEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { observeOnce } from '../../motion/inView'
import { cx } from '../../utils/cx'
import styles from './Reveal.module.scss'

/**
 * How a block arrives. `rise` travels up a short way while it fades in (the default); `fade` only
 * fades; `scale` settles in from slightly smaller; `left` and `right` slide in from the side. How far
 * it travels and how quickly is not set here: it comes from the page's motion scope
 * (`--motion-distance-*`, `--motion-intensity`, the `--dur-*` tokens), so the shop's reveals are small
 * and quick, the Lab's are larger, and under reduced motion nothing travels at all.
 */
export type RevealVariant = 'rise' | 'fade' | 'scale' | 'left' | 'right'

interface RevealProps {
  as?: ElementType
  variant?: RevealVariant
  /** Delay in milliseconds, for a short sequence of siblings (see `staggerDelay` in motion/config.ts). */
  delay?: number
  className?: string
  children: ReactNode
}

/**
 * Lets its content arrive once, the first time it scrolls into view. Content that is already on
 * screen when it mounts is never hidden, and nothing is hidden at all without IntersectionObserver,
 * under reduced motion, or on the cart and the request builder (the `checkout` scope: nothing
 * stands between the visitor and the next step). The state lives in a data attribute, so it costs
 * React no renders, and the watching is shared with every other reveal (motion/inView.ts).
 */
export function Reveal({ as, variant = 'rise', delay = 0, className, children }: RevealProps) {
  const Tag: ElementType = as ?? 'div'
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (element.closest('[data-motion-scope="checkout"]')) return

    const box = element.getBoundingClientRect()
    if (box.top < window.innerHeight * 0.92 && box.bottom > 0) return

    element.dataset.reveal = 'hidden'
    const stop = observeOnce(
      element,
      () => {
        element.dataset.reveal = 'shown'
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    return () => {
      stop()
      delete element.dataset.reveal
    }
  }, [])

  return (
    <Tag
      ref={ref}
      className={cx(styles.reveal, className)}
      data-variant={variant === 'rise' ? undefined : variant}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  )
}
