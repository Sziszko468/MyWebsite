import { useId } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useCards } from '../../projects/useCards'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { ProjectCard } from '../ProjectCard/ProjectCard'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { ProjectMockup } from './ProjectMockup'
import { homeTone } from './rhythm'
import styles from './SelectedWork.module.scss'

/**
 * The featured projects (the same list the Work page reads: src/projects/) in an uneven composition: the lead is large, the second sits lower, the third is
 * a compact card, the fourth is wide. Each card is understandable without hovering: the status,
 * the category, the description and the technologies are always on screen, and the pointer only
 * adds depth to the picture. A project without a real screenshot shows a concept sketch, captioned
 * as one.
 */
export function SelectedWork() {
  const { t } = useI18n()
  const titleId = useId()
  const cards = useCards()

  return (
    <Section id="work" tone={homeTone('work')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="02" title={t.home.work.title} description={t.home.work.intro} />
        </Reveal>

        {cards.loading ? (
          // The cards arrive from the backend: a placeholder keeps the section's height, so nothing below it moves.
          <div className={styles.grid} aria-busy="true" style={{ minHeight: '60svh' }} />
        ) : (
          <ul className={styles.grid}>
            {cards.featured.map((project, position) => (
              <li key={project.slug} className={styles.item} data-layout={project.layout}>
                <Reveal className={styles.fill} delay={position % 2 ? 90 : 0}>
                  <ProjectCard
                    className={styles.card}
                    layout={project.layout}
                    index={String(position + 1).padStart(2, '0')}
                    title={project.name}
                    category={project.label}
                    description={project.description}
                    status={project.status}
                    tags={project.tags}
                    image={project.image ?? undefined}
                    media={<ProjectMockup kind={project.mockup} />}
                    mediaLabel={t.home.work.conceptSketch}
                    to={project.detailPath ?? undefined}
                    demoHref={project.demoUrl ?? undefined}
                    demoLabel={t.home.work.demo}
                    detailsLabel={t.home.work.details}
                    note={t.home.work.noDetails}
                  />
                </Reveal>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  )
}
