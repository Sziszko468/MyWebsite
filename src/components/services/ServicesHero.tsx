import { useId } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { usePointerField } from '../motion/usePointerField'
import styles from './ServicesHero.module.scss'
import { PAGE_INDEX } from './rhythm'

/**
 * Speed lines in three depths, a quiet echo of the home page's Velocity Field: slanted strokes
 * that run up to the right, most of them faint, a few in Racing Red and Cobalt. They are made
 * once from a formula (no randomness, so a render never differs from the last), sit on the right
 * of the hero and fade out towards the words, and lean a little towards a mouse. A touch screen
 * and a visitor who asked for less motion see them still.
 */
const LINES = Array.from({ length: 30 }, (_, i) => {
  const length = 90 + ((i * 53) % 230)
  return {
    x: 380 + ((i * 131) % 760),
    y: 70 + ((i * 97) % 540),
    length,
    depth: i % 3,
    tone: i % 9 === 0 ? 'red' : i % 13 === 0 ? 'blue' : 'ink',
    width: i % 5 === 0 ? 3 : i % 2 === 0 ? 2 : 1,
  } as const
})

export function ServicesHero() {
  const { t } = useI18n()
  const titleId = useId()
  const ref = usePointerField<HTMLElement>()
  const copy = t.servicesPage.hero

  return (
    <section ref={ref} className={styles.hero} aria-labelledby={titleId}>
      <div className={styles.glow} aria-hidden="true" />
      <svg className={styles.lines} viewBox="0 0 1200 700" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
        {[0, 1, 2].map((depth) => (
          <g key={depth} className={styles[`depth${depth}`]}>
            {LINES.filter((line) => line.depth === depth).map((line, i) => (
              <line
                key={i}
                className={styles[line.tone]}
                x1={line.x}
                y1={line.y}
                x2={line.x + line.length}
                y2={line.y - line.length * 0.38}
                strokeWidth={line.width}
                strokeLinecap="round"
              />
            ))}
          </g>
        ))}
      </svg>

      <Container size="wide" className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{t.nav.services}</p>

          <h1 id={titleId} className={styles.title}>
            <span className={styles.line}>{copy.titleLine1}</span> <span className={`${styles.line} ${styles.accent}`}>{copy.titleLine2}</span>
          </h1>

          <p className={styles.lead}>{copy.lead}</p>

          <div className={styles.actions}>
            <Button href="#areas" size="lg" arrow>
              {copy.ctaPrimary}
            </Button>
            <Button href="#quote" size="lg" variant="secondary">
              {copy.ctaSecondary}
            </Button>
          </div>
        </div>

        <nav className={styles.index} aria-label={copy.indexLabel}>
          <ol>
            {PAGE_INDEX.map((id, position) => (
              <li key={id}>
                <a href={`#${id}`}>
                  <span className={styles.indexNumber} aria-hidden="true">
                    {String(position + 1).padStart(2, '0')}
                  </span>
                  {copy.index[id]}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </Container>
    </section>
  )
}
