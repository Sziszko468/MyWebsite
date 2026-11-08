// The administration, in a real Chrome: every screen x viewport x theme x language, for layout and accessibility.
//
//   node tools/audit/audit-admin.cjs --base=http://127.0.0.1:8788 --email=owner@site.test --password=... \
//        [--sizes=1920x1080,1440x900,...] [--themes=dark,light] [--langs=hu,en] [--out=report.json]
//
// It needs a running backend that serves the built administration (`npm run build`, then the server with STATIC_DIR set;
// see docs/admin/README.md) and an administrator account in a THROW-AWAY database (the run opens and cancels the delete
// dialog but never confirms it; do not point it at real data). It checks, per screen:
//   - layout: sideways scrolling, elements outside the viewport, controls under 24x24 px (WCAG 2.5.8), controls with no
//     accessible name, exactly one h1;
//   - accessibility: axe-core (WCAG 2.0/2.1/2.2 A and AA, best practice);
//   - open states: the delete confirmation (focus on the safe button, Tab stays inside, Escape cancels and returns
//     focus), the phone's "More" sheet (Escape closes it and returns focus), the collapsed sidebar, and on a tablet the
//     sidebar as a layer (focus moves in; Escape and its close button give focus back to the menu button; choosing a
//     place leaves focus on the new page's title).
// Exit code 1 when anything is found. The 401 the sign-in screen gets while asking "am I signed in?" is expected and
// not counted.
const { launch, axeRun } = require('./lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8788').replace(/\/$/, '')
const EMAIL = arg('email', process.env.ADMIN_EMAIL || '')
const PASSWORD = arg('password', process.env.ADMIN_PASSWORD || '')
const SIZES = arg('sizes', '1920x1080,1440x900,1366x768,1024x768,768x1024,430x932,390x844,360x800,320x640').split(',').map((s) => s.split('x').map(Number))
const THEMES = arg('themes', 'dark,light').split(',')
const LANGS = arg('langs', 'hu,en').split(',')
const OUT = arg('out', '')
const ONLY = arg('only', '').split(',').filter(Boolean)
if (!EMAIL || !PASSWORD) {
  console.error('Give --email and --password (or ADMIN_EMAIL and ADMIN_PASSWORD) of an administrator in a throw-away database.')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LABELS = {
  hu: { remove: /Üzenet törlése/, collapse: /A menü összecsukása/, more: /Továbbiak/ },
  en: { remove: /Delete this inquiry/, collapse: /Collapse the menu/, more: /^More$/ },
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let i = 0; i < 40; i += 1) {
    if (!(await page.$('[aria-busy="true"]'))) break
    await sleep(100)
  }
  await sleep(200)
}

/** Layout and structure of the screen as it is now. */
function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const offenders = []
    const small = []
    const unnamed = []
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      let scrolls = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) {
          scrolls = true
          break
        }
      }
      if (!scrolls && box.right > vw + 1) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}:${Math.round(box.right)}`)
      if (el.matches('a[href],button,select,input:not([type=hidden]),textarea,summary,[role=tab],[role=switch]')) {
        if (box.height < 24 || box.width < 24) small.push(`${el.tagName.toLowerCase()}:${Math.round(box.width)}x${Math.round(box.height)}:${(el.textContent || '').trim().slice(0, 14)}`)
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim()
        if (!name && !(el.labels && el.labels.length) && !el.getAttribute('aria-labelledby')) unnamed.push(el.outerHTML.slice(0, 80))
      }
    }
    return {
      overflow: document.documentElement.scrollWidth - vw,
      offenders: [...new Set(offenders)].slice(0, 4),
      small: [...new Set(small)].slice(0, 4),
      unnamed: unnamed.slice(0, 3),
      h1: document.querySelectorAll('h1').length,
    }
  })
}

;(async () => {
  const browser = await launch()
  const findings = []
  let checked = 0

  // Sign in ONCE (the sign-in is rate limited, and a matrix is dozens of contexts) and give every context that session.
  const boot = await browser.newContext({ bypassCSP: true, locale: 'en-GB' })
  const bootPage = await boot.newPage()
  await bootPage.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
  await settle(bootPage)
  await bootPage.fill('input[type=email]', EMAIL)
  await bootPage.fill('input[type=password]', PASSWORD)
  await bootPage.click('button[type=submit]')
  await bootPage.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 8000 }).catch(() => {})
  const state = await boot.storageState()
  await boot.close()
  if (!state.cookies.length) throw new Error('The sign-in did not work (wrong e-mail or password, or the sign-in rate limit): no session cookie.')

  for (const lang of LANGS) {
    for (const scheme of THEMES) {
      for (const [width, height] of SIZES) {
        const phone = width < 500
        const options = { viewport: { width, height }, colorScheme: scheme, bypassCSP: true, isMobile: phone, hasTouch: phone, locale: lang === 'hu' ? 'hu-HU' : 'en-GB' }
        const tag = `${lang} ${scheme} ${width}x${height}`

        // The sign-in screen, signed out.
        const anonymous = await browser.newContext(options)
        const login = await anonymous.newPage()
        await login.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
        await settle(login)
        checked += 1
        for (const v of await axeRun(login)) findings.push({ view: `${tag} login`, kind: 'axe', id: v.id, impact: v.impact, count: v.count, nodes: v.nodes })
        await anonymous.close()

        const context = await browser.newContext({ ...options, storageState: state })
        const page = await context.newPage()
        const errors = []
        page.on('console', (m) => m.type() === 'error' && !/status of 401/.test(m.text()) && errors.push(m.text().slice(0, 160)))
        page.on('pageerror', (e) => errors.push(`pageerror ${String(e).slice(0, 160)}`))
        const check = async (name, { axe = true, layout = true } = {}) => {
          checked += 1
          if (layout) {
            const m = await measure(page)
            if (m.overflow > 0 || m.offenders.length || m.small.length || m.unnamed.length || m.h1 !== 1) findings.push({ view: `${tag} ${name}`, kind: 'layout', ...m })
          }
          if (axe) for (const v of await axeRun(page)) findings.push({ view: `${tag} ${name}`, kind: 'axe', id: v.id, impact: v.impact, count: v.count, nodes: v.nodes })
        }
        await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
        await settle(page)

        const api = (p) => page.evaluate(async (p) => (await (await fetch(p)).json()).data, p)
        const inquiries = await api('/api/admin/inquiries')
        if (!Array.isArray(inquiries)) throw new Error(`Not signed in on ${tag}: the session was refused.`)
        const inquiry = inquiries[0]?.id
        const quotes = await api('/api/admin/quote-requests')
        const quote = quotes[0]?.id
        // A FULL EXPERIENCE request (PROMPT 09.1) has a brief of its own on the detail screen; the run submits one first (see README).
        const experience = quotes.find((item) => item.kind === 'full_experience')?.id
        // The portfolio's content management (PROMPT 13.1): the list, a new project, the settings, the editor of the first project, the wording.
        const project = (await api('/api/admin/projects'))?.projects?.[0]?.id
        const screens = ['/admin', '/admin/projects', '/admin/projects/new', '/admin/projects/settings', project && `/admin/projects/${project}`, '/admin/texts', '/admin/inquiries', inquiry && `/admin/inquiries/${inquiry}`, '/admin/quotes', quote && `/admin/quotes/${quote}`, experience && experience !== quote && `/admin/quotes/${experience}`, '/admin/comparison', '/admin/full-experience', '/admin/services', '/admin/content', '/admin/translations', '/admin/notifications', '/admin/ai', '/admin/ai?tab=settings', '/admin/ai?tab=knowledge', '/admin/settings', '/admin/settings?tab=security', '/admin/not-a-screen'].filter(Boolean).filter((screen) => !ONLY.length || ONLY.some((prefix) => screen.startsWith(prefix)))
        for (const path of screens) {
          await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
          await settle(page)
          await check(path.replace(inquiry, ':inquiry').replace(experience || ':none', ':experience').replace(quote, ':quote').replace(new RegExp(`/projects/${project}$`), '/projects/:project'))
        }

        // The project editor: every tab, in each language of the language bar; the picture chooser open; a wording row open.
        if (project) {
          await page.goto(`${BASE}/admin/projects/${project}`, { waitUntil: 'domcontentloaded' })
          await settle(page)
          for (const tab of ['general', 'images', 'descriptions', 'technical', 'sections', 'links', 'publication']) {
            await page.locator(`#project-tab-${tab}`).click()
            await sleep(200)
            await check(`project-edit:${tab}`)
          }
          await page.locator('#project-tab-images').click()
          await sleep(200)
          const choose = page.locator('#project-panel-images button', { hasText: /Choose or upload|Replace|Kép kiválasztása|Csere|Kép/ }).first()
          if (await choose.count()) {
            await choose.click()
            await sleep(500)
            await check('media-picker', { layout: false })
            await page.keyboard.press('Escape')
            await sleep(300)
            const closed = await page.evaluate(() => ![...document.querySelectorAll('dialog')].some((d) => d.open))
            if (!closed) findings.push({ view: `${tag} media-picker`, kind: 'focus', note: 'Escape did not close the picture chooser' })
          }
          await page.goto(`${BASE}/admin/texts`, { waitUntil: 'domcontentloaded' })
          await settle(page)
          const row = page.locator('details > summary').first()
          if (await row.count()) {
            await row.click()
            await sleep(200)
            await check('texts-row-open')
          }
        }

        // The tier comparison (PROMPT 09.1): the first feature open, with its three-language fields and a level for every package.
        await page.goto(`${BASE}/admin/comparison`, { waitUntil: 'domcontentloaded' })
        await settle(page)
        const feature = page.locator('details > summary').first()
        if (await feature.count()) {
          await feature.click()
          await sleep(200)
          await check('comparison-feature-open')
        }

        // The delete confirmation: opens on the safe button, keeps Tab inside, Escape cancels and gives focus back.
        if (inquiry) {
          await page.goto(`${BASE}/admin/inquiries/${inquiry}`, { waitUntil: 'domcontentloaded' })
          await settle(page)
          const remove = page.locator('button', { hasText: LABELS[lang].remove }).first()
          if (await remove.count()) {
            await remove.click()
            await sleep(300)
            await check('confirm-dialog', { layout: false })
            const state = await page.evaluate(() => {
              const dialog = [...document.querySelectorAll('dialog')].find((d) => d.open)
              return { open: Boolean(dialog), inside: Boolean(dialog && dialog.contains(document.activeElement)), safeFirst: dialog ? document.activeElement === dialog.querySelector('button') : false }
            })
            // A modal dialog makes the page behind it inert: Tab goes round its own controls and then out to the browser's
            // own interface (the page's active element is then the body), but never to the page behind.
            let trapped = true
            for (let i = 0; i < 5; i += 1) {
              await page.keyboard.press('Tab')
              const where = await page.evaluate(() => {
                const dialog = [...document.querySelectorAll('dialog')].find((d) => d.open)
                const active = document.activeElement
                return Boolean(dialog && (dialog.contains(active) || active === document.body || active === document.documentElement))
              })
              if (!where) trapped = false
            }
            await page.keyboard.press('Escape')
            await sleep(200)
            const after = await page.evaluate(() => ({ closed: ![...document.querySelectorAll('dialog')].some((d) => d.open), onTrigger: /Üzenet törlése|Delete this inquiry/.test(document.activeElement?.textContent || '') }))
            const still = await page.evaluate(async (id) => (await fetch(`/api/admin/inquiries/${id}`)).status, inquiry)
            if (!state.open || !state.inside || !state.safeFirst || !trapped || !after.closed || !after.onTrigger || still !== 200) findings.push({ view: `${tag} confirm-dialog`, kind: 'focus', state, trapped, after, still })
          }
        }
        if (phone) {
          await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
          await settle(page)
          await page.locator('nav button', { hasText: LABELS[lang].more }).click()
          await sleep(300)
          await check('more-sheet', { layout: false })
          await page.keyboard.press('Escape')
          await sleep(200)
          const back = await page.evaluate(() => ({ closed: ![...document.querySelectorAll('dialog')].some((d) => d.open), onTrigger: document.activeElement?.tagName === 'BUTTON' && document.activeElement.closest('nav') !== null }))
          if (!back.closed || !back.onTrigger) findings.push({ view: `${tag} more-sheet`, kind: 'focus', back })
        } else if (width >= 768 && width < 1024) {
          // A tablet: the rail opens as a layer over the page. Focus moves into it, Escape and its close button give focus
          // back to the menu button, and choosing a place leaves focus on the new page's title.
          await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
          await settle(page)
          const toggle = page.locator('#admin-menu-toggle')
          const snap = () => page.evaluate(() => ({ expanded: document.querySelector('#admin-menu-toggle')?.getAttribute('aria-expanded'), active: document.activeElement?.id || '', inSidebar: Boolean(document.activeElement?.closest('#admin-sidebar')) }))
          await toggle.click()
          await sleep(400)
          const opened = await snap()
          await check('tablet-menu-open')
          await page.keyboard.press('Escape')
          await sleep(300)
          const escaped = await snap()
          await toggle.click()
          await sleep(300)
          await page.locator('#admin-sidebar button[aria-label]').first().click()
          await sleep(300)
          const closed = await snap()
          await toggle.click()
          await sleep(300)
          await page.locator('#admin-sidebar a').nth(1).click()
          await sleep(500)
          const navigated = await snap()
          if (opened.expanded !== 'true' || !opened.inSidebar || escaped.expanded !== 'false' || escaped.active !== 'admin-menu-toggle' || closed.expanded !== 'false' || closed.active !== 'admin-menu-toggle' || navigated.expanded !== 'false' || navigated.active !== 'page-title') findings.push({ view: `${tag} tablet-menu`, kind: 'focus', opened, escaped, closed, navigated })
        } else if (width >= 1024) {
          const collapse = page.getByRole('button', { name: LABELS[lang].collapse }).first()
          if (await collapse.count()) {
            await collapse.click()
            await sleep(300)
            await check('sidebar-collapsed')
          }
        }
        if (errors.length) findings.push({ view: tag, kind: 'console', errors: errors.slice(0, 3) })
        await context.close()
      }
    }
  }
  await browser.close()
  const report = { checked, findings }
  if (OUT) require('fs').writeFileSync(OUT, JSON.stringify(report, null, 1))
  console.log(`${checked} views checked, ${findings.length} findings`)
  for (const f of findings) console.log(JSON.stringify(f).slice(0, 400))
  process.exit(findings.length ? 1 : 0)
})().catch((e) => {
  console.error('FAILED', e)
  process.exit(2)
})
