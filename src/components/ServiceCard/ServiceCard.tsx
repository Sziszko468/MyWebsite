import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import styles from './ServiceCard.module.scss'

/** Prices are configuration, never hard-wired: `tbd` until a real value exists. */
export type ServicePrice =
  | { kind: 'from'; amount: number; currency: 'EUR' | 'HUF' }
  | { kind: 'quote' }
  | { kind: 'tbd' }

interface ServiceCardProps {
  name: string
  description: string
  price: ServicePrice
  /** Editorial number, e.g. "01". Decorative. */
  index?: string
  /** Highlights the card with the red accent. */
  featured?: boolean
  headingLevel?: 2 | 3 | 4
  /** Optional extra content (deliverables, scope notes) between description and price. */
  children?: ReactNode
  /** The way to act on the offer (a quote request), under the price. */
  action?: ReactNode
  className?: string
}

export function ServiceCard({
  name,
  description,
  price,
  index,
  featured = false,
  headingLevel = 3,
  children,
  action,
  className,
}: ServiceCardProps) {
  const { lang, t } = useI18n()
  const Heading = `h${headingLevel}` as const

  return (
    <article className={cx(styles.card, featured && styles.featured, className)}>
      <header className={styles.header}>
        {index && (
          <span className={styles.index} aria-hidden="true">
            {index}
          </span>
        )}
        <Heading className={styles.name}>{name}</Heading>
      </header>

      <p className={styles.description}>{description}</p>

      {children && <div className={styles.extra}>{children}</div>}

      <footer className={styles.price}>
        {price.kind === 'from' && (
          <>
            <span className={styles.priceLabel}>{t.services.priceFrom}</span>
            <span className={styles.priceValue}>
              {new Intl.NumberFormat(lang, {
                style: 'currency',
                currency: price.currency,
                maximumFractionDigits: 0,
              }).format(price.amount)}
            </span>
          </>
        )}
        {price.kind === 'quote' && <span className={styles.priceValue}>{t.services.priceQuote}</span>}
        {price.kind === 'tbd' && <span className={styles.priceMuted}>{t.services.priceTbd}</span>}
        {action && <div className={styles.action}>{action}</div>}
      </footer>
    </article>
  )
}
