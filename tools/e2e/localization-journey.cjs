#!/usr/bin/env node
/**
 * The three languages end to end, in a real Chrome against the BUILT website served by the real backend (PROMPT 23).
 *
 *   MSYS_NO_PATHCONV=1 VITE_API_URL=/ npm run build
 *   # one scratch backend that serves dist/ ...                                   (see tools/e2e/README.md)
 *   # ... and a second one with COUNTRY_HEADER=CF-IPCountry (the production path: Render behind Cloudflare)
 *   AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/localization-journey.cjs --base=http://127.0.0.1:8801 --country-base=http://127.0.0.1:8802
 *
 * What it asserts (nothing is mocked, nothing is sent anywhere: the only requests are to the two scratch servers):
 *   A  every public page, direct address, in hu / en / nl, on a desktop and on a 390 px touch phone: status, <html lang>, a title that is not
 *      a key, no raw key or unfilled placeholder on screen, no words of another language (the `foreign` rule of src/i18n/quality, on
 *      the rendered text), no sideways scroll, canonical / hreflang / og:locale that say the page's own language, and no request that
 *      leaves the site (no third-party translation or font service)
 *   B  the language switcher and the preference: the switch keeps the page, saves ONE cookie (cc_lang) only when chosen, a saved choice
 *      beats the default at `/`, an explicit /hu/ address beats a saved choice, back and forward restore the language of each page, the
 *      browser's own language is not a signal, a crawler is not redirected
 *   C  a page that does not exist is the 404 page IN the language of the address, with status 404
 *   D  the country step (second server, COUNTRY_HEADER): HU -> /hu/, NL -> /nl/, anything else or nothing -> /en/, a saved choice beats the country, an
 *      address that names a language is never redirected, a crawler never is, the answer is private and never cached
 */
const { launch, LANGS, PAGES } = require('../audit/lib.cjs')
const foreignWords = require('../../src/i18n/quality/foreignWords.json')

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const BASE = args.base || 'http://127.0.0.1:8801'
const COUNTRY_BASE = args['country-base'] || ''
const OUT = args.out || ''
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const SEEN = `try { localStorage.setItem('intro:seen','1'); localStorage.setItem('intro:skip','1') } catch (e) {}`
const OG_LOCALE = { hu: 'hu_HU', en: 'en_GB', nl: 'nl_NL' }
// The same phrases the quality check lets through (src/i18n/quality/allowances.ts): names written in English inside a sentence.
const PHRASES = [/Do Not Track/g, /Global Privacy Control/g, /Hollandia Kezdőknek/g]
const KEY = /\b(?:[a-z][a-zA-Z0-9]*\.){2,}[a-zA-Z][a-zA-Z0-9]*\b/
const KEY_ALLOW = /\b(?:example\.(?:test|com)|nfsu2\.xyz|next\.js|three\.js|node\.js|vite\.js|d3\.js|www\.[\w.-]+|[\w-]+\.(?:com|hu|nl|dev|io|xyz|test))\b/gi
const BROKEN = /\bundefined\b|\[object Object\]|\{[a-zA-Z]+\}|\{\{|%s\b|\$\{/

/** What the `foreign` rule does to one text: the words of another language in a text written in `lang`. */
function foreignIn(text, lang) {
  let clean = text.replace(/\{[A-Za-z0-9_]+\}/g, ' ').replace(/https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ')
  // A citation of the repository's own English document ("docs/architecture.md · The shipment workflow · …", Logistics case study): the file
  // and its section titles are quoted as they are written there, in every language.
  clean = clean.replace(/docs\/[\w./-]+\.md[\s\S]*$/, ' ')
  for (const phrase of PHRASES) clean = clean.replace(phrase, ' ')
  const tokens = clean.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) || []
  const found = []
  for (const from of LANGS) {
    if (from === lang) continue
    const hits = [...new Set(tokens.filter((token) => foreignWords[from].includes(token)))]
    if (hits.length) found.push(`${from.toUpperCase()}: ${hits.join(', ')}`)
  }
  if (lang !== 'hu' && /[őűŐŰ]/.test(clean)) found.push('HU letters: ' + [...new Set(clean.match(/[őűŐŰ]/g))].join(''))
  return found
}

async function context(browser, { mobile = false, headers = {}, cookies = [], userAgent, locale } = {}) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    extraHTTPHeaders: headers,
    userAgent,
    locale,
  })
  await ctx.addInitScript(SEEN)
  if (cookies.length) await ctx.addCookies(cookies)
  return ctx
}

/** What a visitor reads on the page: headings, paragraphs, list items, buttons, links, labels. Only what is on screen. */
const readPage = (page) =>
  page.evaluate(() => {
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim()
    const els = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main li, main button, main a, main label, main summary, header a, header button, footer a, footer p')]
    const blocks = [...new Set(els.filter((el) => el.getClientRects().length > 0 && !el.closest('[aria-hidden=true], pre, code')).map((el) => clean(el.innerText)).filter(Boolean))]
    const meta = (key) => [...document.querySelectorAll('meta')].filter((m) => m.name === key || m.getAttribute('property') === key).map((m) => m.content)
    return {
      lang: document.documentElement.lang,
      title: document.title,
      blocks,
      wide: document.documentElement.scrollWidth - window.innerWidth,
      canonical: [...document.querySelectorAll('link[rel=canonical]')].map((l) => l.href),
      alternates: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => [l.getAttribute('hreflang'), new URL(l.href).pathname]),
      ogLocale: meta('og:locale'),
      robots: meta('robots'),
    }
  })

async function main() {
  const browser = await launch()
  const failures = []

  // ---- A. every page, direct address, three languages, desktop and phone -------------------------------------------------------
  const ROUTES = PAGES.filter((route) => !['/services/configure', '/services/cart'].includes(route)).concat(['/services/configure', '/services/cart'])
  for (const mobile of [false, true]) {
    const ctx = await context(browser, { mobile })
    const page = await ctx.newPage()
    const outside = new Set()
    page.on('request', (request) => {
      const url = request.url()
      if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) outside.add(new URL(url).host)
    })
    const label = mobile ? 'phone 390' : 'desktop 1440'
    let pages = 0
    const problems = []
    for (const lang of LANGS) {
      for (const route of ROUTES) {
        const path = `/${lang}${route === '/' ? '/' : route}`
        const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => document.querySelector('main h1, main h2') !== null, undefined, { timeout: 20000 }).catch(() => undefined)
        await page.waitForTimeout(route.startsWith('/lab/') ? 900 : 250)
        const read = await readPage(page)
        pages += 1
        const where = `${label} ${path}`
        if (!response || response.status() !== 200) problems.push(`${where}: status ${response && response.status()}`)
        if (read.lang !== lang) problems.push(`${where}: <html lang="${read.lang}">`)
        if (!read.title || KEY.test(read.title.replace(KEY_ALLOW, ''))) problems.push(`${where}: title "${read.title}"`)
        const text = read.blocks.join('\n')
        if (BROKEN.test(text)) problems.push(`${where}: an unfilled placeholder is on screen (${(text.match(BROKEN) || [])[0]})`)
        if (KEY.test(text.replace(KEY_ALLOW, ''))) problems.push(`${where}: a raw key is on screen (${(text.replace(KEY_ALLOW, '').match(KEY) || [])[0]})`)
        const foreign = read.blocks.flatMap((block) => foreignIn(block, lang).map((hit) => `${hit} in "${block.slice(0, 70)}"`))
        if (foreign.length) problems.push(`${where}: words of another language: ${foreign.slice(0, 2).join(' | ')}`)
        if (read.wide > 1) problems.push(`${where}: sideways scroll by ${read.wide}px`)
        if (read.canonical.length) {
          const own = new URL(read.canonical[0]).pathname
          if (!own.startsWith(`/${lang}/`)) problems.push(`${where}: canonical ${own} is not in ${lang}`)
          const self = read.alternates.find(([code]) => code === lang)
          if (!self || self[1] !== own) problems.push(`${where}: hreflang ${lang} is not the page itself`)
          const codes = read.alternates.map(([code]) => code)
          if (!codes.includes('x-default') || new Set(codes).size !== codes.length) problems.push(`${where}: hreflang set ${codes.join(',')}`)
          if (read.ogLocale[0] !== OG_LOCALE[lang]) problems.push(`${where}: og:locale ${read.ogLocale[0]}`)
        } else if (!read.robots.some((value) => /noindex/.test(value)) && !/\/(preview)/.test(route)) {
          problems.push(`${where}: no canonical and not noindex`)
        }
      }
    }
    check(`A ${label}: ${pages} pages (${ROUTES.length} routes x 3 languages): status, lang, title, no key or placeholder, no foreign words, no sideways scroll, canonical/hreflang/og:locale`, problems.length === 0, problems.slice(0, 5).join(' || '))
    check(`A ${label}: nothing was requested from outside the site (no translation, font or analytics service)`, outside.size === 0, [...outside].join(', '))
    failures.push(...problems)
    await ctx.close()
  }

  // ---- B. the switcher and the saved preference -----------------------------------------------------------------------------------
  {
    const ctx = await context(browser)
    const page = await ctx.newPage()
    const cookie = async () => (await ctx.cookies(BASE)).find((c) => c.name === 'cc_lang')?.value ?? null
    await page.goto(`${BASE}/en/work/spendly`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('main h1')
    const enTitle = await page.title()
    check('B opening a page in a language saves nothing (no cookie yet)', (await cookie()) === null)

    await page.locator('header a[hreflang="nl"]').first().click()
    await page.waitForFunction(() => document.documentElement.lang === 'nl')
    check('B the switch keeps the page: /en/work/spendly -> /nl/work/spendly', new URL(page.url()).pathname.replace(/\/$/, '') === '/nl/work/spendly', page.url())
    check('B the title changed language with the page', (await page.title()) !== enTitle, `${enTitle} -> ${await page.title()}`)
    check('B choosing a language saves exactly one cookie, cc_lang=nl', (await cookie()) === 'nl' && (await ctx.cookies(BASE)).filter((c) => c.name === 'cc_lang').length === 1)

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => /^\/(hu|en|nl)\//.test(location.pathname), undefined, { timeout: 10000 })
    check('B the saved choice beats the default at /: it opens /nl/', new URL(page.url()).pathname === '/nl/', page.url())

    await page.goto(`${BASE}/hu/about/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('main h1')
    check('B an address that names a language is never overridden by a saved choice: /hu/about/ stays hungarian', new URL(page.url()).pathname === '/hu/about/' && (await page.evaluate(() => document.documentElement.lang)) === 'hu')
    check('B opening it did not change the saved choice (still nl)', (await cookie()) === 'nl')

    await page.goBack({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.documentElement.lang === 'nl')
    check('B Back restores the language of the previous page', new URL(page.url()).pathname === '/nl/' && (await page.evaluate(() => document.documentElement.lang)) === 'nl', page.url())
    await page.goForward({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.documentElement.lang === 'hu')
    check('B Forward restores the language of the next page', new URL(page.url()).pathname === '/hu/about/', page.url())

    // Reloading and a second tab keep what was chosen; a page typed without a language follows the saved choice, never the browser's language.
    const second = await ctx.newPage()
    await second.goto(`${BASE}/services`, { waitUntil: 'domcontentloaded' })
    await second.waitForFunction(() => /^\/(hu|en|nl)\//.test(location.pathname), undefined, { timeout: 10000 })
    check('B a page typed without a language opens in the saved language in a new tab', new URL(second.url()).pathname.startsWith('/nl/services'), second.url())
    await ctx.close()
  }
  {
    const ctx = await context(browser, { locale: 'nl-NL' })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => /^\/(hu|en|nl)\//.test(location.pathname), undefined, { timeout: 10000 })
    check('B the browser\'s own language (nl-NL) is not a signal: no saved choice and no country -> English', new URL(page.url()).pathname === '/en/', page.url())
    await ctx.close()
  }
  {
    const response = await fetch(`${BASE}/`, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'accept-language': 'hu' } })
    check('B a crawler gets the root document (200), never a redirect', response.status === 200, `status ${response.status}`)
  }

  // ---- C. a page that does not exist, in the language of the address ----------------------------------------------------------------
  {
    const ctx = await context(browser)
    const page = await ctx.newPage()
    const titles = {}
    for (const lang of LANGS) {
      const response = await page.goto(`${BASE}/${lang}/there-is-no-such-page`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('main h1, h1')
      const read = await readPage(page)
      titles[lang] = read.title
      const foreign = read.blocks.flatMap((block) => foreignIn(block, lang))
      check(`C /${lang}/there-is-no-such-page: 404 status, <html lang="${lang}">, noindex, no words of another language`, response.status() === 404 && read.lang === lang && read.robots.some((v) => /noindex/.test(v)) && foreign.length === 0, `${response.status()} ${read.lang} ${foreign.join(' | ')}`)
    }
    check('C the three 404 pages have three different titles', new Set(Object.values(titles)).size === 3, JSON.stringify(titles))
    await ctx.close()
  }

  // ---- D. the country step on the server that serves the site (production: Render behind Cloudflare) ----------------------------------
  if (COUNTRY_BASE) {
    const go = async (path, { country, cookie, agent } = {}) => {
      const headers = {}
      if (country !== undefined) headers['cf-ipcountry'] = country
      if (cookie) headers.cookie = `cc_lang=${cookie}`
      if (agent) headers['user-agent'] = agent
      const response = await fetch(COUNTRY_BASE + path, { redirect: 'manual', headers })
      return { status: response.status, location: response.headers.get('location'), cache: response.headers.get('cache-control') }
    }
    const to = async (name, path, options, location) => {
      const r = await go(path, options)
      check(`D ${name}`, r.status === 302 && r.location === location, `${r.status} ${r.location}`)
      return r
    }
    await to('Hungary -> /hu/', '/', { country: 'HU' }, '/hu/')
    await to('the Netherlands -> /nl/', '/', { country: 'NL' }, '/nl/')
    await to('Germany -> English', '/', { country: 'DE' }, '/en/')
    await to('an unknown country (XX) -> English', '/', { country: 'XX' }, '/en/')
    await to('Tor (T1) -> English', '/', { country: 'T1' }, '/en/')
    await to('no country at all -> English', '/', {}, '/en/')
    await to('a made-up value is English, never trusted as a language', '/', { country: 'nl; drop table' }, '/en/')
    await to('a saved choice (en) beats the country (HU)', '/', { country: 'HU', cookie: 'en' }, '/en/')
    await to('a saved choice (hu) beats the country (NL)', '/', { country: 'NL', cookie: 'hu' }, '/hu/')
    await to('a saved value that is not a language is ignored', '/', { country: 'NL', cookie: 'de' }, '/nl/')
    await to('a page typed without a language keeps its path and follows the country', '/services', { country: 'NL' }, '/nl/services/')
    const named = await go('/nl/about/', { country: 'HU', cookie: 'en' })
    check('D an address that names a language is never redirected (/nl/about/ with HU and a saved en)', named.status === 200, `${named.status}`)
    const bot = await go('/', { country: 'HU', agent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })
    check('D a crawler is never redirected on its country', bot.status === 200, `${bot.status}`)
    const redirect = await go('/', { country: 'HU' })
    check('D the answer is private and never cached', /private/.test(redirect.cache || '') && /no-store/.test(redirect.cache || ''), redirect.cache)
    // In a real browser: the country decides the first visit; choosing a language then wins on every later one.
    const ctx = await context(browser, { headers: { 'cf-ipcountry': 'NL' } })
    const page = await ctx.newPage()
    await page.goto(`${COUNTRY_BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => /^\/(hu|en|nl)\//.test(location.pathname), undefined, { timeout: 10000 })
    check('D a visitor from the Netherlands opens /nl/', new URL(page.url()).pathname === '/nl/', page.url())
    await page.locator('header a[hreflang="en"]').first().click()
    await page.waitForFunction(() => document.documentElement.lang === 'en')
    await page.goto(`${COUNTRY_BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => /^\/(hu|en|nl)\//.test(location.pathname), undefined, { timeout: 10000 })
    check('D after choosing English the visitor stays in English at / (the country does not switch them back)', new URL(page.url()).pathname === '/en/', page.url())
    await page.reload({ waitUntil: 'domcontentloaded' })
    check('D a reload does not switch again', new URL(page.url()).pathname === '/en/', page.url())
    await ctx.close()
  } else {
    console.log('D skipped: no --country-base (a scratch server started with COUNTRY_HEADER=CF-IPCountry)')
  }

  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (OUT) require('fs').writeFileSync(OUT, JSON.stringify({ results, problems: failures }, null, 2))
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
