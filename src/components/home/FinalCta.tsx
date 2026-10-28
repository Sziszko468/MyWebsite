import { useId } from 'react'
import { siteConfig } from '../../config/site'
import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import styles from './FinalCta.module.scss'
import { homeTone } from './rhythm'

/** Lines that fan in from the top right towards the button's corner, as the hero's lines do, but closing in instead of flowing past. */
const LINES = Array.from({ length: 19 }, (_, i) => {
  const t = i / 18
  return {
    x: 1240,
    y: -80 + t * 760,
    width: 1 + (i % 4 === 0 ? 2 : i % 2),
    opacity: 0.2 + ((i * 7) % 5) * 0.12,
    paper: i % 5 === 2,
  }
})

/**
 * The closing statement: one headline, one sentence, one button, on Racing Red. Text and the button
 * are black and paper on red (the contrast is tested). The lines behind lean a little with the
 * pointer and stay still otherwise. The button goes to the contact page; the e-mail address
 * appears only once it is set in config/site.ts.
 */
export function FinalCta() {
  const { t } = useI18n()
  const titleId = useId()
  const ref = usePointerField<HTMLDivElement>()
  const { email } = siteConfig.contact
  const copy = t.home.final

  return (
    <Section id="start" tone={homeTone('start')} slant labelledBy={titleId} className={styles.final}>
      <div ref={ref} className={styles.stage}>
        <svg className={styles.lines} viewBox="0 0 1200 600" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
          <g className={styles.fan}>
            {LINES.map((line, i) => (
              <line
                key={i}
                x1={line.x}
                y1={line.y}
                x2="470"
                y2="520"
                strokeWidth={line.width}
                opacity={line.opacity}
                stroke={line.paper ? 'var(--brand-paper)' : 'var(--brand-black)'}
                strokeLinecap="round"
              />
            ))}
          </g>
        </svg>

        <Container size="wide" className={styles.content}>
          <Reveal>
            <h2 id={titleId} className={styles.title}>
              {copy.title}
            </h2>
          </Reveal>
          <Reveal className={styles.row} delay={120}>
            <p className={styles.text}>{copy.text}</p>
            <div className={styles.actions}>
              <Button to="/contact" size="lg" arrow>
                {copy.cta}
              </Button>
              {email && (
                <p className={styles.mail}>
                  {copy.emailLead} <a href={`mailto:${email}`}>{email}</a>
                </p>
              )}
            </div>
          </Reveal>
        </Container>
      </div>
    </Section>
  )
}
