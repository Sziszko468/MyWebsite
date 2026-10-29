import { useId } from 'react'
import { getPackage, packages, type PackageId, type ServicePackage } from '../../content/packages'
import type { Language } from '../../i18n/config'
import { useI18n } from '../../i18n/useI18n'
import type { PackageChoice } from '../../quote/types'
import { fill, pad } from '../../utils/format'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { PriceTag } from '../ServiceCard/PriceTag'
import { servicesTone } from './rhythm'
import styles from './PackagePicker.module.scss'

/** "Depends on the project", or a published range with its unit in the right form for the language. */
function timelineText(pkg: ServicePackage, lang: Language, t: ReturnType<typeof useI18n>['t']): string {
  const copy = t.servicesPage.packages.timeline
  if (pkg.timeline.kind === 'scope') return copy.scope
  const { min, max, unit } = pkg.timeline
  const form = new Intl.PluralRules(lang).select(max) === 'one' ? 'one' : 'other'
  return fill(copy.estimate, { range: min === max ? String(min) : `${min}–${max}`, unit: copy.units[unit][form] })
}

interface CardProps {
  pkg: ServicePackage
  position: number
  /** The radio group's name, shared by the four cards. */
  group: string
  selected: boolean
  onSelect: (id: PackageId) => void
}

function PackageCard({ pkg, position, group, selected, onSelect }: CardProps) {
  const { lang, t } = useI18n()
  const copy = t.servicesPage.packages
  const ref = usePointerField<HTMLLIElement>()
  const id = useId()

  return (
    <li
      ref={ref}
      className={styles.card}
      data-package={pkg.id}
      data-featured={pkg.featured || undefined}
      data-selected={selected || undefined}
    >
      <header className={styles.head}>
        <span className={styles.index} aria-hidden="true">
          {pad(position + 1)}
        </span>
        <h3 className={styles.name}>{pkg.name}</h3>
        <p id={`${id}-tagline`} className={styles.tagline}>
          {pkg.tagline[lang]}
        </p>
      </header>

      <div className={styles.row}>
        <h4 className={styles.label}>{copy.rows.audience}</h4>
        <p>{pkg.audience[lang]}</p>
      </div>

      <div className={styles.row}>
        <h4 className={styles.label}>{copy.rows.fits}</h4>
        <ul className={styles.plain}>
          {pkg.fits.map((item) => (
            <li key={item.hu}>{item[lang]}</li>
          ))}
        </ul>
      </div>

      <div className={styles.row}>
        <h4 className={styles.label}>{copy.rows.includes}</h4>
        <ul className={styles.slashes}>
          {pkg.includes.map((item) => (
            <li key={item.hu}>{item[lang]}</li>
          ))}
        </ul>
      </div>

      <div className={styles.row}>
        <h4 className={styles.label}>{copy.rows.price}</h4>
        <PriceTag price={pkg.price} vat={pkg.vat} quoteRequired={pkg.quoteRequired} note={pkg.priceNote?.[lang]} />
      </div>

      <div className={styles.row}>
        <h4 className={styles.label}>{copy.rows.timeline}</h4>
        <p>{timelineText(pkg, lang, t)}</p>
      </div>

      {/* The card is one big target: the label stretches over it. The radio itself stays in the page's tab order. */}
      <div className={styles.choose}>
        <input
          type="radio"
          id={id}
          name={group}
          className={styles.input}
          checked={selected}
          onChange={() => onSelect(pkg.id)}
          aria-describedby={`${id}-tagline`}
        />
        <label htmlFor={id} className={styles.chooseLabel}>
          <span className={styles.mark} aria-hidden="true">
            <svg viewBox="0 0 16 16" width="1em" height="1em" focusable="false">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>{selected ? copy.chosen : copy.choose}</span>
          <span className="visually-hidden"> — {pkg.name}</span>
        </label>
      </div>
    </li>
  )
}

interface PackagePickerProps {
  /** The draft's package; "not sure" and "nothing yet" both leave every card unchosen. */
  value: PackageChoice | null
  onChange: (id: PackageId) => void
}

/**
 * The four packages, side by side from `xl` and two by two before that, as one group of radio
 * buttons: the whole card is the target, the arrow keys move between cards, and the chosen card
 * says "Chosen" in words and shows a tick, as well as changing its frame. The choice is the
 * quote form's package. On wide screens the cards' rows line up (CSS subgrid), so the same
 * fact is on the same line in every card; Build carries more visual weight, with no claim of
 * popularity. Nothing is hidden behind hover.
 */
export function PackagePicker({ value, onChange }: PackagePickerProps) {
  const { t } = useI18n()
  const titleId = useId()
  const group = useId()
  const copy = t.servicesPage.packages
  const chosen = value && value !== 'unsure' ? getPackage(value) : null

  return (
    <Section id="packages" tone={servicesTone('packages')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="02" title={copy.title} description={copy.intro} />
        </Reveal>

        <fieldset className={styles.picker}>
          <legend className={styles.legend}>{copy.legend}</legend>
          <ul className={styles.grid}>
            {packages.map((pkg, position) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                position={position}
                group={group}
                selected={chosen?.id === pkg.id}
                onSelect={onChange}
              />
            ))}
          </ul>
        </fieldset>

        <div className={styles.bar}>
          <p className={styles.barText} aria-live="polite">
            {chosen ? fill(copy.bar.some, { name: chosen.name }) : copy.bar.none}
          </p>
          <Button href="#quote" arrow>
            {chosen ? copy.bar.ctaSome : copy.bar.ctaNone}
          </Button>
        </div>
      </Container>
    </Section>
  )
}
