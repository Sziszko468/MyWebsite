#!/usr/bin/env node
/**
 * Interactive project demos (PROMPT 35): measurements, not claims. On the PRODUCTION build served with its real headers and compression
 * (tools/audit/serve.cjs), in headless system Chrome on the development machine:
 *
 *   1. the INITIAL load of each project page (navigation timing, first contentful paint, requests, JavaScript bytes as transferred, and whether any
 *      demo chunk was requested: it must not be), three cold runs, desktop and a phone emulation (390 x 844, device pixel ratio 2, CPU slowed 4x);
 *   2. with --base <dist of the base commit>: the same figures for the same project pages on the build WITHOUT the demos, so the cost the demos put
 *      on the initial load is a difference between two measured builds, not an estimate. The base commit's build has no prerendered pages (only its
 *      index.html), so BOTH builds are compared the same way, as the single-page app (the demos build copied without its prerendered pages, served with
 *      the index.html fallback); the demos build's own prerendered pages are measured on their own, too;
 *   3. ACTIVATING each demo, measured separately: cold (a fresh load of the demo's URL) and from the project page (the entry link is followed), as the
 *      time until the demo's first section is on the page, and the JavaScript the activation brought (names and bytes);
 *   4. INTERACTING: the time from a click (or a change of the service) to the frame in which its result has been painted (two animation frames later),
 *      thirty times per demo, median and 95th percentile.
 *
 * Phone emulation is a slowed CPU and a small screen, NOT a phone: it is a relative check, not a device test.
 *
 *   node tools/audit/demos-perf.cjs [dist] [--base dist-of-the-base-commit] [--out file.json] [--runs 3]
 */
const path = require('path')
const fs = require('fs')
const zlib = require('zlib')
const os = require('os')
const { start } = require('./serve.cjs')
const { launch, newPage } = require('./lib.cjs')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = args.indexOf(name)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const DIST = path.resolve(positional[0] || path.join(__dirname, '..', '..', 'dist'))
const BASE = flag('--base', '')
const OUT = flag('--out', '')
const RUNS = Number(flag('--runs', '3'))
const SLUGS = ['spendly', 'bookinghub', 'logistics-platform']
const DEMO_CHUNK = /(^|\/)(DemoPage|DemoShell|FinanceDemo|BookingDemo|ShipmentDemo|demoUi|useDemoText)[.-]/
const PROFILES = [
  ['desktop', { width: 1440, height: 900 }, 1],
  ['phone', { width: 390, height: 844, mobile: true }, 4],
]

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
}
const percentile = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
}
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits

/** In the page: the first time a demo's first section is on the page. */
const RECORDER = `
  window.__demo = { t0: performance.now(), ready: null }
  const look = () => { if (window.__demo.ready === null && document.querySelector('[data-demo-stage] section')) window.__demo.ready = performance.now() }
  new MutationObserver(look).observe(document, { subtree: true, childList: true })
  look()
`

/** What the page loaded: JavaScript as transferred, requests, and which of them are demo code. */
const RESOURCES = `(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]))
  const resources = performance.getEntriesByType('resource')
  const js = resources.filter((r) => /\\.js(\\?|$)/.test(r.name))
  return {
    domContentLoadedMs: nav.domContentLoadedEventEnd,
    loadMs: nav.loadEventEnd,
    firstContentfulPaintMs: paint['first-contentful-paint'] ?? null,
    requests: resources.length + 1,
    jsFiles: js.length,
    jsTransferKB: js.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0) / 1024,
    jsNames: js.map((r) => ({ name: r.name.split('/').pop(), kb: (r.transferSize || r.encodedBodySize || 0) / 1024 })),
  }
})()`

/** One interaction of each demo, run in the page: act, then wait for the frame in which the result is painted. */
const INTERACTION = {
  spendly: `(() => {
    const buttons = [...document.querySelectorAll('[data-demo-stage] button')]
    const by = (text) => buttons.find((b) => b.textContent.trim() === text)
    return [by('Income'), by('All')]
  })()`,
  bookinghub: `(() => [...document.querySelectorAll('[data-demo-stage] select')][0])()`,
  'logistics-platform': `(() => [...document.querySelectorAll('[data-demo-stage] ul button')].slice(0, 2))()`,
}
const INTERACT = (slug, count) => `
  (async () => {
    const targets = ${INTERACTION[slug]}
    const times = []
    for (let i = 0; i < ${count}; i += 1) {
      const t0 = performance.now()
      if (${JSON.stringify(slug)} === 'bookinghub') {
        const select = targets
        const options = [...select.options].filter((o) => o.value)
        select.value = options[i % options.length].value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        targets[i % targets.length].click()
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      times.push(performance.now() - t0)
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    return times
  })()`

async function profilePage(browser, options, throttle) {
  const { context, page } = await newPage(browser, options)
  if (throttle > 1) {
    const client = await context.newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  }
  return { context, page }
}

/** The initial load of a project page: cold, three runs. */
async function initialLoads(browser, url, slug, options, throttle, hasEntry) {
  const runs = []
  for (let run = 0; run < RUNS; run += 1) {
    const { context, page } = await profilePage(browser, options, throttle)
    await page.goto(`${url}/en/work/${slug}/`, { waitUntil: 'load' })
    await page.locator(hasEntry ? '[data-demo-entry]' : 'h1').first().waitFor({ timeout: 40000 })
    await page.waitForTimeout(1200)
    runs.push(await page.evaluate(RESOURCES))
    await context.close()
  }
  const pick = (key) => round(median(runs.map((r) => r[key])))
  return {
    runs: runs.length,
    domContentLoadedMs: pick('domContentLoadedMs'),
    loadMs: pick('loadMs'),
    firstContentfulPaintMs: pick('firstContentfulPaintMs'),
    requests: runs[0].requests,
    jsFiles: runs[0].jsFiles,
    jsTransferKB: round(runs[0].jsTransferKB),
    demoChunksRequested: runs.flatMap((r) => r.jsNames.filter((n) => DEMO_CHUNK.test(n.name)).map((n) => n.name)),
  }
}

function chunkSizes() {
  const dir = path.join(DIST, 'assets')
  const rows = []
  for (const name of fs.readdirSync(dir)) {
    if (!/\.js$/.test(name) || !DEMO_CHUNK.test(name)) continue
    const raw = fs.readFileSync(path.join(dir, name))
    rows.push({ file: name, rawBytes: raw.length, gzipBytes: zlib.gzipSync(raw, { level: 9 }).length, brotliBytes: zlib.brotliCompressSync(raw).length })
  }
  const main = fs.readdirSync(dir).filter((n) => /^main-.*\.js$/.test(n))
  for (const name of main) {
    const raw = fs.readFileSync(path.join(dir, name))
    rows.push({ file: name, rawBytes: raw.length, gzipBytes: zlib.gzipSync(raw, { level: 9 }).length, brotliBytes: zlib.brotliCompressSync(raw).length })
  }
  return rows
}

;(async () => {
  const srv = await start({ dir: DIST, port: 4261, fallback: '404', headers: true })
  const baseSrv = BASE ? await start({ dir: path.resolve(BASE), port: 4262, fallback: 'spa', headers: true }) : null
  // The demos build as a single-page app: the same files without the prerendered pages (the three language folders), so an unknown path answers index.html.
  let spaDir = ''
  let spaSrv = null
  if (BASE) {
    spaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demos-perf-spa-'))
    fs.cpSync(DIST, spaDir, { recursive: true, filter: (source) => !/^(en|hu|nl)$/.test(path.relative(DIST, source).split(path.sep)[0] || '') })
    spaSrv = await start({ dir: spaDir, port: 4263, fallback: 'spa', headers: true })
  }
  const browser = await launch()
  const report = { when: new Date().toISOString(), conditions: {}, chunks: chunkSizes(), initial: {}, initialSpa: {}, initialBase: {}, activation: {}, interaction: {} }
  report.conditions = {
    chrome: browser.version(),
    os: process.platform + ' ' + require('os').release(),
    cpus: require('os').cpus().length + ' x ' + require('os').cpus()[0].model.trim(),
    build: DIST,
    base: BASE ? path.resolve(BASE) : null,
    note: 'Headless system Chrome on the development machine, served by tools/audit/serve.cjs with brotli/gzip; medians of three cold runs unless stated. Phone = 390x844, DPR 2, CPU slowed 4x (not a phone).',
  }
  console.log(`Chrome ${report.conditions.chrome}`)

  // 1 and 2. The initial load of a project page, with and without the demos.
  for (const [label, options, throttle] of PROFILES) {
    for (const slug of SLUGS) {
      const key = `${label}/${slug}`
      report.initial[key] = await initialLoads(browser, srv.url, slug, options, throttle, true)
      console.log('initial (prerendered)', key, JSON.stringify(report.initial[key]))
      if (baseSrv) {
        report.initialSpa[key] = await initialLoads(browser, spaSrv.url, slug, options, throttle, true)
        console.log('initial (spa, with demos)', key, JSON.stringify(report.initialSpa[key]))
        report.initialBase[key] = await initialLoads(browser, baseSrv.url, slug, options, throttle, false)
        console.log('initial (spa, base)', key, JSON.stringify(report.initialBase[key]))
      }
    }
  }

  // 3. Activation: cold, and from the project page.
  for (const [label, options, throttle] of PROFILES) {
    for (const slug of SLUGS) {
      const cold = []
      let coldBytes = 0
      let coldNames = []
      for (let run = 0; run < RUNS; run += 1) {
        const { context, page } = await profilePage(browser, options, throttle)
        await page.addInitScript(RECORDER)
        await page.goto(`${srv.url}/en/work/${slug}/demo/`, { waitUntil: 'load' })
        await page.locator('[data-demo-stage] section').first().waitFor({ timeout: 60000 })
        cold.push(await page.evaluate(() => window.__demo.ready))
        if (run === 0) {
          const res = await page.evaluate(RESOURCES)
          coldBytes = res.jsTransferKB
          coldNames = res.jsNames.filter((n) => DEMO_CHUNK.test(n.name)).map((n) => `${n.name} ${round(n.kb)} KB`)
        }
        await context.close()
      }
      const warm = []
      let addedKB = 0
      let addedNames = []
      for (let run = 0; run < RUNS; run += 1) {
        const { context, page } = await profilePage(browser, options, throttle)
        await page.goto(`${srv.url}/en/work/${slug}/`, { waitUntil: 'load' })
        await page.locator('[data-demo-entry]').first().waitFor({ timeout: 40000 })
        await page.waitForTimeout(1000)
        const before = await page.evaluate(RESOURCES)
        await page.evaluate(RECORDER)
        await page.locator('[data-demo-entry] a').click()
        await page.locator('[data-demo-stage] section').first().waitFor({ timeout: 60000 })
        warm.push(await page.evaluate(() => window.__demo.ready - window.__demo.t0))
        if (run === 0) {
          const after = await page.evaluate(RESOURCES)
          const seen = new Set(before.jsNames.map((n) => n.name))
          const added = after.jsNames.filter((n) => !seen.has(n.name))
          addedKB = added.reduce((sum, n) => sum + n.kb, 0)
          addedNames = added.map((n) => `${n.name} ${round(n.kb)} KB`)
        }
        await context.close()
      }
      const key = `${label}/${slug}`
      report.activation[key] = {
        coldToFirstSectionMs: round(median(cold)),
        coldJsTransferKB: round(coldBytes),
        coldDemoChunks: coldNames,
        fromProjectPageMs: round(median(warm)),
        fromProjectPageAddedJsKB: round(addedKB),
        fromProjectPageAddedChunks: addedNames,
      }
      console.log('activation', key, JSON.stringify(report.activation[key]))
    }
  }

  // 4. Interaction latency: thirty interactions per demo.
  for (const [label, options, throttle] of PROFILES) {
    for (const slug of SLUGS) {
      const { context, page } = await profilePage(browser, options, throttle)
      await page.goto(`${srv.url}/en/work/${slug}/demo/`, { waitUntil: 'load' })
      await page.locator('[data-demo-stage] section').first().waitFor({ timeout: 60000 })
      await page.waitForTimeout(1500)
      const times = await page.evaluate(INTERACT(slug, 30))
      const usable = times.slice(2)
      const key = `${label}/${slug}`
      report.interaction[key] = { interactions: usable.length, medianMs: round(median(usable)), p95Ms: round(percentile(usable, 0.95)), maxMs: round(Math.max(...usable)) }
      console.log('interaction', key, JSON.stringify(report.interaction[key]))
      await context.close()
    }
  }

  await browser.close()
  srv.server.close()
  if (baseSrv) baseSrv.server.close()
  if (spaSrv) spaSrv.server.close()
  if (spaDir) fs.rmSync(spaDir, { recursive: true, force: true })
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log('\n' + JSON.stringify(report, null, 2))
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
