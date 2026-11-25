import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { EntryRow } from '../archive/EntryRow'
import { KindRail } from '../archive/KindRail'
import styles from '../archive/Archive.module.scss'
import { SystemBar } from '../archive/SystemBar'
import { anchorFromHash, defaultQuery, effectiveQuery, filterEntries, isActive, readQuery, sortEntries, writeQuery, TEXT_MAX, type ArchiveQuery, type ArchiveSort, type ArchiveStatus } from '../archive/model'
import { useArchive } from '../archive/useArchive'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { SelectField, TextField } from '../components/form/fields'
import { useLocalized } from '../components/lab/core/useLabText'
import { PageHero, HeroLine } from '../components/PageHero/PageHero'
import { archiveText } from '../content/archive/text'
import { useI18n } from '../i18n/useI18n'
import { fill } from '../utils/format'

/**
 * The Digital Archive (PROMPT 37), at /archive: everything the website shows in public, as one list a visitor can search, filter and sort. The state of the search is in
 * the address (replaced, never pushed, so Back leaves the archive), a direct link (`#entry-…`) opens one entry and puts the keyboard on it, and the results are said to a
 * screen reader. Everything happens in the browser on data the site already has: there is no search service.
 */
export function ArchivePage() {
  const words = useLocalized(archiveText)
  const t = words.archive
  const { lang } = useI18n()
  const { entries, facets, labels, loading } = useArchive()
  const location = useLocation()
  const navigate = useNavigate()
  const listId = useId()

  /*
   * The search the visitor sees is the page's own state, so a keystroke or a choice shows at once; the address only mirrors it. (The router applies a new address in a React
   * transition: controls bound to it would flicker back to the old value and lose keystrokes, which a real browser showed.) An address that comes from elsewhere
   * (Back, a link, a reload) is adopted; the ones this page writes itself are marked and are not.
   */
  const [asked, setAsked] = useState(() => readQuery(new URLSearchParams(location.search)))
  const [seenAddress, setSeenAddress] = useState(location.key)
  if (location.key !== seenAddress) {
    setSeenAddress(location.key)
    if (!(location.state as { own?: boolean } | null)?.own) setAsked(readQuery(new URLSearchParams(location.search)))
  }
  const query = useMemo(() => effectiveQuery(asked, facets, !loading), [asked, facets, loading])
  const shown = useMemo(() => sortEntries(filterEntries(entries, query, labels), query.sort, lang), [entries, query, labels, lang])
  const anchor = anchorFromHash(location.hash)
  const linked = anchor !== null && entries.some((entry) => entry.id === anchor) ? anchor : null

  /** Mirrors a query into the address (replacing the entry, never adding one). A change of the search leaves a direct link behind. */
  const mirror = useCallback(
    (next: ArchiveQuery, hash = '') => {
      const search = writeQuery(next).toString()
      void navigate({ search: search ? `?${search}` : '', hash }, { replace: true, preventScrollReset: true, state: { own: true } })
    },
    [navigate],
  )
  const apply = useCallback(
    (patch: Partial<ArchiveQuery>) => {
      const next = { ...query, ...patch }
      setAsked(next)
      mirror(next)
    },
    [query, mirror],
  )
  const clear = useCallback(() => {
    setAsked(defaultQuery())
    mirror(defaultQuery())
  }, [mirror])

  // A direct link: if the search would hide the entry, the search is cleared (the link wins); then the entry is brought into view and takes the focus, once per link.
  const hidden = linked !== null && !shown.some((entry) => entry.id === linked)
  // Adjusted while drawing (not in an effect), so the page is never drawn without the entry the link asks for.
  if (hidden && !loading && isActive(query)) setAsked(defaultQuery())

  const focused = useRef<string | null>(null)
  useEffect(() => {
    if (linked === null) {
      focused.current = null
      return
    }
    if (hidden) return
    // The address says what is shown: a search the link cleared is taken out of it.
    if (location.search !== '' && !isActive(query)) mirror(query, `#${linked}`)
    if (focused.current === linked) return
    const element = document.getElementById(linked)
    if (!element) return
    focused.current = linked
    element.focus({ preventScroll: true })
    element.scrollIntoView({ block: 'start' })
  }, [linked, hidden, mirror, shown, query, location.search])

  const active = isActive(query)

  return (
    <div className={styles.page} data-archive="">
      <PageHero
        compact
        eyebrow={t.eyebrow}
        title={
          <>
            <HeroLine>{t.titleA}</HeroLine>
            <HeroLine accent>{t.titleB}</HeroLine>
          </>
        }
        lead={t.lead}
        seed={37}
      />
      <SystemBar current="archive" />

      <section className={styles.finder} aria-label={t.controlsLabel}>
        <Container size="wide">
          <form className={styles.form} role="search" onSubmit={(event) => event.preventDefault()}>
            <TextField className={styles.search} type="search" label={t.search} hint={t.searchHelp} value={query.text} maxLength={TEXT_MAX} autoComplete="off" onChange={(event) => apply({ text: event.currentTarget.value })} />
            <KindRail words={words} value={query.kind} facets={facets.kinds} total={entries.length} onChange={(kind) => apply({ kind })} />
            <div className={styles.selects}>
              <SelectField label={t.category} value={query.category} placeholder={t.all} options={facets.categories.map((facet) => ({ value: facet.key, label: fill(t.counted, { label: facet.label, count: facet.count }) }))} onChange={(category) => apply({ category })} />
              <SelectField label={t.status} value={query.status} placeholder={t.all} options={facets.statuses.map((facet) => ({ value: facet.key, label: fill(t.counted, { label: labels.status[facet.key], count: facet.count }) }))} onChange={(status) => apply({ status: status as ArchiveStatus | '' })} />
              <SelectField
                label={t.sort}
                value={query.sort === 'curated' ? '' : query.sort}
                placeholder={t.sorts.curated}
                options={[
                  { value: 'name', label: t.sorts.name },
                  { value: 'name-desc', label: t.sorts.nameDesc },
                  { value: 'kind', label: t.sorts.kind },
                ]}
                onChange={(sort) => apply({ sort: (sort || 'curated') as ArchiveSort })}
              />
              <Button variant="secondary" size="sm" disabled={!active} onClick={clear}>
                {t.clear}
              </Button>
            </div>
          </form>
        </Container>
      </section>

      <section className={styles.results} aria-labelledby={listId}>
        <Container size="wide">
          <div className={styles.head}>
            <h2 id={listId} className={styles.heading}>
              {t.listHeading}
            </h2>
            {/* A status region: a screen reader says the new count after a search or a filter (not when the page first draws). */}
            <p className={styles.count} role="status" aria-live="polite" data-testid="archive-count">
              {fill(t.results, { shown: shown.length, total: entries.length })}
            </p>
          </div>
          {loading && <p className={styles.loading}>{t.loading}</p>}
          {shown.length > 0 ? (
            <ol className={styles.list}>
              {shown.map((entry, index) => (
                <li key={entry.id} className={styles.item}>
                  <EntryRow entry={entry} position={index + 1} labels={labels} words={words} linked={entry.id === linked} />
                </li>
              ))}
            </ol>
          ) : (
            !loading && (
              <div className={styles.empty}>
                <h3 className={styles.emptyTitle}>{t.emptyTitle}</h3>
                <p>{t.emptyText}</p>
                <Button variant="primary" onClick={clear}>
                  {t.clear}
                </Button>
              </div>
            )
          )}
        </Container>
      </section>
    </div>
  )
}

export default ArchivePage
