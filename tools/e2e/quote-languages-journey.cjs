// PROMPT 18, test F: a quote request completed on a PHONE in each language, against the BUILT site served by the real backend
// (one origin, a throw-away database, the `file` e-mail provider: see tools/e2e/README.md for the set-up).
//   MSYS_NO_PATHCONV=1 VITE_API_URL=/ npm run build
//   (start the backend with STATIC_DIR=<absolute path of dist>, EMAIL_PROVIDER=file, as in tools/e2e/README.md)
//   AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/quote-languages-journey.cjs --base=http://127.0.0.1:8788 --mail=<mail folder>
// For every language it walks the six-step builder and the FULL EXPERIENCE questionnaire at 390 x 844 with touch, and at each step checks
// that nothing scrolls sideways or sticks out of the screen, that no raw key or English sentence is on a Hungarian or Dutch page, and that
// the request is accepted by the backend and answered in the visitor's language.
const fs = require('fs')
const { launch, layoutCheck, SEEN } = require('../audit/lib.cjs')

const arg = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3) || fallback
const BASE = arg('base', 'http://127.0.0.1:8788')
const MAIL = arg('mail', '')

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const WORDS = {
  hu: { next: /^Tovább$/, send: /Ajánlatkérés elküldése|Ajánlatkérés küldése/, sentTitle: /Elküldve|Megkaptuk a kérésedet/, ownerLanguage: 'magyar' },
  en: { next: /^Next$/, send: /Send quote request|Send the request/, sentTitle: /Sent|We have your request/, ownerLanguage: 'English' },
  nl: { next: /^Volgende$/, send: /Offerteaanvraag versturen|Aanvraag versturen/, sentTitle: /Verstuurd|We hebben je aanvraag/, ownerLanguage: 'Nederlands' },
}
// What the visitor types is theirs, in their language; the page around it is what is checked.
const TYPED = {
  hu: 'Egy kis weboldalt szeretnék a pékségemnek, nyitvatartással, étlappal és tortarendeléssel.',
  en: 'A small website for my bakery with opening hours, a menu and a way to order a cake.',
  nl: 'Een kleine website voor mijn bakkerij met openingstijden, een menu en een manier om een taart te bestellen.',
}
const FIELDS = {
  hu: { name: /^Neved$|A neved/, email: /E-mail/, consent: /Tudomásul veszem/ },
  en: { name: /Your name/, email: /Email address|Your email address/, consent: /I understand/ },
  nl: { name: /Je naam/, email: /E-mailadres|Je e-mailadres/, consent: /Ik begrijp/ },
}
const ENGLISH = /\b(the|and|with|your|you|for|of|are|will|what|that|this|from|about)\b/gi

async function step(page, lang, label) {
  await page.waitForTimeout(250)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const problems = await page.evaluate(layoutCheck)
  const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
  const english = lang === 'en' ? [] : text.split('\n').filter((line) => line.split(/\s+/).length >= 7 && (line.match(ENGLISH) || []).length >= 3)
  const raw = /\b(?:[a-z][a-zA-Z0-9]*\.){2,}[a-zA-Z][a-zA-Z0-9]*\b/.test(text.replace(/\b(?:example|nfsu2)\.\w+/g, ''))
  check(`${lang} ${label}: no sideways scroll, nothing off-screen, readable, in ${lang.toUpperCase()}`, overflow <= 1 && problems.length === 0 && english.length === 0 && !raw, [overflow > 1 ? `overflow ${overflow}px` : '', ...problems, ...english.slice(0, 1), raw ? 'raw key' : ''].filter(Boolean).join(' | '))
}

async function sixSteps(browser, lang) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  await context.addInitScript(SEEN)
  const page = await context.newPage()
  await page.goto(`${BASE}/${lang}/services/configure/`, { waitUntil: 'networkidle' })
  const next = () => page.getByRole('button', { name: WORDS[lang].next }).first().tap()
  await step(page, lang, 'builder, step 1 (what do you need)')
  await page.locator('main input[type=checkbox]').first().check()
  await next()
  await step(page, lang, 'builder, step 2 (package)')
  await page.locator('main input[type=radio]').first().check()
  await next()
  await step(page, lang, 'builder, step 3 (add-ons)')
  await next()
  await step(page, lang, 'builder, step 4 (the project)')
  await page.locator('main textarea').first().fill(TYPED[lang])
  await next()
  await step(page, lang, 'builder, step 5 (review)')
  await next()
  await step(page, lang, 'builder, step 6 (contact and send)')
  await page.getByRole('textbox', { name: FIELDS[lang].name }).first().fill('Test Visitor')
  await page.getByRole('textbox', { name: FIELDS[lang].email }).first().fill(`visitor-${lang}@example.test`)
  await page.getByRole('checkbox', { name: FIELDS[lang].consent }).check()
  await page.getByRole('button', { name: WORDS[lang].send }).first().tap()
  await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('main')?.innerText ?? ''), WORDS[lang].sentTitle.source, { timeout: 20000 }).catch(() => {})
  const body = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
  check(`${lang} builder: the request was accepted and the confirmation is in ${lang.toUpperCase()}`, WORDS[lang].sentTitle.test(body), body.split('\n').slice(0, 3).join(' / '))
  await step(page, lang, 'builder, confirmation')
  await context.close()
}

async function fullExperience(browser, lang) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  await context.addInitScript(SEEN)
  const page = await context.newPage()
  await page.goto(`${BASE}/${lang}/services/full-experience/start/`, { waitUntil: 'networkidle' })
  // The questions: take the first option of each, skip nothing that is required, until the description step appears.
  for (let guard = 0; guard < 10; guard += 1) {
    await step(page, lang, `FULL EXPERIENCE, question ${guard + 1}`)
    if ((await page.locator('main textarea').count()) > 0) break
    const option = page.locator('main input[type=radio], main input[type=checkbox]').first()
    if ((await option.count()) > 0) await option.check({ force: true }).catch(() => {})
    await page.getByRole('button', { name: WORDS[lang].next }).first().tap()
  }
  await page.locator('main textarea').first().fill(TYPED[lang])
  await page.getByRole('button', { name: WORDS[lang].next }).first().tap().catch(() => {})
  await step(page, lang, 'FULL EXPERIENCE, contact step')
  await page.getByRole('textbox', { name: FIELDS[lang].name }).first().fill('Test Visitor')
  await page.getByRole('textbox', { name: FIELDS[lang].email }).first().fill(`full-${lang}@example.test`)
  await page.getByRole('checkbox', { name: FIELDS[lang].consent }).check()
  await page.getByRole('button', { name: /Ajánlatkérés küldése|Send the request|Aanvraag versturen/ }).first().tap()
  await page.waitForFunction(() => /Megkaptuk|We have your request|We hebben je aanvraag/.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 20000 }).catch(() => {})
  const body = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
  check(`${lang} FULL EXPERIENCE: accepted, confirmation in ${lang.toUpperCase()}`, WORDS[lang].sentTitle.test(body), body.split('\n').slice(0, 3).join(' / '))
  await step(page, lang, 'FULL EXPERIENCE, confirmation')
  await context.close()
}

;(async () => {
  const before = MAIL && fs.existsSync(MAIL) ? fs.readdirSync(MAIL).length : 0
  const browser = await launch()
  for (const lang of ['hu', 'en', 'nl']) {
    await sixSteps(browser, lang).catch((error) => check(`${lang} builder ran to the end`, false, String(error.message).split('\n')[0]))
    await fullExperience(browser, lang).catch((error) => check(`${lang} FULL EXPERIENCE ran to the end`, false, String(error.message).split('\n')[0]))
  }
  await browser.close()
  if (MAIL && fs.existsSync(MAIL)) {
    const after = fs.readdirSync(MAIL).length
    check('The backend wrote the owner notifications (6 requests, one e-mail file each)', after - before >= 6, `${after - before} files`)
  }
  const failed = results.filter((ok) => !ok).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  process.exit(failed ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
