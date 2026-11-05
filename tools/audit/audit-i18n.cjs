#!/usr/bin/env node
/**
 * Localisation audit (PROMPT 15, phase 4), in a real browser against the BUILT site: every page in Hungarian, English and Dutch.
 *
 *   node tools/audit/audit-i18n.cjs [dist]            # exit 1 on a finding
 *
 * It reads what a visitor reads (the rendered text, the document's title and language, button/link names) and flags:
 *   - a raw localisation key or an unfilled placeholder on screen (`home.hero.title`, `{name}`, `undefined`, `[object Object]`, `NaN`);
 *   - `<html lang>` that is not the page's language, or a title that is empty or a key;
 *   - a Hungarian or Dutch paragraph, heading, list item or control whose text is IDENTICAL to the English page's (a string that
 *     fell back to English, or was never translated). Proper nouns, technology names and the like are allowed through a short list
 *     and anything under 3 words is ignored;
 *   - the language switch: every other language's link points at the same page (the equivalent route), not at the home page.
 * Counts are printed for each language so a silent drop in coverage shows.
 */
const path = require('path')
const { start } = require('./serve.cjs')
const { launch, newPage, LANGS, PAGES } = require('./lib.cjs')

const DIST = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..', 'dist'))
const PORT = 4240

// Text that is the same in every language on purpose: names, technologies, the English signature lines of the Lab, e-mail-like strings.
const SAME_ON_PURPOSE = [
  /^[A-Z0-9][\w .&+/#-]*$/, // a name or a technology list item on its own
  /nfsu2/i, /^(react|typescript|three\.js|glsl|next\.js|django|fastapi|postgresql|docker|node\.js|react native)\b/i,
  /^(create without limits|break the pattern|make it different|move\. distort\. explore\.?)/i,
  /^(your name|spendly|bookinghub|logistics platform|hollandia kezd)/i,
  /^[\W\d]+$/,
  /^(HU|EN|NL) ?: /, // the language switch names each language in that language
  /→/, // an architecture diagram's technical labels (service names and protocols)
]
const KEY = /\b(?:[a-z][a-zA-Z0-9]*\.){2,}[a-zA-Z][a-zA-Z0-9]*\b/
const KEY_ALLOW = /\b(?:example\.(?:test|com)|nfsu2\.xyz|next\.js|three\.js|node\.js|vite\.js|d3\.js|www\.[\w.-]+|[\w-]+\.(?:com|hu|nl|dev|io|xyz|test))\b/gi
// `NaN` only counts next to a unit or a currency: a project page may legitimately tell the story of a bug that produced it.
const BROKEN = /\bundefined\b|\[object Object\]|\bNaN ?(?:€|EUR|Ft|HUF|%|kB|ms|px)|[€$] ?NaN|\{[a-zA-Z]+\}|\{\{|%s\b|\$\{/

async function collect(page) {
  return page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && (r.width > 0 || r.height > 0 || el.closest('dialog') === null) }
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim()
    const blocks = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main li, main button, main a, main label, main summary, footer a, footer p, header a, header button')]
      .filter(visible).map((el) => clean(el.innerText || el.textContent)).filter(Boolean)
    const names = [...document.querySelectorAll('[aria-label]')].map((el) => clean(el.getAttribute('aria-label')))
    return {
      lang: document.documentElement.lang,
      title: document.title,
      text: clean(document.body.innerText),
      blocks: [...new Set(blocks)],
      names: [...new Set(names)],
      switch: [...document.querySelectorAll('a[hreflang]')].map((a) => [a.getAttribute('hreflang'), a.getAttribute('href')]),
    }
  })
}

;(async () => {
  const srv = await start({ dir: DIST, port: PORT, fallback: '404', headers: true })
  const browser = await launch()
  const findings = []
  const counts = {}
  const { page } = await newPage(browser, { reduced: true, seen: true })
  for (const pagePath of PAGES) {
    const perLang = {}
    for (const lang of LANGS) {
      const url = `${srv.url}/${lang}${pagePath === '/' ? '/' : `${pagePath}/`}`
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(350)
      // Scroll through once so that lazily revealed text is in the page.
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 30)) } window.scrollTo({ top: 0, behavior: 'instant' }) })
      perLang[lang] = await collect(page)
      counts[lang] = (counts[lang] ?? 0) + perLang[lang].blocks.length
      const here = `${lang}${pagePath}`
      const data = perLang[lang]
      if (data.lang !== lang) findings.push(`${here}: <html lang="${data.lang}">`)
      if (!data.title.trim() || KEY.test(data.title.replace(KEY_ALLOW, ''))) findings.push(`${here}: bad title "${data.title}"`)
      const stripped = data.text.replace(KEY_ALLOW, '')
      const key = KEY.exec(stripped)
      if (key) findings.push(`${here}: looks like a raw key: "${key[0]}"`)
      const broken = BROKEN.exec(data.text)
      if (broken) findings.push(`${here}: unfilled text "${broken[0]}"`)
      for (const name of data.names) if (KEY.test(name.replace(KEY_ALLOW, ''))) findings.push(`${here}: aria-label looks like a key: "${name}"`)
    }
    // Hungarian and Dutch text that is the English text.
    const english = new Set(perLang.en.blocks)
    for (const lang of ['hu', 'nl']) {
      for (const block of perLang[lang].blocks) {
        const words = block.split(' ').length
        if (words < 3 || !english.has(block)) continue
        if (SAME_ON_PURPOSE.some((rule) => rule.test(block))) continue
        findings.push(`${lang}${pagePath}: identical to English: "${block.slice(0, 90)}"`)
      }
    }
    // The language switch leads to the equivalent page.
    for (const lang of LANGS) {
      for (const [target, href] of perLang[lang].switch) {
        const expected = `/${target}${pagePath === '/' ? '' : pagePath}`
        if (href.replace(/\/$/, '') !== expected.replace(/\/$/, '')) findings.push(`${lang}${pagePath}: the ${target} link goes to ${href}, expected ${expected}`)
      }
    }
  }
  await browser.close()
  srv.server.close()
  console.log(`pages: ${PAGES.length} x ${LANGS.length} languages; blocks read per language: ${LANGS.map((l) => `${l} ${counts[l]}`).join(', ')}`)
  if (findings.length) { for (const f of [...new Set(findings)]) console.log('  ✗ ' + f); console.log(`${new Set(findings).size} finding(s)`) } else console.log('no finding')
  process.exit(findings.length ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
