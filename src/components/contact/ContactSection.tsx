import { useId } from 'react'
import type { ContactDraft, ContactField } from '../../contact/types'
import { useI18n } from '../../i18n/useI18n'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { ContactForm } from './ContactForm'
import { ProfileLinks } from './ProfileLinks'
import { contactTone } from './rhythm'
import styles from './ContactSection.module.scss'

interface ContactSectionProps {
  draft: ContactDraft
  onChange: <K extends ContactField>(field: K, value: ContactDraft[K]) => void
  onReset: () => void
}

/**
 * The band the doors lead to: the title, what to know and the configured links on one side, the form
 * on the other (above each other on a narrow screen).
 */
export function ContactSection({ draft, onChange, onReset }: ContactSectionProps) {
  const { t } = useI18n()
  const titleId = useId()
  const asideId = useId()
  const copy = t.contactPage.form

  return (
    <Section id="message" tone={contactTone('message')} slant labelledBy={titleId}>
      <Container size="wide">
        <div className={styles.layout}>
          <Reveal className={styles.lead}>
            <SectionHeading id={titleId} index="01" title={copy.title} description={copy.intro} size="stacked" />

            <aside className={styles.aside} aria-labelledby={asideId}>
              <h3 id={asideId} className={styles.asideTitle}>
                {copy.aside.title}
              </h3>
              <ul>
                {copy.aside.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>

            <ProfileLinks />
          </Reveal>

          <div className={styles.form}>
            <ContactForm draft={draft} onChange={onChange} onReset={onReset} />
          </div>
        </div>
      </Container>
    </Section>
  )
}
