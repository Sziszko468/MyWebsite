import { useId } from 'react'
import { serviceAreas, type ServiceArea } from '../../content/services/areas'
import { projects } from '../../content/projects'
import { useI18n } from '../../i18n/useI18n'
import type { ProjectTypeId } from '../../quote/types'
import { pad } from '../../utils/format'
import { Badge } from '../Badge/Badge'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { BuildArt, type ArtKind } from '../home/BuildArt'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { servicesTone } from './rhythm'
import styles from './ServiceAreas.module.scss'

/** Which drawing each area gets: the home page's own, plus one for implementing a design. */
const ART: Record<ServiceArea['id'], ArtKind> = {
  website: 'websites',
  webapp: 'webapps',
  ui: 'ui',
  integrations: 'integrations',
}

function Area({ area, position, onChoose }: { area: ServiceArea; position: number; onChoose: (type: ProjectTypeId) => void }) {
  const { lang, t } = useI18n()
  const copy = t.servicesPage.areas
  const ref = usePointerField<HTMLElement>()
  const example = area.example ? projects.find((project) => project.id === area.example?.project) : undefined

  return (
    <article ref={ref} className={styles.area} data-area={area.id} data-side={position % 2 ? 'right' : 'left'}>
      <div className={styles.art} aria-hidden="true">
        <BuildArt kind={ART[area.id]} />
      </div>

      <div className={styles.copy}>
        <span className={styles.number} aria-hidden="true">
          {pad(position + 1)}
        </span>
        <h3 className={styles.name}>{area.name[lang]}</h3>
        <p className={styles.summary}>{area.summary[lang]}</p>

        <div className={styles.features}>
          <p className={styles.label}>{copy.featuresLabel}</p>
          <ul>
            {area.features.map((feature) => (
              <li key={feature.hu}>{feature[lang]}</li>
            ))}
          </ul>
        </div>

        {area.example && example && (
          <div className={styles.example}>
            <p className={styles.label}>{copy.exampleLabel}</p>
            <p className={styles.exampleLine}>
              {example.detailPath ? (
                <LocalizedLink to={example.detailPath} className={styles.exampleLink}>
                  {example.name}
                </LocalizedLink>
              ) : (
                <strong>{example.name}</strong>
              )}
              <Badge status={example.status} />
            </p>
            <p className={styles.exampleNote}>{area.example.note[lang]}</p>
          </div>
        )}

        <div className={styles.actions}>
          {/* The button chooses this kind of project in the form, then the link takes the visitor to it. */}
          <Button href="#quote" arrow onClick={() => onChoose(area.id)}>
            {copy.cta}
            <span className="visually-hidden"> — {area.name[lang]}</span>
          </Button>
        </div>
      </div>
    </article>
  )
}

/**
 * The four service areas as separate, numbered blocks: a drawing and the words side by side, the
 * drawing alternating left and right. Each block lists what it can include, points to a project
 * of the portfolio that shows the work (only where one does), and its button selects that kind
 * of project in the quote form and jumps to it.
 */
export function ServiceAreas({ onChoose }: { onChoose: (type: ProjectTypeId) => void }) {
  const { t } = useI18n()
  const titleId = useId()

  return (
    <Section id="areas" tone={servicesTone('areas')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="01" title={t.servicesPage.areas.title} description={t.servicesPage.areas.intro} />
        </Reveal>

        <ul className={styles.list}>
          {serviceAreas.map((area, position) => (
            <li key={area.id}>
              <Reveal>
                <Area area={area} position={position} onChoose={onChoose} />
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}
