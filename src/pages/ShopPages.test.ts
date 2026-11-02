import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { packages } from '../content/packages'
import { addonsFor } from '../content/services/addons'
import { serviceAreas } from '../content/services/areas'
import { getServiceDetail } from '../content/services/detail'
import { faq } from '../content/services/faq'
import { SERVICE_IDS } from '../content/services/ids'
import { processSteps } from '../content/services/process'
import { shopText } from '../content/shop'
import { localize } from '../content/trilingual'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { ThemeContext } from '../theme/context'
import { SHOP_RHYTHM } from '../components/shop/rhythm'
import { EMPTY_CART, upsertLine, type Cart } from '../shop/cart'
import { cartStore } from '../shop/cartStore'
import { inquiryActions } from '../shop/inquiryStore'
import { CartPage } from './CartPage'
import { ConfiguratorPage } from './ConfiguratorPage'
import { ServiceDetailPage } from './ServiceDetailPage'
import { ServicesPage } from './ServicesPage'

/**
 * Renders the shop's pages on the server, as markup, with the real providers. It cannot click (the
 * browser run does that), but it catches what a browser would only show later: a crash, a missing
 * translation, a section that is not there, a template that leaked into the text, a price that
 * appeared from nowhere.
 */
function render(element: ReactElement, lang: Language, theme: 'dark' | 'light' = 'dark', url = '/services'): string {
  return renderToStaticMarkup(
    createElement(
      ThemeContext.Provider,
      { value: { theme, setTheme: () => undefined, toggleTheme: () => undefined } },
      createElement(
        MemoryRouter,
        { initialEntries: [`/${lang}${url}`] },
        createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, element),
      ),
    ),
  )
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const cartOf = (...lines: Array<Parameters<typeof upsertLine>[1]>): Cart => lines.reduce((cart, line) => upsertLine(cart, line), EMPTY_CART)
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ')
/** The <input> elements of the markup, with the attributes the tests ask about (React writes them in its own order). */
function inputs(html: string, filter: { type?: string; name?: string; checked?: boolean } = {}) {
  const attribute = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(tag)?.[1]
  return [...html.matchAll(/<input\s[^>]*>/g)]
    .map(([tag]) => ({
      type: attribute(tag, 'type'),
      name: attribute(tag, 'name'),
      value: attribute(tag, 'value'),
      checked: tag.includes(' checked=""'),
    }))
    .filter((input) => (filter.type === undefined || input.type === filter.type) && (filter.name === undefined || input.name === filter.name) && (filter.checked === undefined || input.checked === filter.checked))
}
const NOT_LEAKED = /\{\w+\}|undefined|\[object|NaN/
const NO_PRICE = /[€$£]|\bEUR\b|\bHUF\b|\bFt\b/

afterEach(() => {
  cartStore.update(() => EMPTY_CART)
  inquiryActions.reset()
})

describe.each(LANGUAGES)('the shop’s front page in %s', (lang) => {
  const html = render(createElement(ServicesPage), lang)
  const text = localize(shopText, lang)

  it('renders one h1, with the headline of the brief, and the two buttons', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain(escape(text.landing.hero.titleLine1))
    expect(html).toContain(escape(text.landing.hero.titleLine2))
    expect(html).toContain(escape(text.landing.hero.lead))
    expect(html).toMatch(new RegExp(`<a[^>]*href="#services"[^>]*>(?:(?!</a>).)*${escape(text.landing.hero.ctaPrimary)}`))
    expect(html).toMatch(new RegExp(`<a[^>]*href="/${lang}/contact"[^>]*>(?:(?!</a>).)*${escape(text.landing.hero.ctaSecondary)}`))
  })

  it('has every band, each one named by a heading', () => {
    for (const { id } of SHOP_RHYTHM.filter((section) => section.id !== 'start')) {
      expect(html, id).toMatch(new RegExp(`<section[^>]*id="${id}"[^>]*aria-labelledby="[^"]+"`))
    }
    expect(html).toContain('id="start"')
  })

  it('shows the four services as cards with their promise, benefits, use and what can be included', () => {
    for (const area of serviceAreas) {
      const detail = getServiceDetail(area.id)
      expect(html).toContain(`data-service="${area.id}"`)
      expect(html).toContain(escape(area.name[lang]))
      expect(html).toContain(escape(detail.tagline[lang]))
      for (const benefit of detail.benefits) expect(html).toContain(escape(benefit.title[lang]))
      for (const feature of area.features) expect(html).toContain(escape(feature[lang]))
      expect(html).toContain(`href="/${lang}/services/${area.id}"`)
    }
  })

  it('offers a search over the catalogue, with its filters', () => {
    expect(html).toMatch(/<input[^>]*type="search"/)
    for (const label of Object.values(text.landing.discovery.finder.kinds)) expect(html).toContain(`>${escape(label)}<`)
    expect(html).toContain('id="find"')
  })

  it('presents the four packages as radio tiles and the first as a product, with what it contains', () => {
    expect(inputs(html, { type: 'radio' }).map((input) => input.value).filter((value) => packages.some((pkg) => pkg.id === value))).toEqual(packages.map((pkg) => pkg.id))
    const first = packages[0]
    expect(html).toContain(`data-package="${first.id}"`)
    for (const item of first.deliverables) expect(html).toContain(escape(item[lang]))
    for (const item of first.includes) expect(html).toContain(escape(item[lang]))
    expect(html).toContain(escape(first.audience[lang]))
    expect(html).toContain(`href="/${lang}/services/configure?plan=${first.id}"`)
    expect(html).toContain(escape(text.landing.packages.customCard.title))
  })

  it('has the comparison, with a row per topic and every package as a column', () => {
    for (const row of Object.values(text.landing.compare.rows)) expect(html).toContain(`>${escape(row)}<`)
    expect(html.match(/role="columnheader"/g)!.length).toBeGreaterThanOrEqual(packages.length)
    expect(html).toContain('role="table"')
  })

  it('asks for a Custom Quote instead of showing a price', () => {
    expect(html).toContain(escape(text.common.price.customQuote))
    expect(plain(html)).not.toMatch(NO_PRICE)
  })

  it('shows the process, what happens after an inquiry, the support options, the work and every question', () => {
    for (const step of processSteps) expect(html).toContain(escape(step.title[lang]))
    expect(html).toContain(escape(text.landing.process.afterTitle))
    for (const item of text.landing.support.items) expect(html).toContain(escape(item.title))
    expect(html).toContain('Spendly')
    expect(html).toContain('Logistics Platform')
    for (const item of faq) {
      expect(html).toContain(escape(item.question[lang]))
      expect(html).toContain(escape(item.answer[lang]))
    }
  })

  it('closes with the call to action, which leads to the request builder', () => {
    expect(html).toMatch(new RegExp(`<a[^>]*href="/${lang}/services/configure"[^>]*>(?:(?!</a>).)*${escape(text.landing.final.cta)}`))
  })

  it('leaks no template, no undefined and no object into the text', () => {
    expect(plain(html)).not.toMatch(NOT_LEAKED)
  })
})

describe('the shop’s front page', () => {
  it('chooses the package named in the address', () => {
    const html = render(createElement(ServicesPage), 'hu', 'dark', '/services?package=build')
    expect(html).toMatch(/<article[^>]*data-package="build"/)
    expect(html).toMatch(/<label[^>]*data-package="build"[^>]*data-checked="true"/)
    expect(html).not.toMatch(/<label[^>]*data-package="(launch|grow|care)"[^>]*data-checked/)
    expect(html).toContain(escape(shopText.landing.packages.start.hu.replace('{name}', 'Build')))
  })

  it('ignores a package it does not know', () => {
    const html = render(createElement(ServicesPage), 'hu', 'dark', '/services?package=enterprise')
    expect(html).toMatch(/<article[^>]*data-package="launch"/)
  })

  it('renders the same bands in the light theme, alternating the dark and light bands', () => {
    const html = render(createElement(ServicesPage), 'en', 'light')
    for (const { id } of SHOP_RHYTHM) expect(html, id).toContain(`id="${id}"`)
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('data-theme="light"')
  })
})

describe.each(LANGUAGES)('a service’s page in %s', (lang) => {
  const text = localize(shopText, lang)

  it.each(SERVICE_IDS)('%s has the eleven sections of the brief, in order', (serviceId) => {
    const html = render(createElement(ServiceDetailPage, { serviceId }), lang, 'dark', `/services/${serviceId}`)
    const area = serviceAreas.find((candidate) => candidate.id === serviceId)!
    const detail = getServiceDetail(serviceId)

    expect(html.match(/<h1\b/g)).toHaveLength(1)
    const ids = ['hero', 'overview', 'get', 'features', 'audience', 'how', 'addons', 'work', 'faq', 'price', 'final']
    const positions = ids.map((id) => html.indexOf(`id="${id}"`))
    expect(positions.every((position) => position >= 0), ids.filter((_, i) => positions[i] < 0).join()).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)

    expect(html).toContain(escape(area.name[lang]))
    expect(html).toContain(escape(detail.tagline[lang]))
    expect(html).toContain(escape(detail.overview[lang]))
    for (const item of detail.deliverables) expect(html).toContain(escape(item[lang]))
    for (const feature of area.features) expect(html).toContain(escape(feature[lang]))
    expect(html).toContain(escape(detail.audience[lang]))
    for (const step of processSteps) expect(html).toContain(escape(step.title[lang]))
    expect(html).toContain(escape(detail.howNote[lang]))
    for (const addon of addonsFor(serviceId)) expect(html).toContain(escape(addon.name[lang]))
    for (const item of detail.projects) expect(html).toContain(escape(item.note[lang]))
    for (const item of detail.faq.own) expect(html).toContain(escape(item.question[lang]))
    for (const id of detail.faq.shared) expect(html).toContain(escape(faq.find((item) => item.id === id)!.question[lang]))
    expect(html).toContain(escape(text.common.price.customQuote))
  })

  it.each(SERVICE_IDS)('%s has a sticky “request a quote” bar for phones, hidden until the hero has been passed', (serviceId) => {
    const html = render(createElement(ServiceDetailPage, { serviceId }), lang, 'dark', `/services/${serviceId}`)
    // Hidden at first (nothing has been scrolled past on a server render), so the bar is inert.
    expect(html).toMatch(/<div[^>]*inert=""/)
    expect(html).toContain(escape(text.detail.sticky.label))
    expect(html).toMatch(new RegExp(`href="/${lang}/services/configure"[^>]*>(?:(?!</a>).)*${escape(text.detail.sticky.label)}`))
  })

  it.each(SERVICE_IDS)('%s asks for a quote and leaks nothing', (serviceId) => {
    const html = render(createElement(ServiceDetailPage, { serviceId }), lang, 'dark', `/services/${serviceId}`)
    expect(plain(html)).not.toMatch(NOT_LEAKED)
    expect(plain(html)).not.toMatch(NO_PRICE)
    expect(html).toContain(escape(text.common.action.requestQuote))
    expect(html).toContain(escape(text.common.action.addToCart))
  })
})

describe('a service’s page, with the service already in the cart', () => {
  it('says so, and shows the chosen package and add-ons', () => {
    cartStore.update(() => cartOf({ need: 'webapp', plan: 'build', extras: ['api'] }))
    const html = render(createElement(ServiceDetailPage, { serviceId: 'webapp' }), 'en', 'dark', '/services/webapp')
    expect(html).toContain(escape(shopText.common.action.inCart.en))
    expect(inputs(html, { type: 'radio', name: 'service-plan', checked: true }).map((input) => input.value)).toEqual(['build'])
    expect(inputs(html, { type: 'checkbox', checked: true })).toHaveLength(1)
  })
})

describe.each(LANGUAGES)('the request builder in %s', (lang) => {
  const text = localize(shopText, lang)

  it('opens on the first question, with six choices and none made, and says up front that nothing can be sent yet', () => {
    const html = render(createElement(ConfiguratorPage), lang, 'dark', '/services/configure')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain(escape(text.configurator.titles.need))
    expect(inputs(html, { type: 'checkbox' })).toHaveLength(6)
    expect(inputs(html, { type: 'checkbox', checked: true })).toHaveLength(0)
    expect(html).toContain(escape(text.configurator.unavailable.notice))
    expect(html).toContain(escape(text.configurator.stepOf.replace('{current}', '1').replace('{total}', '6')))
    expect(plain(html)).not.toMatch(NOT_LEAKED)
  })

  it('shows the step the visitor is on, with the choices already made kept', () => {
    cartStore.update(() => cartOf({ need: 'website', plan: 'launch', extras: ['pages'] }, { need: 'ui' }))
    inquiryActions.setStep('plan')
    const plan = render(createElement(ConfiguratorPage), lang, 'dark', '/services/configure')
    expect(plan).toContain(escape(text.configurator.titles.plan))
    expect(plan).toContain(escape(text.configurator.plan.legend.replace('{name}', text.common.needs.website.title)))
    expect(plan).toContain(escape(text.configurator.plan.legend.replace('{name}', text.common.needs.ui.title)))
    expect(inputs(plan, { type: 'radio', checked: true }).map((input) => input.name)).toEqual(['plan-website'])

    // A package is still missing for one service, so the builder would stay on that step; give it one.
    cartStore.update(() => cartOf({ need: 'website', plan: 'launch', extras: ['pages'] }, { need: 'ui', plan: 'custom' }))
    inquiryActions.setStep('extras')
    const extras = render(createElement(ConfiguratorPage), lang, 'dark', '/services/configure')
    expect(extras).toContain(escape(text.configurator.titles.extras))
    expect(inputs(extras, { type: 'checkbox', checked: true })).toHaveLength(1)
  })

  it('reviews every selection with a way to change it, and asks for the contact only at the end', () => {
    cartStore.update(() => cartOf({ need: 'website', plan: 'launch', extras: ['pages'] }))
    inquiryActions.setDetail('description', 'A small site for my bakery, with the menu and opening hours.')
    inquiryActions.setStep('review')
    const review = render(createElement(ConfiguratorPage), lang, 'dark', '/services/configure')
    expect(review).toContain(escape(text.configurator.titles.review))
    expect(review).toContain('Launch')
    expect(review).toContain('A small site for my bakery')
    expect(review).toContain(escape(text.configurator.review.addAnother))
    expect(review).not.toMatch(/type="email"/)

    inquiryActions.setStep('send')
    const send = render(createElement(ConfiguratorPage), lang, 'dark', '/services/configure')
    expect(send).toMatch(/type="email"/)
    expect(send).toContain(escape(text.configurator.send.consent.label))
    expect(send).toContain(escape(text.configurator.actions.prepare))
  })

  it('goes back to the first step that is not good enough, whatever step was stored', () => {
    inquiryActions.setStep('send')
    const html = render(createElement(ConfiguratorPage), lang, 'dark', '/services/configure')
    expect(html).toContain(escape(text.configurator.titles.need))
  })
})

describe.each(LANGUAGES)('the cart in %s', (lang) => {
  const text = localize(shopText, lang)

  it('is welcoming when empty, and sells nothing', () => {
    const html = render(createElement(CartPage), lang, 'dark', '/services/cart')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain(escape(text.cart.empty.title))
    expect(html).toContain(escape(text.cart.empty.browse))
    expect(plain(html)).not.toMatch(NOT_LEAKED)
  })

  it('groups custom-quoted services, lets each package be changed, marks a line that still needs one and takes no payment', () => {
    cartStore.update(() => cartOf({ need: 'website', plan: 'launch', extras: ['pages'] }, { need: 'webapp' }))
    const html = render(createElement(CartPage), lang, 'dark', '/services/cart')
    expect(html).toContain(escape(text.cart.groups.quote))
    expect(html).not.toContain(`>${escape(text.cart.groups.fixed)}<`)
    expect(html).toContain(escape(text.common.needs.website.title))
    expect(html).toContain(escape(text.common.needs.webapp.title))
    expect(html.match(/name="cart-plan-website"/g)).toHaveLength(5)
    expect(html).toContain(escape(text.cart.line.needsPlan))
    expect(html).toContain(escape(text.common.price.kind.quote))
    expect(html).toContain(escape(text.cart.summary.noPayment))
    expect(html).toContain(escape(text.cart.actions.clear))
    expect(html).toMatch(new RegExp(`href="/${lang}/services/configure"[^>]*>(?:(?!</a>).)*${escape(text.cart.actions.proceed)}`))
    expect(html).toContain(escape(text.cart.actions.continue))
    expect(plain(html)).not.toMatch(NO_PRICE)
    expect(plain(html)).not.toMatch(NOT_LEAKED)
  })
})
