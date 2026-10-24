import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { Badge, type ProjectStatus } from '../Badge/Badge'
import styles from './ProjectCard.module.scss'

interface ProjectImage {
  src: string
  alt: string
  /** Intrinsic size, so the layout does not shift while the image loads. */
  width: number
  height: number
}

interface ProjectCardProps {
  title: string
  category: string
  status: ProjectStatus
  tags: readonly string[]
  /** Without an image the card shows a neutral generated placeholder. */
  image?: ProjectImage
  /** Without a destination the card is static; nothing is linked until a real URL exists. */
  href?: string
  headingLevel?: 2 | 3 | 4
  className?: string
}

export function ProjectCard({
  title,
  category,
  status,
  tags,
  image,
  href,
  headingLevel = 3,
  className,
}: ProjectCardProps) {
  const { t } = useI18n()
  const Heading = `h${headingLevel}` as const

  return (
    <article className={cx(styles.card, href && styles.linked, className)}>
      <div className={styles.media}>
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
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          <Badge>{category}</Badge>
          <Badge status={status} />
        </div>

        <Heading className={styles.title}>
          {href ? (
            <a className={styles.link} href={href}>
              {title}
            </a>
          ) : (
            title
          )}
        </Heading>

        {tags.length > 0 && (
          <ul className={styles.tags} aria-label={t.projects.technologies}>
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
