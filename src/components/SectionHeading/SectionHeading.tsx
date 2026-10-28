import { cx } from '../../utils/cx'
import styles from './SectionHeading.module.scss'

interface SectionHeadingProps {
  title: string
  description?: string
  /** Editorial section number, e.g. "01". Decorative. */
  index?: string
  /** Heading level; the visual size is the same, so pick by document outline. */
  level?: 1 | 2 | 3
  /** `large`: the title across the whole width at display size, for a section that opens with a statement. */
  size?: 'default' | 'large'
  id?: string
  className?: string
}

export function SectionHeading({
  title,
  description,
  index,
  level = 2,
  size = 'default',
  id,
  className,
}: SectionHeadingProps) {
  const Heading = `h${level}` as const
  return (
    <header className={cx(styles.root, size === 'large' && styles.large, className)}>
      {index && (
        <span className={styles.index} aria-hidden="true">
          {index}
        </span>
      )}
      <Heading id={id} className={styles.title}>
        {title}
      </Heading>
      {description && <p className={styles.description}>{description}</p>}
    </header>
  )
}
