#!/usr/bin/env node
/**
 * Advanced motion (PROMPT 38): measurements against the base build, not claims. Both PRODUCTION builds are served the same way (tools/audit/serve.cjs, real headers
 * and compression, their prerendered pages) in headless system Chrome, the two taking turns run by run so that a machine speeding up or slowing down favours
 * neither:
 *
 *   1. SIZES: every JavaScript and CSS file, raw / gzip / brotli, matched by name without its hash;
 *   2. INITIAL load of eight pages: first contentful paint, DOMContentLoaded, requests and transferred JavaScript and CSS, desktop and a phone emulation
 *      (390 x 844, device pixel ratio 2, CPU slowed 4x);
 *   3. INTERACTIONS: a click on a header link until the new page's heading is painted (its code not yet loaded, then loaded), a language switch, and a scroll
 *      through a page with a layered first screen (the frames' median and 95th percentile, and long tasks);
 *   4. A LIVE SCENE behind the phone menu: the main thread's busy time over three seconds with the menu open.
 *
 * Phone emulation is a slowed CPU and a small screen, not a phone. Nothing here measures the GPU.
 *
 *   node tools/audit/motion-perf.cjs [dist] --base <dist of the base commit> [--runs 5] [--only sizes|initial|interaction|scene] [--out file.json]
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
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
const BASE = path.resolve(flag('--base', ''))
const RUNS = Number(flag('--runs', '5'))
const ONLY = flag('--only', '')
const OUT = flag('--out', '')
const want = (part) => !ONLY || ONLY === part
if (!flag('--base', '') || !fs.existsSync(path.join(BASE, 'index.html'))) {
  console.error('--base <dist of the base commit> is required')
  process.exit(2)
}

const PAGES = [['home', '/en/'], ['about', '/en/about/'], ['work', '/en/work/'], ['services', '/en/services/'], ['project', '/en/work/spendly/'], ['lab', '/en/lab/'], ['command-center', '/en/command-center/'], ['cart', '/en/services/cart/']]
const PROFILES = [['desktop', { width: 1440, height: 900 }, 1], ['phone', { width: 390, height: 844, mobile: true }, 4]]
const logical = (name) => name.replace(/-[A-Za-z0-9_-]{8}(?=\.(js|css)$)/, '')
const median = (list) => {
  const s = [...list].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
const percentile = (list, p) => {
  const s = [...list].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0
}
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d

function sizes(dir) {
  const assets = path.join(dir, 'assets')
  const out = {}
  for (const name of fs.readdirSync(assets)) {
    if (!/\.(js|css)$/.test(name)) continue
    const raw = fs.readFileSync(path.join(assets, name))
    const key = logical(name)
    const row = { raw: raw.length, gzip: zlib.gzipSync(raw, { level: 9 }).length, br: zlib.brotliCompressSync(raw).length }
    // Two files may share a name without their hash (two chunks called `entry`): they are added together.
    out[key] = out[key] ? { raw: out[key].raw + row.raw, gzip: out[key].gzip + row.gzip, br: out[key].br + row.br } : row
  }
  return out
}

const RESOURCES = `(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]))
  const res = performance.getEntriesByType('resource')
  const kb = (re) => res.filter((r) => re.test(r.name)).reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0) / 1024
  return { dcl: nav.domContentLoadedEventEnd, fcp: paint['first-contentful-paint'] ?? 0, requests: res.length + 1, js: kb(/\\.js(\\?|$)/), css: kb(/\\.css(\\?|$)/) }
})()`

;(async () => {
  const branch = await start({ dir: DIST, port: 4291, fallback: '404', headers: true })
  const base = await start({ dir: BASE, port: 4292, fallback: '404', headers: true })
  const sides = [['branch', branch.url], ['base', base.url]]
  const turn = (run) => (run % 2 === 0 ? sides : [...sides].reverse())
  const browser = await launch()
  const report = { when: new Date().toISOString(), conditions: { chrome: browser.version(), os: `${process.platform} ${os.release()}`, cpus: `${os.cpus().length} x ${os.cpus()[0].model.trim()}`, runs: RUNS }, sizes: {}, initial: {}, interaction: {}, scene: {} }
  const open = async (options, throttle) => {
    const made = await newPage(browser, options)
    if (throttle > 1) {
      const client = await made.context.newCDPSession(made.page)
      await client.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    }
    return made
  }

  if (want('sizes')) {
    const a = sizes(DIST)
    const b = sizes(BASE)
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
    const total = (map, kind, ext) => Object.entries(map).filter(([k]) => k.endsWith(ext) && !/^admin/i.test(k)).reduce((s, [, v]) => s + v[kind], 0)
    report.sizes = {
      changed: keys.filter((k) => !a[k] || !b[k] || Math.abs(a[k].br - b[k].br) >= 20).map((k) => ({ file: k, base: b[k] ?? null, branch: a[k] ?? null })),
      totals: Object.fromEntries(['.js', '.css'].map((ext) => [ext, Object.fromEntries(['raw', 'gzip', 'br'].map((kind) => [kind, { base: total(b, kind, ext), branch: total(a, kind, ext) }]))])),
    }
    console.log('sizes', JSON.stringify(report.sizes.totals))
    for (const row of report.sizes.changed) console.log('  ', row.file.padEnd(34), 'br', row.base?.br ?? '-', '→', row.branch?.br ?? '-', '| gzip', row.base?.gzip ?? '-', '→', row.branch?.gzip ?? '-')
  }

  if (want('initial')) {
    for (const [label, options, throttle] of PROFILES) {
      for (const [name, route] of PAGES) {
        const got = { branch: [], base: [] }
        for (let run = 0; run < RUNS; run += 1) {
          for (const [side, url] of turn(run)) {
            const { context, page } = await open(options, throttle)
            await page.goto(`${url}${route}`, { waitUntil: 'load' })
            await page.locator('h1').first().waitFor({ timeout: 40000 })
            await page.waitForTimeout(1200)
            got[side].push(await page.evaluate(RESOURCES))
            await context.close()
          }
        }
        const sum = (list) => Object.fromEntries(['fcp', 'dcl', 'requests', 'js', 'css'].map((k) => [k, round(median(list.map((r) => r[k])))]))
        report.initial[`${label}/${name}`] = { branch: sum(got.branch), base: sum(got.base) }
        console.log('initial', `${label}/${name}`.padEnd(24), JSON.stringify(report.initial[`${label}/${name}`]))
      }
    }
  }

  if (want('interaction')) {
    for (const [label, options, throttle] of PROFILES) {
      const got = { branch: {}, base: {} }
      const push = (side, key, value) => (got[side][key] ??= []).push(value)
      for (let run = 0; run < RUNS; run += 1) {
        for (const [side, url] of turn(run)) {
          const { context, page } = await open(options, throttle)
          await page.goto(`${url}/en/`, { waitUntil: 'load' })
          await page.locator('h1').waitFor()
          await page.waitForTimeout(1500)
          // A click on a link of the page (the footer's, which a phone has too) until the new page's heading has been painted.
          const navigate = (href) =>
            page.evaluate(async (target) => {
              const link = document.querySelector(`footer a[href="${target}"]`)
              const before = document.querySelector('h1')
              const t0 = performance.now()
              link.click()
              await new Promise((resolve) => {
                const look = () => {
                  const h = document.querySelector('main h1')
                  if (h && h !== before && location.pathname === target) requestAnimationFrame(() => requestAnimationFrame(resolve))
                  else requestAnimationFrame(look)
                }
                look()
              })
              return performance.now() - t0
            }, href)
          push(side, 'to About, first visit', await navigate('/en/about'))
          await page.waitForTimeout(800)
          push(side, 'to Work, first visit', await navigate('/en/work'))
          await page.waitForTimeout(800)
          push(side, 'back to About, code loaded', await navigate('/en/about'))
          await page.waitForTimeout(800)
          push(side, 'language switch', await page.evaluate(async () => {
            const t0 = performance.now()
            document.querySelector('footer a[hreflang="nl"]').click()
            await new Promise((resolve) => {
              const look = () => (document.documentElement.lang === 'nl' ? requestAnimationFrame(() => requestAnimationFrame(resolve)) : requestAnimationFrame(look))
              look()
            })
            return performance.now() - t0
          }))
          await page.waitForTimeout(800)
          // Scrolling through the page's first screens, a step each frame.
          const scroll = await page.evaluate(async () => {
            const longs = []
            const observer = new PerformanceObserver((list) => longs.push(...list.getEntries().map((e) => e.duration)))
            observer.observe({ type: 'longtask' })
            window.scrollTo({ top: 0, behavior: 'instant' })
            await new Promise((r) => setTimeout(r, 300))
            const times = []
            let last = performance.now()
            for (let i = 1; i <= 120; i += 1) {
              window.scrollTo({ top: i * 14, behavior: 'instant' })
              await new Promise((r) => requestAnimationFrame(r))
              const now = performance.now()
              times.push(now - last)
              last = now
            }
            await new Promise((r) => setTimeout(r, 100))
            observer.disconnect()
            return { times, longs: longs.length }
          })
          got[side]['scroll frames'] = [...(got[side]['scroll frames'] ?? []), ...scroll.times]
          push(side, 'scroll long tasks', scroll.longs)
          await context.close()
        }
      }
      const out = {}
      for (const side of ['branch', 'base']) {
        out[side] = Object.fromEntries(Object.entries(got[side]).map(([key, list]) => [key, key === 'scroll frames' ? { median: round(median(list)), p95: round(percentile(list, 0.95)), frames: list.length } : key === 'scroll long tasks' ? { total: list.reduce((a, b) => a + b, 0) } : { median: round(median(list)), max: round(Math.max(...list)) }]))
      }
      report.interaction[label] = out
      console.log('interaction', label, JSON.stringify(out))
    }
  }

  if (want('scene')) {
    for (const [name, route] of [['home hero', '/en/'], ['Lab overview', '/en/lab/']]) {
      const got = { branch: [], base: [] }
      for (let run = 0; run < RUNS; run += 1) {
        for (const [side, url] of turn(run)) {
          const { context, page } = await open({ width: 390, height: 844, mobile: true }, 1)
          await page.goto(`${url}${route}`, { waitUntil: 'load' })
          await page.locator('h1').waitFor()
          await page.waitForTimeout(3000)
          const client = await context.newCDPSession(page)
          await client.send('Performance.enable')
          const busy = async () => (await client.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value
          const sample = async () => {
            const a = await busy()
            await page.waitForTimeout(3000)
            return ((await busy()) - a) / 3
          }
          const shown = await sample()
          await page.locator('header button[aria-haspopup="dialog"]').click()
          await page.waitForTimeout(1000)
          const covered = await sample()
          got[side].push({ shown, covered })
          await context.close()
        }
      }
      const sum = (list) => ({ busyShareShown: round(median(list.map((r) => r.shown)) * 100), busyShareMenuOpen: round(median(list.map((r) => r.covered)) * 100) })
      report.scene[name] = { branch: sum(got.branch), base: sum(got.base) }
      console.log('scene', name, '(main thread busy, % of wall time)', JSON.stringify(report.scene[name]))
    }
  }

  await browser.close()
  branch.server.close()
  base.server.close()
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.conditions))
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
