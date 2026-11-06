import { describe, expect, it } from 'vitest'
import { dictionaries } from '../../i18n/dictionaries'
import { LANGUAGES } from '../../i18n/config'
import { COMPLETION, weaker } from './architecture'
import { fill, formatDate, pad } from '../../utils/format'

describe('fill', () => {
  it('fills named placeholders and leaves unknown ones as written', () => {
    expect(fill('{current} / {total}', { current: 2, total: 9 })).toBe('2 / 9')
    expect(fill('Open: {title} {missing}', { title: 'Budgets' })).toBe('Open: Budgets {missing}')
  })

  it.each(LANGUAGES)('every placeholder in the %s project texts is one the code fills', (lang) => {
    const project = dictionaries[lang].project
    const known = new Set(['name', 'date', 'title', 'current', 'total', 'state'])
    const all = JSON.stringify(project).matchAll(/\{(\w+)\}/g)
    for (const match of all) expect(known.has(match[1]), `${lang}: {${match[1]}}`).toBe(true)
  })
})

describe('formatDate', () => {
  it('writes the review date in each language without a time-zone shift', () => {
    expect(formatDate('2026-10-28', 'en')).toContain('28')
    expect(formatDate('2026-10-28', 'hu')).toContain('október')
    expect(formatDate('2026-10-28', 'nl')).toContain('oktober')
    expect(formatDate('2026-01-01', 'en')).toContain('1')
  })
})

describe('pad', () => {
  it('makes an editorial number', () => {
    expect(pad(1)).toBe('01')
    expect(pad(12)).toBe('12')
  })
})

describe('architecture status', () => {
  it('maps a part’s words onto the shared three states', () => {
    expect(COMPLETION).toEqual({ built: 'done', partial: 'partial', planned: 'planned' })
  })

  it('takes a connection as real as its weaker end', () => {
    expect(weaker('built', 'built')).toBe('built')
    expect(weaker('built', 'partial')).toBe('partial')
    expect(weaker('partial', 'planned')).toBe('planned')
    expect(weaker('planned', 'built')).toBe('planned')
  })
})
