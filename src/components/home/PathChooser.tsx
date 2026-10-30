import { useId } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { PathDoors } from './PathDoors'
import { homeTone } from './rhythm'

/**
 * Who is visiting: a person looking at the work, or a business with something to build. The two
 * doors are built by PathDoors; the first leads to the portfolio, the second to the contact page
 * with the web-project topic already chosen.
 */
export function PathChooser() {
  const { t } = useI18n()
  const sectionTitle = useId()
  const copy = t.home.path

  return (
    <Section id="path" tone={homeTone('path')} labelledBy={sectionTitle}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={sectionTitle} index="01" title={copy.title} />
        </Reveal>

        <PathDoors
          career={{ ...copy.career, action: { href: '#work' } }}
          clients={{ ...copy.clients, action: { to: '/contact?for=clients' } }}
        />
      </Container>
    </Section>
  )
}
