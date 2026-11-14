import { useCallback, useEffect, useRef, useState } from 'react'
import { lastOfMonth, type DateKey } from './dates'
import type { Day, Result } from './api'

type Entry = Day[] | 'failed'
interface Store {
  scope: string | null
  months: Record<DateKey, Entry>
}

const NONE: Record<DateKey, Entry> = {}

/**
 * The days of one month, for a scope (a consultation type, or a booking being moved), fetched when the month comes on show and kept while the scope
 * stays the same. A different scope starts empty. "Loading" and "failed" are read off what has arrived, not set by hand, and the month is only ever
 * stored when an answer comes back, so nothing renders from a stale month and a late answer for an old scope is dropped.
 *
 * `onLoaded` is told when a month arrives (the booking page uses it to move on from a month with nothing to choose).
 */
export function useMonthDays(
  scope: string | null,
  month: DateKey,
  load: (scope: string, from: DateKey, to: DateKey) => Promise<Result<{ days: Day[] }>>,
  onLoaded?: (month: DateKey, days: Day[]) => void,
  /** Whether to ask now (the booking page asks only on the step that shows the calendar, and keeps what it was told for the later steps). */
  enabled = true,
) {
  const [store, setStore] = useState<Store>({ scope, months: NONE })
  const latest = useRef(onLoaded)
  useEffect(() => {
    latest.current = onLoaded
  })
  const months = store.scope === scope ? store.months : NONE
  const entry = months[month]

  useEffect(() => {
    if (!enabled || scope === null || entry !== undefined) return
    let live = true
    void load(scope, month, lastOfMonth(month)).then((result) => {
      if (!live) return
      setStore((previous) => ({ scope, months: { ...(previous.scope === scope ? previous.months : NONE), [month]: result.ok ? result.data.days : 'failed' } }))
      if (result.ok) latest.current?.(month, result.data.days)
    })
    return () => {
      live = false
    }
  }, [scope, month, entry, load, enabled])

  /** Forgets a month, so it is asked for again (after a failure, or after a time turned out to be taken). */
  const refresh = useCallback(
    (which: DateKey) =>
      setStore((previous) => {
        const { [which]: _gone, ...rest } = previous.months
        return { scope: previous.scope, months: rest }
      }),
    [],
  )

  const days: Record<DateKey, Day> = {}
  if (Array.isArray(entry)) for (const day of entry) days[day.date] = day
  return { days, loading: enabled && scope !== null && entry === undefined, failed: entry === 'failed', refresh }
}
