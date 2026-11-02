import { useId } from 'react'
import type { ProjectEntry } from '../../content/projects'
import type { GalleryImage, HeroVariant, ProjectDetail } from '../../content/projectDetails/types'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { Badge } from '../Badge/Badge'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { ProjectMockup } from '../home/ProjectMockup'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { KineticText } from '../motion/KineticText'
import { ScrollLinked } from '../motion/ScrollLinked'
import { usePointerField } from '../motion/usePointerField'
import { fill } from '../../utils/format'
import styles from './ProjectHero.module.scss'

/*
 * Each hero has its own backdrop, drawn from what the project is about: rising bars for the
 * finance app, a month grid for the booking app, a route with stops for the logistics system.
 * They are decoration only, hidden from assistive technology, and still when motion is reduced.
 */

const BARS = [28, 46, 34, 62, 42, 80, 54, 96, 68, 112]

function FinanceArt() {
  return (
    <svg className={styles.artFinance} viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {BARS.map((height, index) => (
        <rect key={index} x={10 + index * 38} y={200 - height * 1.6} width="22" height={height * 1.6} rx="3" />
      ))}
    </svg>
  )
}

function BookingArt() {
  const picked = new Set([9, 16, 23])
  return (
    <svg className={styles.artBooking} viewBox="0 0 280 200" preserveAspectRatio="xMaxYMin slice" aria-hidden="true" focusable="false">
      {Array.from({ length: 35 }, (_, index) => (
        <rect
          key={index}
          className={picked.has(index) ? styles.picked : undefined}
          x={8 + (index % 7) * 38}
          y={8 + Math.floor(index / 7) * 38}
          width="30"
          height="30"
          rx="7"
        />
      ))}
    </svg>
  )
}

function RouteArt() {
  const stops: Array<[number, number]> = [
    [60, 410],
    [260, 330],
    [470, 360],
    [690, 220],
    [930, 250],
    [1130, 110],
  ]
  return (
    <svg className={styles.artRoute} viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {[1, 2, 3, 4, 5, 6, 7].map((line) => (
        <line key={`v${line}`} x1={line * 150} y1="0" x2={line * 150} y2="520" />
      ))}
      {[1, 2, 3].map((line) => (
        <line key={`h${line}`} x1="0" y1={line * 130} x2="1200" y2={line * 130} />
      ))}
      <polyline className={styles.routeLine} points={stops.map((stop) => stop.join(',')).join(' ')} />
      {stops.map(([x, y], index) => (
        <circle key={index} className={index === stops.length - 1 ? styles.stopEnd : styles.stop} cx={x} cy={y} r="9" />
      ))}
    </svg>
  )
}

function HeroArt({ variant }: { variant: HeroVariant }) {
  if (variant === 'split') return <FinanceArt />
  if (variant === 'stack') return <BookingArt />
  return <RouteArt />
}

interface ProjectHeroProps {
  entry: ProjectEntry
  detail: ProjectDetail
  /** The gallery image shown large, if the project has one. */
  image: GalleryImage | undefined
  onOpenImage: (id: string) => void
}

/**
 * The top of a project page: the name at display size, what it is in a sentence, its status and
 * technologies, and one large picture: a real screenshot when there is one, otherwise a sketch
 * captioned as one. The picture tilts a little towards a mouse; a touch screen sees it at rest.
 */
export function ProjectHero({ entry, detail, image, onOpenImage }: ProjectHeroProps) {
  const { lang, t } = useI18n()
  const titleId = useId()
  const rootRef = usePointerField<HTMLElement>()
  const category = t.home.work.items[entry.id].category

  return (
    <section ref={rootRef} className={cx(styles.hero, styles[detail.hero])} aria-labelledby={titleId} data-hero={detail.hero}>
      {/* The backdrop drifts a little against the scroll: depth, nothing that carries information. */}
      <ScrollLinked range="-28px" className={styles.artLayer}>
        <HeroArt variant={detail.hero} />
      </ScrollLinked>

      <Container size="wide" className={styles.inner}>
        <div className={styles.copy}>
          <LocalizedLink to="/#work" className={styles.back}>
            <span aria-hidden="true">←</span> {t.project.backToPortfolio}
          </LocalizedLink>

          <div className={styles.meta}>
            <Badge>{category}</Badge>
            <Badge status={entry.status} />
          </div>

          <h1 id={titleId} className={styles.title}>
            <KineticText text={entry.name} variant="chars" trigger="mount" />
          </h1>
          {detail.repoName && <p className={styles.repoName}>{fill(t.project.repoName, { name: detail.repoName })}</p>}

          <p className={styles.lead}>{detail.summary[lang]}</p>

          {entry.tags.length > 0 && (
            <ul className={styles.tags} aria-label={t.project.stackLabel}>
              {entry.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}

          {(entry.demoUrl || detail.sourceUrl) && (
            <div className={styles.actions}>
              {entry.demoUrl && (
                <Button href={entry.demoUrl} target="_blank" rel="noopener noreferrer" arrow>
                  {t.project.demoLink}
                  <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
                </Button>
              )}
              {detail.sourceUrl && (
                <Button href={detail.sourceUrl} target="_blank" rel="noopener noreferrer" variant="secondary">
                  {t.project.sourceLink}
                  <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
                </Button>
              )}
            </div>
          )}
        </div>

        <figure className={styles.visual}>
          <div className={styles.frame}>
            {image ? (
              <button
                type="button"
                className={styles.shot}
                onClick={() => onOpenImage(image.id)}
                aria-label={`${image.caption[lang]}: ${fill(t.project.gallery.open, { title: image.caption[lang] })}`}
              >
                <img
                  src={image.src}
                  width={image.width}
                  height={image.height}
                  alt={image.alt[lang]}
                  decoding="async"
                  fetchPriority="high"
                />
              </button>
            ) : (
              <div className={styles.sketch}>
                <ProjectMockup kind={entry.mockup} />
              </div>
            )}
          </div>
          <figcaption className={styles.caption}>
            {image ? image.caption[lang] : t.home.work.conceptSketch}
          </figcaption>
        </figure>
      </Container>
    </section>
  )
}
