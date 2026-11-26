import { Link, useLocation } from 'react-router'
import { LANGUAGES, LANGUAGE_META } from '../../i18n/config'
import { saveLanguage } from '../../i18n/preference'
import { useI18n } from '../../i18n/useI18n'
import { useSlidingIndicator } from '../../motion/indicator'
import { resolveLanguageSwitch } from '../../routes/languageSwitch'
import styles from './LanguageSwitcher.module.scss'

const CURRENT = ['a[aria-current="true"]']

/**
 * Real links to the same page in each language, so it works without JS and is crawlable.
 * A page without a translation links to that language's home page instead of a dead path. `label` names
 * the landmark when a page has two of them (the header's and the footer's), so each has its own name.
 */
export function LanguageSwitcher({ label }: { label?: string } = {}) {
  const { lang, t } = useI18n()
  const { pathname, search, hash } = useLocation()
  // One marker behind the current language glides to the newly chosen one (motion/indicator.ts); until it is placed the current link is filled by itself.
  const row = useSlidingIndicator<HTMLElement>(CURRENT, `${pathname} ${lang}`)

  return (
    <nav ref={row} className={styles.switcher} aria-label={label ?? t.language.label}>
      <span className={styles.marker} aria-hidden="true" />
      <ul className={styles.list}>
        {LANGUAGES.map((code) => {
          const { code: label, name } = LANGUAGE_META[code]
          const isCurrent = code === lang
          const target = resolveLanguageSwitch(pathname, code)
          return (
            <li key={code}>
              <Link
                // Query and hash belong to the page, so they only travel with it.
                to={target.samePage ? `${target.path}${search}${hash}` : target.path}
                className={styles.link}
                lang={code}
                hrefLang={code}
                aria-current={isCurrent ? 'true' : undefined}
                // Choosing a language is the only thing that saves one (i18n/preference.ts): from then on it beats the country.
                onClick={() => saveLanguage(code)}
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
