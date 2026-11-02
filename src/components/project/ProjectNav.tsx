import { projects, type ProjectEntry, type ProjectId } from '../../content/projects'
import { neighbours } from '../../content/projectDetails'
import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { Section } from '../Section/Section'
import type { SectionTone } from '../Section/tone'
import styles from './ProjectNav.module.scss'

function Neighbour({ project, direction }: { project: ProjectEntry; direction: 'previous' | 'next' }) {
  const { t } = useI18n()
  return (
    <LocalizedLink to={project.detailPath as string} className={styles.neighbour} data-direction={direction}>
      <span className={styles.direction}>
        {direction === 'previous' && <span aria-hidden="true">← </span>}
        {direction === 'previous' ? t.project.nav.previous : t.project.nav.next}
        {direction === 'next' && <span aria-hidden="true"> →</span>}
      </span>
      <span className={styles.name}>{project.name}</span>
      <span className={styles.category}>{t.home.work.items[project.id].category}</span>
    </LocalizedLink>
  )
}

/**
 * The end of a project page: the project before and after (only ones that have a page of their
 * own, so no link ever leads nowhere), the way back to the portfolio and the way to talk.
 */
export function ProjectNav({ id, tone }: { id: ProjectId; tone: SectionTone }) {
  const { t } = useI18n()
  const around = neighbours(id)
  const current = projects.find((project) => project.id === id)

  return (
    <Section tone={tone} labelledBy="project-nav" className={styles.band}>
      <Container size="wide">
        <h2 id="project-nav" className="visually-hidden">
          {t.project.nav.label}: {current?.name}
        </h2>
        <nav aria-label={t.project.nav.label} className={styles.nav}>
          {around && (
            <div className={styles.pair}>
              <Neighbour project={around.previous} direction="previous" />
              <Neighbour project={around.next} direction="next" />
            </div>
          )}
          <div className={styles.actions}>
            <Button to="/#work" variant="secondary">
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
