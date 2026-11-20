// The AI admin assistant's screen (PROMPT 31) in a real Chrome: every state x viewport x theme x language, for layout and accessibility.
//
//   node tools/audit/audit-assistant.cjs --base=http://127.0.0.1:8791 --email=admin@example.test --password=... \
//        [--sizes=1440x900,1024x768,...] [--themes=dark,light] [--langs=en,hu,nl] [--out=report.json]
//
// It needs a FRESH scratch backend (throw-away database, RATE_LIMITS=false) that serves the built administration, whose model is the local stand-in
// (tools/e2e/anthropic-standin.ts) and whose required model is already verified (node tools/e2e/ai-activate.cjs does that, and switches the VISITORS' assistant on: this audit
// switches the admin assistant on itself, through the administration's API). The run creates a few conversations (with the stand-in's "TOOL:<name>:<json>" markers) so the
// screen has something to show: an answer with tool calls, a report, a draft reply, a quotation outline, a refused lookup. Per state it checks:
//   - layout: sideways scrolling, elements outside the viewport, controls under 24x24 px (WCAG 2.5.8), controls with no accessible name, exactly one h1;
//   - accessibility: axe-core (WCAG 2.0/2.1/2.2 A and AA, best practice);
//   - the way between the parts on a narrow screen (one part at a time, the navigation says which is current), and three columns on a wide one;
//   - reduced motion: nothing animates (computed animation names are none), the page was loaded with reduced motion on.
// Exit code 1 when anything is found.
const { launch, axeRun } = require('./lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8791').replace(/\/$/, '')
const EMAIL = arg('email', process.env.ADMIN_EMAIL || '')
const PASSWORD = arg('password', process.env.ADMIN_PASSWORD || '')
const SIZES = arg('sizes', '1440x900,1280x800,1024x768,768x1024,390x844,320x640').split(',').map((s) => s.split('x').map(Number))
const THEMES = arg('themes', 'dark,light').split(',')
const LANGS = arg('langs', 'en,hu,nl').split(',')
const OUT = arg('out', '')
if (!EMAIL || !PASSWORD) {
  console.error('Give --email and --password (or ADMIN_EMAIL and ADMIN_PASSWORD) of an administrator in a throw-away database.')
  process.exit(2)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const LOCALE = { en: 'en-GB', hu: 'hu-HU', nl: 'nl-NL' }
const WORDS = {
  en: { composer: 'Your question', send: 'Send', history: 'History', context: 'Context', chat: 'Conversation', nav: 'Parts of the assistant', clear: 'Clear conversation', del: /^Delete conversation:/ },
  hu: { composer: 'A kérdésed', send: 'Küldés', history: 'Előzmények', context: 'Kontextus', chat: 'Beszélgetés', nav: 'Az asszisztens részei', clear: 'Beszélgetés törlése és újrakezdése', del: /^Beszélgetés törlése:/ },
  nl: { composer: 'Je vraag', send: 'Verstuur', history: 'Geschiedenis', context: 'Context', chat: 'Gesprek', nav: 'Onderdelen van de assistent', clear: 'Gesprek wissen en opnieuw beginnen', del: /^Gesprek verwijderen:/ },
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let i = 0; i < 40; i += 1) {
    if (!(await page.$('[aria-busy="true"]'))) break
    await sleep(100)
  }
  await sleep(250)
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
      if (!scrolls && box.right > vw + 1) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}:${Math.round(box.right)}`)
      if (el.matches('a[href],button,select,input:not([type=hidden]),textarea,summary,[role=tab],[role=switch]')) {
        // A link inside a sentence is exempt from the target size (WCAG 2.5.8, "inline"): it is the sentence's own text.
        const inline = el.tagName === 'A' && style.display.startsWith('inline') && el.closest('p, li, dd')
        if (!inline && (box.height < 24 || box.width < 24)) small.push(`${el.tagName.toLowerCase()}:${Math.round(box.width)}x${Math.round(box.height)}:${(el.textContent || '').trim().slice(0, 14)}`)
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim()
        if (!name && !(el.labels && el.labels.length) && !el.getAttribute('aria-labelledby')) unnamed.push(el.outerHTML.slice(0, 80))
      }
    }
    const animated = [...document.querySelectorAll('body *')].filter((el) => { const s = getComputedStyle(el); return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01 }).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`)
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
  const csrf = await bootPage.evaluate(async () => (await (await fetch('/api/admin/session')).json()).data.csrfToken).catch(() => null)
  const state = await boot.storageState()
  if (!state.cookies.length || !csrf) throw new Error('The sign-in did not work: no session.')
  const call = (method, url, body) =>
    bootPage.evaluate(
      async ([method, url, body, csrf]) => {
        const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) })
        return { status: response.status, json: await response.json().catch(() => null) }
      },
      [method, url, body, csrf],
    )
  // A conversation made through the screen's own endpoint (the stream is read to its end), so the history has something real to show.
  const converse = (id, text, language = 'en', context) =>
    bootPage.evaluate(
      async ([id, text, language, context, csrf]) => {
        const response = await fetch('/api/admin/ai-assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ conversationId: id, trigger: 'submit-user-message', language, text, ...(context ? { context } : {}) }) })
        await response.text()
        return response.status
      },
      [id, text, language, context, csrf],
    )

  // The assistant must be on: the audit needs the model verified (ai-activate) and switches the admin assistant on itself.
  const on = await call('PUT', '/api/admin/ai/settings', { adminAssistantEnabled: true })
  if (on.status !== 200) throw new Error(`The admin assistant could not be switched on (${on.status}): is the model verified? ${JSON.stringify(on.json).slice(0, 160)}`)

  // Records to ask about, and conversations to show.
  const customer = await call('POST', '/api/admin/clients', { email: 'audit.customer@example.com', language: 'en', name: 'Audit Customer', company: 'Audit Company' })
  const customerId = customer.json?.data?.id
  const project = customerId ? await call('POST', `/api/admin/clients/${customerId}/projects`, { name: 'Audit project', category: 'website', notify: false }) : null
  const request = await fetch(`${BASE}/api/quote-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'quote', version: 2, language: 'en', items: [{ need: 'website', plan: 'launch', extras: [] }], description: 'A website for an audit of the assistant screen, long enough to be a description.', objective: 'present', reference: null, timing: 'months', requirements: null, name: 'Audit Customer', email: 'audit.customer@example.com', phone: null, consent: true }) })
  const quoteRef = (await request.json())?.data?.reference
  const thread = customerId ? await call('POST', '/api/admin/communications', { customerId, subject: 'Audit conversation', body: 'A message for the audit.', clientToken: 'tok-audit-000001-abcd' }) : null
  const conversationRef = thread?.json?.data?.reference
  const ids = { plain: 'ac-audit-plain-0000000001', tools: 'ac-audit-tools-0000000001', report: 'ac-audit-report-000000001', draft: 'ac-audit-draft-0000000001', refused: 'ac-audit-refused-00000001', project: 'ac-audit-project-00000001' }
  await converse(ids.plain, 'What needs my attention today?')
  await converse(ids.tools, `TOOL:getAdministrativeAlerts:${JSON.stringify({})}`)
  await converse(ids.report, `TOOL:generateBusinessReport:${JSON.stringify({ reportKind: 'weekly_business_overview', observations: ['The week looks quiet by the stored counts.'], recommendations: ['Review the open quote requests.'] })}`)
  if (conversationRef) await converse(ids.draft, `TOOL:draftCustomerReply:${JSON.stringify({ conversationRef, language: 'en', draft: 'Thank you for your message. We will get back to you this week.' })}`)
  if (quoteRef) await converse('ac-audit-outline-0000000001', `TOOL:prepareQuotationOutline:${JSON.stringify({ quoteRef, outline: { introduction: 'Thank you for the request.', understanding: 'A website for the audit.', scope: ['Home page'], deliverables: ['A responsive website'], exclusions: [], assumptions: [], openQuestions: ['Which domain is wanted?'] } })}`)
  await converse(ids.refused, `TOOL:getAdminProjectDetails:${JSON.stringify({ projectRef: 'PRJ-NOSUCH000' })}`)
  // PROMPT 33: a proposal card (the server must have been started with AI_AUTOMATION_ENABLED=true; without it the tool does not exist and this conversation has no card).
  if (project?.json?.data?.reference) await converse('ac-audit-proposal-0000000001', `TOOL:proposeProjectNote:${JSON.stringify({ projectRef: project.json.data.reference, body: 'A note the audit asked for.', reason: 'Asked by the audit.' })}`)
  if (project?.json?.data?.reference) await converse(ids.project, 'Summarise this project', 'en', { type: 'project', ref: project.json.data.reference })

  for (const lang of LANGS) {
    for (const scheme of THEMES) {
      for (const [width, height] of SIZES) {
        const phone = width < 500
        const tag = `${lang} ${scheme} ${width}x${height}`
        const w = WORDS[lang]
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, bypassCSP: true, isMobile: phone, hasTouch: phone, locale: LOCALE[lang], reducedMotion: 'reduce', storageState: state })
        await context.addInitScript(`try { localStorage.setItem('cc-admin-assistant-language', '${lang}') } catch (e) {}`)
        const page = await context.newPage()
        const errors = []
        page.on('console', (m) => m.type() === 'error' && !/status of (401|4\d\d)/.test(m.text()) && errors.push(m.text().slice(0, 160)))
        page.on('pageerror', (e) => errors.push(`pageerror ${String(e).slice(0, 160)}`))
        const check = async (name) => {
          checked += 1
          const m = await measure(page)
          if (m.overflow > 0 || m.offenders.length || m.small.length || m.unnamed.length || m.h1 !== 1 || m.animated.length) findings.push({ view: `${tag} ${name}`, kind: 'layout', ...m })
          for (const v of await axeRun(page)) findings.push({ view: `${tag} ${name}`, kind: 'axe', id: v.id, impact: v.impact, count: v.count, nodes: v.nodes })
        }
        // The three parts sit side by side when the screen's own container is 1000 px wide (a container query, not the window's width): the page says which it is once it has loaded
        // (until then the window's width is the guess). At 1280 px the container is a little under 1000 px, so the parts are shown one at a time there too.
        let sideBySide = width >= 1000 + 260
        const part = async (name) => {
          // On a narrow screen the parts are shown one at a time; on a wide one all three are there.
          if (sideBySide) return
          const nav = page.getByRole('navigation', { name: w.nav })
          if (await nav.count()) await nav.getByRole('button', { name }).click()
          await sleep(150)
        }
        await page.goto(`${BASE}/admin/ai-assistant`, { waitUntil: 'domcontentloaded' })
        await settle(page)
        await page.getByLabel(w.composer, { exact: true }).waitFor({ timeout: 15000 }).catch(() => findings.push({ view: `${tag} empty`, kind: 'missing', what: 'the composer' }))

        // A wide screen has the three parts side by side; a narrow one has the navigation and shows one part at a time.
        const wide = await page.evaluate(() => document.querySelector('[data-pane="history"]')?.getBoundingClientRect().width > 0 && document.querySelector('[data-pane="context"]')?.getBoundingClientRect().width > 0)
        const navShown = (await page.getByRole('navigation', { name: w.nav }).count()) > 0 && (await page.getByRole('navigation', { name: w.nav }).isVisible())
        sideBySide = wide
        if (wide === navShown) findings.push({ view: `${tag} layout`, kind: 'structure', what: `wide=${wide}, navigation shown=${navShown}` })
        await check('empty')

        await part(w.history)
        await check('history')
        // Open the conversations that have something to show, one by one.
        for (const [name, id] of Object.entries({ answered: ids.plain, tools: ids.tools, report: ids.report, draft: ids.draft, outline: 'ac-audit-outline-0000000001', refused: ids.refused, project: ids.project, proposal: 'ac-audit-proposal-0000000001' })) {
          const detail = await page.evaluate(async (id) => (await fetch(`/api/admin/ai-assistant/conversations/${id}`)).status, id)
          if (detail !== 200) continue
          await part(w.history)
          const title = await page.evaluate(async (id) => (await (await fetch(`/api/admin/ai-assistant/conversations/${id}`)).json()).data.title, id)
          await page.getByRole('list').getByRole('button', { name: new RegExp((title || '').slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click().catch(() => undefined)
          await sleep(500)
          await part(w.chat)
          if (name === 'report') {
            const show = page.getByRole('button', { name: /Show the data|Az adatok megjelenítése|Gegevens tonen/ }).first()
            if (await show.count()) await show.click()
          }
          if (name === 'proposal' && process.env.AUDIT_AUTOMATION === '1' && (await page.locator('article[data-kind="proposal"]').count()) === 0) findings.push({ view: `${tag} proposal`, kind: 'missing', what: 'the proposal card' })
          await check(name)
        }
        await part(w.context)
        await check('context')
        await part(w.chat)
        // The confirmation dialog.
        const clear = page.getByRole('button', { name: w.clear })
        if (await clear.count()) {
          // A control that stays off is a finding of this view (with what the page showed), not a crash of the whole audit.
          const opened = await clear.click({ timeout: 8000 }).then(() => true, () => false)
          if (!opened) findings.push({ view: `${tag} dialog`, kind: 'missing', what: 'the clear-conversation control did not become usable', page: (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300) })
          else {
            await page.getByRole('dialog').waitFor({ timeout: 3000 }).catch(() => undefined)
            await check('dialog')
            await page.keyboard.press('Escape')
          }
        }
        if (errors.length) findings.push({ view: tag, kind: 'console', errors: errors.slice(0, 3) })
        await context.close()
      }
    }
  }

  // The settings tab of the AI screen, in the administration's two languages and both themes; then the unavailable state.
  for (const lang of ['en', 'hu']) {
    for (const scheme of THEMES) {
      for (const [width, height] of SIZES) {
        const tag = `${lang} ${scheme} ${width}x${height}`
        const phone = width < 500
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, bypassCSP: true, isMobile: phone, hasTouch: phone, locale: LOCALE[lang], reducedMotion: 'reduce', storageState: state })
        const page = await context.newPage()
        await page.goto(`${BASE}/admin/ai?tab=assistant`, { waitUntil: 'domcontentloaded' })
        await settle(page)
        checked += 1
        const m = await measure(page)
        if (m.overflow > 0 || m.offenders.length || m.small.length || m.unnamed.length || m.h1 !== 1 || m.animated.length) findings.push({ view: `${tag} ai-settings`, kind: 'layout', ...m })
        for (const v of await axeRun(page)) findings.push({ view: `${tag} ai-settings`, kind: 'axe', id: v.id, impact: v.impact, count: v.count, nodes: v.nodes })
        await context.close()
      }
    }
  }
  await call('PUT', '/api/admin/ai/settings', { adminAssistantEnabled: false })
  for (const [width, height] of SIZES) {
    const phone = width < 500
    for (const scheme of THEMES) {
      const tag = `en ${scheme} ${width}x${height}`
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, bypassCSP: true, isMobile: phone, hasTouch: phone, locale: 'en-GB', reducedMotion: 'reduce', storageState: state })
      const page = await context.newPage()
      await page.goto(`${BASE}/admin/ai-assistant`, { waitUntil: 'domcontentloaded' })
      await settle(page)
      checked += 1
      const m = await measure(page)
      if (m.overflow > 0 || m.offenders.length || m.small.length || m.unnamed.length || m.h1 !== 1 || m.animated.length) findings.push({ view: `${tag} unavailable`, kind: 'layout', ...m })
      for (const v of await axeRun(page)) findings.push({ view: `${tag} unavailable`, kind: 'axe', id: v.id, impact: v.impact, count: v.count, nodes: v.nodes })
      await context.close()
    }
  }
  await call('PUT', '/api/admin/ai/settings', { adminAssistantEnabled: true })

  await browser.close()
  console.log(`${checked} views checked, ${findings.length} finding(s)`)
  for (const finding of findings.slice(0, 60)) console.log(JSON.stringify(finding).slice(0, 700))
  if (OUT) require('fs').writeFileSync(OUT, JSON.stringify({ checked, findings }, null, 2))
  process.exit(findings.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
