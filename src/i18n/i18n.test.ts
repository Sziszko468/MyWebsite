import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES, isLanguage } from './config'
import { dictionaries } from './dictionaries'
import { localizedPath, splitLanguage } from './paths'

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
    {},
  )
}

describe('languages', () => {
  it('supports hu, en and nl with English as the fallback for every visitor the site cannot place', () => {
    expect([...LANGUAGES]).toEqual(['hu', 'en', 'nl'])
    expect(DEFAULT_LANGUAGE).toBe('en')
  })

  it('recognises only supported languages', () => {
    expect(isLanguage('nl')).toBe(true)
    expect(isLanguage('de')).toBe(false)
    expect(isLanguage(undefined)).toBe(false)
  })
})

describe('dictionaries', () => {
  const reference = flatten(dictionaries[DEFAULT_LANGUAGE])

  it.each(LANGUAGES)('%s has exactly the same keys as the fallback language', (lang) => {
    expect(Object.keys(flatten(dictionaries[lang])).sort()).toEqual(Object.keys(reference).sort())
  })

  it.each(LANGUAGES)('%s has no empty strings', (lang) => {
    for (const [key, value] of Object.entries(flatten(dictionaries[lang]))) {
      expect(value.trim(), `${lang}:${key}`).not.toBe('')
    }
  })
})

describe('paths', () => {
  it('builds localized paths', () => {
    expect(localizedPath('hu')).toBe('/hu/')
    expect(localizedPath('en', '/')).toBe('/en/')
    expect(localizedPath('nl', '/design-system')).toBe('/nl/design-system')
    expect(localizedPath('nl', 'design-system/')).toBe('/nl/design-system')
  })

  it('splits the language prefix', () => {
    expect(splitLanguage('/en/services')).toEqual({ lang: 'en', rest: '/services' })
    expect(splitLanguage('/en')).toEqual({ lang: 'en', rest: '/' })
    expect(splitLanguage('/services')).toEqual({ lang: null, rest: '/services' })
  })
})
