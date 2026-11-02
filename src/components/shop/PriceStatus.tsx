import type { ServicePrice, VatMode } from '../../content/pricing'
import { useI18n } from '../../i18n/useI18n'
import { useCommonText } from '../../shop/hooks'
import { cx } from '../../utils/cx'
import styles from './PriceStatus.module.scss'

interface PriceStatusProps {
  price: ServicePrice
  vat?: VatMode
  /** Adds the sentence that says where the price comes from (the quote). */
  hint?: boolean
  className?: string
}

/**
 * A price in whichever state it is in: a published starting price with its currency and VAT
 * wording, "Custom Quote" with the reason, or "to be confirmed". No amount is ever made up here:
 * `from` is shown only when the content sets it (content/packages.ts, content/services/addons.ts).
 */
export function PriceStatus({ price, vat = 'unspecified', hint = false, className }: PriceStatusProps) {
  const { lang } = useI18n()
  const common = useCommonText()
  const text = common.price

  return (
    <span className={cx(styles.price, className)}>
      {price.kind === 'from' && (
        <>
          <span className={styles.label}>{text.from}</span>
          <strong className={styles.value}>
            {new Intl.NumberFormat(lang, { style: 'currency', currency: price.currency, maximumFractionDigits: 0 }).format(price.amount)}
            {vat !== 'unspecified' && <span className={styles.vat}> {text.vat[vat]}</span>}
          </strong>
          {hint && <span className={styles.hint}>{text.exact}</span>}
        </>
      )}
      {price.kind === 'quote' && (
        <>
          <strong className={styles.value}>{text.customQuote}</strong>
          {hint && <span className={styles.hint}>{text.quoteHint}</span>}
        </>
      )}
      {price.kind === 'tbd' && <strong className={styles.value}>{text.tbd}</strong>}
    </span>
  )
}
