import { useId } from 'react'
import { siteConfig } from '../../config/site'
import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import type { SectionTone } from '../Section/tone'
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

interface FinalCtaProps {
  /** The words; the home page's by default. `emailLead` adds the e-mail line once an address is set. */
  copy?: { title: string; text: string; cta: string; emailLead?: string }
  /** Where the button goes: a page of the site (`to`) or a place on the page it is on (`href`). */
  action?: { to: string } | { href: string }
  /** The band's anchor; "start" on the home page. */
  id?: string
  tone?: SectionTone
}

/**
 * The closing statement: one headline, one sentence, one button, on Racing Red. Text and the button
 * are black and paper on red (the contrast is tested). The lines behind lean a little with the
 * pointer and stay still otherwise. On the home page the button goes to the contact page; the
 * shop's pages point it at the request builder. The e-mail address appears only once it is
 * set in config/site.ts.
 */
export function FinalCta({ copy: given, action = { to: '/contact' }, id = 'start', tone = homeTone('start') }: FinalCtaProps = {}) {
  const { t } = useI18n()
  const titleId = useId()
  const ref = usePointerField<HTMLDivElement>()
  const { email } = siteConfig.contact
  const copy = given ?? t.home.final

  return (
    <Section id={id} tone={tone} slant labelledBy={titleId} className={styles.final}>
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
              {'href' in action ? (
                <Button href={action.href} size="lg" arrow>
                  {copy.cta}
                </Button>
              ) : (
                <Button to={action.to} size="lg" arrow>
                  {copy.cta}
                </Button>
              )}
              {email && copy.emailLead && (
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
