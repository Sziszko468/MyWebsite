import type { CSSProperties, ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { MOTION, type MotionScope } from './config'
import styles from './PageTransition.module.scss'

interface PageTransitionProps {
  /** Changes when the page changes (the language-free path): a new key is a new page, the same key in another language is not. */
  routeKey: string
  scope: MotionScope
  children: ReactNode
}

/**
 * The way one page arrives. The router keeps the old page on screen until the new one can replace it
 * (every page is its own chunk, and the navigation is a React transition), so there is no blank
 * frame, no loading screen and nothing to wait for: the new page is simply mounted under a new key and
 * plays its short entrance, and a click is never held up by an exit animation.
 *
 * How it arrives depends on the page's motion scope (motion/config.ts): a fade for the portfolio and the
 * site (a little slower for the portfolio), a very quick one in the shop and almost none in the cart and
 * the request builder, and for the Lab a diagonal wipe on the brand's slant. Back and Forward arrive in a
 * fraction of the time, and the page a visit starts on does not animate at all (it would only delay the
 * first paint). Only opacity and clip-path are animated, never a transform: a transform on the wrapper
 * would turn it into the containing block of every fixed bar inside the page. Under reduced motion
 * there is no entrance.
 */
export function PageTransition({ routeKey, scope, children }: PageTransitionProps) {
  const navigation = useNavigationType()
  const { key } = useLocation()
  const { kind, duration } = MOTION.scope[scope].enter

  // The history entry a visit starts on is the one with the router's default key: nothing to arrive from.
  const startPage = navigation === 'POP' && key === 'default'

  return (
    <div
      key={routeKey}
      className={styles.page}
      data-enter={startPage ? 'none' : kind}
      data-nav={navigation === 'POP' ? 'pop' : 'push'}
      style={{ '--page-enter-dur': `${duration}ms` } as CSSProperties}
    >
      {children}
    </div>
  )
}
