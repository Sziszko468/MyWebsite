import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { HeroLine, PageHero } from '../PageHero/PageHero'
import styles from './ServicesHero.module.scss'
import { PAGE_INDEX } from './rhythm'

/** The services page's first screen: the headline of the brief, two buttons and a short index of the page. */
export function ServicesHero() {
  const { t } = useI18n()
  const copy = t.servicesPage.hero

  return (
    <PageHero
      eyebrow={t.nav.services}
      title={
        <>
          <HeroLine>{copy.titleLine1}</HeroLine> <HeroLine accent>{copy.titleLine2}</HeroLine>
        </>
      }
      lead={copy.lead}
      actions={
        <>
          <Button href="#areas" size="lg" arrow>
            {copy.ctaPrimary}
          </Button>
          <Button href="#quote" size="lg" variant="secondary">
            {copy.ctaSecondary}
          </Button>
        </>
      }
    >
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
    </PageHero>
  )
}
