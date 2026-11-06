import { useId } from 'react'
import type { Feature, FeatureStatus, ProjectDetail } from '../../content/projectDetails/types'
import { useI18n } from '../../i18n/useI18n'
import { Reveal } from '../motion/Reveal'
import { pad } from '../../utils/format'
import { StatusMark } from './StatusMark'
import styles from './FeatureList.module.scss'

const ORDER: readonly FeatureStatus[] = ['done', 'partial', 'planned']

function FeatureGroup({
  status,
  features,
  onOpenImage,
}: {
  status: FeatureStatus
  features: readonly Feature[]
  onOpenImage: (id: string) => void
}) {
  const { lang, t } = useI18n()
  const titleId = useId()
  const label = t.project.features.groups[status]

  return (
    <section className={styles.group} data-status={status} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.groupTitle}>
        <StatusMark status={status} label={label} />
        <span className={styles.count}>{pad(features.length)}</span>
      </h3>
      <ol className={styles.list}>
        {features.map((feature, position) => (
          <li key={position} className={styles.feature}>
            <Reveal delay={Math.min(position, 3) * 60}>
              <h4 className={styles.title}>{feature.title[lang]}</h4>
              <p className={styles.text}>{feature.text[lang]}</p>
              {feature.image && (
                <button type="button" className={styles.shot} onClick={() => onOpenImage(feature.image as string)}>
                  {t.project.features.showScreenshot}
                  <span className="visually-hidden">: {feature.title[lang]}</span>
                </button>
              )}
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * The features in three groups: built, partly working, planned. The groups are told apart by their
 * outline and their word, not by colour, and a feature in the last two says what is missing.
 * What the project does not do is listed apart, from its own documentation or its code.
 */
export function FeatureList({ detail, onOpenImage }: { detail: ProjectDetail; onOpenImage: (id: string) => void }) {
  const { lang, t } = useI18n()

  return (
    <div className={styles.layout}>
      <div className={styles.groups}>
        {ORDER.map((status) => {
          const features = detail.features.filter((feature) => feature.status === status)
          return features.length > 0 ? (
            <FeatureGroup key={status} status={status} features={features} onOpenImage={onOpenImage} />
          ) : null
        })}
      </div>

      {detail.limits.length > 0 && (
        <Reveal className={styles.limits}>
          <h3 className={styles.limitsTitle}>{t.project.features.limits}</h3>
          <ul>
            {detail.limits.map((limit, position) => (
              <li key={position}>{limit[lang]}</li>
            ))}
          </ul>
        </Reveal>
      )}
    </div>
  )
}
