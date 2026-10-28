import { useId } from 'react'
import { offerings, type Offering } from '../../content/offerings'
import { useI18n } from '../../i18n/useI18n'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { BuildArt } from './BuildArt'
import { homeTone } from './rhythm'
import styles from './WhatIBuild.module.scss'

function BuildBlock({ offering, position }: { offering: Offering; position: number }) {
  const { t } = useI18n()
  const ref = usePointerField<HTMLElement>()
  const copy = t.home.build.items[offering.id]

  return (
    <article ref={ref} className={styles.block} data-kind={offering.id}>
      <div className={styles.art} aria-hidden="true">
        <BuildArt kind={offering.id} />
      </div>
      <div className={styles.copy}>
        <span className={styles.number} aria-hidden="true">
          {String(position + 1).padStart(2, '0')}
        </span>
        <h3 className={styles.title}>{copy.title}</h3>
        <p className={styles.text}>{copy.text}</p>
      </div>
    </article>
  )
}

/**
 * The areas of work as four separate blocks, each with its own composition and one drawing of
 * its own. They are descriptions of what is offered; the list comes from content/offerings.ts.
 */
export function WhatIBuild() {
  const { t } = useI18n()
  const titleId = useId()

  return (
    <Section id="build" tone={homeTone('build')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="03" title={t.home.build.title} />
        </Reveal>

        <ul className={styles.grid}>
          {offerings.map((offering, position) => (
            <li key={offering.id} className={styles.item} data-kind={offering.id}>
              <Reveal className={styles.fill} delay={position % 2 ? 100 : 0}>
                <BuildBlock offering={offering} position={position} />
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}
