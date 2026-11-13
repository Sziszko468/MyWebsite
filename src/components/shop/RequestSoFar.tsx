import { getAddon } from '../../content/services/addons'
import type { PlanId } from '../../content/services/ids'
import { useI18n } from '../../i18n/useI18n'
import type { Cart } from '../../shop/cart'
import { isCartSaved } from '../../shop/cartStore'
import { useCartNotice, useCommonText } from '../../shop/hooks'
import { useShopText } from '../../shop/useShopText'
import { fill } from '../../utils/format'
import styles from './RequestSoFar.module.scss'

/**
 * "Your request so far" (PROMPT 20): the services, their packages and add-ons as they stand, beside the step that changes them, so a
 * choice shows up at once. It also says whether the choices are saved on this device: true only while the browser really keeps them
 * (a private window or blocked site data keeps the cart in memory, and then the box says so instead).
 */
export function RequestSoFar({ cart, planLabel, needLabel }: { cart: Cart; planLabel: (plan: PlanId) => string; needLabel: (need: Cart['lines'][number]['need']) => string }) {
  const { lang } = useI18n()
  const { configurator: c } = useShopText()
  const common = useCommonText()
  const notice = useCartNotice()
  const live = c.live
  // A package change that took add-ons off says so here, in words, beside what is left (the announcer says it to a screen reader).
  const dropped =
    notice?.kind === 'extrasDropped' && notice.need !== null && cart.lines.some((line) => line.need === notice.need)
      ? fill(common.announce.extrasDropped, { name: needLabel(notice.need), extras: notice.dropped.map((id) => getAddon(id).name[lang]).join(', ') })
      : null

  return (
    <aside className={styles.root} aria-labelledby="request-so-far">
      <h3 id="request-so-far" className={styles.title}>
        {live.title}
      </h3>
      {cart.lines.length === 0 ? (
        <p className={styles.empty}>{live.empty}</p>
      ) : (
        <ul className={styles.list}>
          {cart.lines.map((line) => (
            <li key={line.need} className={styles.line}>
              <strong className={styles.service}>{needLabel(line.need)}</strong>
              <span className={styles.row}>
                <span className={styles.label}>{live.package}:</span> {line.plan ? planLabel(line.plan) : live.none}
              </span>
              <span className={styles.row}>
                <span className={styles.label}>{live.addons}:</span> {line.extras.length > 0 ? line.extras.map((id) => getAddon(id).name[lang]).join(', ') : live.none}
              </span>
            </li>
          ))}
        </ul>
      )}
      {dropped && (
        <p className={styles.dropped} data-testid="extras-dropped">
          {dropped}
        </p>
      )}
      <p className={styles.saved}>{isCartSaved() ? live.saved : live.notSaved}</p>
    </aside>
  )
}
