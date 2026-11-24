#!/usr/bin/env node
/**
 * Design System Playground (PROMPT 36): measurements, not claims. On the PRODUCTION build served with its real headers and compression (tools/audit/serve.cjs), in headless
 * system Chrome on the development machine:
 *
 *   1. the INITIAL load of three pages that must not pay for the playground (the home page, the Lab's overview, a project page): navigation timing, first contentful paint,
 *      requests, JavaScript as transferred, and whether the playground's chunk was requested (it must not be); three cold runs, desktop and a phone emulation
 *      (390 x 844, device pixel ratio 2, CPU slowed 4x);
 *   2. with --base <dist of the base commit>: the same figures on the build WITHOUT the playground. The base build has no prerendered pages, so BOTH builds are compared
 *      the same way, as the single-page app (this build copied without its prerendered pages, served with the index.html fallback);
 *   3. ACTIVATING the playground, measured separately: cold (a fresh load of its URL, prerendered) and from the Lab's overview (the band's link followed), as the time until the
 *      first laboratory is on the page, and the JavaScript the activation brought;
 *   4. INTERACTING: the time from a change of a control to the frame in which its result has been painted (two animation frames later), thirty times per control, median and
 *      95th percentile; and which sections of the page the browser touched while one control was dragged (a MutationObserver per section), which is the measure of "only
 *      the laboratory that owns the control draws again".
 *
 * Phone emulation is a slowed CPU and a small screen, NOT a phone: it is a relative check, not a device test.
 *
 *   node tools/audit/playground-perf.cjs [dist] [--base dist-of-the-base-commit] [--out file.json] [--runs 3]
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const zlib = require('zlib')
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
// --only initial|activation|interaction runs one part (the parts are independent).
const ONLY = flag('--only', '')
const want = (part) => !ONLY || ONLY === part
/** A file's name without its content hash: the same chunk in two builds. */
const logical = (name) => name.replace(/-[A-Za-z0-9_-]{8}(?=\.(js|css)$)/, '')
const PAGES = [['home', '/en/'], ['lab', '/en/lab/'], ['project', '/en/work/spendly/']]
const OWN_CHUNK = /(^|\/)(DesignPlaygroundPage|ColorLab|TypeLab|ComponentLab|LayoutLab|MotionLab)[.-]/
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

async function profilePage(browser, options, throttle) {
  const { context, page } = await newPage(browser, options)
  if (throttle > 1) {
    const client = await context.newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  }
  return { context, page }
}

async function initialLoads(browser, base, route, options, throttle) {
  const runs = []
  for (let run = 0; run < RUNS; run += 1) {
    const { context, page } = await profilePage(browser, options, throttle)
    await page.goto(`${base}${route}`, { waitUntil: 'load' })
    await page.locator('h1').first().waitFor({ timeout: 40000 })
    await page.waitForTimeout(1200)
    runs.push(await page.evaluate(RESOURCES))
    await context.close()
  }
  const pick = (key) => round(median(runs.map((r) => r[key])))
  return {
    runs: runs.length,
    domContentLoadedMs: pick('domContentLoadedMs'),
    firstContentfulPaintMs: pick('firstContentfulPaintMs'),
    requests: runs[0].requests,
    jsFiles: runs[0].jsFiles,
    jsTransferKB: round(median(runs.map((r) => r.jsTransferKB))),
    jsTransferKBPerRun: runs.map((r) => round(r.jsTransferKB)),
    files: Object.fromEntries(runs[0].jsNames.map((n) => [logical(n.name), round(n.kb)])),
    playgroundChunksRequested: runs.flatMap((r) => r.jsNames.filter((n) => OWN_CHUNK.test(n.name)).map((n) => n.name)),
  }
}

function chunkSizes(dir, pattern) {
  const assets = path.join(dir, 'assets')
  const rows = []
  for (const name of fs.readdirSync(assets)) {
    if (!pattern.test(name)) continue
    const raw = fs.readFileSync(path.join(assets, name))
    rows.push({ file: name, rawBytes: raw.length, gzipBytes: zlib.gzipSync(raw, { level: 9 }).length, brotliBytes: zlib.brotliCompressSync(raw).length })
  }
  return rows
}

/** Changes a control the way a visitor does (the native setter and an `input` event, which is what React listens to), then waits for the frame that shows the result. */
const SET = `
  (async (selector, values) => {
    const el = document.querySelector(selector)
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    const times = []
    for (const value of values) {
      const t0 = performance.now()
      setter.call(el, String(value))
      el.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      times.push(performance.now() - t0)
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    return times
  })`

const CONTROLS = [
  { id: 'colour: a HEX typed', section: '#color', query: '#color fieldset input:not([type="color"])', values: (i) => `#${((i * 2654435) % 0xffffff).toString(16).padStart(6, '0')}` },
  { id: 'type: the body size', section: '#type', label: 'Body size', values: (i) => 12 + (i % 28) },
  { id: 'layout: the columns', section: '#layout', label: 'Columns', values: (i) => 1 + (i % 6) },
  { id: 'layout: the preview width', section: '#layout', label: 'Preview width', values: (i) => 320 + 8 * (i % 100) },
  { id: 'motion: the duration', section: '#motion', label: 'Duration', values: (i) => 80 + 20 * (i % 50) },
]

;(async () => {
  const srv = await start({ dir: DIST, port: 4266, fallback: '404', headers: true })
  const baseSrv = BASE ? await start({ dir: path.resolve(BASE), port: 4267, fallback: 'spa', headers: true }) : null
  let spaDir = ''
  let spaSrv = null
  if (BASE) {
    spaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playground-perf-spa-'))
    fs.cpSync(DIST, spaDir, { recursive: true, filter: (source) => !/^(en|hu|nl)$/.test(path.relative(DIST, source).split(path.sep)[0] || '') })
    spaSrv = await start({ dir: spaDir, port: 4268, fallback: 'spa', headers: true })
  }
  const browser = await launch()
  const report = { when: new Date().toISOString(), conditions: {}, chunks: {}, initialSpa: {}, initialBase: {}, activation: {}, interaction: {}, touched: {} }
  report.conditions = {
    chrome: browser.version(),
    os: process.platform + ' ' + os.release(),
    cpus: os.cpus().length + ' x ' + os.cpus()[0].model.trim(),
    build: DIST,
    base: BASE ? path.resolve(BASE) : null,
    note: 'Headless system Chrome on the development machine, served by tools/audit/serve.cjs with brotli/gzip; medians of three cold runs unless stated. Phone = 390x844, DPR 2, CPU slowed 4x (not a phone).',
  }
  console.log(`Chrome ${report.conditions.chrome}`)
  report.chunks.branch = chunkSizes(DIST, /^(DesignPlaygroundPage|LabPage|main)-.*\.(js|css)$/)
  if (BASE) report.chunks.base = chunkSizes(path.resolve(BASE), /^(LabPage|main)-.*\.(js|css)$/)

  // 1 and 2. The initial load of three pages, with and without the playground.
  if (BASE && want('initial')) {
    for (const [label, options, throttle] of PROFILES) {
      for (const [name, route] of PAGES) {
        const key = `${label}/${name}`
        report.initialSpa[key] = await initialLoads(browser, spaSrv.url, route, options, throttle)
        report.initialBase[key] = await initialLoads(browser, baseSrv.url, route, options, throttle)
        const a = report.initialSpa[key].files
        const b = report.initialBase[key].files
        const added = Object.keys(a).filter((f) => !(f in b)).map((f) => `${f} ${a[f]} KB`)
        const removed = Object.keys(b).filter((f) => !(f in a)).map((f) => `${f} ${b[f]} KB`)
        const changed = Object.keys(a).filter((f) => f in b && Math.abs(a[f] - b[f]) >= 0.3).map((f) => `${f} ${b[f]} → ${a[f]} KB`)
        report.initialSpa[key].diff = { added, removed, changed }
        const brief = (r) => ({ ...r, files: undefined, diff: undefined })
        console.log('initial', key, 'branch', JSON.stringify(brief(report.initialSpa[key])), '| base', JSON.stringify(brief(report.initialBase[key])), '| files', JSON.stringify(report.initialSpa[key].diff))
      }
    }
  }

  // 3. Activation: cold, and from the Lab's overview.
  for (const [label, options, throttle] of want('activation') ? PROFILES : []) {
    const cold = []
    let coldNames = []
    let coldKB = 0
    for (let run = 0; run < RUNS; run += 1) {
      const { context, page } = await profilePage(browser, options, throttle)
      await page.goto(`${srv.url}/en/lab/design-system/`, { waitUntil: 'load' })
      await page.locator('#color').waitFor({ timeout: 60000 })
      cold.push(await page.evaluate(() => performance.now()))
      if (run === 0) {
        const res = await page.evaluate(RESOURCES)
        coldKB = res.jsTransferKB
        coldNames = res.jsNames.filter((n) => OWN_CHUNK.test(n.name)).map((n) => `${n.name} ${round(n.kb)} KB`)
      }
      await context.close()
    }
    const warm = []
    let addedKB = 0
    let addedNames = []
    for (let run = 0; run < RUNS; run += 1) {
      const { context, page } = await profilePage(browser, options, throttle)
      await page.goto(`${srv.url}/en/lab/`, { waitUntil: 'load' })
      await page.locator('[data-design-tool]').waitFor({ timeout: 40000 })
      await page.waitForTimeout(1000)
      const before = await page.evaluate(RESOURCES)
      const t0 = await page.evaluate(() => performance.now())
      await page.locator('[data-design-tool] a').click()
      await page.locator('#color').waitFor({ timeout: 60000 })
      warm.push((await page.evaluate(() => performance.now())) - t0)
      if (run === 0) {
        const after = await page.evaluate(RESOURCES)
        const seen = new Set(before.jsNames.map((n) => n.name))
        const added = after.jsNames.filter((n) => !seen.has(n.name))
        addedKB = added.reduce((sum, n) => sum + n.kb, 0)
        addedNames = added.map((n) => `${n.name} ${round(n.kb)} KB`)
      }
      await context.close()
    }
    report.activation[label] = { coldToFirstSectionMs: round(median(cold)), coldJsTransferKB: round(coldKB), coldChunks: coldNames, fromLabMs: round(median(warm)), fromLabAddedJsKB: round(addedKB), fromLabAddedChunks: addedNames }
    console.log('activation', label, JSON.stringify(report.activation[label]))
  }

  // 4. Interaction latency, and what the browser touched while a control was dragged.
  for (const [label, options, throttle] of want('interaction') ? PROFILES : []) {
    const { context, page } = await profilePage(browser, options, throttle)
    await page.goto(`${srv.url}/en/lab/design-system/`, { waitUntil: 'load' })
    await page.locator('#color').waitFor({ timeout: 60000 })
    await page.waitForTimeout(1500)
    for (const control of CONTROLS) {
      const selector = await page.evaluate(({ query, label: text, section }) => {
        const el = query ? document.querySelector(query) : [...document.querySelectorAll(`${section} label`)].find((l) => l.textContent.trim() === text)?.control
        if (!el) return ''
        el.setAttribute('data-perf', 'on')
        return '[data-perf="on"]'
      }, { query: control.query ?? '', label: control.label ?? '', section: control.section })
      if (!selector) {
        console.log('no control for', control.id)
        continue
      }
      const values = Array.from({ length: 32 }, (_, i) => control.values(i))
      // Which sections change while it is dragged.
      await page.evaluate(() => {
        window.__touched = {}
        window.__observers = ['#color', '#type', '#components', '#layout', '#motion'].map((id) => {
          const target = document.querySelector(id)
          window.__touched[id] = 0
          const observer = new MutationObserver((records) => { window.__touched[id] += records.length })
          observer.observe(target, { subtree: true, childList: true, attributes: true, characterData: true })
          return observer
        })
      })
      const times = (await page.evaluate(`${SET}(${JSON.stringify(selector)}, ${JSON.stringify(values)})`)).slice(2)
      const touched = await page.evaluate(() => {
        window.__observers.forEach((observer) => observer.disconnect())
        return window.__touched
      })
      await page.evaluate(() => document.querySelector('[data-perf]')?.removeAttribute('data-perf'))
      const key = `${label}/${control.id}`
      report.interaction[key] = { interactions: times.length, medianMs: round(median(times)), p95Ms: round(percentile(times, 0.95)), maxMs: round(Math.max(...times)) }
      report.touched[key] = touched
      console.log('interaction', key, JSON.stringify(report.interaction[key]), 'sections touched', JSON.stringify(touched))
    }
    await context.close()
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
