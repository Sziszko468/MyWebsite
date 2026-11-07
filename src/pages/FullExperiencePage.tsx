import { useId } from 'react'
import { FinalCta } from '../components/home/FinalCta'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { Reveal } from '../components/motion/Reveal'
import { SpeedLines } from '../components/motion/SpeedLines'
import { Section } from '../components/Section/Section'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { Breadcrumbs } from '../components/shop/Breadcrumbs'
import { Headline } from '../components/shop/experience/Headline'
import { Disclosure } from '../components/shop/Disclosure'
import { useCatalogGate, useCatalogVersion } from '../content/liveCatalog'
import { fullExperience as offer } from '../content/shop/fullExperience'
import { useI18n } from '../i18n/useI18n'
import { SHOP_PATHS } from '../shop/paths'
import { useShopText } from '../shop/useShopText'
import { fill, pad } from '../utils/format'
import styles from './FullExperiencePage.module.scss'

/**
 * FULL EXPERIENCE: the flagship offer's own page. A dark, large-type opening that says what it is (the administrator's words), the
 * development stages it can cover, the optional components, how it works, why it has no price, the questions and the way to start.
 * It is told apart from the packages by its treatment (a dark opening in either theme, display type, Racing Red) and by what it
 * leaves out: there is no price, no "package" and no "most popular". The way in is the configurator, which asks and sends a request
 * for a tailored proposal.
 */
export function FullExperiencePage() {
  useCatalogGate()
  useCatalogVersion()
  const { lang, t } = useI18n()
  const { experience } = useShopText()
  const c = experience.page
  const ids = { title: useId(), stages: useId(), components: useId(), how: useId(), custom: useId(), faq: useId() }

  return (
    <div className={styles.page}>
      <section className={styles.hero} data-theme="dark" aria-labelledby={ids.title}>
        <div className={styles.glow} aria-hidden="true" />
        <SpeedLines className={styles.lines} seed={7} />
        <Container size="wide" className={styles.heroInner}>
          <Breadcrumbs items={[{ label: t.nav.services, to: SHOP_PATHS.home }, { label: offer.hero.eyebrow[lang] }]} />
          <p className={styles.eyebrow}>{offer.hero.eyebrow[lang]}</p>
          <h1 id={ids.title} className={styles.title}>
            <Headline text={offer.hero.headline[lang]} />
          </h1>
          <p className={styles.lead}>{offer.hero.supporting[lang]}</p>
          <div className={styles.actions}>
            <Button to={SHOP_PATHS.fullExperienceStart} size="lg" arrow>
              {offer.hero.primaryCta[lang]}
            </Button>
            <Button href="#included" size="lg" variant="secondary">
              {offer.hero.secondaryCta[lang]}
            </Button>
          </div>
          <p className={styles.price}>
            <strong>{offer.priceLabel[lang]}</strong> · {experience.band.note}
          </p>
        </Container>
      </section>

      <Section id="included" tone="inverse" labelledBy={ids.stages}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.stages} index="01" title={c.includedTitle} description={c.includedIntro} />
          </Reveal>
          <ol className={styles.stages}>
            {offer.stages.map((stage, position) => (
              <li key={stage.id} className={styles.stage}>
                <span className={styles.stageNumber} aria-hidden="true">
                  {pad(position + 1)}
                </span>
                <h3 className={styles.stageTitle}>
                  <span className="visually-hidden">{fill(c.stage, { n: position + 1 })}: </span>
                  {stage.title[lang]}
                </h3>
                {stage.text[lang] && <p className={styles.stageText}>{stage.text[lang]}</p>}
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section tone="base" labelledBy={ids.components}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.components} index="02" title={c.componentsTitle} description={c.componentsIntro} />
          </Reveal>
          <ul className={styles.components}>
            {offer.components.map((component) => (
              <li key={component.id} className={styles.component}>
                <h3 className={styles.componentTitle}>{component.title[lang]}</h3>
                {component.text[lang] && <p>{component.text[lang]}</p>}
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="inverse" labelledBy={ids.how}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.how} index="03" title={c.howTitle} />
          </Reveal>
          <ol className={styles.how}>
            {c.how.map((step, position) => (
              <li key={step} className={styles.howStep}>
                <span className={styles.howNumber} aria-hidden="true">
                  {pad(position + 1)}
                </span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <div className={styles.custom}>
            <div>
              <h3 id={ids.custom} className={styles.customTitle}>
                {c.customTitle}
              </h3>
              <p>{c.customText}</p>
            </div>
            <Button to={SHOP_PATHS.fullExperienceStart} size="lg" arrow aria-describedby={ids.custom}>
              {offer.hero.primaryCta[lang]}
            </Button>
          </div>
        </Container>
      </Section>

      <Section tone="base" labelledBy={ids.faq}>
        <Container size="wide">
          <Reveal>
            <SectionHeading id={ids.faq} index="04" title={c.faqTitle} size="stacked" />
          </Reveal>
          <ul className={styles.faq}>
            {offer.faq.map((item) => (
              <li key={item.id}>
                <Disclosure title={item.question[lang]} level={3}>
                  <p className={styles.answer}>{item.answer[lang]}</p>
                </Disclosure>
              </li>
            ))}
          </ul>
          <p className={styles.alsoPackages}>
            {c.alsoPackages}{' '}
            <Button to={`${SHOP_PATHS.home}#packages`} variant="text">
              {c.seePackages}
            </Button>
          </p>
        </Container>
      </Section>

      <FinalCta id="start" tone="dark" copy={{ title: c.finalTitle, text: c.finalText, cta: offer.hero.primaryCta[lang] }} action={{ to: SHOP_PATHS.fullExperienceStart }} />
    </div>
  )
}
