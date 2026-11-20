import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { AlertItem, AnalyticsAnswer, Distribution, Section, Series, Table } from '../api/analytics'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/states'
import { fill } from '../i18n'
import styles from '../styles/analytics.module.scss'
import { BarChart, BarList, DonutChart, FunnelChart, LineChart, type ChartSeries, type Tone } from './Charts'
import { formatCount, formatDateOnly, formatDayKey, formatDays, formatMilliseconds, formatMoney, formatPercent, formatUsd, humanize, word } from './format'
import { KpiCard, Limitations, MoneyCard, ScopeNote, ScopeStatus } from './Kpi'
import { PART_OF_WHOLE, SERIES_GROUPS, TREND_OF } from './model'
import { useAnalyticsLanguage, useAnalyticsText } from './text'

/**
 * One section of the analytics, built from what the server sent (PROMPT 32). The server decides what exists and what the role may read; this only lays it out: the figures first, then
 * the charts (each with its table), the breakdowns, the tables, and last what these figures cannot tell. A section the role may not read is one sentence, never a zero.
 */

const INTEREST = new Set(['servicesRequested', 'packagesRequested', 'addOnsRequested'])
/** A path the administration has (relative to `/admin`): letters, digits, dashes, slashes, nothing that could leave the application. */
const SAFE_PATH = /^\/[a-z-]+(\/[A-Za-z0-9_-]+)*$/

function SeriesCharts({ section }: { section: Section }) {
  const t = useAnalyticsText()
  const language = useAnalyticsLanguage()
  const used = new Set<string>()
  const charts: ReactNode[] = []
  const labelsOf = (series: Series) => series.points.map((point) => formatDayKey(point.key, language))
  const named = (id: string) => (t.series as Record<string, { label: string; help: string }>)[id] ?? { label: humanize(id), help: '' }

  for (const group of SERIES_GROUPS) {
    const members = group.series.map((id) => section.series.find((series) => series.id === id)).filter((series): series is Series => series !== undefined)
    if (members.length === 0) continue
    for (const member of members) used.add(member.id)
    const info = t.groups[group.id]
    const tone = (index: number): Tone => ([0, 1, 2] as const)[index] ?? 3
    // Inside one chart the series are named by what happened ("Sent", "Accepted"), not by the long title they have on their own.
    const short = (id: string): string | null => ({ quotationsSentSeries: 'sent', quotationsAcceptedSeries: 'accepted', quotationsDeclinedSeries: 'declined' })[id] ?? null
    const series: ChartSeries[] = members.map((member, index) => ({ label: short(member.id) ? word(t.keys as Record<string, string>, short(member.id) as string) : named(member.id).label, values: member.points.map((point) => point.value), tone: tone(index) }))
    charts.push(<BarChart key={group.id} title={info.label} description={info.help} labels={labelsOf(members[0])} series={series} mode={group.mode} format={(value) => formatCount(value, language)} />)
  }
  for (const series of section.series) {
    if (used.has(series.id)) continue
    const info = named(series.id)
    const values = series.points.map((point) => point.value)
    if (series.unit === 'minor' && series.currency) {
      const currency = series.currency
      charts.push(<LineChart key={`${series.id}-${currency}`} title={`${info.label} · ${currency}`} description={info.help} note={<ScopeNote note={series.filterNote} />} labels={labelsOf(series)} series={[{ label: (t.money as Record<string, string>)[currency] ?? currency, values, tone: 0 }]} format={(value) => formatMoney(value, currency, language)} />)
    } else if (series.unit === 'usd') {
      charts.push(<LineChart key={series.id} title={info.label} description={info.help} note={<ScopeNote note={series.filterNote} />} labels={labelsOf(series)} series={[{ label: info.label, values, tone: 0 }]} format={(value) => formatUsd(value, language)} />)
    } else {
      charts.push(<BarChart key={series.id} title={info.label} description={info.help} note={<ScopeNote note={series.filterNote} />} labels={labelsOf(series)} series={[{ label: info.label, values, tone: 0 }]} mode="grouped" format={(value) => formatCount(value, language)} />)
    }
  }
  return charts.length === 0 ? null : <div className={styles.charts}>{charts}</div>
}

function DistributionChart({ distribution }: { distribution: Distribution }) {
  const t = useAnalyticsText()
  const language = useAnalyticsLanguage()
  const info = (t.distributions as Record<string, { label: string; help: string }>)[distribution.id] ?? { label: humanize(distribution.id), help: '' }
  const label = (key: string) => (INTEREST.has(distribution.id) ? key : word(t.keys as Record<string, string>, key))
  const count = (value: number) => formatCount(value, language)
  if (PART_OF_WHOLE.has(distribution.id) && distribution.items.length <= 6) {
    return <DonutChart title={info.label} description={info.help} note={<ScopeNote note={distribution.filterNote} />} items={distribution.items.map((item) => ({ label: label(item.key), value: item.value }))} format={count} share={(fraction) => formatPercent(fraction * 100, language)} />
  }
  return (
    <BarList
      title={info.label}
      description={info.help}
      note={<ScopeNote note={distribution.filterNote} />}
      items={distribution.items.map((item) => ({ label: label(item.key), value: item.value, detail: item.accepted === undefined ? undefined : fill(t.charts.accepted, { count: formatCount(item.accepted, language) }) }))}
      format={count}
    />
  )
}

function DataTable({ table }: { table: Table }) {
  const t = useAnalyticsText()
  const language = useAnalyticsLanguage()
  const info = (t.tables as Record<string, { label: string; help: string }>)[table.id] ?? { label: humanize(table.id), help: '' }
  const currencyAt = table.columns.indexOf('currency')
  const cell = (column: string, value: string | number | null, row: Array<string | number | null>): string => {
    if (value === null || value === '') return '—'
    if (column.endsWith('Minor') && typeof value === 'number' && currencyAt >= 0 && (row[currencyAt] === 'EUR' || row[currencyAt] === 'HUF')) return formatMoney(value, row[currencyAt] as 'EUR' | 'HUF', language)
    if (column.endsWith('Usd') && typeof value === 'number') return formatUsd(value, language)
    if (column === 'averageResponseMs' && typeof value === 'number') return formatMilliseconds(value, language)
    if ((column === 'expectedOn' || column === 'dueOn') && typeof value === 'string') return formatDateOnly(value, language, 'UTC')
    if (typeof value === 'number') return formatCount(value, language)
    return ['audience', 'status', 'kind', 'scope'].includes(column) ? word(t.keys as Record<string, string>, value) : value
  }
  const columnName = (column: string) => (t.columns as Record<string, string>)[column] ?? humanize(column)
  // A table that is empty by definition says why in its note; the focusable table region points at that note, so a keyboard or screen-reader user who lands on it hears the reason too.
  const emptyByDefinition = table.filterNote?.effect === 'empty_by_definition'
  const noteId = `table-${table.id}-scope`
  return (
    <section className={styles.tableBlock} aria-labelledby={`table-${table.id}`}>
      <h3 id={`table-${table.id}`} className={styles.blockTitle}>
        {info.label}
      </h3>
      {info.help && <p className={styles.blockHelp}>{info.help}</p>}
      <ScopeNote note={table.filterNote} id={emptyByDefinition ? noteId : undefined} />
      <div className={styles.tableScroll} tabIndex={0} role="group" aria-label={info.label} aria-describedby={emptyByDefinition ? noteId : undefined}>
        <table>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} scope="col">
                  {columnName(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td colSpan={table.columns.length}>{t.charts.noData}</td>
              </tr>
            ) : (
              table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((value, index) => (index === 0 ? <th key={index} scope="row">{cell(table.columns[index], value, row)}</th> : <td key={index}>{cell(table.columns[index], value, row)}</td>))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function FunnelView({ section }: { section: Section }) {
  const t = useAnalyticsText()
  const language = useAnalyticsLanguage()
  const stages = section.extra?.stages ?? []
  const cohort = section.extra?.cohort
  const steps = stages.map((stage) => ({
    label: (t.funnel.stages as Record<string, string>)[stage.stage] ?? humanize(stage.stage),
    count: stage.count,
    notes: [
      ...(stage.conversionFromPrevious === null ? [] : [fill(t.funnel.fromPrevious, { value: formatPercent(stage.conversionFromPrevious, language) })]),
      ...(stage.conversionFromReceived === null ? [] : [fill(t.funnel.fromReceived, { value: formatPercent(stage.conversionFromReceived, language) })]),
      ...(stage.daysFromPrevious === null ? [] : [fill(t.funnel.daysFromPrevious, { value: formatDays(stage.daysFromPrevious, language) })]),
    ],
  }))
  return (
    <div className={styles.funnelBlock}>
      <FunnelChart
        title={cohort ? fill(t.funnel.cohort, { from: formatDayKey(cohort.from, language), to: formatDayKey(cohort.to, language) }) : t.sections.funnel.name}
        description={`${t.funnel.note} ${t.funnel.reasonsNote}`}
        steps={steps}
        format={(value) => formatCount(value, language)}
      />
    </div>
  )
}

function AlertsView({ section }: { section: Section }) {
  const t = useAnalyticsText()
  const language = useAnalyticsLanguage()
  const items: AlertItem[] = section.extra?.items ?? []
  const left = section.extra?.leftOut ?? []
  return (
    <section className={styles.alertsBlock} aria-label={t.sections.alerts.name}>
      {left.map((code) => (
        <p key={code} className={styles.kpiNote}>
          {(t.alerts.leftOut as Record<string, string>)[code] ?? humanize(code)}
        </p>
      ))}
      {items.length === 0 ? (
        <p className={styles.alertsEmpty}>{t.alerts.empty}</p>
      ) : (
        <ul className={styles.alertList}>
          {items.map((item) => (
            <li key={`${item.kind}-${item.reference}`} className={styles.alertItem} data-severity={item.severity}>
              <p className={styles.alertHead}>
                <span className={styles.severity} data-severity={item.severity}>
                  <Icon name={item.severity === 'low' ? 'info' : 'alert'} className={styles.severityIcon} />
                  {word(t.keys as Record<string, string>, item.severity)}
                </span>
                <strong>{(t.alerts.kinds as Record<string, string>)[item.kind] ?? humanize(item.kind)}</strong>
              </p>
              <p className={styles.alertReason}>{(t.alerts.reasons as Record<string, string>)[item.reason] ?? humanize(item.reason)}</p>
              <p className={styles.alertMeta}>
                {SAFE_PATH.test(item.path) ? <Link to={item.path}>{item.reference}</Link> : item.reference} · {t.alerts.columns.date}: {formatDateOnly(item.date, language, 'UTC')}
              </p>
              <p className={styles.alertAction}>
                <strong>{t.alerts.columns.action}:</strong> {(t.alerts.actions as Record<string, string>)[item.nextAction] ?? humanize(item.nextAction)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {section.extra?.truncated && <p className={styles.kpiNote}>{t.alerts.truncated}</p>}
    </section>
  )
}

/** What the selected project status does to the section as a whole; for the alerts, which kinds it filters and which it does not. */
function FilterBanner({ section }: { section: Section }) {
  const t = useAnalyticsText()
  const summary = section.filterSummary?.projectStatus
  if (!summary) return null
  const status = word(t.keys as Record<string, string>, summary.status)
  const kinds = (codes: string[]) => codes.map((code) => (t.alerts.kinds as Record<string, string>)[code] ?? humanize(code)).join(', ')
  return (
    <div className={styles.scopeBanner} role="note" data-effect={summary.effect}>
      <p>{fill(summary.effect === 'partial' ? t.scope.summaryPartial : t.scope.summaryNotApplicable, { status })}</p>
      {summary.appliedKinds && summary.appliedKinds.length > 0 && <p>{fill(t.scope.alertsApplied, { kinds: kinds(summary.appliedKinds) })}</p>}
      {summary.notAppliedKinds && summary.notAppliedKinds.length > 0 && <p>{fill(t.scope.alertsNotApplied, { kinds: kinds(summary.notAppliedKinds) })}</p>}
    </div>
  )
}

export function SectionView({ answer }: { answer: AnalyticsAnswer }) {
  const t = useAnalyticsText()
  const { section } = answer
  if (section.state === 'not_permitted') return <EmptyState icon="alert" title={t.states.sectionNotPermitted} />
  const trendOf = (id: string): Series | null => {
    const wanted = TREND_OF[id]
    return wanted ? (section.series.find((series) => series.id === wanted) ?? null) : null
  }
  const alsoCurrency = section.money.some((money) => money.lines.length > 0)
  return (
    <ScopeStatus value={section.filterSummary?.projectStatus.status ?? null}>
    <div className={styles.sectionBody}>
      <FilterBanner section={section} />
      {section.metrics.length + section.money.length > 0 && (
        <>
          <ul className={styles.kpis}>
            {section.metrics.map((metric) => (
              <KpiCard key={metric.id} metric={metric} trend={trendOf(metric.id)} />
            ))}
            {section.money.map((metric) => (
              <MoneyCard key={metric.id} metric={metric} />
            ))}
          </ul>
          {alsoCurrency && <p className={styles.currencyNote}>{t.money.notAdded}</p>}
        </>
      )}
      {section.name === 'funnel' && <FunnelView section={section} />}
      {section.name === 'alerts' && <AlertsView section={section} />}
      <SeriesCharts section={section} />
      {section.distributions.length > 0 && (
        <div className={styles.charts}>
          {section.distributions.map((distribution) => (
            <DistributionChart key={distribution.id} distribution={distribution} />
          ))}
        </div>
      )}
      {section.tables.map((table) => (
        <DataTable key={table.id} table={table} />
      ))}
      <Limitations codes={section.limitations} />
    </div>
    </ScopeStatus>
  )
}
