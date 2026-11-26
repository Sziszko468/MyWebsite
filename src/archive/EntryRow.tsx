import { memo } from 'react'
import { Badge } from '../components/Badge/Badge'
import { Button } from '../components/Button/Button'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import type { Localized } from '../content/trilingual'
import type { archiveText } from '../content/archive/text'
import { fill } from '../utils/format'
import { EntryVisual } from './EntryVisual'
import type { ArchiveEntry, ArchiveLabels } from './model'
import styles from './EntryRow.module.scss'

type Words = Localized<typeof archiveText>

interface EntryRowProps {
  entry: ArchiveEntry
  /** Its place in the list as shown, from 1. */
  position: number
  labels: ArchiveLabels
  words: Words
  /** A direct link opened this entry. */
  linked: boolean
}

/**
 * One entry of the archive, as a row of a ledger: its number, picture, name (the way into its page), kind, category and state, sentence and tags, and its other doors
 * (a demo's project, a project's demo, a direct link to this row). The row can take focus, so a direct link can put the keyboard on it.
 */
export const EntryRow = memo(function EntryRow({ entry, position, labels, words, linked }: EntryRowProps) {
  const t = words.archive.entry
  const headingId = `${entry.id}-title`
  const status = entry.status
  return (
    <article id={entry.id} className={styles.row} data-kind={entry.kind} data-linked={linked || undefined} aria-labelledby={headingId} tabIndex={-1}>
      <span className={styles.position} aria-hidden="true">
        {String(position).padStart(2, '0')}
      </span>
      <div className={styles.picture}>
        <EntryVisual visual={entry.visual} />
      </div>
      <div className={styles.body}>
        <p className={styles.meta}>
          <span className={styles.kind}>{labels.kind[entry.kind]}</span>
          {entry.categoryLabel !== '' && (
            <>
              <span aria-hidden="true">·</span>
              <span>{entry.categoryLabel}</span>
            </>
          )}
          {status === 'ready' ? <span className={styles.ready}>{labels.status.ready}</span> : <Badge status={status} />}
        </p>
        <h3 id={headingId} className={styles.title}>
          {entry.href ? (
            <LocalizedLink to={entry.href} className={styles.titleLink}>
              {entry.title}
            </LocalizedLink>
          ) : (
            entry.title
          )}
        </h3>
        <p className={styles.description}>{entry.description}</p>
        {entry.tags.length > 0 && (
          <ul className={styles.tags} aria-label={t.tags}>
            {entry.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
        {linked && <p className={styles.linkedNote}>{t.linked}</p>}
        <div className={styles.actions}>
          {entry.href ? (
            <Button to={entry.href} variant="secondary" size="sm" arrow aria-label={fill(t.openNamed, { name: entry.title })}>
              {t.open}
            </Button>
          ) : (
            <span className={styles.noPage}>{t.noPage}</span>
          )}
          {entry.related && (
            <LocalizedLink to={entry.related.href} className={styles.aside}>
              {entry.related.kind === 'demo' ? t.tryDemo : t.projectPage}
              <span className="visually-hidden">: {entry.title}</span>
            </LocalizedLink>
          )}
          <a href={`#${entry.id}`} className={styles.aside}>
            {t.link}
            <span className="visually-hidden">: {entry.title}</span>
          </a>
        </div>
      </div>
    </article>
  )
})
