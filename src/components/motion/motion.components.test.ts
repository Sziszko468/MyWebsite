import { createElement, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { LANGUAGES, type Language } from '../../i18n/config'
import { I18nContext } from '../../i18n/context'
import { dictionaries } from '../../i18n/dictionaries'
import { MOTION, MOTION_SCOPES } from '../../motion/config'
import { PageTransition } from '../../motion/PageTransition'
import { flattenKinetic } from '../../test/markup'
import { Button } from '../Button/Button'
import { ServicesMenu } from '../MainNav/ServicesMenu'
import { KineticText } from './KineticText'
import { LoadingBar, Spinner } from './Loading'
import { Reveal } from './Reveal'
import { RevealImage } from './RevealImage'
import { ScrollLinked } from './ScrollLinked'

/** Renders on the server with the real language and a router: what the page is before any script has run. */
function render(element: ReactElement, lang: Language = 'en', entry: string | { pathname: string; key: string } = `/${lang}/`): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [entry] },
      createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, element),
    ),
  )
}

/** createElement with the content as the third argument, whatever props the component has. */
const wrap = (component: ComponentType<never>, props: object, ...content: ReactNode[]) =>
  createElement(component as ComponentType<object>, props, ...content)

const textOf = (html: string) =>
  html
    .replace(/<wbr\s*\/?>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

describe('KineticText on the server', () => {
  const headlines = ['Controlled Chaos', 'Weboldalfejlesztés és webalkalmazások', 'Webapplicatie-ontwikkeling', 'Build, test, ship', "Let's talk about it"]

  it('is the sentence as written, in every variant, with real spaces between the words', () => {
    for (const variant of ['mask', 'words', 'chars'] as const) {
      for (const text of headlines) {
        const html = render(createElement(KineticText, { text, variant }))
        expect(textOf(html), `${variant}: ${text}`).toBe(text)
        expect(flattenKinetic(html), `${variant}: ${text}`).toContain(`>${text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')}</`)
      }
    }
  })

  it('hides nothing from assistive technology and repeats nothing in a label', () => {
    const html = render(createElement(KineticText, { text: 'Controlled Chaos' }))
    expect(html).not.toMatch(/aria-hidden/)
    expect(html).not.toMatch(/aria-label/)
  })

  it('renders as the element it is told to, the headline itself, so no wrapper changes the outline', () => {
    const html = render(createElement(KineticText, { text: 'Hello world', as: 'h1' }))
    expect(html).toMatch(/^<h1 /)
    expect(html.match(/<h1/g)).toHaveLength(1)
  })

  it('starts visible: the hidden state is only ever set in the browser, for text below the fold', () => {
    const html = render(createElement(KineticText, { text: 'Below the fold', trigger: 'view' }))
    expect(html).not.toMatch(/data-state/)
    expect(html).toContain('data-trigger="view"')
  })

  it('gives every word the capped stagger as a CSS variable, and the first one none', () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
    const delays = [...render(createElement(KineticText, { text: long })).matchAll(/--d:(\d+)ms/g)].map((match) => Number(match[1]))
    expect(delays).toHaveLength(30)
    expect(delays[0]).toBe(0)
    expect(Math.max(...delays)).toBe(MOTION.stagger.max)
    expect([...delays]).toEqual([...delays].sort((a, b) => a - b))
  })

  it('lets a hyphenated word break at its hyphen, and never invents a break elsewhere', () => {
    const html = render(createElement(KineticText, { text: 'Webapplicatie-ontwikkeling' }))
    expect(html.match(/<wbr\/>/g)).toHaveLength(1)
    expect(html).not.toMatch(/&shy;|­/)
  })

  it('falls back from letter by letter to words for a long line, and keeps every letter', () => {
    const long = 'A headline that is far too long to move letter by letter'
    const html = render(createElement(KineticText, { text: long, variant: 'chars' }))
    expect(html).toContain('data-kinetic="mask"')
    expect(textOf(html)).toBe(long)
    const short = render(createElement(KineticText, { text: 'Spendly', variant: 'chars' }))
    expect(short).toContain('data-kinetic="chars"')
    expect(textOf(short)).toBe('Spendly')
    expect(short.match(/<span class="[^"]*char[^"]*"/g)).toHaveLength(7)
  })
})

describe('PageTransition on the server', () => {
  const page = (scope: (typeof MOTION_SCOPES)[number], entry: Parameters<typeof render>[2]) =>
    render(wrap(PageTransition, { routeKey: 'home', scope }, createElement('main', null, 'Page')), 'en', entry)

  it('does not animate the page a visit starts on: there is nothing to arrive from and it would only delay the first paint', () => {
    expect(page('site', '/en/')).toContain('data-enter="none"')
  })

  it('gives each scope its own arrival, from the config, and Back and Forward the same kind in a fraction of the time', () => {
    for (const scope of MOTION_SCOPES) {
      const html = page(scope, { pathname: '/en/', key: 'abc123' })
      expect(html, scope).toContain(`data-enter="${MOTION.scope[scope].enter.kind}"`)
      expect(html, scope).toContain(`--page-enter-dur:${MOTION.scope[scope].enter.duration}ms`)
      expect(html, scope).toContain('data-nav="pop"')
    }
  })

  it('wipes only in the Lab, and leaves the page content untouched inside the wrapper', () => {
    expect(page('lab', { pathname: '/en/lab', key: 'k' })).toContain('data-enter="wipe"')
    for (const scope of ['site', 'portfolio', 'shop', 'checkout'] as const) expect(page(scope, { pathname: '/en/', key: 'k' })).toContain('data-enter="fade"')
    expect(page('shop', '/en/')).toContain('<main>Page</main>')
  })

  it('arrives quicker in the shop and the cart than in the portfolio', () => {
    const duration = (scope: (typeof MOTION_SCOPES)[number]) => Number(/--page-enter-dur:(\d+)ms/.exec(page(scope, { pathname: '/en/', key: 'k' }))![1])
    expect(duration('checkout')).toBeLessThan(duration('shop'))
    expect(duration('shop')).toBeLessThan(duration('portfolio'))
  })
})

describe('Button states on the server', () => {
  const button = (props: Record<string, unknown>) => render(createElement(Button, props as never, 'Send'))

  it('is plain by default: no busy flag, no data attributes for states, a real button that submits nothing by itself', () => {
    const html = button({})
    expect(html).toContain('type="button"')
    expect(html).not.toMatch(/aria-busy|data-loading|data-status/)
  })

  it('says it is busy while loading, keeps its label and swaps the arrow for a spinner, without becoming disabled', () => {
    const html = button({ loading: true, arrow: true })
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('data-loading="true"')
    expect(html).not.toMatch(/disabled/)
    expect(html).toContain('Send')
    expect(html).toMatch(/<svg[^>]*viewBox="0 0 20 20"/)
    expect(html).not.toMatch(/viewBox="0 0 16 16"/)
  })

  it('holds one width for both labels: both are in the button, in one cell, and only the one that shows is not hidden', () => {
    const idle = button({ loadingLabel: 'Sending…' })
    expect(idle).toContain('Send')
    expect(idle).toContain('Sending…')
    expect(idle.match(/data-showing="true"/g)).toHaveLength(1)
    expect(/data-showing="true"[^>]*>Send</.test(idle)).toBe(true)
    const busy = button({ loadingLabel: 'Sending…', loading: true })
    expect(busy.match(/data-showing="true"/g)).toHaveLength(1)
    expect(/data-showing="true"[^>]*>Sending…</.test(busy)).toBe(true)
    // A button with no waiting label renders its text directly, with no cell around it.
    expect(button({})).not.toContain('data-showing')
  })

  it('shows the outcome on the button: a tick for success, a flag for an error', () => {
    const ok = button({ status: 'success' })
    expect(ok).toContain('data-status="success"')
    expect(ok).toMatch(/viewBox="0 0 16 16"/)
    const failed = button({ status: 'error' })
    expect(failed).toContain('data-status="error"')
    expect(failed).not.toContain('<svg')
  })

  it('is disabled the standard way for a button, and as an inert link for a link', () => {
    expect(button({ disabled: true })).toMatch(/<button[^>]* disabled=""/)
    const link = render(createElement(Button, { to: '/services', disabled: true } as never, 'Go'))
    expect(link).toContain('aria-disabled="true"')
    expect(link).not.toContain('href=')
  })

  it('marks only the buttons that ask to be magnetic', () => {
    expect(button({ magnetic: true })).toMatch(/class="[^"]*magnetic/)
    expect(button({})).not.toMatch(/magnetic/)
  })

  it('takes the language prefix for an internal link, in every language', () => {
    for (const lang of LANGUAGES) {
      expect(render(createElement(Button, { to: '/services/cart' } as never, 'Cart'), lang, `/${lang}/`)).toContain(`href="/${lang}/`)
    }
  })
})

describe('the Services dropdown on the server', () => {
  const menu = (lang: Language = 'en') =>
    render(createElement(ServicesMenu, null, createElement('a', { href: '/en/services' }, 'Services')), lang, `/${lang}/`)

  it('is closed and out of reach before any script runs: inert, collapsed, and nothing in the tab order', () => {
    const html = menu()
    expect(html).toMatch(/aria-expanded="false"/)
    expect(html).toMatch(/\binert=""/)
    expect(html).not.toMatch(/tabindex="[1-9]/)
  })

  it('connects its button to its panel and keeps the entry’s own link', () => {
    const html = menu()
    const controls = /aria-controls="([^"]+)"/.exec(html)![1]
    expect(html).toContain(`id="${controls}"`)
    expect(html).toContain('href="/en/services"')
  })

  it('lists the four services, the packages, the builder and the cart as real links, in every language', () => {
    for (const lang of LANGUAGES) {
      const html = menu(lang)
      for (const path of ['/services/website', '/services/webapp', '/services/ui', '/services/integrations', '/services/configure', '/services/cart']) {
        expect(html, `${lang} ${path}`).toContain(`href="/${lang}${path}"`)
      }
    }
  })
})

describe('the small motion components on the server', () => {
  it('Reveal shows its content with no hidden state, so it is there without scripts', () => {
    const html = render(wrap(Reveal, { variant: 'rise', delay: 120 }, createElement('p', null, 'Hello')))
    expect(html).toContain('<p>Hello</p>')
    expect(html).not.toMatch(/data-reveal="hidden"/)
  })

  it('RevealImage keeps the picture’s own alt text and size, so nothing shifts when it loads', () => {
    const html = render(createElement(RevealImage, { src: '/a.png', alt: 'A screenshot', width: 640, height: 360 } as never))
    expect(html).toContain('alt="A screenshot"')
    expect(html).toContain('width="640"')
    expect(html).toContain('height="360"')
  })

  it('ScrollLinked is a plain wrapper with its content in the document', () => {
    const html = render(wrap(ScrollLinked, { mode: 'shift', range: '-24px' }, createElement('p', null, 'Content')))
    expect(html).toContain('<p>Content</p>')
    expect(html).toContain('--range:-24px')
    expect(html).toContain('data-scroll="shift"')
    // Nothing is moved by the server: the numbers the CSS reads are only ever written in the browser.
    expect(html).not.toMatch(/--sp/)
  })

  it('LoadingBar is a polite status that says nothing until there is a wait, and the spinner carries no text', () => {
    const html = render(createElement(LoadingBar))
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('data-active')
    expect(textOf(html)).toBe('')
    expect(textOf(renderToStaticMarkup(createElement(Spinner)))).toBe('')
    expect(renderToStaticMarkup(createElement(Spinner))).toContain('aria-hidden="true"')
  })
})
