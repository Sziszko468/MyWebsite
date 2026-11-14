import { describe, expect, it } from 'vitest'
import { buildHeadersFile } from '../security/headers'
import { consultationText } from '../content/consultation'
import { LANGUAGES } from '../i18n/config'
import { buildDocumentMeta } from '../routes/documentMeta'
import { resolveLanguageSwitch } from '../routes/languageSwitch'
import { CONSULTATION_PAGES, findPage, resolvePage } from '../routes/pages'
import { dictionaries } from '../i18n/dictionaries'
import { EVENT_NAMES } from '../analytics/events'
import { publicPage, sanitize } from '../analytics/tracker'
import { addDays, addMonths, dayLabel, firstOfMonth, instantClock, instantDay, instantKey, instantMoment, instantRange, isoWeekday, lastOfMonth, monthLabel, monthWeeks, sameDayIn, weekdayNames, zoneName } from './dates'
import { newSubmissionKey } from './api'

describe('calendar dates', () => {
  it('moves by calendar days, which no clock change makes 23 or 25 hours', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('moves by months and keeps the day when the month has it', () => {
    expect(addMonths('2026-11-14', 1)).toBe('2026-12-01')
    expect(addMonths('2026-12-14', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01')
    expect(firstOfMonth('2026-11-14')).toBe('2026-11-01')
    expect(lastOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(lastOfMonth('2028-02-10')).toBe('2028-02-29')
    expect(sameDayIn('2026-02-01', 31)).toBe('2026-02-28')
    expect(sameDayIn('2026-03-01', 31)).toBe('2026-03-31')
  })

  it('lays a month out Monday first, with empty cells around it', () => {
    const weeks = monthWeeks('2026-11-14')
    // 1 November 2026 is a Sunday: six empty cells, then the 1st; the month ends on a Monday.
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(weeks[1][0]).toBe('2026-11-02')
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks.flat().filter(Boolean)).toHaveLength(30)
    expect(weeks[weeks.length - 1].slice(0, 2)).toEqual(['2026-11-30', null])
    expect(isoWeekday('2026-11-01')).toBe(7)
    expect(isoWeekday('2026-11-02')).toBe(1)
  })

  it('names the weekdays Monday first, in each language', () => {
    expect(weekdayNames('en').map((day) => day.long)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    expect(weekdayNames('hu')[0].long).toBe('hétfő')
    expect(weekdayNames('nl')[6].long).toBe('zondag')
    expect(monthLabel('2026-11-14', 'en')).toBe('November 2026')
    expect(monthLabel('2026-11-14', 'nl')).toBe('november 2026')
    expect(monthLabel('2026-11-14', 'hu')).toBe('2026. november')
  })

  it('writes a day in the language\'s own long form, whatever zone the browser is in', () => {
    expect(dayLabel('2026-11-04', 'en', 'full')).toBe('Wednesday, 4 November 2026')
    expect(dayLabel('2026-11-04', 'hu', 'long')).toBe('2026. november 4.')
    expect(dayLabel('2026-11-04', 'nl', 'long')).toBe('4 november 2026')
  })
})

describe('instants in the owner\'s zone', () => {
  const nine = '2026-11-04T08:00:00.000Z'

  it('shows the clock of the zone the owner schedules in, never the visitor\'s', () => {
    expect(instantClock(nine, 'Europe/Budapest', 'en')).toBe('09:00')
    expect(instantClock(nine, 'Europe/Budapest', 'hu')).toBe('9:00')
    expect(instantClock(nine, 'Europe/Budapest', 'nl')).toBe('09:00')
    expect(instantClock(nine, 'America/New_York', 'en')).toBe('03:00')
    expect(instantClock(nine, 'UTC', 'en')).toBe('08:00')
    expect(instantRange(nine, '2026-11-04T08:30:00.000Z', 'Europe/Budapest', 'en')).toBe('09:00–09:30')
    expect(instantDay(nine, 'Europe/Budapest', 'en', 'long')).toBe('4 November 2026')
    expect(instantMoment(nine, 'Europe/Budapest', 'en')).toBe('4 November 2026 at 09:00')
  })

  it('changes the day where the zone does', () => {
    expect(instantKey('2026-11-14T23:30:00.000Z', 'Europe/Budapest')).toBe('2026-11-15')
    expect(instantKey('2026-11-14T23:30:00.000Z', 'UTC')).toBe('2026-11-14')
    expect(instantKey('2026-11-15T03:30:00.000Z', 'America/New_York')).toBe('2026-11-14')
  })

  it('tells a repeated hour apart by the zone\'s own short name', () => {
    // The clocks go back in Budapest on 25 October 2026: 02:00 happens at 00:00 UTC (summer time) and again at 01:00 UTC (winter time).
    const first = instantClock('2026-10-25T00:00:00.000Z', 'Europe/Budapest', 'en', true)
    const second = instantClock('2026-10-25T01:00:00.000Z', 'Europe/Budapest', 'en', true)
    expect(first).not.toBe(second)
    expect(first).toMatch(/^02:00/)
    expect(second).toMatch(/^02:00/)
    expect(instantClock('2026-10-25T00:00:00.000Z', 'Europe/Budapest', 'en')).toBe(instantClock('2026-10-25T01:00:00.000Z', 'Europe/Budapest', 'en'))
  })

  it('names the zone for the page', () => {
    expect(zoneName('Europe/Budapest', 'en', nine)).toBe('Europe/Budapest, Central European Standard Time')
    expect(zoneName('Europe/Budapest', 'en', '2026-07-04T08:00:00.000Z')).toBe('Europe/Budapest, Central European Summer Time')
    expect(zoneName('UTC', 'en', nine)).toMatch(/^UTC/)
  })
})

describe('a submission key', () => {
  it('is unique and in the form the server accepts', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newSubmissionKey()))
    expect(keys.size).toBe(50)
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9_-]{8,80}$/)
  })
})

describe('the booking pages in the site', () => {
  const secret = 'A'.repeat(43)

  it('registers the booking page (listed) and the customer\'s page (private, never listed)', () => {
    expect(CONSULTATION_PAGES.map((page) => [page.id, page.path, page.indexable])).toEqual([
      ['consultation', '/consultation', true],
      ['customer-booking', '/consultation/booking', false],
    ])
    for (const page of CONSULTATION_PAGES) expect(page.languages).toEqual(LANGUAGES)
    expect(findPage('/consultation/')?.id).toBe('consultation')
  })

  it('resolves an address with a secret to the private page, whatever the secret is, and nothing else', () => {
    expect(resolvePage(`/consultation/booking/${secret}`)?.id).toBe('customer-booking')
    expect(resolvePage(`/consultation/booking/${'abc_-'.repeat(8)}`)?.id).toBe('customer-booking')
    expect(resolvePage('/consultation/booking/short')).toBeUndefined()
    expect(resolvePage('/consultation/other')).toBeUndefined()
  })

  it('keeps the secret when the language is switched', () => {
    expect(resolveLanguageSwitch(`/hu/consultation/booking/${secret}`, 'en')).toEqual({ path: `/en/consultation/booking/${secret}`, samePage: true })
    expect(resolveLanguageSwitch('/hu/consultation', 'nl')).toEqual({ path: '/nl/consultation', samePage: true })
  })

  it('has a title and a description of its own in every language', () => {
    for (const lang of LANGUAGES) {
      const page = findPage('/consultation')
      const meta = buildDocumentMeta(page, lang, dictionaries[lang], 'Brand')
      expect(meta.title).toContain(consultationText.meta.title[lang])
      expect(meta.description).toBe(consultationText.meta.description[lang])
      expect(meta.description.length).toBeGreaterThan(40)
    }
    expect(new Set(LANGUAGES.map((lang) => consultationText.meta.title[lang])).size).toBe(3)
  })

  it('tells a static host to keep a booking link out of caches, search results and referrers', () => {
    const headers = buildHeadersFile({ connectOrigins: [], scriptHashes: [], styleHashes: [] } as never)
    for (const lang of LANGUAGES) expect(headers).toContain(`/${lang}/consultation/booking/*`)
    const block = headers.split('\n\n').find((part) => part.startsWith('/hu/consultation/booking/*')) ?? ''
    expect(block).toContain('Cache-Control: no-store')
    expect(block).toContain('X-Robots-Tag: noindex, nofollow')
    expect(block).toContain('Referrer-Policy: no-referrer')
  })
})

describe('what measurement may carry about a booking', () => {
  it("never sends the secret in a customer's address", () => {
    const secret = 'Zx9_-'.repeat(8) + 'abc'
    expect(publicPage(`/consultation/booking/${secret}`)).toBe('/consultation/booking')
    expect(publicPage(`/quote/${secret}`)).toBe('/quote')
    expect(publicPage('/consultation/')).toBe('/consultation/')
    expect(publicPage('/services')).toBe('/services')
  })

  it('lists the events, and keeps only an id, a number or a yes/no in each', () => {
    for (const name of ['consultation_type_viewed', 'booking_started', 'booking_slot_selected', 'booking_submitted', 'booking_confirmed', 'booking_cancel_requested', 'booking_reschedule_requested'] as const) expect(EVENT_NAMES).toContain(name)
    const clean = sanitize({ type: 'discovery', confirmed: true, name: 'Anna Kovács', email: 'anna@example.com', reference: 'BK-2026-000001', token: 'x'.repeat(43), description: 'A private description of the project' })
    expect(clean).toEqual({ type: 'discovery', confirmed: true })
  })
})
