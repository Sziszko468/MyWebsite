// End-to-end check of the quality governor in a real browser: slow the CPU so the watchdog lowers the resolution, then release
// it and watch the canvas resolution come back step by step. The canvas's pixel width is the observable.
// usage: node restore.cjs <port> [experience] [throttle]
const path = require('path')
const REPO = require('path').resolve(__dirname, '../../..')
const { start } = require('../serve.cjs')
const { launch, newPage } = require('../lib.cjs')
const port = Number(process.argv[2] || 4861)
const id = process.argv[3] || 'particle-universe'
const rate = Number(process.argv[4] || 20)

;(async () => {
  const server = start({ dir: path.resolve(REPO, 'dist'), port, headers: true, fallback: '404' })
  const browser = await launch()
  const { context, page } = await newPage(browser, { width: 390, height: 844, mobile: true, seen: true, scheme: 'dark' })
  const cdp = await context.newCDPSession(page)
  await page.goto(`http://localhost:${port}/en/lab/${id}`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!document.querySelector('[data-lab-tier] canvas'), null, { timeout: 20000 })
  const read = () => page.evaluate(() => { const s = document.querySelector('[data-lab-tier]'); const c = s && s.querySelector('canvas'); return c ? { w: c.width, tier: s.dataset.labTier } : null })
  const t0 = Date.now()
  const log = []
  const sample = async (label) => { const r = await read(); log.push([Math.round((Date.now() - t0) / 1000), label, r && r.w, r && r.tier]); }
  await page.waitForTimeout(4000)
  await sample('start')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(2500); await sample(`throttled x${rate}`) }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(3000); await sample('released') }
  for (const row of log) console.log(row.join('\t'))
  await browser.close()
  server.close && server.close()
  process.exit(0)
})()
