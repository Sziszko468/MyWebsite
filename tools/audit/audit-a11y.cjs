// axe-core (WCAG 2.0/2.1/2.2 A+AA and best practice) + structural checks, every page x language x theme.
// usage: node audit-a11y.cjs [dist dir] [--langs=hu,en,nl] [--themes=dark,light] [--only=/contact,/about]
const { start } = require('./serve.cjs')
const { launch, newPage, axeRun, LANGS, PAGES } = require('./lib.cjs')
const path = require('path')
const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')))
const DIST = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'dist'))
const langs = (args.langs || LANGS.join(',')).split(',')
const themes = (args.themes || 'dark,light').split(',')
const only = args.only ? args.only.split(',') : null

const STRUCTURE = () => {
  const out = []
  const visible = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'
  const h1 = [...document.querySelectorAll('h1')].filter(visible)
  if (h1.length !== 1) out.push(`${h1.length} visible h1`)
  if (!document.title || document.title.length < 5) out.push('no title')
  if (!document.documentElement.lang) out.push('no html lang')
  const mains = document.querySelectorAll('main, [role=main]')
  if (mains.length !== 1) out.push(`${mains.length} main landmarks`)
  // heading order inside the page (skip the intro dialog and closed dialogs)
  let prev = 0
  for (const h of [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((e) => visible(e) && !e.closest('dialog:not([open])'))) {
    const level = Number(h.tagName[1])
    if (prev && level > prev + 1) out.push(`heading jumps h${prev} -> h${level}: "${h.textContent.trim().slice(0, 40)}"`)
    prev = level
  }
  // images
  for (const img of document.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) out.push(`img without alt: ${img.src.split('/').pop()}`)
    else if (img.alt === '' && !img.closest('[aria-hidden=true]') && img.getAttribute('role') !== 'presentation' && !/thumbnail|decor/i.test(img.className)) out.push(`img with empty alt (decorative?): ${img.src.split('/').pop().slice(0, 30)}`)
    if (!img.getAttribute('width') || !img.getAttribute('height')) out.push(`img without width/height: ${img.src.split('/').pop()}`)
  }
  // links and buttons need a name; generic names; same name -> different targets
  const names = new Map()
  for (const a of document.querySelectorAll('a[href], button')) {
    if (!visible(a)) continue
    const name = (a.getAttribute('aria-label') || a.textContent || a.getAttribute('title') || '').replace(/\s+/g, ' ').trim()
    if (!name) out.push(`${a.tagName.toLowerCase()} without a name: ${a.outerHTML.slice(0, 80)}`)
    if (a.tagName === 'A' && /^(click here|here|read more|more|tovább|itt|klik hier|lees meer)$/i.test(name)) out.push(`generic link text "${name}"`)
    if (a.tagName === 'A' && name) {
      const key = name.toLowerCase()
      const href = a.getAttribute('href')
      if (names.has(key) && names.get(key) !== href) out.push(`link text "${name.slice(0, 30)}" leads to different places: ${names.get(key)} / ${href}`)
      names.set(key, href)
    }
  }
  for (const a of document.querySelectorAll('a[target=_blank]')) if (!/noopener/.test(a.rel) ) out.push(`external link without noopener: ${a.href}`)
  // form controls need labels
  for (const c of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (!visible(c) && c.type !== 'radio' && c.type !== 'checkbox') continue
    const labelled = c.labels?.length || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby')
    if (!labelled) out.push(`unlabelled ${c.tagName.toLowerCase()}[${c.type}] name=${c.name}`)
  }
  // duplicate ids
  const seen = new Set()
  for (const e of document.querySelectorAll('[id]')) { if (seen.has(e.id)) out.push(`duplicate id ${e.id}`); seen.add(e.id) }
  return out
}

;(async () => {
  const srv = await start({ dir: DIST, port: 4220, fallback: '404', headers: true })
  const browser = await launch()
  const byRule = new Map()
  const structure = []
  let n = 0
  for (const theme of themes) {
    const { context, page } = await newPage(browser, { reduced: true, scheme: theme, seen: true })
    await context.addInitScript(`try { localStorage.setItem('theme', '${theme}') } catch (e) {}`)
    for (const lang of langs) {
      for (const p of PAGES) {
        if (only && !only.includes(p)) continue
        const url = `/${lang}${p === '/' ? '/' : p + '/'}`
        await page.goto(srv.url + url, { waitUntil: 'load' })
        await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {})
        // scroll through so lazy and in-view content exists
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) } window.scrollTo(0, 0) })
        await page.waitForTimeout(500)
        const v = await axeRun(page)
        const label = `${theme}:${lang}${p}`
        for (const x of v) {
          const entry = byRule.get(x.id) || { impact: x.impact, help: x.help, where: [] }
          entry.where.push({ label, count: x.count, sample: x.nodes[0] })
          byRule.set(x.id, entry)
        }
        if (theme === themes[0]) for (const s of await page.evaluate(STRUCTURE)) structure.push(`${lang}${p}: ${s}`)
        n++
      }
    }
    await context.close()
  }
  console.log(`audited ${n} page views (axe ${themes.join('+')} / ${langs.join(',')})`)
  if (byRule.size === 0) console.log('axe: 0 violations')
  for (const [id, e] of byRule) {
    console.log(`\naxe ${id} [${e.impact}] ${e.help}: ${e.where.length} page views`)
    for (const w of e.where.slice(0, 4)) console.log(`   ${w.label} x${w.count}  ${w.sample.target}  ${w.sample.html.slice(0, 90)} | ${w.sample.summary}`)
  }
  // structure: aggregate identical messages
  const agg = new Map()
  for (const s of structure) { const [pg, ...m] = s.split(': '); const k = m.join(': '); agg.set(k, [...(agg.get(k) || []), pg]) }
  console.log(`\nstructure findings: ${agg.size} distinct`)
  for (const [k, pages] of agg) console.log(` - ${k}  (${pages.length}x, e.g. ${pages.slice(0, 3).join(', ')})`)
  await browser.close(); await srv.close()
})().catch((e) => { console.error(e); process.exit(2) })
