// PROJECT DISCOVERY (PROMPT 30) at the viewports the brief names, in the states a visitor really meets: the /control-room page and the floating panel with the
// discovery on the Project, Requirements and Plan views (empty, with the assistant's proposals waiting for a confirmation, with long unbroken words, with the add form
// and the complexity explanation open, the plan out of date, an older version, the review with what is missing and with the send form, a refused change).
// In every state: the layout checks of audit-matrix.cjs (sideways scrolling, elements outside the screen, text and targets too small) and axe (WCAG 2.2 AA + best practice),
// in both themes and the three languages, with reduced motion. Needs the BUILT site served by a backend whose model is the local stand-in (see tools/e2e/discovery-journey.cjs
// for the set-up) with the assistant verified and switched on (node tools/e2e/ai-activate.cjs ...). It chats: use a throw-away database with raised limits.
//
// usage: AUDIT_PLAYWRIGHT=... AUDIT_AXE=... node tools/audit/audit-discovery.cjs --base=http://127.0.0.1:8811 --standin=http://127.0.0.1:9911 \
//          --sizes=320x640,390x844,768x1024,1024x768,1440x900 [--langs=en,hu,nl] [--themes=dark,light] [--no-axe] [--shots] [--out=dir]
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
if (OUT) fs.mkdirSync(OUT, { recursive: true })

// The few words the script needs per language (a fragment of each in src/content/ai/discovery.ts).
const WORDS = {
  generate: { hu: /Terv készítése/, en: /Generate the plan/, nl: /Plan maken/ },
  regenerate: { hu: /Terv újragenerálása/, en: /Regenerate the plan/, nl: /Plan opnieuw maken/ },
  add: { hu: /Új követelmény/, en: /Add a requirement/, nl: /Een eis toevoegen/ },
  why: { hu: /Miért ez a besorolás/, en: /Why this level/, nl: /Waarom dit niveau/ },
  view: { hu: /^Megnézem: /, en: /^View: /, nl: /^Bekijken: / },
  review: { hu: /Átnézés elküldés előtt/, en: /Review before sending/, nl: /Nalezen voor het versturen/ },
  steps: { hu: /A projektfeltárás lépései/, en: /The steps of the discovery/, nl: /De stappen van de verkenning/ },
}
// Long words on purpose: what a visitor writes is theirs, and the layout has to hold whatever they write.
const LONG = 'Internationalisation_and_localisation_of_everything_without_any_whitespace_at_all_and_then_some_more_letters'
const URLISH = 'https://example.com/a/very/long/address/that/has/no/break/points/at/all/and/keeps/going/and/going'

const findings = []
let states = 0
async function inspect(page, label) {
  states += 1
  await page.waitForTimeout(300)
  const issues = await page.evaluate(layoutCheck)
  if (WITH_AXE) {
    for (const v of await axeRun(page)) issues.push(`axe ${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target} ${n.summary ?? ''}`).slice(0, 2).join(' | ')}`)
  }
  if (issues.length) findings.push({ label, issues })
  if (OUT && process.argv.includes('--shots')) await page.screenshot({ path: path.join(OUT, `${label.replace(/[^a-z0-9]+/gi, '-')}.png`) })
}

;(async () => {
  const browser = await launch()
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
          await page.goto(`${BASE}/${lang}/control-room/`, { waitUntil: 'load' })
          const box = page.getByLabel({ hu: 'Üzeneted a Control Room AI-nak', en: 'Your message to Control Room AI', nl: 'Je bericht aan Control Room AI' }[lang])
          await box.waitFor({ timeout: 20000 })
          const plan = page.locator('#control-room-plan')
          const showPlan = async () => {
            if (phone) await page.locator('#cr-tab-plan').click()
          }
          const showChat = async () => {
            if (phone) await page.locator('#cr-tab-chat').click()
          }
          const tool = async (name, input) => {
            const before = await page.getByText('Tool result received.').count()
            await box.fill(`TOOL:${name}:${JSON.stringify(input)}`)
            await box.press('Enter')
            await page.getByText('Tool result received.').nth(before).waitFor({ timeout: 20000 })
            await page.waitForTimeout(500)
          }
          const tab = (index) => plan.getByRole('tab').nth(index)

          await showPlan()
          await inspect(page, `${tag} page: discovery, nothing said yet`)
          await showChat()
          // The assistant fills the discovery with long, unbroken words, so the layout is tried where it is weakest.
          await tool('classifyProjectType', { type: 'web_app' })
          await tool('updateDiscoveryStage', { facts: { projectName: LONG.slice(0, 70), objective: `Dispatch drivers faster. ${LONG} ${URLISH}`, audience: URLISH.slice(0, 120), timeline: 'this autumn' } })
          await tool('extractProjectRequirements', {
            requirements: [
              { title: LONG.slice(0, 95), description: `${URLISH} ${LONG}`, category: 'integration', priority: 'essential', statedByVisitor: true },
              { title: 'Driver app with offline mode', category: 'accounts', priority: 'essential', statedByVisitor: true },
              { title: 'Live map and exports', category: 'data', priority: 'important', statedByVisitor: false, complexity: 'high' },
              { title: 'Customer tracking page', category: 'communication', priority: 'optional', statedByVisitor: false },
              { title: 'Mobile apps later', category: 'other', priority: 'future', statedByVisitor: true },
            ],
          })
          await tool('assessProjectComplexity', { signals: { roles: 'many', dataModel: 'complex', authentication: 'advanced', security: 'elevated', integrations: 3, languages: 3 } })
          await showPlan()
          await inspect(page, `${tag} page: project view, the assistant's proposals waiting`)
          await plan.locator('details summary').filter({ hasText: WORDS.why[lang] }).first().click()
          await plan.locator('details summary').filter({ hasText: WORDS.steps[lang] }).first().click()
          await inspect(page, `${tag} page: project view, the complexity and the steps explained`)
          await tab(1).click()
          await inspect(page, `${tag} page: requirements view`)
          await plan.locator('details summary').filter({ hasText: WORDS.add[lang] }).first().click()
          await inspect(page, `${tag} page: requirements view, the add form open`)
          // Confirm every requirement the assistant proposed (the visitor accepts them), the way a visitor would.
          for (let i = 0; i < 6; i += 1) {
            const target = plan.locator('li button').filter({ hasText: /^(Confirm|Megerősítem|Bevestigen)$/ }).first()
            if (!(await target.count()) || !(await target.isEnabled().catch(() => false))) break
            await target.click()
            await page.waitForTimeout(250)
          }
          await inspect(page, `${tag} page: requirements view, confirmed`)
          await tab(2).click()
          await inspect(page, `${tag} page: plan view, nothing generated yet`)
          await plan.getByRole('button', { name: WORDS.generate[lang] }).click()
          await plan.getByText(WORDS.review[lang]).first().waitFor({ timeout: 15000 })
          await inspect(page, `${tag} page: plan view, the plan and the review with the send form`)
          // The draft moves on: the plan is out of date.
          await tab(0).click()
          await plan.locator('form textarea').first().fill(`A changed objective ${LONG}`)
          await plan.locator('form button[type=submit]').first().click()
          await page.waitForTimeout(500)
          await tab(2).click()
          await inspect(page, `${tag} page: plan view, out of date`)
          await plan.getByRole('button', { name: WORDS.regenerate[lang] }).click()
          await plan.getByText(WORDS.review[lang]).first().waitFor({ timeout: 15000 })
          await plan.getByRole('button', { name: WORDS.view[lang] }).first().click()
          await page.waitForTimeout(400)
          await inspect(page, `${tag} page: plan view, an older version (read only)`)
          // A change from another tab (the version moves) is refused with a plain sentence, and the panel reloads what is true.
          await page.evaluate(async () => {
            const stored = JSON.parse(sessionStorage.getItem('cc-ai') || '{}')
            const route = `/api/ai/conversations/${stored.conversationId}/discovery`
            const headers = { 'Content-Type': 'application/json', 'X-AI-Session': stored.token }
            const read = await (await fetch(route, { headers })).json()
            await fetch(`${route}/facts`, { method: 'PUT', headers, body: JSON.stringify({ expectedVersion: read.data.version, facts: { budget: 'a modest amount' } }) })
          })
          await tab(0).click()
          await plan.locator('form textarea').first().fill('Another edit from the first tab')
          await plan.locator('form button[type=submit]').first().click()
          await plan.getByRole('alert').first().waitFor({ timeout: 8000 }).catch(() => undefined)
          await inspect(page, `${tag} page: a change refused because the project moved on`)

          // ---- the floating panel, on another page, with the same conversation
          await page.goto(`${BASE}/${lang}/`, { waitUntil: 'load' })
          const launcher = page.getByRole('button', { name: { hu: 'Control Room AI megnyitása', en: 'Open Control Room AI', nl: 'Control Room AI openen' }[lang] })
          await launcher.waitFor({ timeout: 20000 })
          await launcher.click()
          await page.locator('dialog[open] textarea').waitFor({ timeout: 10000 })
          const planTab = page.locator('#assistant-tab-plan')
          if (await planTab.isVisible().catch(() => false)) {
            await planTab.click()
            await inspect(page, `${tag} panel: the discovery`)
            await page.locator('dialog[open] [role=tab]').nth(1).click().catch(() => undefined)
            await inspect(page, `${tag} panel: the discovery, requirements`)
          }
        } catch (error) {
          findings.push({ label: tag, issues: [`the audit could not continue: ${String(error.message || error).split('\n')[0]}`] })
          if (OUT) await page.screenshot({ path: path.join(OUT, `ERROR-${tag.replace(/\W+/g, '-')}.png`) }).catch(() => undefined)
        }
        if (errors.length) findings.push({ label: tag, issues: [`console: ${[...new Set(errors)].slice(0, 3).join(' | ')}`] })
        await context.close()
      }
    }
  }
  console.log(`discovery audit: ${states} states at ${sizes.map((s) => s.join('x')).join(', ')} (${themes.join('+')}, ${langs.join('+')}${WITH_AXE ? ', axe' : ''})`)
  if (!findings.length) console.log('discovery audit: no findings')
  for (const f of findings) console.log(`- ${f.label}: ${f.issues.join('  ||  ')}`)
  await browser.close()
  process.exit(findings.length ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})
