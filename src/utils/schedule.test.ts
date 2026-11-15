import { describe, expect, it } from 'vitest'
import { addDays, buildSchedule, daysBetween, isDay, isOverdue } from './schedule'

describe('the days', () => {
  it('knows what a day is and refuses the rest', () => {
    expect(isDay('2026-11-03')).toBe(true)
    for (const value of ['2026-13-01', '2026-02-30x', '03-11-2026', '', null, undefined]) expect(isDay(value as string | null)).toBe(false)
  })

  it('counts whole days across a month, a year and the clocks changing', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
    expect(daysBetween('2026-11-05', '2026-11-03')).toBe(-2)
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('says overdue only for what is not done and past its day', () => {
    expect(isOverdue('2026-11-02', '2026-11-03', false)).toBe(true)
    expect(isOverdue('2026-11-03', '2026-11-03', false)).toBe(false)
    expect(isOverdue('2026-11-02', '2026-11-03', true)).toBe(false)
    expect(isOverdue(null, '2026-11-03', false)).toBe(false)
  })
})

describe('a schedule', () => {
  it('has no range, no rows and no marker when nothing has a date; everything is listed as unscheduled', () => {
    const schedule = buildSchedule([{ id: 'a', title: 'A', startOn: null, dueOn: null }], '2026-11-03')
    expect(schedule.range).toBeNull()
    expect(schedule.rows).toEqual([])
    expect(schedule.today).toBeNull()
    expect(schedule.unscheduled.map((item) => item.id)).toEqual(['a'])
  })

  it('draws a span from its start to its due day, inclusive, in percent of the range', () => {
    const schedule = buildSchedule(
      [
        { id: 'a', title: 'A', startOn: '2026-11-02', dueOn: '2026-11-06' },
        { id: 'b', title: 'B', startOn: '2026-11-09', dueOn: '2026-11-11' },
      ],
      '2026-11-04',
    )
    expect(schedule.range).toEqual({ from: '2026-11-02', to: '2026-11-11', days: 10 })
    const [a, b] = schedule.rows
    expect([a.left, a.width]).toEqual([0, 50])
    expect([b.left, b.width]).toEqual([70, 30])
    expect(a.point).toBe(false)
    expect(schedule.today).toBe(20)
    // A week starts on Monday: the 2nd (the first day drawn) and the 9th.
    expect(schedule.ticks).toEqual([
      { at: '2026-11-02', kind: 'week', left: 0 },
      { at: '2026-11-09', kind: 'week', left: 70 },
    ])
  })

  it('draws a date with only one end as a point on that day, never as a span from nowhere', () => {
    const schedule = buildSchedule(
      [
        { id: 'due', title: 'Due only', startOn: null, dueOn: '2026-11-10' },
        { id: 'start', title: 'Start only', startOn: '2026-11-02', dueOn: null },
      ],
      '2026-11-01',
    )
    const byId = Object.fromEntries(schedule.rows.map((row) => [row.id, row]))
    expect([byId.due.from, byId.due.to, byId.due.point]).toEqual(['2026-11-10', '2026-11-10', true])
    expect([byId.start.from, byId.start.to, byId.start.point]).toEqual(['2026-11-02', '2026-11-02', true])
  })

  it('reads dates the wrong way round as the span between them, and a single day as a point', () => {
    const [reversed] = buildSchedule([{ id: 'r', title: 'R', startOn: '2026-11-10', dueOn: '2026-11-05' }], '2026-11-01').rows
    expect([reversed.from, reversed.to]).toEqual(['2026-11-05', '2026-11-10'])
    const [same] = buildSchedule([{ id: 's', title: 'S', startOn: '2026-11-05', dueOn: '2026-11-05' }], '2026-11-01').rows
    expect(same.point).toBe(true)
  })

  it('marks overdue by the end day, never what is done, and leaves cancelled things out altogether', () => {
    const schedule = buildSchedule(
      [
        { id: 'late', title: 'Late', startOn: null, dueOn: '2026-11-01' },
        { id: 'done', title: 'Done', startOn: null, dueOn: '2026-11-01', done: true },
        { id: 'gone', title: 'Gone', startOn: null, dueOn: '2026-11-01', cancelled: true },
        { id: 'today', title: 'Today', startOn: null, dueOn: '2026-11-03' },
      ],
      '2026-11-03',
    )
    const byId = Object.fromEntries(schedule.rows.map((row) => [row.id, row]))
    expect(byId.late.overdue).toBe(true)
    expect(byId.done.overdue).toBe(false)
    expect(byId.today.overdue).toBe(false)
    expect(byId.gone).toBeUndefined()
    expect(schedule.unscheduled).toEqual([])
  })

  it('never lets a bar be thinner than it can be seen, or run past the end of the range', () => {
    const schedule = buildSchedule(
      [
        { id: 'long', title: 'Long', startOn: '2026-01-01', dueOn: '2026-12-31' },
        { id: 'short', title: 'Short', startOn: '2026-12-31', dueOn: '2026-12-31' },
      ],
      '2026-06-01',
    )
    for (const row of schedule.rows) {
      expect(row.width).toBeGreaterThanOrEqual(1.6)
      expect(row.left + row.width).toBeLessThanOrEqual(100.0001)
    }
    // Months, not weeks, once the range is long.
    expect(schedule.ticks.every((tick) => tick.kind === 'month')).toBe(true)
    expect(schedule.ticks).toHaveLength(12)
  })

  it('puts today in the range only when it is near what is drawn', () => {
    const near = buildSchedule([{ id: 'a', title: 'A', startOn: '2026-11-10', dueOn: '2026-11-12' }], '2026-11-01')
    expect(near.range?.from).toBe('2026-11-01')
    expect(near.today).toBe(0)
    const far = buildSchedule([{ id: 'a', title: 'A', startOn: '2026-11-10', dueOn: '2026-11-12' }], '2027-06-01')
    expect(far.today).toBeNull()
    expect(far.range).toEqual({ from: '2026-11-10', to: '2026-11-12', days: 3 })
  })

  it('orders the rows by start, then end, then title, whatever order they came in', () => {
    const schedule = buildSchedule(
      [
        { id: 'c', title: 'C', startOn: '2026-11-05', dueOn: '2026-11-09' },
        { id: 'a2', title: 'B', startOn: '2026-11-02', dueOn: '2026-11-04' },
        { id: 'a1', title: 'A', startOn: '2026-11-02', dueOn: '2026-11-04' },
      ],
      '2026-11-03',
    )
    expect(schedule.rows.map((row) => row.id)).toEqual(['a1', 'a2', 'c'])
  })

  it('keeps milestones and tasks apart in the rows and says what each is', () => {
    const schedule = buildSchedule([{ id: 'm', title: 'Launch', startOn: null, dueOn: '2026-12-01', kind: 'milestone' }], '2026-11-03')
    expect(schedule.rows[0].kind).toBe('milestone')
  })
})
