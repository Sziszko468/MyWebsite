#!/usr/bin/env node
/**
 * Command Center and Digital Archive (PROMPT 37): measurements, not claims. On the PRODUCTION build served with its real headers and compression (tools/audit/serve.cjs),
 * in headless system Chrome on the development machine:
 *
 *   1. the INITIAL load of four pages that must not pay for the two new ones (home, work, the Lab's overview, a project page): navigation timing, first contentful paint,
 *      requests, JavaScript as transferred, and whether a chunk of the Command Center or the archive was requested (none may be); three cold runs, desktop and a phone
 *      emulation (390 x 844, device pixel ratio 2, CPU slowed 4x);
 *   2. with --base <dist of the base commit>: the same figures on the build WITHOUT the pages. The two builds take turns (this one first in even runs, the base first in odd
 *      ones), so a machine that speeds up or slows down does not favour either. If the base build has its prerendered pages, the two real builds are compared; if it has
 *      none, BOTH are compared as the single-page app (this build copied without its prerendered pages, served with the index.html fallback);
 *   3. ARRIVING at each of the two pages: cold (a fresh load of its prerendered URL) and from the home page's footer link, as the time until its first sector or entry is on
 *      the page, the JavaScript brought, and the cumulative layout shift of the cold load;
 *   4. the archive's SEARCH and filters: the time from a change of a control to the frame in which the new list has been painted (two animation frames later).
 *
 * There is no backend behind the static server: the pages use the website's own content, so the numbers say nothing about the time a real API takes. Phone emulation is a
 * slowed CPU and a small screen, NOT a phone: it is a relative check, not a device test.
 *
 *   node tools/audit/archive-perf.cjs [dist] [--base dist-of-the-base-commit] [--out file.json] [--runs 3] [--initial-runs 7] [--only initial|arrival|interaction]
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
// The initial loads differ by little, so they get more runs than the rest.
const INITIAL_RUNS = Number(flag('--initial-runs', String(RUNS)))
const ONLY = flag('--only', '')
const want = (part) => !ONLY || ONLY === part
/** A file's name without its content hash: the same chunk in two builds. */
const logical = (name) => name.replace(/-[A-Za-z0-9_-]{8}(?=\.(js|css)$)/, '')
const PAGES = [['home', '/en/'], ['work', '/en/work/'], ['lab', '/en/lab/'], ['project', '/en/work/spendly/']]
const OWN_CHUNK = /(^|\/)(ArchivePage|CommandCenterPage|useArchive)[.-]/
const TARGETS = [
  { name: 'command-center', route: '/en/command-center/', ready: '[data-command-center] [data-sector]', link: 'footer a[href$="/en/command-center"], footer a[href$="/en/command-center/"]' },
  { name: 'archive', route: '/en/archive/', ready: '[data-archive] article', link: 'footer a[href$="/en/archive"], footer a[href$="/en/archive/"]' },
]
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
  const css = resources.filter((r) => /\\.css(\\?|$)/.test(r.name))
  return {
    domContentLoadedMs: nav.domContentLoadedEventEnd,
    loadMs: nav.loadEventEnd,
    firstContentfulPaintMs: paint['first-contentful-paint'] ?? null,
    requests: resources.length + 1,
    jsFiles: js.length,
    jsTransferKB: js.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0) / 1024,
    cssTransferKB: css.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0) / 1024,
    jsNames: js.map((r) => ({ name: r.name.split('/').pop(), kb: (r.transferSize || r.encodedBodySize || 0) / 1024 })),
  }
})()`

/** Layout shift, collected from the first frame. */
const SHIFTS = `
  window.__shift = 0
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value }).observe({ type: 'layout-shift', buffered: true })
`

async function profilePage(browser, options, throttle) {
  const { context, page } = await newPage(browser, options)
  if (throttle > 1) {
    const client = await context.newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  }
  return { context, page }
}

async function oneLoad(browser, base, route, options, throttle) {
  const { context, page } = await profilePage(browser, options, throttle)
  await page.goto(`${base}${route}`, { waitUntil: 'load' })
  await page.locator('h1').first().waitFor({ timeout: 40000 })
  await page.waitForTimeout(1200)
  const result = await page.evaluate(RESOURCES)
  await context.close()
  return result
}

function summary(runs) {
  const pick = (key) => round(median(runs.map((r) => r[key])))
  return {
    runs: runs.length,
    domContentLoadedMs: pick('domContentLoadedMs'),
    firstContentfulPaintMs: pick('firstContentfulPaintMs'),
    domContentLoadedPerRun: runs.map((r) => round(r.domContentLoadedMs)),
    firstContentfulPaintPerRun: runs.map((r) => round(r.firstContentfulPaintMs)),
    requests: pick('requests'),
    jsFiles: pick('jsFiles'),
    jsTransferKB: pick('jsTransferKB'),
    jsTransferKBPerRun: runs.map((r) => round(r.jsTransferKB)),
    cssTransferKB: pick('cssTransferKB'),
    files: Object.fromEntries(runs[runs.length - 1].jsNames.map((n) => [logical(n.name), round(n.kb)])),
    ownChunksRequested: runs.flatMap((r) => r.jsNames.filter((n) => OWN_CHUNK.test(n.name)).map((n) => n.name)),
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

/** One change of one control, the way a visitor's change reaches React, timed until the frame that shows the result; returns also how many entries are then listed. */
const CHANGE = `
  (async (step) => {
    const form = document.querySelector('[data-archive] form')
    let element
    if (step.control === 'search') element = form.querySelector('input[type="search"]')
    else if (step.control === 'kind') element = form.querySelector('fieldset input[value="' + step.value + '"]')
    else element = form.querySelectorAll('select')[step.index]
    if (!element) return null
    const t0 = performance.now()
    if (step.control === 'kind') element.click()
    else {
      const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, step.value)
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const ms = performance.now() - t0
    await new Promise((resolve) => setTimeout(resolve, 60))
    return { ms, listed: document.querySelectorAll('[data-archive] article').length }
  })`

/** Each series ends where it began (the whole list), so it can be repeated. `index` is the select's place in the form: category, status, sort. */
const SERIES = [
  { id: 'search: typing a word and clearing it', steps: ['s', 'sp', 'spe', 'spen', 'spend', 'spen', 'spe', 'sp', 's', ''].map((value) => ({ control: 'search', value })) },
  { id: 'kind: the rail', steps: ['lab', 'project', 'demo', 'tool', ''].map((value) => ({ control: 'kind', value })) },
  { id: 'category', steps: ['creative-coding', ''].map((value) => ({ control: 'select', index: 0, value })) },
  { id: 'status', steps: ['demo', ''].map((value) => ({ control: 'select', index: 1, value })) },
  { id: 'sort: the whole list reordered', steps: ['name', 'name-desc', 'kind', ''].map((value) => ({ control: 'select', index: 2, value })) },
]

;(async () => {
  const srv = await start({ dir: DIST, port: 4272, fallback: '404', headers: true })
  const prerendered = BASE !== '' && fs.existsSync(path.join(path.resolve(BASE), 'en', 'index.html'))
  const baseSrv = BASE ? await start({ dir: path.resolve(BASE), port: 4273, fallback: prerendered ? '404' : 'spa', headers: true }) : null
  let spaDir = ''
  let spaSrv = null
  if (BASE && !prerendered) {
    spaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-perf-spa-'))
    fs.cpSync(DIST, spaDir, { recursive: true, filter: (source) => !/^(en|hu|nl)$/.test(path.relative(DIST, source).split(path.sep)[0] || '') })
    spaSrv = await start({ dir: spaDir, port: 4274, fallback: 'spa', headers: true })
  }
  const browser = await launch()
  const report = { when: new Date().toISOString(), conditions: {}, chunks: {}, initialBranch: {}, initialBase: {}, arrival: {}, interaction: {} }
  report.conditions = {
    chrome: browser.version(),
    os: process.platform + ' ' + os.release(),
    cpus: os.cpus().length + ' x ' + os.cpus()[0].model.trim(),
    build: DIST,
    base: BASE ? path.resolve(BASE) : null,
    runs: RUNS,
    initialRuns: INITIAL_RUNS,
    compared: BASE ? (prerendered ? 'both real builds (prerendered)' : 'both as the single-page app') : 'no base',
    note: 'Headless system Chrome on the development machine, served by tools/audit/serve.cjs with brotli/gzip, no backend; medians of cold runs. Phone = 390x844, DPR 2, CPU slowed 4x (not a phone).',
  }
  console.log(`Chrome ${report.conditions.chrome}`)
  report.chunks.branch = chunkSizes(DIST, /^(ArchivePage|CommandCenterPage|useArchive|LabArt|main)-.*\.(js|css)$/)
  if (BASE) report.chunks.base = chunkSizes(path.resolve(BASE), /^(LabArt|LabPage|main)-.*\.(js|css)$/)

  // 1 and 2. The initial load of four pages, with and without the new pages in the build.
  if (BASE && want('initial')) {
    const branchUrl = prerendered ? srv.url : spaSrv.url
    for (const [label, options, throttle] of PROFILES) {
      for (const [name, route] of PAGES) {
        const key = `${label}/${name}`
        const branch = []
        const base = []
        for (let run = 0; run < INITIAL_RUNS; run += 1) {
          const sides = [[branch, branchUrl], [base, baseSrv.url]]
          for (const [list, address] of run % 2 === 0 ? sides : [...sides].reverse()) list.push(await oneLoad(browser, address, route, options, throttle))
        }
        report.initialBranch[key] = summary(branch)
        report.initialBase[key] = summary(base)
        const a = report.initialBranch[key].files
        const b = report.initialBase[key].files
        const added = Object.keys(a).filter((f) => !(f in b)).map((f) => `${f} ${a[f]} KB`)
        const removed = Object.keys(b).filter((f) => !(f in a)).map((f) => `${f} ${b[f]} KB`)
        const changed = Object.keys(a).filter((f) => f in b && Math.abs(a[f] - b[f]) >= 0.3).map((f) => `${f} ${b[f]} → ${a[f]} KB`)
        report.initialBranch[key].diff = { added, removed, changed }
        const brief = (r) => ({ ...r, files: undefined, diff: undefined })
        console.log('initial', key, 'branch', JSON.stringify(brief(report.initialBranch[key])), '| base', JSON.stringify(brief(report.initialBase[key])), '| files', JSON.stringify(report.initialBranch[key].diff))
      }
    }
  }

  // 3. Arriving: cold, and from the home page's footer.
  for (const [label, options, throttle] of want('arrival') ? PROFILES : []) {
    for (const target of TARGETS) {
      const cold = []
      const shifts = []
      let coldKB = 0
      let coldCss = 0
      let coldNames = []
      for (let run = 0; run < RUNS; run += 1) {
        const { context, page } = await profilePage(browser, options, throttle)
        await page.addInitScript(SHIFTS)
        await page.goto(`${srv.url}${target.route}`, { waitUntil: 'load' })
        await page.locator(target.ready).first().waitFor({ timeout: 60000 })
        cold.push(await page.evaluate(() => performance.now()))
        await page.waitForTimeout(2500)
        shifts.push(await page.evaluate(() => window.__shift))
        if (run === 0) {
          const res = await page.evaluate(RESOURCES)
          coldKB = res.jsTransferKB
          coldCss = res.cssTransferKB
          coldNames = res.jsNames.filter((n) => OWN_CHUNK.test(n.name)).map((n) => `${n.name} ${round(n.kb)} KB`)
        }
        await context.close()
      }
      const warm = []
      let addedKB = 0
      let addedNames = []
      for (let run = 0; run < RUNS; run += 1) {
        const { context, page } = await profilePage(browser, options, throttle)
        await page.goto(`${srv.url}/en/`, { waitUntil: 'load' })
        await page.locator(target.link).first().waitFor({ state: 'attached', timeout: 40000 })
        await page.waitForTimeout(1000)
        const before = await page.evaluate(RESOURCES)
        const t0 = await page.evaluate(() => performance.now())
        await page.evaluate((selector) => document.querySelector(selector).click(), target.link)
        await page.locator(target.ready).first().waitFor({ timeout: 60000 })
        warm.push((await page.evaluate(() => performance.now())) - t0)
        if (run === 0) {
          await page.waitForTimeout(800)
          const after = await page.evaluate(RESOURCES)
          const seen = new Set(before.jsNames.map((n) => n.name))
          const added = after.jsNames.filter((n) => !seen.has(n.name))
          addedKB = added.reduce((sum, n) => sum + n.kb, 0)
          addedNames = added.map((n) => `${n.name} ${round(n.kb)} KB`)
        }
        await context.close()
      }
      const key = `${label}/${target.name}`
      report.arrival[key] = {
        coldReadyMs: round(median(cold)),
        coldJsTransferKB: round(coldKB),
        coldCssTransferKB: round(coldCss),
        coldOwnChunks: coldNames,
        coldLayoutShift: round(median(shifts), 3),
        coldLayoutShiftPerRun: shifts.map((s) => round(s, 3)),
        fromHomeMs: round(median(warm)),
        fromHomeAddedJsKB: round(addedKB),
        fromHomeAddedChunks: addedNames,
      }
      console.log('arrival', key, JSON.stringify(report.arrival[key]))
    }
  }

  // 4. The archive's controls.
  for (const [label, options, throttle] of want('interaction') ? PROFILES : []) {
    const { context, page } = await profilePage(browser, options, throttle)
    await page.goto(`${srv.url}/en/archive/`, { waitUntil: 'load' })
    await page.locator('[data-archive] article').first().waitFor({ timeout: 60000 })
    await page.waitForTimeout(1500)
    for (const series of SERIES) {
      const times = []
      const listed = []
      // The first pass is not counted (code that runs for the first time).
      for (let pass = 0; pass < 6; pass += 1) {
        for (const step of series.steps) {
          const result = await page.evaluate(`${CHANGE}(${JSON.stringify(step)})`)
          if (!result) throw new Error(`no control for ${series.id}`)
          if (pass > 0) times.push(result.ms)
          if (pass === 1) listed.push(result.listed)
        }
      }
      const key = `${label}/${series.id}`
      report.interaction[key] = { interactions: times.length, medianMs: round(median(times)), p95Ms: round(percentile(times, 0.95)), maxMs: round(Math.max(...times)), entriesListedPerStep: listed }
      console.log('interaction', key, JSON.stringify(report.interaction[key]))
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
