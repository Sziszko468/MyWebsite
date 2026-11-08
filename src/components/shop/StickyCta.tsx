import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../Button/Button'
import styles from './StickyCta.module.scss'

interface StickyCtaProps {
  /** What the bar says beside the button, e.g. the service's name. */
  label: ReactNode
  /** The button's text. */
  action: string
  /** The language-free destination of the button. */
  to: string
  /** Called before the button navigates (the page saves its selection to the cart here). */
  onActivate?: () => void
  /** The bar appears once this element has been scrolled past (the hero), so it never covers the first screen. Without it the bar is there from the start. */
  after?: string
  /** It steps aside while any of these elements (the price band, the closing band) or the footer is on screen. */
  hideOn?: readonly string[]
  /** Hidden from assistive technology's point of view too when false (nothing to ask for yet). */
  disabled?: boolean
}

const FOOTER = 'footer'
const NONE: readonly string[] = []

/**
 * A bar that keeps the main action in reach on a phone ("Request a quote"). It is made not to be
 * in the way: it shows only below the `md` breakpoint, only after the hero has been scrolled past,
 * and it leaves while the price band, the closing call to action or the footer are on screen, so
 * it never sits on top of the thing it points to. While it is shown the page reserves its height
 * (html[data-sticky-cta] widens the scroll padding), so a focused field is never behind it. Hidden,
 * it is inert, which takes it out of the tab order and the accessibility tree.
 */
export function StickyCta({ label, action, to, onActivate, after, hideOn = NONE, disabled = false }: StickyCtaProps) {
  const [passed, setPassed] = useState(after === undefined)
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observers: IntersectionObserver[] = []

    const start = after ? document.getElementById(after) : null
    if (start) {
      const observer = new IntersectionObserver(([entry]) => setPassed(!entry.isIntersecting && entry.boundingClientRect.bottom < 0))
      observer.observe(start)
      observers.push(observer)
    }

    for (const key of [...hideOn, FOOTER]) {
      const element = key === FOOTER ? document.querySelector(FOOTER) : document.getElementById(key)
      if (!element) continue
      const observer = new IntersectionObserver(([entry]) =>
        setBlocked((current) => {
          const next = new Set(current)
          if (entry.isIntersecting) next.add(key)
          else next.delete(key)
          return next.size === current.size && [...next].every((item) => current.has(item)) ? current : next
        }),
      )
      observer.observe(element)
      observers.push(observer)
    }
    return () => observers.forEach((observer) => observer.disconnect())
  }, [after, hideOn])

  const visible = passed && blocked.size === 0 && !disabled

  useEffect(() => {
    const root = document.documentElement
    if (visible) root.dataset.stickyCta = ''
    else delete root.dataset.stickyCta
    return () => {
      delete root.dataset.stickyCta
    }
  }, [visible])

  return (
    <div className={styles.bar} data-bottom-bar data-visible={visible || undefined} inert={!visible}>
      <p className={styles.label}>{label}</p>
      <Button to={to} size="md" arrow onClick={onActivate}>
        {action}
      </Button>
    </div>
  )
}
