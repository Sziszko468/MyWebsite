// Emulates a notched phone (CDP safe-area insets) and checks that content stays inside the safe rectangle.
// usage: node safe-area.cjs <port>
const path = require('path')
const REPO = require('path').resolve(__dirname, '../../..')
const { start } = require('../serve.cjs')
const { launch, newPage } = require('../lib.cjs')
const port = Number(process.argv[2] || 4841)

const CASES = [
  { name: 'portrait iPhone-like', w: 390, h: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { name: 'landscape iPhone-like', w: 844, h: 390, insets: { top: 0, bottom: 21, left: 59, right: 59 } },
]
const PAGES = ['/en/', '/en/work', '/en/services/cart', '/en/lab']

;(async () => {
  const server = start({ dir: path.resolve(REPO, 'dist'), port, headers: true, fallback: '404' })
  const browser = await launch()
  for (const c of CASES) {
    for (const seen of [false, true]) {
      const { context, page } = await newPage(browser, { width: c.w, height: c.h, mobile: true, seen, scheme: 'dark', reduced: true })
      const cdp = await context.newCDPSession(page)
      try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: c.insets }) } catch (e) { console.log('setSafeAreaInsetsOverride failed:', e.message); process.exit(2) }
      for (const p of seen ? PAGES : ['/en/']) {
        await page.goto(`http://localhost:${port}${p}`, { waitUntil: 'load' })
        await page.waitForTimeout(seen ? 900 : 2500)
        const r = await page.evaluate(({ insets }) => {
          const vw = innerWidth, vh = innerHeight
          const probe = document.createElement('div')
          probe.style.cssText = 'position:fixed;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden'
          document.body.appendChild(probe)
          const cs = getComputedStyle(probe)
          const env = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' ')
          probe.remove()
          const root = document.documentElement
          const gutter = getComputedStyle(root).getPropertyValue('--gutter')
          const dialog = document.querySelector('dialog[open]')
          const scope = dialog || document
          // interactive text controls must sit inside the safe rectangle (sideways always; vertically only the top/bottom bars we own)
          const bad = []
          for (const e of scope.querySelectorAll('a[href], button, input, [role=button]')) {
            if (e.closest('[aria-hidden=true], [inert]') || e.getClientRects().length === 0) continue
            const b = e.getBoundingClientRect()
            if (b.width === 0 || b.height === 0) continue
            if (b.bottom < 0 || b.top > vh) continue // scrolled out
            if (b.left < insets.left - 1 || b.right > vw - insets.right + 1) bad.push(`${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}" x ${Math.round(b.left)}..${Math.round(b.right)}`)
          }
          const header = document.querySelector('header')
          const hb = header && header.getBoundingClientRect()
          return { env, gutter: gutter.trim().slice(0, 60), dialog: !!dialog, sideways: root.scrollWidth > vw + 1, outsideSafe: bad.slice(0, 4), headerTop: hb ? [Math.round(hb.top), Math.round(hb.height), getComputedStyle(header).paddingTop] : null }
        }, { insets: c.insets })
        console.log(c.name.padEnd(22), (seen ? p : 'intro').padEnd(18), JSON.stringify(r))
        if (!seen) await page.screenshot({ path: path.join(process.argv[3] || '.', `safe-intro-${c.w}x${c.h}.png`) })
      }
      await context.close()
    }
  }
  await browser.close()
  server.close && server.close()
  process.exit(0)
})()
