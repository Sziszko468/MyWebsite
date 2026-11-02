import { useId } from 'react'
import { packages, type ServicePackage } from '../../content/packages'
import { useI18n } from '../../i18n/useI18n'
import { useTheme } from '../../theme/useTheme'
import { cx } from '../../utils/cx'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { ServiceCard } from '../ServiceCard/ServiceCard'
import { homeTone } from './rhythm'
import styles from './ServicePackages.module.scss'

function Package({ pkg, position }: { pkg: ServicePackage; position: number }) {
  const { lang, t } = useI18n()
  const { theme } = useTheme()
  const ref = usePointerField<HTMLDivElement>()

  return (
    // The featured package keeps the page's own theme inside a section that is the opposite one,
    // so it stands out from its neighbours in both themes.
    <div ref={ref} className={cx(styles.slot, pkg.featured && styles.featured)} data-theme={pkg.featured ? theme : undefined}>
      <ServiceCard
        className={styles.card}
        index={String(position + 1).padStart(2, '0')}
        name={pkg.name}
        description={pkg.tagline[lang]}
        price={pkg.price}
        vat={pkg.vat}
        quoteRequired={pkg.quoteRequired}
        priceNote={pkg.priceNote?.[lang]}
        featured={pkg.featured}
        action={
          // The packages are presented on the services page; the one chosen here arrives selected there.
          <Button to={`/services?package=${pkg.id}#packages`} size="sm" variant={pkg.featured ? 'primary' : 'secondary'} arrow>
            {t.home.packages.cta}
            <span className="visually-hidden"> — {pkg.name}</span>
          </Button>
        }
      >
        <div className={styles.facts}>
          <div>
            <p className={styles.label}>{t.home.packages.audienceLabel}</p>
            <p>{pkg.audience[lang]}</p>
          </div>
          <div>
            <p className={styles.label}>{t.home.packages.includesLabel}</p>
            <ul className={styles.includes}>
              {pkg.includes.map((item) => (
                <li key={item.hu}>{item[lang]}</li>
              ))}
            </ul>
          </div>
        </div>
      </ServiceCard>
    </div>
  )
}

/**
 * The collaboration packages, with a clear order of weight: Build is the large dark card, Launch
 * and Grow flank it, Care is a wider card with its parts side by side. Words and prices come from
 * content/packages.ts, the same source as the services page, and a price reads "request a custom
 * quote" until a real figure is set. The call to action opens the services page at the packages,
 * with the package already chosen.
 */
export function ServicePackages() {
  const { t } = useI18n()
  const titleId = useId()

  return (
    <Section id="services" tone={homeTone('services')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="06" title={t.home.packages.title} description={t.home.packages.intro} />
        </Reveal>

        <ul className={styles.grid}>
          {packages.map((pkg, position) => (
            <li key={pkg.id} className={styles.item} data-package={pkg.id}>
              <Reveal className={styles.fill} delay={position * 80}>
                <Package pkg={pkg} position={position} />
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}
