// Does a finger drag over each Lab experience reach the stage as pointer moves (no pointercancel)? usage: node lab-touch.cjs <port> [WxH]
const path = require('path')
const REPO = require('path').resolve(__dirname, '../../..')
const { start } = require('../serve.cjs')
const { launch, newPage } = require('../lib.cjs')
const port = Number(process.argv[2] || 4831)
const [w, h] = (process.argv[3] || '390x844').split('x').map(Number)
const IDS = ['particle-universe', 'liquid-matter', 'type-in-motion', 'infinite-space', 'chromatic-distortion']

;(async () => {
  const server = start({ dir: path.resolve(REPO, 'dist'), port, headers: true, fallback: '404' })
  const browser = await launch()
  for (const id of IDS) {
    const { context, page } = await newPage(browser, { width: w, height: h, mobile: true, seen: true, scheme: 'dark' })
    await page.addInitScript(() => {
      window.__ev = { pointermove: 0, pointercancel: 0, pointerdown: 0, pointerup: 0 }
      for (const n of ['pointermove', 'pointercancel', 'pointerdown', 'pointerup']) window.addEventListener(n, () => window.__ev[n]++, { capture: true, passive: true })
    })
    await page.goto(`http://localhost:${port}/en/lab/${id}`, { waitUntil: 'load' })
    // wait for the live canvas
    await page.waitForFunction(() => !!document.querySelector('[data-lab-tier] canvas'), null, { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(3500)
    const info = await page.evaluate(() => {
      const s = document.querySelector('[data-lab-tier]')
      if (!s) return { stage: false }
      const r = s.getBoundingClientRect()
      return { stage: true, tier: s.dataset.labTier, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], ta: getComputedStyle(s).touchAction, canvasTa: getComputedStyle(s.querySelector('canvas') || s).touchAction }
    })
    if (!info.stage) { console.log(id.padEnd(20), 'no live stage (still view?)'); await context.close(); continue }
    const cdp = await context.newCDPSession(page)
    const [x, y, sw, sh] = info.rect
    const cx = x + sw / 2, cy = y + sh * 0.6
    await page.evaluate(() => { window.__ev = { pointermove: 0, pointercancel: 0, pointerdown: 0, pointerup: 0 } })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 80, y: cy }] })
    for (let i = 1; i <= 14; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 80 + i * 12, y: cy - i * 14 }] })
      await page.waitForTimeout(30)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const ev = await page.evaluate(() => window.__ev)
    const touched = await page.evaluate(() => document.querySelector('[data-lab-tier]').dataset.touched)
    console.log(id.padEnd(20), 'tier', info.tier, 'touch-action', info.ta, '| events', JSON.stringify(ev), '| touched', touched, '| scrollY', await page.evaluate(() => scrollY))
    await context.close()
  }
  await browser.close()
  server.close && server.close()
  process.exit(0)
})()
