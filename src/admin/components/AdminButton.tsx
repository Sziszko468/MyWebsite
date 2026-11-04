import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { cx } from '../../utils/cx'
import { Button } from '../../components/Button/Button'
import styles from '../styles/ui.module.scss'

type Variant = 'primary' | 'secondary' | 'text'

interface Common {
  variant?: Variant
  danger?: boolean
  loading?: boolean
  loadingLabel?: ReactNode
  fullWidth?: boolean
  className?: string
  children: ReactNode
}

type ButtonProps = Common & Omit<ComponentPropsWithoutRef<'button'>, keyof Common>
type LinkProps = Common & { to: string } & Omit<ComponentPropsWithoutRef<'a'>, keyof Common | 'href'>
/** A link out of the application (a `mailto:`, a download, the website): a plain anchor. */
type ExternalProps = Common & { href: string; to?: never } & Omit<ComponentPropsWithoutRef<'a'>, keyof Common | 'href'>

/**
 * The website's button (same shapes, focus ring, loading and tick states), set for work: sentence case instead of
 * capitals, a tighter size. A button with `to` is a real link (it opens in a new tab, it is announced as a link) that
 * navigates inside the application without reloading it.
 */
export function AdminButton(props: ButtonProps | LinkProps | ExternalProps) {
  const { variant = 'secondary', danger = false, className, ...rest } = props as ButtonProps & { to?: string }
  // A solid red button is already the brand's red: only the outlined and text buttons are recoloured to mean "danger".
  const classes = cx(styles.btn, danger && variant !== 'primary' && styles.btnDanger, className)
  const navigate = useNavigate()

  if ('href' in props && props.href !== undefined) {
    return (
      <Button {...(rest as object)} variant={variant} className={classes}>
        {props.children}
      </Button>
    )
  }
  if ('to' in props && props.to !== undefined) {
    const { to, onClick, ...anchor } = rest as unknown as LinkProps
    const go = (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event)
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      void navigate(to)
    }
    return (
      <Button {...(anchor as object)} href={`/admin${to === '/' ? '' : to}`} variant={variant} className={classes} onClick={go as never}>
        {props.children}
      </Button>
    )
  }
  return (
    <Button {...(rest as object)} variant={variant} className={classes}>
      {props.children}
    </Button>
  )
}
