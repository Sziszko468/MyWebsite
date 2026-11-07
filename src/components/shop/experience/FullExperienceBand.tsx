import { useId } from 'react'
import { useCatalogVersion } from '../../../content/liveCatalog'
import { fullExperience as offer } from '../../../content/shop/fullExperience'
import { useI18n } from '../../../i18n/useI18n'
import { SHOP_PATHS } from '../../../shop/paths'
import { useShopText } from '../../../shop/useShopText'
import { fill, pad } from '../../../utils/format'
import { Button } from '../../Button/Button'
import { Container } from '../../Container/Container'
import { Reveal } from '../../motion/Reveal'
import { Section } from '../../Section/Section'
import { shopTone } from '../rhythm'
import { Headline } from './Headline'
import styles from './FullExperienceBand.module.scss'

/** How many stages the band names before it says "and N more": a glimpse, the page has them all. */
const GLIMPSE = 6

/**
 * The flagship offer on the services page: a dark panel (dark in either theme) that is not a package card. Its headline, its sentence,
 * a glimpse of the stages and two ways in: the page that explains everything, and the configurator. "Custom quote": no price is shown.
 */
export function FullExperienceBand() {
  useCatalogVersion()
  const { lang } = useI18n()
  const { experience } = useShopText()
  const titleId = useId()
  const stages = offer.stages.slice(0, GLIMPSE)

  return (
    <Section id="full-experience" tone={shopTone('full-experience')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <div className={styles.panel} data-theme="dark">
            <div className={styles.lines} aria-hidden="true" />
            <div className={styles.copy}>
              <p className={styles.kicker}>{experience.band.kicker}</p>
              <h2 id={titleId} className={styles.headline}>
                <Headline text={offer.hero.headline[lang]} />
              </h2>
              <p className={styles.text}>{offer.teaser.text[lang]}</p>
              <div className={styles.actions}>
                <Button to={SHOP_PATHS.fullExperienceStart} size="lg" arrow>
                  {offer.hero.primaryCta[lang]}
                </Button>
                <Button to={`${SHOP_PATHS.fullExperience}#included`} size="lg" variant="secondary">
                  {offer.hero.secondaryCta[lang]}
                </Button>
              </div>
              <p className={styles.note}>
                <strong>{offer.priceLabel[lang]}</strong> · {experience.band.note}
              </p>
            </div>
            <div className={styles.stagesWrap}>
              <h3 className={styles.stagesTitle}>{experience.band.stagesLabel}</h3>
              <ol className={styles.stages}>
                {stages.map((stage, position) => (
                  <li key={stage.id}>
                    <span className={styles.number} aria-hidden="true">
                      {pad(position + 1)}
                    </span>
                    {stage.title[lang]}
                  </li>
                ))}
              </ol>
              {offer.stages.length > GLIMPSE && (
                <p className={styles.more}>
                  {fill(experience.band.moreStages, { count: offer.stages.length - GLIMPSE })}
                </p>
              )}
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
