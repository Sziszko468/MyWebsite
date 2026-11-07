import { Fragment } from 'react'
import { packages, type PackageId, type ServicePackage } from '../../../content/packages'
import { comparison } from '../../../content/shop/comparison'
import { useI18n } from '../../../i18n/useI18n'
import { SHOP_PATHS } from '../../../shop/paths'
import { packagePath } from '../../../shop/packagePaths'
import { addsOver, groupFeatures, levelOf, tierOf } from '../../../shop/tiers'
import { useShopText } from '../../../shop/useShopText'
import { fill } from '../../../utils/format'
import { Button } from '../../Button/Button'
import { PackageGlyph } from '../icons'
import { PriceStatus } from '../PriceStatus'
import { FeatureName, LevelMark, Legend } from './marks'
import styles from './Tiers.module.scss'

interface Props {
  value: PackageId
  onChange: (id: PackageId) => void
}

/** How many of a tier's new features its column names before pointing at the table below. */
const PREVIEW = 3

function ColumnHead({ pkg, selected, onSelect }: { pkg: ServicePackage; selected: boolean; onSelect: () => void }) {
  const { lang } = useI18n()
  const { tiers, landing } = useShopText()
  const c = tiers.compare
  const tier = tierOf(comparison, pkg.id)
  const available = pkg.available !== false
  return (
    <div className={styles.head}>
      <div className={styles.headTop}>
        <span className={styles.glyph}>
          <PackageGlyph id={pkg.id} />
        </span>
        <button type="button" className={styles.select} aria-pressed={selected} onClick={onSelect}>
          {selected ? c.selected : c.select}
          <span className="visually-hidden"> — {pkg.name}</span>
        </button>
      </div>
      <span className={styles.name}>{pkg.name}</span>
      {tier && <span className={styles.tierLabel}>{tier.label[lang]}</span>}
      {pkg.featured && <span className={styles.recommended}>{landing.packages.featured}</span>}
      <span className={styles.tagline}>{pkg.tagline[lang]}</span>
      <span className={styles.price}>
        <PriceStatus price={pkg.price} vat={pkg.vat} />
      </span>
      <span className={styles.actions}>
        {available ? (
          <Button to={`${SHOP_PATHS.configure}?plan=${pkg.id}`} size="sm" arrow>
            {fill(c.start, { name: pkg.name })}
          </Button>
        ) : (
          <span className={styles.unavailable}>{c.notAvailable}</span>
        )}
        <Button to={packagePath(pkg.id)} variant="text" size="sm">
          {c.viewDetails}
          <span className="visually-hidden"> — {pkg.name}</span>
        </Button>
      </span>
    </div>
  )
}

/**
 * The comparison for a screen that has room: the four packages as four columns, one row per feature, each row a mark ("Included",
 * "Add-on", "Custom", "Not included"), the rows grouped by where a feature first appears. Under each package's name, a line of what
 * that step adds to the one it builds on. A real table, so a screen reader announces "Build, Database integration: included in the
 * package". From `md` to `lg` it scrolls sideways with the feature names held at the left; from `lg` all four fit and the packages'
 * names stay under the header as the page scrolls.
 */
export function TierTable({ value, onChange }: Props) {
  const { lang } = useI18n()
  const { tiers } = useShopText()
  const c = tiers.compare
  const order = packages.map((pkg) => pkg.id)
  // Cheap, and the comparison is updated in place by the live catalogue, so it is not memoised on an identity that never changes.
  const groups = groupFeatures(comparison, order)

  return (
    <>
      <Legend />
      <div className={styles.scroller} role="group" aria-label={c.scrollLabel} tabIndex={0}>
        <table className={styles.table} data-count={packages.length}>
          <caption className="visually-hidden">{c.tableLabel}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}>
                <span className="visually-hidden">{c.featureHeader}</span>
              </th>
              {packages.map((pkg) => (
                <th key={pkg.id} scope="col" className={styles.colHead} data-package={pkg.id} data-selected={pkg.id === value || undefined} data-recommended={pkg.featured || undefined}>
                  <ColumnHead pkg={pkg} selected={pkg.id === value} onSelect={() => onChange(pkg.id)} />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr className={styles.stickyRow} aria-hidden="true">
              <td />
              {packages.map((pkg) => (
                <td key={pkg.id} data-package={pkg.id} data-selected={pkg.id === value || undefined}>
                  {pkg.name}
                </td>
              ))}
            </tr>
            <tr className={styles.addsRow}>
              <th scope="row" className={styles.rowHead}>
                <span className={styles.groupTitle}>{c.adds.row}</span>
              </th>
              {packages.map((pkg) => {
                const tier = tierOf(comparison, pkg.id)
                const adds = addsOver(comparison, pkg.id)
                const previous = tier?.buildsOn ? packages.find((candidate) => candidate.id === tier.buildsOn) : undefined
                const title = previous ? fill(c.adds.over, { name: pkg.name, previous: previous.name }) : tier?.buildsOn === null && pkg.id === order[0] ? fill(c.adds.start, { name: pkg.name }) : fill(c.adds.beside, { name: pkg.name })
                return (
                  <td key={pkg.id} className={styles.cell} data-package={pkg.id} data-selected={pkg.id === value || undefined}>
                    <span className={styles.addsTitle}>{title}</span>
                    {adds.length === 0 ? (
                      <span className={styles.addsNone}>{c.adds.none}</span>
                    ) : (
                      <ul className={styles.addsList}>
                        {adds.slice(0, PREVIEW).map((feature) => (
                          <li key={feature.id}>{feature.name[lang]}</li>
                        ))}
                        {adds.length > PREVIEW && <li className={styles.addsMore}>{fill(c.adds.more, { count: adds.length - PREVIEW })}</li>}
                      </ul>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>

          {groups.map((group) => (
            <Fragment key={group.kind === 'introduced' ? group.tier : group.kind}>
              <tbody>
                <tr className={styles.groupRow}>
                  <th scope="rowgroup" colSpan={packages.length + 1}>
                    <span className={styles.groupTitle}>
                      {group.kind === 'every' && c.groups.every}
                      {group.kind === 'other' && c.groups.other}
                      {group.kind === 'introduced' && fill(c.groups.introduced, { name: packages.find((pkg) => pkg.id === group.tier)?.name ?? group.tier })}
                    </span>
                  </th>
                </tr>
                {group.features.map((feature) => (
                  <tr key={feature.id} className={styles.featureRow}>
                    <th scope="row" className={styles.rowHead}>
                      <FeatureName name={feature.name} description={feature.description} />
                    </th>
                    {packages.map((pkg) => (
                      <td key={pkg.id} className={styles.cell} data-package={pkg.id} data-selected={pkg.id === value || undefined}>
                        <LevelMark level={levelOf(feature, pkg.id)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Fragment>
          ))}
        </table>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {fill(c.selectedLive, { name: packages.find((pkg) => pkg.id === value)?.name ?? value })}
      </p>
    </>
  )
}
