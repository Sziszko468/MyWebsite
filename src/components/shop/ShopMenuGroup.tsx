import type { MouseEventHandler } from 'react'
import { serviceAreas } from '../../content/services/areas'
import { useI18n } from '../../i18n/useI18n'
import { useCart, useCommonText } from '../../shop/hooks'
import { SHOP_PATHS, servicePath } from '../../shop/paths'
import { fill } from '../../utils/format'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { CartIcon, SearchIcon } from './icons'
import styles from './ShopMenuGroup.module.scss'

/**
 * The shop inside the mobile menu: the four service categories, the packages, the request builder,
 * search and the cart, each one tap away and each a large target. The menu closes when one is used.
 */
export function ShopMenuGroup({ onNavigate }: { onNavigate: MouseEventHandler<HTMLAnchorElement> }) {
  const { lang } = useI18n()
  const common = useCommonText()
  const count = useCart().lines.length

  return (
    <nav aria-labelledby="shop-menu-heading" className={styles.group}>
      <h2 id="shop-menu-heading" className={styles.heading}>
        {common.nav.menuHeading}
      </h2>
      <ul className={styles.list} aria-label={common.nav.categories}>
        {serviceAreas.map((area) => (
          <li key={area.id}>
            <LocalizedLink to={servicePath(area.id)} className={styles.link} onClick={onNavigate}>
              {area.name[lang]}
            </LocalizedLink>
          </li>
        ))}
      </ul>
      <ul className={styles.tools}>
        <li>
          <LocalizedLink to={`${SHOP_PATHS.home}#packages`} className={styles.chip} onClick={onNavigate}>
            {common.nav.packages}
          </LocalizedLink>
        </li>
        <li>
          <LocalizedLink to={SHOP_PATHS.configure} className={styles.chip} onClick={onNavigate}>
            {common.nav.configure}
          </LocalizedLink>
        </li>
        <li>
          <LocalizedLink to={`${SHOP_PATHS.home}#find`} className={styles.chip} onClick={onNavigate}>
            <SearchIcon />
            {common.nav.search}
          </LocalizedLink>
        </li>
        <li>
          <LocalizedLink to={SHOP_PATHS.cart} className={styles.chip} onClick={onNavigate}>
            <CartIcon />
            {common.nav.cart}
            {count > 0 && (
              <span className={styles.count} aria-label={fill(common.cartLink.many, { count })}>
                {count}
              </span>
            )}
          </LocalizedLink>
        </li>
      </ul>
    </nav>
  )
}
