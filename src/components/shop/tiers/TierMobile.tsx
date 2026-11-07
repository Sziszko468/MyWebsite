import { useId, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import { packages, type PackageId, type ServicePackage } from '../../../content/packages'
import { comparison } from '../../../content/shop/comparison'
import { useI18n } from '../../../i18n/useI18n'
import { SHOP_PATHS } from '../../../shop/paths'
import { packagePath } from '../../../shop/packagePaths'
import { addsOver, comparePair, groupFeatures, levelOf, nextTier, tierOf } from '../../../shop/tiers'
import { useMinWidth } from '../../../shop/useMinWidth'
import { useShopText } from '../../../shop/useShopText'
import { fill } from '../../../utils/format'
import { Button } from '../../Button/Button'
import { CheckboxField } from '../../form/fields'
import { Disclosure } from '../Disclosure'
import { PackageGlyph } from '../icons'
import { PriceStatus } from '../PriceStatus'
import { FeatureName, LevelMark } from './marks'
import styles from './Tiers.module.scss'

interface Props {
  value: PackageId
  onChange: (id: PackageId) => void
}

/** A finger must travel this far sideways, and hardly any up or down, for a swipe to change the package. */
const SWIPE_X = 56
const SWIPE_Y = 40
/** Side by side needs two columns of marks and a feature name: about this wide. */
const PAIR_MIN_REM = 24

function PairCompare({ first, onClose }: { first: PackageId; onClose: () => void }) {
  const { tiers } = useShopText()
  const c = tiers.compare.pair
  const ids = packages.map((pkg) => pkg.id)
  const defaultOther = tierOf(comparison, first)?.buildsOn ?? nextTier(comparison, first) ?? ids.find((id) => id !== first) ?? first
  const [left, setLeft] = useState<PackageId>(first)
  const [right, setRight] = useState<PackageId>(defaultOther)
  const [onlyDifferences, setOnlyDifferences] = useState(false)
  const rows = comparePair(comparison, left, right)
  const differing = rows.filter((row) => row.differs)
  const shown = onlyDifferences ? differing : rows
  const nameOf = (id: PackageId) => packages.find((pkg) => pkg.id === id)?.name ?? id
  const idLeft = useId()
  const idRight = useId()

  return (
    <div className={styles.pair}>
      <div className={styles.pairPick}>
        <label htmlFor={idLeft} className={styles.pairLabel}>
          {c.left}
          <select id={idLeft} className={styles.pairSelect} value={left} onChange={(event) => setLeft(event.target.value as PackageId)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={idRight} className={styles.pairLabel}>
          {c.right}
          <select id={idRight} className={styles.pairSelect} value={right} onChange={(event) => setRight(event.target.value as PackageId)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <CheckboxField label={c.differencesOnly} checked={onlyDifferences} onChange={setOnlyDifferences} />
      <p className="visually-hidden" role="status" aria-live="polite">
        {fill(c.live, { count: differing.length })}
      </p>
      {left === right ? (
        <p className={styles.pairNote}>{c.same}</p>
      ) : shown.length === 0 ? (
        <p className={styles.pairNote}>{c.noDifferences}</p>
      ) : (
        <table className={styles.pairTable}>
          <caption className="visually-hidden">{`${nameOf(left)} / ${nameOf(right)}`}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{tiers.compare.featureHeader}</span>
              </th>
              <th scope="col" data-package={left}>
                {nameOf(left)}
              </th>
              <th scope="col" data-package={right}>
                {nameOf(right)}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.feature.id} data-differs={row.differs || undefined}>
                <th scope="row">
                  <FeatureName name={row.feature.name} description={row.feature.description} />
                </th>
                <td>
                  <LevelMark level={row.left} />
                </td>
                <td>
                  <LevelMark level={row.right} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Button type="button" variant="secondary" onClick={onClose}>
        {c.close}
      </Button>
    </div>
  )
}

function Panel({ pkg, onPick }: { pkg: ServicePackage; onPick: (id: PackageId) => void }) {
  const { lang } = useI18n()
  const { tiers, landing } = useShopText()
  const c = tiers.compare
  const order = packages.map((candidate) => candidate.id)
  const tier = tierOf(comparison, pkg.id)
  const previous = tier?.buildsOn ? packages.find((candidate) => candidate.id === tier.buildsOn) : undefined
  const adds = addsOver(comparison, pkg.id)
  const groups = groupFeatures(comparison, order)
  const available = pkg.available !== false
  const heading = previous ? fill(c.adds.over, { name: pkg.name, previous: previous.name }) : pkg.id === order[0] ? fill(c.adds.start, { name: pkg.name }) : fill(c.adds.beside, { name: pkg.name })

  return (
    <div className={styles.panel} data-package={pkg.id}>
      <header className={styles.panelHead}>
        <span className={styles.glyph}>
          <PackageGlyph id={pkg.id} />
        </span>
        <div className={styles.panelTitle}>
          <h3 className={styles.name}>{pkg.name}</h3>
          {tier && <p className={styles.tierLabel}>{tier.label[lang]}</p>}
          {pkg.featured && <p className={styles.recommended}>{landing.packages.featured}</p>}
        </div>
      </header>
      <p className={styles.tagline}>{pkg.tagline[lang]}</p>
      <p className={styles.audience}>{pkg.audience[lang]}</p>
      <div className={styles.price}>
        <PriceStatus price={pkg.price} vat={pkg.vat} hint />
      </div>
      <div className={styles.actions}>
        {available ? (
          <Button to={`${SHOP_PATHS.configure}?plan=${pkg.id}`} arrow>
            {fill(c.start, { name: pkg.name })}
          </Button>
        ) : (
          <span className={styles.unavailable}>{c.notAvailable}</span>
        )}
        <Button to={packagePath(pkg.id)} variant="secondary">
          {c.viewDetails}
          <span className="visually-hidden"> — {pkg.name}</span>
        </Button>
      </div>

      <section className={styles.adds} aria-label={heading}>
        <h4 className={styles.addsTitle}>{heading}</h4>
        {tier?.buildsOn && previous && (
          <p className={styles.addsBuilds}>
            {fill(c.builds, { name: previous.name })}{' '}
            <button type="button" className={styles.link} onClick={() => onPick(previous.id)}>
              {previous.name}
            </button>
          </p>
        )}
        {tier && !tier.buildsOn && pkg.id !== order[0] && <p className={styles.addsBuilds}>{c.besideLadder}</p>}
        {adds.length === 0 ? (
          <p className={styles.addsNone}>{c.adds.none}</p>
        ) : (
          <ul className={styles.addsList}>
            {adds.map((feature) => (
              <li key={feature.id}>
                <FeatureName name={feature.name} description={feature.description} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.groups}>
        <h4 className={styles.groupsTitle}>{c.allFeatures}</h4>
        {groups.map((group) => {
          const title =
            group.kind === 'every' ? c.groups.every : group.kind === 'other' ? c.groups.other : fill(c.groups.introduced, { name: packages.find((candidate) => candidate.id === group.tier)?.name ?? group.tier })
          return (
            <Disclosure key={`${pkg.id}-${group.kind === 'introduced' ? group.tier : group.kind}`} level={4} title={title} meta={fill(c.featuresCount, { count: group.features.length })} defaultOpen={group.kind === 'introduced' && group.tier === pkg.id}>
              <ul className={styles.featureList}>
                {group.features.map((feature) => (
                  <li key={feature.id} className={styles.featureItem}>
                    <FeatureName name={feature.name} description={feature.description} />
                    <LevelMark level={levelOf(feature, pkg.id)} />
                  </li>
                ))}
              </ul>
            </Disclosure>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The comparison for a phone: not the table squeezed small but one package at a time. Four tabs choose the package (the arrow keys
 * move between them, and a swipe over the panel does too); the panel says what the package is, its price status, how to start, what
 * it adds to the one below (the progression), and every feature in groups that open and close. On a screen wide enough for two
 * columns of marks (a large phone) "Compare two packages" puts any two side by side with the differences marked. Everything the
 * table says is here: nothing is dropped, only laid out for a thumb.
 */
export function TierMobile({ value, onChange }: Props) {
  const { tiers } = useShopText()
  const c = tiers.compare
  const base = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const touch = useRef<{ x: number; y: number } | null>(null)
  const roomForPair = useMinWidth(PAIR_MIN_REM)
  const [pair, setPair] = useState(false)
  const pkg = packages.find((candidate) => candidate.id === value) ?? packages[0]
  const index = packages.indexOf(pkg)

  const go = (to: number) => {
    const next = packages[(to + packages.length) % packages.length]
    onChange(next.id)
    refs.current[next.id]?.focus()
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: packages.length - 1 }
    if (!(event.key in keys)) return
    event.preventDefault()
    go(keys[event.key])
  }
  const onTouchStart = (event: TouchEvent) => {
    const point = event.touches[0]
    touch.current = point ? { x: point.clientX, y: point.clientY } : null
  }
  const onTouchEnd = (event: TouchEvent) => {
    const start = touch.current
    const point = event.changedTouches[0]
    touch.current = null
    if (!start || !point) return
    const dx = point.clientX - start.x
    const dy = point.clientY - start.y
    if (Math.abs(dx) >= SWIPE_X && Math.abs(dy) <= SWIPE_Y && index + (dx < 0 ? 1 : -1) >= 0 && index + (dx < 0 ? 1 : -1) < packages.length) go(index + (dx < 0 ? 1 : -1))
  }

  return (
    <div className={styles.mobile}>
      <div className={styles.tabs} role="tablist" aria-label={c.tabsLabel} onKeyDown={onKey}>
        {packages.map((candidate) => (
          <button
            key={candidate.id}
            ref={(node) => {
              refs.current[candidate.id] = node
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${candidate.id}`}
            className={styles.tab}
            data-package={candidate.id}
            aria-selected={candidate.id === value}
            aria-controls={pair && roomForPair ? undefined : `${base}-panel`}
            tabIndex={candidate.id === value ? 0 : -1}
            onClick={() => onChange(candidate.id)}
          >
            {candidate.name}
          </button>
        ))}
      </div>
      <p className={styles.swipeHint}>{c.swipeHint}</p>

      {pair && roomForPair ? (
        <PairCompare first={pkg.id} onClose={() => setPair(false)} />
      ) : (
        <>
          <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${pkg.id}`} className={styles.swipe} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <Panel key={pkg.id} pkg={pkg} onPick={onChange} />
          </div>
          {roomForPair && (
            <Button type="button" variant="secondary" className={styles.pairOpen} onClick={() => setPair(true)}>
              {c.pair.open}
            </Button>
          )}
        </>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {fill(c.selectedLive, { name: pkg.name })}
      </p>
    </div>
  )
}
