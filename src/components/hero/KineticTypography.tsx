import { Fragment, type CSSProperties } from 'react'
import { cx } from '../../utils/cx'
import styles from './KineticTypography.module.scss'

interface KineticTypographyProps {
  id: string
  /** The headline, one string per line. */
  lines: readonly string[]
  /** The first line that carries the accent colour; the last line only, by default. */
  accentFrom?: number
  /**
   * Whether the lines lean with the cursor and part on scroll. Off, only the entrance animation
   * runs: the type never moves with the pointer.
   */
  reactive?: boolean
}

/**
 * The headline as moving, layered type. Every word is real text in the DOM, in reading order and
 * separated by real spaces, so copying, finding, translating and screen readers all get the full
 * sentence. The motion is CSS only: words rise out of masks in sequence on load, and the lines
 * drift with the cursor and with scroll through the variables the hero's driver writes
 * (--hero-cx, --hero-cy, --hero-energy, --hero-progress). The outlined echo behind each line is a
 * CSS pseudo-element with empty alternative text: it adds no text to the DOM, is not announced
 * and is not selectable.
 */
export function KineticTypography({ id, lines, accentFrom = lines.length - 1, reactive = true }: KineticTypographyProps) {
  const wordsPerLine = lines.map((line) => line.split(' '))
  const firstWord = wordsPerLine.map((_, index) => wordsPerLine.slice(0, index).reduce((sum, words) => sum + words.length, 0))

  return (
    <h1 id={id} className={styles.title} data-reactive={reactive}>
      {lines.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && ' '}
          <span
            className={cx(styles.line, lineIndex >= accentFrom && styles.accent)}
            style={{ '--depth': lineIndex + 1 } as CSSProperties}
            data-text={line}
          >
            <span className={styles.face}>
              {wordsPerLine[lineIndex].map((word, wordIndex, words) => (
                <Fragment key={wordIndex}>
                  <span className={styles.mask}>
                    <span className={styles.word} style={{ '--i': firstWord[lineIndex] + wordIndex } as CSSProperties}>
                      {word}
                    </span>
                  </span>
                  {wordIndex < words.length - 1 && ' '}
                </Fragment>
              ))}
            </span>
          </span>
        </Fragment>
      ))}
    </h1>
  )
}
