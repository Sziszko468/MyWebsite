import { useId } from 'react'
import { faq } from '../../content/services/faq'
import { useI18n } from '../../i18n/useI18n'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { servicesTone } from './rhythm'
import styles from './Faq.module.scss'

/**
 * Questions and answers from content/services/faq.ts, as native disclosure elements: they open
 * and close with the keyboard and with a tap, work without a script, and keep every answer in
 * the page for search and for assistive technology.
 */
export function Faq() {
  const { lang, t } = useI18n()
  const titleId = useId()
  const copy = t.servicesPage.faq

  return (
    <Section id="faq" tone={servicesTone('faq')} slant labelledBy={titleId}>
      <Container size="wide">
        <div className={styles.layout}>
          <Reveal className={styles.lead}>
            <SectionHeading id={titleId} index="05" title={copy.title} description={copy.intro} size="stacked" />
          </Reveal>

          <ul className={styles.list}>
            {faq.map((item, position) => (
              <li key={item.id}>
                <Reveal delay={position * 50}>
                  <details className={styles.item}>
                    <summary className={styles.question}>
                      <span>{item.question[lang]}</span>
                      <svg className={styles.icon} viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
                        <path d="M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <path className={styles.vertical} d="M8 2v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </summary>
                    <p className={styles.answer}>{item.answer[lang]}</p>
                  </details>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  )
}
