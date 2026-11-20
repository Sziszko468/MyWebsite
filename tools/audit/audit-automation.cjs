// The automation screens (PROMPT 33) in a real Chrome: the list (waiting, history, catalogue) and one decision page per status that exists, at every width x theme x language, for layout and
// accessibility.
//
//   node tools/audit/audit-automation.cjs --base=http://127.0.0.1:8793 --email=admin@example.test --password=... \
//        [--sizes=1440x900,1024x768,768x1024,390x844,320x640] [--themes=dark,light] [--langs=en,hu,nl] [--out=report.json]
//
// It needs a FRESH scratch backend (throw-away database) started with AI_AUTOMATION_ENABLED=true and RATE_LIMITS=false, in which actions have already been made and decided in several
// states (tools/e2e/automation-journey.cjs leaves one in each): the audit picks one action of each status it finds. It never touches a real database. Per view it checks:
//   - layout: sideways scrolling, elements outside the viewport, controls under 24x24 px (WCAG 2.5.8), controls with no accessible name, exactly one h1;
//   - accessibility: axe-core (WCAG 2.0/2.1/2.2 A and AA, best practice) with the page's real Content-Security-Policy (this includes colour contrast, in both themes);
//   - content: no raw key, "undefined", "NaN" or open placeholder is visible, no code of the server (a status, an action type, a failure) is shown as it is, no console error;
//   - the decision page: every status has its word, an action that can be decided has the controls and a labelled region, one that is final has none;
//   - reduced motion: nothing animates (the page is loaded with reduced motion on).
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
const OUT = arg('out', '')
if (!EMAIL || !PASSWORD) {
  console.error('Give --email and --password (or ADMIN_EMAIL and ADMIN_PASSWORD) of an administrator in a throw-away database.')
  process.exit(2)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const LOCALE = { en: 'en-GB', hu: 'hu-HU', nl: 'nl-NL' }
/** The codes of the server that must never be shown as they are. */
const RAW = /\b(awaiting_approval|execution_failed|execution_succeeded|approval_granted|proposal_created|project\.status_change|project\.note_add|communication\.draft_reply|quote_request\.triage_status|consultation\.close_days|target_changed|payload_tampered|permission_lost|sideEffects|customer_sees_status|no_email_sent)\b/

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
        const inline = el.tagName === 'A' && style.display.startsWith('inline') && el.closest('p, li, dd, td, th')
        if (!inline && !(el.type === 'checkbox' || el.type === 'radio') && (box.height < 24 || box.width < 24)) small.push(`${el.tagName.toLowerCase()}:${Math.round(box.width)}x${Math.round(box.height)}:${(el.textContent || '').trim().slice(0, 14)}`)
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
    return { overflow: document.documentElement.scrollWidth - vw, offenders: [...new Set(offenders)].slice(0, 4), small: [...new Set(small)].slice(0, 4), unnamed: unnamed.slice(0, 3), h1: document.querySelectorAll('h1').length, animated: animated.slice(0, 3) }
  })
}

/** What the page drew, and what must never be on screen. */
function content(page) {
  return page.evaluate((rawSource) => {
    const main = document.querySelector('main') || document.body
    const text = main.innerText
    const raw = new RegExp(rawSource)
    return {
      length: text.length,
      heading: !!main.querySelector('h1'),
      junk: (text.match(/undefined|\[object|NaN|\{[a-zA-Z]+\}|\bnull\b/g) || []).slice(0, 3),
      codes: (text.match(raw) || []).slice(0, 3),
      pills: [...main.querySelectorAll('[data-status]')].filter((el) => !(el.textContent || '').trim()).length,
      controls: [...main.querySelectorAll('button')].map((el) => (el.textContent || '').trim()).filter(Boolean),
      regions: [...main.querySelectorAll('[role=group][tabindex="0"]')].filter((el) => !(el.getAttribute('aria-label') || '').trim()).length,
      checkboxes: main.querySelectorAll('input[type=checkbox]').length,
      rows: main.querySelectorAll('tbody tr').length,
    }
  }, RAW.source)
}

;(async () => {
  const browser = await launch()
  const findings = []
  let checked = 0

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
  // One action of each status the scratch database has.
  const listed = await bootPage.evaluate(async () => (await (await fetch('/api/admin/automation/actions?pageSize=50')).json()).data.items.map((item) => ({ reference: item.reference, status: item.status, second: item.requiresSecondConfirmation })))
  const picked = new Map()
  for (const item of listed) if (!picked.has(item.status)) picked.set(item.status, item)
  const withSecond = listed.find((item) => item.second && item.status === 'awaiting_approval')
  const pages = [
    { name: 'list waiting', path: '/admin/automation' },
    { name: 'list history', path: '/admin/automation?tab=history' },
    { name: 'catalogue', path: '/admin/automation?tab=catalog' },
    ...[...picked.values()].map((item) => ({ name: `action ${item.status}`, path: `/admin/automation/${item.reference}`, status: item.status })),
    ...(withSecond && picked.get(withSecond.status)?.reference !== withSecond.reference ? [{ name: `action ${withSecond.status} (second confirmation)`, path: `/admin/automation/${withSecond.reference}`, status: withSecond.status }] : []),
  ]
  if (!picked.has('awaiting_approval') || !picked.has('completed') || !picked.has('failed')) findings.push({ view: 'setup', kind: 'content', what: `the scratch database lacks a waiting, a completed or a failed action (has: ${[...picked.keys()].join(', ')})` })

  for (const lang of LANGS) {
    for (const scheme of THEMES) {
      for (const [width, height] of SIZES) {
        const phone = width < 500
        const tag = `${lang} ${scheme} ${width}x${height}`
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, isMobile: phone, hasTouch: phone, locale: LOCALE[lang], reducedMotion: 'reduce', storageState: state })
        await context.addInitScript(`try { localStorage.setItem('cc-admin-automation-language', '${lang}') } catch (e) {}`)
        const page = await context.newPage()
        const errors = []
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)))
        page.on('pageerror', (e) => errors.push(`pageerror ${String(e).slice(0, 160)}`))
        for (const target of pages) {
          const view = `${tag} ${target.name}`
          errors.length = 0
          await page.goto(`${BASE}${target.path}`, { waitUntil: 'domcontentloaded' })
          await settle(page)
          checked += 1
          const m = await measure(page)
          if (m.overflow > 0 || m.offenders.length || m.small.length || m.unnamed.length || m.h1 !== 1 || m.animated.length) findings.push({ view, kind: 'layout', ...m })
          for (const v of await axeRun(page)) findings.push({ view, kind: 'axe', id: v.id, impact: v.impact, nodes: v.nodes })
          const c = await content(page)
          if (!c.heading || c.length < 80) findings.push({ view, kind: 'content', what: 'the page drew nothing', ...c })
          if (c.junk.length) findings.push({ view, kind: 'content', what: 'raw text on screen', junk: c.junk })
          if (c.codes.length) findings.push({ view, kind: 'content', what: 'a code of the server shown as it is', codes: c.codes })
          if (c.pills > 0) findings.push({ view, kind: 'content', what: 'a status without its word' })
          if (c.regions > 0) findings.push({ view, kind: 'content', what: 'a scrollable region without a name' })
          if (target.status === 'awaiting_approval') {
            if (!c.controls.some((name) => /^(Approve and carry out|Jóváhagyás és végrehajtás|Goedkeuren en uitvoeren)/.test(name))) findings.push({ view, kind: 'content', what: 'a waiting action without its approval control', controls: c.controls })
          } else if (target.status && c.controls.some((name) => /^(Approve and carry out|Jóváhagyás és végrehajtás|Goedkeuren en uitvoeren)/.test(name))) {
            findings.push({ view, kind: 'content', what: 'an action that is not waiting offers an approval' })
          }
          if (target.name.includes('second confirmation') && c.checkboxes === 0 && target.status === 'awaiting_approval') findings.push({ view, kind: 'content', what: 'no second confirmation on an action that needs one' })
          if (errors.length) findings.push({ view, kind: 'console', errors: errors.slice(0, 3) })
        }
        await context.close()
      }
    }
  }
  await browser.close()
  if (OUT) require('fs').writeFileSync(OUT, JSON.stringify({ checked, pages: pages.map((p) => p.name), findings }, null, 2))
  console.log(`checked ${checked} views (${pages.length} pages: ${pages.map((p) => p.name).join(', ')}), ${findings.length} finding(s)`)
  for (const f of findings.slice(0, 40)) console.log(JSON.stringify(f).slice(0, 500))
  process.exit(findings.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(3)
})
