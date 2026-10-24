import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './Button.module.scss'

interface BaseProps {
  variant?: 'primary' | 'secondary' | 'text'
  size?: 'md' | 'lg'
  /** Trailing arrow that nudges forward on hover. */
  arrow?: boolean
  disabled?: boolean
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
  disabled = false,
  className,
  children,
  href,
  to,
  ...rest
}: ButtonProps) {
  const classes = cx(styles.button, styles[variant], styles[size], className)
  const content = (
    <>
      <span className={styles.label}>{children}</span>
      {arrow && <Arrow />}
    </>
  )

  if (href === undefined && to === undefined) {
    const { type = 'button', ...buttonProps } = rest as ComponentPropsWithoutRef<'button'>
    return (
      <button {...buttonProps} type={type} className={classes} disabled={disabled}>
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
      <LocalizedLink {...anchorProps} to={to} className={classes}>
        {content}
      </LocalizedLink>
    )
  }

  return (
    <a {...anchorProps} href={href} className={classes}>
      {content}
    </a>
  )
}
