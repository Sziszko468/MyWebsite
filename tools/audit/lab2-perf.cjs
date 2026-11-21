#!/usr/bin/env node
/**
 * Lab 2.0 (PROMPT 34): measurements, not claims. On the PRODUCTION build served with its real headers:
 *
 *   1. the initial load of the Lab overview (navigation timing, first and largest paint, requests, bytes, whether Three.js is loaded);
 *   2. activating each experience: cold (a fresh page load of its URL) and from the overview (client-side navigation), as the time
 *      until the live canvas has drawn its first frame, and the bytes of code it brought;
 *   3. rendering for five seconds per experience: frame rate and frame times, the tier and the canvas size the Lab chose, on a desktop
 *      window and on a phone emulation (390 x 844, device pixel ratio 2, the CPU slowed 4x);
 *   4. what is left after leaving: the JavaScript heap after visiting every experience and coming back to the overview, three rounds,
 *      after a forced garbage collection.
 *
 * It reports the machine it ran on (the GPU's name, Chrome's version), because every number depends on it. Phone emulation is a
 * slowed CPU and a small screen, NOT a phone's GPU: it is a relative check, not a device test.
 *
 *   node tools/audit/lab2-perf.cjs [dist] [--out file.json] [--seconds 5]
 */
const path = require('path')
const fs = require('fs')
const { start } = require('./serve.cjs')
const { launch, newPage } = require('./lib.cjs')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = args.indexOf(name)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const DIST = path.resolve(positional[0] || path.join(__dirname, '..', '..', 'dist'))
const OUT = flag('--out', '')
const SECONDS = Number(flag('--seconds', '5'))
const ROUNDS = Number(flag('--rounds', '3'))
// --only overview|activation|rendering|heap runs one part (the parts are independent).
const ONLY = flag('--only', '')
const want = (part) => !ONLY || ONLY === part
const IDS = ['particle-universe', 'liquid-matter', 'type-in-motion', 'infinite-space', 'chromatic-distortion', 'generative-objects']

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
}
const percentile = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
}
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits

/** Starts a recorder of the time the live canvas takes to draw its first frame, and of the frame times afterwards. */
const INSTALL_RECORDER = `
  window.__lab = { t0: performance.now(), ready: null, deltas: [] }
  new MutationObserver(() => {
    if (window.__lab.ready === null && document.querySelector('[data-ready="true"]')) window.__lab.ready = performance.now()
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ready'] })
`
const FRAME_SAMPLER = (seconds) => `
  new Promise((resolve) => {
    const deltas = []
    let last = performance.now()
    const end = last + ${seconds} * 1000
    const tick = (now) => {
      deltas.push(now - last)
      last = now
      if (now < end) requestAnimationFrame(tick)
      else resolve(deltas)
    }
    requestAnimationFrame(tick)
  })
`

async function rendererName(browser) {
  const { context, page } = await newPage(browser, { width: 400, height: 300 })
  await page.goto('about:blank')
  const info = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return 'no WebGL 2'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  })
  await context.close()
  return info
}

async function loadMetrics(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]))
    const resources = performance.getEntriesByType('resource')
    const js = resources.filter((r) => /\.js(\?|$)/.test(r.name))
    return {
      domContentLoadedMs: nav.domContentLoadedEventEnd,
      loadMs: nav.loadEventEnd,
      firstContentfulPaintMs: paint['first-contentful-paint'] ?? null,
      requests: resources.length + 1,
      jsFiles: js.length,
      jsTransferKB: js.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0) / 1024,
      allTransferKB: resources.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0) / 1024,
      threeLoaded: js.some((r) => /three/i.test(r.name)),
      jsNames: js.map((r) => r.name.split('/').pop()),
    }
  })
}

;(async () => {
  const srv = await start({ dir: DIST, port: 4255, fallback: '404', headers: true })
  const browser = await launch()
  const report = { when: new Date().toISOString(), conditions: {}, overview: {}, activation: [], rendering: { desktop: [], phone: [] }, heap: {} }

  report.conditions = {
    chrome: browser.version(),
    gpu: await rendererName(browser),
    os: process.platform + ' ' + require('os').release(),
    cpus: require('os').cpus().length + ' x ' + require('os').cpus()[0].model.trim(),
    build: DIST,
    note: 'Headless system Chrome on the development machine; one run per figure unless a median is stated.',
  }
  console.log(`Chrome ${report.conditions.chrome} on ${report.conditions.gpu}`)

  // 1. The initial load of the overview, cold, three runs (new context each).
  const loads = []
  for (let run = 0; want('overview') && run < 3; run += 1) {
    const { context, page } = await newPage(browser, { width: 1440, height: 900 })
    await page.goto(`${srv.url}/en/lab/`, { waitUntil: 'load' })
    await page.waitForSelector('#experiments article', { timeout: 30000 })
    await page.waitForTimeout(1500)
    loads.push(await loadMetrics(page))
    await context.close()
  }
  const pick = (key) => round(median(loads.map((l) => l[key])))
  if (loads.length) report.overview = {
    runs: loads.length,
    domContentLoadedMs: pick('domContentLoadedMs'),
    loadMs: pick('loadMs'),
    firstContentfulPaintMs: pick('firstContentfulPaintMs'),
    requests: loads[0].requests,
    jsFiles: loads[0].jsFiles,
    jsTransferKB: round(loads[0].jsTransferKB),
    allTransferKB: round(loads[0].allTransferKB),
    threeLoaded: loads[0].threeLoaded,
  }
  if (loads.length) console.log('overview', JSON.stringify(report.overview))

  // 2. Activation: cold, and from the overview.
  for (const id of want('activation') ? IDS : []) {
    const cold = []
    let bytes = 0
    for (let run = 0; run < 3; run += 1) {
      const { context, page } = await newPage(browser, { width: 1440, height: 900 })
      await page.addInitScript(INSTALL_RECORDER)
      await page.goto(`${srv.url}/en/lab/${id}/`, { waitUntil: 'load' })
      await page.waitForSelector('[data-ready="true"]', { timeout: 40000 })
      const t = await page.evaluate(() => ({ ready: window.__lab.ready, origin: performance.timeOrigin }))
      cold.push(t.ready)
      if (run === 0) bytes = (await loadMetrics(page)).jsTransferKB
      await context.close()
    }
    // From the overview: the page is loaded, then the tile's link is followed.
    const warm = []
    for (let run = 0; run < 3; run += 1) {
      const { context, page } = await newPage(browser, { width: 1440, height: 900 })
      await page.goto(`${srv.url}/en/lab/`, { waitUntil: 'load' })
      await page.waitForSelector('#experiments article', { timeout: 30000 })
      await page.waitForTimeout(800)
      await page.evaluate(INSTALL_RECORDER)
      await page.locator(`#experiments article[data-id="${id}"] a[href*="/lab/"]`).click()
      await page.waitForSelector('[data-ready="true"]', { timeout: 40000 })
      warm.push(await page.evaluate(() => window.__lab.ready - window.__lab.t0))
      await context.close()
    }
    report.activation.push({ id, coldFirstFrameMs: round(median(cold)), fromOverviewMs: round(median(warm)), jsKBOnColdLoad: round(bytes) })
    console.log('activation', JSON.stringify(report.activation[report.activation.length - 1]))
  }

  // 3. Rendering.
  for (const [label, options, throttle] of [
    ['desktop', { width: 1440, height: 900 }, 1],
    ['phone', { width: 390, height: 844, mobile: true }, 4],
  ]) {
    for (const id of want('rendering') ? IDS : []) {
      const { context, page } = await newPage(browser, options)
      const client = await context.newCDPSession(page)
      if (throttle > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: throttle })
      await page.goto(`${srv.url}/en/lab/${id}/`, { waitUntil: 'load' })
      await page.waitForSelector('[data-ready="true"]', { timeout: 60000 })
      await page.waitForTimeout(2500)
      const deltas = await page.evaluate(FRAME_SAMPLER(SECONDS))
      const info = await page.evaluate(() => {
        const stage = document.querySelector('[data-lab-tier]')
        const canvas = stage.querySelector('canvas')
        return {
          tier: stage.getAttribute('data-lab-tier'),
          view: stage.getAttribute('data-view'),
          canvas: canvas ? `${canvas.width}x${canvas.height}` : 'none',
          dpr: window.devicePixelRatio,
        }
      })
      const usable = deltas.slice(3)
      const total = usable.reduce((a, b) => a + b, 0)
      const row = {
        id,
        tierAtEnd: info.tier,
        viewAtEnd: info.view,
        canvas: info.canvas,
        deviceDpr: info.dpr,
        fps: round((usable.length / total) * 1000),
        medianFrameMs: round(median(usable)),
        p95FrameMs: round(percentile(usable, 0.95)),
        slowFramesOver33ms: usable.filter((d) => d > 33.4).length,
        frames: usable.length,
      }
      report.rendering[label].push(row)
      console.log(label, JSON.stringify(row))
      await context.close()
    }
  }

  // 4. What is left: the heap after three rounds through every experience and back to the overview.
  if (want('heap')) {
    const { context, page } = await newPage(browser, { width: 1440, height: 900 })
    const client = await context.newCDPSession(page)
    const heap = async () => {
      await client.send('HeapProfiler.collectGarbage')
      await client.send('HeapProfiler.collectGarbage')
      const usage = await client.send('Runtime.getHeapUsage')
      return usage.usedSize / 1024 / 1024
    }
    await page.goto(`${srv.url}/en/lab/`, { waitUntil: 'load' })
    await page.waitForSelector('#experiments article', { timeout: 30000 })
    await page.waitForTimeout(1500)
    const series = [round(await heap(), 2)]
    for (let round_ = 0; round_ < ROUNDS; round_ += 1) {
      for (const id of IDS) {
        await page.locator(`#experiments article[data-id="${id}"] a[href*="/lab/"]`).click()
        await page.waitForSelector('[data-ready="true"]', { timeout: 40000 })
        await page.waitForTimeout(600)
        await page.locator('nav[aria-label="Lab navigation"]').getByRole('link', { name: 'All experiments' }).click()
        await page.waitForSelector('#experiments article', { timeout: 20000 })
        await page.locator('#experiments').scrollIntoViewIfNeeded()
        await page.waitForTimeout(700)
      }
      await page.waitForTimeout(1500)
      series.push(round(await heap(), 2))
    }
    report.heap = { unit: 'MB, after forced garbage collection: before, then after each round of all six experiences and back', series }
    console.log('heap', JSON.stringify(series))
    await context.close()
  }

  await browser.close()
  srv.server.close()
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log('\n' + JSON.stringify(report, null, 2))
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
