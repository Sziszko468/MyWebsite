#!/usr/bin/env node
/**
 * Advanced motion (PROMPT 38): the journey through what only a real browser can show, on the PRODUCTION build served with its real headers (tools/audit/serve.cjs, the
 * same folder redirects as the website's server). Navigation (arrivals, Back and Forward, a slow page, a modified click, direct addresses, a language switch), the new
 * markers and depth, press and keyboard states, reduced motion (also switched on mid-visit), a touch screen, and live scenes behind the phone menu. Headless Chrome on
 * one machine: not a phone, not Safari or Firefox.
 *
 *   AUDIT_PLAYWRIGHT=<path to playwright> node tools/e2e/motion-journey.cjs [dist] [--only <step words>]        (build first: npm run build)
 */
const path = require('path')
const { start } = require(path.join(__dirname, '..', 'audit', 'serve.cjs'))
const { launch, newPage } = require(path.join(__dirname, '..', 'audit', 'lib.cjs'))

const args = process.argv.slice(2)
const ONLY = args.indexOf('--only') >= 0 ? args[args.indexOf('--only') + 1] : ''
const DIST = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only') || path.join(__dirname, '..', '..', 'dist'))

const results = []
const errors = []
const note = (text) => console.log(`    · ${text}`)
const ok = (condition, message) => {
  if (!condition) throw new Error(message)
}
async function step(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) return
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
  } catch (error) {
    const text = String(error && error.message ? error.message : error).split('\n').filter((line) => line.trim()).slice(0, 4).join(' | ').slice(0, 500)
    results.push({ name, ok: false, error: text })
    console.log(`  ✗ ${name}: ${text}`)
  }
}

/** Counts the animation frames a page really runs, and collects layout shifts, from the first moment. */
const INSTRUMENT = `
  window.__frames = 0
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => raf((time) => { window.__frames += 1; callback(time) })
  window.__shift = 0
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: 'layout-shift', buffered: true })
`

;(async () => {
  const srv = await start({ dir: DIST, port: 4285, fallback: '404', headers: true })
  const browser = await launch()
  const open = async (options = {}) => {
    const made = await newPage(browser, { width: 1440, height: 900, ...options })
    await made.page.addInitScript(INSTRUMENT)
    made.page.on('pageerror', (error) => errors.push(`${made.page.url()} :: ${error.message}`))
    made.page.on('console', (message) => message.type() === 'error' && !/WebGL|GPU stall|Failed to load resource|\/api\/|swiftshader/i.test(message.text()) && errors.push(message.text().slice(0, 160)))
    return made
  }
  const go = async (page, route, ready = 'h1') => {
    await page.goto(`${srv.url}${route}`, { waitUntil: 'load' })
    await page.locator(ready).first().waitFor({ timeout: 40000 })
    await page.waitForTimeout(700)
  }
  const wrapper = (page) =>
    page.evaluate(() => {
      const w = document.querySelector('main > :first-child')
      return { enter: w?.dataset.enter, nav: w?.dataset.nav, opacity: Number(getComputedStyle(w).opacity), animations: w.getAnimations().map((a) => a.animationName || 'transition') }
    })
  const lowestOpacity = async (page, action, ms = 450) => {
    await page.evaluate(() => {
      window.__low = 1
      const tick = () => {
        const w = document.querySelector('main > :first-child')
        if (w) window.__low = Math.min(window.__low, Number(getComputedStyle(w).opacity))
        window.__watch = setTimeout(tick, 8)
      }
      tick()
    })
    await action()
    await page.waitForTimeout(ms)
    return page.evaluate(() => (clearTimeout(window.__watch), window.__low))
  }
  const header = (page, name) => page.locator('header nav a', { hasText: new RegExp(`^${name}$`) }).first()
  const indicatorUnder = (page, name) =>
    page.evaluate((label) => {
      const bar = [...document.querySelectorAll('header nav')].find((n) => n.querySelector('[data-nav-label]'))
      const link = [...bar.querySelectorAll('a')].find((a) => a.textContent.trim() === label)
      const marker = bar.querySelector(':scope > span[aria-hidden="true"]').getBoundingClientRect()
      const word = link.querySelector('[data-nav-label]').getBoundingClientRect()
      return { offset: Math.abs(marker.left - word.left), width: Math.abs(marker.width - word.width), below: marker.top - word.bottom }
    }, name)

  // ── Addresses and arrivals ────────────────────────────────────────────
  await step('a page opened directly changes its own address without replaying its entrance (archive search)', async () => {
    const { context, page } = await open()
    await go(page, '/en/archive/', '[data-archive] article')
    const low = await lowestOpacity(page, () => page.getByRole('searchbox').pressSequentially('re', { delay: 30 }))
    const state = await wrapper(page)
    ok(low === 1 && state.enter === 'none' && state.animations.length === 0, `lowest opacity ${low}, ${JSON.stringify(state)}`)
    await context.close()
  })

  await step('a language switch after a direct load keeps the page, its place and its elements', async () => {
    const { context, page } = await open()
    await go(page, '/en/about/')
    await page.evaluate(() => {
      window.scrollTo({ top: 900, behavior: 'instant' })
      document.querySelector('h1').__kept = true
    })
    await page.waitForTimeout(300)
    const low = await lowestOpacity(page, () => page.evaluate(() => document.querySelector('header a[hreflang="hu"]').click()))
    const after = await page.evaluate(() => ({ url: location.pathname, y: Math.round(scrollY), kept: document.querySelector('h1').__kept === true, lang: document.documentElement.lang }))
    ok(after.url === '/hu/about' && after.lang === 'hu', JSON.stringify(after))
    ok(after.y === 900, `scrolled to ${after.y}`)
    ok(after.kept && low === 1, `page replaced (kept ${after.kept}, lowest opacity ${low})`)
    await context.close()
  })

  await step('a navigation arrives by its page’s character, the first screen follows in order, and Back arrives quietly', async () => {
    const { context, page } = await open()
    await go(page, '/en/')
    // Sampled the moment the new page's wrapper is on the page (the address changes before the page does).
    const arrive = async (go) => {
      await page.evaluate(() => (document.querySelector('main > :first-child').__old = true))
      await go()
      await page.waitForFunction(() => { const w = document.querySelector('main > :first-child'); return w && !w.__old && w.querySelector('h1') }, null, { polling: 'raf', timeout: 15000 })
      const state = await wrapper(page)
      const hero = await page.evaluate(() => [...document.querySelectorAll('main section *')].flatMap((e) => e.getAnimations().map((a) => a.animationName || '')).filter((n) => /hero-follow/.test(n)).length)
      return { ...state, hero }
    }
    const arriving = await arrive(() => header(page, 'About').click())
    ok(arriving.enter === 'fade' && arriving.nav === 'push' && arriving.animations.some((n) => /page-fade/.test(n)), JSON.stringify(arriving))
    ok(arriving.hero >= 1, `no hero choreography (${arriving.hero})`)
    await page.waitForTimeout(900)
    await arrive(() => page.goBack())
    const returning = await arrive(() => page.goForward())
    ok(returning.nav === 'pop' && returning.hero === 0, JSON.stringify(returning))
    const lab = await arrive(() => header(page, 'Lab').click())
    ok(lab.enter === 'wipe', `the Lab does not wipe: ${JSON.stringify(lab)}`)
    await context.close()
  })

  await step('a slow page: the marker answers at once, the old page recedes but still works, and the last click wins', async () => {
    const { context, page } = await open()
    let release
    const gate = new Promise((resolve) => (release = resolve))
    await page.route('**/assets/ServicesPage-*.js', async (route) => {
      await gate
      await route.continue()
    })
    await go(page, '/en/about/')
    // Clicked and read inside the page, so that "at once" means two frames after the click and not whenever the driver gets back.
    const at80 = await page.evaluate(async () => {
      const bar = [...document.querySelectorAll('header nav')].find((n) => n.querySelector('[data-nav-label]'))
      const t0 = performance.now()
      ;[...bar.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Services').click()
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return {
        ms: Math.round(performance.now() - t0),
        pending: [...bar.querySelectorAll('a[data-pending]')].map((a) => a.textContent.trim()),
        current: [...bar.querySelectorAll('a[aria-current="page"]')].map((a) => a.textContent.trim()),
        loading: document.documentElement.hasAttribute('data-route-loading'),
      }
    })
    ok(at80.pending.join() === 'Services' && at80.current.join() === 'About' && !at80.loading && at80.ms < 140, JSON.stringify(at80))
    note(`marked ${at80.ms} ms after the click`)
    await page.waitForTimeout(450)
    const moved = await indicatorUnder(page, 'Services')
    ok(moved.offset <= 2 && moved.width <= 2, `the marker is not under Services: ${JSON.stringify(moved)}`)
    const waiting = await page.evaluate(() => ({ loading: document.documentElement.hasAttribute('data-route-loading'), opacity: Number(getComputedStyle(document.querySelector('main > :first-child')).opacity), h1: document.querySelector('main h1')?.textContent }))
    ok(waiting.loading && Math.abs(waiting.opacity - 0.65) < 0.02 && waiting.h1, JSON.stringify(waiting))
    note(`while waiting: opacity ${waiting.opacity}, the old page still on screen`)
    // The old page still answers: a click on another link wins over the one being waited for.
    await header(page, 'Work').click()
    await page.waitForURL('**/en/work', { timeout: 15000 })
    release()
    await page.waitForTimeout(900)
    const end = await page.evaluate(() => ({ url: location.pathname, pending: document.querySelectorAll('header a[data-pending]').length, loading: document.documentElement.hasAttribute('data-route-loading'), opacity: Number(getComputedStyle(document.querySelector('main > :first-child')).opacity) }))
    ok(end.url === '/en/work' && end.pending === 0 && !end.loading && end.opacity === 1, JSON.stringify(end))
    const settled = await indicatorUnder(page, 'Work')
    ok(settled.offset <= 2 && settled.below >= 0 && settled.below < 12, JSON.stringify(settled))
    await context.close()
  })

  await step('the keyboard is never held during a wait: Tab moves on and Enter follows', async () => {
    const { context, page } = await open()
    await page.route('**/assets/AboutPage-*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await go(page, '/en/')
    await header(page, 'About').focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    await page.keyboard.press('Tab')
    const focus = await page.evaluate(() => document.activeElement?.textContent?.trim())
    ok(focus && focus !== 'About', `focus stayed on "${focus}"`)
    await header(page, 'Contact').focus()
    await page.keyboard.press('Enter')
    await page.waitForURL('**/en/contact', { timeout: 15000 })
    await context.close()
  })

  await step('a click that opens elsewhere leaves this page and its marker alone', async () => {
    const { context, page } = await open()
    await go(page, '/en/about/')
    const [other] = await Promise.all([context.waitForEvent('page', { timeout: 5000 }).catch(() => null), header(page, 'Contact').click({ modifiers: ['Control'] })])
    await page.waitForTimeout(300)
    ok((await page.locator('header a[data-pending]').count()) === 0 && new URL(page.url()).pathname === '/en/about/', page.url())
    await other?.close()
    await context.close()
  })

  await step('Back and Forward return to the place; a deep link and a reload open it directly', async () => {
    const { context, page } = await open()
    await go(page, '/en/')
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }))
    await page.waitForTimeout(300)
    await page.evaluate(() => document.querySelector('footer a[href="/en/about"]').click())
    await page.waitForURL('**/en/about')
    await page.waitForTimeout(500)
    ok((await page.evaluate(() => scrollY)) === 0, 'a new page did not start at the top')
    await page.goBack()
    await page.waitForTimeout(900)
    const y = await page.evaluate(() => Math.round(scrollY))
    ok(Math.abs(y - 1200) <= 4, `came back to ${y}`)
    await go(page, '/en/archive/#entry-lab-liquid-matter', '[data-linked]')
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-linked]').waitFor({ timeout: 30000 })
    await context.close()
  })

  await step('a page opened by its address in a used tab starts at the top; a reload and the browser’s Back return to the place', async () => {
    const { context, page } = await open()
    const y = () => page.evaluate(() => Math.round(scrollY))
    await go(page, '/en/')
    await page.evaluate(() => window.scrollTo({ top: 3000, behavior: 'instant' }))
    await page.waitForTimeout(400)
    await go(page, '/en/about/')
    ok((await y()) === 0, `a typed address opened at ${await y()}`)
    await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }))
    await page.waitForTimeout(400)
    await page.reload({ waitUntil: 'load' })
    await page.locator('h1').waitFor()
    await page.waitForTimeout(1500)
    ok(Math.abs((await y()) - 1500) <= 4, `after a reload at ${await y()}`)
    await go(page, '/en/services/')
    ok((await y()) === 0, `another typed address opened at ${await y()}`)
    await page.goBack({ waitUntil: 'load' })
    await page.locator('h1').waitFor()
    await page.waitForTimeout(1500)
    ok(new URL(page.url()).pathname === '/en/about/' && Math.abs((await y()) - 1500) <= 4, `Back to ${page.url()} at ${await y()}`)
    await context.close()
  })

  // ── Where each history entry was left (PROMPT 38.1) ───────────────────
  // Stored positions are whole pixels and a window can sit between two, so "the same place" is within two pixels. Every position asked for is also checked to be
  // one the page can really scroll to: on a page too short for it, every comparison would pass with the end of the page.
  const NEAR = 2
  const place = (page) => page.evaluate(() => Math.round(window.scrollY))
  /** The address changes before the next page is drawn; its title changes with it. */
  const arrive = async (page, was) => {
    await page.waitForFunction((title) => document.title !== title, was, { timeout: 30000 })
    await page.waitForTimeout(600)
  }
  /** `how`: a footer link's address, or a step through history. */
  const travel = async (page, how, top) => {
    const was = await page.title()
    const at = await page.evaluate(
      ([to, y]) => {
        if (y !== null) window.scrollTo({ top: y, behavior: 'instant' })
        const read = Math.round(window.scrollY)
        if (typeof to === 'number') history.go(to)
        else document.querySelector(`footer a[href="${to}"]`).click()
        return read
      },
      [how, top ?? null],
    )
    await arrive(page, was)
    return at
  }
  /** Scrolls and leaves in ONE task: no frame, and not even the scroll event, comes in between. */
  const leaveAt = async (page, top, how) => {
    const at = await travel(page, how, top)
    ok(Math.abs(at - top) <= 1, `the page cannot be scrolled to ${top}: ${at}`)
    return at
  }
  const settleAt = async (page, top) => {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top)
    await page.waitForTimeout(350)
    ok(Math.abs((await place(page)) - top) <= 1, `the page cannot be scrolled to ${top}: ${await place(page)}`)
  }
  const returnedTo = async (page, wanted, where) => ok(Math.abs((await place(page)) - wanted) <= NEAR, `${where}: at ${await place(page)}, left at ${wanted}`)

  await step('a scroll and a navigation in the same moment: Back returns to the latest place, after a link and after Forward', async () => {
    const { context, page } = await open()
    await go(page, '/en/about/')
    // The next pages' code is loaded first, so the navigation that follows is drawn at once, before the browser has announced the scroll.
    await travel(page, '/en/services')
    await travel(page, '/en/work')
    await travel(page, -1)
    await settleAt(page, 600)
    const first = await leaveAt(page, 1400, '/en/work')
    await travel(page, -1)
    await returnedTo(page, first, 'Back after a link')
    await settleAt(page, 600)
    const second = await leaveAt(page, 1100, 1)
    await travel(page, -1)
    await returnedTo(page, second, 'Back after Forward')
    await context.close()
  })

  await step('rapid navigation: every history entry keeps its own latest place and none are exchanged', async () => {
    const { context, page } = await open()
    await go(page, '/en/about/')
    await travel(page, '/en/services')
    await travel(page, '/en/work')
    await travel(page, -2)
    const left = new Map()
    const hops = [
      [500, '/en/services'],
      [1400, '/en/work'],
      [900, -1],
      [1200, -1],
      [700, 1],
      [1100, 1],
      [800, -1],
      [300, -1],
      [600, 1],
      [1000, 1],
      [400, -2],
      [200, 2],
    ]
    let returns = 0
    for (const [top, how] of hops) {
      const from = new URL(page.url()).pathname.replace(/\/$/, '')
      left.set(from, await leaveAt(page, top, how))
      const to = new URL(page.url()).pathname.replace(/\/$/, '')
      ok(to !== from, `the hop ${how} stayed on ${from}`)
      // A link makes a new entry, which starts at the top; a step through history returns to what was left there.
      if (typeof how === 'string') ok((await place(page)) === 0, `a new page opened at ${await place(page)}`)
      else {
        await returnedTo(page, left.get(to), `${from} → ${to} by history.go(${how})`)
        returns += 1
      }
    }
    ok(returns === 10, `only ${returns} returns were compared`)
    await context.close()
  })

  await step('leaving a place that is still being restored does not write over it', async () => {
    const { context, page } = await open()
    await go(page, '/en/about/')
    await travel(page, '/en/services')
    await settleAt(page, 1400)
    await travel(page, '/en/work')
    // Every page is made short, as one that is still being drawn is, with some room left to scroll.
    await page.evaluate(() => {
      const main = document.querySelector('main')
      main.style.maxHeight = '600px'
      main.style.overflow = 'hidden'
    })
    await settleAt(page, 300)
    await page.evaluate(() => history.back())
    await page.waitForFunction(() => location.pathname === '/en/services')
    await page.waitForTimeout(150)
    const was = await page.title()
    const waiting = await page.evaluate(() => {
      const state = { y: window.scrollY, room: document.documentElement.scrollHeight - window.innerHeight }
      history.forward()
      return state
    })
    ok(waiting.y === 0 && waiting.room < 1400, `the restore was not waiting when it was left: ${JSON.stringify(waiting)}`)
    await arrive(page, was)
    await page.evaluate(() => document.querySelector('main').removeAttribute('style'))
    await travel(page, -1)
    await returnedTo(page, 1400, 'Back to the page left while it waited')
    await context.close()
  })

  await step('a plain #link leaves the saved place of the entry before it alone, however the link is followed', async () => {
    // Followed from a script, Chrome has already jumped when the page frame hears of the link (with reduced motion the jump is instant): the window then shows the
    // target, not the place being left, and must not be read. After a real click Chrome jumps later; both ways are checked.
    for (const way of ['a real click', 'a script']) {
      const { context, page } = await open({ reduced: true })
      await go(page, '/en/lab/', '[data-design-tool]')
      const was = await page.title()
      await page.evaluate(() => document.querySelector('[data-design-tool] a').click())
      await arrive(page, was)
      await page.locator('#color').waitFor({ timeout: 30000 })
      const key = await page.evaluate(() => history.state.key)
      await settleAt(page, 700)
      if (way === 'a script') await page.evaluate(() => document.querySelector('a[href="#motion"]').click())
      else await page.locator('a[href="#motion"]').first().click()
      await page.waitForFunction(() => location.hash === '#motion')
      await page.waitForTimeout(600)
      const after = await page.evaluate((k) => ({ y: Math.round(window.scrollY), saved: JSON.parse(sessionStorage.getItem('cc:scroll-positions') || '{}')[k] }), key)
      ok(after.y > 1400, `${way}: the link did not jump: ${after.y}`)
      ok(Math.abs(after.saved - 700) <= NEAR, `${way}: the entry left by the link is stored at ${after.saved}, not 700`)
      await travel(page, '/en/about')
      await travel(page, -2)
      await returnedTo(page, 700, `${way}: two steps Back to the entry before the link`)
      await context.close()
    }
  })

  await step('with session storage refusing, navigation works and Back still returns to the place', async () => {
    const { context, page } = await open()
    await page.addInitScript(() => {
      for (const name of ['getItem', 'setItem']) {
        const real = Storage.prototype[name]
        Storage.prototype[name] = function (...args) {
          if (this === window.sessionStorage) {
            window.__refused = (window.__refused || 0) + 1
            throw new DOMException('refused by the journey', 'SecurityError')
          }
          return real.apply(this, args)
        }
      }
    })
    await go(page, '/en/about/')
    await travel(page, '/en/services')
    const at = await leaveAt(page, 1400, '/en/work')
    await travel(page, -1)
    await returnedTo(page, at, 'Back without storage')
    ok((await page.evaluate(() => window.__refused)) > 0, 'the storage was never asked, so nothing was proved')
    await context.close()
  })

  // ── Markers, depth, states ────────────────────────────────────────────
  await step('the language marker sits behind the current language and glides to the chosen one', async () => {
    const { context, page } = await open()
    await go(page, '/en/about/')
    const behind = (code) =>
      page.evaluate((lang) => {
        const nav = document.querySelector('header a[hreflang="en"]').closest('nav')
        const marker = nav.querySelector(':scope > span[aria-hidden="true"]').getBoundingClientRect()
        const link = nav.querySelector(`a[hreflang="${lang}"]`)
        const box = link.getBoundingClientRect()
        return { dx: Math.abs(marker.left - box.left), dy: Math.abs(marker.top - box.top), dw: Math.abs(marker.width - box.width), current: link.getAttribute('aria-current'), colour: getComputedStyle(link).color, background: getComputedStyle(link).backgroundColor }
      }, code)
    const first = await behind('en')
    ok(first.dx <= 1 && first.dy <= 1 && first.dw <= 1 && first.current === 'true', JSON.stringify(first))
    await page.evaluate(() => document.querySelector('header a[hreflang="nl"]').click())
    await page.waitForTimeout(90)
    const during = await behind('nl')
    ok(during.dx > 1, `no glide: already there after 90 ms (${during.dx})`)
    await page.waitForTimeout(500)
    const after = await behind('nl')
    ok(after.dx <= 1 && after.dw <= 1 && after.current === 'true' && /rgba\(0, 0, 0, 0\)|transparent/.test(after.background), JSON.stringify(after))
    await context.close()
  })

  await step('a section’s stripe draws in when its heading arrives', async () => {
    const { context, page } = await open()
    await go(page, '/en/')
    const hidden = await page.evaluate(() => {
      const holder = [...document.querySelectorAll('[data-reveal="hidden"]')].find((e) => e.querySelector('header h2'))
      if (!holder) return null
      holder.id ||= 'stripe-probe'
      const index = holder.querySelector('header > span[aria-hidden="true"]')
      return { id: holder.id, transform: index && getComputedStyle(index, '::after').transform }
    })
    ok(hidden && /matrix\(0,/.test(hidden.transform || ''), `no hidden heading with a drawn-in stripe: ${JSON.stringify(hidden)}`)
    await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center', behavior: 'instant' }), hidden.id)
    await page.waitForTimeout(1400)
    const shown = await page.evaluate((id) => getComputedStyle(document.getElementById(id).querySelector('header > span[aria-hidden="true"]'), '::after').transform, hidden.id)
    ok(shown === 'none' || /matrix\(1,/.test(shown), `stripe after: ${shown}`)
    await context.close()
  })

  await step('the first screen’s depth starts at rest and falls behind as it leaves, the lines further than the glow', async () => {
    const { context, page } = await open()
    await go(page, '/en/about/')
    const read = () =>
      page.evaluate(() => {
        const hero = document.querySelector('main section')
        const field = hero.firstElementChild
        const [glow, lines] = [field.children[0], field.children[1]]
        const y = (e) => Number((getComputedStyle(e).translate.split(' ')[1] || '0').replace('px', '')) || 0
        return { exit: field.style.getPropertyValue('--sp-exit'), glow: y(glow), lines: y(lines) }
      })
    const rest = await read()
    ok(rest.glow === 0 && rest.lines === 0, `not at rest: ${JSON.stringify(rest)}`)
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await page.waitForTimeout(250)
    const moved = await read()
    ok(Number(moved.exit) > 0 && moved.lines > moved.glow && moved.glow > 0, JSON.stringify(moved))
    note(`at 300 px: ${JSON.stringify(moved)}`)
    await context.close()
  })

  await step('a press settles a control and releases it; a keyboard on a card gets what a mouse gets', async () => {
    const { context, page } = await open()
    await go(page, '/en/')
    const button = page.locator('main a[href="#work"]').first()
    await button.hover()
    await page.waitForTimeout(300)
    await page.mouse.down()
    await page.waitForTimeout(250)
    const pressed = await button.evaluate((e) => getComputedStyle(e).transform)
    await page.mouse.move(5, 500)
    await page.mouse.up()
    await page.waitForTimeout(300)
    const released = await button.evaluate((e) => getComputedStyle(e).transform)
    ok(/matrix\(0\.985,/.test(pressed) && (released === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(released)), `pressed ${pressed}, released ${released}`)
    await go(page, '/en/work/', 'article h2, article h3')
    await page.locator('body').press('Tab')
    let card = null
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab')
      card = await page.evaluate(() => {
        const a = document.activeElement
        const article = a?.closest('article')
        return article && a.matches('h2 a, h3 a') ? true : false
      })
      if (card) break
    }
    ok(card, 'no project card link reached by Tab')
    await page.waitForTimeout(400)
    const lifted = await page.evaluate(() => getComputedStyle(document.activeElement.closest('article')).translate)
    ok(/0px -2px/.test(lifted), `keyboard card translate ${lifted}`)
    await context.close()
  })

  await step('the Command Center’s doors carry a label for a mouse', async () => {
    const { context, page } = await open()
    await go(page, '/en/command-center/', '[data-sector]')
    await page.locator('[data-sector="archive"] a').hover()
    await page.mouse.move(400, 500)
    await page.locator('[data-sector="archive"] a').hover()
    await page.waitForTimeout(250)
    const label = await page.evaluate(() => [...document.querySelectorAll('div[aria-hidden="true"][data-visible]')].map((e) => e.textContent))
    ok(label.includes('Open'), `cursor label: ${JSON.stringify(label)}`)
    await context.close()
  })

  // ── Reduced motion ────────────────────────────────────────────────────
  await step('reduced motion: navigations, depth, presses, labels and markers do not travel', async () => {
    const { context, page } = await open({ reduced: true })
    await go(page, '/en/')
    await header(page, 'About').click()
    await page.waitForURL('**/en/about')
    await page.waitForTimeout(60)
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getComputedTiming().duration ?? 0) > 1).map((a) => a.animationName || a.transitionProperty))
    ok(running.length === 0, `running: ${running}`)
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await page.waitForTimeout(250)
    const state = await page.evaluate(() => {
      const field = document.querySelector('main section').firstElementChild
      const marker = [...document.querySelectorAll('header nav')].find((n) => n.querySelector('[data-nav-label]')).querySelector(':scope > span[aria-hidden="true"]')
      return { exit: field.style.getPropertyValue('--sp-exit'), lines: getComputedStyle(field.children[1]).translate, marker: getComputedStyle(marker).transitionDuration, press: getComputedStyle(document.documentElement).getPropertyValue('--motion-press').trim() }
    })
    ok(state.exit === '' && /^(none|0px( 0px)?)$/.test(state.lines) && state.press === '1' && state.marker.split(',').every((d) => parseFloat(d) < 0.001), JSON.stringify(state))
    await go(page, '/en/command-center/', '[data-sector]')
    await page.locator('[data-sector="archive"] a').hover()
    await page.waitForTimeout(250)
    ok((await page.locator('div[aria-hidden="true"][data-visible]').count()) === 0, 'a cursor label under reduced motion')
    ok((await page.locator('[data-sector="archive"] a').evaluate((e) => getComputedStyle(e).transform)) === 'matrix(1, 0, 0, 1, 0, 0)' || (await page.locator('[data-sector="archive"] a').evaluate((e) => getComputedStyle(e).transform)) === 'none', 'a sector lifts')
    await context.close()
  })

  await step('reduced motion switched on mid-visit stops what moves, and off again brings it back', async () => {
    const { context, page } = await open()
    await go(page, '/en/command-center/', '[data-sector]')
    const label = () => page.locator('div[aria-hidden="true"][data-visible]').count()
    await page.locator('[data-sector="archive"] a').hover()
    await page.mouse.move(420, 520)
    await page.locator('[data-sector="archive"] a').hover()
    await page.waitForTimeout(250)
    ok((await label()) === 1, 'no label before')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.mouse.move(430, 530)
    await page.waitForTimeout(250)
    ok((await label()) === 0, 'the label stayed after the setting changed')
    await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }))
    await page.waitForTimeout(250)
    ok((await page.evaluate(() => document.querySelector('main section').firstElementChild.style.getPropertyValue('--sp-exit'))) === '', 'depth still written')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.evaluate(() => window.scrollTo({ top: 260, behavior: 'instant' }))
    await page.waitForTimeout(300)
    ok(Number(await page.evaluate(() => document.querySelector('main section').firstElementChild.style.getPropertyValue('--sp-exit'))) > 0, 'depth did not come back')
    await context.close()
  })

  // ── Touch and live scenes ─────────────────────────────────────────────
  await step('a touch screen: nothing lifts or follows a finger; a tap navigates', async () => {
    const { context, page } = await open({ width: 390, height: 844, mobile: true })
    await go(page, '/en/command-center/', '[data-sector]')
    await page.locator('[data-sector="people"] a').scrollIntoViewIfNeeded()
    const before = await page.locator('[data-sector="people"] a').evaluate((e) => getComputedStyle(e).transform)
    await page.locator('[data-sector="people"] a').tap()
    await page.waitForTimeout(150)
    ok((await page.locator('div[aria-hidden="true"][data-visible]').count()) === 0, 'a cursor label on touch')
    ok(before === 'none' || before === 'matrix(1, 0, 0, 1, 0, 0)', `a sector sits moved: ${before}`)
    await go(page, '/en/work/', 'article h2, article h3')
    await page.locator('article h2 a, article h3 a').first().tap()
    await page.waitForURL(/\/en\/work\/[a-z-]+$/, { timeout: 15000 })
    await context.close()
  })

  for (const [name, route] of [['home hero', '/en/'], ['Lab overview', '/en/lab/']]) {
    await step(`a live scene behind the phone menu stops drawing and starts again (${name})`, async () => {
      const { context, page } = await open({ width: 390, height: 844, mobile: true })
      await go(page, route)
      await page.waitForTimeout(2500)
      const perSecond = async () => {
        const before = await page.evaluate(() => window.__frames)
        await page.waitForTimeout(1000)
        return (await page.evaluate(() => window.__frames)) - before
      }
      const running = await perSecond()
      ok(running >= 15, `the scene was not drawing before (${running} frames/s)`)
      await page.locator('header button[aria-haspopup="dialog"]').click()
      await page.waitForTimeout(700)
      const covered = await perSecond()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(900)
      const back = await perSecond()
      note(`frames per second: before ${running}, menu open ${covered}, closed ${back}`)
      ok(covered <= 3, `still drawing behind the menu: ${covered} frames/s`)
      ok(back >= 15, `did not start again: ${back} frames/s`)
      await context.close()
    })
  }

  await step('no layout shift from the pages’ motion, loading and scrolling through', async () => {
    const { context, page } = await open()
    const shifts = []
    for (const route of ['/en/', '/en/about/', '/en/work/', '/en/services/', '/en/command-center/', '/en/work/spendly/']) {
      await go(page, route)
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      for (let y = 0; y < height; y += 700) {
        await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y)
        await page.waitForTimeout(60)
      }
      await page.waitForTimeout(800)
      shifts.push([route, Math.round((await page.evaluate(() => window.__shift)) * 1000) / 1000])
    }
    note(`cumulative layout shift: ${shifts.map(([r, s]) => `${r} ${s}`).join(', ')}`)
    ok(shifts.every(([, s]) => s <= 0.02), JSON.stringify(shifts))
    await context.close()
  })

  const quiet = 'no page error and no console error during the whole journey'
  results.push(errors.length ? { name: quiet, ok: false, error: errors.slice(0, 4).join(' || ') } : { name: quiet, ok: true })
  console.log(`  ${errors.length ? '✗' : '✓'} ${quiet}${errors.length ? `: ${errors.slice(0, 4).join(' || ')}` : ''}`)

  await browser.close()
  srv.server.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length} / ${results.length} steps passed`)
  for (const f of failed) console.log(`  FAILED: ${f.name}\n          ${f.error}`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
