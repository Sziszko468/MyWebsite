import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react'
import { cx } from '../../utils/cx'
import { useMagnetic } from '../../motion/useMagnetic'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { Spinner } from '../motion/Loading'
import styles from './Button.module.scss'

interface BaseProps {
  variant?: 'primary' | 'secondary' | 'text'
  size?: 'sm' | 'md' | 'lg'
  /** Trailing arrow that nudges forward on hover. */
  arrow?: boolean
  /** Stretch to the width of the container. */
  fullWidth?: boolean
  disabled?: boolean
  /**
   * Waiting for something real (a request being sent). The button keeps its place, its size and its
   * focus; a spinner takes the arrow's place, it is announced as busy, and a press does nothing until
   * it is done. A disabled button would drop focus; this one does not.
   */
  loading?: boolean
  /**
   * What the label says while it is loading ("Sending…"). Both labels sit in the same cell and the one that
   * is not showing is only hidden, so the button is as wide as the longer of the two and nothing next to it
   * moves when it starts to wait; a reader hears the one that shows.
   */
  loadingLabel?: ReactNode
  /** The outcome, shown on the button itself: a tick that pops in (`success`) or a short shake (`error`). */
  status?: 'success' | 'error'
  /** A large call to action may lean toward a mouse (motion/useMagnetic.ts); never for a small control. */
  magnetic?: boolean
  className?: string
  children: ReactNode
}

type AsButton = BaseProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof BaseProps> & { href?: never; to?: never }
/** External or in-page link, rendered as a plain <a>. */
type AsAnchor = BaseProps &
  Omit<ComponentPropsWithoutRef<'a'>, keyof BaseProps> & { href: string; to?: never }
/** Internal link: `to` is language-free and gets the current language prefix. */
type AsRouteLink = BaseProps &
  Omit<ComponentPropsWithoutRef<'a'>, keyof BaseProps | 'href'> & { to: string; href?: never }

export type ButtonProps = AsButton | AsAnchor | AsRouteLink

function Tick() {
  return (
    <svg className={styles.tick} viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
      <path d="M3 8.5l3.2 3.2L13 4.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Arrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true">
      <path d="M2 8h11m0 0L8.5 3.5M13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  arrow = false,
  fullWidth = false,
  disabled = false,
  loading = false,
  loadingLabel,
  status,
  magnetic = false,
  className,
  children,
  href,
  to,
  ...rest
}: ButtonProps) {
  const classes = cx(styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, magnetic && styles.magnetic, className)
  const magnet = useMagnetic<HTMLElement>(magnetic)
  const state = { 'data-loading': loading || undefined, 'data-status': status, 'aria-busy': loading || undefined }
  const content = (
    <>
      <span className={styles.label}>
        {loadingLabel === undefined ? (
          children
        ) : (
          <span className={styles.swap}>
            <span className={styles.slot} data-showing={!loading || undefined}>
              {children}
            </span>
            <span className={styles.slot} data-showing={loading || undefined}>
              {loadingLabel}
            </span>
          </span>
        )}
      </span>
      {loading ? <Spinner className={styles.spinner} /> : status === 'success' ? <Tick /> : arrow && <Arrow />}
    </>
  )

  if (href === undefined && to === undefined) {
    const { type = 'button', onClick, ...buttonProps } = rest as ComponentPropsWithoutRef<'button'>
    return (
      <button
        {...buttonProps}
        {...state}
        ref={magnet as Ref<HTMLButtonElement>}
        type={type}
        className={classes}
        disabled={disabled}
        // While loading a press does nothing (and cannot submit a form a second time), but focus stays.
        onClick={loading ? (event) => event.preventDefault() : onClick}
      >
        {content}
      </button>
    )
  }

  const anchorProps = rest as ComponentPropsWithoutRef<'a'>

  // A disabled link is not a link: drop the destination so it cannot be followed or focused.
  if (disabled) {
    return (
      <a
        {...anchorProps}
        {...state}
        role="link"
        aria-disabled="true"
        className={classes}
        onClick={(event) => event.preventDefault()}
      >
        {content}
      </a>
    )
  }

  if (to !== undefined) {
    return (
      <LocalizedLink {...anchorProps} {...state} ref={magnet as Ref<HTMLAnchorElement>} to={to} className={classes}>
        {content}
      </LocalizedLink>
    )
  }

  return (
    <a {...anchorProps} {...state} ref={magnet as Ref<HTMLAnchorElement>} href={href} className={classes}>
      {content}
    </a>
  )
}
