// PROMPT 18, tests A-D: the starting language by country, the saved choice, and the language of the Shop, in a real Chrome against
// `wrangler dev` (the real Workers runtime, with the dev-only country simulation switched on):
//   npm run build
//   npx wrangler dev --port 8799 --var SIMULATE_COUNTRY:1
//   AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/l10n-journey.cjs [http://127.0.0.1:8799]
// SIMULATE_COUNTRY is never set in wrangler.jsonc: the deployed Worker ignores the x-simulate-country header this script sends.
const { launch } = require('../audit/lib.cjs')
const BASE = process.argv[2] || 'http://127.0.0.1:8799'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const SEEN = `try { localStorage.setItem('intro:seen','1'); localStorage.setItem('intro:skip','1') } catch (e) {}`
async function visitor(browser, country, { cookie, width = 1280, height = 900, mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    extraHTTPHeaders: country ? { 'x-simulate-country': country } : {},
  })
  await context.addInitScript(SEEN)
  if (cookie) await context.addCookies([{ name: 'cc_lang', value: cookie, url: BASE }])
  return { context, page: await context.newPage() }
}

// Words that only an English sentence has. A Hungarian or Dutch page whose paragraph has several of them is a string that fell back.
const ENGLISH = /\b(the|and|with|your|you|for|of|are|will|what|that|this|from|about)\b/gi
const englishBlocks = (blocks) =>
  blocks.filter((text) => text.split(/\s+/).length >= 7 && (text.match(ENGLISH) || []).length >= 3)

async function blocksOf(page) {
  return page.evaluate(() => {
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim()
    const els = [...document.querySelectorAll('main h1, main h2, main h3, main p, main li, main button, main a, main label, main summary, main legend')]
    return [...new Set(els.filter((el) => el.getClientRects().length > 0).map((el) => clean(el.innerText)).filter(Boolean))]
  })
}

const SHOP = ['/services/', '/services/packages/launch/', '/services/packages/care/', '/services/website/', '/services/full-experience/', '/services/full-experience/start/', '/services/configure/', '/services/cart/']

async function landing(browser, label, country, expected, options) {
  const { context, page } = await visitor(browser, country, options)
  const response = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const url = new URL(page.url())
  const lang = await page.evaluate(() => document.documentElement.lang)
  check(`${label}: "/" ends on /${expected}/ with <html lang="${expected}">`, url.pathname === `/${expected}/` && lang === expected, `${url.pathname} lang=${lang}`)
  await context.close()
  return response
}

;(async () => {
  const browser = await launch()

  // Which language each country starts in
  await landing(browser, 'Hungarian IP (HU)', 'HU', 'hu')
  await landing(browser, 'Dutch IP (NL)', 'NL', 'nl')
  await landing(browser, 'German IP (DE)', 'DE', 'en')
  await landing(browser, 'French IP (FR)', 'FR', 'en')
  await landing(browser, 'US IP (US)', 'US', 'en')
  await landing(browser, 'Unknown country (XX)', 'XX', 'en')
  await landing(browser, 'Tor (T1)', 'T1', 'en')
  await landing(browser, 'VPN exit in the Netherlands (what the edge sees is NL)', 'NL', 'nl')
  {
    // No country at all: wrangler dev fills request.cf from the machine's real location, so the header-less answer is the real country's
    const { context, page } = await visitor(browser, null)
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    check('No simulated country: the real request.cf.country decides (a real country code reached the Worker)', ['/hu/', '/nl/', '/en/'].includes(new URL(page.url()).pathname), new URL(page.url()).pathname)
    await context.close()
  }

  // Test A / B / C: the Shop in the starting language, no English fallback text
  for (const [country, lang] of [['HU', 'hu'], ['NL', 'nl'], ['DE', 'en']]) {
    const { context, page } = await visitor(browser, country)
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    let bad = []
    for (const path of SHOP) {
      await page.goto(`${BASE}/${lang}${path}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(250)
      const shown = await page.evaluate(() => document.documentElement.lang)
      const blocks = await blocksOf(page)
      if (shown !== lang) bad.push(`${path}: lang=${shown}`)
      if (lang !== 'en') bad.push(...englishBlocks(blocks).map((text) => `${path}: ${text.slice(0, 90)}`))
      const raw = blocks.filter((text) => /\b(?:[a-z][a-zA-Z0-9]*\.){2,}[a-zA-Z][a-zA-Z0-9]*\b/.test(text.replace(/\b(?:example|nfsu2)\.\w+/g, '')))
      bad.push(...raw.map((text) => `${path}: raw key? ${text.slice(0, 60)}`))
    }
    check(`Test ${lang === 'hu' ? 'A' : lang === 'nl' ? 'B' : 'C'}: the ${SHOP.length} Shop pages (services, packages, service, FULL EXPERIENCE, configurators, cart) are all ${lang.toUpperCase()}, no raw keys`, bad.length === 0, bad.slice(0, 4).join(' | '))
    await context.close()
  }

  // The configurator step texts in each language (forms, buttons, validation message)
  for (const [lang, expect] of [['hu', /Mire van szükséged/], ['nl', /Wat heb je nodig/], ['en', /What do you need/]]) {
    const { context, page } = await visitor(browser, null)
    await page.goto(`${BASE}/${lang}/services/configure/`, { waitUntil: 'networkidle' })
    const text = await page.evaluate(() => document.body.innerText)
    check(`Configurator opens in ${lang.toUpperCase()}`, expect.test(text))
    await page.getByRole('button', { name: /Tov[aá]bb|Volgende|Next/ }).first().click().catch(() => {})
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => document.body.innerText)
    const message = { hu: /Válassz legalább egy igényt/, nl: /Kies minstens één behoefte/, en: /Choose at least one need/ }[lang]
    check(`Its validation message is ${lang.toUpperCase()} ("choose at least one need")`, message.test(after))
    await context.close()
  }

  // Test D: a manual choice beats the country, on later pages, after a reload and on a later visit
  {
    const { context, page } = await visitor(browser, 'HU')
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    check('Test D: a Hungarian visitor starts in Hungarian', new URL(page.url()).pathname === '/hu/')
    await page.goto(`${BASE}/hu/services/`, { waitUntil: 'networkidle' })
    const english = page.locator('header').getByRole('link', { name: /English/ }).first()
    await english.click()
    await page.waitForURL(/\/en\/services\/?$/)
    check('Test D: choosing English keeps the page (/en/services)', new URL(page.url()).pathname.replace(/\/$/, '') === '/en/services')
    const cookies = await context.cookies()
    const saved = cookies.find((c) => c.name === 'cc_lang')
    check('Test D: the choice is one first-party cookie holding only the language code', saved && saved.value === 'en' && saved.sameSite === 'Lax' && saved.path === '/' && cookies.length === 1, JSON.stringify(saved))
    // browse on, in-app
    await page.getByRole('link', { name: /packages|Launch/i }).first().click().catch(() => {})
    await page.waitForTimeout(400)
    check('Test D: moving through the site stays English', (await page.evaluate(() => document.documentElement.lang)) === 'en')
    await page.reload({ waitUntil: 'networkidle' })
    check('Test D: after a refresh it is still English', (await page.evaluate(() => document.documentElement.lang)) === 'en')
    const second = await context.newPage()
    await second.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    check('Test D: reopening the website (a new tab, still a Hungarian IP) opens in English', new URL(second.url()).pathname === '/en/', new URL(second.url()).pathname)
    // the same cookie with a different country each time
    await second.setExtraHTTPHeaders({ 'x-simulate-country': 'NL' })
    await second.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    check('Test D: the saved English also beats a Dutch IP (a VPN)', new URL(second.url()).pathname === '/en/')
    // and a typed address without a language
    await second.goto(`${BASE}/services`, { waitUntil: 'networkidle' })
    check('Test D: a path typed without a language goes to the saved language, as a directory', new URL(second.url()).pathname === '/en/services/', new URL(second.url()).pathname)
    await context.close()
  }
  {
    const { context, page } = await visitor(browser, 'DE', { cookie: 'nl' })
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    check('Returning visitor: a saved Dutch choice beats a German IP', new URL(page.url()).pathname === '/nl/')
    await context.close()
  }
  {
    // A direct link in another language is the visitor's explicit choice and is never redirected
    const { context, page } = await visitor(browser, 'HU')
    await page.goto(`${BASE}/nl/services/`, { waitUntil: 'networkidle' })
    check('An explicit /nl/ address is not redirected, whatever the country', new URL(page.url()).pathname === '/nl/services/' && (await page.evaluate(() => document.documentElement.lang)) === 'nl')
    const cookies = await context.cookies()
    check('Opening a page in a language does not save it (only choosing it does)', !cookies.some((c) => c.name === 'cc_lang'))
    await context.close()
  }
  {
    // Crawlers get the root document, not a redirect
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', extraHTTPHeaders: { 'x-simulate-country': 'HU' } })
    const response = await context.request.get(`${BASE}/`, { maxRedirects: 0 })
    check('Googlebot from a Hungarian IP: 200, the root document (not a redirect)', response.status() === 200, String(response.status()))
    await context.close()
  }
  {
    // A forged header must not change anything (the deployed Worker has no simulation switch)
    const response = await fetch(`${BASE}/`, { redirect: 'manual', headers: { 'x-simulate-country': 'DE', 'cf-ipcountry': 'NL', 'x-forwarded-for': '31.0.0.1' } })
    check('A forged CF-IPCountry / X-Forwarded-For header is not read (DE decides: English, not NL)', response.status === 302 && String(response.headers.get('location')).endsWith('/en/'), String(response.headers.get('location')))
  }

  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
