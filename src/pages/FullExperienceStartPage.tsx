import { Container } from '../components/Container/Container'
import { Breadcrumbs } from '../components/shop/Breadcrumbs'
import { FullExperienceConfigurator } from '../components/shop/experience/FullExperienceConfigurator'
import { useCatalogGate } from '../content/liveCatalog'
import { fullExperience as offer } from '../content/shop/fullExperience'
import { useI18n } from '../i18n/useI18n'
import { SHOP_PATHS } from '../shop/paths'
import { useShopText } from '../shop/useShopText'
import styles from './ShopPage.module.scss'

/** The FULL EXPERIENCE configurator's page: a title, the way back, and the card (components/shop/experience/). Not indexed: it is a visitor's own working state. */
export function FullExperienceStartPage() {
  useCatalogGate()
  const { lang, t } = useI18n()
  const { experience } = useShopText()
  const c = experience.start

  return (
    <div className={styles.page}>
      <Container size="narrow">
        <Breadcrumbs items={[{ label: t.nav.services, to: SHOP_PATHS.home }, { label: offer.hero.eyebrow[lang], to: SHOP_PATHS.fullExperience }, { label: c.title }]} />
        <header className={styles.head}>
          <p className={styles.eyebrow}>{offer.hero.eyebrow[lang]}</p>
          <h1 className={styles.title}>{c.title}</h1>
          <p className={styles.intro}>{offer.hero.supporting[lang]}</p>
        </header>
        <FullExperienceConfigurator />
      </Container>
    </div>
  )
}
