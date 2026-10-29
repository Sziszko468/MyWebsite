import type { ServicePrice, VatMode } from '../../content/pricing'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import styles from './PriceTag.module.scss'

interface PriceTagProps {
  price: ServicePrice
  /** How a published price treats VAT; shown next to the amount. */
  vat?: VatMode
  /** The exact price is confirmed in a quote: adds a line saying so under a published price. */
  quoteRequired?: boolean
  /** An optional sentence under the price, already in the visitor's language. */
  note?: string | null
  className?: string
}

/**
 * A price, in whichever state it is: a published starting price (with its currency and its VAT
 * wording), "request a custom quote" with the reason, or "to be confirmed". No amount is ever
 * made up here: `from` is shown only when the content sets it.
 */
export function PriceTag({ price, vat = 'unspecified', quoteRequired = false, note = null, className }: PriceTagProps) {
  const { lang, t } = useI18n()

  return (
    <div className={cx(styles.price, className)}>
      {price.kind === 'from' && (
        <>
          <span className={styles.label}>{t.services.priceFrom}</span>
          <span className={styles.value}>
            {new Intl.NumberFormat(lang, { style: 'currency', currency: price.currency, maximumFractionDigits: 0 }).format(price.amount)}
            {vat !== 'unspecified' && <span className={styles.vat}> {t.services.vat[vat]}</span>}
          </span>
          {quoteRequired && <span className={styles.hint}>{t.services.priceExact}</span>}
        </>
      )}
      {price.kind === 'quote' && (
        <>
          <span className={styles.value}>{t.services.priceQuote}</span>
          <span className={styles.hint}>{t.services.priceQuoteHint}</span>
        </>
      )}
      {price.kind === 'tbd' && <span className={styles.muted}>{t.services.priceTbd}</span>}
      {note && <span className={styles.hint}>{note}</span>}
    </div>
  )
}
