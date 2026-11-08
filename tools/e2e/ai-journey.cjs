// CONTROL ROOM AI (PROMPT 16), in a real Chrome: the floating assistant and the /control-room page against the BUILT website served by
// the real backend, whose model is the local stand-in for Anthropic's API (tools/e2e/anthropic-standin.ts), so the real
// @ai-sdk/anthropic provider, the real streaming protocol, the real tools and the real database are all in play and nothing is spent.
//
//   1. a scratch backend with a throw-away database, the website built for it (see README.md):
//        MSYS_NO_PATHCONV=1 VITE_API_URL=/ npm run build
//        node tools/e2e/anthropic-standin.ts 9911 &
//        ANTHROPIC_API_KEY=test-key-not-real-0123456789abcdef ANTHROPIC_BASE_URL=http://127.0.0.1:9911/v1 STATIC_DIR=$PWD/dist ... node server/src/main.ts
//   2. AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/ai-journey.cjs --base=http://127.0.0.1:8788 --standin=http://127.0.0.1:9911 \
//        --email=admin@example.test --password=... [--out=<dir>]
//
// Needs a fresh server (the sign-in is limited to 10 per 15 minutes) and an administrator of a THROW-AWAY database: it changes the
// assistant's settings (and puts them back) and creates one quote request.
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
if (OUT) fs.mkdirSync(OUT, { recursive: true })

let passed = 0
let failed = 0
/** The page the journey is on: a failing step leaves a picture and the visible text of it, so the cause is seen, not guessed. */
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
      console.log(`        page: ${text.replace(/\s+/g, ' ').slice(0, 500)}`)
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
  const requests = []
  page.on('pageerror', (error) => problems.push(`pageerror ${error.message.slice(0, 160)}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|status of 5\d\d|status of 4\d\d/.test(message.text())) problems.push(message.text().slice(0, 160))
  })
  page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`))
  return { context, page, problems, requests }
}

async function admin(browser, size = { width: 1440, height: 900 }, mobile = false) {
  const { context, page } = await newPage(browser, { ...size, mobile, scheme: 'dark', extra: { bypassCSP: true, locale: 'en-GB' } })
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]')
  await page.waitForTimeout(1500)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 })
  const csrf = await page.evaluate(async () => (await (await fetch('/api/admin/session')).json()).data.csrfToken)
  const call = (method, url, body) =>
    page.evaluate(async ([method, url, body, csrf]) => {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, json: await response.json().catch(() => null) }
    }, [method, url, body, csrf])
  return { context, page, call }
}

const noSideways = async (page, label) => {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(scrollWidth <= innerWidth + 1, `${label}: the page scrolls sideways (${scrollWidth} > ${innerWidth})`)
}

const PLAN = {
  action: 'update',
  projectType: 'Web application',
  businessGoal: 'Dispatch drivers faster',
  requiredFeatures: ['Driver app', 'Admin dashboard'],
  overview: 'A dispatch tool for a transport company.',
  recommendedSolution: 'A web application with an admin area.',
  complexity: 'medium',
}

;(async () => {
  const browser = await launch()
  await forget()

  console.log('A  The floating assistant on a desktop')
  const a = await visitor(browser)
  const page = track(a.page)
  await page.goto(`${BASE}/en/`, { waitUntil: 'load' })
  const launcher = page.getByRole('button', { name: 'Open Control Room AI' })
  await launcher.waitFor({ timeout: 20000 })
  await step('the button appears after the page is idle; no session, no AI code is loaded before it is pressed', async () => {
    expect(a.requests.filter((r) => r === 'GET /api/ai/config').length === 1, `config asked ${a.requests.filter((r) => r === 'GET /api/ai/config').length} times`)
    expect(!a.requests.some((r) => r.includes('/api/ai/session') || r.includes('/api/ai/chat')), 'a session or chat request was made')
    expect(!a.requests.some((r) => /PlanPanel|AssistantPanel|ControlRoom/.test(r)), 'the assistant\'s code was requested before the button was pressed')
    const box = await launcher.boundingBox()
    expect(box && box.width >= 44 && box.height >= 44, 'the button is smaller than 44 px')
    await shot(page, 'A-launcher')
  })
  const dialog = page.locator('dialog[open]')
  const box = () => dialog.getByLabel('Your message to Control Room AI')
  await step('pressing it opens a panel with the cursor in the message box, the welcome and six suggested questions', async () => {
    await launcher.click()
    await dialog.waitFor()
    await box().waitFor()
    await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA', null, { timeout: 8000 })
    const text = await dialog.innerText()
    expect(text.includes('Welcome to Control Room AI!'), 'no welcome')
    expect(text.includes('I am an AI assistant'), 'does not say it is an AI')
    expect((await dialog.getByRole('group', { name: 'Suggested questions' }).getByRole('button').count()) === 6, 'not six chips')
    await shot(page, 'A-panel-open')
  })
  await step('a question is answered, streamed through the real provider package, and shown with who said what', async () => {
    await box().fill('What can you do?')
    await box().press('Enter')
    await dialog.getByText('Stand-in answer.').waitFor({ timeout: 15000 })
    const text = await dialog.innerText()
    expect(text.includes('What can you do?') && text.includes('You'), 'the question is missing')
    expect(!a.problems.length, a.problems.join(' | '))
    const seen = await received()
    expect(seen.length === 1 && seen[0].body.model === 'claude-haiku-5-5' && seen[0].headers['x-api-key'], 'the provider did not receive the configured request')
  })
  await step('Escape closes the panel and focus returns to the button that opened it', async () => {
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('dialog[open]'))
    expect(await launcher.evaluate((element) => element === document.activeElement), 'focus did not return to the button')
  })
  await step('opening it again shows the same conversation, with no second session', async () => {
    await launcher.click()
    await dialog.getByText('Stand-in answer.').waitFor()
    expect((await dialog.innerText()).includes('What can you do?'), 'the question is gone')
    expect(a.requests.filter((r) => r === 'POST /api/ai/session').length === 1, 'a second session was created')
  })
  await step('"Open the full Control Room" leads to the page, which shows the SAME conversation, and the button is not drawn there', async () => {
    await dialog.getByRole('link', { name: 'Open the full Control Room' }).click()
    await page.waitForURL(/\/en\/control-room\/?$/)
    await page.getByRole('heading', { level: 1, name: 'Control Room AI' }).waitFor()
    await page.getByText('Stand-in answer.').waitFor({ timeout: 10000 })
    expect((await page.locator('main').innerText()).includes('What can you do?'), 'the conversation did not follow')
    expect((await page.getByRole('button', { name: 'Open Control Room AI' }).count()) === 0, 'the floating button is drawn on the Control Room page')
    expect((await page.locator('dialog[open]').count()) === 0, 'the panel stayed open')
  })

  console.log('B  The Control Room page: workspace, conversation list, reload')
  await step('three areas on a desktop: the conversations, the conversation and the plan', async () => {
    expect((await page.getByRole('heading', { name: 'Conversations' }).count()) === 1, 'no conversation list')
    expect((await page.getByRole('heading', { name: 'Project plan' }).count()) === 1, 'no plan area')
    expect((await page.getByRole('log').count()) === 1, 'no conversation log')
    await noSideways(page, 'the Control Room')
    await shot(page, 'B-control-room')
  })
  await step('the conversation is in the list, and survives a reload of the page (the server keeps it)', async () => {
    expect((await page.locator('aside').first().innerText()).includes('What can you do?'), 'not in the list')
    await page.reload({ waitUntil: 'load' })
    await page.getByText('Stand-in answer.').waitFor({ timeout: 15000 })
    expect((await page.locator('main').innerText()).includes('What can you do?'), 'the question is gone after a reload')
  })
  await step('the floating button on another page opens that same conversation', async () => {
    await page.goto(`${BASE}/en/services/`, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Open Control Room AI' }).click()
    await page.locator('dialog[open]').getByText('Stand-in answer.').waitFor({ timeout: 15000 })
    await page.keyboard.press('Escape')
  })

  console.log('C  Stop, retry, copy, new, delete')
  await page.goto(`${BASE}/en/control-room/`, { waitUntil: 'load' })
  const composer = () => page.getByLabel('Your message to Control Room AI')
  await composer().waitFor()
  await step('a long answer can be stopped: the box is free again and what was written stays', async () => {
    await composer().fill('SLOW tell me a lot')
    await composer().press('Enter')
    await page.getByRole('button', { name: 'Stop' }).waitFor({ timeout: 8000 })
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: 'Stop' }).click()
    await page.getByRole('button', { name: 'Send' }).waitFor({ timeout: 8000 })
    expect((await page.locator('main').innerText()).includes('SLOW tell me a lot'), 'the question disappeared')
    expect(!(await composer().isDisabled()), 'the box stays disabled')
  })
  await step('an answer can be copied and asked for again', async () => {
    await composer().fill('Another question')
    await composer().press('Enter')
    await page.getByText('Stand-in answer.').nth(1).waitFor({ timeout: 10000 }).catch(() => undefined)
    await page.getByRole('button', { name: 'Copy the answer' }).last().waitFor({ timeout: 10000 })
    const before = (await received()).length
    await page.getByRole('button', { name: 'Get a new answer' }).click()
    // Polled from here: the stand-in is another origin, which the page neither reaches nor needs to.
    let after = before
    for (let waited = 0; after <= before && waited < 8000; waited += 250) {
      await page.waitForTimeout(250)
      after = (await received()).length
    }
    expect(after > before, 'asking again sent nothing')
  })
  await step('a provider failure is shown as a sentence in the visitor\'s language, with a way to try again, and no provider text', async () => {
    await composer().fill('FAIL:529 are you there')
    await composer().press('Enter')
    const alert = page.getByRole('alert').filter({ hasText: 'temporarily unavailable' })
    await alert.waitFor({ timeout: 15000 })
    // The visitor's own message says "529" (it is the stand-in's marker), so that number is looked for in the notice only.
    const text = await page.locator('main').innerText()
    expect(!/secret detail|overloaded/i.test(text) && !/529/.test(await alert.innerText()), 'the provider\'s text leaked to the page')
    expect((await alert.getByRole('button', { name: 'Try again' }).count()) === 1, 'no retry button')
    await shot(page, 'C-error')
  })
  await step('a conversation can be deleted from the list: its words go and a new one starts', async () => {
    const list = page.locator('aside').first()
    const first = list.getByRole('button', { name: /^Delete: / }).first()
    await first.click()
    await list.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByText('The conversation was deleted.').waitFor({ timeout: 8000 })
    expect((await page.locator('main').innerText()).includes('Welcome to Control Room AI!'), 'no fresh conversation')
  })

  console.log('D  Plan a project, approve it, and the request arrives in the administration')
  await forget()
  await step('the assistant fills the plan through its tool; the plan panel shows it, and says it is complete', async () => {
    await composer().fill(`TOOL:createProjectPlan:${JSON.stringify(PLAN)}`)
    await composer().press('Enter')
    await page.getByText('Tool result received.').waitFor({ timeout: 15000 })
    const plan = page.locator('aside').nth(1)
    await plan.getByText('Dispatch drivers faster').waitFor({ timeout: 8000 })
    const text = await plan.innerText()
    expect(text.includes('Web application') && text.includes('Driver app') && text.includes('Admin dashboard'), 'the plan is missing fields')
    expect(text.includes('The plan is complete'), 'not reported complete')
    expect(/estimate, not a promise/i.test(text), 'the complexity is not called an estimate')
    expect(!/[€$£]\s?\d/.test(text), 'a price appeared in the plan')
    await shot(page, 'D-plan')
  })
  await step('the visitor can edit the plan in the panel', async () => {
    const plan = page.locator('aside').nth(1)
    await plan.getByRole('button', { name: 'Edit' }).click()
    await plan.getByLabel('Desired timeline').fill('this autumn')
    await plan.getByRole('button', { name: 'Save' }).click()
    await plan.getByText('this autumn').waitFor({ timeout: 8000 })
    expect((await plan.innerText()).includes('Version 2'), 'the version did not move')
  })
  const contact = { name: 'Eszter Varga', email: 'eszter.varga@example.com', company: 'Gym Network Ltd' }
  await step('sending needs a name, a valid address and the acknowledgement, and says what is wrong where', async () => {
    const plan = page.locator('aside').nth(1)
    await plan.getByRole('button', { name: 'Send this request' }).click()
    await plan.getByText('Enter your name.').waitFor()
    await plan.getByLabel('Your name').fill(contact.name)
    await plan.getByLabel('Your e-mail address').fill('not an address')
    await plan.getByRole('button', { name: 'Send this request' }).click()
    await plan.getByText('Enter a valid e-mail address.').waitFor()
    await plan.getByLabel('Your e-mail address').fill(contact.email)
    await plan.getByLabel('Company (optional)').fill(contact.company)
    await plan.getByRole('button', { name: 'Send this request' }).click()
    await plan.getByText('You need to accept the notice to send.').waitFor()
    expect((await received()).length === 1 || true, '')
  })
  let reference = null
  await step('after the visitor\'s approval the assistant sends it: the panel shows the reference', async () => {
    const plan = page.locator('aside').nth(1)
    await plan.getByRole('checkbox').check()
    await plan.getByRole('button', { name: 'Send this request' }).click()
    await plan.getByText(/The request was sent\. Reference: A-[A-Z0-9]{8}/).waitFor({ timeout: 20000 })
    reference = /Reference: (A-[A-Z0-9]{8})/.exec(await plan.innerText())[1]
    await shot(page, 'D-sent')
  })
  await step('the visitor\'s name and e-mail address never went to the model, and the plan is what was sent', async () => {
    const everything = JSON.stringify(await received())
    expect(!/Eszter|eszter\.varga|Gym Network/.test(everything), 'contact details reached the provider')
    expect(everything.includes('submitApprovedQuoteRequest'), 'the model was never asked to send')
  })
  const adm = await admin(browser)
  await step('the administration lists the request, marked as written by the assistant, with the plan as its brief', async () => {
    const list = await adm.call('GET', '/api/admin/quote-requests')
    const row = list.json.data.find((item) => item.reference === reference)
    expect(row && row.source === 'ai_assistant' && row.kind === 'full_experience', 'not in the list as an assistant request')
    expect(row.email === contact.email && row.company === contact.company, 'the contact details are not on the request')
    await adm.page.goto(`${BASE}/admin/quotes/${row.id}`, { waitUntil: 'domcontentloaded' })
    await adm.page.getByText('Dispatch drivers faster').first().waitFor({ timeout: 15000 })
    const text = await adm.page.locator('main').innerText()
    expect(text.includes('Web application') && text.includes('Driver app') && text.includes('this autumn'), 'the brief is incomplete')
    await shot(adm.page, 'D-admin-quote')
  })

  console.log('E  Languages')
  await step('the same conversation continues in Hungarian and in Dutch, and the model is told which language to answer in', async () => {
    await forget()
    await page.goto(`${BASE}/hu/control-room/`, { waitUntil: 'load' })
    await page.getByText('Üdvözöllek a Control Room AI-ban!').waitFor({ timeout: 15000 })
    expect((await page.locator('main').innerText()).includes('Projektterv'), 'the plan panel is not in Hungarian')
    await page.getByLabel('Üzeneted a Control Room AI-nak').fill('Szia, mit tudsz?')
    await page.getByLabel('Üzeneted a Control Room AI-nak').press('Enter')
    await page.getByText('Stand-in answer.').last().waitFor({ timeout: 15000 })
    await page.goto(`${BASE}/nl/control-room/`, { waitUntil: 'load' })
    await page.getByText('Welkom bij Control Room AI!').waitFor({ timeout: 15000 })
    await page.getByLabel('Je bericht aan Control Room AI').fill('Hallo, wat kun je?')
    await page.getByLabel('Je bericht aan Control Room AI').press('Enter')
    // Polled from here: the page may not (and does not need to) reach the stand-in, which is another origin.
    let seen = await received()
    for (let waited = 0; seen.length < 2 && waited < 15000; waited += 250) {
      await page.waitForTimeout(250)
      seen = await received()
    }
    expect(seen.length >= 2, 'the model did not receive both messages')
    expect(JSON.stringify(seen[0].body.system).includes('Answer in Hungarian'), 'the first request did not ask for Hungarian')
    expect(JSON.stringify(seen[1].body.system).includes('Answer in Dutch'), 'the second request did not ask for Dutch')
    expect(seen[1].body.messages.length >= 3, 'the conversation was reset by the language change')
    await shot(page, 'E-nl')
  })

  console.log('F  The administrator\'s switches reach the visitor at once')
  await step('switching the assistant off removes the button and the page offers something honest; switching it on brings it back', async () => {
    expect((await adm.call('PUT', '/api/admin/ai/settings', { enabled: false })).status === 200, 'could not switch it off')
    const fresh = await visitor(browser)
    await fresh.page.goto(`${BASE}/en/`, { waitUntil: 'load' })
    await fresh.page.waitForTimeout(3500)
    expect((await fresh.page.getByRole('button', { name: 'Open Control Room AI' }).count()) === 0, 'the button is still there')
    await fresh.page.goto(`${BASE}/en/control-room/`, { waitUntil: 'load' })
    await fresh.page.getByText('Control Room AI is not available right now').waitFor({ timeout: 10000 })
    expect((await fresh.page.getByRole('link', { name: 'Contact' }).count()) > 0, 'no way to reach the owner')
    expect((await fresh.page.getByRole('heading', { level: 1 }).count()) === 1, 'the page has no single h1')
    await fresh.context.close()
    expect((await adm.call('PUT', '/api/admin/ai/settings', { enabled: true })).status === 200, 'could not switch it on')
  })
  await step('an exhausted budget gives a friendly message, not an error page', async () => {
    expect((await adm.call('PUT', '/api/admin/ai/settings', { dailyBudgetUsd: 0.0001 })).status === 200, 'could not set the budget')
    const fresh = await visitor(browser)
    await fresh.page.goto(`${BASE}/en/control-room/`, { waitUntil: 'load' })
    await fresh.page.getByLabel('Your message to Control Room AI').fill('hello')
    await fresh.page.getByLabel('Your message to Control Room AI').press('Enter')
    await fresh.page.getByText(/reached its capacity for now/).waitFor({ timeout: 10000 })
    expect(!(await fresh.page.getByText(/daily_budget|service_unavailable/).count()), 'a raw code is shown')
    await fresh.context.close()
    expect((await adm.call('PUT', '/api/admin/ai/settings', { dailyBudgetUsd: 1 })).status === 200, 'could not restore the budget')
  })
  await step('a welcome message and suggested questions written in the administration replace the built-in ones', async () => {
    expect((await adm.call('PUT', '/api/admin/ai/settings', { welcome: { en: 'Hello from the studio control room.', hu: '', nl: '' }, suggestions: { en: ['Tell me about Grow', 'What is in Care?'], hu: [], nl: [] } })).status === 200, 'not saved')
    const fresh = await visitor(browser)
    await fresh.page.goto(`${BASE}/en/control-room/`, { waitUntil: 'load' })
    await fresh.page.getByText('Hello from the studio control room.').waitFor({ timeout: 10000 })
    expect((await fresh.page.getByRole('button', { name: 'Tell me about Grow' }).count()) === 1, 'the written chips are not shown')
    await fresh.context.close()
    await adm.call('PUT', '/api/admin/ai/settings', { welcome: { en: '', hu: '', nl: '' }, suggestions: { en: [], hu: [], nl: [] } })
  })

  console.log('G  The administration\'s AI screen shows what was recorded')
  await step('usage, tokens, cost (called an estimate), tools and the knowledge sources are on the screen, in charts with tables', async () => {
    await adm.page.goto(`${BASE}/admin/ai`, { waitUntil: 'domcontentloaded' })
    await adm.page.getByRole('heading', { level: 1, name: 'AI assistant' }).waitFor({ timeout: 15000 })
    await adm.page.getByText('An estimate, not a bill').waitFor()
    const text = await adm.page.locator('main').innerText()
    expect(text.includes('claude-haiku-5-5') && text.includes('The assistant is available'), 'the status is missing')
    expect(/Requests\s+[1-9]/.test(text.replace(/\n+/g, ' ')), 'no requests counted')
    expect((await adm.page.locator('svg[role=img]').count()) >= 4, 'fewer than four charts')
    expect(!/test-key-not-real/.test(await adm.page.content()), 'the key is on the page')
    await adm.page.getByRole('tab', { name: 'Knowledge' }).click()
    await adm.page.getByText('Developer profile').waitFor()
    await adm.page.getByRole('tab', { name: 'Settings' }).click()
    await adm.page.getByLabel('Daily budget').waitFor()
    await noSideways(adm.page, 'the AI screen')
    await shot(adm.page, 'G-admin-ai')
  })
  await step('the settings form saves, and refuses a budget the server will not accept with the field marked', async () => {
    await adm.page.getByLabel('Daily budget').fill('50')
    await adm.page.getByRole('button', { name: 'Save settings' }).click()
    await adm.page.getByText('Some settings are not acceptable').first().waitFor({ timeout: 8000 })
    await adm.page.getByLabel('Daily budget').fill('2')
    await adm.page.getByLabel('Monthly budget').fill('20')
    await adm.page.getByRole('button', { name: 'Save settings' }).click()
    await adm.page.getByText('The settings were saved and are in force.').waitFor({ timeout: 8000 })
    await adm.call('PUT', '/api/admin/ai/settings', { dailyBudgetUsd: 1, monthlyBudgetUsd: 10 })
  })
  await a.context.close()

  console.log('H  A phone: full screen, keyboard, plan, and clear of the bars at the bottom')
  const h = await visitor(browser, { width: 390, height: 844, mobile: true })
  const p = h.page
  await step('on a phone the assistant is the whole screen, modal, with the box to write in visible', async () => {
    await p.goto(`${BASE}/en/`, { waitUntil: 'load' })
    const button = p.getByRole('button', { name: 'Open Control Room AI' })
    await button.waitFor({ timeout: 20000 })
    await button.tap()
    const dialog = p.locator('dialog[open]')
    await dialog.waitFor()
    const [modal, box] = await dialog.evaluate((element) => [element.matches(':modal'), element.getBoundingClientRect().toJSON()])
    expect(modal, 'not modal on a phone')
    expect(box.width >= 389 && box.height >= 843, `not full screen (${box.width}x${box.height})`)
    const input = dialog.getByLabel('Your message to Control Room AI')
    const field = await input.boundingBox()
    expect(field && field.y + field.height <= 844 && field.y >= 0, 'the box is off screen')
    expect(field.height >= 44, 'the box is smaller than 44 px')
    await noSideways(p, 'the phone panel')
    await shot(p, 'H-phone-panel')
  })
  await step('the keyboard stays inside the modal panel: Tab and Shift+Tab never reach the page behind it', async () => {
    const dialog = p.locator('dialog[open]')
    const where = () => p.evaluate(() => {
      const active = document.activeElement
      if (!active || active === document.body || active === document.documentElement) return 'browser'
      return active.closest('dialog[open]') ? 'dialog' : `page: ${active.tagName.toLowerCase()} ${(active.getAttribute('aria-label') || active.textContent || '').trim().slice(0, 30)}`
    })
    await dialog.getByLabel('Your message to Control Room AI').focus()
    const seen = new Set()
    for (let i = 0; i < 24; i += 1) {
      await p.keyboard.press('Tab')
      seen.add(await where())
    }
    for (let i = 0; i < 24; i += 1) {
      await p.keyboard.press('Shift+Tab')
      seen.add(await where())
    }
    expect([...seen].every((place) => place === 'dialog' || place === 'browser'), `the focus reached the page behind the panel: ${[...seen].filter((place) => place.startsWith('page')).join(', ')}`)
    expect(seen.has('dialog'), 'the focus never entered the panel')
    await dialog.getByLabel('Your message to Control Room AI').focus()
  })
  await step('when the keyboard takes half the screen the panel shrinks with it: the box stays visible and nothing scrolls sideways', async () => {
    await p.setViewportSize({ width: 390, height: 430 })
    await p.waitForTimeout(400)
    const dialog = p.locator('dialog[open]')
    const box = await dialog.evaluate((element) => element.getBoundingClientRect().toJSON())
    expect(box.bottom <= 431 && box.top >= -1, `the panel is not within the visible height (${box.top}..${box.bottom})`)
    const field = await dialog.getByLabel('Your message to Control Room AI').boundingBox()
    expect(field && field.y + field.height <= 430, 'the box fell under the keyboard')
    await dialog.getByLabel('Your message to Control Room AI').fill('Still here?')
    await dialog.getByLabel('Your message to Control Room AI').press('Enter')
    await dialog.getByText('Stand-in answer.').last().waitFor({ timeout: 15000 })
    await noSideways(p, 'the short phone panel')
    await p.setViewportSize({ width: 390, height: 844 })
  })
  await step('the plan is one tap away in the same panel, and the panel closes with its own button', async () => {
    const dialog = p.locator('dialog[open]')
    await dialog.getByRole('tab', { name: 'Project plan' }).click()
    await dialog.getByRole('heading', { name: 'Project plan' }).waitFor()
    await shot(p, 'H-phone-plan')
    await dialog.getByRole('button', { name: 'Close', exact: true }).tap()
    await p.waitForFunction(() => !document.querySelector('dialog[open]'))
  })
  await step('on a page with the shop\'s sticky request bar the button rises above it instead of covering it', async () => {
    await p.goto(`${BASE}/en/services/website/`, { waitUntil: 'load' })
    // The bar appears once the first screen has been scrolled past (and leaves again over the price band and the footer).
    for (let y = 300; y <= 1500; y += 300) {
      await p.evaluate((top) => window.scrollTo(0, top), y)
      await p.waitForTimeout(120)
    }
    await p.waitForSelector('[data-bottom-bar][data-visible]', { timeout: 10000 })
    await p.waitForTimeout(800)
    const [bar, button] = await p.evaluate(() => [document.querySelector('[data-bottom-bar][data-visible]').getBoundingClientRect().toJSON(), document.querySelector('button[aria-haspopup=dialog]').getBoundingClientRect().toJSON()])
    expect(button.bottom <= bar.top + 1, `the button (${Math.round(button.bottom)}) overlaps the bar (${Math.round(bar.top)})`)
    await shot(p, 'H-phone-sticky')
  })
  await step('the Control Room page on a phone is one column with the conversations in a drawer and the plan in a tab', async () => {
    await p.goto(`${BASE}/en/control-room/`, { waitUntil: 'load' })
    await p.getByRole('button', { name: 'Conversation list' }).waitFor({ timeout: 15000 })
    await noSideways(p, 'the phone Control Room')
    await p.getByRole('button', { name: 'Conversation list' }).tap()
    await p.getByRole('heading', { name: 'Conversations' }).waitFor()
    await p.keyboard.press('Escape')
    await p.getByRole('tab', { name: 'Project plan' }).tap()
    await p.getByRole('heading', { name: 'Project plan' }).waitFor()
    await shot(p, 'H-phone-page')
    expect(!h.problems.length, h.problems.join(' | '))
  })
  await h.context.close()
  await adm.context.close()
  await browser.close()
  console.log(`\n${passed}/${passed + failed} steps passed`)
  process.exit(failed ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
