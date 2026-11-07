// Does a finger dragging over the fullscreen intro move the field? usage: node intro-touch.cjs <port> [WxH]
const path = require('path')
const REPO = require('path').resolve(__dirname, '../../..')
const { start } = require('../serve.cjs')
const { launch, newPage } = require('../lib.cjs')
const port = Number(process.argv[2] || 4821)
const [w, h] = (process.argv[3] || '390x844').split('x').map(Number)

;(async () => {
  const server = start({ dir: path.resolve(REPO, 'dist'), port, headers: true, fallback: '404' })
  const browser = await launch()
  const { context, page } = await newPage(browser, { width: w, height: h, mobile: true, seen: false, scheme: 'dark' })
  const events = { pointermove: 0, pointercancel: 0, pointerdown: 0 }
  await page.addInitScript(() => {
    window.__ev = { pointermove: 0, pointercancel: 0, pointerdown: 0, touchmove: 0 }
    for (const n of ['pointermove', 'pointercancel', 'pointerdown', 'touchmove']) window.addEventListener(n, () => window.__ev[n]++, { capture: true, passive: true })
  })
  await page.goto(`http://localhost:${port}/en/`, { waitUntil: 'load' })
  await page.waitForSelector('dialog[open]', { timeout: 15000 })
  await page.waitForTimeout(4000)
  const info = await page.evaluate(() => {
    const d = document.querySelector('dialog[open]')
    const c = d.querySelector('[class*=content]')
    return { mode: d.dataset.introMode, tier: d.dataset.introTier, ready: d.dataset.introReady, contentTouchAction: getComputedStyle(c).touchAction, dialogTouchAction: getComputedStyle(d).touchAction, scrollH: c.scrollHeight, clientH: c.clientHeight, htmlOverflow: getComputedStyle(document.documentElement).overflow }
  })
  console.log('intro', JSON.stringify(info))
  const cdp = await context.newCDPSession(page)
  const read = () => page.evaluate(() => { const d = document.querySelector('dialog[open]'); return [d.style.getPropertyValue('--hero-cx'), d.style.getPropertyValue('--hero-cy'), d.style.getPropertyValue('--hero-energy')].join(' ') })
  const y0 = Math.round(h * 0.55)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: y0 }] })
  const samples = []
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60 + i * ((w - 120) / 12), y: y0 - i * 20 }] })
    await page.waitForTimeout(40)
    samples.push(await read())
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const ev = await page.evaluate(() => window.__ev)
  console.log('field vars during drag (cx cy energy):', samples.filter((_, i) => i % 3 === 2).join(' | '))
  console.log('events', JSON.stringify(ev))
  // a tap: does a wave start (cursor.ripple has no DOM trace; use the energy variable + the overlay) -> just report that no scroll happened
  const scrollY = await page.evaluate(() => scrollY)
  console.log('scrollY after drag', scrollY)
  await browser.close()
  server.close && server.close()
  process.exit(0)
})()
