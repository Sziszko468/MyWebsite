import type { ReactNode } from 'react'
import { siteConfig } from '../../config/site'
import { useI18n } from '../../i18n/useI18n'
import { useContact } from '../../profile/store'
import { BrandMark } from '../BrandMark/BrandMark'
import { Button } from '../Button/Button'
import { ConsultationCta } from '../consultation/ConsultationCta'
import { Container } from '../Container/Container'
import { measurementIsOffered } from '../../analytics/offer'
import { MeasurementSettingsButton } from '../Consent/ConsentBanner'
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { MainNav } from '../MainNav/MainNav'
import styles from './SiteFooter.module.scss'

// Entries without a real destination never become links. In development they show as muted
// labels so the layout can be judged; in production they are left out entirely.
const SHOW_PENDING = import.meta.env.DEV

const CURRENT_YEAR = new Date().getFullYear()

function Pending({ children }: { children: ReactNode }) {
  return (
    <span className={styles.pending} title="Placeholder: set it in src/config/site.ts">
      {children}
    </span>
  )
}

export function SiteFooter() {
  const { t } = useI18n()
  const { brandName, legal } = siteConfig
  const { email, social } = useContact()

  const socialItems = social.filter((profile) => profile.url || SHOW_PENDING)
  const legalItems = legal.filter((link) => link.path || SHOW_PENDING)

  return (
    <footer className={styles.footer}>
      <Container className={styles.inner}>
        <div className={styles.brand}>
          <BrandMark />
          <p className={styles.role}>{t.footer.role}</p>
        </div>

        <div className={styles.pages}>
          <h2 className={styles.heading}>{t.footer.pagesHeading}</h2>
          <MainNav variant="footer" label={t.footer.navLabel} />
          {/* PROMPT 37: the Command Center and the archive, beside the six main pages (the header's navigation is unchanged). */}
          <ul className={styles.list}>
            <li>
              <LocalizedLink className={styles.link} to="/command-center">
                {t.footer.commandCenter}
              </LocalizedLink>
            </li>
            <li>
              <LocalizedLink className={styles.link} to="/archive">
                {t.footer.archive}
              </LocalizedLink>
            </li>
          </ul>
        </div>

        <div className={styles.contact}>
          <h2 className={styles.heading}>{t.footer.contactHeading}</h2>
          <p className={styles.intro}>{t.footer.contactIntro}</p>
          <Button to="/contact" variant="text" arrow>
            {t.footer.contactLink}
          </Button>
          <ConsultationCta variant="link" />
          {email && (
            <a className={styles.link} href={`mailto:${email}`}>
              {email}
            </a>
          )}
        </div>

        {socialItems.length > 0 && (
          <div className={styles.social}>
            <h2 className={styles.heading}>{t.footer.socialHeading}</h2>
            <ul className={styles.list}>
              {socialItems.map((profile) => (
                <li key={profile.id}>
                  {profile.url ? (
                    <a className={styles.link} href={profile.url} target="_blank" rel="noopener noreferrer">
                      {profile.label}
                      <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
                    </a>
                  ) : (
                    <Pending>{profile.label}</Pending>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.bar}>
          <p className={styles.copy}>
            © {CURRENT_YEAR} {brandName}. {t.footer.rights}
          </p>

          {(legalItems.length > 0 || measurementIsOffered()) && (
            <nav aria-label={t.footer.legalLabel}>
              <ul className={styles.legal}>
                {legalItems.map((link) => (
                  <li key={link.id}>
                    {link.path ? (
                      <LocalizedLink className={styles.link} to={link.path}>
                        {t.footer.legal[link.id]}
                      </LocalizedLink>
                    ) : (
                      <Pending>{t.footer.legal[link.id]}</Pending>
                    )}
                  </li>
                ))}
                {measurementIsOffered() && (
                  <li>
                    <MeasurementSettingsButton className={styles.link} />
                  </li>
                )}
              </ul>
            </nav>
          )}

          <LanguageSwitcher label={`${t.language.label}: ${t.footer.navLabel}`} />
        </div>
      </Container>
    </footer>
  )
}
