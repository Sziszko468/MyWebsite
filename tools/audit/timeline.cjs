// Where does the time to first paint go? Resource timings + long tasks + paint, phone emulation.
const { start } = require('./serve.cjs')
const { launch, newPage } = require('./lib.cjs')
const path = require('path')
const [dir, url = '/hu/work', rate = '4'] = process.argv.slice(2)
;(async () => {
  const srv = await start({ dir: path.resolve(dir), port: 4198, fallback: 'spa' })
  const browser = await launch()
  const { context, page } = await newPage(browser, { width: 390, height: 844, mobile: true, seen: true })
  await context.addInitScript(`window.__lt=[];new PerformanceObserver((l)=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:'longtask',buffered:true})`)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(rate) })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: 90000 })
  await page.goto(srv.url + url, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(5000)
  const r = await page.evaluate(() => ({
    nav: (({ responseStart, domContentLoadedEventEnd, loadEventEnd }) => ({ ttfb: Math.round(responseStart), dcl: Math.round(domContentLoadedEventEnd), load: Math.round(loadEventEnd) }))(performance.getEntriesByType('navigation')[0]),
    paint: performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]),
    res: performance.getEntriesByType('resource').map((e) => [e.name.split('/').pop().slice(0, 34), Math.round(e.startTime), Math.round(e.responseEnd), Math.round(e.transferSize / 1024)]),
    lt: window.__lt,
  }))
  console.log(JSON.stringify(r.nav), JSON.stringify(r.paint))
  for (const x of r.res.slice(0, 14)) console.log(`  ${x[0].padEnd(36)} start ${String(x[1]).padStart(5)}  end ${String(x[2]).padStart(5)}  ${x[3]} kB`)
  console.log('  long tasks [start,dur]:', JSON.stringify(r.lt))
  await browser.close(); await srv.close()
})()
