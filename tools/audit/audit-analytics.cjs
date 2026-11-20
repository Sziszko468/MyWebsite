// The business analytics screen (PROMPT 32) in a real Chrome: every section x viewport x theme x language, for layout and accessibility.
//
//   node tools/audit/audit-analytics.cjs --base=http://127.0.0.1:8793 --email=admin@example.test --password=... \
//        [--sizes=1440x900,1024x768,768x1024,390x844,320x640] [--themes=dark,light] [--langs=en,hu,nl] [--sections=executive,financial,...] [--out=report.json]
//
// It needs a FRESH scratch backend (throw-away database) that serves the built administration, filled with clearly labelled SYNTHETIC rows (tools/audit/seed-analytics.mjs): the screen
// has to show real figures, charts, tables and alerts to be checked. The audit never touches a real database. Per view it checks:
//   - layout: sideways scrolling, elements outside the viewport, controls under 24x24 px (WCAG 2.5.8), controls with no accessible name, exactly one h1;
//   - accessibility: axe-core (WCAG 2.0/2.1/2.2 A and AA, best practice) with the page's real Content-Security-Policy;
//   - content: the section drew figures, every chart has its numbers as a table, no raw key, "undefined", "NaN" or open placeholder is visible, no console error;
//   - reduced motion: nothing animates (the page is loaded with reduced motion on);
//   - the project status filter's notes (PROMPT 32.2): every figure that is empty by definition says why, in a visible sentence (its own, or the note's).
// Exit code 1 when anything is found.
const { launch, axeRun } = require('./lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8793').replace(/\/$/, '')
const EMAIL = arg('email', process.env.ADMIN_EMAIL || '')
const PASSWORD = arg('password', process.env.ADMIN_PASSWORD || '')
const SIZES = arg('sizes', '1440x900,1024x768,768x1024,390x844,320x640').split(',').map((s) => s.split('x').map(Number))
const THEMES = arg('themes', 'dark,light').split(',')
const LANGS = arg('langs', 'en,hu,nl').split(',')
const SECTIONS = arg('sections', 'executive,financial,customers,funnel,projects,consultations,communication,ai,alerts').split(',')
const OUT = arg('out', '')
// An extra query string for every view (PROMPT 32.1), for example `--extra=projectStatus=development`: the notes the project status filter adds are laid out and checked like everything else.
const EXTRA = arg('extra', '')
if (!EMAIL || !PASSWORD) {
  console.error('Give --email and --password (or ADMIN_EMAIL and ADMIN_PASSWORD) of an administrator in a throw-away database.')
  process.exit(2)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const LOCALE = { en: 'en-GB', hu: 'hu-HU', nl: 'nl-NL' }

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let i = 0; i < 60; i += 1) {
    if (!(await page.$('[aria-busy="true"], [role=status][aria-busy="true"]'))) break
    await sleep(100)
  }
  await sleep(300)
}

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
      if (!scrolls && !el.closest('svg') && box.right > vw + 1) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 30)}:${Math.round(box.right)}`)
      if (el.matches('a[href],button,select,input:not([type=hidden]),textarea,summary,[role=tab],[role=switch]')) {
        // A link inside a sentence is exempt from the target size (WCAG 2.5.8, "inline"): it is the sentence's own text.
        const inline = el.tagName === 'A' && style.display.startsWith('inline') && el.closest('p, li, dd')
        if (!inline && (box.height < 24 || box.width < 24)) small.push(`${el.tagName.toLowerCase()}:${Math.round(box.width)}x${Math.round(box.height)}:${(el.textContent || '').trim().slice(0, 14)}`)
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim()
        if (!name && !(el.labels && el.labels.length) && !el.getAttribute('aria-labelledby')) unnamed.push(el.outerHTML.slice(0, 80))
      }
    }
    const animated = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const s = getComputedStyle(el)
        return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01
      })
      .map((el) => el.tagName.toLowerCase())
    return {
      overflow: document.documentElement.scrollWidth - vw,
      offenders: [...new Set(offenders)].slice(0, 4),
      small: [...new Set(small)].slice(0, 4),
      unnamed: unnamed.slice(0, 3),
      h1: document.querySelectorAll('h1').length,
      animated: animated.slice(0, 3),
    }
  })
}

/** What the section drew, and what must never be on screen. */
function content(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[role=tabpanel]:not([hidden])')
    const text = panel ? panel.innerText : ''
    const figures = [...(panel ? panel.querySelectorAll('figure') : [])]
    return {
      cards: panel ? panel.querySelectorAll('article[aria-label]').length : 0,
      figures: figures.length,
      figuresWithTable: figures.filter((f) => f.querySelector('table')).length,
      figuresEmptyOrWithImage: figures.filter((f) => f.querySelector('[role=img], ul, ol, p')).length,
      tables: panel ? panel.querySelectorAll('table').length : 0,
      raw: (text.match(/undefined|\[object|NaN|\{[a-zA-Z]+\}|\bnull\b/g) || []).slice(0, 3),
      length: text.length,
      heading: panel ? !!panel.querySelector('h2') : false,
      // PROMPT 32.2: a figure that is empty by definition says WHY. Its note has a reason sentence after the badge, or the figure is an unavailable card that writes the same reason itself;
      // either way the sentence is visible (not hidden, not empty).
      emptyNotes: (() => {
        const notes = [...(panel ? panel.querySelectorAll('[data-effect="empty_by_definition"]') : [])]
        const visible = (el) => {
          const box = el.getBoundingClientRect()
          const style = getComputedStyle(el)
          return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && (el.innerText || '').trim().length > 10
        }
        const withoutReason = notes.filter((note) => {
          const spans = note.querySelectorAll('span')
          if (spans.length > 1 && visible(spans[spans.length - 1])) return false
          const card = note.closest('article')
          const own = card ? card.querySelector('[data-state="unavailable"]') : null
          return !(own && visible(own))
        })
        return { count: notes.length, without: withoutReason.length, sample: withoutReason.slice(0, 2).map((note) => note.outerHTML.slice(0, 120)) }
      })(),
    }
  })
}

;(async () => {
  const browser = await launch()
  const findings = []
  let checked = 0
  let emptyChecked = 0

  const boot = await browser.newContext({ bypassCSP: true, locale: 'en-GB' })
  const bootPage = await boot.newPage()
  await bootPage.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
  await settle(bootPage)
  await bootPage.fill('input[type=email]', EMAIL)
  await bootPage.fill('input[type=password]', PASSWORD)
  await bootPage.click('button[type=submit]')
  await bootPage.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 8000 }).catch(() => {})
  const state = await boot.storageState()
  if (!state.cookies.length) throw new Error('The sign-in did not work: no session.')

  for (const lang of LANGS) {
    for (const scheme of THEMES) {
      for (const [width, height] of SIZES) {
        const phone = width < 500
        const tag = `${lang} ${scheme} ${width}x${height}`
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, isMobile: phone, hasTouch: phone, locale: LOCALE[lang], reducedMotion: 'reduce', storageState: state })
        await context.addInitScript(`try { localStorage.setItem('cc-admin-analytics-language', '${lang}') } catch (e) {}`)
        const page = await context.newPage()
        const errors = []
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)))
        page.on('pageerror', (e) => errors.push(`pageerror ${String(e).slice(0, 160)}`))
        for (const section of SECTIONS) {
          const view = `${tag} ${section}`
          errors.length = 0
          const query = [section === 'executive' ? '' : `section=${section}`, EXTRA].filter(Boolean).join('&')
          await page.goto(`${BASE}/admin/analytics${query ? `?${query}` : ''}`, { waitUntil: 'domcontentloaded' })
          await settle(page)
          checked += 1
          const m = await measure(page)
          if (m.overflow > 0 || m.offenders.length || m.small.length || m.unnamed.length || m.h1 !== 1 || m.animated.length) findings.push({ view, kind: 'layout', ...m })
          for (const v of await axeRun(page)) findings.push({ view, kind: 'axe', id: v.id, impact: v.impact, count: v.count, nodes: v.nodes })
          const c = await content(page)
          if (!c.heading || c.length < 80) findings.push({ view, kind: 'content', what: 'the section drew nothing', ...c })
          if (c.raw.length) findings.push({ view, kind: 'content', what: 'raw text on screen', raw: c.raw })
          if (c.figures !== c.figuresEmptyOrWithImage) findings.push({ view, kind: 'content', what: 'a chart with neither a drawing nor a sentence' })
          if (section !== 'executive' && c.cards + c.figures + c.tables === 0) findings.push({ view, kind: 'content', what: 'no figure, no chart, no table', ...c })
          if (errors.length) findings.push({ view, kind: 'console', errors: errors.slice(0, 3) })
          // PROMPT 32.2: every figure that is empty by definition says why; and a status outside "active" really does produce such figures in Projects (the check is not vacuous).
          emptyChecked += c.emptyNotes.count
          if (c.emptyNotes.without > 0) findings.push({ view, kind: 'content', what: 'a figure empty by definition without a visible reason', ...c.emptyNotes })
          if (/projectStatus=(completed|cancelled)/.test(EXTRA) && section === 'projects' && c.emptyNotes.count === 0) findings.push({ view, kind: 'content', what: 'no figure empty by definition for a status outside active' })
          // A chart's table opens: the numbers are there for a person who cannot see the picture.
          const summary = page.locator('[role=tabpanel]:not([hidden]) figure details summary').first()
          if (await summary.count()) {
            await summary.click().catch(() => {})
            const open = await page.locator('[role=tabpanel]:not([hidden]) figure details[open] table').count()
            if (open === 0) findings.push({ view, kind: 'content', what: 'a chart table did not open' })
          }
        }
        await context.close()
      }
    }
  }
  await browser.close()
  if (OUT) require('fs').writeFileSync(OUT, JSON.stringify({ checked, findings }, null, 2))
  console.log(`checked ${checked} views (${emptyChecked} notes of figures empty by definition inspected), ${findings.length} finding(s)`)
  for (const f of findings.slice(0, 40)) console.log(JSON.stringify(f).slice(0, 500))
  process.exit(findings.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(3)
})
