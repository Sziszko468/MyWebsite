import { describe, expect, it } from 'vitest'
import { packages } from '../content/packages'
import { addons, addonsFor } from '../content/services/addons'
import { NEED_IDS } from '../content/services/ids'
import { shopText } from '../content/shop'
import { localize } from '../content/trilingual'
import { LANGUAGES } from '../i18n/config'
import {
  EMPTY_CART,
  clearCart,
  countExtras,
  findLine,
  hasLine,
  isCartComplete,
  normalizeExtras,
  parseCart,
  removeLine,
  restoreLine,
  setNeeds,
  setPlan,
  toggleExtra,
  upsertLine,
  type Cart,
} from './cart'
import { cartActions, cartStore, noticeStore } from './cartStore'
import { planForNeed, startStep, suggestedPlans } from './flow'
import { timelineText } from './format'
import {
  EMPTY_DETAILS,
  LIMITS,
  STEPS,
  buildSummary,
  errorText,
  firstInvalidStep,
  summaryRows,
  toRequest,
  validateStep,
  type Details,
} from './inquiry'
import { INITIAL_INQUIRY, inquiryActions, inquiryStore } from './inquiryStore'
import { SHOP_PATHS, isShopPath, pathOfNeed, serviceFromSlug, servicePath } from './paths'
import { contentPrices, priceCart, priceClass, type PriceSource } from './pricing'
import { buildIndex, normalize, searchEntries } from './search'
import { createStore } from './store'

const OPTIONS = { requireConsent: true }
const cartOf = (...lines: Array<Parameters<typeof upsertLine>[1]>): Cart => lines.reduce((cart, line) => upsertLine(cart, line), EMPTY_CART)
const GOOD: Details = {
  ...EMPTY_DETAILS,
  description: 'A small site for my bakery, with the menu and opening hours.',
  name: 'Ada',
  email: 'ada@example.com',
  consent: true,
}

describe('the cart', () => {
  it('starts empty and adds a service once, replacing its choices when it is added again', () => {
    let cart = upsertLine(EMPTY_CART, { need: 'website' })
    expect(cart.lines).toEqual([{ need: 'website', plan: null, extras: [] }])
    cart = upsertLine(cart, { need: 'website', plan: 'launch', extras: ['pages'] })
    expect(cart.lines).toHaveLength(1)
    expect(findLine(cart, 'website')).toEqual({ need: 'website', plan: 'launch', extras: ['pages'] })
    expect(hasLine(cart, 'webapp')).toBe(false)
  })

  it('keeps add-ons only if they apply to the service, once each and in catalogue order', () => {
    expect(normalizeExtras('website', ['care', 'pages', 'pages', 'api'])).toEqual(['pages', 'api', 'care'])
    // “responsive” is for existing sites and UI work, not for a new website; “api” is not for UI implementation.
    expect(normalizeExtras('website', ['responsive'])).toEqual([])
    expect(normalizeExtras('ui', ['api', 'motion'])).toEqual(['motion'])
    expect(normalizeExtras('unsure', ['custom', 'pages', 'care'])).toEqual(['custom'])
    expect(normalizeExtras('website', ['cms', 42, null])).toEqual([])
    expect(upsertLine(EMPTY_CART, { need: 'ui', extras: ['api', 'motion'] }).lines[0].extras).toEqual(['motion'])
  })

  it('removes a line and puts it back where it was', () => {
    const cart = cartOf({ need: 'website', plan: 'launch' }, { need: 'webapp', plan: 'build', extras: ['api'] }, { need: 'ui' })
    const gone = removeLine(cart, 'webapp')
    expect(gone.lines.map((line) => line.need)).toEqual(['website', 'ui'])
    const back = restoreLine(gone, findLine(cart, 'webapp')!, 1)
    expect(back).toEqual(cart)
    expect(restoreLine(back, findLine(cart, 'webapp')!, 0)).toBe(back)
    expect(removeLine(cart, 'integrations')).toBe(cart)
  })

  it('changes the package and toggles add-ons on a line, and ignores a line that is not there', () => {
    let cart = cartOf({ need: 'website' })
    cart = setPlan(cart, 'website', 'grow')
    expect(findLine(cart, 'website')?.plan).toBe('grow')
    cart = toggleExtra(cart, 'website', 'languages')
    cart = toggleExtra(cart, 'website', 'pages')
    expect(findLine(cart, 'website')?.extras).toEqual(['pages', 'languages'])
    cart = toggleExtra(cart, 'website', 'pages')
    expect(findLine(cart, 'website')?.extras).toEqual(['languages'])
    expect(toggleExtra(cart, 'website', 'languages', true)).toBe(cart)
    expect(toggleExtra(cart, 'website', 'responsive', true)).toEqual(cart)
    expect(setPlan(cart, 'webapp', 'build')).toBe(cart)
    expect(countExtras(cart)).toBe(1)
  })

  it('makes the cart hold exactly the chosen needs, keeping what the kept lines already had', () => {
    const cart = cartOf({ need: 'website', plan: 'launch', extras: ['pages'] }, { need: 'ui', plan: 'grow' })
    const next = setNeeds(cart, ['webapp', 'website'], (need) => (need === 'webapp' ? 'build' : null))
    expect(next.lines.map((line) => line.need)).toEqual(['website', 'webapp'])
    expect(findLine(next, 'website')).toEqual({ need: 'website', plan: 'launch', extras: ['pages'] })
    expect(findLine(next, 'webapp')).toEqual({ need: 'webapp', plan: 'build', extras: [] })
    expect(setNeeds(next, ['webapp', 'website'])).toBe(next)
    expect(setNeeds(cart, []).lines).toEqual([])
  })

  it('clears, and is complete only when every line has a package', () => {
    expect(clearCart(EMPTY_CART)).toBe(EMPTY_CART)
    expect(clearCart(cartOf({ need: 'website' }))).toBe(EMPTY_CART)
    expect(isCartComplete(EMPTY_CART)).toBe(false)
    expect(isCartComplete(cartOf({ need: 'website' }))).toBe(false)
    expect(isCartComplete(cartOf({ need: 'website', plan: 'custom' }))).toBe(true)
    expect(isCartComplete(cartOf({ need: 'website', plan: 'custom' }, { need: 'ui' }))).toBe(false)
  })

  it('reads a saved cart back safely, dropping what no longer exists', () => {
    expect(parseCart(null)).toBe(EMPTY_CART)
    expect(parseCart('nonsense')).toBe(EMPTY_CART)
    expect(parseCart({ lines: 'x' })).toBe(EMPTY_CART)
    const parsed = parseCart({
      lines: [
        { need: 'website', plan: 'launch', extras: ['pages', 'cms', 'responsive'] },
        { need: 'website', plan: 'build' },
        { need: 'mobile', plan: 'build' },
        { need: 'ui', plan: 'enterprise', extras: 'x' },
        null,
        7,
      ],
    })
    expect(parsed.lines).toEqual([
      { need: 'website', plan: 'launch', extras: ['pages'] },
      { need: 'ui', plan: null, extras: [] },
    ])
  })
})

describe('what the cart is worth', () => {
  const published: PriceSource = {
    plan: (id) => (id === 'launch' ? { price: { kind: 'from', amount: 1000, currency: 'EUR' }, vat: 'excluded' } : contentPrices.plan(id)),
    addon: (id) => (id === 'pages' ? { price: { kind: 'from', amount: 200, currency: 'EUR' }, vat: 'excluded' } : contentPrices.addon(id)),
  }

  it('shows no total at all while nothing has a published price, which is how the content ships', () => {
    for (const pkg of packages) expect(priceClass(pkg.price)).toBe('quote')
    for (const addon of addons) expect(priceClass(addon.price)).toBe('quote')
    const pricing = priceCart(cartOf({ need: 'website', plan: 'launch', extras: ['pages', 'care'] }, { need: 'webapp', plan: 'custom' }))
    expect(pricing.fixed).toEqual([])
    expect(pricing.fixedLines).toBe(0)
    expect(pricing.quotedLines).toBe(2)
    expect(pricing.addons).toBe(2)
    expect(pricing.quotedItems).toBe(4)
    expect(pricing.lines.every((line) => line.class === 'quote')).toBe(true)
  })

  it('adds up published prices per currency and keeps the quoted parts apart', () => {
    const cart = cartOf({ need: 'website', plan: 'launch', extras: ['pages', 'care'] }, { need: 'webapp', plan: 'build' })
    const pricing = priceCart(cart, published)
    expect(pricing.fixed).toEqual([{ currency: 'EUR', amount: 1200, vat: 'excluded' }])
    expect(pricing.fixedLines).toBe(1)
    expect(pricing.quotedLines).toBe(1)
    // Build (a line), and Care (an add-on) are still quoted; Launch and “pages” are not.
    expect(pricing.quotedItems).toBe(2)
    expect(pricing.lines[0].class).toBe('fixed')
    expect(pricing.lines[1].class).toBe('quote')
  })

  it('keeps currencies apart and says when VAT is handled differently', () => {
    const mixed: PriceSource = {
      plan: (id) => (id === 'launch' ? { price: { kind: 'from', amount: 1000, currency: 'EUR' }, vat: 'excluded' } : contentPrices.plan(id)),
      addon: (id) => (id === 'pages' ? { price: { kind: 'from', amount: 50000, currency: 'HUF' }, vat: 'included' } : id === 'motion' ? { price: { kind: 'from', amount: 300, currency: 'EUR' }, vat: 'included' } : contentPrices.addon(id)),
    }
    const pricing = priceCart(cartOf({ need: 'website', plan: 'launch', extras: ['pages', 'motion'] }), mixed)
    expect(pricing.fixed).toEqual([
      { currency: 'EUR', amount: 1300, vat: 'mixed' },
      { currency: 'HUF', amount: 50000, vat: 'included' },
    ])
  })

  it('treats a custom project and a line without a package as quoted', () => {
    const pricing = priceCart(cartOf({ need: 'website', plan: 'custom' }, { need: 'ui' }), published)
    expect(pricing.lines.map((line) => line.plan)).toEqual([null, null])
    expect(pricing.quotedLines).toBe(2)
  })
})

describe('the cart store', () => {
  it('shares one value, notifies on a change and not on the same value, and lets go of a listener', () => {
    const store = createStore(1)
    const seen: number[] = []
    const off = store.subscribe(() => seen.push(store.get()))
    store.update((value) => value + 1)
    store.update((value) => value)
    off()
    store.update((value) => value + 1)
    expect(seen).toEqual([2])
    expect(store.get()).toBe(3)
  })

  it('adds, removes and undoes through the actions, and says what happened', () => {
    cartStore.update(() => EMPTY_CART)
    cartActions.add('webapp', { plan: 'build', extras: ['api'] })
    expect(noticeStore.get()).toMatchObject({ kind: 'added', need: 'webapp' })
    cartActions.add('webapp', { plan: 'grow' })
    expect(noticeStore.get()).toMatchObject({ kind: 'updated', need: 'webapp' })
    expect(findLine(cartStore.get(), 'webapp')).toEqual({ need: 'webapp', plan: 'grow', extras: [] })

    cartActions.add('website')
    cartActions.remove('webapp')
    expect(noticeStore.get()).toMatchObject({ kind: 'removed', need: 'webapp' })
    expect(cartStore.get().lines.map((line) => line.need)).toEqual(['website'])
    cartActions.undoRemove()
    expect(cartStore.get().lines.map((line) => line.need)).toEqual(['webapp', 'website'])

    cartActions.clear()
    expect(cartStore.get()).toBe(EMPTY_CART)
    expect(noticeStore.get()?.kind).toBe('cleared')
    const before = noticeStore.get()
    cartActions.clear()
    expect(noticeStore.get()).toBe(before)
  })
})

describe('the search', () => {
  it.each(LANGUAGES)('finds a service, a package and an add-on in %s by the words the page uses', (lang) => {
    const index = buildIndex(lang)
    expect(index).toHaveLength(4 + packages.length + addons.length)
    const text = localize(shopText, lang)
    expect(searchEntries(index, 'API').some((entry) => entry.kind === 'service' && entry.id === 'integrations')).toBe(true)
    expect(searchEntries(index, 'API').some((entry) => entry.kind === 'addon' && entry.id === 'api')).toBe(true)
    expect(searchEntries(index, 'Grow').some((entry) => entry.kind === 'package' && entry.id === 'grow')).toBe(true)
    expect(searchEntries(index, '', 'service')).toHaveLength(4)
    expect(searchEntries(index, '', 'addon')).toHaveLength(addons.length)
    expect(text.landing.discovery.finder.kinds.all.length).toBeGreaterThan(0)
  })

  it('ignores case and accents and needs every word to match somewhere', () => {
    const hu = buildIndex('hu')
    expect(normalize('  Weboldalfejlesztés ')).toBe('weboldalfejlesztes')
    expect(searchEntries(hu, 'WEBOLDALFEJLESZTES').map((entry) => entry.id)).toContain('website')
    expect(searchEntries(hu, 'weboldal fejlesztes').map((entry) => entry.id)).toContain('website')
    expect(searchEntries(hu, 'weboldal xylophon')).toEqual([])
    expect(searchEntries(hu, 'zzzzzz')).toEqual([])
  })

  it('puts title matches first, filters by kind and keeps the catalogue order for an empty query', () => {
    const en = buildIndex('en')
    const results = searchEntries(en, 'language')
    expect(results[0].title.toLowerCase()).toContain('language')
    expect(searchEntries(en, 'language', 'package').every((entry) => entry.kind === 'package')).toBe(true)
    expect(searchEntries(en, '').map((entry) => entry.kind)).toEqual(en.map((entry) => entry.kind))
  })

  it('searches in one language at a time, so a result never comes from another', () => {
    const nl = buildIndex('nl')
    expect(searchEntries(nl, 'Website-ontwikkeling').map((entry) => entry.id)).toContain('website')
    expect(searchEntries(nl, 'Website Development')).toEqual([])
  })
})

describe('the inquiry', () => {
  const cart = cartOf({ need: 'website', plan: 'launch', extras: ['pages'] })

  it('asks for a need, then a package for each, then a description; the rest is optional', () => {
    expect(validateStep('need', EMPTY_CART, EMPTY_DETAILS, OPTIONS)).toEqual({ need: 'required' })
    expect(validateStep('need', cart, EMPTY_DETAILS, OPTIONS)).toEqual({})
    expect(validateStep('plan', cartOf({ need: 'website' }, { need: 'ui', plan: 'custom' }), EMPTY_DETAILS, OPTIONS)).toEqual({ 'plan:website': 'required' })
    expect(validateStep('extras', cart, EMPTY_DETAILS, OPTIONS)).toEqual({})
    expect(validateStep('details', cart, EMPTY_DETAILS, OPTIONS)).toEqual({ description: 'required' })
    expect(validateStep('details', cart, { ...EMPTY_DETAILS, description: 'too short' }, OPTIONS)).toEqual({ description: 'tooShort' })
    expect(validateStep('details', cart, { ...GOOD, reference: 'x'.repeat(LIMITS.reference.max + 1) }, OPTIONS)).toEqual({ reference: 'tooLong' })
    expect(validateStep('details', cart, { ...GOOD, requirements: 'x'.repeat(LIMITS.requirements.max + 1) }, OPTIONS)).toEqual({ requirements: 'tooLong' })
    expect(validateStep('details', cart, { ...GOOD, timing: 'someday' as never }, OPTIONS)).toEqual({ timing: 'required' })
    expect(validateStep('review', cart, EMPTY_DETAILS, OPTIONS)).toEqual({})
  })

  it('checks the contact: a name, a real e-mail address, an optional phone number and the consent when it is required', () => {
    expect(validateStep('send', cart, EMPTY_DETAILS, OPTIONS)).toEqual({ name: 'required', email: 'required', consent: 'consentRequired' })
    expect(validateStep('send', cart, { ...GOOD, email: 'ada@' }, OPTIONS)).toEqual({ email: 'invalidEmail' })
    expect(validateStep('send', cart, { ...GOOD, email: 'a..b@example.com' }, OPTIONS)).toEqual({ email: 'invalidEmail' })
    expect(validateStep('send', cart, { ...GOOD, phone: '12ab' }, OPTIONS)).toEqual({ phone: 'invalidPhone' })
    expect(validateStep('send', cart, { ...GOOD, phone: '+36 30 123 4567' }, OPTIONS)).toEqual({})
    expect(validateStep('send', cart, { ...GOOD, consent: false }, { requireConsent: false })).toEqual({})
  })

  it('finds the first step that is not good enough, and none when the request is fine', () => {
    expect(firstInvalidStep(EMPTY_CART, GOOD, OPTIONS)?.step).toBe('need')
    expect(firstInvalidStep(cartOf({ need: 'website' }), GOOD, OPTIONS)?.step).toBe('plan')
    expect(firstInvalidStep(cart, EMPTY_DETAILS, OPTIONS)?.step).toBe('details')
    expect(firstInvalidStep(cart, { ...GOOD, email: '' }, OPTIONS)?.step).toBe('send')
    expect(firstInvalidStep(cart, GOOD, OPTIONS)).toBeNull()
    expect(STEPS).toEqual(['need', 'plan', 'extras', 'details', 'review', 'send'])
  })

  it('builds the request to send: trimmed, with nothing empty and the items of the cart', () => {
    const request = toRequest(cart, { ...GOOD, description: `  ${GOOD.description}  `, reference: '  ', phone: '', objective: 'present' }, 'nl')
    expect(request).toEqual({
      form: 'quote',
      version: 2,
      language: 'nl',
      items: [{ need: 'website', plan: 'launch', extras: ['pages'] }],
      description: GOOD.description,
      objective: 'present',
      reference: null,
      timing: null,
      requirements: null,
      name: 'Ada',
      email: 'ada@example.com',
      phone: null,
      company: null,
      companyWebsite: null,
      budgetRange: null,
      marketing: false,
      consent: true,
    })
    expect(() => toRequest(cartOf({ need: 'website' }), GOOD, 'hu')).toThrow()
    expect(Object.values(request).every((value) => value !== '')).toBe(true)
  })

  it.each(LANGUAGES)('puts every service, package and add-on into the summary in %s, and the contact only when asked', (lang) => {
    const text = { configurator: localize(shopText.configurator, lang), common: localize(shopText.common, lang) }
    const rows = summaryRows(cart, GOOD, lang, text, { contact: false })
    expect(rows.map(([label]) => label)).not.toContain(text.configurator.summary.labels.email)
    const full = buildSummary(cart, GOOD, lang, text)
    expect(full).toContain(text.common.needs.website.title)
    expect(full).toContain('Launch')
    expect(full).toContain(addonsFor('website').find((addon) => addon.id === 'pages')!.name[lang])
    expect(full).toContain('ada@example.com')
    expect(full).toMatch(/Magyar|English|Nederlands/)
    expect(full).not.toMatch(/\{\w+\}|undefined/)
  })

  it.each(LANGUAGES)('turns every problem into a sentence in %s, with the limit that applies', (lang) => {
    const c = localize(shopText.configurator, lang)
    expect(errorText(c, 'description', 'tooShort')).toContain(String(LIMITS.description.min))
    expect(errorText(c, 'name', 'tooLong')).toContain(String(LIMITS.name.max))
    expect(errorText(c, 'plan:website', 'required', { name: 'Web' })).toContain('Web')
    expect(errorText(c, 'email', 'invalidEmail')).toBeTruthy()
    expect(errorText(c, 'description', undefined)).toBeUndefined()
    for (const field of ['need', 'description', 'name', 'email', 'timing'] as const) expect(errorText(c, field, 'required'), `${lang}:${field}`).toBeTruthy()
    expect(errorText(c, 'consent', 'consentRequired')).toBeTruthy()
    expect(errorText(c, 'phone', 'invalidPhone')).toBeTruthy()
  })

  it('keeps the answers in memory only, resets them after sending and remembers the step', () => {
    inquiryActions.reset()
    inquiryActions.setDetail('description', 'hello')
    inquiryActions.setStep('plan')
    inquiryActions.setPendingPlan('build')
    expect(inquiryStore.get()).toMatchObject({ step: 'plan', pendingPlan: 'build', details: { description: 'hello' } })
    const same = inquiryStore.get()
    inquiryActions.setDetail('description', 'hello')
    expect(inquiryStore.get()).toBe(same)
    inquiryActions.reset()
    expect(inquiryStore.get()).toBe(INITIAL_INQUIRY)
  })
})

describe('the way through the shop', () => {
  it('opens the builder on the next open question', () => {
    expect(startStep(EMPTY_CART, 'service')).toBe('need')
    expect(startStep(cartOf({ need: 'website' }), 'service')).toBe('plan')
    expect(startStep(cartOf({ need: 'website', plan: 'launch' }), 'service')).toBe('extras')
    expect(startStep(cartOf({ need: 'website', plan: 'launch' }), 'cart')).toBe('details')
    expect(startStep(cartOf({ need: 'website' }), 'cart')).toBe('plan')
  })

  it('suggests the packages that suit a need and gives an arriving package only to a need it suits', () => {
    for (const need of NEED_IDS.filter((id) => id !== 'unsure')) expect(suggestedPlans(need).length, need).toBeGreaterThan(0)
    expect(suggestedPlans('unsure')).toEqual([])
    expect(suggestedPlans('webapp')).toEqual(['build', 'care'])
    expect(planForNeed('webapp', 'build')).toBe('build')
    expect(planForNeed('webapp', 'launch')).toBeNull()
    expect(planForNeed('unsure', 'custom')).toBe('custom')
    expect(planForNeed('website', null)).toBeNull()
  })

  it('knows the shop’s paths', () => {
    expect(isShopPath('/services')).toBe(true)
    expect(isShopPath('/services/')).toBe(true)
    expect(isShopPath('/services/cart')).toBe(true)
    expect(isShopPath('/service')).toBe(false)
    expect(isShopPath('/about')).toBe(false)
    expect(isShopPath('/')).toBe(false)
    expect(servicePath('webapp')).toBe('/services/webapp')
    expect(pathOfNeed('improve')).toBe('/services/website')
    expect(pathOfNeed('unsure')).toBe(SHOP_PATHS.home)
    expect(serviceFromSlug('ui')).toBe('ui')
    expect(serviceFromSlug('cart')).toBeNull()
    expect(serviceFromSlug(undefined)).toBeNull()
  })

  it('writes a published timeline in the right form for the language, and “depends on the scope” otherwise', () => {
    const copy = localize(shopText.landing.packages.timeline, 'en')
    expect(timelineText({ kind: 'scope' }, 'en', copy)).toBe(copy.scope)
    expect(timelineText({ kind: 'estimate', min: 2, max: 4, unit: 'weeks' }, 'en', copy)).toBe('Typically 2–4 weeks, confirmed in the quote.')
    expect(timelineText({ kind: 'estimate', min: 1, max: 1, unit: 'months' }, 'en', copy)).toBe('Typically 1 month, confirmed in the quote.')
  })
})
