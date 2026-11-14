import { describe, expect, it } from 'vitest'
import { LANGUAGES, LOCALE_TAGS } from '../i18n/config'
import { formatDate, formatDay, formatMediumDate, formatMoment, formatPrice, formatStamp } from './format'

/**
 * One locale per language for every date and amount the site writes (PROMPT 23). A bare `en` used to write American dates on a
 * British-English site ("October 28, 2026", "11/14/26") in some places and British ones in others.
 */

const DAY = '2026-11-04T12:00:00Z'

describe('the locale of each language', () => {
  it('is one full tag per language, English British', () => {
    expect(LOCALE_TAGS).toEqual({ hu: 'hu-HU', en: 'en-GB', nl: 'nl-NL' })
    expect(Object.keys(LOCALE_TAGS)).toEqual([...LANGUAGES])
  })
})

describe('dates', () => {
  it('writes a calendar date day first in English, as the British spelling of the rest of the site does', () => {
    expect(formatDate('2026-10-28', 'en')).toBe('28 October 2026')
    expect(formatDay('2026-10-28', 'en')).toBe('28 October 2026')
    expect(formatDate('2026-10-28', 'hu')).toBe('2026. október 28.')
    expect(formatDate('2026-10-28', 'nl')).toBe('28 oktober 2026')
  })

  it('writes the short stamp of a kept work or a conversation the same way in each language, never American order', () => {
    const at = new Date(2026, 10, 4, 17, 41)
    expect(formatStamp('en', at)).toBe('04/11/2026, 17:41')
    expect(formatStamp('hu', at).replace(/\s/g, ' ')).toBe('2026. 11. 04. 17:41')
    expect(formatStamp('nl', at)).toBe('04-11-2026, 17:41')
    expect(formatStamp('en', at)).not.toMatch(/^11\//)
  })

  it('writes the medium date with the month named, so no reader has to guess day from month', () => {
    const at = new Date(2026, 10, 4)
    expect(formatMediumDate('en', at)).toBe('4 Nov 2026')
    expect(formatMediumDate('hu', at)).toMatch(/2026\. nov\. 4\./)
    expect(formatMediumDate('nl', at)).toBe('4 nov 2026')
  })

  it('writes a moment with its time, in the language', () => {
    expect(formatMoment(DAY, 'en')).toMatch(/^4 November 2026/)
    expect(formatMoment(DAY, 'nl')).toMatch(/4 november 2026/)
    expect(formatMoment(DAY, 'hu')).toMatch(/2026\. november 4\./)
  })
})

describe('amounts', () => {
  it('writes a whole-unit price the way each language does, with the same tag as the server\u2019s quotations', () => {
    const normal = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ')
    // The shapes differ by language (symbol before or after, the separator); the exact ICU data differs a little between Node and browsers.
    expect(normal(formatPrice(1500, 'EUR', 'en'))).toBe('€1,500')
    expect(normal(formatPrice(1500, 'EUR', 'hu'))).toMatch(/^1 ?500 (€|EUR)$/)
    expect(normal(formatPrice(1500, 'EUR', 'nl'))).toBe('€ 1.500')
  })
})
