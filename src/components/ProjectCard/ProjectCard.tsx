import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { Badge, type ProjectStatus } from '../Badge/Badge'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { usePointerField } from '../motion/usePointerField'
import styles from './ProjectCard.module.scss'

interface ProjectImage {
  src: string
  alt: string
  /** Intrinsic size, so the layout does not shift while the image loads. */
  width: number
  height: number
}

export type ProjectCardLayout = 'default' | 'lead' | 'offset' | 'compact' | 'wide'

interface ProjectCardProps {
  title: string
  category: string
  status: ProjectStatus
  tags: readonly string[]
  /** A short description under the title. */
  description?: string
  /** A real screenshot. */
  image?: ProjectImage
  /**
   * Illustration shown in place of a screenshot, for a project that has none (a generated concept
   * sketch). It is decorative; `mediaLabel` says in words what it is.
   */
  media?: ReactNode
  /** Caption pinned to the media, e.g. "Concept sketch", so an illustration is never read as a screenshot. */
  mediaLabel?: string
  /** Editorial number, e.g. "01". Decorative. */
  index?: string
  /** Without a destination the card is static; nothing is linked until a real URL exists. */
  href?: string
  /** An internal destination: language-free, gets the current language prefix. Used instead of `href`. */
  to?: string
  /** A live demo, offered as its own link beside the title's. */
  demoHref?: string
  demoLabel?: string
  /** A cue at the foot of a linked card ("Details →"). Decorative: the title is the link. */
  detailsLabel?: string
  /** Said at the foot of a card that links nowhere, e.g. that its details page is not ready. */
  note?: string
  layout?: ProjectCardLayout
  headingLevel?: 2 | 3 | 4
  className?: string
}

export function ProjectCard({
  title,
  category,
  status,
  tags,
  description,
  image,
  media,
  mediaLabel,
  index,
  href,
  to,
  demoHref,
  demoLabel,
  detailsLabel,
  note,
  layout = 'default',
  headingLevel = 3,
  className,
}: ProjectCardProps) {
  const { t } = useI18n()
  const Heading = `h${headingLevel}` as const
  const linked = Boolean(href || to)
  const pointer = usePointerField<HTMLElement>()

  return (
    <article ref={pointer} className={cx(styles.card, styles[layout], linked && styles.linked, className)}>
      <div className={styles.media}>
        <div className={styles.stage}>
          {image ? (
            <img
              className={styles.image}
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              loading="lazy"
              decoding="async"
            />
          ) : media ? (
            <div className={styles.sketch} aria-hidden="true">
              {media}
            </div>
          ) : (
            <div className={styles.placeholder} aria-hidden="true" />
          )}
        </div>
        {mediaLabel && !image && <span className={styles.mediaLabel}>{mediaLabel}</span>}
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          {index && (
            <span className={styles.index} aria-hidden="true">
              {index}
            </span>
          )}
          <Badge>{category}</Badge>
          <Badge status={status} />
        </div>

        <Heading className={styles.title}>
          {to ? (
            <LocalizedLink className={styles.link} to={to}>
              {title}
            </LocalizedLink>
          ) : href ? (
            <a className={styles.link} href={href}>
              {title}
            </a>
          ) : (
            title
          )}
        </Heading>

        {description && <p className={styles.description}>{description}</p>}

        {tags.length > 0 && (
          <ul className={styles.tags} aria-label={t.projects.technologies}>
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}

        {linked && detailsLabel && (
          <span className={styles.details} aria-hidden="true">
            {detailsLabel} →
          </span>
        )}

        {!linked && note && <p className={styles.note}>{note}</p>}

        {demoHref && (
          <a className={styles.demo} href={demoHref} target="_blank" rel="noopener noreferrer">
            {demoLabel}
            <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
          </a>
        )}
      </div>
    </article>
  )
}
