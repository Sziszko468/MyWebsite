import { useI18n } from '../../i18n/useI18n'
import { viewOf, type ProjectCard } from '../../projects/types'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { Section } from '../Section/Section'
import type { SectionTone } from '../Section/tone'
import styles from './ProjectNav.module.scss'

function Neighbour({ card, direction }: { card: ProjectCard; direction: 'previous' | 'next' }) {
  const { lang, t } = useI18n()
  const view = viewOf(card, lang)
  return (
    <LocalizedLink to={card.detailPath as string} className={styles.neighbour} data-direction={direction}>
      <span className={styles.direction}>
        {direction === 'previous' && <span aria-hidden="true">← </span>}
        {direction === 'previous' ? t.project.nav.previous : t.project.nav.next}
        {direction === 'next' && <span aria-hidden="true"> →</span>}
      </span>
      <span className={styles.name}>{view.name}</span>
      <span className={styles.category}>{view.label}</span>
    </LocalizedLink>
  )
}

/**
 * The end of a project page: the project before and after (only ones that have a page of their
 * own, so no link ever leads nowhere), the way back to the portfolio and the way to talk.
 */
export function ProjectNav({ name, neighbours, tone }: { name: string; neighbours: { previous: ProjectCard; next: ProjectCard } | null; tone: SectionTone }) {
  const { t } = useI18n()

  return (
    <Section tone={tone} labelledBy="project-nav" className={styles.band}>
      <Container size="wide">
        <h2 id="project-nav" className="visually-hidden">
          {t.project.nav.label}: {name}
        </h2>
        <nav aria-label={t.project.nav.label} className={styles.nav}>
          {neighbours && (
            <div className={styles.pair}>
              <Neighbour card={neighbours.previous} direction="previous" />
              <Neighbour card={neighbours.next} direction="next" />
            </div>
          )}
          <div className={styles.actions}>
            <Button to="/work" variant="secondary">
              {t.project.backToPortfolio}
            </Button>
            <Button to="/contact" size="lg" arrow magnetic>
              {t.hero.ctaSecondary}
            </Button>
          </div>
        </nav>
      </Container>
    </Section>
  )
}
