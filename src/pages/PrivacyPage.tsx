import { measurementIsOffered } from '../analytics/offer'
import { Container } from '../components/Container/Container'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { privacyText as text, storedItems } from '../content/privacy'
import { siteConfig } from '../config/site'
import { useI18n } from '../i18n/useI18n'
import styles from './PrivacyPage.module.scss'

/**
 * The privacy and cookie notice (content/privacy.ts). One h1, then plain sections: cookies, what the site
 * keeps in the browser, what leaves the device, measurement (which says whether this site measures at all),
 * what the visitor controls. Loaded as its own chunk.
 */
export function PrivacyPage() {
  const { lang } = useI18n()
  const measuring = measurementIsOffered()
  const email = siteConfig.contact.email

  return (
    <div className={styles.page}>
      <Container size="narrow">
        <h1 className={styles.title}>{text.title[lang]}</h1>
        <p className={styles.lead}>{text.lead[lang]}</p>

        <section className={styles.section} aria-labelledby="privacy-cookies">
          <h2 id="privacy-cookies">{text.cookies.title[lang]}</h2>
          <p>{text.cookies.text[lang]}</p>
        </section>

        <section className={styles.section} aria-labelledby="privacy-stored">
          <h2 id="privacy-stored">{text.stored.title[lang]}</h2>
          <p>{text.stored.text[lang]}</p>
          <dl className={styles.items}>
            {storedItems
              .filter((item) => measuring || !item.onlyWithMeasurement)
              .map((item) => (
                <div key={item.name} className={styles.item}>
                  <dt>
                    <code>{item.name}</code>
                    <span className={styles.where}>
                      {text.stored.where[lang]}: {item.where}
                    </span>
                  </dt>
                  <dd>{item.purpose[lang]}</dd>
                </div>
              ))}
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="privacy-leaving">
          <h2 id="privacy-leaving">{text.leaving.title[lang]}</h2>
          <ul>
            {text.leaving.items.map((item) => (
              <li key={item.en}>{item[lang]}</li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="privacy-assistant">
          <h2 id="privacy-assistant">{text.assistant.title[lang]}</h2>
          <ul>
            {text.assistant.items.map((item) => (
              <li key={item.en}>{item[lang]}</li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="privacy-measurement">
          <h2 id="privacy-measurement">{text.measurement.title[lang]}</h2>
          {measuring ? (
            <ul>
              {text.measurement.on.map((item) => (
                <li key={item.en}>{item[lang]}</li>
              ))}
            </ul>
          ) : (
            <p>{text.measurement.off[lang]}</p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="privacy-choices">
          <h2 id="privacy-choices">{text.choices.title[lang]}</h2>
          <ul>
            {text.choices.items.map((item) => (
              <li key={item.en}>{item[lang]}</li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="privacy-contact">
          <h2 id="privacy-contact">{text.contact.title[lang]}</h2>
          <p>
            {text.contact.text[lang]}{' '}
            <LocalizedLink to="/contact">{text.contact.link[lang]}</LocalizedLink>
            {email && (
              <>
                {' '}
                <a href={`mailto:${email}`}>{email}</a>
              </>
            )}
          </p>
        </section>
      </Container>
    </div>
  )
}
