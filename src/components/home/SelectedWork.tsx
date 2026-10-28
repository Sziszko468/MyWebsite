import { useId } from 'react'
import { projects } from '../../content/projects'
import { useI18n } from '../../i18n/useI18n'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { ProjectCard } from '../ProjectCard/ProjectCard'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { ProjectMockup } from './ProjectMockup'
import { homeTone } from './rhythm'
import styles from './SelectedWork.module.scss'

/**
 * Four projects in an uneven composition: the lead is large, the second sits lower, the third is
 * a compact card, the fourth is wide. Each card is understandable without hovering: the status,
 * the category, the description and the technologies are always on screen, and the pointer only
 * adds depth to the picture. A project without a real screenshot shows a concept sketch, captioned
 * as one.
 */
export function SelectedWork() {
  const { t } = useI18n()
  const titleId = useId()

  return (
    <Section id="work" tone={homeTone('work')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="02" title={t.home.work.title} description={t.home.work.intro} />
        </Reveal>

        <ul className={styles.grid}>
          {projects.map((project, position) => {
            const copy = t.home.work.items[project.id]
            return (
              <li key={project.id} className={styles.item} data-layout={project.layout}>
                <Reveal className={styles.fill} delay={position % 2 ? 90 : 0}>
                  <ProjectCard
                    className={styles.card}
                    layout={project.layout}
                    index={String(position + 1).padStart(2, '0')}
                    title={project.name}
                    category={copy.category}
                    description={copy.description}
                    status={project.status}
                    tags={project.tags}
                    image={
                      project.image
                        ? { ...project.image, alt: t.home.work.imageAlt.replace('{name}', project.name) }
                        : undefined
                    }
                    media={<ProjectMockup kind={project.mockup} />}
                    mediaLabel={t.home.work.conceptSketch}
                    to={project.detailPath ?? undefined}
                    demoHref={project.demoUrl ?? undefined}
                    demoLabel={t.home.work.demo}
                  />
                </Reveal>
              </li>
            )
          })}
        </ul>
      </Container>
    </Section>
  )
}
