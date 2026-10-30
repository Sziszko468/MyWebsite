import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { usePointerField } from '../motion/usePointerField'
import { HeroLine, PageHero } from '../PageHero/PageHero'
import styles from './AboutHero.module.scss'

/**
 * The About page's first screen: the statement set in type. The first line is solid; the second is
 * drawn in outline and stepped in from the left, and a mouse over it lights a red disc inside the
 * letters (the spotlight is the text's own background, clipped to the glyphs), so the line is
 * complete and readable at rest and the pointer only adds to it. The speed lines behind lean with
 * the pointer too and stay out of the words' way.
 */
export function AboutHero() {
  const { t } = useI18n()
  const copy = t.aboutPage.hero
  const kinetic = usePointerField<HTMLSpanElement>()

  return (
    <PageHero
      compact
      seed={2}
      eyebrow={t.nav.about}
      title={
        <>
          <HeroLine>{copy.titleLine1}</HeroLine>{' '}
          <HeroLine className={styles.step}>
            <span ref={kinetic} className={styles.kinetic}>
              {copy.titleLine2}
            </span>
          </HeroLine>
        </>
      }
      lead={copy.lead}
      actions={
        <>
          <Button to="/#work" size="lg" arrow>
            {copy.ctaPrimary}
          </Button>
          <Button to="/contact" size="lg" variant="secondary">
            {copy.ctaSecondary}
          </Button>
        </>
      }
    />
  )
}
