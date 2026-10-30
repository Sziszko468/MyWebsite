import { useI18n } from '../../i18n/useI18n'
import type { ContactPath } from '../../contact/types'
import { PathDoors } from '../home/PathDoors'
import { HeroLine, PageHero } from '../PageHero/PageHero'
import styles from './ContactHero.module.scss'

/**
 * The contact page's first screen: the question, a sentence, and two doors, one for an employer and
 * one for a client. A door is a link to the form below, and it also starts the form on its topic
 * (a job opportunity, a web development project) with a subject to begin from. Both end in the same
 * form.
 */
export function ContactHero({ onChoose }: { onChoose: (path: ContactPath) => void }) {
  const { t } = useI18n()
  const copy = t.contactPage.hero

  return (
    <PageHero
      compact
      seed={5}
      eyebrow={t.nav.contact}
      title={<HeroLine>{copy.title}</HeroLine>}
      lead={copy.lead}
    >
      <div className={styles.doors} role="group" aria-label={copy.doorsLabel}>
        <PathDoors
          size="long"
          career={{ ...copy.employers, action: { href: '#message', onClick: () => onChoose('employers') } }}
          clients={{ ...copy.clients, action: { href: '#message', onClick: () => onChoose('clients') } }}
        />
      </div>
    </PageHero>
  )
}
