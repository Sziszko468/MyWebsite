import { useEffect, useId, type CSSProperties } from 'react'
import { track } from '../analytics/tracker'
import { FinalCta } from '../components/home/FinalCta'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { Reveal } from '../components/motion/Reveal'
import { Section } from '../components/Section/Section'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { Breadcrumbs } from '../components/shop/Breadcrumbs'
import { Disclosure } from '../components/shop/Disclosure'
import { FaqList } from '../components/shop/FaqList'
import { PackageGlyph } from '../components/shop/icons'
import { PriceStatus } from '../components/shop/PriceStatus'
import { FeatureName, LevelMark } from '../components/shop/tiers/marks'
import { useCatalogGate, useCatalogVersion } from '../content/liveCatalog'
import { getPackage, packages, type PackageId } from '../content/packages'
import { comparison, FEATURE_LEVELS, type FeatureLevel } from '../content/shop/comparison'
import { offeredExtras } from '../content/services/addons'
import { serviceAreas } from '../content/services/areas'
import { faq } from '../content/services/faq'
import { serviceOfNeed } from '../content/services/ids'
import { useI18n } from '../i18n/useI18n'
import { packagePath } from '../shop/packagePaths'
import { SHOP_PATHS, servicePath } from '../shop/paths'
import { timelineText } from '../shop/format'
import { addsOver, levelOf, tierOf } from '../shop/tiers'
import { useShopText } from '../shop/useShopText'
import { fill } from '../utils/format'
import { NotFoundPage } from './NotFoundPage'
import styles from './PackagePage.module.scss'

/**
 * A package's own page: what it is and who it is for, what is included, the features one by one with how the package relates to each,
 * what makes the tier different from the one it builds on, the add-ons it can carry, the services it suits, the price status and the
 * questions. All of it is the catalogue's own data (content/packages.ts, the comparison, the add-ons, the FAQ) the administrator edits;
 * nothing here is a figure, a result or a testimonial. The comparison link returns to the table with this package still selected.
 */
export function PackagePage({ packageId }: { packageId: PackageId }) {
  useCatalogGate()
  useCatalogVersion()
  useEffect(() => track('package_viewed', { plan: packageId }), [packageId])
  const { lang, t } = useI18n()
  const { tiers, landing, common } = useShopText()
  const c = tiers.page
  const ids = {
    who: useId(),
    included: useId(),
    different: useId(),
    features: useId(),
    addons: useId(),
    related: useId(),
    pricing: useId(),
    faq: useId(),
    title: useId(),
  }

  const found = packages.find((candidate) => candidate.id === packageId)
  if (!found) return <NotFoundPage />
  const pkg = getPackage(packageId)
  const index = packages.indexOf(pkg)
  const previous = packages[index - 1]
  const next = packages[index + 1]
  const tier = tierOf(comparison, pkg.id)
  const lower = tier?.buildsOn ? packages.find((candidate) => candidate.id === tier.buildsOn) : undefined
  const adds = addsOver(comparison, pkg.id)
  const extras = offeredExtras(pkg.extras)
  const available = pkg.available !== false
  const services = [...new Set(pkg.needs.map((need) => serviceOfNeed(need)).filter((id): id is NonNullable<typeof id> => id !== null))].flatMap((id) => serviceAreas.filter((area) => area.id === id))
  const byLevel = Object.fromEntries(FEATURE_LEVELS.map((level) => [level, comparison.features.filter((feature) => levelOf(feature, pkg.id) === level)])) as Record<FeatureLevel, typeof comparison.features>
  const start = `${SHOP_PATHS.configure}?plan=${pkg.id}`
  const compareLink = `${SHOP_PATHS.home}?package=${pkg.id}#compare`

  return (
    <div className={styles.page} data-package={pkg.id}>
      <section className={styles.hero} aria-labelledby={ids.title}>
        <Container size="wide" className={styles.heroInner}>
          <Breadcrumbs
            items={[
              { label: t.nav.services, to: SHOP_PATHS.home },
              { label: c.breadcrumbPackages, to: `${SHOP_PATHS.home}#packages` },
              { label: pkg.name },
            ]}
          />
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>{c.eyebrow}</p>
              <h1 id={ids.title} className={styles.title}>
                {pkg.name}
              </h1>
              {tier && <p className={styles.tierLabel}>{tier.label[lang]}</p>}
              <p className={styles.lead}>{pkg.tagline[lang]}</p>
              {pkg.featured && (
                <p className={styles.featured}>
                  <strong>{landing.packages.featured}</strong> · {landing.packages.featuredNote}
                </p>
              )}
              <div className={styles.heroActions}>
                {available ? (
                  <Button to={start} size="lg" arrow>
                    {fill(tiers.compare.start, { name: pkg.name })}
                  </Button>
                ) : (
                  <p className={styles.unavailable}>{tiers.compare.notAvailable}</p>
                )}
                <Button to={compareLink} size="lg" variant="secondary">
                  {c.compareAll}
                </Button>
              </div>
            </div>
            <div className={styles.heroCard}>
              <span className={styles.glyph}>
                <PackageGlyph id={pkg.id} />
              </span>
              <div className={styles.heroPrice}>
                <span className={styles.label}>{landing.packages.rows.price}</span>
                <PriceStatus price={pkg.price} vat={pkg.vat} hint />
              </div>
              {lower ? (
                <p className={styles.builds}>{fill(tiers.compare.builds, { name: lower.name })}</p>
              ) : (
                tier && pkg.id !== packages[0].id && <p className={styles.builds}>{tiers.compare.besideLadder}</p>
              )}
            </div>
          </div>
        </Container>
      </section>

      <Section tone="inverse" labelledBy={ids.who}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.who} index="01" title={c.sections.forWhom} description={pkg.audience[lang]} />
          </Reveal>
          <div className={styles.facts}>
            <section className={styles.fact}>
              <h3 className={styles.label}>{c.fits}</h3>
              <ul className={styles.slashes}>
                {pkg.fits.map((item) => (
                  <li key={item.hu}>{item[lang]}</li>
                ))}
              </ul>
            </section>
            <section className={styles.fact}>
              <h3 className={styles.label}>{c.scope}</h3>
              <p>{pkg.scope[lang]}</p>
              <h3 className={styles.label}>{c.customization}</h3>
              <p>{pkg.customization[lang]}</p>
            </section>
            <section className={styles.fact}>
              <h3 className={styles.label}>{c.support}</h3>
              <p>{pkg.support[lang]}</p>
            </section>
          </div>
        </Container>
      </Section>

      <Section tone="base" labelledBy={ids.included}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.included} index="02" title={c.sections.included} />
          </Reveal>
          <div className={styles.two}>
            <ul className={styles.ticks}>
              {pkg.includes.map((item) => (
                <li key={item.hu}>{item[lang]}</li>
              ))}
            </ul>
            <section aria-label={c.sections.deliverables}>
              <h3 className={styles.label}>{c.sections.deliverables}</h3>
              <ol className={styles.deliverables}>
                {pkg.deliverables.map((item, position) => (
                  <li key={item.hu} style={{ '--n': position } as CSSProperties}>
                    {item[lang]}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </Container>
      </Section>

      <Section tone="inverse" labelledBy={ids.features}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.features} index="03" title={c.sections.features} />
          </Reveal>
          <div className={styles.levels}>
            {FEATURE_LEVELS.filter((level) => byLevel[level].length > 0).map((level) => (
              <Disclosure key={level} title={c.featureGroups[level]} meta={fill(tiers.compare.featuresCount, { count: byLevel[level].length })} defaultOpen={level === 'included'} level={3}>
                <ul className={styles.featureList}>
                  {byLevel[level].map((feature) => (
                    <li key={feature.id} className={styles.featureItem}>
                      <FeatureName name={feature.name} description={feature.description} />
                      <LevelMark level={level} />
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="base" labelledBy={ids.different}>
        <Container size="wide">
          <Reveal>
            <SectionHeading
              id={ids.different}
              index="04"
              title={c.sections.different}
              description={lower ? fill(tiers.compare.adds.over, { name: pkg.name, previous: lower.name }) : fill(pkg.id === packages[0].id ? tiers.compare.adds.start : tiers.compare.adds.beside, { name: pkg.name })}
            />
          </Reveal>
          {adds.length === 0 ? (
            <p>{tiers.compare.adds.none}</p>
          ) : (
            <ul className={styles.adds}>
              {adds.map((feature) => (
                <li key={feature.id} className={styles.addItem}>
                  <FeatureName name={feature.name} description={feature.description} />
                </li>
              ))}
            </ul>
          )}
          <nav className={styles.neighbours} aria-label={c.neighbours}>
            {previous && (
              <Button to={packagePath(previous.id)} variant="secondary">
                {fill(c.previousTier, { name: previous.name })}
              </Button>
            )}
            {next && (
              <Button to={packagePath(next.id)} variant="secondary" arrow>
                {fill(c.nextTier, { name: next.name })}
              </Button>
            )}
          </nav>
        </Container>
      </Section>

      <Section tone="inverse" labelledBy={ids.addons}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.addons} index="05" title={c.sections.addons} description={extras.length > 0 ? c.addonsHint : c.noAddons} />
          </Reveal>
          {extras.length > 0 && (
            <ul className={styles.addons}>
              {extras.map((addon) => (
                <li key={addon.id} className={styles.addon}>
                  <h3 className={styles.addonName}>{addon.name[lang]}</h3>
                  <p>{addon.summary[lang]}</p>
                  <PriceStatus price={addon.price} vat={addon.vat} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>

      <Section tone="base" labelledBy={ids.related}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.related} index="06" title={c.sections.related} />
          </Reveal>
          <ul className={styles.related}>
            {services.map((area) => (
              <li key={area.id}>
                <Button to={servicePath(area.id)} variant="secondary" arrow>
                  {area.name[lang]}
                </Button>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="inverse" labelledBy={ids.pricing}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.pricing} index="07" title={c.sections.pricing} />
          </Reveal>
          <div className={styles.pricing}>
            <PriceStatus price={pkg.price} vat={pkg.vat} hint className={styles.priceBig} />
            {pkg.priceNote && <p>{pkg.priceNote[lang]}</p>}
            <p>
              <span className={styles.label}>{c.timeline}: </span>
              {timelineText(pkg.timeline, lang, landing.packages.timeline)}
            </p>
            <p className={styles.small}>{common.price.quoteHint}</p>
          </div>
        </Container>
      </Section>

      <Section tone="base" labelledBy={ids.faq}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.faq} index="08" title={c.sections.faq} size="stacked" />
          </Reveal>
          <FaqList items={faq} />
        </Container>
      </Section>

      <FinalCta id="start" tone="dark" copy={{ title: c.ctaTitle, text: c.ctaText, cta: fill(tiers.compare.start, { name: pkg.name }) }} action={{ to: start }} />
    </div>
  )
}
