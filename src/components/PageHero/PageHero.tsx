import { useId, type ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { Container } from '../Container/Container'
import { KineticText } from '../motion/KineticText'
import { SpeedLines } from '../motion/SpeedLines'
import { usePointerField } from '../motion/usePointerField'
import styles from './PageHero.module.scss'

/**
 * One line of the headline, on a line of its own; `accent` sets it in the brand red. A line given as
 * text moves in word by word (kinetic type, motion/kinetic.ts: real text, nothing shifts, reduced
 * motion shows it at once); anything else is drawn as it is.
 */
export function HeroLine({ accent = false, className, children }: { accent?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cx(styles.line, accent && styles.accent, className)}>
      {typeof children === 'string' ? <KineticText text={children} variant="mask" trigger="mount" /> : children}
    </span>
  )
}

interface PageHeroProps {
  /** The small label above the headline, e.g. the page's name. */
  eyebrow: string
  /** The headline's content: one or more HeroLine, or text. */
  title: ReactNode
  lead?: string
  /** Buttons under the sentence. */
  actions?: ReactNode
  /** Shifts the pattern of the speed lines, so two pages do not draw the same one. */
  seed?: number
  /** A smaller headline, for a page whose first screen also has to show buttons or doors. */
  compact?: boolean
  /** What sits under the words: an index of the page, the contact doors. */
  children?: ReactNode
}

/**
 * The shell of a page's first screen: the eyebrow, the headline, a sentence and buttons over a
 * faint light field (speed lines and a glow that lean towards a mouse and sit still otherwise). It
 * runs under the sticky header, like the home page's hero. The words keep their contrast: the
 * field fades away from them.
 */
export function PageHero({ eyebrow, title, lead, actions, seed = 0, compact = false, children }: PageHeroProps) {
  const titleId = useId()
  const ref = usePointerField<HTMLElement>()

  return (
    <section ref={ref} className={styles.hero} aria-labelledby={titleId}>
      <div className={styles.glow} aria-hidden="true" />
      <SpeedLines className={cx(styles.lines, compact && styles.compactLines)} seed={seed} />

      <Container size="wide" className={styles.inner}>
        <div className={cx(styles.copy, compact && styles.compactCopy)}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 id={titleId} className={cx(styles.title, compact && styles.compactTitle)}>
            {title}
          </h1>
          {lead && <p className={styles.lead}>{lead}</p>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
        {children}
      </Container>
    </section>
  )
}
