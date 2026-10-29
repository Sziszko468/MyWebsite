import { useState, type ReactNode } from 'react'
import { getProjectDetail } from '../content/projectDetails'
import { projects, type ProjectId } from '../content/projects'
import { ArchitectureDiagram } from '../components/project/ArchitectureDiagram'
import { FeatureList } from '../components/project/FeatureList'
import { pad } from '../components/project/format'
import { Gallery, Lightbox } from '../components/project/Gallery'
import { ProjectHero } from '../components/project/ProjectHero'
import { ProjectNav } from '../components/project/ProjectNav'
import { Approach, Band, Challenges, Decisions, Lessons, Overview } from '../components/project/ProjectSections'
import type { SectionTone } from '../components/Section/tone'
import { useI18n } from '../i18n/useI18n'
import { NotFoundPage } from './NotFoundPage'
import styles from './ProjectPage.module.scss'

interface BandSpec {
  id: string
  title: string
  large?: boolean
  body: ReactNode
}

/**
 * A project's page: one component for every project, fed by content/projectDetails. The hero and
 * the accent are the project's own; the bands below it are the same eight in the same order,
 * and a band with nothing behind it is left out, so a page only ever says what the project's
 * documentation or code supports. The bands alternate between the page's theme and its opposite.
 */
export function ProjectPage({ projectId }: { projectId: ProjectId }) {
  const { lang, t } = useI18n()
  const entry = projects.find((project) => project.id === projectId)
  const detail = getProjectDetail(projectId)
  const [activeImage, setActiveImage] = useState<string | null>(null)

  if (!entry || !detail) return <NotFoundPage />

  const heroImage = detail.gallery.find((image) => image.hero)
  const sections = t.project.sections

  const candidates: Array<BandSpec | false | null> = [
    { id: 'overview', title: sections.overview, body: <Overview detail={detail} /> },
    detail.challenges.length > 0 && {
      id: 'challenge',
      title: sections.challenge,
      large: true,
      body: <Challenges detail={detail} />,
    },
    detail.approach.length > 0 && { id: 'approach', title: sections.approach, body: <Approach detail={detail} /> },
    detail.architecture && {
      id: 'architecture',
      title: sections.architecture,
      body: <ArchitectureDiagram architecture={detail.architecture} />,
    },
    detail.features.length > 0 && {
      id: 'features',
      title: sections.features,
      body: <FeatureList detail={detail} onOpenImage={setActiveImage} />,
    },
    detail.decisions.length > 0 && { id: 'decisions', title: sections.decisions, body: <Decisions detail={detail} /> },
    (detail.learned.length > 0 || detail.next.length > 0) && {
      id: 'lessons',
      title: sections.learned,
      body: <Lessons detail={detail} />,
    },
    detail.gallery.length > 0 && {
      id: 'gallery',
      title: sections.gallery,
      body: (
        <Gallery
          images={detail.gallery}
          note={detail.galleryNote ? detail.galleryNote[lang] : null}
          onOpenImage={setActiveImage}
        />
      ),
    },
  ]
  const bands = candidates.filter((band): band is BandSpec => Boolean(band))

  const toneOf = (position: number): SectionTone => (position % 2 === 0 ? 'inverse' : 'base')

  return (
    <div className={styles.page} data-accent={detail.accent} data-project={entry.id}>
      <ProjectHero entry={entry} detail={detail} image={heroImage} onOpenImage={setActiveImage} />

      {bands.map((band, position) => (
        <Band key={band.id} id={band.id} tone={toneOf(position)} index={pad(position + 1)} title={band.title} large={band.large}>
          {band.body}
        </Band>
      ))}

      <ProjectNav id={entry.id} tone={toneOf(bands.length)} />

      <Lightbox images={detail.gallery} activeId={activeImage} onChange={setActiveImage} />
    </div>
  )
}
