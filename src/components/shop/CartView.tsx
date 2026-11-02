import { useEffect, useState } from 'react'
import { getPackage } from '../../content/packages'
import { addonsFor } from '../../content/services/addons'
import { PLAN_IDS, type PlanId } from '../../content/services/ids'
import { useI18n } from '../../i18n/useI18n'
import { isCartComplete, type CartLine } from '../../shop/cart'
import { cartActions } from '../../shop/cartStore'
import { startStep, suggestedPlans } from '../../shop/flow'
import { useCart, useCartNotice, useCartPricing } from '../../shop/hooks'
import { inquiryActions } from '../../shop/inquiryStore'
import { SHOP_PATHS, pathOfNeed } from '../../shop/paths'
import type { LinePricing } from '../../shop/pricing'
import { useShopText } from '../../shop/useShopText'
import { cx } from '../../utils/cx'
import { fill } from '../../utils/format'
import { Button } from '../Button/Button'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { ChoiceCard, ChoiceFieldset } from './Choice'
import { Disclosure } from './Disclosure'
import { TrashIcon } from './icons'
import { PriceStatus } from './PriceStatus'
import { StickyCta } from './StickyCta'
import styles from './CartView.module.scss'

/** How long "removed, undo" stays before it goes. */
const UNDO_MS = 9000

function LineCard({ line, pricing }: { line: CartLine; pricing: LinePricing }) {
  const { lang } = useI18n()
  const { cart: c, common } = useShopText()
  const name = common.needs[line.need].title
  const available = addonsFor(line.need)
  const suggested = suggestedPlans(line.need)
  const planName = (id: PlanId) => (id === 'custom' ? common.plans.custom.name : getPackage(id).name)
  const kind = pricing.class === 'fixed' ? common.price.kind.fixed : common.price.kind.quote

  return (
    <article className={styles.line} data-class={pricing.class} aria-label={name}>
      <header className={styles.lineHead}>
        <div className={styles.lineTitle}>
          <span className={styles.kind} data-class={pricing.class}>
            {kind}
          </span>
          <h3 className={styles.name}>
            <LocalizedLink to={pathOfNeed(line.need)}>{name}</LocalizedLink>
          </h3>
          <p className={styles.nameText}>{common.needs[line.need].text}</p>
        </div>
        <Button type="button" variant="text" size="sm" className={styles.remove} onClick={() => cartActions.remove(line.need)}>
          <TrashIcon />
          {c.line.remove}
          <span className="visually-hidden"> — {name}</span>
        </Button>
      </header>

      <ChoiceFieldset legend={fill(c.line.packageFor, { name })} columns={2} className={styles.plans}>
        {PLAN_IDS.map((id) => (
          <ChoiceCard
            key={id}
            type="radio"
            name={`cart-plan-${line.need}`}
            value={id}
            compact
            checked={line.plan === id}
            onChange={() => cartActions.setPlan(line.need, id)}
            title={planName(id)}
            tag={suggested.includes(id) ? c.line.suggested : undefined}
          />
        ))}
      </ChoiceFieldset>
      {line.plan === null && <p className={styles.needs}>{c.line.needsPlan}</p>}

      <Disclosure title={c.line.addons} meta={line.extras.length > 0 ? fill(c.line.addonsSelected, { count: line.extras.length }) : undefined} level={4}>
        {available.length === 0 ? (
          <p className={styles.muted}>{c.line.noAddons}</p>
        ) : (
          <ChoiceFieldset legend={fill(c.line.addonsFor, { name })} columns={2} className={styles.addons}>
            {available.map((addon) => (
              <ChoiceCard
                key={addon.id}
                type="checkbox"
                compact
                checked={line.extras.includes(addon.id)}
                onChange={(on) => cartActions.toggleExtra(line.need, addon.id, on)}
                title={addon.name[lang]}
                tag={common.price.kind.addon}
                meta={<PriceStatus price={addon.price} vat={addon.vat} />}
              />
            ))}
          </ChoiceFieldset>
        )}
      </Disclosure>

      <footer className={styles.lineFoot}>
        <span className={styles.footLabel}>{c.line.price}:</span>
        {pricing.plan ? <PriceStatus price={pricing.plan.price} vat={pricing.plan.vat} /> : <PriceStatus price={{ kind: 'quote' }} />}
      </footer>
    </article>
  )
}

/** The summary: what is in the cart by kind, the totals when there are real prices, and the way on. */
function Summary({ showActions }: { showActions: boolean }) {
  const { lang } = useI18n()
  const { cart: c, common } = useShopText()
  const cart = useCart()
  const pricing = useCartPricing()
  const [confirming, setConfirming] = useState(false)
  const complete = isCartComplete(cart)
  const missing = cart.lines.find((line) => line.plan === null)

  return (
    <div className={styles.summary}>
      <dl className={styles.rows}>
        <div>
          <dt>{c.summary.services}</dt>
          <dd>{cart.lines.length}</dd>
        </div>
        <div>
          <dt>{c.summary.addons}</dt>
          <dd>{pricing.addons}</dd>
        </div>
        {pricing.fixed.map((total) => (
          <div key={total.currency}>
            <dt>{c.summary.startingTotal}</dt>
            <dd>
              {new Intl.NumberFormat(lang, { style: 'currency', currency: total.currency, maximumFractionDigits: 0 }).format(total.amount)}
              {total.vat !== 'unspecified' && total.vat !== 'mixed' && <span className={styles.vat}> {common.price.vat[total.vat]}</span>}
            </dd>
          </div>
        ))}
        <div>
          <dt>{c.summary.quoted}</dt>
          <dd>{fill(c.summary.quotedValue, { count: pricing.quotedItems })}</dd>
        </div>
      </dl>

      <p className={styles.noPayment}>{c.summary.noPayment}</p>

      <details className={styles.legend}>
        <summary>{c.legend.title}</summary>
        <ul>
          <li>
            <strong>{common.price.kind.fixed}</strong> {c.legend.fixed}
          </li>
          <li>
            <strong>{common.price.kind.quote}</strong> {c.legend.quote}
          </li>
          <li>
            <strong>{common.price.kind.addon}</strong> {c.legend.addon}
          </li>
        </ul>
      </details>

      {showActions && (
        <div className={styles.summaryActions}>
          {!complete && missing && <p className={styles.needs}>{fill(c.summary.needsPlan, { name: common.needs[missing.need].title })}</p>}
          <Button to={SHOP_PATHS.configure} size="lg" arrow fullWidth onClick={() => inquiryActions.setStep(startStep(cart, 'cart'))}>
            {c.actions.proceed}
          </Button>
          <Button to={SHOP_PATHS.home} variant="secondary" fullWidth>
            {c.actions.continue}
          </Button>
          {confirming ? (
            <div className={styles.confirm} role="group" aria-label={c.actions.clearAsk}>
              <p>{c.actions.clearAsk}</p>
              <div className={styles.confirmButtons}>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    cartActions.clear()
                    setConfirming(false)
                  }}
                >
                  {c.actions.clearYes}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)}>
                  {c.actions.clearNo}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="text" size="sm" onClick={() => setConfirming(true)}>
              {c.actions.clear}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** "Removed. Undo": a line that went by mistake is one tap from coming back, until the notice times out. */
function UndoNotice() {
  const notice = useCartNotice()
  const { cart: c, common } = useShopText()

  useEffect(() => {
    if (notice?.kind !== 'removed') return
    const timer = setTimeout(cartActions.dismissNotice, UNDO_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // Leaving the cart page forgets the "undo": it only makes sense right after the removal.
  useEffect(() => cartActions.dismissNotice, [])

  if (notice?.kind !== 'removed' || !notice.undo || !notice.need) return <div role="status" className={styles.undoSlot} />
  return (
    <div role="status" className={styles.undoSlot}>
      <p className={styles.undo}>
        <span>{fill(c.notice.removed, { name: common.needs[notice.need].title })}</span>
        <Button type="button" variant="secondary" size="sm" onClick={cartActions.undoRemove}>
          {c.actions.undo}
        </Button>
      </p>
    </div>
  )
}

/**
 * The cart. Lines are grouped by how they are priced (fixed-price products first, if any, then
 * the custom-quoted services), each with its package, its add-ons and a way to remove it. The
 * summary is a panel beside the list on a wide screen and a collapsible block above it on a phone,
 * where the main action is a bar at the bottom. Nothing is paid here: the cart becomes an inquiry.
 */
export function CartView() {
  const { cart: c } = useShopText()
  const cart = useCart()
  const pricing = useCartPricing()
  const count = cart.lines.length

  if (count === 0) {
    return (
      <>
        <UndoNotice />
        <div className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>{c.empty.title}</h2>
          <p>{c.empty.text}</p>
          <div className={styles.emptyActions}>
            <Button to={SHOP_PATHS.home} size="lg" arrow>
              {c.empty.browse}
            </Button>
            <Button to={SHOP_PATHS.configure} size="lg" variant="secondary">
              {c.empty.configure}
            </Button>
          </div>
        </div>
      </>
    )
  }

  const groups = (['fixed', 'quote'] as const)
    .map((kind) => ({ kind, lines: cart.lines.map((line, i) => ({ line, pricing: pricing.lines[i] })).filter((item) => item.pricing.class === kind) }))
    .filter((group) => group.lines.length > 0)

  return (
    <>
      <UndoNotice />
      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.mobileSummary}>
            <Disclosure title={fill(c.summary.mobileTitle, { count })} level={2}>
              <Summary showActions={false} />
            </Disclosure>
          </div>

          {groups.map((group) => (
            <section key={group.kind} aria-labelledby={`group-${group.kind}`} className={styles.group}>
              <h2 id={`group-${group.kind}`} className={styles.groupTitle}>
                {c.groups[group.kind]}
                <span className={styles.groupCount}>{group.lines.length}</span>
              </h2>
              <ul className={styles.lines} aria-label={c.groups.itemsLabel}>
                {group.lines.map(({ line, pricing: linePricing }) => (
                  <li key={line.need}>
                    <LineCard line={line} pricing={linePricing} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className={cx(styles.aside)} aria-label={c.summary.title}>
          <h2 className={styles.asideTitle}>{c.summary.title}</h2>
          <Summary showActions />
        </aside>
      </div>

      <StickyCta
        label={count === 1 ? c.summary.countOne : fill(c.summary.countMany, { count })}
        action={c.actions.proceedShort}
        to={SHOP_PATHS.configure}
        onActivate={() => inquiryActions.setStep(startStep(cart, 'cart'))}
      />
    </>
  )
}
