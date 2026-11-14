import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { addDays, addMonths, dayLabel, firstOfMonth, isoWeekday, lastOfMonth, monthLabel, monthWeeks, sameDayIn, weekdayNames, type DateKey } from '../../booking/dates'
import type { Day } from '../../booking/api'
import type { ConsultationWords } from '../../booking/hooks'
import type { Language } from '../../i18n/config'
import { cx } from '../../utils/cx'
import { fill } from '../../utils/format'
import styles from './Consultation.module.scss'

interface CalendarProps {
  lang: Language
  words: ConsultationWords
  /** The month shown (any date in it). */
  month: DateKey
  /** What the server said about each day of the month; a day it did not mention is not offered. */
  days: Record<DateKey, Day>
  selected: DateKey | null
  /** The first and last month the visitor may move to (the booking horizon). */
  firstMonth: DateKey
  lastMonth: DateKey
  loading: boolean
  failed: boolean
  onMonth: (month: DateKey) => void
  onSelect: (date: DateKey) => void
  onRetry: () => void
}

/**
 * A month of days, Monday first. A day says what it is in words as well as in its look (free, fully booked, not available, selected); only a day with
 * free times can be chosen. It is one control for the keyboard: the arrow keys move between days, Home and End go to the ends of the week, Page Up
 * and Page Down change the month, and a day that cannot be chosen can still be reached and read.
 */
export function Calendar({ lang, words, month, days, selected, firstMonth, lastMonth, loading, failed, onMonth, onSelect, onRetry }: CalendarProps) {
  const headingId = useId()
  const grid = useRef<HTMLTableElement>(null)
  const weeks = useMemo(() => monthWeeks(month), [month])
  const names = useMemo(() => weekdayNames(lang), [lang])
  const monthStart = firstOfMonth(month)
  const monthEnd = lastOfMonth(month)
  const t = words.time

  // Which day takes the Tab key: the selected one, else the first day that can be chosen, else the first of the month.
  const initial = selected && selected >= monthStart && selected <= monthEnd ? selected : (Object.values(days).find((day) => day.status === 'available')?.date ?? monthStart)
  const [focusKey, setFocus] = useState<DateKey | null>(null)
  const focus = focusKey && focusKey >= monthStart && focusKey <= monthEnd ? focusKey : initial
  const wantsFocus = useRef(false)

  useEffect(() => {
    if (!wantsFocus.current) return
    wantsFocus.current = false
    grid.current?.querySelector<HTMLButtonElement>(`button[data-key="${focus}"]`)?.focus()
  }, [focus, month])

  const move = (key: DateKey) => {
    wantsFocus.current = true
    if (key < monthStart || key > monthEnd) {
      const target = firstOfMonth(key)
      if (target < firstOfMonth(firstMonth) || target > firstOfMonth(lastMonth)) {
        wantsFocus.current = false
        return
      }
      onMonth(target)
    }
    setFocus(key)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (event.key in steps) {
      event.preventDefault()
      move(addDays(focus, steps[event.key]))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const offset = isoWeekday(focus) - 1
      move(event.key === 'Home' ? addDays(focus, -offset) : addDays(focus, 6 - offset))
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      move(sameDayIn(addMonths(focus, event.key === 'PageUp' ? -1 : 1), Number(focus.slice(8))))
    }
  }

  const stateText = (day: Day | undefined, key: DateKey): string => {
    if (key === selected) return t.daySelected
    if (!day) return t.dayClosed
    return day.status === 'available' ? t.dayAvailable : day.status === 'full' ? t.dayFull : t.dayClosed
  }

  const previousDisabled = firstOfMonth(month) <= firstOfMonth(firstMonth)
  const nextDisabled = firstOfMonth(month) >= firstOfMonth(lastMonth)

  return (
    <div className={styles.calendar} aria-busy={loading}>
      <div className={styles.monthBar}>
        <button type="button" className={styles.monthButton} onClick={() => onMonth(addMonths(month, -1))} disabled={previousDisabled} aria-label={t.previousMonth}>
          <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
            <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h3 id={headingId} className={styles.monthTitle} aria-live="polite">
          {monthLabel(month, lang)}
        </h3>
        <button type="button" className={styles.monthButton} onClick={() => onMonth(addMonths(month, 1))} disabled={nextDisabled} aria-label={t.nextMonth}>
          <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
            <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {failed ? (
        <div className={styles.notice} role="alert">
          <p>{t.daysFailed}</p>
          <button type="button" className={styles.linkButton} onClick={onRetry}>
            {t.retry}
          </button>
        </div>
      ) : (
        <table ref={grid} className={styles.grid} role="grid" aria-label={fill(t.calendar, { month: monthLabel(month, lang) })} onKeyDown={onKeyDown}>
          <thead>
            <tr>
              {names.map((name) => (
                <th key={name.long} scope="col" abbr={name.long} className={styles.weekday}>
                  {name.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => (
              <tr key={index}>
                {week.map((key, column) => {
                  if (key === null) return <td key={column} className={styles.cellEmpty} />
                  const day = days[key]
                  const chosen = key === selected
                  const available = day?.status === 'available'
                  const state = chosen ? 'selected' : (day?.status ?? 'closed')
                  return (
                    <td key={key} className={styles.cell}>
                      <button
                        type="button"
                        className={cx(styles.day, styles[`day_${state}`])}
                        data-key={key}
                        data-state={state}
                        tabIndex={key === focus ? 0 : -1}
                        aria-pressed={available || chosen ? chosen : undefined}
                        aria-disabled={available || chosen ? undefined : true}
                        aria-label={`${dayLabel(key, lang, 'full')}, ${stateText(day, key)}`}
                        onFocus={() => setFocus(key)}
                        onClick={() => {
                          if (available) onSelect(key)
                        }}
                      >
                        <span aria-hidden="true">{Number(key.slice(8))}</span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {loading && !failed && <p className={styles.muted}>{t.loadingDays}</p>}

      <ul className={styles.legend} aria-label={t.legend}>
        <li>
          <span className={cx(styles.swatch, styles.swatchAvailable)} aria-hidden="true" />
          {t.available}
        </li>
        <li>
          <span className={cx(styles.swatch, styles.swatchSelected)} aria-hidden="true" />
          {t.selected}
        </li>
        <li>
          <span className={cx(styles.swatch, styles.swatchFull)} aria-hidden="true" />
          {t.full}
        </li>
        <li>
          <span className={cx(styles.swatch, styles.swatchClosed)} aria-hidden="true" />
          {t.closed}
        </li>
      </ul>
    </div>
  )
}
