// Web-vitals style measurement under emulation.
// usage: node vitals.cjs <baseUrl> <out.json> [--runs=3] [--profile=phone|phone-fast|phone-slow|desktop] [--intro=0|1] [--pages=/hu/,/hu/services]
const { launch, newPage, fs } = require('./lib.cjs')

const args = Object.fromEntries(process.argv.slice(4).map((a) => a.replace(/^--/, '').split('=')))
const base = process.argv[2]
const out = process.argv[3]
const runs = Number(args.runs || 3)
const profile = args.profile || 'phone'
const intro = args.intro === '1'
const pages = (args.pages || '/hu/,/hu/work,/hu/services,/hu/services/website,/hu/about,/hu/contact,/hu/lab,/hu/lab/particle-universe,/hu/work/spendly').split(',')

const INIT = `
window.__v = { lcp: 0, lcpEl: '', cls: 0, longTasks: [], fcp: 0, events: [] }
new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__v.lcp = e.startTime; window.__v.lcpEl = (e.element && (e.element.tagName + (e.element.className && typeof e.element.className === 'string' ? '.' + e.element.className.split(' ')[0] : ''))) + ' ' + (e.url || '') } }).observe({ type: 'largest-contentful-paint', buffered: true })
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value }).observe({ type: 'layout-shift', buffered: true })
new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.longTasks.push([e.startTime, e.duration]) }).observe({ type: 'longtask', buffered: true })
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__v.fcp = e.startTime }).observe({ type: 'paint', buffered: true })
new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.events.push([e.name, e.duration]) }).observe({ type: 'event', durationThreshold: 16, buffered: true })
`

// phone: 4x CPU slowdown, 1.6 Mbit/s and 150 ms (Lighthouse's mobile shape, the standard mobile connection);
// phone-fast: the same CPU on an unthrottled connection; phone-slow: 6x CPU, 400 kbit/s and 400 ms (a slow 3G-like connection).
const NETWORK = {
  phone: { cpu: 4, latency: 150, down: 1.6 * 1024 * 1024, up: 750 * 1024 },
  'phone-fast': { cpu: 4, latency: 0, down: -1, up: -1 },
  'phone-slow': { cpu: 6, latency: 400, down: 400 * 1024, up: 400 * 1024 },
}

async function onceInner(browser, url) {
  const mobile = profile.startsWith('phone')
  const { context, page } = await newPage(browser, { width: mobile ? 390 : 1440, height: mobile ? 844 : 900, mobile, seen: !intro })
  await context.addInitScript(INIT)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  if (mobile) {
    const n = NETWORK[profile]
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: n.cpu })
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: n.latency, downloadThroughput: n.down < 0 ? -1 : n.down / 8, uploadThroughput: n.up < 0 ? -1 : n.up / 8 })
  }
  const res = new Map()
  cdp.on('Network.responseReceived', (e) => res.set(e.requestId, { url: e.response.url, type: e.type, status: e.response.status }))
  cdp.on('Network.loadingFinished', (e) => { const r = res.get(e.requestId); if (r) r.bytes = e.encodedDataLength })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 160)))
  const t0 = Date.now()
  await page.goto(base + url, { waitUntil: 'load', timeout: 90000 })
  await page.waitForTimeout(profile === 'phone-slow' ? 12000 : mobile ? 6000 : 3500)
  const v = await page.evaluate(() => window.__v)
  const list = [...res.values()].filter((r) => r.bytes != null)
  const sum = (f) => list.filter(f).reduce((a, r) => a + r.bytes, 0)
  const tbt = v.longTasks.filter(([s]) => s >= v.fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0)
  const inp = v.events.reduce((m, [, d]) => Math.max(m, d), 0)
  const result = {
    url, fcp: Math.round(v.fcp), lcp: Math.round(v.lcp), lcpEl: v.lcpEl, cls: +v.cls.toFixed(4), tbt: Math.round(tbt), longTasks: v.longTasks.length,
    maxLong: Math.round(v.longTasks.reduce((m, [, d]) => Math.max(m, d), 0)),
    requests: list.length, kb: Math.round(sum(() => true) / 1024), jsKb: Math.round(sum((r) => r.type === 'Script') / 1024),
    cssKb: Math.round(sum((r) => r.type === 'Stylesheet') / 1024), imgKb: Math.round(sum((r) => r.type === 'Image') / 1024), fontKb: Math.round(sum((r) => r.type === 'Font') / 1024),
    three: list.some((r) => /events-|three|Scene/i.test(r.url) && r.type === 'Script'),
    scripts: list.filter((r) => r.type === 'Script').map((r) => r.url.split('/').pop() + ':' + Math.round(r.bytes / 1024)).join(' '),
    errors,
  }
  await context.close()
  return result
}

// A navigation that is reset (the static server busy compressing a file) is tried again twice before the run is given up.
async function once(browser, url, attempt = 0) {
  try {
    return await onceInner(browser, url)
  } catch (e) {
    if (attempt >= 2) throw e
    return once(browser, url, attempt + 1)
  }
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

;(async () => {
  const browser = await launch()
  const all = []
  for (const url of pages) {
    const rs = []
    for (let i = 0; i < runs; i++) rs.push(await once(browser, url))
    const m = { ...rs[0] }
    for (const k of ['fcp', 'lcp', 'cls', 'tbt', 'maxLong']) m[k] = median(rs.map((r) => r[k]))
    m.runs = rs.map((r) => ({ lcp: r.lcp, cls: r.cls, tbt: r.tbt }))
    all.push(m)
    console.log(`${profile}${intro ? '+intro' : ''} ${url.padEnd(30)} FCP ${m.fcp} LCP ${m.lcp} CLS ${m.cls} TBT ${m.tbt} long(max) ${m.maxLong} | ${m.requests} req ${m.kb} kB (js ${m.jsKb} css ${m.cssKb} img ${m.imgKb} font ${m.fontKb}) three=${m.three} err=${m.errors.length}`)
  }
  fs.writeFileSync(out, JSON.stringify(all, null, 1))
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
