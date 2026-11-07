// How wide are the project page's pictures really drawn? (to write truthful `sizes`) usage: node imgwidths.cjs <port>
const path = require('path')
const REPO = require('path').resolve(__dirname, '../../..')
const { start } = require('../serve.cjs')
const { launch, newPage } = require('../lib.cjs')
const port = Number(process.argv[2] || 4881)
const WIDTHS = [320, 360, 390, 430, 600, 768, 900, 1024, 1180, 1280, 1366, 1440, 1920]
;(async () => {
  const server = start({ dir: path.resolve(REPO, 'dist'), port, headers: true, fallback: '404' })
  const browser = await launch()
  for (const slug of ['spendly', 'bookinghub']) {
    console.log('==', slug)
    for (const w of WIDTHS) {
      const { context, page } = await newPage(browser, { width: w, height: 900, mobile: w < 820, reduced: true })
      await page.goto(`http://localhost:${port}/en/work/${slug}`, { waitUntil: 'load' })
      await page.waitForTimeout(900)
      const r = await page.evaluate(() => {
        const vw = innerWidth
        const out = { hero: null, desktop: [], mobile: [] }
        const hero = document.querySelector('figure [class*=shot] img, figure img')
        if (hero) out.hero = hero.clientWidth
        for (const group of document.querySelectorAll('[class*=group]')) {
          const kind = /mobile/i.test(group.querySelector('ul')?.className || '') ? 'mobile' : 'desktop'
          for (const img of group.querySelectorAll('img')) out[kind].push(img.clientWidth)
        }
        const mm = (a) => (a.length ? [Math.min(...a), Math.max(...a)] : null)
        return { vw, hero: out.hero, desktop: mm(out.desktop), mobile: mm(out.mobile) }
      })
      const pct = (n) => (n ? `${n}px (${Math.round((n / r.vw) * 100)}vw)` : '-')
      console.log(String(w).padStart(5), 'hero', pct(r.hero), '| desktop thumbs', r.desktop ? r.desktop.map(pct).join(' .. ') : '-', '| mobile thumbs', r.mobile ? r.mobile.map(pct).join(' .. ') : '-')
      await context.close()
    }
  }
  await browser.close()
  server.close && server.close()
  process.exit(0)
})()
