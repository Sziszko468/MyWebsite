import { useLocation } from 'react-router'
import { splitLanguage } from '../../i18n/paths'
import { useCart, useCartNotice, useCommonText } from '../../shop/hooks'
import { SHOP_PATHS, isShopPath } from '../../shop/paths'
import { cx } from '../../utils/cx'
import { fill } from '../../utils/format'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { CartIcon } from './icons'
import styles from './CartLink.module.scss'

/**
 * The cart in the header: an icon, the number of services in it and a name that says both. It is
 * always there on the shop's pages; elsewhere it appears only once something is in the cart, so
 * the rest of the site does not look like a till. When the cart changes the number gives a short
 * nudge (a new element, so the animation restarts); under reduced motion the nudge is skipped.
 */
export function CartLink({ className }: { className?: string }) {
  const { pathname } = useLocation()
  const cart = useCart()
  const notice = useCartNotice()
  const common = useCommonText()
  const count = cart.lines.length

  if (count === 0 && !isShopPath(splitLanguage(pathname).rest)) return null

  const label = count === 0 ? common.cartLink.empty : count === 1 ? common.cartLink.one : fill(common.cartLink.many, { count })

  return (
    <LocalizedLink to={SHOP_PATHS.cart} className={cx(styles.link, className)} aria-label={label}>
      <CartIcon />
      {count > 0 && (
        <span key={notice?.seq ?? 0} className={styles.count} aria-hidden="true">
          {count}
        </span>
      )}
    </LocalizedLink>
  )
}
