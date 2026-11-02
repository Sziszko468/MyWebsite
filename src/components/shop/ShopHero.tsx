import { useId, type CSSProperties } from 'react'
import { serviceAreas } from '../../content/services/areas'
import { useI18n } from '../../i18n/useI18n'
import { servicePath } from '../../shop/paths'
import { useShopText } from '../../shop/useShopText'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { BuildArt } from '../home/BuildArt'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { SpeedLines } from '../motion/SpeedLines'
import { ScrollLinked } from '../motion/ScrollLinked'
import { usePointerField } from '../motion/usePointerField'
import { HeroLine } from '../PageHero/PageHero'
import { SERVICE_ART } from './ServiceArt'
import styles from './ShopHero.module.scss'

/**
 * The shop's first screen: the headline of the brief set at display size (the words rise line by
 * line in a fraction of a second, and are in the page from the first paint), a sentence, the two
 * buttons, and a composition of the four services as product tiles that are also the way into
 * each one. The tiles lean a little towards a mouse and sit still for a finger or when the visitor
 * asked for less motion. Nothing is loaded for it: the drawings are the same small SVGs the home
 * page uses.
 */
export function ShopHero() {
  const { lang, t } = useI18n()
  const { landing } = useShopText()
  const hero = landing.hero
  const titleId = useId()
  const ref = usePointerField<HTMLElement>()

  return (
    <section ref={ref} className={styles.hero} aria-labelledby={titleId}>
      <div className={styles.glow} aria-hidden="true" />
      <SpeedLines className={styles.lines} seed={3} />

      <Container size="wide" className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{t.nav.services}</p>
          <h1 id={titleId} className={styles.title}>
            <HeroLine>{hero.titleLine1}</HeroLine> <HeroLine accent>{hero.titleLine2}</HeroLine>
          </h1>
          <p className={styles.lead}>{hero.lead}</p>
          <div className={styles.actions}>
            <Button href="#services" size="lg" arrow magnetic>
              {hero.ctaPrimary}
            </Button>
            <Button to="/contact" size="lg" variant="secondary">
              {hero.ctaSecondary}
            </Button>
          </div>
          <p className={styles.note}>{hero.note}</p>
        </div>

        <ScrollLinked as="nav" range="-36px" className={styles.stack} aria-label={hero.glance}>
          <ul className={styles.tiles} aria-label={hero.compositionLabel}>
            {serviceAreas.map((area, position) => (
              <li key={area.id} className={styles.tile} style={{ '--depth': 6 + position * 4 } as CSSProperties} data-position={position}>
                <LocalizedLink to={servicePath(area.id)} className={styles.tileLink}>
                  <span className={styles.art} aria-hidden="true">
                    <BuildArt kind={SERVICE_ART[area.id]} />
                  </span>
                  <span className={styles.tileName}>{area.name[lang]}</span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </ScrollLinked>
      </Container>
    </section>
  )
}
