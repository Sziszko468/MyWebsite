import { useEffect, useId, useRef } from 'react'
import { track } from '../../../analytics/tracker'
import { useCatalogVersion } from '../../../content/liveCatalog'
import type { PackageId } from '../../../content/packages'
import { SHOP_PATHS } from '../../../shop/paths'
import { useMinWidth } from '../../../shop/useMinWidth'
import { useShopText } from '../../../shop/useShopText'
import { Button } from '../../Button/Button'
import { Container } from '../../Container/Container'
import { Reveal } from '../../motion/Reveal'
import { Section } from '../../Section/Section'
import { SectionHeading } from '../../SectionHeading/SectionHeading'
import { PackageFinder } from '../finder/PackageFinder'
import { shopTone } from '../rhythm'
import { TierMobile } from './TierMobile'
import { TierTable } from './TierTable'
import styles from './Tiers.module.scss'

/** Where a table has room for four columns and the feature names; below it a package switcher is drawn instead (TierMobile.tsx). */
const TABLE_MIN_REM = 48

interface TiersProps {
  value: PackageId
  onChange: (id: PackageId) => void
}

/**
 * "Packages and plans": the four packages as a progression (Launch, Grow, Build, with Care beside them) and the matrix of what each
 * has. A table from `md`, a package switcher on a phone, one selection that both share, and under them the way to describe a project
 * that fits none of them.
 */
export function Tiers({ value, onChange }: TiersProps) {
  useCatalogVersion()
  const { landing, tiers } = useShopText()
  const titleId = useId()
  const wide = useMinWidth(TABLE_MIN_REM)
  const copy = landing.packages
  const compareRef = useRef<HTMLDivElement>(null)

  // "The comparison was opened": it came into view, once per visit to the page. An id, never anything the visitor typed.
  useEffect(() => {
    const element = compareRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          track('comparison_viewed', {})
          observer.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /** The finder's "Choose": select the package in the comparison and bring the comparison into view. Nothing is sent. */
  const choose = (id: PackageId) => {
    onChange(id)
    compareRef.current?.scrollIntoView({ block: 'start' })
  }

  return (
    <Section id="packages" tone={shopTone('packages')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="02" title={tiers.compare.title} description={tiers.compare.intro} />
        </Reveal>

        <div className={styles.tiers} data-layout={wide ? 'table' : 'phone'} id="compare" ref={compareRef}>
          {wide ? <TierTable value={value} onChange={onChange} /> : <TierMobile value={value} onChange={onChange} />}
        </div>

        <PackageFinder value={value} onChoose={choose} />

        <div className={styles.custom}>
          <div>
            <h3 className={styles.customTitle}>{copy.customCard.title}</h3>
            <p className={styles.customText}>{copy.customCard.text}</p>
          </div>
          <Button to={`${SHOP_PATHS.configure}?plan=custom`} variant="secondary" arrow>
            {copy.customCard.cta}
          </Button>
        </div>
      </Container>
    </Section>
  )
}
