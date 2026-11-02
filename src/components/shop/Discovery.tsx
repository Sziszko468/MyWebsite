import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { serviceAreas } from '../../content/services/areas'
import { getAddon } from '../../content/services/addons'
import { serviceOfNeed } from '../../content/services/ids'
import { useI18n } from '../../i18n/useI18n'
import { SHOP_PATHS, servicePath } from '../../shop/paths'
import { ENTRY_KINDS, buildIndex, searchEntries, type EntryKind, type SearchEntry } from '../../shop/search'
import { useShopText } from '../../shop/useShopText'
import { fill } from '../../utils/format'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { CategoryCard } from './CategoryCard'
import { SearchIcon } from './icons'
import { shopTone } from './rhythm'
import styles from './Discovery.module.scss'

/** Where a search result leads: a service to its page, a package to its place on this page, an add-on to the page that offers it. */
function hrefOf(entry: SearchEntry): string {
  if (entry.kind === 'service') return servicePath(entry.id as (typeof serviceAreas)[number]['id'])
  if (entry.kind === 'package') return `${SHOP_PATHS.home}?package=${entry.id}#packages`
  const service = serviceOfNeed(getAddon(entry.id as Parameters<typeof getAddon>[0]).appliesTo[0])
  return service ? `${servicePath(service)}#addons` : SHOP_PATHS.home
}

/**
 * Service discovery: the four services as cards, and one search box over the whole catalogue
 * (services, packages, add-ons) with a filter by type. The catalogue is small, so there is no
 * wall of filters: typing narrows the cards live, and what else matches (a package, an add-on)
 * appears beneath them. Matching is in the page's language, so the search finds what the page
 * says. "Clear all filters" resets both controls; an empty result says so and offers the way out.
 */
export function Discovery() {
  const { lang } = useI18n()
  const { landing } = useShopText()
  const copy = landing.discovery
  const finder = copy.finder
  const { hash } = useLocation()
  const titleId = useId()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<EntryKind | 'all'>('all')
  const index = useMemo(() => buildIndex(lang), [lang])
  const results = useMemo(() => searchEntries(index, query, kind), [index, query, kind])

  const active = query.trim() !== '' || kind !== 'all'
  const serviceResults = results.filter((entry) => entry.kind === 'service')
  const others = active ? results.filter((entry) => entry.kind !== 'service') : []
  const visibleServices = serviceAreas.filter((area) => serviceResults.some((entry) => entry.id === area.id))

  // A link to #find (the mobile menu's search) lands with the cursor in the box.
  useEffect(() => {
    if (hash === '#find') inputRef.current?.focus({ preventScroll: true })
  }, [hash])

  const clear = () => {
    setQuery('')
    setKind('all')
    inputRef.current?.focus()
  }

  const count = results.length
  const status = !active ? '' : count === 0 ? finder.emptyTitle : count === 1 ? finder.countOne : fill(finder.count, { count })

  return (
    <Section id="services" tone={shopTone('services')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="01" title={copy.title} description={copy.intro} />
        </Reveal>

        <div id="find" className={styles.finder} role="search">
          <div className={styles.search}>
            <label htmlFor={inputId} className={styles.label}>
              {finder.label}
            </label>
            <div className={styles.field}>
              <span className={styles.icon}>
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                id={inputId}
                type="search"
                className={styles.input}
                value={query}
                placeholder={finder.placeholder}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>

          <fieldset className={styles.kinds}>
            <legend className="visually-hidden">{finder.filterLabel}</legend>
            {(['all', ...ENTRY_KINDS] as const).map((option) => (
              <label key={option} className={styles.kind} data-checked={kind === option || undefined}>
                <input type="radio" name={`${inputId}-kind`} value={option} checked={kind === option} onChange={() => setKind(option)} />
                <span>{finder.kinds[option]}</span>
              </label>
            ))}
          </fieldset>

          <div className={styles.meta}>
            <p role="status" aria-live="polite" className={styles.count}>
              {status}
            </p>
            {active && (
              <Button variant="text" size="sm" onClick={clear}>
                {finder.clear}
              </Button>
            )}
          </div>
        </div>

        {count === 0 ? (
          <div className={styles.empty}>
            <h3 className={styles.emptyTitle}>{finder.emptyTitle}</h3>
            <p>{finder.emptyText}</p>
            <div className={styles.emptyActions}>
              <Button variant="secondary" onClick={clear}>
                {finder.clear}
              </Button>
              <Button to={`${SHOP_PATHS.configure}?plan=custom`} arrow>
                {finder.emptyCta}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {visibleServices.length > 0 && (
              <ul className={styles.grid}>
                {visibleServices.map((area, position) => (
                  <li key={area.id}>
                    <Reveal className={styles.fill} delay={position % 2 ? 80 : 0}>
                      <CategoryCard area={area} position={serviceAreas.indexOf(area)} />
                    </Reveal>
                  </li>
                ))}
              </ul>
            )}

            {others.length > 0 && (
              <ul className={styles.results} aria-label={finder.resultsLabel}>
                {others.map((entry) => (
                  <li key={`${entry.kind}-${entry.id}`} className={styles.result}>
                    <span className={styles.kindTag}>{finder.kindOne[entry.kind as Exclude<EntryKind, 'service'>]}</span>
                    <div className={styles.resultText}>
                      <p className={styles.resultTitle}>{entry.title}</p>
                      <p className={styles.resultDescription}>{entry.description}</p>
                    </div>
                    <LocalizedLink to={hrefOf(entry)} className={styles.resultLink}>
                      {finder.open}
                      <span className="visually-hidden"> — {entry.title}</span>
                    </LocalizedLink>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Container>
    </Section>
  )
}
