import type { FaqItem } from '../../content/services/faq'
import { useI18n } from '../../i18n/useI18n'
import { Disclosure } from './Disclosure'
import styles from './FaqList.module.scss'

/**
 * Questions and answers (content/services/faq.ts) as disclosures that slide open: a button per
 * question, the answer in a region that stays out of reach while it is closed. Every answer is in
 * the page's markup, so search and assistive technology can read them all.
 */
export function FaqList({ items }: { items: readonly FaqItem[] }) {
  const { lang } = useI18n()

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id}>
          <Disclosure title={item.question[lang]} level={3}>
            <p className={styles.answer}>{item.answer[lang]}</p>
          </Disclosure>
        </li>
      ))}
    </ul>
  )
}
