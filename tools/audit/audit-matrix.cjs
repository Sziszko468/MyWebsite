// Layout matrix: every page at the required viewports (portrait and landscape), languages and themes.
// usage: node audit-matrix.cjs <dist> <port> --sizes=1920x1080,1440x900 [--langs=en] [--themes=dark] [--only=...]
const { start } = require('./serve.cjs')
const { launch, newPage, PAGES, layoutCheck } = require('./lib.cjs')
const path = require('path')
const DIST = path.resolve(process.argv[2])
const PORT = Number(process.argv[3])
const args = Object.fromEntries(process.argv.slice(4).map((a) => a.replace(/^--/, '').split('=')))
const sizes = args.sizes.split(',').map((s) => s.split('x').map(Number))
const langs = (args.langs || 'en').split(',')
const themes = (args.themes || 'dark').split(',')
const only = args.only ? args.only.split(',') : null
const mobileMax = 820

// The layout check is shared with audit-ai.cjs (lib.cjs).
const CHECK = layoutCheck

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
