import { describe, expect, it } from 'vitest'
import { cell, sectionCsv } from '../src/modules/analytics/export.ts'
import { emptySection, flow, snapshot, unavailable } from '../src/modules/analytics/model.ts'
import { addDays, bucketsOf, resolvePeriod, startOfLocalDay, validDay } from '../src/modules/analytics/period.ts'

/**
 * PROMPT 32: the reporting periods and the CSV cell, as pure functions. The business zone in these tests is Europe/Budapest, whose clocks changed on 2026-03-29 (23-hour day) and
 * 2026-10-25 (25-hour day): a period edge must be the LOCAL midnight in UTC, and a series must have one bucket per local day, whatever the day's length.
 */

const ZONE = 'Europe/Budapest'
const at = (iso: string) => new Date(iso)

describe('local days in a business time zone', () => {
  it('turns a local midnight into the right UTC instant in winter and in summer', () => {
    expect(startOfLocalDay('2026-01-15', ZONE)).toBe('2026-01-14T23:00:00.000Z')
    expect(startOfLocalDay('2026-07-15', ZONE)).toBe('2026-07-14T22:00:00.000Z')
    expect(startOfLocalDay('2026-07-15', 'UTC')).toBe('2026-07-15T00:00:00.000Z')
    expect(startOfLocalDay('2026-07-15', 'America/New_York')).toBe('2026-07-15T04:00:00.000Z')
  })

  it('handles the days the clocks change: 23 and 25 hours, and a midnight right after the change', () => {
    const hours = (day: string) => (Date.parse(startOfLocalDay(addDays(day, 1), ZONE)) - Date.parse(startOfLocalDay(day, ZONE))) / 3_600_000
    expect(hours('2026-03-29')).toBe(23)
    expect(hours('2026-10-25')).toBe(25)
    expect(hours('2026-03-28')).toBe(24)
    expect(startOfLocalDay('2026-03-30', ZONE)).toBe('2026-03-29T22:00:00.000Z')
    expect(startOfLocalDay('2026-10-26', ZONE)).toBe('2026-10-25T23:00:00.000Z')
  })

  it('knows what day it is in the zone when UTC is already (or still) another day', () => {
    // 23:30 UTC on 3 Nov is already 4 Nov in Budapest (UTC+1).
    expect(resolvePeriod({ period: 'today' }, at('2026-11-03T23:30:00Z'), ZONE)).toMatchObject({ from: '2026-11-04', to: '2026-11-04', today: '2026-11-04' })
    expect(resolvePeriod({ period: 'today' }, at('2026-11-03T23:30:00Z'), 'UTC')).toMatchObject({ from: '2026-11-03', today: '2026-11-03' })
    // 00:30 UTC on 1 Jul is 02:30 in Budapest; 22:30 UTC on 30 Jun is 00:30 on 1 Jul (summer time, UTC+2).
    expect(resolvePeriod({ period: 'today' }, at('2026-06-30T22:30:00Z'), ZONE).today).toBe('2026-07-01')
  })

  it('rejects dates that do not exist', () => {
    expect(validDay('2026-02-29')).toBe(false)
    expect(validDay('2028-02-29')).toBe(true)
    expect(validDay('2026-13-01')).toBe(false)
    expect(validDay('2026-1-1')).toBe(false)
    expect(validDay("2026-01-01'; DROP TABLE quotes; --")).toBe(false)
  })
})

describe('presets and the previous equivalent period', () => {
  const now = at('2026-11-18T10:00:00Z')
  const period = (name: string) => resolvePeriod({ period: name }, now, ZONE)

  it('rolling ranges end today and are compared with the same number of days before', () => {
    expect(period('last_7_days')).toMatchObject({ from: '2026-11-12', to: '2026-11-18', days: 7, previous: { from: '2026-11-05', to: '2026-11-11', days: 7 } })
    expect(period('last_30_days')).toMatchObject({ from: '2026-10-20', to: '2026-11-18', days: 30, previous: { from: '2026-09-20', to: '2026-10-19' } })
    expect(period('last_90_days')).toMatchObject({ days: 90, previous: { days: 90 } })
    expect(period('today')).toMatchObject({ from: '2026-11-18', to: '2026-11-18', previous: { from: '2026-11-17', to: '2026-11-17' } })
    expect(period('yesterday')).toMatchObject({ from: '2026-11-17', to: '2026-11-17', previous: { from: '2026-11-16' } })
  })

  it('month and year to date are compared with the same elapsed days of the previous month and year', () => {
    expect(period('this_month')).toMatchObject({ from: '2026-11-01', to: '2026-11-18', days: 18, previous: { from: '2026-10-01', to: '2026-10-18', days: 18 } })
    expect(period('this_year')).toMatchObject({ from: '2026-01-01', to: '2026-11-18', previous: { from: '2025-01-01', to: '2025-11-18' } })
    expect(period('previous_month')).toMatchObject({ from: '2026-10-01', to: '2026-10-31', days: 31, previous: { from: '2026-09-01', to: '2026-09-30' } })
    expect(period('previous_year')).toMatchObject({ from: '2025-01-01', to: '2025-12-31', days: 365, previous: { from: '2024-01-01', to: '2024-12-31', days: 366 } })
  })

  it('month to date never reaches past the end of a shorter previous month', () => {
    const march = resolvePeriod({ period: 'this_month' }, at('2026-03-31T10:00:00Z'), ZONE)
    expect(march).toMatchObject({ from: '2026-03-01', to: '2026-03-31', previous: { from: '2026-02-01', to: '2026-02-28' } })
  })

  it('a period across the clock change has the right edges in UTC', () => {
    const march = resolvePeriod({ period: 'custom', from: '2026-03-28', to: '2026-03-30' }, now, ZONE)
    expect(march).toMatchObject({ fromUtc: '2026-03-27T23:00:00.000Z', toUtc: '2026-03-30T22:00:00.000Z', days: 3 })
    expect((Date.parse(march.toUtc) - Date.parse(march.fromUtc)) / 3_600_000).toBe(71)
  })

  it('validates a custom range and never falls back silently', () => {
    expect(resolvePeriod({ period: 'custom', from: '2026-01-01', to: '2026-01-31' }, now, ZONE).previous).toMatchObject({ from: '2025-12-01', to: '2025-12-31' })
    for (const bad of [{ period: 'custom' }, { period: 'custom', from: '2026-01-31', to: '2026-01-01' }, { period: 'custom', from: 'x', to: '2026-01-01' }, { period: 'custom', from: '2020-01-01', to: '2026-12-31' }, { period: 'next_week' }, { period: 'custom', from: '1999-01-01', to: '1999-02-01' }, { period: "last_7_days'; --" }]) {
      expect(() => resolvePeriod(bad, now, ZONE), JSON.stringify(bad)).toThrow()
    }
    // A custom range starting at the year 2000 has no valid previous period: the comparison is absent, not invented.
    expect(resolvePeriod({ period: 'custom', from: '2000-01-01', to: '2000-01-31' }, now, ZONE).previous).toBeNull()
  })
})

describe('the buckets of a series', () => {
  it('has one bucket per local day up to 62 days, whatever the day length', () => {
    const period = resolvePeriod({ period: 'custom', from: '2026-03-27', to: '2026-03-31' }, at('2026-11-18T10:00:00Z'), ZONE)
    const { granularity, buckets } = bucketsOf(period, ZONE)
    expect(granularity).toBe('day')
    expect(buckets.map((bucket) => bucket.key)).toEqual(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'])
    // Consecutive, with no gap and no overlap: each bucket ends where the next begins.
    for (let index = 1; index < buckets.length; index += 1) expect(buckets[index].fromUtc).toBe(buckets[index - 1].toUtc)
    expect(buckets[0].fromUtc).toBe(period.fromUtc)
    expect(buckets.at(-1)?.toUtc).toBe(period.toUtc)
  })

  it('uses local calendar months for longer ranges, clipping the first and the last to the period', () => {
    const period = resolvePeriod({ period: 'custom', from: '2026-01-15', to: '2026-04-10' }, at('2026-11-18T10:00:00Z'), ZONE)
    const { granularity, buckets } = bucketsOf(period, ZONE)
    expect(granularity).toBe('month')
    expect(buckets.map((bucket) => [bucket.key, bucket.from, bucket.to])).toEqual([
      ['2026-01', '2026-01-15', '2026-01-31'],
      ['2026-02', '2026-02-01', '2026-02-28'],
      ['2026-03', '2026-03-01', '2026-03-31'],
      ['2026-04', '2026-04-01', '2026-04-10'],
    ])
  })
})

describe('what a metric is, when it is not known', () => {
  it('keeps zero, unknown and not-permitted apart, and never divides by nothing', () => {
    expect(flow('a', 'actual', 0, 5)).toMatchObject({ state: 'available', value: 0, previous: 5, change: -5, changePercent: -100, comparison: 'period' })
    expect(flow('a', 'actual', 3, 0)).toMatchObject({ value: 3, previous: 0, change: 3, changePercent: null })
    expect(flow('a', 'actual', 3, null)).toMatchObject({ comparison: 'none', change: null, changePercent: null })
    expect(snapshot('a', 'actual', 4)).toMatchObject({ comparison: 'snapshot', previous: null })
    expect(unavailable('a', 'no_payment_data')).toMatchObject({ state: 'unavailable', value: null, reason: 'no_payment_data' })
  })
})

describe('the CSV cell', () => {
  it('defuses anything a spreadsheet would run as a formula, or read as a command', () => {
    for (const text of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', '\t=cmd', '\r=cmd', "=HYPERLINK(\"http://evil\",\"x\")", '=cmd|\' /C calc\'!A0']) {
      expect(cell(text).replace(/^"/, '').startsWith("'"), text).toBe(true)
    }
    expect(cell('=1+1')).toBe("'=1+1")
    expect(cell('normal text')).toBe('normal text')
    expect(cell('a, b')).toBe('"a, b"')
    expect(cell('say "hi"')).toBe('"say ""hi"""')
    expect(cell('two\nlines')).toBe('"two\nlines"')
    expect(cell(-5)).toBe('-5')
    expect(cell(null)).toBe('')
    expect(cell(Number.NaN)).toBe('')
    expect(cell('Árvíztűrő')).toBe('Árvíztűrő')
  })

  it('starts a file with what a reader needs, writes numbers as numbers, and defuses a hostile text in a row', () => {
    const section = emptySection('financial')
    section.metrics.push(unavailable('recordedRevenue', 'no_payment_data'), flow('x', 'estimate', 1.5, null))
    section.tables.push({ id: 't', columns: ['reference'], rows: [['=EVIL()']] })
    const period = resolvePeriod({ period: 'last_7_days' }, at('2026-11-18T10:00:00Z'), ZONE)
    const csv = sectionCsv(section, { generatedAt: '2026-11-18T10:00:00.000Z', period: { ...period }, previous: period.previous, currencyNote: 'never_summed_across_currencies' }, { currency: 'EUR', language: null, service: null, packageCode: null, projectStatus: null, quoteStatus: null, consultationStatus: null, lang: 'en' }, 'financial')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('# Report: financial')
    expect(csv).toContain('Business time zone: Europe/Budapest')
    expect(csv).toContain('Period: 2026-11-12 to 2026-11-18')
    expect(csv).toContain('Generated at: 2026-11-18T10:00:00.000Z')
    expect(csv).toContain('Filters: currency=EUR')
    expect(csv).toContain('NEVER added across currencies')
    expect(csv).toContain('recordedRevenue,actual,unavailable,,,,,none,no_payment_data')
    expect(csv).toContain('x,estimate,available,1.5')
    expect(csv).toContain("'=EVIL()")
    expect(csv).not.toMatch(/^=EVIL/m)
  })
})
