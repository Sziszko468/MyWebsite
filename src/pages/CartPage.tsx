import { useCatalogGate } from '../content/liveCatalog'
import { Container } from '../components/Container/Container'
import { Breadcrumbs } from '../components/shop/Breadcrumbs'
import { CartView } from '../components/shop/CartView'
import { useI18n } from '../i18n/useI18n'
import { SHOP_PATHS } from '../shop/paths'
import { useShopText } from '../shop/useShopText'
import styles from './ShopPage.module.scss'

/** The cart's page: the selection, edited in place, and the way on to the request. No payment takes place on it. */
export function CartPage() {
  useCatalogGate()
  const { t } = useI18n()
  const { cart: c } = useShopText()

  return (
    <div className={styles.page}>
      <Container size="wide">
        <Breadcrumbs items={[{ label: t.nav.services, to: SHOP_PATHS.home }, { label: c.eyebrow }]} />
        <header className={styles.head}>
          <p className={styles.eyebrow}>{c.eyebrow}</p>
          <h1 className={styles.title}>{c.title}</h1>
          <p className={styles.intro}>{c.intro}</p>
        </header>
        <CartView />
      </Container>
    </div>
  )
}
