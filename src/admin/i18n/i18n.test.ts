import { describe, expect, it } from 'vitest'
import { en } from './en'
import { hu } from './hu'
import { browserLanguage, fill, formatDateTime, formatNumber, statusLabel } from './index'

/** Every string of a dictionary by its path (`inquiries.detail.archive`), so the two languages can be held against each other. */
function flatten(value: unknown, path = ''): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (node: unknown, at: string) => {
    if (typeof node === 'string') out.set(at, node)
    else if (Array.isArray(node)) node.forEach((item, index) => visit(item, `${at}[${index}]`))
    else if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) visit(child, at ? `${at}.${key}` : key)
    else throw new Error(`${at}: a dictionary holds strings only (found ${typeof node})`)
  }
  visit(value, path)
  return out
}

const english = flatten(en)
const hungarian = flatten(hu)
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('the two interface languages', () => {
  it('have exactly the same keys', () => {
    expect([...hungarian.keys()].sort()).toEqual([...english.keys()].sort())
  })

  it('have no empty text', () => {
    for (const [dictionary, entries] of [['en', english], ['hu', hungarian]] as const) {
      const empty = [...entries].filter(([, text]) => text.trim() === '').map(([key]) => key)
      expect(empty, `${dictionary}: empty strings`).toEqual([])
    }
  })

  it('use the same placeholders in every sentence', () => {
    const different = [...english].filter(([key, text]) => JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(hungarian.get(key) ?? ''))).map(([key]) => key)
    expect(different).toEqual([])
  })

  it('never leave a placeholder open or a template literal in the text', () => {
    for (const entries of [english, hungarian]) {
      const broken = [...entries].filter(([, text]) => /\$\{|\{\s*\}|undefined|\[object/.test(text) || (text.match(/\{/g) ?? []).length !== (text.match(/\}/g) ?? []).length).map(([key]) => key)
      expect(broken).toEqual([])
    }
  })

  it('did not forget to translate a sentence (a long text that is identical in both)', () => {
    const same = [...english].filter(([key, text]) => text.length > 40 && text === hungarian.get(key)).map(([key]) => key)
    expect(same).toEqual([])
  })

  it('say that e-mail was accepted by the provider, never that it was delivered', () => {
    const claims = [...english, ...hungarian].filter(([, text]) => /\bdelivered\b|kézbesítve volt|megérkezett/i.test(text) && !/not|never|nem|sem/i.test(text)).map(([key]) => key)
    expect(claims).toEqual([])
  })
})

describe('fill', () => {
  it('replaces named placeholders and leaves nothing open', () => {
    expect(fill('{count} of {max}', { count: 3, max: 10 })).toBe('3 of 10')
  })
})

describe('browserLanguage', () => {
  it.each([
    [['hu-HU', 'en'], 'hu'],
    [['en-GB'], 'en'],
    [['nl-NL', 'hu'], 'hu'],
    [['de-DE'], 'en'],
    [[], 'en'],
  ])('%j is %s', (languages, expected) => {
    expect(browserLanguage(languages as string[])).toBe(expected)
  })
})

describe('formats', () => {
  it('writes an instant in the administrator’s language, and a dash for nothing or nonsense', () => {
    expect(formatDateTime('2026-11-03T16:27:00Z', 'en')).toMatch(/2026/)
    expect(formatDateTime('2026-11-03T16:27:00Z', 'hu')).toMatch(/2026/)
    expect(formatDateTime(null, 'en')).toBe('—')
    expect(formatDateTime('not a date', 'hu')).toBe('—')
  })

  it('groups thousands the local way', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567')
    expect(formatNumber(1234567, 'hu').replace(/\s/g, ' ')).toBe('1 234 567')
  })

  it('shows a status the application does not know as it is', () => {
    expect(statusLabel(en, 'inquiry', 'new')).toBe(en.status.inquiry.new)
    expect(statusLabel(en, 'inquiry', 'from_the_future')).toBe('from_the_future')
  })
})
