import { Link, useLocation } from 'react-router'
import { LANGUAGES, LANGUAGE_META } from '../../i18n/config'
import { switchLanguagePath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'
import styles from './LanguageSwitcher.module.scss'

/** Real links to the same page in each language, so it works without JS and is crawlable. */
export function LanguageSwitcher() {
  const { lang, t } = useI18n()
  const { pathname, search, hash } = useLocation()

  return (
    <nav aria-label={t.language.label}>
      <ul className={styles.list}>
        {LANGUAGES.map((code) => {
          const { code: label, name } = LANGUAGE_META[code]
          const isCurrent = code === lang
          return (
            <li key={code}>
              <Link
                to={`${switchLanguagePath(pathname, code)}${search}${hash}`}
                className={styles.link}
                lang={code}
                hrefLang={code}
                aria-current={isCurrent ? 'true' : undefined}
              >
                {label}
                <span className="visually-hidden">: {name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
