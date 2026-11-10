// CONTROL ROOM AI at the viewports the brief names, in the states a visitor really meets: the /control-room page (empty, with a plan,
// with the send form's problems shown, after a provider failure), and the floating panel (open, on the plan tab, after a failure).
// In every state: the layout checks of audit-matrix.cjs (sideways scrolling, elements outside the screen, text and targets too small,
// the header, the footer) and axe (WCAG 2.2 AA + best practice). Needs the BUILT site served by a backend whose model is the local
// stand-in (see tools/e2e/ai-journey.cjs for the set-up); it chats, so use a throw-away database.
//
// usage: AUDIT_PLAYWRIGHT=... node tools/audit/audit-ai.cjs --base=http://127.0.0.1:8811 --standin=http://127.0.0.1:9911 \
//          --sizes=320x640,360x740,390x844,430x932,768x1024,1024x768,1366x768,1440x900,1920x1080 [--langs=en,hu,nl] [--themes=dark,light] [--no-axe] [--out=dir]
//
// The assistant must be verified and switched on first (node tools/e2e/ai-activate.cjs ...). With --unavailable the script audits ONE
// other state instead: the /control-room page after the required model could not be verified (PROMPT 16.1). It makes the stand-in name
// another model, sends one message to break the verification, audits the page, and puts the stand-in right again; the assistant stays
// unverified afterwards (run ai-activate.cjs again before auditing anything else).
const { launch, newPage, axeRun, layoutCheck, fs, path } = require('./lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8788').replace(/\/$/, '')
const sizes = arg('sizes', '390x844,1440x900').split(',').map((s) => s.split('x').map(Number))
const langs = arg('langs', 'en').split(',')
const themes = arg('themes', 'dark').split(',')
const OUT = arg('out', '')
const WITH_AXE = !process.argv.includes('--no-axe')
const UNAVAILABLE = process.argv.includes('--unavailable')
const STANDIN = arg('standin', 'http://127.0.0.1:9911').replace(/\/$/, '')
if (OUT) fs.mkdirSync(OUT, { recursive: true })

const WORDS = {
  open: { hu: 'Control Room AI megnyitása', en: 'Open Control Room AI', nl: 'Control Room AI openen' },
  compose: { hu: 'Üzeneted a Control Room AI-nak', en: 'Your message to Control Room AI', nl: 'Je bericht aan Control Room AI' },
}
// Long words on purpose: a plan is the visitor's and the model's text, and the layout has to hold whatever they write.
const PLAN = {
  action: 'update',
  projectType: 'Web application',
  businessGoal: 'Dispatch drivers faster across a very large number of depots without a single phone call being needed in between',
  targetAudience: 'Dispatchers, drivers and https://example.com/a/very/long/address/that/has/no/break/points/at/all/and/keeps/going',
  requiredFeatures: ['Driver app with offline mode', 'Admin dashboard with live map and exports', 'Notifications'],
  optionalFeatures: ['Customer tracking page'],
  overview: 'A dispatch tool for a transport company. Internationalisation_and_localisation_of_everything_without_any_whitespace_at_all.',
  recommendedSolution: 'A web application with an admin area and a mobile-first driver view.',
  complexity: 'medium',
  timeline: 'this autumn',
}

const findings = []
let states = 0
async function inspect(page, label) {
  states += 1
  await page.waitForTimeout(350)
  const issues = await page.evaluate(layoutCheck)
  if (WITH_AXE) {
    for (const v of await axeRun(page)) issues.push(`axe ${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target} ${n.summary ?? ''}`).slice(0, 2).join(' | ')}`)
  }
  if (issues.length) findings.push({ label, issues })
  if (OUT && process.argv.includes('--shots')) await page.screenshot({ path: path.join(OUT, `${label.replace(/[^a-z0-9]+/gi, '-')}.png`) })
}

/** The model-unavailable state: one visitor message answered by "another model" breaks the verification; then the page is audited. */
async function auditUnavailable(browser) {
  await fetch(`${STANDIN}/__control`, { method: 'POST', body: JSON.stringify({ reportModel: 'claude-sonnet-5-5' }) })
  const created = await (await fetch(`${BASE}/api/ai/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()
  const chat = await fetch(`${BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AI-Session': created.data.token },
    body: JSON.stringify({ conversationId: 'conv-audit-unverified-0123', trigger: 'submit-user-message', language: 'en', text: 'hello' }),
  })
  const body = await chat.text()
  await fetch(`${STANDIN}/__control`, { method: 'POST', body: '{}' })
  if (/Stand-in answer/.test(body) || !/model_mismatch/.test(body)) throw new Error('the reply of the other model was not refused')
  for (const [w, h] of sizes) {
    for (const theme of themes) {
      for (const lang of langs) {
        const tag = `${w}x${h} ${theme} ${lang}`
        const { context, page } = await newPage(browser, { width: w, height: h, mobile: w <= 820 || h <= 500, reduced: true, scheme: theme })
        await context.addInitScript(`try { localStorage.setItem('theme', '${theme}') } catch (e) {}`)
        try {
          await page.goto(`${BASE}/${lang}/control-room/`, { waitUntil: 'load' })
          await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 })
          const text = await page.locator('main').innerText()
          const expected = { en: /required AI model could not be verified/i, hu: /nem sikerült ellenőrizni/i, nl: /kon niet worden geverifieerd/i }[lang]
          if (!expected.test(text)) findings.push({ label: `${tag} page: unavailable`, issues: ['the fixed message about the model is not on the page'] })
          if (!(await page.getByRole('link', { name: { en: 'Contact', hu: 'Kapcsolat', nl: 'Contact' }[lang] }).count())) findings.push({ label: `${tag} page: unavailable`, issues: ['no contact alternative'] })
          await inspect(page, `${tag} page: the required model could not be verified`)
        } catch (error) {
          findings.push({ label: tag, issues: [`the audit could not continue: ${String(error.message || error).split('\n')[0]}`] })
        }
        await context.close()
      }
    }
  }
}

;(async () => {
  const browser = await launch()
  if (UNAVAILABLE) {
    await auditUnavailable(browser)
    console.log(`ai audit (model could not be verified): ${states} states at ${sizes.map((s) => s.join('x')).join(', ')} (${themes.join('+')}, ${langs.join('+')}${WITH_AXE ? ', axe' : ''})`)
    if (!findings.length) console.log('ai audit: no findings')
    for (const f of findings) console.log(`- ${f.label}: ${f.issues.join('  ||  ')}`)
    await browser.close()
    process.exit(findings.length ? 1 : 0)
  }
  for (const [w, h] of sizes) {
    for (const theme of themes) {
      for (const lang of langs) {
        const tag = `${w}x${h} ${theme} ${lang}`
        const { context, page } = await newPage(browser, { width: w, height: h, mobile: w <= 820 || h <= 500, reduced: true, scheme: theme })
        await context.addInitScript(`try { localStorage.setItem('theme', '${theme}') } catch (e) {}`)
        const errors = []
        page.on('pageerror', (e) => errors.push(`pageerror ${e.message.slice(0, 120)}`))
        page.on('console', (m) => {
          if (m.type() === 'error' && !/Failed to load resource|status of [45]\d\d|KHR_parallel|WebGL|GPU stall/i.test(m.text())) errors.push(m.text().slice(0, 120))
        })
        const phone = w <= 820
        try {
          // ---- the page
          await page.goto(`${BASE}/${lang}/control-room/`, { waitUntil: 'load' })
          const box = page.locator('main textarea')
          await box.waitFor({ timeout: 20000 })
          await inspect(page, `${tag} page: empty`)
          await box.fill(`TOOL:createProjectPlan:${JSON.stringify(PLAN)}`)
          await box.press('Enter')
          await page.getByText('Tool result received.').last().waitFor({ timeout: 20000 })
          await inspect(page, `${tag} page: conversation with a plan`)
          if (phone) {
            await page.locator('#cr-tab-plan').click()
            await inspect(page, `${tag} page: the plan tab`)
          }
          const send = page.locator('main form[aria-labelledby$="-title"] button[type=submit]')
          if (await send.count()) {
            await send.first().scrollIntoViewIfNeeded()
            await send.first().click()
            await page.waitForTimeout(300)
            await inspect(page, `${tag} page: the send form with its problems shown`)
          } else findings.push({ label: `${tag} page`, issues: ['the send form is missing from a complete plan'] })
          if (phone) await page.locator('#cr-tab-chat').click()
          await box.fill('FAIL:529 are you there')
          await box.press('Enter')
          await page.getByRole('alert').first().waitFor({ timeout: 20000 })
          await inspect(page, `${tag} page: after a provider failure`)

          // ---- the panel, on another page, with the same conversation
          await page.goto(`${BASE}/${lang}/`, { waitUntil: 'load' })
          const launcher = page.getByRole('button', { name: WORDS.open[lang] })
          await launcher.waitFor({ timeout: 20000 })
          await inspect(page, `${tag} home: with the assistant's button`)
          await launcher.click()
          await page.locator('dialog[open] textarea').waitFor({ timeout: 10000 })
          await inspect(page, `${tag} panel: open`)
          const planTab = page.locator('#assistant-tab-plan')
          if (await planTab.isVisible().catch(() => false)) {
            await planTab.click()
            await inspect(page, `${tag} panel: the plan tab`)
            await page.locator('#assistant-tab-chat').click()
          }
          await page.locator('dialog[open] textarea').fill('FAIL:529 once more')
          await page.locator('dialog[open] textarea').press('Enter')
          await page.locator('dialog[open] [role=alert]').first().waitFor({ timeout: 20000 })
          await inspect(page, `${tag} panel: after a provider failure`)
        } catch (error) {
          findings.push({ label: tag, issues: [`the audit could not continue: ${String(error.message || error).split('\n')[0]}`] })
          if (OUT) await page.screenshot({ path: path.join(OUT, `ERROR-${tag.replace(/\W+/g, '-')}.png`) }).catch(() => undefined)
        }
        if (errors.length) findings.push({ label: tag, issues: [`console: ${[...new Set(errors)].slice(0, 3).join(' | ')}`] })
        await context.close()
      }
    }
  }
  console.log(`ai audit: ${states} states at ${sizes.map((s) => s.join('x')).join(', ')} (${themes.join('+')}, ${langs.join('+')}${WITH_AXE ? ', axe' : ''})`)
  if (!findings.length) console.log('ai audit: no findings')
  for (const f of findings) console.log(`- ${f.label}: ${f.issues.join('  ||  ')}`)
  await browser.close()
  process.exit(findings.length ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})
