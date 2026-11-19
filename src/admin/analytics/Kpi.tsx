import { createContext, useContext } from 'react'
import { Link } from 'react-router'
import { cx } from '../../utils/cx'
import type { FilterNote, Metric, MoneyMetric, Series } from '../api/analytics'
import { Icon } from '../components/Icon'
import { fill } from '../i18n'
import type { AnalyticsText } from '../i18n/analytics'
import styles from '../styles/analytics.module.scss'
import { Sparkline } from './Charts'
import { formatCount, formatDays, formatHours, formatMoney, formatPercent, formatUsd, humanize, word } from './format'
import { directionOf, unitOf, type Unit } from './model'
import { useAnalyticsLanguage, useAnalyticsText } from './text'

/**
 * The cards of the analytics (PROMPT 32). Every figure is shown with: what it is called, the value (or a plain statement that it does not exist, never a zero made up for the gap), what
 * kind of number it is (a stored fact, derived by a rule, an estimate), the previous equivalent period and the change where such a comparison is valid, a definition one click away and,
 * where there is a list behind the number, a link to it. Money is shown per currency and is never added across currencies.
 */

type Language = ReturnType<typeof useAnalyticsLanguage>

export function formatValue(unit: Unit, value: number, language: Language): string {
  switch (unit) {
    case 'percent':
      return formatPercent(value, language)
    case 'hours':
      return formatHours(value, language)
    case 'days':
      return formatDays(value, language)
    case 'usd':
      return formatUsd(value, language)
    default:
      return formatCount(value, language)
  }
}

const dictionary = (t: AnalyticsText, id: string, group: 'metrics' | 'moneyMetrics'): { label: string; help: string } => (t[group] as Record<string, { label: string; help: string }>)[id] ?? { label: humanize(id), help: '' }

export const reasonText = (t: AnalyticsText, code: string | null): string => (code ? ((t.reasons as Record<string, string>)[code] ?? humanize(code)) : '')

/** The project status the section is filtered by, for the notes of the figures; null when none is selected. */
export const ScopeStatus = createContext<string | null>(null)

/**
 * What the selected project status did to ONE figure, in words: filtered (and by which status), not filtered (and why: an event of the period, or not about projects) or empty by
 * definition. A figure is never left looking filtered when it is not. Nothing is shown when no status is selected.
 */
export function ScopeNote({ note }: { note: FilterNote | undefined }) {
  const t = useAnalyticsText()
  const status = useContext(ScopeStatus)
  if (!note) return null
  const reason = note.reason ? ((t.scope.reasons as Record<string, string>)[note.reason] ?? humanize(note.reason)) : null
  return (
    <p className={styles.scope} data-effect={note.effect}>
      <span className={styles.scopeBadge}>{t.scope.badge[note.effect]}</span>
      {note.effect === 'applied' && status !== null && <span>{fill(t.scope.applied, { status: word(t.keys as Record<string, string>, status) })}</span>}
      {note.effect === 'not_applied' && reason && <span>{reason}</span>}
    </p>
  )
}

function KindBadge({ kind }: { kind: Metric['kind'] }) {
  const t = useAnalyticsText()
  return (
    <span className={styles.kind} data-kind={kind} title={t.kpi.kindHelp[kind]}>
      {t.kpi.kinds[kind]}
    </span>
  )
}

function Definition({ help }: { help: string }) {
  const t = useAnalyticsText()
  if (!help) return null
  return (
    <details className={styles.definition}>
      <summary>{t.kpi.what}</summary>
      <p>{help}</p>
    </details>
  )
}

function Unavailable({ reason, state }: { reason: string | null; state: 'unavailable' | 'not_permitted' }) {
  const t = useAnalyticsText()
  return (
    <p className={styles.unavailable} data-state={state}>
      <Icon name="info" className={styles.unavailableIcon} />
      <span>
        <strong>{state === 'not_permitted' ? t.kpi.notPermitted : t.kpi.unavailable}.</strong> {state === 'not_permitted' ? '' : reasonText(t, reason)}
      </span>
    </p>
  )
}

/** One figure: a count, a rate, a duration, or an estimate in dollars. */
export function KpiCard({ metric, trend }: { metric: Metric; trend?: Series | null }) {
  const t = useAnalyticsText()
  const language = useAnalyticsLanguage()
  const { label, help } = dictionary(t, metric.id, 'metrics')
  const unit = unitOf(metric.id)
  const direction = directionOf(metric)
  const available = metric.state === 'available' && metric.value !== null
  const compared = metric.comparison === 'period' && metric.previous !== null && available
  const change = metric.change === null ? null : formatValue(unit, Math.abs(metric.change), language)
  const percent = metric.changePercent === null ? null : formatPercent(Math.abs(metric.changePercent), language)
  return (
    <li className={styles.kpi} data-state={metric.state}>
      <article aria-label={label}>
        <header className={styles.kpiHead}>
          <h3 className={styles.kpiLabel}>{label}</h3>
          {available && <KindBadge kind={metric.kind} />}
        </header>
        {available ? (
          <>
            <p className={styles.kpiValue}>{formatValue(unit, metric.value as number, language)}</p>
            {compared ? (
              <p className={styles.kpiChange} data-direction={direction}>
                {direction === 'up' && <Icon name="up" className={styles.kpiArrow} />}
                {direction === 'down' && <Icon name="down" className={styles.kpiArrow} />}
                <span>
                  {direction === 'same' ? t.kpi.changeSame : fill(direction === 'up' ? t.kpi.changeUp : t.kpi.changeDown, { value: change ?? '' })}
                  {percent !== null && direction !== 'same' ? ` (${percent})` : ''} {t.kpi.versus}
                </span>
              </p>
            ) : (
              <p className={styles.kpiNote}>{metric.comparison === 'snapshot' ? t.kpi.snapshot : t.kpi.noComparison}</p>
            )}
            {compared && <p className={styles.kpiNote}>{fill(t.kpi.previous, { value: formatValue(unit, metric.previous as number, language) })}</p>}
            {trend && <Sparkline values={trend.points.map((point) => point.value)} />}
          </>
        ) : (
          <Unavailable reason={metric.reason} state={metric.state === 'not_permitted' ? 'not_permitted' : 'unavailable'} />
        )}
        <ScopeNote note={metric.filterNote} />
        <Definition help={help} />
        {available && metric.drill && (
          <Link className={styles.drill} to={metric.drill}>
            {t.actions.openRecords}
            <Icon name="right" className={styles.drillIcon} />
          </Link>
        )}
      </article>
    </li>
  )
}

/** One sum of money: a line per currency (each with its own amount and how many of the quotations carry one), never a single total. */
export function MoneyCard({ metric }: { metric: MoneyMetric }) {
  const t = useAnalyticsText()
  const language = useAnalyticsLanguage()
  const { label, help } = dictionary(t, metric.id, 'moneyMetrics')
  const available = metric.state === 'available'
  return (
    <li className={cx(styles.kpi, styles.kpiMoney)} data-state={metric.state}>
      <article aria-label={label}>
        <header className={styles.kpiHead}>
          <h3 className={styles.kpiLabel}>{label}</h3>
          {available && <KindBadge kind={metric.kind} />}
        </header>
        {available ? (
          metric.lines.length === 0 ? (
            <p className={styles.kpiNote}>{t.kpi.noAmounts}</p>
          ) : (
            <ul className={styles.currencies} aria-label={t.kpi.perCurrency}>
              {metric.lines.map((line) => (
                <li key={line.currency} className={styles.currency}>
                  <span className={styles.currencyName}>{(t.money as Record<string, string>)[line.currency] ?? line.currency}</span>
                  <span className={styles.kpiValue}>{formatMoney(line.minor, line.currency, language)}</span>
                  <span className={styles.kpiNote}>{fill(t.kpi.quotationsCount, { priced: line.priced, count: line.count })}</span>
                  {metric.comparison === 'period' && line.previousMinor !== null && <span className={styles.kpiNote}>{fill(t.kpi.previous, { value: formatMoney(line.previousMinor, line.currency, language) })}</span>}
                </li>
              ))}
            </ul>
          )
        ) : (
          <Unavailable reason={metric.reason} state={metric.state === 'not_permitted' ? 'not_permitted' : 'unavailable'} />
        )}
        {available && metric.withoutAmount > 0 && <p className={styles.kpiNote}>{fill(t.kpi.withoutAmount, { count: metric.withoutAmount })}</p>}
        {available && metric.comparison === 'snapshot' && <p className={styles.kpiNote}>{t.kpi.snapshot}</p>}
        <ScopeNote note={metric.filterNote} />
        <Definition help={help} />
        {available && metric.drill && (
          <Link className={styles.drill} to={metric.drill}>
            {t.actions.openRecords}
            <Icon name="right" className={styles.drillIcon} />
          </Link>
        )}
      </article>
    </li>
  )
}

/** What the figures cannot tell you: every limitation the server states, in words. */
export function Limitations({ codes }: { codes: readonly string[] }) {
  const t = useAnalyticsText()
  if (codes.length === 0) return null
  return (
    <section className={styles.limitations} aria-labelledby="analytics-limits">
      <h3 id="analytics-limits" className={styles.limitationsTitle}>
        {t.limitationsLabel}
      </h3>
      <ul>
        {codes.map((code) => (
          <li key={code}>{(t.limitations as Record<string, string>)[code] ?? humanize(code)}</li>
        ))}
      </ul>
    </section>
  )
}
