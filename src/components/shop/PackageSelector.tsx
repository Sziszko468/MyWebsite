import { useId } from 'react'
import { getPackage, packages, type PackageId } from '../../content/packages'
import { getAddon } from '../../content/services/addons'
import { useI18n } from '../../i18n/useI18n'
import { timelineText } from '../../shop/format'
import { SHOP_PATHS } from '../../shop/paths'
import { useShopText } from '../../shop/useShopText'
import { fill, pad } from '../../utils/format'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { PackageCompare } from './PackageCompare'
import { PackageGlyph } from './icons'
import { PriceStatus } from './PriceStatus'
import { shopTone } from './rhythm'
import styles from './PackageSelector.module.scss'

interface PackageSelectorProps {
  value: PackageId
  onChange: (id: PackageId) => void
}

/**
 * The four packages as four products, not a pricing table. A row of large tiles (radio buttons,
 * so the arrow keys move between them) chooses which package the stage below presents in full:
 * who it is for, its main deliverables, what can be included, its optional extras, the price
 * status and the way to start. The stage changes with a short slide, and the choice is announced.
 * Under the stage a custom project is offered for anything that fits none of them, and the
 * comparison opens on request. Build carries more visual weight; that is design, not a claim of
 * popularity, and the page says so.
 */
export function PackageSelector({ value, onChange }: PackageSelectorProps) {
  const { lang } = useI18n()
  const { landing } = useShopText()
  const copy = landing.packages
  const titleId = useId()
  const group = useId()
  const nameId = useId()
  const pkg = getPackage(value)

  return (
    <Section id="packages" tone={shopTone('packages')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="02" title={copy.title} description={copy.intro} />
        </Reveal>

        <fieldset className={styles.chooser}>
          <legend className={styles.legend}>{copy.chooser}</legend>
          <div className={styles.tiles}>
            {packages.map((candidate, position) => (
              <label key={candidate.id} className={styles.tile} data-package={candidate.id} data-checked={candidate.id === value || undefined} data-featured={candidate.featured || undefined}>
                <input type="radio" name={group} value={candidate.id} checked={candidate.id === value} onChange={() => onChange(candidate.id)} />
                <span className={styles.glyph}>
                  <PackageGlyph id={candidate.id} />
                </span>
                <span className={styles.tileText}>
                  <span className={styles.tileIndex} aria-hidden="true">
                    {pad(position + 1)}
                  </span>
                  <span className={styles.tileName}>{candidate.name}</span>
                  <span className={styles.tileTagline}>{candidate.tagline[lang]}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="visually-hidden" role="status" aria-live="polite">
            {fill(copy.chosenLive, { name: pkg.name })}
          </p>
        </fieldset>

        <article key={pkg.id} className={styles.stage} data-package={pkg.id} data-featured={pkg.featured || undefined} aria-labelledby={nameId}>
          <header className={styles.head}>
            <span className={styles.bigGlyph}>
              <PackageGlyph id={pkg.id} />
            </span>
            <div className={styles.headText}>
              <h3 id={nameId} className={styles.name}>
                {pkg.name}
              </h3>
              <p className={styles.tagline}>{pkg.tagline[lang]}</p>
              {pkg.featured && (
                <p className={styles.featured}>
                  <strong>{copy.featured}</strong> · {copy.featuredNote}
                </p>
              )}
            </div>
          </header>

          <div className={styles.facts}>
            <section className={styles.fact}>
              <h4 className={styles.label}>{copy.rows.audience}</h4>
              <p>{pkg.audience[lang]}</p>
            </section>
            <section className={styles.fact}>
              <h4 className={styles.label}>{copy.rows.deliverables}</h4>
              <ul className={styles.slashes}>
                {pkg.deliverables.map((item) => (
                  <li key={item.hu}>{item[lang]}</li>
                ))}
              </ul>
            </section>
            <section className={styles.fact}>
              <h4 className={styles.label}>{copy.rows.includes}</h4>
              <ul className={styles.slashes}>
                {pkg.includes.map((item) => (
                  <li key={item.hu}>{item[lang]}</li>
                ))}
              </ul>
            </section>
            <section className={styles.fact}>
              <h4 className={styles.label}>{copy.rows.fits}</h4>
              <ul className={styles.slashes}>
                {pkg.fits.map((item) => (
                  <li key={item.hu}>{item[lang]}</li>
                ))}
              </ul>
            </section>
            <section className={styles.fact}>
              <h4 className={styles.label}>{copy.rows.extras}</h4>
              <ul className={styles.chips}>
                {pkg.extras.map((id) => (
                  <li key={id}>{getAddon(id).name[lang]}</li>
                ))}
              </ul>
            </section>
          </div>

          <footer className={styles.foot}>
            <div className={styles.priceBox}>
              <h4 className={styles.label}>{copy.rows.price}</h4>
              <PriceStatus price={pkg.price} vat={pkg.vat} hint />
              <h4 className={styles.label}>{copy.rows.timeline}</h4>
              <p className={styles.timeline}>{timelineText(pkg.timeline, lang, copy.timeline)}</p>
            </div>
            <Button to={`${SHOP_PATHS.configure}?plan=${pkg.id}`} size="lg" arrow>
              {fill(copy.start, { name: pkg.name })}
            </Button>
          </footer>
        </article>

        <div className={styles.custom}>
          <div>
            <h3 className={styles.customTitle}>{copy.customCard.title}</h3>
            <p className={styles.customText}>{copy.customCard.text}</p>
          </div>
          <Button to={`${SHOP_PATHS.configure}?plan=custom`} variant="secondary" arrow>
            {copy.customCard.cta}
          </Button>
        </div>

        <PackageCompare />
      </Container>
    </Section>
  )
}
