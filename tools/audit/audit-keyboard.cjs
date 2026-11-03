// Keyboard-only walk of each page: Tab through everything, check that
//  - the first Tab stops on the skip link, and it moves focus into main
//  - every visible interactive element is reached (no unreachable controls) and none is a trap
//  - each focus stop is visible, not covered by the sticky header / a sticky bar (WCAG 2.4.11), has a focus indicator,
//    has an accessible name, and is at least 24x24 CSS px (WCAG 2.5.8) unless it is an inline text link
// usage: node audit-keyboard.cjs [dist] [--lang=en] [--w=1440] [--h=900] [--mobile=1]
const { start } = require('./serve.cjs')
const { launch, newPage } = require('./lib.cjs')
const path = require('path')
const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')))
const DIST = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'dist'))
const lang = args.lang || 'en'
const W = Number(args.w || 1440), H = Number(args.h || 900), mobile = args.mobile === '1'
const PAGESET = ['/', '/services/', '/services/website/', '/services/configure/', '/services/cart/', '/work/spendly/', '/about/', '/contact/', '/lab/', '/lab/liquid-matter/', '/privacy/']

const INFO = () => {
  const e = document.activeElement
  if (!e || e === document.body) return null
  const r = e.getBoundingClientRect()
  const cs = getComputedStyle(e)
  const name = (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby').split(' ')[0])?.textContent || e.labels?.[0]?.textContent || e.textContent || e.getAttribute('title') || e.getAttribute('alt') || '').replace(/\s+/g, ' ').trim()
  // obscured? sample 5 points of the focused element; it counts as covered if no sampled point hits it or a descendant
  const pts = [[.5, .5], [.2, .5], [.8, .5], [.5, .2], [.5, .8]].map(([x, y]) => [r.left + r.width * x, r.top + r.height * y])
  const hit = pts.some(([x, y]) => { if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const t = document.elementFromPoint(x, y); return t && (e.contains(t) || t.contains(e)) })
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
  const shadow = cs.boxShadow !== 'none'
  const inline = e.tagName === 'A' && cs.display.startsWith('inline') && e.closest('p, li, dd, span') !== null
  return { tag: e.tagName.toLowerCase(), type: e.type || '', name: name.slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), onScreen: r.bottom > 0 && r.top < innerHeight && r.width > 0, visibleHit: hit, focusIndicator: outline || shadow, inline, id: e.id, cls: String(e.className).slice(0, 30), key: (e.id || '') + '|' + e.tagName + '|' + Math.round(r.left) + '|' + Math.round(r.top + scrollY) }
}
const INTERACTIVE = () => [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary')].filter((e) => {
  if (e.getClientRects().length === 0 || getComputedStyle(e).visibility === 'hidden') return false
  if (e.closest('[inert], dialog:not([open]), [aria-hidden=true]')) return false
  const label = e.closest('label'); if (e.type === 'radio' || e.type === 'checkbox') return true
  return true
}).map((e) => (e.id || '') + '|' + e.tagName + '|' + Math.round(e.getBoundingClientRect().left) + '|' + Math.round(e.getBoundingClientRect().top + scrollY))

;(async () => {
  const srv = await start({ dir: DIST, port: 4221, fallback: '404', headers: true })
  const browser = await launch()
  const problems = []
  for (const p of PAGESET) {
    const { context, page } = await newPage(browser, { width: W, height: H, mobile, reduced: true, seen: true })
    const url = `/${lang}${p}`
    await page.goto(srv.url + url, { waitUntil: 'load' })
    await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(700)
    await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0) })
    const reached = new Map()
    let skipOk = null
    let cycles = 0
    for (let i = 0; i < 260; i++) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(25)
      const info = await page.evaluate(INFO)
      if (!info) { if (i > 3) cycles++; if (cycles > 1) break; continue }
      if (i === 0) {
        skipOk = /skip|ugr|ga naar|naar de inhoud/i.test(info.name)
        if (!skipOk) problems.push(`${url}: the first Tab stop is "${info.name}", not the skip link`)
        else { await page.keyboard.press('Enter'); await page.waitForTimeout(150); const inMain = await page.evaluate(() => { const m = document.querySelector('main'); const a = document.activeElement; return !!m && (m === a || m.contains(a) || location.hash === '#main') }); if (!inMain) problems.push(`${url}: the skip link did not move focus/scroll into main`); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab') }
      }
      if (reached.has(info.key)) { cycles++; if (cycles > 1) break; continue }
      reached.set(info.key, info)
      const where = `${url} [${info.tag} "${info.name}"]`
      if (!info.name) problems.push(`${where}: focused element has no accessible name`)
      if (!info.onScreen) problems.push(`${where}: focus is off screen`)
      else if (!info.visibleHit) problems.push(`${where}: focused element is covered by something else (2.4.11)`)
      if (!info.focusIndicator) problems.push(`${where}: no visible focus indicator`)
      if (!info.inline && (info.w < 24 || info.h < 24) && info.tag !== 'input') problems.push(`${where}: target ${info.w}x${info.h}px < 24 (2.5.8)`)
    }
    const all = await page.evaluate(INTERACTIVE)
    const missed = all.filter((k) => !reached.has(k))
    // elements reachable only inside a closed disclosure are fine; report the rest
    if (missed.length) problems.push(`${url}: ${missed.length} interactive element(s) never got focus: ${missed.slice(0, 4).join(', ')}`)
    console.log(`${url.padEnd(34)} ${reached.size} stops, ${all.length} interactive`)
    await context.close()
  }
  console.log(problems.length ? `\n${problems.length} PROBLEM(S) at ${W}x${H}${mobile ? ' mobile' : ''}:\n - ` + problems.slice(0, 60).join('\n - ') : `\nkeyboard: no problems at ${W}x${H}${mobile ? ' mobile' : ''}`)
  await browser.close(); await srv.close()
})().catch((e) => { console.error(e); process.exit(2) })
