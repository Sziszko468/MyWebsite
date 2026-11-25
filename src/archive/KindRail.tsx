import { useId } from 'react'
import type { Localized } from '../content/trilingual'
import type { archiveText } from '../content/archive/text'
import type { ArchiveKind, Facet } from './model'
import styles from './KindRail.module.scss'

interface KindRailProps {
  words: Localized<typeof archiveText>
  value: ArchiveKind | ''
  facets: readonly Facet<ArchiveKind>[]
  total: number
  onChange: (kind: ArchiveKind | '') => void
}

/**
 * The archive's sections as a rail: everything, then each kind that has entries, with how many. They are native radio buttons in a fieldset, so the arrow keys move
 * between them; the chosen one is filled, underlined and said by the radio itself, never by colour alone.
 */
export function KindRail({ words, value, facets, total, onChange }: KindRailProps) {
  const name = useId()
  const options: Array<{ key: ArchiveKind | ''; label: string; count: number }> = [
    { key: '', label: words.archive.all, count: total },
    ...facets.map((facet) => ({ key: facet.key, label: words.kinds.many[facet.key], count: facet.count })),
  ]
  return (
    <fieldset className={styles.rail}>
      <legend className={styles.legend}>{words.archive.kind}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.key || 'all'} className={styles.option}>
            <input className={styles.input} type="radio" name={name} value={option.key} checked={value === option.key} onChange={() => onChange(option.key)} />
            <span className={styles.face}>
              <span className={styles.count} aria-hidden="true">
                {String(option.count).padStart(2, '0')}
              </span>
              <span className={styles.label}>{option.label}</span>
              <span className="visually-hidden"> ({option.count})</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
