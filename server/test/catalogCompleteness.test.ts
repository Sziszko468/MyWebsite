import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../src/config.ts'
import { HttpError } from '../src/http/errors.ts'
import { parseExtra, parsePackage, parseService } from '../src/modules/catalog/admin.ts'
import { languageGaps, PUBLISH_FIELDS } from '../src/modules/catalog/completeness.ts'

/**
 * PROMPT 18: what is on the website says the same in Hungarian, English and Dutch. A published (`active`) record must be complete in
 * every language; a `disabled` one is a draft and may be saved half-finished. The rule is the translation screen's own definition of
 * "missing": empty here while another language has it. A field that is empty in every language is left alone.
 */

const all = (value: Record<string, unknown>): Record<string, Record<string, unknown>> => Object.fromEntries(LANGUAGES.map((language) => [language, value]))
const service = (translations: Record<string, Record<string, unknown>>, status = 'active') => ({ slug: 'demo', category: 'web', status, position: 0, packages: [], translations })
const fields = (extra: Record<string, unknown> = {}) => ({ title: 'T', summary: 'S', tagline: 'G', overview: 'O', features: ['one'], ...extra })

function refused(work: () => unknown): Record<string, string> {
  try {
    work()
  } catch (error) {
    if (error instanceof HttpError) return ((error.details as { fields?: Record<string, string> } | undefined)?.fields ?? {}) as Record<string, string>
    throw error
  }
  return {}
}

describe('the gaps in a record’s languages', () => {
  it('names each language that lacks what another has', () => {
    const gaps = languageGaps({ hu: { title: 'a', summary: 'b' }, en: { title: 'a', summary: '' }, nl: { title: '', summary: '' } }, ['title', 'summary'])
    expect(gaps).toEqual([{ language: 'nl', field: 'title' }, { language: 'en', field: 'summary' }, { language: 'nl', field: 'summary' }])
  })

  it('leaves alone a field that is empty in every language, and whitespace counts as empty', () => {
    expect(languageGaps({ hu: { note: '' }, en: { note: ' ' }, nl: { note: null } }, ['note'])).toEqual([])
    expect(languageGaps({ hu: { note: 'x' }, en: { note: '  ' }, nl: { note: 'y' } }, ['note'])).toEqual([{ language: 'en', field: 'note' }])
  })

  it('treats a list with items as filled and an empty list as empty', () => {
    expect(languageGaps({ hu: { features: ['a'] }, en: { features: [] }, nl: { features: ['b'] } }, ['features'])).toEqual([{ language: 'en', field: 'features' }])
  })

  it('knows the fields of every kind of record', () => {
    expect(Object.keys(PUBLISH_FIELDS).sort()).toEqual(['content', 'extra', 'package', 'service'])
  })
})

describe('publishing a service', () => {
  it('accepts a service that is complete in all three languages', () => {
    expect(() => parseService(service(all(fields())))).not.toThrow()
  })

  it('refuses a published service with a missing language version and says which one, on which field', () => {
    const translations = { hu: fields(), en: fields(), nl: fields({ tagline: '', features: [] }) }
    expect(refused(() => parseService(service(translations)))).toEqual({ 'translations.nl.tagline': 'required', 'translations.nl.features': 'required' })
  })

  it('keeps a draft: the same half-finished service is accepted while it is disabled', () => {
    const translations = { hu: fields(), en: fields(), nl: fields({ tagline: '' }) }
    expect(() => parseService(service(translations, 'disabled'))).not.toThrow()
  })

  it('does not ask for a field that is empty everywhere', () => {
    expect(() => parseService(service(all(fields({ tagline: '', features: [] }))))).not.toThrow()
  })
})

describe('publishing a package and an add-on', () => {
  const pack = (nl: Record<string, unknown>, status = 'active') => ({
    code: 'demo',
    status,
    price: { kind: 'quote' },
    translations: { hu: packageFields(), en: packageFields(), nl },
  })
  function packageFields(extra: Record<string, unknown> = {}) {
    return { name: 'Demo', tagline: 't', audience: 'a', scope: 's', customization: 'c', support: 'u', includes: ['i'], fits: ['f'], deliverables: ['d'], ...extra }
  }

  it('refuses a published package whose Dutch audience is empty, and accepts it as a draft', () => {
    expect(refused(() => parsePackage(pack(packageFields({ audience: '' }))))).toEqual({ 'translations.nl.audience': 'required' })
    expect(() => parsePackage(pack(packageFields({ audience: '' }), 'disabled'))).not.toThrow()
  })

  it('refuses a published add-on with a summary in one language only', () => {
    const extra = (status: string) => ({ code: 'demo', status, price: { kind: 'quote' }, translations: { hu: { name: 'N', summary: 'S' }, en: { name: 'N', summary: 'S' }, nl: { name: 'N', summary: '' } } })
    expect(refused(() => parseExtra(extra('active')))).toEqual({ 'translations.nl.summary': 'required' })
    expect(() => parseExtra(extra('disabled'))).not.toThrow()
  })
})
