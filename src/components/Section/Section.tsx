import type { ReactNode } from 'react'
import { useTheme } from '../../theme/useTheme'
import { cx } from '../../utils/cx'
import styles from './Section.module.scss'
import { resolveTone, type SectionTone } from './tone'

interface SectionProps {
  tone?: SectionTone
  /** Id of the section's heading, for the landmark's accessible name. */
  labelledBy: string
  /** The in-page anchor, e.g. "work" for /hu/#work. */
  id?: string
  /** Cuts the section's top edge on the brand's diagonal, over the section above it. */
  slant?: boolean
  className?: string
  children: ReactNode
}

/**
 * A full-width band of the home page. It carries its own `data-theme`, so every token and
 * component inside it (buttons, badges, cards, focus rings) follows the band, and it flips with
 * the page's theme toggle. Sections that alternate between dark and light are made by alternating
 * `base` and `inverse`.
 */
export function Section({ tone = 'base', labelledBy, id, slant = false, className, children }: SectionProps) {
  const { theme } = useTheme()

  return (
    <section
      id={id}
      className={cx(styles.section, slant && styles.slant, className)}
      data-theme={resolveTone(tone, theme)}
      data-tone={tone}
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
  )
}
