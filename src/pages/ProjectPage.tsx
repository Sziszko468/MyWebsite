import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { track } from '../analytics/tracker'
import { ArchitectureDiagram } from '../components/project/ArchitectureDiagram'
import { FeatureList } from '../components/project/FeatureList'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { pad, fill } from '../utils/format'
import { Gallery, Lightbox } from '../components/project/Gallery'
import { ProjectHero, type HeroEntry } from '../components/project/ProjectHero'
import { ProjectNav } from '../components/project/ProjectNav'
import { Approach, ArchitectureText, Band, Challenges, Decisions, Lessons, Overview, Results } from '../components/project/ProjectSections'
import type { SectionTone } from '../components/Section/tone'
import { useI18n } from '../i18n/useI18n'
import { useProjectDetail } from '../projects/store'
import { viewOf, type ProjectRecord } from '../projects/types'
import { NotFoundPage } from './NotFoundPage'
import styles from './ProjectPage.module.scss'

interface BandSpec {
  id: string
  title: string
  large?: boolean
  body: ReactNode
}

/** The addresses the owner marked as checked, as buttons. Only on a project managed in the administration. */
function ExternalLinks({ record }: { record: ProjectRecord }) {
  const { lang, t } = useI18n()
  const links = record.detail.links
  if (!links) return null
  const entries: Array<{ href: string; label: string; primary?: boolean }> = []
  if (links.demo) entries.push({ href: links.demo, label: t.project.demoLink, primary: true })
  if (links.source) entries.push({ href: links.source, label: t.project.sourceLink })
  if (links.extra) entries.push({ href: links.extra.url, label: links.extra.label[lang] || links.extra.label.hu || links.extra.url })
  if (links.video) entries.push({ href: links.video, label: t.project.videoLink })
  return (
    <div className={styles.links}>
      {entries.map((entry) => (
        <Button key={entry.href} href={entry.href} target="_blank" rel="noopener noreferrer" variant={entry.primary ? 'primary' : 'secondary'} arrow>
          {entry.label}
          <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
        </Button>
      ))}
    </div>
  )
}

/**
 * A project's page: one component for every project, fed by a `ProjectRecord` (the backend's published project, or the website's
 * own content when no backend answers). The hero and the accent are the project's own; the bands below it are the same ten in the
 * same order, and a band with nothing behind it is left out, so a page only ever says what the project's owner (or its
 * documentation and code) supports. An administrator hides a band by hiding its section: the server then sends it empty. The bands
 * alternate between the page's theme and its opposite.
 */
export function ProjectPage({ record }: { record: ProjectRecord }) {
  const { lang, t } = useI18n()
  const { card, detail } = record
  const [activeImage, setActiveImage] = useState<string | null>(null)
  useEffect(() => {
    if (!record.preview) track('project_opened', { project: card.slug })
  }, [card.slug, record.preview])

  const view = viewOf(card, lang)
  const heroImage = detail.gallery.find((image) => image.hero) ?? detail.gallery[0]
  const sections = t.project.sections
  const hasText = (text: { hu: string; en: string; nl: string } | undefined | null) => Boolean(text && (text[lang] || text.hu))
  const hasOverview = [detail.overview.what, detail.overview.audience, detail.overview.problem, detail.overview.goal].some(hasText) || detail.stack.length > 0 || hasText(detail.role)
  const hasLinks = Boolean(detail.links && (detail.links.demo || detail.links.source || detail.links.extra || detail.links.video))
  const entry: HeroEntry = { name: view.name, label: view.label, status: card.status, tags: card.tags, demoUrl: card.demoUrl, mockup: card.mockup }

  const candidates: Array<BandSpec | false | null> = [
    hasOverview && { id: 'overview', title: sections.overview, body: <Overview detail={detail} /> },
    detail.challenges.length > 0 && { id: 'challenge', title: sections.challenge, large: true, body: <Challenges detail={detail} /> },
    detail.approach.length > 0 && { id: 'approach', title: sections.approach, body: <Approach detail={detail} /> },
    detail.architecture
      ? { id: 'architecture', title: sections.architecture, body: <ArchitectureDiagram architecture={detail.architecture} /> }
      : hasText(detail.architectureText) && { id: 'architecture', title: sections.architecture, body: <ArchitectureText detail={detail} /> },
    detail.features.length > 0 && { id: 'features', title: sections.features, body: <FeatureList detail={detail} onOpenImage={setActiveImage} /> },
    detail.decisions.length > 0 && { id: 'decisions', title: sections.decisions, body: <Decisions detail={detail} /> },
    (detail.results?.length ?? 0) > 0 && { id: 'results', title: sections.results, body: <Results detail={detail} /> },
    (detail.learned.length > 0 || detail.next.length > 0) && { id: 'lessons', title: sections.learned, body: <Lessons detail={detail} /> },
    detail.gallery.length > 0 && {
      id: 'gallery',
      title: sections.gallery,
      body: <Gallery images={detail.gallery} note={detail.galleryNote ? detail.galleryNote[lang] || detail.galleryNote.hu : null} onOpenImage={setActiveImage} />,
    },
    hasLinks && { id: 'links', title: sections.links, body: <ExternalLinks record={record} /> },
  ]
  const bands = candidates.filter((band): band is BandSpec => Boolean(band))

  const toneOf = (position: number): SectionTone => (position % 2 === 0 ? 'inverse' : 'base')

  return (
    <div className={styles.page} data-accent={detail.accent} data-project={card.slug}>
      {record.preview && (
        <div className={styles.preview} role="status">
          <Container size="wide">{fill(t.project.preview.banner, { state: t.project.preview.states[record.state ?? 'draft'] })}</Container>
        </div>
      )}
      <ProjectHero entry={entry} detail={detail} image={heroImage} onOpenImage={setActiveImage} />

      {bands.map((band, position) => (
        <Band key={band.id} id={band.id} tone={toneOf(position)} index={pad(position + 1)} title={band.title} large={band.large}>
          {band.body}
        </Band>
      ))}

      <ProjectNav name={view.name} neighbours={record.neighbours} tone={toneOf(bands.length)} />

      <Lightbox images={detail.gallery} activeId={activeImage} onChange={setActiveImage} />
    </div>
  )
}

/**
 * The route `/work/:slug` (and `/work/preview/:id`, an administrator's preview of a project in any state): it asks the store for the
 * project, keeps a screen's height while it waits (so the footer does not jump), says "not found" for a project that is not
 * published, and draws the page when the data is there.
 */
export function ProjectRoute({ preview = false }: { preview?: boolean }) {
  const params = useParams()
  const { t } = useI18n()
  const state = useProjectDetail(preview ? '' : (params.slug ?? ''), preview ? (params.id ?? null) : null)

  if (state.status === 'loading') return <div style={{ minHeight: '100svh' }} aria-hidden="true" />
  if (state.status === 'missing') return <NotFoundPage />
  if (state.status === 'unauthorized') {
    return (
      <Container size="wide">
        <p role="status" className={styles.signIn}>
          {t.project.preview.signIn} <a href="/admin">/admin</a>
        </p>
      </Container>
    )
  }
  return <ProjectPage record={state.record} />
}
