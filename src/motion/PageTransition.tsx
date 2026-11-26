import { useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { MOTION, type MotionScope } from './config'
import { arrivalOf } from './navigation'
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
 *
 * How a page arrives is decided once, when it arrives. A later change of its own address (a search or a filter written into it, another language) is not an
 * arrival and replays nothing.
 */
export function PageTransition({ routeKey, scope, children }: PageTransitionProps) {
  return (
    <Arrival key={routeKey} scope={scope}>
      {children}
    </Arrival>
  )
}

function Arrival({ scope, children }: { scope: MotionScope; children: ReactNode }) {
  const navigation = useNavigationType()
  const { key } = useLocation()
  const [{ startPage, returning }] = useState(() => arrivalOf(navigation, key))
  const { kind, duration } = MOTION.scope[scope].enter

  return (
    <div className={styles.page} data-enter={startPage ? 'none' : kind} data-nav={returning ? 'pop' : 'push'} style={{ '--page-enter-dur': `${duration}ms` } as CSSProperties}>
      {children}
    </div>
  )
}
