import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { packages, type PackageId, type ServicePackage } from '../../content/packages'
import { getAddon } from '../../content/services/addons'
import { useI18n } from '../../i18n/useI18n'
import { timelineText } from '../../shop/format'
import { useShopText } from '../../shop/useShopText'
import { cx } from '../../utils/cx'
import { Disclosure } from './Disclosure'
import { PriceStatus } from './PriceStatus'
import styles from './PackageCompare.module.scss'

const ROWS = ['includes', 'scope', 'customization', 'extras', 'support', 'price', 'timeline'] as const
type Row = (typeof ROWS)[number]

/**
 * The optional comparison: the packages side by side on a wide screen, and on a phone one card per
 * topic that lists the packages one under the other, each cell carrying the package's name. It is
 * the same markup in both cases (a grid with table roles, restyled by the width), so there is never
 * a table wider than the screen to scroll. The visitor can drop packages from it, down to two.
 */
export function PackageCompare() {
  const { lang } = useI18n()
  const { landing } = useShopText()
  const copy = landing.compare
  const id = useId()
  const [shown, setShown] = useState<ReadonlySet<PackageId>>(() => new Set(packages.map((pkg) => pkg.id)))
  const visible = packages.filter((pkg) => shown.has(pkg.id))

  const toggle = (pkgId: PackageId, on: boolean) =>
    setShown((current) => {
      const next = new Set(current)
      if (on) next.add(pkgId)
      else if (next.size > 2) next.delete(pkgId)
      return next
    })

  const cell = (row: Row, pkg: ServicePackage): ReactNode => {
    switch (row) {
      case 'includes':
        return (
          <ul className={styles.list}>
            {pkg.includes.map((item) => (
              <li key={item.hu}>{item[lang]}</li>
            ))}
          </ul>
        )
      case 'scope':
        return pkg.scope[lang]
      case 'customization':
        return pkg.customization[lang]
      case 'extras':
        return (
          <ul className={styles.chips}>
            {pkg.extras.map((extra) => (
              <li key={extra}>{getAddon(extra).name[lang]}</li>
            ))}
          </ul>
        )
      case 'support':
        return pkg.support[lang]
      case 'price':
        return <PriceStatus price={pkg.price} vat={pkg.vat} />
      case 'timeline':
        return timelineText(pkg.timeline, lang, landing.packages.timeline)
    }
  }

  return (
    <Disclosure title={copy.title} level={3} className={styles.root}>
      <p className={styles.intro}>{copy.intro}</p>

      <fieldset className={styles.pick}>
        <legend className={styles.pickLegend}>{copy.pick}</legend>
        <div className={styles.pickRow}>
          {packages.map((pkg) => {
            const on = shown.has(pkg.id)
            const locked = on && shown.size <= 2
            return (
              <label key={pkg.id} className={styles.pickChip} data-checked={on || undefined} data-locked={locked || undefined}>
                <input type="checkbox" checked={on} disabled={locked} onChange={(event) => toggle(pkg.id, event.target.checked)} />
                <span>{pkg.name}</span>
              </label>
            )
          })}
        </div>
        <p className={styles.pickHint}>{copy.pickHint}</p>
      </fieldset>

      <div className={styles.table} role="table" aria-label={copy.rowsLabel} style={{ '--cols': visible.length } as CSSProperties} id={`${id}-table`}>
        <div className={cx(styles.row, styles.headRow)} role="row">
          <span className={styles.corner} role="columnheader">
            <span className="visually-hidden">{copy.rowsLabel}</span>
          </span>
          {visible.map((pkg) => (
            <span key={pkg.id} className={styles.colHead} role="columnheader">
              {pkg.name}
            </span>
          ))}
        </div>

        {ROWS.map((row) => (
          <div key={row} className={styles.row} role="row">
            <span className={styles.rowHead} role="rowheader">
              {copy.rows[row]}
            </span>
            {visible.map((pkg) => (
              <div key={pkg.id} className={styles.cell} role="cell">
                <span className={styles.cellName} aria-hidden="true">
                  {pkg.name}
                </span>
                <div className={styles.value}>{cell(row, pkg)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Disclosure>
  )
}
