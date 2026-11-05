// WebGL robustness: (1) a browser with no WebGL at all: every page still works; (2) context loss and restore on the hero and on a Lab
// experiment; (3) the scene's code is not fetched at all for visitors on the pages that do not need it.
const { start } = require('./serve.cjs')
const { launch, newPage, LANGS, PAGES } = require('./lib.cjs')
const path = require('path')
const DIST = path.resolve(process.argv[2])
const problems = []
const note = (w) => { problems.push(w); console.log('  ✗ ' + w) }
const ok = (w) => console.log('  ✓ ' + w)
const check = (c, w) => (c ? ok(w) : note(w))
const NOISE = /KHR_parallel|X4122|glGetProgramiv|Failed to load resource|GPU stall|GL_INVALID|WebGL/i

;(async () => {
  const srv = await start({ dir: DIST, port: 4223, fallback: '404', headers: true })

  console.log('1. no WebGL at all')
  {
    const browser = await launch({ args: ['--disable-gpu', '--disable-3d-apis', '--disable-webgl', '--disable-webgl2', '--disable-software-rasterizer'] })
    const { context, page } = await newPage(browser, { seen: true })
    const has = await page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) })
    check(!has, 'the test browser really has no WebGL')
    let errs = []
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 140)))
    page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errs.push(m.text().slice(0, 140)) })
    let usable = 0
    for (const p of PAGES) {
      errs = []
      await page.goto(srv.url + `/en${p === '/' ? '/' : p + '/'}`, { waitUntil: 'load' })
      await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(500)
      const info = await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent?.trim().slice(0, 40), text: document.querySelector('main')?.innerText.length ?? 0, links: document.querySelectorAll('main a[href], main button').length }))
      if (!info.h1 || info.text < 80) note(`/en${p}: nearly empty without WebGL (h1 "${info.h1}", ${info.text} chars)`)
      else usable++
      if (errs.length) note(`/en${p}: errors without WebGL: ${errs.slice(0, 2).join(' | ')}`)
    }
    ok(`${usable}/${PAGES.length} pages render content with no WebGL`)
    // the home hero shows the generated graphic
    await page.goto(srv.url + '/en/', { waitUntil: 'load' }); await page.waitForTimeout(800)
    check(await page.evaluate(() => document.querySelector('[data-hero-mode]')?.getAttribute('data-hero-mode') === 'fallback'), 'the home hero is in fallback mode (static graphic)')
    // a Lab experiment explains itself and offers a way on
    await page.goto(srv.url + '/en/lab/liquid-matter/', { waitUntil: 'load' }); await page.waitForTimeout(1200)
    const lab = await page.locator('body').innerText()
    check(lab.length > 300, `a Lab experiment page without WebGL still has ${lab.length} characters of content and controls`)
    await context.close()
    // first visit: intro works without WebGL
    const fresh = await newPage(browser, { seen: false })
    await fresh.page.goto(srv.url + '/hu/', { waitUntil: 'load' }); await fresh.page.waitForTimeout(1500)
    check(await fresh.page.evaluate(() => !!document.querySelector('dialog[open]')), 'the intro opens without WebGL')
    // The dialog opens with the focus already on its entry button, so Enter alone enters (a Tab first would move on to the "do not show again" box).
    check(await fresh.page.evaluate(() => document.activeElement?.tagName === 'BUTTON'), 'the focus is on the entry button when the intro opens')
    await fresh.page.keyboard.press('Enter'); await fresh.page.waitForTimeout(1800)
    check(await fresh.page.evaluate(() => !document.querySelector('dialog[open]')), '...and the entry button still lets the visitor in')
    await browser.close()
  }

  console.log('2. context loss and restore')
  {
    const browser = await launch()
    const { context, page } = await newPage(browser, { seen: true })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)))
    await page.goto(srv.url + '/en/', { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('[data-hero-ready="true"]'), null, { timeout: 25000 }).then(() => ok('the hero scene started (after the first screen settled) and drew a frame'), () => note('the hero scene never became ready'))
    const lose = (sel) => page.evaluate((s) => { const c = document.querySelector(s); const gl = c.getContext('webgl2') || c.getContext('webgl'); const ext = gl.getExtension('WEBGL_lose_context'); ext.loseContext(); window.__ext = ext; return !gl.isContextLost() ? 'not lost' : 'lost' }, sel)
    check(await lose('[data-hero-ready] canvas') === 'lost', 'context lost on the hero canvas')
    await page.waitForTimeout(800)
    check(await page.evaluate(() => document.querySelector('[data-hero-ready]').getAttribute('data-hero-ready') === 'false'), 'the static graphic takes over while the context is lost')
    check(await page.evaluate(() => document.querySelector('h1').getClientRects().length > 0), 'the headline and buttons stay usable')
    await page.evaluate(() => window.__ext.restoreContext())
    await page.waitForTimeout(2500)
    const after = await page.evaluate(() => document.querySelector('[data-hero-ready]').getAttribute('data-hero-ready'))
    console.log(`     after restore: data-hero-ready=${after}`)
    check(errs.length === 0, 'no uncaught errors through loss and restore')

    // Lab experiment
    await page.goto(srv.url + '/en/lab/liquid-matter/', { waitUntil: 'load' })
    await page.waitForSelector('canvas', { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const before = await page.locator('body').innerText()
    const r = await page.evaluate(() => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); const ext = gl.getExtension('WEBGL_lose_context'); ext.loseContext(); window.__ext = ext; return gl.isContextLost() })
    check(r, 'context lost on a Lab experiment')
    await page.waitForTimeout(1500)
    const during = await page.locator('body').innerText()
    check(await page.locator('h1:visible').count() > 0 || during.length > 200, 'the Lab page stays up (no blank screen, no crash)')
    console.log('     message while lost:', JSON.stringify(during.split('\n').filter((l) => /lost|restor|still|paused|stopp|view/i.test(l)).slice(0, 3)))
    await page.evaluate(() => window.__ext.restoreContext()).catch(() => {})
    await page.waitForTimeout(2500)
    const restoredCanvas = await page.evaluate(() => { const c = document.querySelector('canvas'); if (!c) return 'no canvas'; const gl = c.getContext('webgl2') || c.getContext('webgl'); return gl && !gl.isContextLost() ? 'live' : 'lost' })
    console.log(`     after restore: canvas is ${restoredCanvas}`)
    check(errs.length === 0, 'no uncaught errors in the Lab either')
    await context.close(); await browser.close()
  }

  console.log('3. what loads where')
  {
    const browser = await launch()
    const grab = async (url, seen, wait = 6000) => {
      const { context, page } = await newPage(browser, { seen })
      const reqs = []
      page.on('request', (r) => reqs.push(r.url()))
      await page.goto(srv.url + url, { waitUntil: 'load' }); await page.waitForTimeout(wait)
      await context.close()
      return reqs.map((u) => u.split('/').pop())
    }
    const three = (l) => l.some((n) => /^events-/.test(n))
    check(!three(await grab('/en/services/', true, 3000)), 'the shop (services) loads no Three.js')
    check(!three(await grab('/en/about/', true, 3000)), 'About loads no Three.js')
    check(!three(await grab('/en/work/spendly/', true, 3000)), 'a project page loads no Three.js')
    check(!three(await grab('/en/lab/', true, 3500)), 'the Lab overview (previews are 2D) loads no Three.js')
    check(!three(await grab('/en/about/', false, 3000)), 'a first visit that starts on About loads no Three.js (no intro there)')
    const exp = await grab('/en/lab/liquid-matter/', true, 5000)
    check(three(exp) && !exp.some((n) => /^(ParticleScene|SpaceScene|TypeScene|ChromaticScene)/.test(n)), 'one Lab experience loads Three.js and only its own scene, not the other four')
    const home = await grab('/en/', true, 6000)
    check(three(home) && !home.some((n) => /^(LiquidScene|ParticleScene|SpaceScene|TypeScene|ChromaticScene|LabPage|ExperimentFrame)/.test(n)), 'the home page loads the hero scene and none of the Lab experiences')
    await browser.close()
  }

  await srv.close()
  console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nALL OK')
  process.exit(problems.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
