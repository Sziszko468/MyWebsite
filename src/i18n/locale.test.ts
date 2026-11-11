import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES } from './config'
import {
  COUNTRY_LANGUAGES,
  LANGUAGE_COOKIE,
  languageCookie,
  languageForCountry,
  resolveInitialLanguage,
  savedLanguageFromCookies,
} from './locale'

describe('the language of a country', () => {
  it('is Hungarian for Hungary, Dutch for the Netherlands', () => {
    expect(languageForCountry('HU')).toBe('hu')
    expect(languageForCountry('NL')).toBe('nl')
  })

  it.each(['DE', 'FR', 'US', 'GB', 'BE', 'AT', 'RO', 'SK', 'CN', 'BR'])('is English for %s', (country) => {
    expect(languageForCountry(country)).toBe('en')
  })

  it('is English when the country is not known', () => {
    for (const unknown of [undefined, null, '', ' ', 'XX', 'T1', 'xx', 'HUN', 'H', '12', 'hu-HU', 42, {}, ['HU']]) {
      expect(languageForCountry(unknown), String(unknown)).toBe('en')
    }
  })

  it('reads a lower-case or padded code, as a proxy may write it', () => {
    expect(languageForCountry('hu')).toBe('hu')
    expect(languageForCountry(' nl ')).toBe('nl')
  })

  it('maps nothing but Hungary and the Netherlands away from English', () => {
    expect(Object.keys(COUNTRY_LANGUAGES).sort()).toEqual(['HU', 'NL'])
    expect(DEFAULT_LANGUAGE).toBe('en')
  })
})

describe('the saved language in a Cookie header', () => {
  it('is read when it is one of the three languages', () => {
    for (const language of LANGUAGES) expect(savedLanguageFromCookies(`${LANGUAGE_COOKIE}=${language}`)).toBe(language)
  })

  it('is found among other cookies', () => {
    expect(savedLanguageFromCookies(`theme=dark; ${LANGUAGE_COOKIE}=nl; other=1`)).toBe('nl')
  })

  it('is ignored when it is missing, empty or not a language', () => {
    for (const header of [undefined, null, '', 'theme=dark', `${LANGUAGE_COOKIE}=`, `${LANGUAGE_COOKIE}=de`, `${LANGUAGE_COOKIE}=HU`, `x${LANGUAGE_COOKIE}=hu`, `${LANGUAGE_COOKIE}x=hu`]) {
      expect(savedLanguageFromCookies(header), String(header)).toBeNull()
    }
  })
})

describe('the starting language', () => {
  it('follows the country when nothing is saved', () => {
    expect(resolveInitialLanguage({ country: 'HU' })).toEqual({ language: 'hu', source: 'country' })
    expect(resolveInitialLanguage({ country: 'NL' })).toEqual({ language: 'nl', source: 'country' })
    expect(resolveInitialLanguage({ country: 'DE' })).toEqual({ language: 'en', source: 'fallback' })
    expect(resolveInitialLanguage({ country: 'US' })).toEqual({ language: 'en', source: 'fallback' })
    expect(resolveInitialLanguage({})).toEqual({ language: 'en', source: 'fallback' })
    expect(resolveInitialLanguage({ country: 'XX' })).toEqual({ language: 'en', source: 'fallback' })
  })

  it('lets a saved choice beat the country, in both directions', () => {
    expect(resolveInitialLanguage({ saved: 'en', country: 'HU' })).toEqual({ language: 'en', source: 'saved' })
    expect(resolveInitialLanguage({ saved: 'hu', country: 'DE' })).toEqual({ language: 'hu', source: 'saved' })
    expect(resolveInitialLanguage({ saved: 'nl', country: 'NL' })).toEqual({ language: 'nl', source: 'saved' })
    expect(resolveInitialLanguage({ saved: 'nl' })).toEqual({ language: 'nl', source: 'saved' })
  })

  it('treats a saved value that is not a language as no saved value', () => {
    expect(resolveInitialLanguage({ saved: 'de', country: 'HU' })).toEqual({ language: 'hu', source: 'country' })
    expect(resolveInitialLanguage({ saved: '', country: 'NL' })).toEqual({ language: 'nl', source: 'country' })
    expect(resolveInitialLanguage({ saved: null, country: 'FR' })).toEqual({ language: 'en', source: 'fallback' })
  })
})

describe('the cookie that remembers a choice', () => {
  it('holds the language and nothing about the visitor, for a year, on the whole site, first party', () => {
    expect(languageCookie('hu', { secure: false })).toBe('cc_lang=hu; Path=/; Max-Age=31536000; SameSite=Lax')
    expect(languageCookie('nl', { secure: true })).toBe('cc_lang=nl; Path=/; Max-Age=31536000; SameSite=Lax; Secure')
  })

  it('reads back what it wrote', () => {
    for (const language of LANGUAGES) {
      const written = languageCookie(language, { secure: true }).split(';')[0]
      expect(savedLanguageFromCookies(written)).toBe(language)
    }
  })
})
