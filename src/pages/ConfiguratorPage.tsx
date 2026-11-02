import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { isPackageId } from '../content/packages'
import { isPlanId } from '../content/services/ids'
import { Configurator } from '../components/shop/Configurator'
import { Breadcrumbs } from '../components/shop/Breadcrumbs'
import { Container } from '../components/Container/Container'
import { useI18n } from '../i18n/useI18n'
import { inquiryActions } from '../shop/inquiryStore'
import { SHOP_PATHS } from '../shop/paths'
import { useShopText } from '../shop/useShopText'
import styles from './ShopPage.module.scss'

/**
 * The request builder's page. A package named in the address (`?plan=build`, or `?plan=custom` for
 * a project that fits none) is remembered and given to the first service the visitor then picks,
 * if it suits it. The address is read once per arrival and is not written back.
 */
export function ConfiguratorPage() {
  const { t } = useI18n()
  const { configurator: c } = useShopText()
  const { search } = useLocation()

  useEffect(() => {
    const wanted = new URLSearchParams(search).get('plan')
    // A package is remembered only for the visit that arrived with it; opening the builder without one forgets an old choice.
    inquiryActions.setPendingPlan(wanted && isPlanId(wanted) && (wanted === 'custom' || isPackageId(wanted)) ? wanted : null)
  }, [search])

  return (
    <div className={styles.page}>
      <Container size="narrow">
        <Breadcrumbs items={[{ label: t.nav.services, to: SHOP_PATHS.home }, { label: c.eyebrow }]} />
        <header className={styles.head}>
          <p className={styles.eyebrow}>{c.eyebrow}</p>
          <h1 className={styles.title}>{c.title}</h1>
          <p className={styles.intro}>{c.intro}</p>
        </header>
        <Configurator />
      </Container>
    </div>
  )
}
