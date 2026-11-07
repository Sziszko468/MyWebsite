// The administration on a notched phone: the bottom bar includes the home-indicator area (its buttons keep their height), the page
// content clears the bar, and in landscape the header and content stay inside the side insets.
// Needs a running backend with the built site and an administrator of a THROW-AWAY database (like audit-admin.cjs).
// usage: node tools/audit/mobile/admin-safe-area.cjs --base=http://127.0.0.1:8801 --email=... --password=...
const { launch, newPage } = require('../lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8788').replace(/\/$/, '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const CASES = [
  { name: 'portrait', w: 390, h: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { name: 'landscape', w: 844, h: 390, insets: { top: 0, bottom: 21, left: 59, right: 59 } },
]

;(async () => {
  const browser = await launch()
  let failed = 0
  const check = (label, ok, detail) => {
    if (!ok) failed++
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`)
  }
  for (const c of CASES) {
    console.log(`${c.name} ${c.w}x${c.h}, insets ${JSON.stringify(c.insets)}`)
    const { context, page } = await newPage(browser, { width: c.w, height: c.h, mobile: true, scheme: 'dark', extra: { bypassCSP: true, locale: 'en-GB' } })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: c.insets })
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type=email]')
    await page.waitForTimeout(1500) // the form is React: fill it after it has mounted
    await page.fill('input[type=email]', EMAIL)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    await page.waitForTimeout(1200)
    const r = await page.evaluate(() => {
      const rect = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, h: b.height } }
      const header = document.querySelector('header')
      const bottom = [...document.querySelectorAll('nav')].find((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().bottom >= innerHeight - 1)
      const items = bottom ? [...bottom.querySelectorAll('a, button')].map(rect) : []
      const content = document.querySelector('main') || document.querySelector('[class*=content]')
      const last = content && content.lastElementChild ? rect(content.lastElementChild) : null
      const links = header ? [...header.querySelectorAll('a, button')].map(rect) : []
      return {
        vw: innerWidth, vh: innerHeight,
        header: header ? rect(header) : null,
        headerLeft: links.length ? Math.min(...links.map((l) => l.left)) : null,
        headerRight: links.length ? Math.max(...links.map((l) => l.right)) : null,
        bottom: bottom ? rect(bottom) : null,
        itemHeights: items.map((i) => Math.round(i.h)),
        itemTops: items.map((i) => Math.round(i.top)),
        contentLastBottom: last ? last.bottom : null,
        scrollH: document.documentElement.scrollHeight,
        sideways: document.documentElement.scrollWidth > innerWidth + 1,
      }
    })
    if (c.insets.bottom > 0 && r.bottom) {
      check('the bottom bar is taller by the home-indicator area', r.bottom.h >= 60 + c.insets.bottom - 1, `${Math.round(r.bottom.h)} px`)
      check('its buttons keep a finger-sized height', r.itemHeights.every((h) => h >= 44), r.itemHeights.join('/') + ' px')
    } else if (c.w < 768) check('the bottom bar exists on a phone', !!r.bottom)
    else check('from 768 px the bottom bar gives way to the sidebar', !r.bottom)
    if (c.insets.left > 0) {
      check('the header content stays inside the side insets', r.headerLeft >= c.insets.left - 1 && r.headerRight <= r.vw - c.insets.right + 1, `${Math.round(r.headerLeft)}..${Math.round(r.headerRight)} of ${r.vw}`)
    }
    check('no sideways scroll', !r.sideways)
    await context.close()
  }
  await browser.close()
  console.log(failed ? `${failed} check(s) failed` : 'all checks passed')
  process.exit(failed ? 1 : 0)
})()
