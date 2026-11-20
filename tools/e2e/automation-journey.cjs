// CONTROLLED AI AUTOMATION (PROMPT 33), in a real Chrome: the assistant proposes in its chat, an administrator decides on the automation screen, the server carries it out. The screens run
// against the BUILT administration served by the real backend, whose model is the local stand-in for Anthropic's API (tools/e2e/anthropic-standin.ts): the real provider code, the real
// streaming protocol, the real tools, the real permissions and the real database are in play; nothing is spent. The stand-in turns "TOOL:<name>:<json>" in the administrator's message
// into a tool call, which is how the journey plays the model. What this does NOT show is how the real model behaves.
//
//   1. a scratch backend with a throw-away database, started with AI_AUTOMATION_ENABLED=true and RATE_LIMITS=false, the administration built for it, the stand-in on 9911,
//      an administrator AND an editor, then
//   2. AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/automation-journey.cjs --base=http://127.0.0.1:8790 --standin=http://127.0.0.1:9911 \
//        --email=admin@example.test --password=... --editor=editor@example.test --editor-password=... --db=<scratch database> --mail=<scratch mail dir> [--out=<dir>]
//
// With --db the scratch database is read (read only) to prove what each decision wrote and did not write; with --mail it counts the e-mails the server wrote (an action must write none).
const fs = require('fs')
const path = require('path')
const { launch, newPage } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8790').replace(/\/$/, '')
const STANDIN = arg('standin', 'http://127.0.0.1:9911').replace(/\/$/, '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const EDITOR = arg('editor', '')
const EDITOR_PASSWORD = arg('editor-password', '')
const OUT = arg('out', '')
const DB = arg('db', '')
const MAIL = arg('mail', '')
if (OUT) fs.mkdirSync(OUT, { recursive: true })

let passed = 0
let failed = 0
let current = null
const track = (page) => {
  current = page
  return page
}
async function step(name, work) {
  try {
    await work()
    passed += 1
    console.log(`  ok    ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL  ${name}\n        ${String(error.message || error).split('\n')[0]}`)
    if (current && OUT) {
      await current.screenshot({ path: path.join(OUT, `FAIL-${failed}.png`) }).catch(() => undefined)
      const text = await current.locator('body').innerText().catch(() => '')
      console.log(`        page: ${text.replace(/\s+/g, ' ').slice(0, 600)}`)
    }
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}
const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
}
const forget = () => fetch(`${STANDIN}/__requests`, { method: 'DELETE' })
const control = (body) => fetch(`${STANDIN}/__control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const db = () => {
  if (!DB) return null
  const { DatabaseSync } = require('node:sqlite')
  return new DatabaseSync(DB, { readOnly: true })
}
const query = (sql, ...params) => {
  const handle = db()
  if (!handle) return null
  try {
    return handle.prepare(sql).all(...params)
  } finally {
    handle.close()
  }
}
const count = (sql, ...params) => {
  const rows = query(sql, ...params)
  return rows === null ? null : rows[0].n
}
const mails = () => (MAIL && fs.existsSync(MAIL) ? fs.readdirSync(MAIL).length : null)

async function signIn(browser, { email, password, width = 1440, height = 900, mobile = false, scheme = 'dark', locale = 'en-GB' }) {
  const { context, page } = await newPage(browser, { width, height, mobile, scheme, reduced: true, extra: { bypassCSP: true, locale } })
  // English to start with; a pick made on the screen is kept (this runs on every load, so it must not overwrite one).
  await context.addInitScript(`try { for (const key of ['cc-admin-automation-language', 'cc-admin-assistant-language']) if (!localStorage.getItem(key)) localStorage.setItem(key, 'en') } catch (e) {}`)
  const problems = []
  page.on('pageerror', (error) => problems.push(`pageerror ${error.message.slice(0, 160)}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|status of 5\d\d|status of 4\d\d/.test(message.text())) problems.push(message.text().slice(0, 160))
  })
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]')
  await page.waitForTimeout(1200)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 })
  const csrf = await page.evaluate(async () => (await (await fetch('/api/admin/session')).json()).data.csrfToken)
  const call = (method, url, body) =>
    page.evaluate(
      async ([method, url, body, csrf]) => {
        const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) })
        return { status: response.status, json: await response.json().catch(() => null) }
      },
      [method, url, body, csrf],
    )
  return { context, page, call, problems }
}

const noSideways = async (page, label) => {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(scrollWidth <= innerWidth + 1, `${label}: the page scrolls sideways (${scrollWidth} > ${innerWidth})`)
}
/** Waits (up to 10 s) until a condition about the page holds: a list that was just filtered has not necessarily been redrawn when the address changed. */
const until = async (condition, message) => {
  for (let index = 0; index < 100; index += 1) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(message)
}
const dayOffset = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

;(async () => {
  const browser = await launch()
  await forget()
  await control({})
  const adm = await signIn(browser, { email: EMAIL, password: PASSWORD })
  const page = track(adm.page)
  const composer = () => page.getByLabel(/^(Your question|A kérdésed|Je vraag)$/)

  /** Plays the model: the stand-in turns the marker into a tool call; returns when its follow-up text shows. */
  const ask = async (page_, text, { after = 'Tool result received.' } = {}) => {
    const before = await page_.getByText(after, { exact: false }).count()
    await page_.getByLabel(/^(Your question|A kérdésed|Je vraag)$/).fill(text)
    await page_.getByLabel(/^(Your question|A kérdésed|Je vraag)$/).press('Enter')
    await page_.getByText(after, { exact: false }).nth(before).waitFor({ timeout: 20000 })
    await page_.getByRole('button', { name: /^(Send|Küldés|Verstuur)$/ }).waitFor({ timeout: 10000 })
  }
  const propose = (page_, name, input) => ask(page_, `TOOL:${name}:${JSON.stringify(input)}`)
  /** A fresh conversation, so each proposal comes from its own chat. */
  const fresh = async (page_) => {
    await page_.goto(`${BASE}/admin/ai-assistant`, { waitUntil: 'domcontentloaded' })
    await page_.getByLabel(/^(Your question|A kérdésed|Je vraag)$/).waitFor({ timeout: 20000 })
  }
  const lastReference = () => query('SELECT reference FROM ai_actions ORDER BY created_at DESC, rowid DESC LIMIT 1')?.[0]?.reference ?? null

  console.log('0  Seed: a customer with two projects, a quote request and a conversation; the model verified and the admin assistant switched on')
  let seeded = {}
  await step('the records exist (through the administration\'s own endpoints and the public form), and the assistant is on', async () => {
    const customer = await adm.call('POST', '/api/admin/clients', { email: 'anna.auto@example.com', language: 'en', name: 'Anna Automation', company: 'Automation Bakery' })
    expect(customer.status === 201, `customer ${customer.status}`)
    const customerId = customer.json.data.id
    const project = await adm.call('POST', `/api/admin/clients/${customerId}/projects`, { name: 'Automation bakery website', category: 'website', notify: false })
    expect(project.status === 201, `project ${project.status}`)
    const second = await adm.call('POST', `/api/admin/clients/${customerId}/projects`, { name: 'Automation second project', category: 'webapp', notify: false })
    const third = await adm.call('POST', `/api/admin/clients/${customerId}/projects`, { name: 'Automation third project', category: 'website', notify: false })
    const fourth = await adm.call('POST', `/api/admin/clients/${customerId}/projects`, { name: 'Automation fourth project', category: 'website', notify: false })
    const request = await fetch(`${BASE}/api/quote-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form: 'quote', version: 2, language: 'en', items: [{ need: 'website', plan: 'launch', extras: ['pages'] }], description: 'A small website for a bakery.', objective: 'present', reference: null, timing: 'months', requirements: null, name: 'Bea Baker', email: 'bea.auto@example.com', phone: null, consent: true }),
    })
    expect([200, 201].includes(request.status), `quote request ${request.status}`)
    const quoteRef = (await request.json()).data.reference
    const thread = await adm.call('POST', '/api/admin/communications', { customerId, subject: 'Opening hours', body: 'Could you tell us how the work is going?', clientToken: 'tok-auto-000001-abcd' })
    expect(thread.status === 201, `conversation ${thread.status}`)
    const tested = await adm.call('POST', '/api/admin/ai/connection-test', {})
    expect(tested.json?.data?.result?.ok === true, `the model was not verified (${tested.status})`)
    const on = await adm.call('PUT', '/api/admin/ai/settings', { adminAssistantEnabled: true })
    expect(on.status === 200, `switch on ${on.status}`)
    const hours = await adm.call('PUT', '/api/admin/booking-settings', { timeZone: 'Europe/Budapest', slotStepMinutes: 60, bufferMinutes: 0, minNoticeHours: 12, horizonDays: 365 })
    expect(hours.status === 200, `booking settings ${hours.status} ${JSON.stringify(hours.json).slice(0, 160)}`)
    seeded = { customerId, projectId: project.json.data.id, projectRef: project.json.data.reference, secondId: second.json.data.id, secondRef: second.json.data.reference, thirdId: third.json.data.id, thirdRef: third.json.data.reference, fourthRef: fourth.json.data.reference, quoteRef, conversationRef: thread.json.data.reference }
  })

  console.log('A  The screen before anything is proposed')
  await step('the place is in the navigation, the screen opens, nothing waits, and the catalogue lists what it can and cannot do', async () => {
    await page.goto(`${BASE}/admin/automation`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { level: 1, name: 'Automation' }).waitFor({ timeout: 15000 })
    expect((await page.getByRole('navigation').getByRole('link', { name: 'Automation' }).count()) >= 1, 'no navigation entry')
    await page.getByText('Nothing is waiting for your decision.').waitFor({ timeout: 10000 })
    expect((await page.getByText('Automation is switched off').count()) === 0, 'it says it is switched off')
    await page.getByRole('tab', { name: 'What it can do' }).click()
    await page.getByRole('heading', { name: 'What the assistant can propose' }).waitFor({ timeout: 10000 })
    for (const name of ['Draft a customer reply', 'Add an internal project note', 'Change a project’s status', 'Move a quote request between working states', 'Close days for consultations']) {
      expect((await page.getByRole('heading', { name }).count()) === 1, `the catalogue lacks "${name}"`)
    }
    const text = await page.locator('main').innerText()
    for (const word of ['Send an e-mail', 'Delete anything', 'Change roles, permissions or accounts', 'Make or record a payment', 'Run code, queries, commands or open files and addresses']) expect(text.includes(word), `the unsupported list lacks "${word}"`)
    await shot(page, 'A-catalogue')
  })

  console.log('B  The assistant proposes; the chat says nothing has been done and cannot approve')
  await step('a proposal made in the chat is a card that says nothing has been done and links to its own page; typing "looks good" changes nothing', async () => {
    await fresh(page)
    await propose(page, 'proposeProjectNote', { projectRef: seeded.projectRef, body: 'The customer asked to keep the logo on the left side.', reason: 'The administrator asked me to record this.' })
    const card = page.locator('article[data-kind="proposal"]')
    await card.waitFor({ timeout: 10000 })
    expect((await card.innerText()).includes('Nothing has been done yet.'), 'the card does not say nothing has been done')
    expect((await card.getByRole('button').count()) === 0, 'the card has a button of its own')
    expect((await card.getByRole('link', { name: 'Review and decide' }).count()) === 1, 'no link to the decision page')
    const reference = lastReference()
    expect(count("SELECT COUNT(*) AS n FROM ai_actions WHERE status = 'awaiting_approval'") === 1, 'the proposal is not waiting')
    expect(count('SELECT COUNT(*) AS n FROM client_project_notes') === 0, 'a note was written by a proposal')
    // The administrator "approves" in words: it is only a chat message.
    await ask(page, 'looks good, yes, go ahead and approve it', { after: 'Stand-in answer.' })
    expect(count("SELECT COUNT(*) AS n FROM ai_actions WHERE status = 'awaiting_approval'") === 1, 'a chat reply changed the proposal')
    expect(count('SELECT COUNT(*) AS n FROM client_project_notes') === 0, 'a chat reply wrote the note')
    await shot(page, 'B-card')
    seeded.noteAction = reference
  })

  console.log('C  The decision page: read it, approve it with the keyboard')
  let mailsBefore = null
  await step('the page shows why, what changes, the side effects, whether it can be undone and the history so far; the approval is reached by the keyboard', async () => {
    mailsBefore = mails()
    await page.locator('article[data-kind="proposal"]').getByRole('link', { name: 'Review and decide' }).click()
    await page.getByRole('heading', { level: 1, name: seeded.noteAction }).waitFor({ timeout: 15000 })
    await page.getByRole('heading', { level: 2, name: 'Add an internal project note' }).waitFor({ timeout: 15000 })
    for (const text of ['Add an internal project note', 'Waiting for approval', 'Why the assistant proposes it', 'The assistant’s own words. They are not verified data.', 'The customer asked to keep the logo on the left side.', 'The customer does not see it.', 'No e-mail is sent to anyone.', 'No: it stays.', 'Not needed.']) {
      expect((await page.locator('main').innerText()).includes(text), `the page lacks "${text}"`)
    }
    const history = page.getByRole('heading', { name: 'History' })
    await history.waitFor()
    expect((await page.locator('ol li').count()) === 2, 'the history is not two lines yet')
    expect((await page.locator('main').innerText()).includes('AI assistant'), 'the history does not name the assistant')
    await shot(page, 'C-detail')
    // Keyboard: Tab until the approval control has focus, then press it.
    let reached = false
    for (let index = 0; index < 90 && !reached; index += 1) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(() => /Approve and carry out/.test(document.activeElement?.textContent ?? ''))
    }
    expect(reached, 'the approval control was not reached with the keyboard')
    await page.keyboard.press('Enter')
    await page.getByText('Done.').first().waitFor({ timeout: 15000 })
    await page.getByText('Executed', { exact: true }).waitFor({ timeout: 10000 })
    expect(count('SELECT COUNT(*) AS n FROM client_project_notes WHERE body LIKE ?', '%logo on the left%') === 1, 'the note was not written exactly once')
    expect(count("SELECT COUNT(*) AS n FROM ai_actions WHERE reference = ? AND status = 'completed'", seeded.noteAction) === 1, 'the action did not complete')
    expect(count('SELECT COUNT(*) AS n FROM ai_action_events e JOIN ai_actions a ON a.id = e.action_id WHERE a.reference = ?', seeded.noteAction) === 5, 'the history is not five lines')
    expect((await page.getByText('The history of this action is whole and unaltered.').count()) === 1, 'the integrity line is missing')
    expect(mails() === mailsBefore, 'an e-mail was written')
    await shot(page, 'C-done')
  })

  console.log('D  A second confirmation, a record that changed, a refusal and a cancellation')
  await step('a project moved to Completed needs the second confirmation: the control stays off until it is ticked, then the project moves, with no e-mail', async () => {
    await fresh(page)
    await propose(page, 'proposeProjectStatusChange', { projectRef: seeded.secondRef, status: 'completed', customerNote: 'The project is finished. Thank you!', reason: 'The administrator said the work is done.' })
    seeded.completeAction = lastReference()
    await page.goto(`${BASE}/admin/automation/${seeded.completeAction}`, { waitUntil: 'domcontentloaded' })
    const approve = page.getByRole('button', { name: 'Approve and carry out' })
    await approve.waitFor({ timeout: 15000 })
    expect(await approve.isDisabled(), 'the approval is on before the confirmation is ticked')
    const text = await page.locator('main').innerText()
    for (const word of ['A finished project can afterwards only be put back on hold.', 'The customer sees the new status in their portal.', 'Partly: some of it cannot be undone', 'The project is finished. Thank you!', 'Needed, because this cannot be fully undone or it reaches the customer.']) expect(text.includes(word), `the page lacks "${word}"`)
    await page.getByLabel('I understand: this cannot be fully undone, or it reaches the customer, and I approve it.').check()
    expect(!(await approve.isDisabled()), 'the approval stays off after the confirmation is ticked')
    await approve.click()
    await page.getByText('Done.').first().waitFor({ timeout: 15000 })
    expect(count("SELECT COUNT(*) AS n FROM client_projects WHERE reference = ? AND status = 'completed'", seeded.secondRef) === 1, 'the project did not move')
    expect(mails() === mailsBefore, 'an e-mail was written')
    await shot(page, 'D-second')
  })
  await step('the same approval cannot be repeated: the page offers nothing more, and a second request is refused', async () => {
    expect((await page.getByRole('button', { name: 'Approve and carry out' }).count()) === 0, 'an approval is offered on a finished action')
    const again = await adm.call('POST', `/api/admin/automation/actions/${seeded.completeAction}/approve`, { payloadHash: 'a'.repeat(64), idempotencyKey: 'journey-replay-000000001' })
    expect(again.status === 409, `a replay answered ${again.status}`)
    expect(count("SELECT COUNT(*) AS n FROM ai_action_events e JOIN ai_actions a ON a.id = e.action_id WHERE a.reference = ? AND e.kind = 'approval_granted'", seeded.completeAction) === 1, 'a second approval was recorded')
  })
  await step('a record that changed after the proposal ends the proposal, with the reason in words, and nothing is written', async () => {
    await fresh(page)
    await propose(page, 'proposeProjectStatusChange', { projectRef: seeded.thirdRef, status: 'design', reason: 'The administrator said the design phase has started.' })
    const reference = lastReference()
    const moved = await adm.call('POST', `/api/admin/client-projects/${seeded.thirdId}/status`, { status: 'planning' })
    expect(moved.status === 200, `the project move ${moved.status}`)
    await page.goto(`${BASE}/admin/automation/${reference}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Approve and carry out' }).click()
    await page.getByRole('alert').filter({ hasText: 'The record changed after the proposal. Ask the assistant for a new proposal.' }).waitFor({ timeout: 15000 })
    await page.getByText('Failed', { exact: true }).first().waitFor({ timeout: 10000 })
    expect(count("SELECT COUNT(*) AS n FROM client_projects WHERE reference = ? AND status = 'planning'", seeded.thirdRef) === 1, 'the project was changed by the action')
    expect((await page.getByRole('button', { name: 'Approve and carry out' }).count()) === 0, 'an approval is offered after the failure')
    await shot(page, 'D-changed')
  })
  await step('a proposal can be rejected with a reason and another cancelled; both are final and change nothing', async () => {
    await fresh(page)
    await propose(page, 'proposeQuoteRequestTriage', { quoteRef: seeded.quoteRef, status: 'under_review', reason: 'The administrator started reading it.' })
    const toReject = lastReference()
    await page.goto(`${BASE}/admin/automation/${toReject}`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Why (optional)').fill('Not now, thanks.')
    await page.getByRole('button', { name: 'Reject', exact: true }).click()
    await page.getByText('Rejected.').first().waitFor({ timeout: 15000 })
    await page.getByText('Not now, thanks.').first().waitFor({ timeout: 10000 })
    await fresh(page)
    await propose(page, 'proposeProjectNote', { projectRef: seeded.fourthRef, body: 'A note that will be cancelled.', reason: 'Asked by the administrator.' })
    const toCancel = lastReference()
    await page.goto(`${BASE}/admin/automation/${toCancel}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Cancel this proposal' }).click()
    await page.getByText('Cancelled.').first().waitFor({ timeout: 15000 })
    expect(query('SELECT status FROM ai_actions WHERE reference = ?', toReject)[0].status === 'rejected', 'not rejected')
    expect(query('SELECT status FROM ai_actions WHERE reference = ?', toCancel)[0].status === 'cancelled', 'not cancelled')
    expect(count("SELECT COUNT(*) AS n FROM quote_requests WHERE reference = ? AND status = 'new'", seeded.quoteRef) === 1, 'the quote request moved although it was rejected')
    expect(count("SELECT COUNT(*) AS n FROM client_project_notes WHERE body LIKE '%will be cancelled%'") === 0, 'the cancelled note was written')
  })

  console.log('E  Closing days of the consultations')
  await step('the proposal says customers cannot book those days, needs the second confirmation, and writes one closed exception', async () => {
    await fresh(page)
    await propose(page, 'proposeConsultationClosure', { startDate: dayOffset(40), endDate: dayOffset(42), label: 'Journey closing', reason: 'The administrator will be away.' })
    const reference = lastReference()
    await page.goto(`${BASE}/admin/automation/${reference}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Approve and carry out' }).waitFor({ timeout: 15000 })
    const text = await page.locator('main').innerText()
    for (const word of ['Customers cannot book consultations on these days.', 'Yes: the same screens undo it.', 'Consultation hours', 'Closed days']) expect(text.includes(word), `the page lacks "${word}"`)
    await page.getByLabel('I understand: this cannot be fully undone, or it reaches the customer, and I approve it.').check()
    await page.getByRole('button', { name: 'Approve and carry out' }).click()
    await page.getByText('Done.').first().waitFor({ timeout: 15000 })
    expect(count("SELECT COUNT(*) AS n FROM availability_exceptions WHERE kind = 'closed' AND label = 'Journey closing'") === 1, 'the exception was not written')
    expect(mails() === mailsBefore, 'an e-mail was written')
  })

  await step('a proposal that is left waiting stays in the waiting list, marked as needing a second confirmation, and does nothing', async () => {
    await fresh(page)
    await propose(page, 'proposeConsultationClosure', { startDate: dayOffset(70), endDate: dayOffset(71), label: 'Left waiting', reason: 'The administrator may be away.' })
    await page.goto(`${BASE}/admin/automation`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Needs a second confirmation').first().waitFor({ timeout: 15000 })
    expect((await page.locator('tbody tr').count()) >= 1, 'the waiting list lacks the proposal')
    expect(count("SELECT COUNT(*) AS n FROM availability_exceptions WHERE label = 'Left waiting'") === 0, 'a waiting proposal wrote an exception')
    await shot(page, 'E-waiting')
  })

  console.log('F  The list: tabs, filters in the address, paging')
  await step('the history lists what was decided, filtered by status, type and record, and the address keeps the view', async () => {
    await page.goto(`${BASE}/admin/automation?tab=history`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Filters' }).waitFor({ timeout: 15000 })
    await page.getByText(/\d+ in total/).waitFor({ timeout: 10000 })
    const rows = await page.locator('tbody tr').count()
    expect(rows >= 6, `the history lists ${rows} rows`)
    await page.getByLabel('Status', { exact: true }).selectOption('failed')
    await page.waitForURL(/status=failed/, { timeout: 10000 })
    await until(async () => (await page.locator('tbody tr').count()) === 1, 'the failed filter did not narrow to one')
    await page.reload({ waitUntil: 'domcontentloaded' })
    expect((await page.getByLabel('Status', { exact: true }).inputValue()) === 'failed', 'the filter was not kept in the address')
    await page.getByRole('button', { name: 'Reset filters' }).click()
    await page.getByLabel('Record reference').fill(seeded.projectRef)
    await page.waitForURL(/target=PRJ-/, { timeout: 10000 })
    await until(async () => (await page.locator('tbody tr').count()) === 1, 'the record filter did not narrow to its one action')
    // A hand-edited address cannot ask for anything odd: unknown values are dropped.
    await page.goto(`${BASE}/admin/automation?tab=history&status=drop%20table&type=%3Cscript%3E&page=-5`, { waitUntil: 'domcontentloaded' })
    await page.getByText(/\d+ in total/).waitFor({ timeout: 10000 })
    expect((await page.getByLabel('Status', { exact: true }).inputValue()) === '', 'an odd status was kept')
    await shot(page, 'F-history')
  })

  console.log('G  Another administrator: an editor sees only their own, and cannot close days')
  const edt = await signIn(browser, { email: EDITOR, password: EDITOR_PASSWORD })
  const editor = track(edt.page)
  await step('the editor sees only their own actions, cannot open the administrator\'s, and the assistant refuses an action the editor\'s role may not do', async () => {
    await fresh(editor)
    await propose(editor, 'proposeProjectNote', { projectRef: seeded.fourthRef, body: 'The editor\'s own note.', reason: 'Asked by the editor.' })
    const mine = lastReference()
    await editor.goto(`${BASE}/admin/automation?tab=history`, { waitUntil: 'domcontentloaded' })
    await editor.getByRole('heading', { name: 'Filters' }).waitFor({ timeout: 15000 })
    await editor.getByText('You see your own actions.').waitFor({ timeout: 10000 })
    expect((await editor.locator('tbody tr').count()) === 0, 'the editor sees the administrator\'s history')
    await editor.goto(`${BASE}/admin/automation/${seeded.noteAction}`, { waitUntil: 'domcontentloaded' })
    await editor.getByText('This action does not exist, or you may not see it.').first().waitFor({ timeout: 15000 })
    await fresh(editor)
    await propose(editor, 'proposeConsultationClosure', { startDate: dayOffset(60), endDate: dayOffset(61), reason: 'Away.' })
    expect(count("SELECT COUNT(*) AS n FROM ai_actions a JOIN admin_users u ON u.id = a.admin_id WHERE u.email = ? AND a.action_type = 'consultation.close_days'", EDITOR) === 0, 'the editor got a closing proposed')
    // The administrator sees the editor's proposal in the list and may decide it.
    await page.goto(`${BASE}/admin/automation`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('link', { name: `Open ${mine}` }).waitFor({ timeout: 15000 })
    await shot(editor, 'G-editor')
  })

  console.log('H  Three languages, light and dark, phone widths')
  await step('the decision page speaks Hungarian and Dutch on request, and remembers the pick', async () => {
    await page.goto(`${BASE}/admin/automation/${seeded.noteAction}`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Language of this screen').selectOption('hu')
    await page.getByRole('heading', { name: 'Előzmények' }).waitFor({ timeout: 10000 })
    expect((await page.locator('main').innerText()).includes('Belső projektjegyzet felvétele'), 'the Hungarian type name is missing')
    await page.getByLabel('A képernyő nyelve').selectOption('nl')
    await page.getByRole('heading', { name: 'Geschiedenis' }).waitFor({ timeout: 10000 })
    expect((await page.locator('main').innerText()).includes('Interne projectnotitie toevoegen'), 'the Dutch type name is missing')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Geschiedenis' }).waitFor({ timeout: 10000 })
    await page.getByLabel('Taal van dit scherm').selectOption('en')
  })
  for (const [width, height, label] of [[1024, 768, 'tablet'], [390, 844, 'phone'], [320, 640, 'narrow phone']]) {
    await step(`the list and a decision page on a ${label} (${width} px) do not scroll sideways and can be used (light theme too)`, async () => {
      const small = await signIn(browser, { email: EMAIL, password: PASSWORD, width, height, mobile: width < 500, scheme: 'light' })
      const view = track(small.page)
      await view.goto(`${BASE}/admin/automation?tab=history`, { waitUntil: 'domcontentloaded' })
      await view.getByRole('heading', { name: 'Filters' }).waitFor({ timeout: 15000 })
      await noSideways(view, `${label} list`)
      await view.goto(`${BASE}/admin/automation/${seeded.completeAction}`, { waitUntil: 'domcontentloaded' })
      await view.getByRole('heading', { name: 'History' }).waitFor({ timeout: 15000 })
      await noSideways(view, `${label} detail`)
      await shot(view, `H-${width}`)
      expect(small.problems.length === 0, `console problems: ${small.problems.join(' | ')}`)
      await small.context.close()
    })
  }

  console.log('I  Nothing else changed')
  await step('no console error on any screen, the standing audit lines exist for every step, and the history is whole', async () => {
    expect(adm.problems.length === 0, `administrator console: ${adm.problems.join(' | ')}`)
    expect(edt.problems.length === 0, `editor console: ${edt.problems.join(' | ')}`)
    expect(count("SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'ai_action.%'") >= 20, 'the audit log lacks the lifecycle lines')
    expect(count("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'ai_action.approval_granted'") === 3, 'the approvals are not three')
    const verdict = await adm.call('GET', '/api/admin/automation/integrity')
    expect(verdict.status === 200 && verdict.json.data.ok === true, `integrity: ${JSON.stringify(verdict.json).slice(0, 200)}`)
  })

  await browser.close()
  console.log(`\n${passed}/${passed + failed} steps passed`)
  process.exit(failed ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(3)
})
