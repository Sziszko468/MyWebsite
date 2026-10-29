import type { ReactNode } from 'react'
import type { ServicePrice, VatMode } from '../../content/pricing'
import { cx } from '../../utils/cx'
import { PriceTag } from './PriceTag'
import styles from './ServiceCard.module.scss'

export type { ServicePrice } from '../../content/pricing'

interface ServiceCardProps {
  name: string
  description: string
  price: ServicePrice
  /** How a published price treats VAT. */
  vat?: VatMode
  /** The exact price is confirmed in a quote. */
  quoteRequired?: boolean
  /** An optional sentence under the price. */
  priceNote?: string | null
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
  vat,
  quoteRequired,
  priceNote,
  index,
  featured = false,
  headingLevel = 3,
  children,
  action,
  className,
}: ServiceCardProps) {
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
        <PriceTag price={price} vat={vat} quoteRequired={quoteRequired} note={priceNote} />
        {action && <div className={styles.action}>{action}</div>}
      </footer>
    </article>
  )
}
