import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { resolveLanguageSwitch } from './languageSwitch'
import { NAV_PAGES, PAGES, SHOP_PAGES, findPage, serviceIdOfPage, type PageDef } from './pages'

describe('page registry', () => {
  it('lists the six navigation pages in order', () => {
    expect(NAV_PAGES.map((page) => page.id)).toEqual(['home', 'work', 'services', 'about', 'lab', 'contact'])
  })

  it('registers the shop beneath /services: a product page per service, the request builder and the cart, in every language', () => {
    expect(SHOP_PAGES.map((page) => page.path)).toEqual([
      '/services/website',
      '/services/webapp',
      '/services/ui',
      '/services/integrations',
      '/services/configure',
      '/services/cart',
    ])
    for (const page of SHOP_PAGES) {
      expect(page.languages).toEqual(LANGUAGES)
      expect(findPage(page.path)).toBe(page)
    }
    expect(NAV_PAGES.map((page) => page.path)).not.toContain('/services/cart')
    expect(serviceIdOfPage('service-ui')).toBe('ui')
    expect(serviceIdOfPage('cart')).toBeNull()
  })

  it('has unique, absolute paths', () => {
    const paths = PAGES.map((page) => page.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(path.startsWith('/')).toBe(true)
  })

  it('offers every page in the default language', () => {
    for (const page of PAGES) expect(page.languages).toContain(DEFAULT_LANGUAGE)
  })

  it.each(LANGUAGES)('has a %s navigation label for every navigation page', (lang) => {
    for (const page of NAV_PAGES) {
      expect(dictionaries[lang].nav[page.id].trim(), `${lang}:${page.id}`).not.toBe('')
    }
  })

  it('finds pages regardless of trailing slashes', () => {
    expect(findPage('/work')?.id).toBe('work')
    expect(findPage('/work/')?.id).toBe('work')
    expect(findPage('/')?.id).toBe('home')
    expect(findPage('')?.id).toBe('home')
    expect(findPage('/nope')).toBeUndefined()
  })
})

describe('resolveLanguageSwitch', () => {
  it('keeps the current page in the other language', () => {
    expect(resolveLanguageSwitch('/hu/work', 'en')).toEqual({ path: '/en/work', samePage: true })
    expect(resolveLanguageSwitch('/en/services/', 'nl')).toEqual({ path: '/nl/services', samePage: true })
    expect(resolveLanguageSwitch('/nl/', 'hu')).toEqual({ path: '/hu/', samePage: true })
    expect(resolveLanguageSwitch('/en/services/cart', 'hu')).toEqual({ path: '/hu/services/cart', samePage: true })
    expect(resolveLanguageSwitch('/hu/services/webapp', 'nl')).toEqual({ path: '/nl/services/webapp', samePage: true })
    expect(resolveLanguageSwitch('/nl', 'en')).toEqual({ path: '/en/', samePage: true })
  })

  it('falls back to that language\'s home page for an unknown path', () => {
    expect(resolveLanguageSwitch('/hu/does-not-exist', 'en')).toEqual({ path: '/en/', samePage: false })
  })

  it('falls back to home when the page has no translation in the target language', () => {
    const pages: PageDef[] = [
      { id: 'home', path: '/', languages: LANGUAGES },
      { id: 'about', path: '/about', languages: ['hu', 'en'] },
    ]
    expect(resolveLanguageSwitch('/hu/about', 'nl', pages)).toEqual({ path: '/nl/', samePage: false })
    expect(resolveLanguageSwitch('/hu/about', 'en', pages)).toEqual({ path: '/en/about', samePage: true })
  })

  it('never offers a path that is not in the registry', () => {
    for (const from of LANGUAGES) {
      for (const to of LANGUAGES) {
        for (const page of PAGES) {
          const target = resolveLanguageSwitch(`/${from}${page.path}`, to)
          const rest = target.path.slice(`/${to}`.length) || '/'
          expect(findPage(rest), target.path).toBeDefined()
        }
      }
    }
  })
})
