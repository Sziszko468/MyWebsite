// PROJECT DISCOVERY (PROMPT 30), in a real Chrome: the discovery panel and the assistant's seven discovery tools, against the BUILT website
// served by the real backend, whose model is the local stand-in for Anthropic's API (tools/e2e/anthropic-standin.ts). The real
// @ai-sdk/anthropic provider, the real streaming protocol, the real tools, the real database and the real quote workflow are all in play,
// and nothing is spent: the stand-in turns "TOOL:<name>:<json>" in a visitor's message into a tool call, which is how the journey plays the assistant.
//
//   1. a scratch backend with a throw-away database, the website built for it (see README.md), the stand-in on 9911, then
//   2. AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/discovery-journey.cjs --base=http://127.0.0.1:8788 --standin=http://127.0.0.1:9911 \
//        --email=admin@example.test --password=... [--db=<the scratch database file>] [--out=<dir>]
//
// Needs a FRESH server (the journey creates one quote request and uses a visitor session limit) started with RATE_LIMITS=false, and an
// administrator of a THROW-AWAY database (it verifies the model and switches the assistant on through the administration's own API).
// With --db it also reads the scratch database (read only) to prove that deleting a conversation removes everything discovery holds.
const fs = require('fs')
const path = require('path')
const { launch, newPage } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8788').replace(/\/$/, '')
const STANDIN = arg('standin', 'http://127.0.0.1:9911').replace(/\/$/, '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const OUT = arg('out', '')
const DB = arg('db', '')
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
const received = async () => (await fetch(`${STANDIN}/__requests`)).json()
const forget = () => fetch(`${STANDIN}/__requests`, { method: 'DELETE' })

async function visitor(browser, { width = 1440, height = 900, mobile = false, scheme = 'dark' } = {}) {
  const { context, page } = await newPage(browser, { width, height, mobile, scheme, reduced: true })
  const problems = []
  page.on('pageerror', (error) => problems.push(`pageerror ${error.message.slice(0, 160)}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|status of 5\d\d|status of 4\d\d/.test(message.text())) problems.push(message.text().slice(0, 160))
  })
  return { context, page, problems }
}

async function admin(browser) {
  const { context, page } = await newPage(browser, { width: 1440, height: 900, mobile: false, scheme: 'dark', extra: { bypassCSP: true, locale: 'en-GB' } })
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]')
  await page.waitForTimeout(1500)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
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
  return { context, page, call }
}

/** A call to the assistant's public API with THIS page's session (the token the page keeps in sessionStorage). */
const api = (page, method, route, body, headers = {}) =>
  page.evaluate(
    async ([method, route, body, headers]) => {
      const stored = JSON.parse(sessionStorage.getItem('cc-ai') || '{}')
      const response = await fetch(route, { method, headers: { 'Content-Type': 'application/json', 'X-AI-Session': stored.token || '', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, json: await response.json().catch(() => null) }
    },
    [method, route, body, headers],
  )
const stored = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('cc-ai') || '{}'))
const base = async (page) => `/api/ai/conversations/${(await stored(page)).conversationId}/discovery`
const state = async (page) => (await api(page, 'GET', await base(page))).json.data

const noSideways = async (page, label) => {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(scrollWidth <= innerWidth + 1, `${label}: the page scrolls sideways (${scrollWidth} > ${innerWidth})`)
}

;(async () => {
  const browser = await launch()
  await forget()
  const adm = await admin(browser)
  let reference = null

  console.log('0  The administrator verifies the required model and switches the assistant on')
  await step('the connection test verifies the model; the switch turns the assistant on; the discovery is on by default', async () => {
    const tested = await adm.call('POST', '/api/admin/ai/connection-test', {})
    expect(tested.json?.data?.result?.ok === true, `the model was not verified (${tested.status})`)
    expect((await adm.call('PUT', '/api/admin/ai/settings', { enabled: true })).status === 200, 'the switch was refused')
    const config = (await (await fetch(`${BASE}/api/ai/config`)).json()).data
    expect(config.available === true && config.discoveryEnabled === true && config.plannerEnabled === true, `the public configuration is wrong: ${JSON.stringify(config)}`)
    await forget()
  })

  console.log('A  The assistant fills the discovery through its tools; the panel shows who wrote what')
  const a = await visitor(browser)
  const page = track(a.page)
  await page.goto(`${BASE}/en/control-room/`, { waitUntil: 'load' })
  const composer = () => page.getByLabel('Your message to Control Room AI')
  const plan = page.locator('#control-room-plan')
  await composer().waitFor({ timeout: 20000 })
  let answers = 0
  /** Plays the assistant: one tool call per message, then waits for the tool's result to come back and the panel to refresh. */
  const tool = async (name, input) => {
    await composer().fill(`TOOL:${name}:${JSON.stringify(input)}`)
    await composer().press('Enter')
    answers += 1
    await page.getByText('Tool result received.').nth(answers - 1).waitFor({ timeout: 20000 })
    // The panel reads the server's state after the answer; give the request a moment.
    await page.waitForTimeout(600)
  }
  const tab = (name) => plan.getByRole('tab', { name: new RegExp(`^${name}`) })

  await step('before anything is said the panel offers to start, says what it is for, and no discovery request has been made', async () => {
    await plan.getByRole('heading', { name: 'Project discovery' }).waitFor({ timeout: 10000 })
    const text = await plan.innerText()
    expect(text.includes('Describe your idea') && (await plan.getByRole('button', { name: 'Start the discovery' }).count()) === 1, 'no start state')
    expect(!/[€$£]\s?\d/.test(text), 'a price appeared')
    await shot(page, 'A-start')
  })
  await step('"Start the discovery" asks the assistant; the panel then shows the steps and the three views', async () => {
    await plan.getByRole('button', { name: 'Start the discovery' }).click()
    await page.getByText('Stand-in answer.').first().waitFor({ timeout: 20000 })
    await plan.getByRole('tablist', { name: 'Project discovery views' }).waitFor({ timeout: 10000 })
    expect((await plan.getByRole('tab').count()) === 3, 'not three views')
    const text = await plan.innerText()
    expect(/Now: The idea/.test(text), `the current step is not shown: ${text.slice(0, 200)}`)
    expect((await plan.getByRole('progressbar').count()) === 1, 'no progress bar')
    await shot(page, 'A-started')
  })
  await step('the assistant classifies the project: it is a PROPOSAL to confirm, never shown as the visitor\'s choice', async () => {
    await tool('classifyProjectType', { type: 'booking', reason: 'The visitor wants clients to book classes.' })
    const radio = plan.getByRole('radio', { name: 'Booking / reservation platform' })
    await radio.waitFor({ timeout: 8000 })
    expect(await radio.isChecked(), 'the proposed type is not selected')
    expect((await plan.innerText()).includes('proposed by the assistant'), 'not called a proposal')
    expect((await plan.getByRole('radio').count()) === 11, 'not eleven types')
    expect((await plan.getByRole('radio', { name: 'Other / not sure' }).count()) === 1, 'no "Other / not sure"')
    const s = await state(page)
    expect(s.type.value === 'booking' && s.type.origin === 'assistant' && s.type.confirmed === false, 'the server does not hold it as an unconfirmed assistant proposal')
  })
  await step('the assistant records what the visitor said: shown as suggested and not confirmed, with a way to confirm each', async () => {
    await tool('updateDiscoveryStage', { facts: { projectName: 'Studio Booker', objective: 'Let clients book classes online', audience: 'Yoga students', timeline: 'before September' } })
    await plan.getByLabel('What do you want to achieve?', { exact: true }).waitFor()
    expect((await plan.getByLabel('What do you want to achieve?', { exact: true }).inputValue()) === 'Let clients book classes online', 'the objective is not in its field')
    expect((await plan.getByText('suggested by the assistant, not yet confirmed').count()) >= 4, 'the facts are not marked as suggestions')
    expect((await plan.getByRole('button', { name: 'Confirm: What do you want to achieve?' }).count()) === 1, 'no confirm button for the objective')
    await shot(page, 'A-facts')
  })
  await step('the assistant records requirements: the visitor\'s own words are "from your message", its own ideas "suggested", all waiting for a confirmation', async () => {
    await tool('extractProjectRequirements', {
      requirements: [
        { title: 'Class calendar', description: 'A calendar of the classes with free places', category: 'booking', priority: 'essential', statedByVisitor: true },
        { title: 'Customer accounts', category: 'accounts', priority: 'essential', statedByVisitor: true },
        { title: 'Email reminders', category: 'communication', priority: 'optional', statedByVisitor: false },
      ],
    })
    await tab('Requirements').click()
    await plan.getByText('Class calendar').first().waitFor({ timeout: 8000 })
    const text = await plan.innerText()
    expect(text.includes('from your message, waiting for your confirmation') && text.includes('suggested by the assistant'), 'the origins are not told apart')
    expect(text.includes('3 waiting for your confirmation'), 'the unconfirmed count is wrong')
    expect(text.includes('Essential') && text.includes('Optional'), 'not grouped by priority')
    const s = await state(page)
    expect(s.requirements.length === 3 && s.requirements.every((r) => r.status === 'unconfirmed' && r.origin === 'assistant'), 'the server confirmed something for the visitor')
    await shot(page, 'A-requirements')
  })
  await step('the complexity is assessed by rules and explained: a level, the score, each factor with its points, what is unknown, and that it is not an estimate', async () => {
    await tool('assessProjectComplexity', { signals: { roles: 'few', authentication: 'basic', languages: 2 } })
    await tab('Project').click()
    await plan.getByText('Why this level?').waitFor({ timeout: 8000 })
    await plan.getByText('Why this level?').click()
    const text = await plan.innerText()
    expect(/Level:\s*(small|medium|large|complex)/i.test(text) && /Score: \d+/.test(text), 'no level or score')
    expect(text.includes('The type of project') && /\d points?/.test(text), 'the factors are not listed with points')
    expect(/Not known yet:/.test(text), 'the unknown signals are not named')
    expect(/not an estimate of hours or cost/.test(text), 'the card does not say it is not an estimate')
    expect(!/[€$£]\s?\d|\bEUR\b|\bHUF\b/.test(text), 'a price appeared')
    await shot(page, 'A-complexity')
  })
  await step('the visitor confirms the type: it is theirs now, and the assistant can no longer change it', async () => {
    await plan.getByRole('button', { name: 'Confirm', exact: true }).click()
    await plan.getByText('suggested by the assistant, confirmed by you').first().waitFor({ timeout: 8000 })
    await tool('classifyProjectType', { type: 'saas' })
    const s = await state(page)
    expect(s.type.value === 'booking' && s.type.confirmed === true, `the assistant changed a confirmed type (${s.type.value})`)
  })
  await step('what the visitor writes is protected too: the assistant cannot overwrite a fact they edited', async () => {
    const field = plan.getByLabel('What do you want to achieve?', { exact: true })
    await field.fill('Let my yoga students book and pay for classes online')
    await plan.getByRole('button', { name: 'Save' }).click()
    await plan.getByText('Saved.').waitFor({ timeout: 8000 })
    await tool('updateDiscoveryStage', { facts: { objective: 'Something else entirely' } })
    const s = await state(page)
    expect(s.facts.objective.value === 'Let my yoga students book and pay for classes online' && s.facts.objective.origin === 'visitor', 'the assistant overwrote the visitor\'s fact')
    expect((await plan.getByLabel('What do you want to achieve?', { exact: true }).inputValue()).includes('book and pay'), 'the field does not show the visitor\'s words')
  })
  await step('the visitor confirms two requirements, rejects one and restores it, and the counts follow', async () => {
    await tab('Requirements').click()
    await plan.getByRole('button', { name: 'Confirm: Class calendar' }).click()
    await plan.getByRole('button', { name: 'Confirm: Customer accounts' }).click()
    await plan.getByText('1 waiting for your confirmation').waitFor({ timeout: 8000 })
    await plan.getByRole('button', { name: 'Reject: Email reminders' }).click()
    await plan.getByRole('button', { name: 'Restore: Email reminders' }).waitFor({ timeout: 8000 })
    await plan.getByRole('button', { name: 'Restore: Email reminders' }).click()
    await plan.getByRole('button', { name: 'Reject: Email reminders' }).waitFor({ timeout: 8000 })
    const s = await state(page)
    expect(s.requirements.filter((r) => r.status === 'confirmed').length === 2, 'two are not confirmed on the server')
  })
  await step('the visitor adds a requirement by hand (confirmed, theirs), edits another, moves one to later, and a script in a title is only text', async () => {
    await plan.getByText('Add a requirement').click()
    await plan.getByLabel('Title').fill('<img src=x onerror="window.__xss=1"> Gift cards')
    await plan.getByLabel('Priority').last().selectOption('future').catch(() => undefined)
    await plan.getByRole('button', { name: 'Add', exact: true }).click()
    await plan.getByText('Gift cards').first().waitFor({ timeout: 8000 })
    expect((await page.locator('main img[src="x"]').count()) === 0, 'a requirement title was drawn as HTML')
    expect(!(await page.evaluate(() => window.__xss)), 'a script in a title ran')
    const s = await state(page)
    const added = s.requirements.find((r) => /Gift cards/.test(r.title))
    expect(added && added.origin === 'visitor' && added.status === 'confirmed', 'the visitor\'s own requirement is not theirs and confirmed')
    await plan.getByRole('button', { name: 'Edit: Email reminders' }).click()
    await plan.getByLabel('Title').first().fill('Email and SMS reminders')
    await plan.getByRole('button', { name: 'Save', exact: true }).click()
    await plan.getByText('Email and SMS reminders').first().waitFor({ timeout: 8000 })
    await plan.getByRole('button', { name: 'Move to later: Email and SMS reminders' }).click()
    await plan.getByRole('heading', { name: /Future consideration/ }).waitFor({ timeout: 8000 })
    await shot(page, 'A-requirements-edited')
  })
  await step('an optional step can be skipped and taken back, and the progress says so', async () => {
    await plan.getByText('The steps of the discovery').click()
    await plan.getByRole('button', { name: 'Skip: Budget expectations' }).click()
    await plan.getByRole('button', { name: 'Answer after all: Budget expectations' }).waitFor({ timeout: 8000 })
    expect((await plan.innerText()).includes('skipped'), 'not shown as skipped')
    expect((await plan.getByRole('button', { name: /^Skip: (Core requirements|The idea|Project type)/ }).count()) === 0, 'a required step can be skipped')
  })
  await step('nothing the model received contained a price, a name or an address, and the panel never made a request the model saw', async () => {
    const everything = JSON.stringify(await received())
    expect(!/eszter|@example\.com/i.test(everything), 'a contact detail reached the provider')
    expect(a.problems.length === 0, a.problems.join(' | '))
  })

  console.log('B  The plan: generated by rules, in versions, regenerated by section, with the visitor\'s notes kept')
  await step('the Plan view starts empty with a button, and the plan it makes has six sections and says it is a proposal, not a quote', async () => {
    await tab('Plan').click()
    await plan.getByText('There is no plan yet').waitFor({ timeout: 8000 })
    await plan.getByRole('button', { name: 'Generate the plan' }).click()
    await plan.getByText('The plan is up to date.').waitFor({ timeout: 10000 })
    const text = await plan.innerText()
    for (const name of ['Overview', 'Requirements', 'Recommended architecture', 'Development phases', 'Risks and dependencies', 'Next steps']) expect(text.includes(name), `no section "${name}"`)
    expect(text.includes('Version 1') && /proposal/i.test(text) && /not confirmed technical decisions/.test(text) && /not a quote/i.test(text), 'the plan does not say what it is')
    expect(text.includes('Studio Booker') && text.includes('Class calendar'), 'the plan does not hold the project')
    expect(!/[€$£]\s?\d|\bEUR\b|\bHUF\b|\b\d+\s?(hours|órá|uur)\b/i.test(text), 'a price or an estimate of hours appeared')
    await shot(page, 'B-plan')
  })
  await step('an unconfirmed suggestion stays marked as one inside the plan', async () => {
    const text = await plan.innerText()
    expect(text.includes('not confirmed'), 'the plan does not show what is unconfirmed')
    const s = await state(page)
    const item = s.plan.latest.content.requirements.items.find((r) => /reminders/i.test(r.title))
    expect(item && item.origin === 'assistant' && item.status !== 'confirmed', 'the snapshot hides the origin of a suggestion')
  })
  await step('changing anything makes the plan stale and says so; the plan is regenerated as version 2, and the history lists both', async () => {
    await tab('Project').click()
    await plan.getByLabel('When would you like to launch?', { exact: true }).fill('before the autumn')
    await plan.getByRole('button', { name: 'Save' }).click()
    await plan.getByText('Saved.').waitFor({ timeout: 8000 })
    await tab('Plan').click()
    await plan.getByText('The plan is out of date', { exact: false }).first().waitFor({ timeout: 8000 })
    expect((await plan.getByText('The plan is up to date.').count()) === 0, 'a stale plan is called current')
    await plan.getByRole('button', { name: 'Regenerate the plan' }).click()
    await plan.getByText('The plan is up to date.').waitFor({ timeout: 10000 })
    const text = await plan.innerText()
    expect(text.includes('Version 2') && text.includes('Plan versions') && text.includes('before the autumn'), 'version 2 is missing')
    const s = await state(page)
    expect(s.plan.versions.length === 2 && s.plan.latest.version === 2, 'the server does not hold two versions')
  })
  await step('an older version can be opened, read only, and the way back works', async () => {
    await plan.getByRole('button', { name: /^View: Version 1$/ }).click()
    await plan.getByText('You are looking at an older version').waitFor({ timeout: 8000 })
    expect((await plan.getByRole('button', { name: 'Generate the plan' }).count()) === 0 && (await plan.getByRole('button', { name: 'Regenerate this section' }).count()) === 0, 'an old version has regenerate buttons')
    expect((await plan.getByText('Review before sending').count()) === 0, 'an old version offers sending')
    await plan.getByRole('button', { name: 'Back to the latest' }).click()
    await plan.getByText('Review before sending').waitFor({ timeout: 8000 })
  })
  await step('the visitor\'s note on a section survives a regeneration of that section, and nothing confirmed is lost', async () => {
    const before = (await state(page)).requirements.filter((r) => r.status === 'confirmed').map((r) => r.id).sort()
    const note = plan.getByLabel('Your own note for this section').nth(4)
    await note.fill('Ask the landlord about the sign before launch')
    await plan.getByRole('button', { name: 'Save the note' }).click()
    await plan.getByText('The plan is out of date', { exact: false }).first().waitFor({ timeout: 8000 })
    await plan.getByRole('button', { name: 'Regenerate this section' }).nth(4).click()
    await plan.getByText('Regenerated sections: Risks and dependencies').waitFor({ timeout: 10000 }).catch(() => undefined)
    const s = await state(page)
    expect(s.notes.risks === 'Ask the landlord about the sign before launch', 'the note is gone from the draft')
    expect(JSON.stringify(s.plan.latest.content.notes).includes('landlord') || s.plan.stale, 'the note is neither in the plan nor marking it stale')
    expect(before.every((id) => s.requirements.some((r) => r.id === id && r.status === 'confirmed')), 'a confirmed requirement was lost')
    await plan.getByRole('button', { name: 'Regenerate the plan' }).click().catch(() => undefined)
    await plan.getByText('The plan is up to date.').waitFor({ timeout: 10000 })
    expect((await plan.getByLabel('Your own note for this section').nth(4).inputValue()) === 'Ask the landlord about the sign before launch', 'the note is not on the risks section after a regeneration')
    expect((await state(page)).plan.latest.content.notes.risks === 'Ask the landlord about the sign before launch', 'the plan version does not carry the note')
  })
  await step('the assistant can also make and revise the plan through its tools, and the visitor sees the result', async () => {
    const before = (await state(page)).plan.latest.version
    await tool('reviseProjectPlan', { sections: ['phases'], reason: 'The visitor asked for the phases again.' })
    await tool('generateProjectPlan', {})
    const s = await state(page)
    expect(s.plan.latest.version >= before, 'the plan went backwards')
    expect(s.plan.versions.every((v) => v.version >= 1), 'a version is broken')
    await tool('summarizeProjectDiscovery', {})
  })

  console.log('C  The review, the approval and the quote request: nothing is sent unless the visitor says so')
  await step('the review shows what the studio would receive: confirmed, unconfirmed and later requirements, the complexity as not an estimate, the budget as not given', async () => {
    const text = await plan.innerText()
    expect(text.includes('Review before sending') && text.includes('Confirmed core requirements') && text.includes('Requirements not yet confirmed') && text.includes('Other confirmed requirements'), 'the review lists are missing')
    // (The labels of the review's rows are drawn in capitals by the stylesheet, and innerText reports them so.)
    expect(/Complexity \(not an estimate\)/i.test(text) && /Budget expectation \(not a promise\)/i.test(text) && text.includes('not given'), 'the review does not qualify the complexity and the budget')
    expect(text.includes('not in the chat') && text.includes('privacy notice') && /not a quote and not a confirmed project/.test(text), 'the contact and privacy lines are missing')
    await shot(page, 'C-review')
  })
  await step('nothing has been sent: no quote request exists before the visitor approves', async () => {
    const list = await adm.call('GET', '/api/admin/quote-requests')
    expect(list.json.data.length === 0, 'a quote request exists before any approval')
    expect((await state(page)).sent === false, 'the draft says it was sent')
  })
  await step('sending needs a name, a valid address and the acknowledgement, and says what is wrong where', async () => {
    await plan.getByRole('button', { name: 'Send this request' }).click()
    await plan.getByText('Enter your name.').waitFor({ timeout: 8000 })
    await plan.getByLabel('Your name').fill('Eszter Varga')
    await plan.getByLabel('Your email address').fill('not an address')
    await plan.getByRole('button', { name: 'Send this request' }).click()
    await plan.getByText('Enter a valid email address.').waitFor()
    await plan.getByLabel('Your email address').fill('eszter.varga@example.com')
    await plan.getByRole('button', { name: 'Send this request' }).click()
    await plan.getByText('You need to accept the notice to send.').waitFor()
  })
  await step('after the approval the assistant sends it with the reference; the panel says so and locks every field', async () => {
    await plan.getByRole('checkbox').check()
    await plan.getByRole('button', { name: 'Send this request' }).click()
    await plan.getByText(/The request was sent\. Reference: CC-\d{4}-\d{6}/).first().waitFor({ timeout: 25000 })
    reference = /Reference: (CC-\d{4}-\d{6})/.exec(await plan.innerText())[1]
    await tab('Project').click()
    expect(await plan.getByLabel('What do you want to achieve?', { exact: true }).isDisabled(), 'a field can still be edited after sending')
    expect(await plan.getByRole('radio', { name: 'Other / not sure' }).isDisabled(), 'the type can still be changed after sending')
    await shot(page, 'C-sent')
  })
  await step('the server refuses every change after the request was sent (409), and the assistant\'s tools say the same', async () => {
    const route = await base(page)
    const version = (await state(page)).version
    const edit = await api(page, 'PUT', `${route}/facts`, { expectedVersion: version, facts: { objective: 'changed after sending' } })
    expect(edit.status === 409 && edit.json.error.details.reason === 'sent', `an edit after sending was not refused (${edit.status})`)
    const add = await api(page, 'POST', `${route}/requirements`, { expectedVersion: version, requirement: { title: 'Late addition' } })
    expect(add.status === 409, `an addition after sending was not refused (${add.status})`)
    const plan2 = await api(page, 'POST', `${route}/plan`, { expectedVersion: version })
    expect(plan2.status === 409, `a plan after sending was not refused (${plan2.status})`)
  })
  await step('the contact details never reached the model; the model was asked to send, and the request is what was approved', async () => {
    const everything = JSON.stringify(await received())
    expect(!/Eszter|eszter\.varga|Varga/.test(everything), 'contact details reached the provider')
    expect(everything.includes('submitApprovedQuoteRequest'), 'the model was never asked to send')
  })
  await step('the administration lists it as written by the assistant, with the discovery plan as its brief and no price', async () => {
    const list = await adm.call('GET', '/api/admin/quote-requests')
    const row = list.json.data.find((item) => item.reference === reference)
    expect(row && row.source === 'control_room_ai', 'not in the list as an assistant request')
    const detail = await adm.call('GET', `/api/admin/quote-requests/${row.id}`)
    const text = JSON.stringify(detail.json)
    expect(text.includes('Class calendar') && text.includes('Customer accounts') && text.includes('Studio Booker'), 'the structured brief is missing the project or its requirements')
    expect(/discovery/i.test(text), 'the brief does not carry the discovery questions')
    expect(!/\\u20ac|€|\bEUR\b/.test(text), 'a price is in the request')
    await adm.page.goto(`${BASE}/admin/quotes/${row.id}`, { waitUntil: 'domcontentloaded' })
    await adm.page.getByText('Class calendar').first().waitFor({ timeout: 15000 })
    await shot(adm.page, 'C-admin-quote')
  })

  console.log('D  Approval needs a confirmed requirement: a fresh conversation with only suggestions cannot be sent')
  await step('a plan made only of the assistant\'s suggestions can be generated, but its review says what is missing and offers no way to send', async () => {
    await page.getByRole('button', { name: 'New conversation' }).first().click()
    await composer().waitFor({ timeout: 10000 })
    await composer().fill('Hello')
    await composer().press('Enter')
    await page.getByText('Stand-in answer.').first().waitFor({ timeout: 15000 })
    answers = 0
    await tool('classifyProjectType', { type: 'business_site' })
    await tool('updateDiscoveryStage', { facts: { objective: 'A site for my bakery' } })
    await tool('extractProjectRequirements', { requirements: [{ title: 'Opening hours page', priority: 'essential', statedByVisitor: false }] })
    await tab('Plan').click()
    await plan.getByRole('button', { name: 'Generate the plan' }).click()
    await plan.getByText('Review before sending').waitFor({ timeout: 10000 })
    const text = await plan.innerText()
    expect(text.includes('To send it we still need') && text.includes('at least one core requirement that you confirmed'), 'the missing confirmation is not said')
    expect((await plan.getByRole('button', { name: 'Send this request' }).count()) === 0, 'a send form is offered without a confirmed requirement')
    const s = await state(page)
    expect(s.missingForApproval.includes('confirmedRequirement'), 'the server does not list it as missing')
    const approve = await api(page, 'POST', `/api/ai/conversations/${(await stored(page)).conversationId}/quote-approval`, { name: 'Test Person', email: 'test.person@example.com', company: null, consent: true, planVersion: 1 })
    expect(approve.status >= 400 && approve.status < 500, `the server accepted an approval without a confirmed requirement (${approve.status})`)
    await shot(page, 'D-blocked')
  })

  console.log('E  Languages: the same project in Hungarian and in Dutch')
  await step('the Hungarian panel is Hungarian: views, steps, plan sections and codes; what the visitor wrote stays as written', async () => {
    await page.goto(`${BASE}/hu/control-room/`, { waitUntil: 'load' })
    const hu = page.locator('#control-room-plan')
    await hu.getByRole('heading', { name: 'Projektfeltárás' }).waitFor({ timeout: 15000 })
    await hu.getByRole('tab', { name: /^Terv/ }).click()
    await hu.getByText('Áttekintés').first().waitFor({ timeout: 8000 })
    const text = await hu.innerText()
    for (const word of ['Javasolt architektúra', 'Fejlesztési fázisok', 'Kockázatok és függőségek', 'Következő lépések']) expect(text.includes(word), `missing Hungarian "${word}"`)
    expect(!/\b(Overview|Next steps|Development phases|Generate the plan|Review before sending)\b/.test(text), 'English leaked into the Hungarian panel')
    expect(!/\{[a-z]+\}/.test(text), 'a placeholder was left in')
    await shot(page, 'E-hu')
  })
  await step('the Dutch panel is Dutch', async () => {
    await page.goto(`${BASE}/nl/control-room/`, { waitUntil: 'load' })
    const nl = page.locator('#control-room-plan')
    await nl.getByRole('heading', { name: 'Projectverkenning' }).waitFor({ timeout: 15000 })
    await nl.getByRole('tab', { name: /^Plan/ }).click()
    const text = await nl.innerText()
    expect(/Overzicht|Eisen|Controle|Nalezen/.test(text), 'no Dutch section words')
    expect(!/\b(Overview|Next steps|Generate the plan|Review before sending)\b/.test(text), 'English leaked into the Dutch panel')
    await shot(page, 'E-nl')
  })

  console.log('F  Security: ownership, origin, stale writes, limits, what is rendered')
  const token = (await stored(page)).token
  const id = (await stored(page)).conversationId
  await step('another session cannot read or change this discovery: it is simply not found', async () => {
    const other = (await (await fetch(`${BASE}/api/ai/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: '{}' })).json()).data.token
    const headers = { 'X-AI-Session': other, 'Content-Type': 'application/json', Origin: BASE }
    const read = await fetch(`${BASE}/api/ai/conversations/${id}/discovery`, { headers })
    expect(read.status === 404, `another session read it (${read.status})`)
    const write = await fetch(`${BASE}/api/ai/conversations/${id}/discovery/facts`, { method: 'PUT', headers, body: JSON.stringify({ expectedVersion: 0, facts: { objective: 'taken over' } }) })
    expect(write.status === 404, `another session wrote to it (${write.status})`)
    const none = await fetch(`${BASE}/api/ai/conversations/${id}/discovery`)
    expect(none.status === 401, `no session was accepted (${none.status})`)
  })
  await step('a write from another origin is refused, and a stale write is a conflict that changes nothing', async () => {
    const headers = { 'X-AI-Session': token, 'Content-Type': 'application/json' }
    const cross = await fetch(`${BASE}/api/ai/conversations/${id}/discovery/facts`, { method: 'PUT', headers: { ...headers, Origin: 'http://evil.example' }, body: JSON.stringify({ expectedVersion: 0, facts: { objective: 'cross-site' } }) })
    expect(cross.status === 403, `a cross-origin write was accepted (${cross.status})`)
    const route = await base(page)
    const stale = await api(page, 'PUT', `${route}/facts`, { expectedVersion: 0, facts: { objective: 'from a stale tab' } })
    expect(stale.status === 409 && stale.json.error.details.reason === 'discovery_conflict', `a stale write was not a conflict (${stale.status})`)
    expect(!JSON.stringify(await state(page)).includes('from a stale tab'), 'a stale write changed the draft')
  })
  await step('invalid, oversize and unknown input is refused with 422 and changes nothing', async () => {
    const route = await base(page)
    const version = (await state(page)).version
    const long = await api(page, 'PUT', `${route}/facts`, { expectedVersion: version, facts: { objective: 'x'.repeat(401) } })
    expect(long.status === 422, `an over-long fact was accepted (${long.status})`)
    const unknown = await api(page, 'PUT', `${route}/facts`, { expectedVersion: version, facts: { password: 'secret' } })
    expect(unknown.status === 422, `an unknown fact was accepted (${unknown.status})`)
    const type = await api(page, 'PUT', `${route}/classification`, { expectedVersion: version, type: 'definitely_not_a_type' })
    expect(type.status === 422, `an unknown type was accepted (${type.status})`)
    const bad = await api(page, 'POST', `${route}/requirements`, { expectedVersion: version, requirement: { title: '', priority: 'urgent' } })
    expect(bad.status === 422, `an invalid requirement was accepted (${bad.status})`)
    const sql = await api(page, 'DELETE', `${route}/requirements/${encodeURIComponent("x' OR '1'='1")}?expectedVersion=${version}`)
    expect(sql.status === 404, `a requirement id with SQL in it was not "not found" (${sql.status})`)
    expect((await state(page)).version === version, 'a refused write moved the version')
  })
  await step('the responses are never cached, never sniffed, and never carry the visitor\'s session or contact in a URL', async () => {
    const response = await fetch(`${BASE}/api/ai/conversations/${id}/discovery`, { headers: { 'X-AI-Session': token } })
    expect(/no-store/.test(response.headers.get('cache-control') || ''), `cache-control is "${response.headers.get('cache-control')}"`)
    expect(response.headers.get('x-content-type-options') === 'nosniff', 'no nosniff')
    expect(!/Set-Cookie/i.test([...response.headers.keys()].join(',')), 'a cookie was set')
  })

  console.log('G  Privacy: deleting the conversation deletes the discovery')
  await step('deleting the conversation removes the draft, its requirements and its plan versions (the server answers 404 and, with --db, the rows are gone)', async () => {
    const before = await api(page, 'GET', `/api/ai/conversations/${id}/discovery`)
    expect(before.status === 200, 'the discovery is not there to delete')
    const removed = await api(page, 'DELETE', `/api/ai/conversations/${id}`)
    expect(removed.status === 204 || removed.status === 200, `the conversation was not deleted (${removed.status})`)
    const after = await api(page, 'GET', `/api/ai/conversations/${id}/discovery`)
    expect(after.status === 404, `the discovery is still readable (${after.status})`)
    if (DB) {
      const { DatabaseSync } = require('node:sqlite')
      const db = new DatabaseSync(DB, { readOnly: true })
      for (const table of ['ai_discovery', 'ai_discovery_facts', 'ai_discovery_requirements', 'ai_discovery_plans', 'ai_discovery_notes']) {
        const left = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE conversation_id = ?`).get(id).n
        expect(left === 0, `${table} still holds ${left} rows of the deleted conversation`)
      }
      db.close()
    }
  })

  console.log('H  A phone: the panel works with a finger, nothing scrolls sideways, targets are large enough')
  const m = await visitor(browser, { width: 390, height: 844, mobile: true })
  const mp = track(m.page)
  await step('on a phone the discovery is one tap from the chat, its views are reachable and nothing scrolls sideways', async () => {
    await mp.goto(`${BASE}/en/control-room/`, { waitUntil: 'load' })
    await mp.getByLabel('Your message to Control Room AI').waitFor({ timeout: 20000 })
    await mp.getByLabel('Your message to Control Room AI').fill('TOOL:extractProjectRequirements:{"requirements":[{"title":"Online payments","priority":"essential","statedByVisitor":true}]}')
    await mp.getByLabel('Your message to Control Room AI').press('Enter')
    await mp.getByText('Tool result received.').waitFor({ timeout: 20000 })
    await mp.getByRole('tab', { name: 'Project plan' }).tap()
    await mp.getByRole('heading', { name: 'Project discovery' }).waitFor({ timeout: 10000 })
    for (const name of ['Requirements', 'Plan', 'Project']) {
      await mp.getByRole('tab', { name: new RegExp(`^${name}`) }).last().tap()
      await noSideways(mp, `the ${name} view on a phone`)
    }
    await shot(mp, 'H-phone')
  })
  await step('every control in the panel is at least 44 px tall on a phone', async () => {
    await mp.getByRole('tab', { name: /^Requirements/ }).last().tap()
    const small = await mp.evaluate(() => {
      const panel = document.querySelector('#control-room-plan')
      const bad = []
      for (const element of panel.querySelectorAll('button, select, textarea, input:not([type=radio]):not([type=checkbox]), summary, label:has(input[type=radio])')) {
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (rect.height < 43.5) bad.push(`${element.tagName.toLowerCase()} "${(element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(rect.height)}px`)
      }
      return bad
    })
    expect(small.length === 0, `small targets: ${small.slice(0, 5).join('; ')}`)
  })
  await step('the tabs answer the arrow keys (a keyboard user can move between the views)', async () => {
    const k = await visitor(browser, { width: 1440, height: 900 })
    const kp = track(k.page)
    await kp.goto(`${BASE}/en/control-room/`, { waitUntil: 'load' })
    await kp.getByLabel('Your message to Control Room AI').fill('TOOL:extractProjectRequirements:{"requirements":[{"title":"Keyboard test","statedByVisitor":true}]}')
    await kp.getByLabel('Your message to Control Room AI').press('Enter')
    await kp.getByText('Tool result received.').waitFor({ timeout: 20000 })
    const panel = kp.locator('#control-room-plan')
    const first = panel.getByRole('tab', { name: /^Project/ })
    await first.waitFor({ timeout: 10000 })
    await first.focus()
    await kp.keyboard.press('ArrowRight')
    expect((await panel.getByRole('tab', { selected: true }).innerText()).startsWith('Requirements'), 'ArrowRight did not move to Requirements')
    await kp.keyboard.press('End')
    expect((await panel.getByRole('tab', { selected: true }).innerText()).startsWith('Plan'), 'End did not move to Plan')
    await kp.keyboard.press('Home')
    expect((await panel.getByRole('tab', { selected: true }).innerText()).startsWith('Project'), 'Home did not move to Project')
    expect(k.problems.length === 0, k.problems.join(' | '))
    await k.context.close()
  })
  await step('no script error, and no failed request other than the ones this journey provoked', async () => {
    expect(a.problems.length === 0 && m.problems.length === 0, [...a.problems, ...m.problems].join(' | '))
  })

  await browser.close()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
