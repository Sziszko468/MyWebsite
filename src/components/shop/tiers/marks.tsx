import { useId, useState } from 'react'
import type { Trilingual } from '../../../content/trilingual'
import type { FeatureLevel } from '../../../content/shop/comparison'
import { useI18n } from '../../../i18n/useI18n'
import { useShopText } from '../../../shop/useShopText'
import { cx } from '../../../utils/cx'
import styles from './Tiers.module.scss'

const ICONS: Record<FeatureLevel, string> = {
  included: 'M4 12.5l5 5L20 6.5',
  none: 'M6 12h12',
  addon: 'M12 6v12M6 12h12',
  custom: 'M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2.5 2.5M14.5 14.5L17 17M17 7l-2.5 2.5M9.5 14.5L7 17',
}

/**
 * How a package relates to a feature: a mark and, for the two that need a word, the word ("Add-on", "Custom"). The long sentence is
 * read by screen readers in every cell, so a table of marks is still a table of words; nothing is told by colour or shape alone.
 */
export function LevelMark({ level, className }: { level: FeatureLevel; className?: string }) {
  const { tiers } = useShopText()
  const c = tiers.compare
  const word = level === 'addon' || level === 'custom' ? c.levels[level] : null
  return (
    <span className={cx(styles.mark, className)} data-level={level}>
      <svg className={styles.markIcon} viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d={ICONS[level]} />
      </svg>
      {word && (
        <span className={styles.markWord} aria-hidden="true">
          {word}
        </span>
      )}
      <span className="visually-hidden">{c.levelsLong[level]}</span>
    </span>
  )
}

/** The key to the marks, once above the comparison. */
export function Legend() {
  const { tiers } = useShopText()
  const c = tiers.compare
  return (
    <dl className={styles.legend} aria-label={c.legendTitle}>
      {(['included', 'addon', 'custom', 'none'] as const).map((level) => (
        <div key={level} className={styles.legendItem}>
          <dt>
            <span className={styles.mark} data-level={level}>
              <svg className={styles.markIcon} viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d={ICONS[level]} />
              </svg>
            </span>
          </dt>
          <dd>{c.levelsLong[level]}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * A feature's name and, when it has an explanation, a small button that opens it in place (a tooltip would not exist on a phone and
 * is out of reach of a keyboard; this is a plain disclosure: the state is announced and the text is real text).
 */
export function FeatureName({ name, description }: { name: Trilingual; description: Trilingual }) {
  const { lang } = useI18n()
  const { tiers } = useShopText()
  const [open, setOpen] = useState(false)
  const id = useId()
  const text = description[lang]
  return (
    <span className={styles.featureName}>
      <span className={styles.featureLabel}>{name[lang]}</span>
      {text !== '' && (
        <>
          <button type="button" className={styles.info} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
            <span aria-hidden="true">i</span>
            <span className="visually-hidden">{tiers.compare.explain.replace('{name}', name[lang])}</span>
          </button>
          <span id={id} className={styles.featureText} hidden={!open}>
            {text}
          </span>
        </>
      )}
    </span>
  )
}
