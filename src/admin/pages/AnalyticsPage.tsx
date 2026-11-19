import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { fill } from '../../utils/format'
import { ANALYTICS_LANGUAGES, MAX_CUSTOM_DAYS, PRESETS, SECTION_NAMES, analytics, downloadCsv, type AnalyticsLanguage, type SectionName } from '../api/analytics'
import { ApiError } from '../api/client'
import { catalog } from '../api/endpoints'
import { AdminButton } from '../components/AdminButton'
import { SelectField, TextField } from '../components/form'
import { PageHeader, TabPanel, Tabs } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { printElement } from '../assistant/exporters'
import { formatDayKey, formatMoment, word } from '../analytics/format'
import {
  CONSULTATION_STATUS_OPTIONS,
  CURRENCY_OPTIONS,
  DEFAULT_FILTERS,
  PROJECT_STATUS_OPTIONS,
  QUOTATION_STATUS_OPTIONS,
  SECTION_FILTERS,
  SLUG,
  canOpen,
  queryFor,
  rangeProblem,
  readFilters,
  sectionOf,
  writeFilters,
  type FilterKey,
  type FilterState,
} from '../analytics/model'
import { SectionView } from '../analytics/Sections'
import { AnalyticsTextProvider, readStoredLanguage, storeLanguage, useAnalyticsLanguage, useAnalyticsText } from '../analytics/text'
import { useResource } from '../hooks/useResource'
import { useInterfaceLanguage } from '../i18n'
import { useSession } from '../session/SessionProvider'
import styles from '../styles/analytics.module.scss'

const formatDay = (day: string, language: AnalyticsLanguage): string => formatDayKey(day, language, 'short')

/**
 * `/admin/analytics` (PROMPT 32): the business analytics dashboard. Everything on it was counted by the server from stored records when the page was opened (nothing is cached, nothing is
 * estimated unless it says so, no figure is computed in the browser); each section needs the permission of the data behind it and says "not available for your role" rather than showing
 * a zero. The period and the filters live in the address, so a view can be shared and the back button works. The screen speaks the language picked for it (Hungarian, English or Dutch).
 */

export function AnalyticsPage() {
  const session = useSession()
  const interfaceLanguage = useInterfaceLanguage()
  const [language, setLanguage] = useState<AnalyticsLanguage>(() => readStoredLanguage(interfaceLanguage))
  const choose = (next: AnalyticsLanguage) => {
    setLanguage(next)
    storeLanguage(next)
  }
  const allowed = SECTION_NAMES.filter((name) => canOpen(name, session.can))
  if (allowed.length === 0) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />
  return (
    <AnalyticsTextProvider language={language}>
      <Screen allowed={allowed} language={language} onLanguage={choose} />
    </AnalyticsTextProvider>
  )
}

function Screen({ allowed, language, onLanguage }: { allowed: SectionName[]; language: AnalyticsLanguage; onLanguage: (language: AnalyticsLanguage) => void }) {
  const t = useAnalyticsText()
  const [params, setParams] = useSearchParams()
  const requested = sectionOf(params.get('section'))
  const section = allowed.includes(requested) ? requested : allowed[0]
  const filters = useMemo(() => readFilters(params), [params])
  const names = t.language.names as Record<string, string>

  const move = (next: SectionName) => setParams(writeFilters(filters, next))
  const change = (patch: Partial<FilterState>) => setParams(writeFilters({ ...filters, ...patch }, section), { replace: true })

  const picker = <SelectField label={t.language.label} hint={t.language.note} value={language} onChange={(event) => onLanguage(event.target.value as AnalyticsLanguage)} options={ANALYTICS_LANGUAGES.map((code) => ({ value: code, label: names[code] ?? code }))} compact />
  const problem = rangeProblem(filters)
  const query = queryFor(filters, section, language)

  return (
    <>
      <PageHeader title={t.title} lead={t.lead} actions={picker} />
      <Tabs tabs={allowed.map((name) => ({ id: name, label: t.sections[name].name }))} value={section} onChange={(id) => move(id as SectionName)} label={t.sectionsLabel} idBase="analytics" />
      <FilterBar section={section} filters={filters} onChange={change} onReset={() => setParams(writeFilters(DEFAULT_FILTERS, section), { replace: true })} problem={problem} />
      {allowed.map((name) => (
        <TabPanel key={name} id={name} idBase="analytics" active={name === section}>
          {problem === null ? <Results key={`${name}-${JSON.stringify(query)}`} section={name} query={query} /> : null}
        </TabPanel>
      ))}
    </>
  )
}

// ---- filters -------------------------------------------------------------------------------------------------------------------------------

function FilterBar({ section, filters, onChange, onReset, problem }: { section: SectionName; filters: FilterState; onChange: (patch: Partial<FilterState>) => void; onReset: () => void; problem: ReturnType<typeof rangeProblem> }) {
  const t = useAnalyticsText()
  const language = useAnalyticsLanguage()
  const shown = new Set<FilterKey>(SECTION_FILTERS[section])
  const keys = t.keys as Record<string, string>
  const any = (label: string) => ({ value: '', label })
  const options = (codes: readonly string[]) => codes.map((code) => ({ value: code, label: word(keys, code) }))
  const problemText = problem === 'order' ? t.filters.rangeOrder : problem === 'length' ? fill(t.filters.rangeLength, { days: MAX_CUSTOM_DAYS }) : problem === 'missing' ? t.filters.rangeMissing : null
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
  return (
    <section className={styles.filters} aria-label={t.filters.title}>
      <h2 className={styles.filtersTitle}>{t.filters.title}</h2>
      <div className={styles.filterGrid}>
        <SelectField label={t.filters.period} value={filters.period} onChange={(event) => onChange({ period: event.target.value as FilterState['period'] })} options={PRESETS.map((preset) => ({ value: preset, label: t.presets[preset] }))} compact />
        {filters.period === 'custom' && (
          <>
            <TextField label={t.filters.from} type="date" value={filters.from} onChange={(event) => onChange({ from: event.target.value })} />
            <TextField label={t.filters.to} type="date" value={filters.to} onChange={(event) => onChange({ to: event.target.value })} />
          </>
        )}
        {shown.has('currency') && <SelectField label={t.filters.currency} value={filters.currency} onChange={(event) => onChange({ currency: event.target.value as FilterState['currency'] })} options={[any(t.filters.allCurrencies), ...CURRENCY_OPTIONS.map((code) => ({ value: code, label: `${code} · ${(t.money as Record<string, string>)[code]}` }))]} compact />}
        {shown.has('language') && <SelectField label={t.filters.language} value={filters.language} onChange={(event) => onChange({ language: event.target.value as FilterState['language'] })} options={[any(t.filters.allLanguages), ...ANALYTICS_LANGUAGES.map((code) => ({ value: code, label: word(keys, code) }))]} compact />}
        {(shown.has('service') || shown.has('package')) && <CatalogFilters filters={filters} onChange={onChange} showService={shown.has('service')} showPackage={shown.has('package')} language={language} />}
        {shown.has('quoteStatus') && <SelectField label={t.filters.quoteStatus} value={filters.quoteStatus} onChange={(event) => onChange({ quoteStatus: event.target.value })} options={[any(t.filters.any), ...options(QUOTATION_STATUS_OPTIONS)]} compact />}
        {shown.has('projectStatus') && <SelectField label={t.filters.projectStatus} value={filters.projectStatus} onChange={(event) => onChange({ projectStatus: event.target.value })} options={[any(t.filters.any), ...options(PROJECT_STATUS_OPTIONS)]} compact />}
        {shown.has('consultationStatus') && <SelectField label={t.filters.consultationStatus} value={filters.consultationStatus} onChange={(event) => onChange({ consultationStatus: event.target.value })} options={[any(t.filters.any), ...options(CONSULTATION_STATUS_OPTIONS)]} compact />}
      </div>
      <div className={styles.filterFoot}>
        {problemText && (
          <p className={styles.problem} role="alert">
            {problemText}
          </p>
        )}
        <p className={styles.filterNote}>{t.filters.appliesNote}</p>
        {dirty && (
          <AdminButton variant="text" type="button" onClick={onReset}>
            {t.filters.reset}
          </AdminButton>
        )}
      </div>
    </section>
  )
}

/** The service and package filters, from the catalogue the owner already manages. A role that cannot read it (or a catalogue that cannot be loaded) simply has no such filter. */
function CatalogFilters({ filters, onChange, showService, showPackage, language }: { filters: FilterState; onChange: (patch: Partial<FilterState>) => void; showService: boolean; showPackage: boolean; language: AnalyticsLanguage }) {
  const t = useAnalyticsText()
  const services = useResource(() => catalog.services().then((answer) => answer.data), [])
  const packages = useResource(() => catalog.packages().then((answer) => answer.data), [])
  const serviceOptions = (services.data ?? []).filter((item) => SLUG.test(item.slug)).map((item) => ({ value: item.slug, label: item.translations[language]?.title || item.translations.en?.title || item.slug }))
  const packageOptions = (packages.data ?? []).filter((item) => SLUG.test(item.code)).map((item) => ({ value: item.code, label: item.translations[language]?.name || item.translations.en?.name || item.code }))
  return (
    <>
      {showService && serviceOptions.length > 0 && <SelectField label={t.filters.service} value={filters.service} onChange={(event) => onChange({ service: event.target.value })} options={[{ value: '', label: t.filters.allServices }, ...serviceOptions]} compact />}
      {showPackage && packageOptions.length > 0 && <SelectField label={t.filters.package} value={filters.package} onChange={(event) => onChange({ package: event.target.value })} options={[{ value: '', label: t.filters.allPackages }, ...packageOptions]} compact />}
    </>
  )
}

// ---- one section ---------------------------------------------------------------------------------------------------------------------------

function Results({ section, query }: { section: SectionName; query: ReturnType<typeof queryFor> }) {
  const t = useAnalyticsText()
  const language = useAnalyticsLanguage()
  const toast = useToast()
  const resource = useResource((signal) => analytics.load(section, query, signal), [section, JSON.stringify(query)])
  const printable = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const info = t.sections[section]
  const answer = resource.data

  const exportCsv = async () => {
    setExporting(true)
    try {
      const file = await downloadCsv(section, query)
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.fileName
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success(t.actions.exported)
    } catch {
      toast.error(t.actions.exportFailed)
    } finally {
      setExporting(false)
    }
  }

  if (resource.loading || !answer) {
    return resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} title={t.states.failedTitle} /> : <LoadingState label={t.states.loading} />
  }
  const { meta } = answer
  const permitted = answer.section.state !== 'not_permitted'
  return (
    <div className={styles.results} aria-busy={resource.refreshing}>
      <div className={styles.resultsHead}>
        <div>
          <h2 className={styles.sectionTitle}>{info.name}</h2>
          <p className={styles.sectionLead}>{info.lead}</p>
        </div>
        <div className={styles.actions} data-no-print>
          <AdminButton variant="secondary" type="button" onClick={resource.reload} loading={resource.refreshing} loadingLabel={t.meta.refreshing}>
            {t.meta.refresh}
          </AdminButton>
          {permitted && (
            <AdminButton variant="secondary" type="button" onClick={() => void exportCsv()} loading={exporting} loadingLabel={t.actions.exporting}>
              {t.actions.exportCsv}
            </AdminButton>
          )}
          {permitted && (
            <AdminButton variant="primary" type="button" title={t.actions.printHint} onClick={() => printable.current && printElement(printable.current)}>
              {t.actions.print}
            </AdminButton>
          )}
        </div>
      </div>
      <ul className={styles.meta} aria-label={t.meta.label}>
        <li>{fill(t.meta.period, { from: formatDay(meta.period.from, language), to: formatDay(meta.period.to, language), days: meta.period.days })}</li>
        <li>{meta.previous ? fill(t.meta.previous, { from: formatDay(meta.previous.from, language), to: formatDay(meta.previous.to, language) }) : t.meta.noPrevious}</li>
        <li>{fill(t.meta.zone, { zone: meta.period.zone })}</li>
        <li>{fill(t.meta.generated, { time: formatMoment(meta.generatedAt, language, meta.period.zone) })}</li>
        <li>{t.meta.fresh}</li>
      </ul>
      <div ref={printable} className={styles.printable}>
        <div className={styles.printHeader}>
          <p className={styles.printKicker}>{t.print.heading}</p>
          <h2 className={styles.printTitle}>{info.name}</h2>
          <p>{fill(t.meta.period, { from: formatDay(meta.period.from, language), to: formatDay(meta.period.to, language), days: meta.period.days })}</p>
          {meta.previous && <p>{fill(t.meta.previous, { from: formatDay(meta.previous.from, language), to: formatDay(meta.previous.to, language) })}</p>}
          <p>
            {fill(t.meta.zone, { zone: meta.period.zone })} · {fill(t.meta.generated, { time: formatMoment(meta.generatedAt, language, meta.period.zone) })}
          </p>
          <p>{t.print.internal}</p>
        </div>
        {permitted ? <SectionView answer={answer} /> : <EmptyState icon="alert" title={t.states.sectionNotPermitted} />}
      </div>
    </div>
  )
}
