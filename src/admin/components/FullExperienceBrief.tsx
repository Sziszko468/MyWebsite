import { fill, useInterfaceLanguage, useText } from '../i18n'
import { readBrief } from '../lib/brief'
import styles from '../styles/ui.module.scss'

/**
 * The complete requirements of a FULL EXPERIENCE request: the language the visitor asked to be answered in, then every question
 * with the answers given (or "skipped"), in the administrator's language. Read from what was stored with the request, so it is
 * what the visitor saw when they sent it even if the questions were edited since. The description and the contact details are the
 * request's own fields, shown beside it.
 */
export function FullExperienceBrief({ json }: { json: string | null }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const brief = readBrief(json)
  if (!brief) return <p className={styles.hint}>{t.shop.quote.noBrief}</p>
  return (
    <>
      <dl className={styles.definitions}>
        <dt>{t.shop.quote.preferred}</dt>
        <dd>{(t.languages as Record<string, string>)[brief.preferredLanguage] ?? brief.preferredLanguage}</dd>
      </dl>
      <ul className={styles.briefList} aria-label={t.shop.quote.briefTitle}>
        {brief.questions.map((question) => (
          <li key={question.id} className={styles.briefItem}>
            <span className={styles.briefQuestion}>{question.title[language] || question.title.en}</span>
            <span>{question.answers.length > 0 ? question.answers.map((answer) => answer.label[language] || answer.label.en).join(', ') : fill('({skipped})', { skipped: t.shop.quote.skipped })}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
