// Interaction latency (the measure behind INP): real clicks and key presses on each page under phone emulation,
// read from the Event Timing API (interactionId > 0). INP is the worst (p98) interaction; with few interactions it is the max.
// usage: node inp.cjs <dist> [--profile=phone|desktop]
const { start } = require('./serve.cjs')
const { launch, newPage } = require('./lib.cjs')
const path = require('path')
const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')))
const DIST = path.resolve(process.argv[2])
const phone = (args.profile || 'phone') === 'phone'
const PAGESET = ['/en/', '/en/services/', '/en/services/website/', '/en/services/configure/', '/en/services/cart/', '/en/work/spendly/', '/en/about/', '/en/contact/', '/en/lab/', '/en/privacy/']
const INIT = `window.__ev=[];new PerformanceObserver((l)=>{for(const e of l.getEntries())if(e.interactionId>0)window.__ev.push([e.name,Math.round(e.duration),Math.round(e.processingStart-e.startTime),Math.round(e.processingEnd-e.processingStart),Math.round(e.startTime+e.duration-e.processingEnd)])}).observe({type:'event',durationThreshold:16,buffered:true})`

;(async () => {
  const srv = await start({ dir: DIST, port: 4222, fallback: '404', headers: true })
  const browser = await launch()
  const all = []
  for (const url of PAGESET) {
    const { context, page } = await newPage(browser, { width: phone ? 390 : 1440, height: phone ? 844 : 900, mobile: phone, seen: true })
    await context.addInitScript(INIT)
    const cdp = await context.newCDPSession(page)
    if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(srv.url + url, { waitUntil: 'load' })
    await page.waitForSelector('h1', { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2500)
    let clicks = 0
    for (let round = 0; round < 14 && clicks < 14; round++) {
      // the next visible, enabled control that has not been pressed yet
      const handle = await page.evaluateHandle(() => {
        const els = [...document.querySelectorAll('main button:not([disabled]), header button:not([disabled]), footer button:not([disabled]), main input[type=radio], main input[type=checkbox], main summary, main [role=tab], main [role=radio]')]
        return els.filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert], dialog:not([open])') && !e.dataset.clicked)[0] || null
      })
      const el = handle.asElement()
      if (!el) break
      await el.evaluate((e) => { e.dataset.clicked = '1'; e.scrollIntoView({ block: 'center' }) })
      await page.waitForTimeout(120)
      const box = await el.boundingBox()
      if (!box) continue
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      clicks++
      await page.waitForTimeout(350)
      // leave an opened menu or dialog
      if (await page.evaluate(() => !!document.querySelector('dialog[open]:not([data-phase])'))) { await page.keyboard.press('Escape'); await page.waitForTimeout(250) }
      if (new URL(page.url()).pathname !== url) { await page.goBack().catch(() => {}); await page.waitForTimeout(600) }
    }
    for (const key of ['Tab', 'Tab', 'Tab', 'ArrowDown', 'Tab']) { await page.keyboard.press(key); await page.waitForTimeout(150) }
    await page.waitForTimeout(500)
    const ev = await page.evaluate(() => window.__ev)
    const worst = ev.reduce((m, e) => (e[1] > m[1] ? e : m), ['-', 0, 0, 0, 0])
    all.push(worst[1])
    console.log(`${url.padEnd(28)} ${String(clicks).padStart(2)} clicks, ${ev.length} interactions >=16ms; worst ${worst[1]} ms (${worst[0]}: input delay ${worst[2]}, processing ${worst[3]}, presentation ${worst[4]})`)
    await context.close()
  }
  console.log(`worst interaction overall: ${Math.max(...all)} ms (${phone ? '4x CPU slowdown, 390x844 touch emulation' : 'desktop, no throttling'}); good <= 200 ms`)
  await browser.close(); await srv.close()
})().catch((e) => { console.error(e); process.exit(2) })
