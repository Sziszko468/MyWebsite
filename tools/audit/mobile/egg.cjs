// The hidden NFSU2 screen on phones: opened by a tap on the Lab headline's red full stop. usage: node egg.cjs <port> <outdir>
const path = require('path')
const REPO = require('path').resolve(__dirname, '../../..')
const { start } = require('../serve.cjs')
const { launch, newPage } = require('../lib.cjs')
const port = Number(process.argv[2] || 4851)
const out = process.argv[3] || '.'
const SIZES = [[320, 568], [390, 844], [844, 390], [568, 320]]

;(async () => {
  const server = start({ dir: path.resolve(REPO, 'dist'), port, headers: true, fallback: '404' })
  const browser = await launch()
  for (const [w, h] of SIZES) {
    const { context, page } = await newPage(browser, { width: w, height: h, mobile: true, seen: true, scheme: 'dark' })
    await page.goto(`http://localhost:${port}/en/lab`, { waitUntil: 'load' })
    await page.waitForTimeout(1800)
    const box = await page.locator('[data-egg-dot]').boundingBox()
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForSelector('[data-egg]', { timeout: 5000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(out, `egg-wipe-${w}x${h}.png`) })
    await page.waitForSelector('[data-egg][data-phase=ready] a[href^="https://nfsu2.xyz"]', { timeout: 8000 })
    await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const layer = document.querySelector('[data-egg]')
      const link = layer.querySelector('a'), back = layer.querySelector('button')
      const rect = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)] }
      return { open: rect(link), back: rect(back), sideways: document.documentElement.scrollWidth > innerWidth + 1, layerScrolls: layer.scrollHeight > layer.clientHeight + 1, rel: link.rel, target: link.target, focus: document.activeElement === link }
    })
    console.log(`${w}x${h}`, JSON.stringify(r))
    await page.screenshot({ path: path.join(out, `egg-ready-${w}x${h}.png`) })
    // exit control works by touch
    const back = await page.locator('[data-egg] button').boundingBox()
    await page.touchscreen.tap(back.x + back.width / 2, back.y + back.height / 2)
    await page.waitForTimeout(400)
    console.log('   after tapping Back: layer present =', await page.locator('[data-egg]').count())
    await context.close()
  }
  await browser.close()
  server.close && server.close()
  process.exit(0)
})()
