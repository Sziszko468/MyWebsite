import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { packages } from '../content/packages'
import { serviceAreas } from '../content/services/areas'
import { faq } from '../content/services/faq'
import { processSteps } from '../content/services/process'
import { LANGUAGES, type Language } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { I18nContext } from '../i18n/context'
import { ThemeContext } from '../theme/context'
import { SERVICES_RHYTHM } from '../components/services/rhythm'
import { ServicesPage } from './ServicesPage'

/**
 * Renders the whole page on the server, as markup, with the real providers. It cannot click, but it
 * catches what a browser would only show later: a crash, a missing translation, a section that is
 * not there, a template that leaked into the text.
 */
function render(lang: Language, theme: 'dark' | 'light' = 'dark', url = '/services'): string {
  return renderToStaticMarkup(
    createElement(
      ThemeContext.Provider,
      { value: { theme, setTheme: () => undefined, toggleTheme: () => undefined } },
      createElement(
        MemoryRouter,
        { initialEntries: [`/${lang}${url}`] },
        createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, createElement(ServicesPage)),
      ),
    ),
  )
}

/** Just the packages band: some words (a price, "what can be included") are also used elsewhere on the page. */
const packagesBand = (html: string) => html.slice(html.indexOf('id="packages"'), html.indexOf('id="quote"'))

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

describe.each(LANGUAGES)('the services page in %s', (lang) => {
  const html = render(lang)
  const t = dictionaries[lang]

  it('renders one h1, with the headline of the brief', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain(escape(t.servicesPage.hero.titleLine1))
    expect(html).toContain(escape(t.servicesPage.hero.titleLine2))
  })

  it('has every band, each one named by a heading', () => {
    for (const { id } of SERVICES_RHYTHM) expect(html, id).toMatch(new RegExp(`<section[^>]*id="${id}"[^>]*aria-labelledby="[^"]+"`))
  })

  it('shows the four service areas with their features', () => {
    for (const area of serviceAreas) {
      expect(html).toContain(escape(area.name[lang]))
      for (const feature of area.features) expect(html).toContain(escape(feature[lang]))
    }
  })

  it('shows all four packages as one group of radio buttons with the same facts in each', () => {
    expect(html.match(/<input[^>]*type="radio"[^>]*name="([^"]+)"/g)?.length).toBeGreaterThanOrEqual(4)
    for (const pkg of packages) {
      expect(html).toContain(`data-package="${pkg.id}"`)
      expect(html).toContain(escape(pkg.tagline[lang]))
      for (const item of pkg.includes) expect(html).toContain(escape(item[lang]))
    }
    // Every card carries the five rows, the same ones, in the same order.
    const rows = t.servicesPage.packages.rows
    for (const label of [rows.audience, rows.fits, rows.includes, rows.price, rows.timeline]) {
      expect(packagesBand(html).split(`>${escape(label)}<`).length - 1, label).toBe(packages.length)
    }
  })

  it('asks for a custom quote instead of showing a price', () => {
    // The bar under the cards may use the same words for its button, so the reason under each price is counted too.
    expect(packagesBand(html).split(escape(t.services.priceQuote)).length - 1).toBeGreaterThanOrEqual(packages.length)
    expect(packagesBand(html).split(escape(t.services.priceQuoteHint)).length - 1).toBe(packages.length)
    expect(html).not.toMatch(/[€$£]|\bEUR\b|\bHUF\b|\bFt\b/)
  })

  it('opens on the first step of the form, with the question and no answer chosen', () => {
    expect(html).toContain(escape(t.servicesPage.quote.stepTitles.project))
    expect(html).toContain(escape(t.servicesPage.quote.fields.projectType.label))
    expect(html).not.toContain(escape(t.servicesPage.quote.sent.title + '<'))
    expect(html).not.toMatch(/type="radio"[^>]*checked=""/)
  })

  it('says up front that nothing can be sent yet, because no endpoint is configured', () => {
    expect(html).toContain(escape(t.servicesPage.quote.unavailable.notice))
  })

  it('shows the process and every question', () => {
    for (const step of processSteps) expect(html).toContain(escape(step.title[lang]))
    for (const item of faq) {
      expect(html).toContain(escape(item.question[lang]))
      expect(html).toContain(escape(item.answer[lang]))
    }
  })

  it('closes with the call to action, which leads to the quote request', () => {
    expect(html).toContain(escape(t.servicesPage.final.cta))
    expect(html).toMatch(new RegExp(`<a[^>]*href="#quote"[^>]*>(?:(?!</a>).)*${escape(t.servicesPage.final.cta)}`))
  })

  it('leaks no template, no undefined and no object into the text', () => {
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/\{\w+\}|undefined|\[object|NaN/)
  })
})

describe('the services page', () => {
  it('chooses the package named in the address', () => {
    const html = render('hu', 'dark', '/services?package=build')
    expect(html).toMatch(/data-package="build"[^>]*data-selected="true"/)
    expect(html).not.toMatch(/data-package="(launch|grow|care)"[^>]*data-selected/)
    expect(html).toContain(escape(dictionaries.hu.servicesPage.packages.bar.some.replace('{name}', 'Build')))
  })

  it('ignores a package it does not know', () => {
    const html = render('hu', 'dark', '/services?package=enterprise')
    expect(html).not.toMatch(/data-selected/)
    expect(html).toContain(escape(dictionaries.hu.servicesPage.packages.bar.none))
  })

  it('renders the same bands in the light theme', () => {
    const html = render('en', 'light')
    for (const { id } of SERVICES_RHYTHM) expect(html, id).toContain(`id="${id}"`)
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('data-theme="light"')
  })
})
