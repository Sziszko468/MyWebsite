import { useId } from 'react'
import { contactLinks } from '../../config/links'
import { siteConfig } from '../../config/site'
import { useI18n } from '../../i18n/useI18n'
import styles from './ProfileLinks.module.scss'

// Where a link is still missing, development shows a muted note; production shows nothing.
const SHOW_PENDING = import.meta.env.DEV

/**
 * The e-mail address and the profiles from config/site.ts, as links. Only what is set appears: no
 * address is ever shown that was not configured. A link to another site opens in a new tab, safely
 * (noopener, noreferrer), and says so for screen readers; an e-mail link opens the mail program.
 * With nothing configured, the block is left out (in development a note says where to set them).
 */
export function ProfileLinks() {
  const { t } = useI18n()
  const titleId = useId()
  const links = contactLinks(siteConfig)

  if (links.length === 0) {
    return SHOW_PENDING ? <p className={styles.pending}>{t.contactPage.links.title}: src/config/site.ts</p> : null
  }

  return (
    <section className={styles.links} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        {t.contactPage.links.title}
      </h3>
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            {link.external ? (
              <a className={styles.link} href={link.href} target="_blank" rel="noopener noreferrer">
                <span>{link.label}</span>
                <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
                <span className={styles.arrow} aria-hidden="true">
                  ↗
                </span>
              </a>
            ) : (
              <a className={styles.link} href={link.href}>
                <span>{link.label}</span>
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
