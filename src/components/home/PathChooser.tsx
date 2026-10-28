import { useId } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import styles from './PathChooser.module.scss'
import { homeTone } from './rhythm'

/**
 * Two doors, built differently on purpose. The career door is paper, narrow and measured: a
 * blueprint grid and a crosshair come up under the pointer. The client door is carbon, wide and
 * fast: a red streak leans after the pointer. Each is dark or light whatever the page is, so the
 * two always contrast with each other and with the page. Both are whole-panel links; the button
 * inside is the real, focusable link and the larger hit area is a hidden twin of it.
 */
export function PathChooser() {
  const { t } = useI18n()
  const sectionTitle = useId()
  const careerTitle = useId()
  const clientsTitle = useId()
  const career = usePointerField<HTMLElement>()
  const clients = usePointerField<HTMLElement>()
  const copy = t.home.path

  return (
    <Section id="path" tone={homeTone('path')} labelledBy={sectionTitle}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={sectionTitle} index="01" title={copy.title} />
        </Reveal>

        <div className={styles.paths}>
          <Reveal className={styles.careerSlot}>
            <article ref={career} className={styles.career} data-theme="light" aria-labelledby={careerTitle}>
              <a className={styles.overlay} href="#work" aria-hidden="true" tabIndex={-1} />
              <span className={styles.grid} aria-hidden="true" />
              <span className={styles.crossH} aria-hidden="true" />
              <span className={styles.crossV} aria-hidden="true" />
              <span className={styles.ghostA} aria-hidden="true">
                A
              </span>

              <p className={styles.careerLabel}>
                <span aria-hidden="true">A</span>
                {copy.career.label}
              </p>
              <h3 id={careerTitle} className={styles.careerTitle}>
                {copy.career.title}
              </h3>
              <p className={styles.careerText}>{copy.career.text}</p>
              <Button href="#work" variant="secondary" arrow className={styles.cta}>
                {copy.career.cta}
              </Button>
            </article>
          </Reveal>

          <Reveal className={styles.clientsSlot} delay={120}>
            <article ref={clients} className={styles.clients} data-theme="dark" aria-labelledby={clientsTitle}>
              <LocalizedLink className={styles.overlay} to="/contact" aria-hidden="true" tabIndex={-1} />
              <span className={styles.streaks} aria-hidden="true" />
              <span className={styles.beam} aria-hidden="true" />
              <span className={styles.ghostB} aria-hidden="true">
                B
              </span>

              <p className={styles.clientsLabel}>
                <span aria-hidden="true">B</span>
                {copy.clients.label}
              </p>
              <h3 id={clientsTitle} className={styles.clientsTitle}>
                {copy.clients.title}
              </h3>
              <p className={styles.clientsText}>{copy.clients.text}</p>
              <Button to="/contact" variant="primary" size="lg" arrow className={styles.cta}>
                {copy.clients.cta}
              </Button>
            </article>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
