// Layout matrix: every page at the required viewports (portrait and landscape), languages and themes.
// usage: node audit-matrix.cjs <dist> <port> --sizes=1920x1080,1440x900 [--langs=en] [--themes=dark] [--only=...]
const { start } = require('./serve.cjs')
const { launch, newPage, PAGES } = require('./lib.cjs')
const path = require('path')
const DIST = path.resolve(process.argv[2])
const PORT = Number(process.argv[3])
const args = Object.fromEntries(process.argv.slice(4).map((a) => a.replace(/^--/, '').split('=')))
const sizes = args.sizes.split(',').map((s) => s.split('x').map(Number))
const langs = (args.langs || 'en').split(',')
const themes = (args.themes || 'dark').split(',')
const only = args.only ? args.only.split(',') : null
const mobileMax = 820

const CHECK = () => {
  const vw = innerWidth
  const out = []
  const root = document.documentElement
  if (root.scrollWidth > vw + 1) out.push(`page scrolls sideways: scrollWidth ${root.scrollWidth} > ${vw}`)
  // anything poking out of the viewport that is not clipped by a scroll container or hidden
  const clipped = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p); if (/(hidden|auto|scroll|clip)/.test(o.overflowX) && p.getBoundingClientRect().width <= vw + 1) return true } return false }
  const poking = []
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('[aria-hidden=true], dialog:not([open]), svg, canvas, [hidden]')) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' && cs.opacity === '0') continue
    const r = e.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if ((r.right > vw + 1 || r.left < -1) && !clipped(e) && (e.textContent || e.tagName === 'IMG' || e.tagName === 'BUTTON' || e.tagName === 'A')) poking.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 24)} [${Math.round(r.left)}..${Math.round(r.right)}] "${(e.textContent || '').trim().slice(0, 20)}"`)
  }
  if (poking.length) out.push(`${poking.length} element(s) outside the viewport: ${poking.slice(0, 3).join(' | ')}`)
  // text that is too small to read
  const small = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n; (n = walker.nextNode()); ) {
    if (!n.textContent.trim()) continue
    const e = n.parentElement
    if (!e || e.closest('[aria-hidden=true], script, style, noscript, dialog:not([open]), svg, canvas')) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (parseFloat(cs.fontSize) < 11.5) small.add(`${e.tagName.toLowerCase()} ${cs.fontSize} "${n.textContent.trim().slice(0, 24)}"`)
  }
  if (small.size) out.push(`text under 11.5px: ${[...small].slice(0, 3).join(' | ')}`)
  // targets
  const tiny = []
  for (const e of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea')) {
    if (e.closest('[aria-hidden=true], dialog:not([open]), [inert]') || e.getClientRects().length === 0) continue
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
    const inline = e.tagName === 'A' && cs.display.startsWith('inline') && e.closest('p, li, dd')
    if (!inline && (r.width < 24 || r.height < 24) && !(e.type === 'radio' || e.type === 'checkbox')) tiny.push(`${e.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}"`)
  }
  if (tiny.length) out.push(`${tiny.length} target(s) under 24px: ${tiny.slice(0, 3).join(' | ')}`)
  // header (not on immersive Lab pages): brand + (menu button or nav) + controls visible
  const header = document.querySelector('header')
  if (header && header.getClientRects().length) {
    const vis = [...header.querySelectorAll('a, button')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().right <= vw + 1 && e.getBoundingClientRect().left >= -1)
    if (vis.length < 2) out.push(`header shows only ${vis.length} control(s)`)
  }
  // images drawn larger than they are
  for (const img of document.querySelectorAll('img')) if (img.complete && img.naturalWidth && img.clientWidth > img.naturalWidth * 1.05 + 1) out.push(`image upscaled: ${img.src.split('/').pop()} ${img.naturalWidth}px drawn at ${img.clientWidth}px`)
  // footer reachable
  const footer = document.querySelector('footer')
  if (header && !footer) out.push('no footer')
  return out
}

;(async () => {
  const srv = await start({ dir: DIST, port: PORT, fallback: '404', headers: true })
  const browser = await launch()
  let loads = 0
  const results = []
  for (const [w, h] of sizes) {
    for (const theme of themes) {
      const { context, page } = await newPage(browser, { width: w, height: h, mobile: w <= mobileMax || h <= 500, reduced: true, scheme: theme, seen: true })
      await context.addInitScript(`try { localStorage.setItem('theme', '${theme}') } catch (e) {}`)
      const errs = []
      page.on('console', (m) => { if (m.type() === 'error' && !/KHR_parallel|X4122|glGetProgramiv|WebGL|GPU stall/i.test(m.text())) errs.push(m.text().slice(0, 120)) })
      page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 120)))
      for (const lang of langs) {
        for (const p of PAGES) {
          if (only && !only.includes(p)) continue
          if (p === '/services/cart' || p === '/services/configure') { /* included */ }
          const url = `/${lang}${p === '/' ? '/' : p + '/'}`
          errs.length = 0
          await page.goto(srv.url + url, { waitUntil: 'load' })
          await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {})
          await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)) } })
          await page.waitForTimeout(250)
          const issues = await page.evaluate(CHECK)
          await page.evaluate(() => window.scrollTo(0, 0))
          const footerOk = await page.evaluate(() => { const f = document.querySelector('footer'); return !f || (f.getBoundingClientRect().height > 0) })
          if (!footerOk) issues.push('footer has no height')
          if (errs.length) issues.push('console: ' + errs.slice(0, 2).join(' | '))
          loads++
          if (issues.length) results.push({ label: `${w}x${h} ${theme} ${lang}${p}`, issues })
        }
      }
      await context.close()
    }
  }
  console.log(`matrix: ${loads} page loads at ${sizes.map((s) => s.join('x')).join(', ')} (${themes.join('+')}, ${langs.join('+')})`)
  if (!results.length) console.log('matrix: no findings')
  for (const r of results) console.log(`- ${r.label}: ${r.issues.join('  ||  ')}`)
  await browser.close(); await srv.close()
})().catch((e) => { console.error(e); process.exit(2) })
