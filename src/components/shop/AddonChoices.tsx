import { getPackage, packages } from '../../content/packages'
import { addonsFor } from '../../content/services/addons'
import type { PlanId } from '../../content/services/ids'
import { useI18n } from '../../i18n/useI18n'
import { allowedExtras, type CartLine } from '../../shop/cart'
import { cartActions } from '../../shop/cartStore'
import { useShopText } from '../../shop/useShopText'
import { fill } from '../../utils/format'
import { ChoiceCard, ChoiceFieldset } from './Choice'
import { Disclosure } from './Disclosure'
import { PriceStatus } from './PriceStatus'
import styles from './AddonChoices.module.scss'

/** The names of the packages that list an add-on, in the catalogue's order, for "works with …". */
const packagesListing = (addonId: string): string[] => packages.filter((pack) => pack.available !== false && (pack.extras as readonly string[]).includes(addonId)).map((pack) => pack.name)

/**
 * The add-ons of one line of the cart (PROMPT 20). Only what the line's package lists can be chosen; what the package does not list
 * is not hidden: it is named, with the packages that do list it, so the visitor sees why it is missing and what to change. Every add-on
 * says that it is optional and shows the price status the catalogue really has ("Custom quote" unless a price is published). The backend
 * applies the same rule (`allowedExtras`), so what is offered here is exactly what it accepts.
 */
export function AddonChoices({ line, legend, hint }: { line: CartLine; legend: string; hint: string }) {
  const { lang } = useI18n()
  const { configurator: c } = useShopText()
  const usable = allowedExtras(line.need, line.plan)
  const all = addonsFor(line.need)
  const chosenPackage = line.plan !== null && line.plan !== 'custom' ? line.plan : null
  const blocked = all.filter((addon) => !usable.includes(addon.id))

  return (
    <div className={styles.root}>
      <ChoiceFieldset legend={legend} hint={hint} columns={2}>
        {all
          .filter((addon) => usable.includes(addon.id))
          .map((addon) => {
            const listing = packagesListing(addon.id)
            return (
              <ChoiceCard
                key={addon.id}
                type="checkbox"
                checked={line.extras.includes(addon.id)}
                onChange={(on) => cartActions.toggleExtra(line.need, addon.id, on)}
                title={addon.name[lang]}
                tag={c.extras.optional}
                text={
                  <>
                    {addon.summary[lang]}
                    {chosenPackage && listing.length > 0 && <span className={styles.worksWith}>{fill(c.extras.worksWith, { packages: listing.join(', ') })}</span>}
                  </>
                }
                meta={<PriceStatus price={addon.price} vat={addon.vat} />}
              />
            )
          })}
      </ChoiceFieldset>

      {chosenPackage && blocked.length > 0 && (
        <Disclosure className={styles.blocked} level={4} title={fill(c.extras.notWithTitle, { package: getPackage(chosenPackage as Exclude<PlanId, 'custom'>).name })} meta={String(blocked.length)}>
          <p className={styles.blockedIntro}>{c.extras.notWithText}</p>
          <ul className={styles.blockedList}>
            {blocked.map((addon) => {
              const listing = packagesListing(addon.id)
              return (
                <li key={addon.id}>
                  <strong>{addon.name[lang]}</strong>
                  {listing.length > 0 && <span className={styles.blockedWith}> {fill(c.extras.availableWith, { packages: listing.join(', ') })}</span>}
                </li>
              )
            })}
          </ul>
        </Disclosure>
      )}
    </div>
  )
}
