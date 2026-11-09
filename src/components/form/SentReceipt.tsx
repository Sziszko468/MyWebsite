import type { Receipt } from '../../forms/submit'
import type { Language } from '../../i18n/config'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { formatMoment } from '../../utils/format'
import styles from './SentReceipt.module.scss'

export interface ReceiptWords {
  reference: string
  referenceHint: string
  submitted: string
  summary: string
  emailQueued: string
  emailNotSent: string
  statusLink: string
  statusHint: string
  noPayment: string
}

/**
 * What the visitor holds after a successful send: the reference, when it was received, what was sent (a snapshot taken before the form was
 * cleared), the state of the confirmation e-mail, and the private link to the status page. Without a receipt (a form handler that answers
 * nothing readable) it shows only the summary.
 */
export function SentReceipt({ receipt, rows, lang, words }: { receipt: Receipt | null; rows: ReadonlyArray<readonly [label: string, value: string]>; lang: Language; words: ReceiptWords }) {
  return (
    <div className={styles.receipt}>
      {receipt && (
        <div className={styles.reference}>
          <p className={styles.label}>{words.reference}</p>
          <p className={styles.code} data-testid="reference">
            {receipt.reference}
          </p>
          <p className={styles.hint}>{words.referenceHint}</p>
          {receipt.createdAt && (
            <p className={styles.meta}>
              <span className={styles.label}>{words.submitted}:</span> <time dateTime={receipt.createdAt}>{formatMoment(receipt.createdAt, lang)}</time>
            </p>
          )}
        </div>
      )}
      {receipt?.confirmationEmail === 'queued' && <p className={styles.note}>{words.emailQueued}</p>}
      {receipt?.confirmationEmail === 'not_sent' && (
        <p className={styles.warning} role="note">
          {words.emailNotSent}
        </p>
      )}
      <p className={styles.note}>{words.noPayment}</p>
      {receipt?.statusToken && (
        <p className={styles.status}>
          <LocalizedLink to={`/request/${receipt.statusToken}`} className={styles.link}>
            {words.statusLink}
          </LocalizedLink>
          <span className={styles.hint}>{words.statusHint}</span>
        </p>
      )}
      {rows.length > 0 && (
        <section aria-label={words.summary} className={styles.summary}>
          <h3 className={styles.summaryTitle}>{words.summary}</h3>
          <dl className={styles.facts}>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
