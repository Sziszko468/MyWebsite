import { useId, useMemo, useState } from 'react'
import { getPackage, packages } from '../content/packages'
import { addonsFor, getAddon, type ExtraId } from '../content/services/addons'
import { serviceAreas } from '../content/services/areas'
import { getServiceDetail } from '../content/services/detail'
import { faq } from '../content/services/faq'
import type { PlanId, ServiceId } from '../content/services/ids'
import { processSteps } from '../content/services/process'
import { FinalCta } from '../components/home/FinalCta'
import { BuildArt } from '../components/home/BuildArt'
import { Breadcrumbs } from '../components/shop/Breadcrumbs'
import { Button } from '../components/Button/Button'
import { ChoiceCard, ChoiceFieldset } from '../components/shop/Choice'
import { Container } from '../components/Container/Container'
import { FaqList } from '../components/shop/FaqList'
import { PriceStatus } from '../components/shop/PriceStatus'
import { ProjectRef } from '../components/shop/ProjectRef'
import { Reveal } from '../components/motion/Reveal'
import { Section } from '../components/Section/Section'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { SERVICE_ART } from '../components/shop/ServiceArt'
import { StickyCta } from '../components/shop/StickyCta'
import { usePointerField } from '../components/motion/usePointerField'
import { useI18n } from '../i18n/useI18n'
import { normalizeExtras, findLine } from '../shop/cart'
import { cartActions, cartStore } from '../shop/cartStore'
import { startStep, suggestedPlans } from '../shop/flow'
import { useCart } from '../shop/hooks'
import { inquiryActions } from '../shop/inquiryStore'
import { SHOP_PATHS } from '../shop/paths'
import { useShopText } from '../shop/useShopText'
import { cx } from '../utils/cx'
import { fill, pad } from '../utils/format'
import styles from './ServiceDetailPage.module.scss'

const SECTIONS = ['overview', 'get', 'features', 'audience', 'how', 'addons', 'work', 'faq', 'price'] as const
/** The bands that hide the phone's sticky bar while they are on screen: it would sit on top of what it points to. */
const STICKY_HIDE_ON: readonly string[] = ['price', 'final']
const PLAN_ORDER: readonly PlanId[] = [...packages.map((pkg) => pkg.id), 'custom']

/**
 * A service's product page. It follows the brief's eleven sections: hero, overview, what you get,
 * key features, who it is for, how it works, available add-ons, related projects, questions,
 * pricing or custom quote and the closing call. The page keeps a draft of the visitor's choices
 * (package and add-ons), starting from what the cart already holds for this service; "Add to cart"
 * writes it to the cart, and "Request a quote" writes it and opens the request builder.
 * Nothing on the page is a result, a testimonial, a guarantee or a price that is not in the content.
 */
export function ServiceDetailPage({ serviceId }: { serviceId: ServiceId }) {
  const { lang, t } = useI18n()
  const { detail, common, landing } = useShopText()
  const area = serviceAreas.find((candidate) => candidate.id === serviceId)!
  const info = getServiceDetail(serviceId)
  const cart = useCart()
  const line = findLine(cart, serviceId)
  const name = area.name[lang]
  const heroRef = usePointerField<HTMLElement>()

  const [plan, setPlan] = useState<PlanId | null>(line?.plan ?? null)
  const [extras, setExtras] = useState<readonly ExtraId[]>(line?.extras ?? [])
  const addons = addonsFor(serviceId)
  const suggested = suggestedPlans(serviceId)
  const inCart = line !== undefined
  const dirty = inCart && (line.plan !== plan || line.extras.join() !== normalizeExtras(serviceId, extras).join())

  const titleIds = {
    overview: useId(),
    get: useId(),
    features: useId(),
    audience: useId(),
    how: useId(),
    addons: useId(),
    work: useId(),
    faq: useId(),
    price: useId(),
  }

  const questions = useMemo(
    () => [...info.faq.shared.flatMap((id) => faq.filter((item) => item.id === id)), ...info.faq.own],
    [info],
  )
  const orderedPlans = useMemo(
    () => [...PLAN_ORDER].sort((a, b) => Number(suggested.includes(b)) - Number(suggested.includes(a))),
    [suggested],
  )

  const commit = () => cartActions.add(serviceId, { plan, extras })
  const requestQuote = () => {
    commit()
    inquiryActions.setStep(startStep(cartStore.get(), 'service'))
  }
  const toggleExtra = (id: ExtraId, on: boolean) =>
    setExtras((current) => normalizeExtras(serviceId, on ? [...current, id] : current.filter((item) => item !== id)))

  const section = (id: (typeof SECTIONS)[number]) => detail.sections[id]
  const planName = (id: PlanId) => (id === 'custom' ? common.plans.custom.name : getPackage(id).name)
  const planText = (id: PlanId) => (id === 'custom' ? common.plans.custom.tagline : getPackage(id).tagline[lang])

  return (
    <>
      <section ref={heroRef} id="hero" className={styles.hero} aria-labelledby="service-title">
        <Container size="wide" className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <Breadcrumbs items={[{ label: t.nav.services, to: SHOP_PATHS.home }, { label: name }]} />
            <p className={styles.eyebrow}>{detail.eyebrow}</p>
            <h1 id="service-title" className={styles.title}>
              {name}
            </h1>
            <p className={styles.tagline}>{info.tagline[lang]}</p>
            <p className={styles.lead}>{area.summary[lang]}</p>
            <ul className={styles.glance}>
              {info.glance.map((fact) => (
                <li key={fact.hu}>{fact[lang]}</li>
              ))}
              <li>
                <PriceStatus price={{ kind: 'quote' }} />
              </li>
            </ul>
            <div className={styles.actions}>
              <Button to={SHOP_PATHS.configure} size="lg" arrow onClick={requestQuote}>
                {common.action.requestQuote}
              </Button>
              {inCart && !dirty ? (
                <Button to={SHOP_PATHS.cart} variant="secondary" size="lg">
                  {common.action.inCart}
                  <span className="visually-hidden"> — {common.action.viewCart}</span>
                </Button>
              ) : (
                <Button variant="secondary" size="lg" onClick={commit}>
                  {dirty ? common.action.updateCart : common.action.addToCart}
                </Button>
              )}
            </div>
          </div>
          <div className={styles.heroArt} aria-hidden="true">
            <BuildArt kind={SERVICE_ART[serviceId]} />
          </div>
        </Container>

        <Container size="wide">
          <nav aria-label={detail.pageIndex} className={styles.index}>
            <ol>
              {SECTIONS.map((id) => (
                <li key={id}>
                  <a href={`#${id}`}>{detail.short[id]}</a>
                </li>
              ))}
            </ol>
          </nav>
        </Container>
      </section>

      <Section id="overview" tone="inverse" slant labelledBy={titleIds.overview} className={styles.tight}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={titleIds.overview} index="01" title={section('overview')} description={info.overview[lang]} />
          </Reveal>
          <div className={styles.twoCol}>
            <div>
              <h3 className={styles.subhead}>{detail.overview.benefits}</h3>
              <ul className={styles.benefits}>
                {info.benefits.map((benefit) => (
                  <li key={benefit.title.hu}>
                    <Reveal>
                      <h4>{benefit.title[lang]}</h4>
                      <p>{benefit.text[lang]}</p>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className={styles.subhead}>{detail.overview.useCases}</h3>
              <ul className={styles.slashes}>
                {info.useCases.map((useCase) => (
                  <li key={useCase.hu}>{useCase[lang]}</li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      <Section id="get" tone="base" slant labelledBy={titleIds.get} className={styles.tight}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={titleIds.get} index="02" title={section('get')} description={detail.get.intro} />
          </Reveal>
          <ul className={styles.checks}>
            {info.deliverables.map((item) => (
              <li key={item.hu}>
                <span className={styles.tick} aria-hidden="true">
                  ✓
                </span>
                {item[lang]}
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section id="features" tone="inverse" slant labelledBy={titleIds.features} className={styles.tight}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={titleIds.features} index="03" title={section('features')} description={detail.features.intro} />
          </Reveal>
          <ol className={styles.features}>
            {area.features.map((feature, position) => (
              <li key={feature.hu}>
                <Reveal delay={position * 40}>
                  <span className={styles.number} aria-hidden="true">
                    {pad(position + 1)}
                  </span>
                  <p>{feature[lang]}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section id="audience" tone="base" slant labelledBy={titleIds.audience} className={styles.tight}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={titleIds.audience} index="04" title={section('audience')} />
          </Reveal>
          <p className={styles.statement}>{info.audience[lang]}</p>
          <div className={styles.suited}>
            <h3 className={styles.subhead}>{landing.discovery.card.suggested}</h3>
            <ul className={styles.chips}>
              {info.packages.map((id) => (
                <li key={id}>{getPackage(id).name}</li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      <Section id="how" tone="inverse" slant labelledBy={titleIds.how} className={styles.tight}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={titleIds.how} index="05" title={section('how')} description={detail.how.intro} />
          </Reveal>
          <ol className={styles.steps}>
            {processSteps.map((step, position) => (
              <li key={step.title.hu} data-special={position === 1 || undefined}>
                <span className={styles.number} aria-hidden="true">
                  {pad(position + 1)}
                </span>
                <h3>{step.title[lang]}</h3>
                <p>{step.text[lang]}</p>
                {position === 1 && (
                  <p className={styles.stepNote}>
                    <strong>{detail.how.thisService}</strong>
                    {info.howNote[lang]}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section id="addons" tone="base" slant labelledBy={titleIds.addons} className={styles.tight}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={titleIds.addons} index="06" title={section('addons')} description={detail.addons.intro} />
          </Reveal>
          {addons.length === 0 ? (
            <p className={styles.muted}>{detail.addons.none}</p>
          ) : (
            <ChoiceFieldset legend={fill(detail.addons.selected, { count: extras.length })} columns={2} className={styles.addons}>
              {addons.map((addon) => (
                <ChoiceCard
                  key={addon.id}
                  type="checkbox"
                  checked={extras.includes(addon.id)}
                  onChange={(on) => toggleExtra(addon.id, on)}
                  title={addon.name[lang]}
                  text={addon.summary[lang]}
                  meta={<PriceStatus price={addon.price} vat={addon.vat} />}
                />
              ))}
            </ChoiceFieldset>
          )}
        </Container>
      </Section>

      <Section id="work" tone="inverse" slant labelledBy={titleIds.work} className={styles.tight}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={titleIds.work} index="07" title={section('work')} description={detail.work.intro} />
          </Reveal>
          {info.projects.length === 0 ? (
            <p className={styles.muted}>{detail.work.none}</p>
          ) : (
            <ul className={styles.work}>
              {info.projects.map((item) => (
                <li key={item.project}>
                  <ProjectRef projectId={item.project} note={item.note[lang]} noteLabel={detail.work.look} linkLabel={detail.work.open} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>

      <Section id="faq" tone="base" slant labelledBy={titleIds.faq} className={styles.tight}>
        <Container size="wide">
          <div className={styles.faq}>
            <Reveal className={styles.faqLead}>
              <SectionHeading id={titleIds.faq} index="08" title={section('faq')} description={detail.faq.intro} size="stacked" />
            </Reveal>
            <FaqList items={questions} />
          </div>
        </Container>
      </Section>

      <Section id="price" tone="inverse" slant labelledBy={titleIds.price} className={styles.tight}>
        <Container size="wide">
          <div className={styles.priceLayout}>
            <Reveal className={styles.priceLead}>
              <SectionHeading id={titleIds.price} index="09" title={section('price')} description={detail.price.intro} size="stacked" />
            </Reveal>

            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>{detail.price.configTitle}</h3>
              <ChoiceFieldset legend={detail.price.packageLegend} columns={2}>
                {orderedPlans.map((id) => (
                  <ChoiceCard
                    key={id}
                    type="radio"
                    name="service-plan"
                    value={id}
                    compact
                    checked={plan === id}
                    onChange={() => setPlan(id)}
                    title={planName(id)}
                    text={planText(id)}
                    tag={suggested.includes(id) ? detail.price.suggested : undefined}
                  />
                ))}
              </ChoiceFieldset>

              <dl className={styles.summary} aria-label={detail.price.summaryTitle}>
                <div>
                  <dt>{detail.price.summaryPackage}</dt>
                  <dd>{plan ? planName(plan) : detail.price.noPackage}</dd>
                </div>
                <div>
                  <dt>{detail.price.summaryAddons}</dt>
                  <dd>
                    {extras.length > 0 ? extras.map((id) => getAddon(id).name[lang]).join(', ') : detail.price.noAddons}
                  </dd>
                </div>
                <div>
                  <dt>{detail.price.summaryPrice}</dt>
                  <dd>
                    <PriceStatus price={plan && plan !== 'custom' ? getPackage(plan).price : { kind: 'quote' }} vat={plan && plan !== 'custom' ? getPackage(plan).vat : 'unspecified'} hint />
                  </dd>
                </div>
              </dl>

              <div className={cx(styles.actions, styles.panelActions)}>
                <Button to={SHOP_PATHS.configure} size="lg" arrow onClick={requestQuote}>
                  {common.action.requestQuote}
                </Button>
                {inCart && !dirty ? (
                  <Button to={SHOP_PATHS.cart} variant="secondary" size="lg">
                    {common.action.viewCart}
                  </Button>
                ) : (
                  <Button variant="secondary" size="lg" onClick={commit}>
                    {inCart ? common.action.updateCart : common.action.addToCart}
                  </Button>
                )}
              </div>
              <p className={styles.panelNote} role="status" aria-live="polite">
                {inCart && !dirty ? `${detail.price.added}. ${detail.price.note}` : inCart ? detail.price.changed : detail.price.note}
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <FinalCta
        id="final"
        tone="dark"
        copy={{ title: detail.final.title, text: detail.final.text, cta: detail.final.cta }}
        action={{ to: SHOP_PATHS.configure }}
      />

      <StickyCta
        label={fill(detail.sticky.bar, { name })}
        action={detail.sticky.label}
        to={SHOP_PATHS.configure}
        onActivate={requestQuote}
        after="hero"
        hideOn={STICKY_HIDE_ON}
      />
    </>
  )
}
