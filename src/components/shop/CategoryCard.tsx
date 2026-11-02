import { useId } from 'react'
import { projects } from '../../content/projects'
import { getPackage } from '../../content/packages'
import type { ServiceArea } from '../../content/services/areas'
import { getServiceDetail } from '../../content/services/detail'
import { useI18n } from '../../i18n/useI18n'
import { servicePath } from '../../shop/paths'
import { useShopText } from '../../shop/useShopText'
import { pad } from '../../utils/format'
import { Badge } from '../Badge/Badge'
import { Button } from '../Button/Button'
import { BuildArt } from '../home/BuildArt'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { usePointerField } from '../motion/usePointerField'
import { AddToCartButton } from './AddToCartButton'
import { Disclosure } from './Disclosure'
import { SERVICE_ART } from './ServiceArt'
import styles from './CategoryCard.module.scss'

/**
 * One service as a card that can be scanned in seconds: its drawing, name and one-line promise,
 * three benefits, the typical projects, the packages it usually starts with, and what can be
 * included behind a disclosure so a phone screen is not a wall of text. Two buttons: open the
 * service's page, or put it in the cart.
 */
export function CategoryCard({ area, position }: { area: ServiceArea; position: number }) {
  const { lang } = useI18n()
  const { landing, common } = useShopText()
  const copy = landing.discovery.card
  const detail = getServiceDetail(area.id)
  const ref = usePointerField<HTMLElement>()
  const titleId = useId()
  const example = area.example ? projects.find((project) => project.id === area.example?.project) : undefined
  const name = area.name[lang]

  return (
    <article ref={ref} className={styles.card} data-service={area.id} aria-labelledby={titleId}>
      <div className={styles.art} aria-hidden="true">
        <BuildArt kind={SERVICE_ART[area.id]} />
      </div>

      <div className={styles.body}>
        <p className={styles.number} aria-hidden="true">
          {pad(position + 1)}
        </p>
        <h3 id={titleId} className={styles.name}>
          <LocalizedLink to={servicePath(area.id)} className={styles.nameLink}>
            {name}
          </LocalizedLink>
        </h3>
        <p className={styles.tagline}>{detail.tagline[lang]}</p>

        <div className={styles.group}>
          <p className={styles.label}>{copy.benefits}</p>
          <ul className={styles.chips}>
            {detail.benefits.map((benefit) => (
              <li key={benefit.title.hu}>{benefit.title[lang]}</li>
            ))}
          </ul>
        </div>

        <div className={styles.group}>
          <p className={styles.label}>{copy.useCases}</p>
          <ul className={styles.plain}>
            {detail.useCases.slice(0, 2).map((useCase) => (
              <li key={useCase.hu}>{useCase[lang]}</li>
            ))}
          </ul>
        </div>

        <div className={styles.group}>
          <p className={styles.label}>{copy.suggested}</p>
          <ul className={styles.chips}>
            {detail.packages.map((id) => (
              <li key={id}>{getPackage(id).name}</li>
            ))}
          </ul>
        </div>

        <Disclosure title={copy.included} level={4} className={styles.included}>
          <ul className={styles.slashes}>
            {area.features.map((feature) => (
              <li key={feature.hu}>{feature[lang]}</li>
            ))}
          </ul>
          {example ? (
            <p className={styles.example}>
              <span className={styles.label}>{copy.example}</span>
              <span className={styles.exampleLine}>
                {example.detailPath ? (
                  <LocalizedLink to={example.detailPath} className={styles.exampleLink}>
                    {example.name}
                  </LocalizedLink>
                ) : (
                  <strong>{example.name}</strong>
                )}
                <Badge status={example.status} />
              </span>
            </p>
          ) : (
            <p className={styles.noExample}>{copy.noExample}</p>
          )}
        </Disclosure>

        <div className={styles.actions}>
          <Button to={servicePath(area.id)} arrow>
            {common.action.viewService}
            <span className="visually-hidden"> — {name}</span>
          </Button>
          <AddToCartButton need={area.id} name={name} />
        </div>
      </div>
    </article>
  )
}
