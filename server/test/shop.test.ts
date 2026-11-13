import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CORE_QUESTIONS, FEATURE_LEVELS, LIMITS, seedShopDocuments, parseComparison, parseFullExperience, SEED_SHOP_FILE } from '../src/modules/shop/documents.ts'
import { briefRows, readBrief } from '../src/modules/shop/brief.ts'
import { renderRequestNotification } from '../src/modules/notifications/quoteTemplates.ts'
import { quoteItems, getQuote } from '../src/modules/quotes/repository.ts'
import { startServer, type TestServer } from './helpers.ts'

let server: TestServer
let admin: { cookie: string; csrf: string; email: string }
beforeEach(async () => {
  server = await startServer()
  admin = await server.signIn('admin', 'admin@site.test')
})
afterEach(async () => {
  await server.close()
})

const headers = (who = admin) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })
const send = (method: string, path: string, body?: unknown, who = admin) => server.api(path, { method, body, headers: headers(who) })
const seed = () => JSON.parse(readFileSync(SEED_SHOP_FILE, 'utf8')) as { comparison: any; fullExperience: any }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const PACKAGES = ['launch', 'grow', 'build', 'care']

/** A FULL EXPERIENCE request the server accepts, answering the seeded questions. */
const fullExperience = (overrides: Record<string, unknown> = {}) => ({
  form: 'full_experience',
  version: 1,
  language: 'en',
  preferredLanguage: 'nl',
  answers: { type: ['web-app'], stage: ['idea'], components: ['frontend', 'backend'], budget: ['unsure'] },
  description: 'A booking platform for a network of small gyms, built from scratch.',
  name: 'Eszter Varga',
  email: 'eszter@example.com',
  company: 'Gym Network Ltd',
  consent: true,
  ...overrides,
})

describe('the shop documents', () => {
  it('are seeded once, from the website\'s own text, as a draft that is also published', async () => {
    const doc = await send('GET', '/api/admin/shop/documents/comparison')
    expect(doc.status).toBe(200)
    expect(doc.json.data.published).toEqual(doc.json.data.draft)
    expect(doc.json.data.changed).toBe(false)
    expect(doc.json.data.draft.tiers.map((tier: { package: string }) => tier.package)).toEqual(PACKAGES)
    expect(doc.json.data.draft.features.length).toBeGreaterThan(15)
    // A second run never overwrites.
    expect(seedShopDocuments(server.app.context)).toEqual({ seeded: false, documents: 0 })
  })

  it('accept the website\'s own documents, and refuse what the website cannot draw', () => {
    const { comparison, fullExperience: offer } = seed()
    expect(() => parseComparison(comparison, PACKAGES)).not.toThrow()
    expect(() => parseFullExperience(offer)).not.toThrow()

    const fields = (run: () => unknown) => {
      try {
        run()
      } catch (error) {
        return (error as { details?: { fields?: Record<string, string> } }).details?.fields ?? {}
      }
      return {}
    }
    const unknownPackage = clone(comparison)
    unknownPackage.tiers[0].package = 'platinum'
    expect(fields(() => parseComparison(unknownPackage, PACKAGES))['tiers.0.package']).toBe('unknown')

    const loop = clone(comparison)
    loop.tiers[0].buildsOn = 'build'
    expect(Object.keys(fields(() => parseComparison(loop, PACKAGES))).some((key) => key.endsWith('.buildsOn'))).toBe(true)

    const missingLanguage = clone(comparison)
    missingLanguage.features[0].name.nl = ''
    expect(fields(() => parseComparison(missingLanguage, PACKAGES))['features.0.name.nl']).toBe('required')

    const badLevel = clone(comparison)
    badLevel.features[1].levels.grow = 'maybe'
    expect(fields(() => parseComparison(badLevel, PACKAGES))['features.1.levels.grow']).toBe('invalid')

    const noBudgetWayOut = clone(offer)
    noBudgetWayOut.configurator.questions.find((q: { id: string }) => q.id === 'budget').options.forEach((o: { unsure: boolean }) => (o.unsure = false))
    expect(Object.keys(fields(() => parseFullExperience(noBudgetWayOut))).some((key) => key.endsWith('.options'))).toBe(true)

    const missingCore = clone(offer)
    missingCore.configurator.questions = missingCore.configurator.questions.filter((q: { id: string }) => q.id !== 'timeline')
    expect(fields(() => parseFullExperience(missingCore))['configurator.questions']).toBe('required')

    const price = clone(offer)
    price.stages[0].id = 'Not A Slug'
    expect(fields(() => parseFullExperience(price))['stages.0.id']).toBe('invalid')
  })

  it('reach the public catalogue only once published, and change its version when they do', async () => {
    const before = (await server.api('/api/shop/catalog')).json.data
    expect(before.comparison.features.length).toBeGreaterThan(15)
    expect(before.fullExperience.configurator.questions.map((q: { id: string }) => q.id)).toEqual(['type', 'stage', 'components', 'complexity', 'budget', 'timeline'])

    const doc = (await send('GET', '/api/admin/shop/documents/comparison')).json.data
    const draft = clone(doc.draft)
    draft.features[1].name.en = 'A layout that works on every screen'
    const saved = await send('PUT', '/api/admin/shop/documents/comparison', { document: draft, expectedUpdatedAt: doc.updatedAt })
    expect(saved.status).toBe(200)
    expect(saved.json.data.changed).toBe(true)
    // Saved but not published: visitors still see the old one.
    expect((await server.api('/api/shop/catalog')).json.data.comparison.features[1].name.en).toBe(before.comparison.features[1].name.en)

    const published = await send('POST', '/api/admin/shop/documents/comparison/publish')
    expect(published.json.data.changed).toBe(false)
    const after = (await server.api('/api/shop/catalog')).json.data
    expect(after.comparison.features[1].name.en).toBe('A layout that works on every screen')
    expect(after.version).not.toBe(before.version)

    const withdrawn = await send('POST', '/api/admin/shop/documents/comparison/unpublish')
    expect(withdrawn.json.data.published).toBeNull()
    expect((await server.api('/api/shop/catalog')).json.data.comparison).toBeNull()
  })

  it('refuse a bad save as a whole, keep the draft, and say which field is wrong', async () => {
    const doc = (await send('GET', '/api/admin/shop/documents/full_experience')).json.data
    const draft = clone(doc.draft)
    draft.hero.headline.hu = ''
    draft.stages[0].title.en = 'x'.repeat(200)
    const response = await send('PUT', '/api/admin/shop/documents/full_experience', { document: draft })
    expect(response.status).toBe(422)
    expect(response.json.error.details.fields).toMatchObject({ 'hero.headline.hu': 'required', 'stages.0.title.en': 'tooLong' })
    expect((await send('GET', '/api/admin/shop/documents/full_experience')).json.data.draft.hero.headline.hu).toBe(doc.draft.hero.headline.hu)
  })

  it('refuse to overwrite a save someone else made in the meantime', async () => {
    const doc = (await send('GET', '/api/admin/shop/documents/full_experience')).json.data
    server.clock.advance(60_000)
    expect((await send('PUT', '/api/admin/shop/documents/full_experience', { document: doc.draft, expectedUpdatedAt: doc.updatedAt })).status).toBe(200)
    const stale = await send('PUT', '/api/admin/shop/documents/full_experience', { document: doc.draft, expectedUpdatedAt: doc.updatedAt })
    expect(stale.status).toBe(409)
  })

  it('are for the signed-in administrator only, and an unknown document is not found', async () => {
    expect((await server.api('/api/admin/shop/documents/comparison')).status).toBe(401)
    expect((await server.api('/api/admin/shop/documents/comparison', { method: 'PUT', body: {} })).status).toBe(401)
    expect((await send('GET', '/api/admin/shop/documents/pricing')).status).toBe(404)
    // A write needs the CSRF token like every other write.
    const noToken = await server.api('/api/admin/shop/documents/comparison/publish', { method: 'POST', headers: { Cookie: admin.cookie } })
    expect(noToken.status).toBeGreaterThanOrEqual(400)
  })
})

describe('a FULL EXPERIENCE request', () => {
  it('is saved in the same list as the builder\'s quotes, with the brief as the answers were worded when it was sent', async () => {
    const response = await server.api('/api/quote-requests', { body: fullExperience() })
    expect(response.status).toBe(201)
    expect(response.json.data.reference).toMatch(/^CC-\d{4}-\d{6}$/)
    expect(response.json.data.pricing.fixed).toEqual([])

    const list = await send('GET', '/api/admin/quote-requests')
    expect(list.json.data.map((row: { reference: string }) => row.reference)).toContain(response.json.data.reference)
    expect(list.json.data.find((row: { reference: string }) => row.reference === response.json.data.reference)).toMatchObject({ kind: 'full_experience', items: [] })

    const row = server.db.get<{ id: string }>("SELECT id FROM quote_requests WHERE kind = 'full_experience'")!
    const detail = await send('GET', `/api/admin/quote-requests/${row.id}`)
    expect(detail.status).toBe(200)
    expect(detail.json.data).toMatchObject({ kind: 'full_experience', company: 'Gym Network Ltd', name: 'Eszter Varga', language: 'en', items: [] })
    expect(detail.text).not.toMatch(/ip_hash|content_hash/)
    const brief = readBrief(detail.json.data.brief_json)!
    expect(brief.preferredLanguage).toBe('nl')
    expect(brief.questions.map((q) => q.id)).toEqual(['type', 'stage', 'components', 'complexity', 'budget', 'timeline'])
    expect(brief.questions.find((q) => q.id === 'components')!.answers.map((a) => a.id)).toEqual(['frontend', 'backend'])
    expect(brief.questions.find((q) => q.id === 'type')!.answers[0].label).toEqual({ hu: 'Webalkalmazás', en: 'Web application', nl: 'Webapplicatie' })
    // A question the visitor skipped is in the brief, with no answer, so the administrator sees it was skipped.
    expect(brief.questions.find((q) => q.id === 'timeline')!.answers).toEqual([])

    // The administrator can take it away as data: the export names the brief as an object, not as stored text.
    const exported = await send('GET', `/api/admin/quote-requests/${row.id}/export`)
    expect(exported.json.data.brief.questions[0].id).toBe('type')
    expect(exported.json.data).not.toHaveProperty('brief_json')
    const csv = (await send('GET', '/api/admin/quote-requests/export.csv')).text
    expect(csv.split(String.fromCharCode(10))[0]).toContain('kind')
    expect(csv).toContain('FULL EXPERIENCE')
  })

  it('keeps its brief readable after the questions are edited', async () => {
    await server.api('/api/quote-requests', { body: fullExperience() })
    const doc = (await send('GET', '/api/admin/shop/documents/full_experience')).json.data
    const draft = clone(doc.draft)
    draft.configurator.questions.find((q: { id: string }) => q.id === 'type').options.find((o: { id: string }) => o.id === 'web-app').label.en = 'Something renamed'
    await send('PUT', '/api/admin/shop/documents/full_experience', { document: draft })
    await send('POST', '/api/admin/shop/documents/full_experience/publish')
    const row = getQuote(server.db, server.db.get<{ id: string }>("SELECT id FROM quote_requests WHERE kind = 'full_experience'")!.id)!
    expect(readBrief(row.brief_json)!.questions[0].answers[0].label.en).toBe('Web application')
  })

  it('is checked against the questions as they are published now', async () => {
    const bad = async (overrides: Record<string, unknown>) => (await server.api('/api/quote-requests', { body: fullExperience(overrides) })).json.error?.details?.fields ?? {}
    expect(await bad({ answers: { type: ['web-app'], stage: ['idea'], mood: ['calm'] } })).toMatchObject({ 'answers.mood': 'unknown' })
    expect(await bad({ answers: { type: ['space-station'], stage: ['idea'] } })).toMatchObject({ 'answers.type': 'unknown' })
    expect(await bad({ answers: { stage: ['idea'] } })).toMatchObject({ 'answers.type': 'required' })
    expect(await bad({ answers: { type: ['web-app', 'portal'], stage: ['idea'] } })).toMatchObject({ 'answers.type': 'tooMany' })
    expect(await bad({ name: 'E', email: 'not-an-email', description: 'short' })).toMatchObject({ name: 'tooShort', email: 'invalidEmail', description: 'tooShort' })
    expect(await bad({ consent: false })).toMatchObject({ consent: 'consentRequired' })
    // The optional questions may be left out entirely.
    const minimal = await server.api('/api/quote-requests', { body: fullExperience({ answers: { type: ['unsure'], stage: ['idea'] }, company: undefined }) })
    expect(minimal.status).toBe(201)
  })

  it('stores the project size guide the SERVER worked out from the validated answers, and ignores one the browser sent (PROMPT 20)', async () => {
    const answers = { type: ['web-app'], stage: ['idea'], components: ['backend', 'database', 'auth'], complexity: ['medium'], budget: ['unsure'] }
    // web-app 2 + backend 1 + database 1 + auth 1 + medium 2 = 7 points: Advanced. The request claims it is Basic: that is never read.
    const response = await server.api('/api/quote-requests', { body: fullExperience({ answers, estimate: { level: 'basic', points: 0 }, size: 'basic', projectSize: { level: 'basic', points: 0 } }) })
    expect(response.status).toBe(201)
    const row = getQuote(server.db, server.db.get<{ id: string }>("SELECT id FROM quote_requests WHERE kind = 'full_experience'")!.id)!
    expect(readBrief(row.brief_json)!.estimate).toEqual({ level: 'advanced', points: 7 })
    expect(row.brief_json).not.toContain('"basic"')
    // The owner reads it, labelled as a planning guide and not as a quote; no price and no time anywhere near it.
    const sizeRow = briefRows(row, 'en').find((entry) => entry.label.startsWith('Project size'))!
    expect(sizeRow).toEqual({ label: 'Project size (a planning guide, not a quote)', value: 'Advanced' })
    expect(briefRows(row, 'hu').find((entry) => entry.label.startsWith('A projekt mérete'))!.value).toBe('Összetett')
    expect(briefRows(row, 'nl').find((entry) => entry.label.startsWith('Omvang'))!.value).toBe('Uitgebreid')
    // The administration gets it with the brief.
    const detail = await send('GET', `/api/admin/quote-requests/${row.id}`)
    const brief = detail.json.data.brief ?? readBrief(detail.json.data.brief_json)
    expect(brief.estimate).toEqual({ level: 'advanced', points: 7 })
  })

  it('has no size guide when nothing it is based on was answered, and keeps older briefs readable without one', async () => {
    const response = await server.api('/api/quote-requests', { body: fullExperience({ answers: { type: ['unsure'], stage: ['idea'], complexity: ['unsure'], budget: ['unsure'] } }) })
    expect(response.status).toBe(201)
    const row = getQuote(server.db, server.db.get<{ id: string }>("SELECT id FROM quote_requests WHERE kind = 'full_experience'")!.id)!
    expect(readBrief(row.brief_json)!.estimate).toBeUndefined()
    expect(briefRows(row, 'en').some((entry) => entry.label.startsWith('Project size'))).toBe(false)
    // A brief stored before the guide existed has no estimate and reads as before; a damaged estimate is dropped, not trusted.
    const stored = JSON.parse(row.brief_json!) as Record<string, unknown>
    expect(readBrief(JSON.stringify({ ...stored, estimate: { level: 'huge', points: 'many' } }))!.estimate).toBeUndefined()
    expect(readBrief(JSON.stringify({ ...stored, estimate: { level: 'moderate', points: 4 } }))!.estimate).toEqual({ level: 'moderate', points: 4 })
  })

  it('is answered with the first reference when it is sent twice, and refuses a bot\'s hidden field', async () => {
    const first = await server.api('/api/quote-requests', { body: fullExperience() })
    const again = await server.api('/api/quote-requests', { body: fullExperience() })
    expect(again.status).toBe(200)
    expect(again.json.data.reference).toBe(first.json.data.reference)
    expect(server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM quote_requests')!.n).toBe(1)
    expect((await server.api('/api/quote-requests', { body: fullExperience({ description: 'Another idea entirely, written for this test.', website: 'https://spam.example' }) })).status).toBe(422)
  })

  it('is not accepted while the offer is not published', async () => {
    await send('POST', '/api/admin/shop/documents/full_experience/unpublish')
    const response = await server.api('/api/quote-requests', { body: fullExperience() })
    expect(response.status).toBe(503)
    expect(response.json.error.code).toBe('catalog_unavailable')
  })

  it('is told to the owner with every question and answer, and nothing about a price', async () => {
    await server.api('/api/quote-requests', { body: fullExperience() })
    const row = getQuote(server.db, server.db.get<{ id: string }>("SELECT id FROM quote_requests WHERE kind = 'full_experience'")!.id)!
    const rows = briefRows(row, 'en')
    expect(rows.find((r) => r.label === 'Company')!.value).toBe('Gym Network Ltd')
    expect(rows.find((r) => r.label === 'Preferred reply language')!.value).toBe('Dutch')
    expect(rows.find((r) => r.label.startsWith('What does your project need'))!.value).toBe('Screens that people see and use, Rules and processes behind the scenes')
    expect(rows.find((r) => r.label.startsWith('When would you like'))!.value).toBe('(skipped)')

    const mail = renderRequestNotification({ request: row, items: quoteItems(server.db, row.id), totals: { fixed: [], quotedParts: 0 }, packageName: (code: string) => code }, 'en', 'Brand', null)
    expect(mail.text).toContain('FULL EXPERIENCE')
    expect(mail.text).toContain('Web application')
    expect(mail.text).toContain('Gym Network Ltd')
    expect(mail.text).not.toMatch(/published price|€|EUR|HUF/)
    // The owner's notification and the visitor's confirmation were queued like any quote's.
    const kinds = server.db.all<{ kind: string }>('SELECT kind FROM email_deliveries ORDER BY id').map((delivery) => delivery.kind)
    expect(kinds).toEqual(expect.arrayContaining(['quote_received']))
  })
})

describe('the administration\'s shop editors are the server\'s rules', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const load = (path: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(join(root, path)).href)

  it('count against the same numbers, with the same levels and core questions', async () => {
    const admin = await load('src/admin/lib/shop.ts')
    expect(admin.FEATURE_LEVELS).toEqual([...FEATURE_LEVELS])
    expect(admin.CORE_QUESTIONS).toEqual([...CORE_QUESTIONS])
    const L = admin.SHOP_LIMITS
    expect({ features: L.features, stages: L.stages, components: L.components, faq: L.faq, questions: L.questions, optionsPerQuestion: L.optionsPerQuestion }).toEqual({
      features: LIMITS.features,
      stages: LIMITS.stages,
      components: LIMITS.components,
      faq: LIMITS.faq,
      questions: LIMITS.questions,
      optionsPerQuestion: LIMITS.optionsPerQuestion,
    })

    // Each text limit: exactly that long is accepted, one more is refused, on the very field the editor counts it for.
    const comparison = seed().comparison
    const offer = seed().fullExperience
    const long = (n: number) => 'x'.repeat(n)
    const fieldOf = (run: () => unknown, path: string) => {
      try {
        run()
      } catch (error) {
        return (error as { details?: { fields?: Record<string, string> } }).details?.fields?.[path]
      }
      return undefined
    }
    const comparisonCases: [string, number, (doc: any, text: string) => void][] = [
      ['tiers.0.label.en', L.tierLabel, (doc, text) => (doc.tiers[0].label.en = text)],
      ['features.0.name.en', L.featureName, (doc, text) => (doc.features[0].name.en = text)],
      ['features.0.description.en', L.featureDescription, (doc, text) => (doc.features[0].description.en = text)],
    ]
    for (const [path, max, set] of comparisonCases) {
      const fit = clone(comparison)
      set(fit, long(max))
      expect(fieldOf(() => parseComparison(fit, PACKAGES), path), `${path} at ${max}`).toBeUndefined()
      const over = clone(comparison)
      set(over, long(max + 1))
      expect(fieldOf(() => parseComparison(over, PACKAGES), path), `${path} at ${max + 1}`).toBe('tooLong')
    }
    const offerCases: [string, number, (doc: any, text: string) => void][] = [
      ['hero.eyebrow.en', L.eyebrow, (doc, text) => (doc.hero.eyebrow.en = text)],
      ['hero.headline.en', L.headline, (doc, text) => (doc.hero.headline.en = text)],
      ['hero.supporting.en', L.supporting, (doc, text) => (doc.hero.supporting.en = text)],
      ['hero.primaryCta.en', L.cta, (doc, text) => (doc.hero.primaryCta.en = text)],
      ['stages.0.title.en', L.stageTitle, (doc, text) => (doc.stages[0].title.en = text)],
      ['stages.0.text.en', L.stageText, (doc, text) => (doc.stages[0].text.en = text)],
      ['configurator.questions.0.title.en', L.question, (doc, text) => (doc.configurator.questions[0].title.en = text)],
      ['configurator.questions.0.help.en', L.help, (doc, text) => (doc.configurator.questions[0].help.en = text)],
      ['configurator.questions.0.options.0.label.en', L.optionLabel, (doc, text) => (doc.configurator.questions[0].options[0].label.en = text)],
      ['configurator.questions.0.options.0.hint.en', L.optionHint, (doc, text) => (doc.configurator.questions[0].options[0].hint.en = text)],
      ['faq.0.question.en', L.faqQuestion, (doc, text) => (doc.faq[0].question.en = text)],
      ['faq.0.answer.en', L.faqAnswer, (doc, text) => (doc.faq[0].answer.en = text)],
      ['configurator.intro.en', L.intro, (doc, text) => (doc.configurator.intro.en = text)],
    ]
    for (const [path, max, set] of offerCases) {
      const fit = clone(offer)
      set(fit, long(max))
      expect(fieldOf(() => parseFullExperience(fit), path), `${path} at ${max}`).toBeUndefined()
      const over = clone(offer)
      set(over, long(max + 1))
      expect(fieldOf(() => parseFullExperience(over), path), `${path} at ${max + 1}`).toBe('tooLong')
    }
  })
})
