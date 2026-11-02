import { useId } from 'react'
import { projects } from '../../content/projects'
import { faq } from '../../content/services/faq'
import { afterInquirySteps, collaboration, processNote, processSteps } from '../../content/services/process'
import { useI18n } from '../../i18n/useI18n'
import { SHOP_PATHS } from '../../shop/paths'
import { useShopText } from '../../shop/useShopText'
import { pad } from '../../utils/format'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { Disclosure } from './Disclosure'
import { FaqList } from './FaqList'
import { ProjectRef } from './ProjectRef'
import { shopTone } from './rhythm'
import styles from './Bands.module.scss'

/** "Not sure what you need?": the way into the request builder, with its six steps in view. */
export function ConfigureBand() {
  const { landing, configurator } = useShopText()
  const copy = landing.configureBand
  const titleId = useId()
  const steps = Object.values(configurator.steps)

  return (
    <Section id="configure" tone={shopTone('configure')} slant labelledBy={titleId}>
      <Container size="wide">
        <div className={styles.configure}>
          <Reveal className={styles.configureText}>
            <h2 id={titleId} className={styles.configureTitle}>
              {copy.title}
            </h2>
            <p className={styles.lead}>{copy.text}</p>
            <div className={styles.actions}>
              <Button to={SHOP_PATHS.configure} size="lg" arrow>
                {copy.cta}
              </Button>
              <Button to={`${SHOP_PATHS.configure}?plan=custom`} size="lg" variant="secondary">
                {copy.custom}
              </Button>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <ol className={styles.stepsPreview} aria-label={copy.steps}>
              {steps.map((label, position) => (
                <li key={label}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {pad(position + 1)}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}

/** How a project runs, what happens after an inquiry, and how we communicate. */
export function ProcessBand() {
  const { lang } = useI18n()
  const { landing } = useShopText()
  const copy = landing.process
  const titleId = useId()

  return (
    <Section id="process" tone={shopTone('process')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="04" title={copy.title} description={copy.intro} />
        </Reveal>

        <ol className={styles.steps}>
          {processSteps.map((step, position) => (
            <li key={step.title.hu} className={styles.step}>
              <Reveal delay={position * 50}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {pad(position + 1)}
                </span>
                <h3 className={styles.stepTitle}>{step.title[lang]}</h3>
                <p className={styles.stepText}>{step.text[lang]}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <p className={styles.note}>{processNote[lang]}</p>

        <div className={styles.twoUp}>
          <Disclosure title={copy.afterTitle} level={3} defaultOpen>
            <p className={styles.small}>{copy.afterIntro}</p>
            <ol className={styles.after}>
              {afterInquirySteps.map((step, position) => (
                <li key={step.title.hu}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {pad(position + 1)}
                  </span>
                  <span>
                    <strong>{step.title[lang]}</strong>
                    <span className={styles.stepText}>{step.text[lang]}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Disclosure>
          <Disclosure title={copy.collabTitle} level={3}>
            <ul className={styles.collab}>
              {collaboration.map((item) => (
                <li key={item.title.hu}>
                  <strong>{item.title[lang]}</strong>
                  <span className={styles.stepText}>{item.text[lang]}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      </Container>
    </Section>
  )
}

/** What support there is, in three separate things that are not mixed up. */
export function SupportBand() {
  const { landing } = useShopText()
  const copy = landing.support
  const titleId = useId()

  return (
    <Section id="support" tone={shopTone('support')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="05" title={copy.title} description={copy.intro} />
        </Reveal>
        <ul className={styles.cards}>
          {copy.items.map((item, position) => (
            <li key={item.title} className={styles.card}>
              <Reveal delay={position * 60}>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.stepText}>{item.text}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}

/** Real projects that show the work, each with its honest status. Only those with a details page. */
export function WorkBand() {
  const { landing } = useShopText()
  const copy = landing.work
  const titleId = useId()
  const shown = projects.filter((project) => project.detailPath !== null)

  return (
    <Section id="work" tone={shopTone('work')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="06" title={copy.title} description={copy.intro} />
        </Reveal>
        <ul className={styles.work}>
          {shown.map((project, position) => (
            <li key={project.id}>
              <Reveal delay={position * 60}>
                <ProjectRef projectId={project.id} />
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}

export function FaqBand() {
  const { landing } = useShopText()
  const copy = landing.faq
  const titleId = useId()

  return (
    <Section id="faq" tone={shopTone('faq')} slant labelledBy={titleId}>
      <Container size="wide">
        <div className={styles.faq}>
          <Reveal className={styles.faqLead}>
            <SectionHeading id={titleId} index="07" title={copy.title} description={copy.intro} size="stacked" />
          </Reveal>
          <FaqList items={faq} />
        </div>
      </Container>
    </Section>
  )
}
