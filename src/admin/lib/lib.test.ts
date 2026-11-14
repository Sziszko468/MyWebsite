import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../../i18n/config'
import { ApiError } from '../api/client'
import { describeActivity } from '../components/ActivityTimeline'
import { NAVIGATION, navLabel, shortNavLabel } from '../components/navigation'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { EXTRA_FIELDS, FAQ_FIELDS, PACKAGE_FIELDS, SERVICE_FIELDS, emptyValue, faqBody, fromForm, incompleteLanguages, linesOf, moved, packageBody, priceBody, priceToForm, toForm } from './catalog'
import { describeError, errorReference, fieldErrors } from './errors'
import { mailtoLink } from './links'
import { DEFAULT_ORDER, hasFilters, readListState, toListQuery, writeListState } from './listState'

describe('list state in the address', () => {
  it('reads defaults from an empty address', () => {
    expect(readListState(new URLSearchParams())).toEqual({ q: '', status: '', kind: '', type: '', priority: '', source: '', language: '', from: '', to: '', order: DEFAULT_ORDER, page: 1 })
  })

  it('refuses what is not a page or a day, and caps the search text', () => {
    const state = readListState(new URLSearchParams({ page: '-3', from: '2026-13', to: '03/11/2026', q: 'x'.repeat(500) }))
    expect(state.page).toBe(1)
    expect(state.from).toBe('')
    expect(state.to).toBe('')
    expect(state.q).toHaveLength(100)
    expect(readListState(new URLSearchParams({ page: 'abc' })).page).toBe(1)
    expect(readListState(new URLSearchParams({ page: '4', from: '2026-11-03' }))).toMatchObject({ page: 4, from: '2026-11-03' })
  })

  it('turns the state into the backend’s query: the archive is its own filter, the default order is not sent', () => {
    expect(toListQuery(readListState(new URLSearchParams({ status: 'archived' })))).toMatchObject({ archived: 'only', status: undefined })
    expect(toListQuery(readListState(new URLSearchParams({ status: 'new' })))).toMatchObject({ status: 'new', archived: undefined })
    expect(toListQuery(readListState(new URLSearchParams()))).toMatchObject({ sort: undefined, dir: undefined, page: undefined })
    expect(toListQuery(readListState(new URLSearchParams({ order: 'name_asc', page: '2' })))).toMatchObject({ sort: 'name', dir: 'asc', page: 2 })
  })

  it('splits an order at the last underscore (a column may contain one)', () => {
    expect(toListQuery(readListState(new URLSearchParams({ order: 'updated_at_desc' })))).toMatchObject({ sort: 'updated_at', dir: 'desc' })
  })

  it('a change of filter goes back to the first page; only a change of page keeps its number', () => {
    const now = new URLSearchParams({ status: 'new', page: '3' })
    expect(writeListState(now, { q: 'anna' }).toString()).toBe('status=new&q=anna')
    expect(writeListState(now, { page: 4 }).toString()).toBe('status=new&page=4')
    expect(writeListState(now, { page: 1 }).toString()).toBe('status=new')
  })

  it('leaves no trace of an empty value or the default order', () => {
    const now = new URLSearchParams({ status: 'new', order: 'name_asc' })
    expect(writeListState(now, { status: '' }).toString()).toBe('order=name_asc')
    expect(writeListState(now, { order: DEFAULT_ORDER }).toString()).toBe('status=new')
  })

  it('carries the language of the customer through the address and into the backend query, and leaves no trace when it is empty', () => {
    const state = readListState(new URLSearchParams({ language: 'nl', status: 'new' }))
    expect(state.language).toBe('nl')
    expect(toListQuery(state)).toMatchObject({ language: 'nl', status: 'new' })
    expect(toListQuery(readListState(new URLSearchParams()))).toMatchObject({ language: undefined })
    expect(writeListState(new URLSearchParams({ status: 'new', page: '2' }), { language: 'hu' }).toString()).toBe('status=new&language=hu') // a change of filter goes back to the first page
    expect(writeListState(new URLSearchParams({ language: 'hu' }), { language: '' }).toString()).toBe('')
    expect(hasFilters(state)).toBe(true)
    expect(hasFilters(readListState(new URLSearchParams({ language: 'nl' })))).toBe(true)
  })

  it('knows whether anything filters the list', () => {
    expect(hasFilters(readListState(new URLSearchParams()))).toBe(false)
    expect(hasFilters(readListState(new URLSearchParams({ order: 'name_asc', page: '2' })))).toBe(false)
    expect(hasFilters(readListState(new URLSearchParams({ q: 'a' })))).toBe(true)
  })
})

describe('mailto', () => {
  it('opens the administrator’s own mail program on the sender’s real address, with a subject that points at the message', () => {
    expect(mailtoLink('anna@example.com', 'A website for my bakery', 'CC-2026-0001')).toBe('mailto:anna@example.com?subject=Re%3A%20A%20website%20for%20my%20bakery%20(CC-2026-0001)'.replace(/\(/g, '(').replace(/\)/g, ')'))
  })

  it('cannot be made to carry extra headers through a hostile subject or address', () => {
    const link = mailtoLink('a@b.test?bcc=evil@x.test', 'Hi\r\nBcc: evil@x.test', 'ref\nx')
    expect(link).not.toMatch(/[\r\n]/)
    expect(link.startsWith('mailto:a@b.test%3Fbcc%3Devil@x.test?subject=')).toBe(true)
    expect(link.match(/\?/g)).toHaveLength(1)
    expect(link).not.toContain('&bcc')
    expect(decodeURIComponent(link.split('?subject=')[1])).toBe('Re: Hi Bcc: evil@x.test (ref x)')
  })
})

describe('errors as sentences', () => {
  const error = (status: number, code = 'x') => new ApiError(status, code, 'the server’s own wording', {}, 'req-1')

  it.each([
    [401, 'login.expired'],
    [403, 'states.errorForbidden'],
    [404, 'states.errorNotFound'],
    [409, 'states.conflict'],
    [429, 'states.rateLimited'],
    [503, 'states.errorUnavailable'],
    [500, 'states.errorGeneric'],
  ])('a %s says %s in both languages', (status, path) => {
    const pick = (t: typeof en) => path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], t)
    expect(describeError(en, error(status))).toBe(pick(en))
    expect(describeError(hu, error(status))).toBe(pick(hu as typeof en))
  })

  it('never shows the server’s own wording', () => {
    expect(describeError(en, error(500))).not.toContain('own wording')
  })

  it('tells network trouble from a refusal, and anything else is generic', () => {
    expect(describeError(en, new ApiError(0, 'network', 'x'))).toBe(en.states.errorNetwork)
    expect(describeError(en, new Error('boom'))).toBe(en.states.errorGeneric)
    expect(describeError(en, null)).toBe(en.states.errorGeneric)
  })

  it('gives support the request id and nothing else', () => {
    expect(errorReference(error(500))).toBe('req-1')
    expect(errorReference(new Error('x'))).toBeNull()
  })

  it('turns field codes into sentences, and an unknown code into “invalid”', () => {
    const e = new ApiError(422, 'validation_failed', 'x', { 'translations.hu.title': 'required', slug: 'something-new' })
    expect(fieldErrors(en, e)).toEqual({ 'translations.hu.title': en.services.errors.required, slug: en.services.errors.invalid })
    expect(fieldErrors(en, new Error('x'))).toEqual({})
  })
})

describe('what the activity says', () => {
  it('writes a status change in words, with the legacy names of old inquiries mapped to today’s', () => {
    const text = describeActivity(en, { action: 'inquiry.status', detail: { from: 'answered', to: 'closed', emailed: true } })
    expect(text).toContain(en.status.inquiry.waiting_client)
    expect(text).toContain(en.status.inquiry.completed)
    expect(text).toContain(en.activity.emailed)
  })

  it('does not claim an e-mail it did not send', () => {
    expect(describeActivity(en, { action: 'quote.status', detail: { from: 'new', to: 'quote_sent' } })).not.toContain(en.activity.emailed)
  })

  it('names the language of a translation change, and the inquiry a quote was linked to', () => {
    expect(describeActivity(en, { action: 'translation.update', detail: { language: 'hu' } })).toContain(en.languages.hu)
    expect(describeActivity(en, { action: 'quote.link', detail: { inquiry: 'CC-1' } })).toContain('CC-1')
  })

  it('shows an action it does not know, never hiding it', () => {
    expect(describeActivity(en, { action: 'something.new', detail: null })).toContain('something.new')
  })

  it('says “received” for the first event', () => {
    expect(describeActivity(hu, { action: 'received', detail: null })).toBe(hu.activity.received)
  })
})

describe('the places in the administration', () => {
  it('lists each once, with a screen path, and keeps the four used most on the phone’s bar', () => {
    expect(new Set(NAVIGATION.map((item) => item.id)).size).toBe(NAVIGATION.length)
    expect(new Set(NAVIGATION.map((item) => item.path)).size).toBe(NAVIGATION.length)
    expect(NAVIGATION.filter((item) => item.primary).map((item) => item.id)).toEqual(['dashboard', 'inquiries', 'quotes', 'services'])
    expect(NAVIGATION.every((item) => item.path.startsWith('/'))).toBe(true)
  })

  it('has a name for every place in both languages, and a short one that fits the bar', () => {
    for (const t of [en, hu]) {
      for (const item of NAVIGATION) {
        expect(navLabel(t, item).length).toBeGreaterThan(0)
        if (item.primary) expect(shortNavLabel(t, item).length, `${item.id} in the bottom bar`).toBeLessThanOrEqual(12)
        else expect(shortNavLabel(t, item)).toBe(navLabel(t, item))
      }
    }
  })
})

describe('catalogue editing helpers', () => {
  const values = (hu: Record<string, string>, en: Record<string, string> = {}, nl: Record<string, string> = {}) => ({ hu, en, nl }) as Parameters<typeof fromForm>[1]

  it('a list field is one item per line, blank lines and spaces dropped', () => {
    expect(linesOf('  one \r\n\r\ntwo\n  \nthree')).toEqual(['one', 'two', 'three'])
  })

  it('a record becomes form text and back without change (lists keep their items)', () => {
    const translations = { hu: { title: 'Cím', summary: 'Összefoglaló', tagline: '', overview: '', features: ['egy', 'kettő'] }, en: { title: 'Title' } }
    const form = toForm(SERVICE_FIELDS, translations)
    expect(form.hu.features).toBe('egy\nkettő')
    expect(form.nl.title).toBe('')
    const body = fromForm(SERVICE_FIELDS, form)
    expect(body.hu.features).toEqual(['egy', 'kettő'])
    expect(body.hu.title).toBe('Cím')
    expect(Object.keys(body).sort()).toEqual([...LANGUAGES].sort())
  })

  it('points at the language that is half finished: empty where another has it', () => {
    const form = toForm(EXTRA_FIELDS, { hu: { name: 'Oldalak', summary: 'Több oldal' }, en: { name: 'Pages', summary: '' }, nl: { name: '', summary: '' } })
    expect(incompleteLanguages(EXTRA_FIELDS, form).sort()).toEqual(['en', 'nl'])
    expect(incompleteLanguages(EXTRA_FIELDS, toForm(EXTRA_FIELDS, {}))).toEqual([])
  })

  it('knows an empty list from a list with an item', () => {
    const list = PACKAGE_FIELDS.find((field) => field.kind === 'list')!
    expect(emptyValue(list, { [list.name]: ' \n ' })).toBe(true)
    expect(emptyValue(list, { [list.name]: 'a' })).toBe(false)
  })

  it('every field has a limit, and the first of each kind of record is required', () => {
    for (const fields of [SERVICE_FIELDS, PACKAGE_FIELDS, EXTRA_FIELDS, FAQ_FIELDS]) {
      expect(fields.every((field) => field.max > 0)).toBe(true)
      expect(fields[0].required).toBe(true)
      expect(new Set(fields.map((field) => field.name)).size).toBe(fields.length)
    }
  })

  describe('prices', () => {
    it('a price on request, or not decided yet, needs no amount and has no VAT mode', () => {
      expect(priceBody({ kind: 'quote', amount: '', currency: 'EUR', vat: 'included' })).toEqual({ body: { price: { kind: 'quote' }, vat: 'unspecified' } })
      expect(priceBody({ kind: 'tbd', amount: '', currency: 'EUR', vat: 'included' })).toEqual({ body: { price: { kind: 'tbd' }, vat: 'unspecified' } })
    })

    it('a published price needs a whole positive amount and a VAT mode that says something', () => {
      expect(priceBody({ kind: 'from', amount: '', currency: 'EUR', vat: 'excluded' })).toEqual({ errors: { 'price.amount': 'required' } })
      expect(priceBody({ kind: 'from', amount: '12.5', currency: 'EUR', vat: 'excluded' })).toEqual({ errors: { 'price.amount': 'invalid' } })
      expect(priceBody({ kind: 'from', amount: '0', currency: 'EUR', vat: 'excluded' })).toEqual({ errors: { 'price.amount': 'invalid' } })
      expect(priceBody({ kind: 'from', amount: '1000', currency: 'HUF', vat: 'unspecified' })).toEqual({ errors: { vat: 'required' } })
      expect(priceBody({ kind: 'from', amount: ' 1500 ', currency: 'HUF', vat: 'included' })).toEqual({ body: { price: { kind: 'from', amount: 1500, currency: 'HUF' }, vat: 'included' } })
    })

    it('a stored price round-trips into the form', () => {
      expect(priceToForm({ kind: 'from', amount: 900, currency: 'EUR' }, 'excluded')).toEqual({ kind: 'from', amount: '900', currency: 'EUR', vat: 'excluded' })
      expect(priceToForm({ kind: 'quote' }, 'unspecified')).toMatchObject({ kind: 'quote', amount: '' })
    })
  })

  it('changing one thing of a record keeps everything else in the save', () => {
    const record = { status: 'active', featured: true, position: 2, price: { kind: 'contact' }, vat: 'unspecified', quoteRequired: false, needs: ['website'], extras: ['pages'], translations: { hu: { name: 'Indítás' } } } as unknown as Parameters<typeof packageBody>[0]
    expect(packageBody(record, { status: 'disabled' })).toEqual({ ...record, status: 'disabled' })
    expect(packageBody(record, { position: 5 })).toEqual({ ...record, position: 5 })
  })

  it('a FAQ entry always sends both of its fields in every language', () => {
    const body = faqBody({ status: 'active', position: 1, translations: { hu: { title: 'Kérdés' } } } as unknown as Parameters<typeof faqBody>[0])
    expect(Object.keys(body.translations).sort()).toEqual([...LANGUAGES].sort())
    expect(body.translations.hu).toEqual({ title: 'Kérdés', description: '' })
  })

  it('moves an entry one place, and stays put at either end', () => {
    expect(moved(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moved(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moved(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moved(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
    const original = ['a', 'b']
    moved(original, 0, 1)
    expect(original).toEqual(['a', 'b'])
  })

  it('writes the values in a form so a save is one object per language', () => {
    expect(fromForm(EXTRA_FIELDS, values({ name: 'Név', summary: 'Rövid' })).hu).toEqual({ name: 'Név', summary: 'Rövid' })
  })
})

describe('the project editor helpers', async () => {
  const { setIn, moveItem, linesToList, sameDocument, documentPath, emptyContent, titleOf } = await import('./projects')
  const { fitSize, needsOptimizing } = await import('./image')

  it('changes a document by copy: nothing it was given is mutated', () => {
    const before = emptyContent()
    const after = setIn(before, ['overview', 'what', 'en'], 'Hello')
    expect(after.overview.what.en).toBe('Hello')
    expect(before.overview.what.en).toBe('')
    const list = setIn({ items: [{ a: 1 }, { a: 2 }] }, ['items', 1, 'a'], 9)
    expect(list.items).toEqual([{ a: 1 }, { a: 9 }])
    expect(documentPath('content.gallery.0.alt.hu')).toEqual(['gallery', '0', 'alt', 'hu'])
  })

  it('moves an item one place and stops at the ends; reads lines as a list without repeats or blanks', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
    expect(linesToList('React\n\n  TypeScript  \nReact\r\nNode')).toEqual(['React', 'TypeScript', 'Node'])
    expect(sameDocument({ a: [1] }, { a: [1] })).toBe(true)
    expect(sameDocument({ a: [1] }, { a: [2] })).toBe(false)
    expect(titleOf({ hu: '', en: 'English', nl: '' }, 'hu', 'slug')).toBe('English')
    expect(titleOf({ hu: '', en: '', nl: '' }, 'hu', 'slug')).toBe('slug')
  })

  it('shrinks only what is large, keeps the proportions, and leaves a GIF alone', () => {
    expect(fitSize(3200, 1600)).toEqual({ width: 1600, height: 800 })
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(needsOptimizing('image/png', 2_000_000, 1200, 800)).toBe(true)
    expect(needsOptimizing('image/webp', 90_000, 1200, 800)).toBe(false)
    expect(needsOptimizing('image/jpeg', 90_000, 4000, 3000)).toBe(true)
    expect(needsOptimizing('image/gif', 9_000_000, 4000, 3000)).toBe(false)
  })
})

describe('the language status of a record (PROMPT 18)', () => {
  const fields = [
    { name: 'title', kind: 'line', max: 100, required: true },
    { name: 'features', kind: 'list', max: 100 },
  ] as const
  const full = { title: 'T', features: 'one\ntwo' }

  it('is complete when every language has what another has', async () => {
    const { missingByLanguage } = await import('./catalog')
    expect(missingByLanguage(fields, { hu: full, en: full, nl: full })).toEqual({ hu: 0, en: 0, nl: 0 })
  })

  it('counts the fields a language lacks, and treats a blank list as empty', async () => {
    const { missingByLanguage } = await import('./catalog')
    expect(missingByLanguage(fields, { hu: full, en: { title: 'T', features: '  \n ' }, nl: { title: '', features: '' } })).toEqual({ hu: 0, en: 1, nl: 2 })
  })

  it('does not count a field that is empty everywhere', async () => {
    const { missingByLanguage } = await import('./catalog')
    expect(missingByLanguage(fields, { hu: { title: 'T', features: '' }, en: { title: 'T', features: '' }, nl: { title: 'T', features: '' } })).toEqual({ hu: 0, en: 0, nl: 0 })
  })
})
