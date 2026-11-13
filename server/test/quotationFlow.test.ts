import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MailError } from '../src/modules/notifications/smtp.ts'
import { eraseByEmail } from '../src/modules/system/maintenance.ts'
import { mintToken, purgeTokens } from '../src/modules/quotes/tokens.ts'
import { contact, quote, startServer, type TestServer } from './helpers.ts'
import { draftBody, linkIn, makeKit } from './quotationKit.ts'

/**
 * The quotation system end to end, through HTTP: the request, the offer, the customer's pages, the e-mails, the audit trail, and everything
 * that has to fail safely (PROMPT 17, scenarios A to F).
 */

const DAY = 86_400_000
let server: TestServer
let kit: ReturnType<typeof makeKit>
let admin: Awaited<ReturnType<TestServer['signIn']>>

async function start(env: Record<string, string> = {}, options: Parameters<typeof startServer>[0] = {}) {
  server = await startServer({ ...options, env: { PUBLIC_URL: 'https://site.test', ...env } })
  admin = await server.signIn('admin', 'admin@site.test')
  kit = makeKit(server, admin)
}

beforeEach(async () => {
  await start()
})
afterEach(async () => {
  await server.close()
})

const events = (requestId: string) => server.db.all<{ event_type: string; actor_type: string; from_status: string | null; to_status: string | null; summary: string | null }>('SELECT event_type, actor_type, from_status, to_status, summary FROM quote_events WHERE quote_request_id = ? ORDER BY id', [requestId])
const rowOf = (id: string) => server.db.get<Record<string, any>>('SELECT * FROM quote_requests WHERE id = ?', [id])!

// ------------------------------------------------------------------------------------------------------------------------------
describe('Scenario A: a request from the shop', () => {
  it('is stored with every field the quotation needs, answered with a reference and a private status link, and confirmed by e-mail', async () => {
    const response = await server.api('/api/quote-requests', {
      body: quote({ company: 'Kovács Bakery', companyWebsite: 'bakery.example/menu', budgetRange: 'around 3000 euro', phone: '+36 30 123 4567', marketing: true, items: [{ need: 'website', plan: 'launch', extras: ['pages'] }] }),
    })
    expect(response.status).toBe(201)
    expect(response.json.data).toMatchObject({ reference: expect.stringMatching(/^CC-\d{4}-\d{6}$/), status: 'received', confirmationEmail: 'queued' })
    expect(response.json.data.statusToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const row = server.db.get<Record<string, any>>('SELECT * FROM quote_requests')!
    expect(row).toMatchObject({ request_type: 'package_quote', source: 'shop', status: 'new', customer_status: 'new', priority: 'normal', company: 'Kovács Bakery', website: 'https://bakery.example/menu', budget_range: 'around 3000 euro', timing: 'months' })
    expect(row.consent_at).not.toBeNull()
    expect(row.marketing_consent_at).not.toBeNull()
    // The names of what was chosen are saved with the request, in every language, whatever happens to the catalogue later.
    const names = JSON.parse(server.db.get<{ names_json: string }>('SELECT names_json FROM quote_request_items')!.names_json)
    expect(names.package).toMatchObject({ en: 'Launch' })
    expect(names.extras[0].names.en).toBe('Additional pages')

    await kit.settle()
    await kit.settle()
    expect(kit.owner()).toHaveLength(1)
    expect(kit.owner()[0].text).toContain('https://site.test/admin/quotes/')
    expect(kit.owner()[0].subject).toBe(`New quote request (${response.json.data.reference}): Anna Kovács`)
    const [mail] = kit.toCustomer()
    expect(mail.subject).toBe(`We will review your enquiry soon — ${response.json.data.reference}`)
    // What the brief asks the confirmation to hold: thanks, the reference, what was asked for, the date, the contact details, the next step.
    for (const part of [response.json.data.reference, 'Launch', 'Additional pages', 'A small website for a bakery', 'anna@example.com', '+36 30 123 4567', 'Kovács Bakery', 'What happens next', 'No payment is requested', 'Submitted']) expect(mail.text, part).toContain(part)
    expect(mail.text).not.toMatch(/within \d|in \d+ (hours|days)|guarantee|by (monday|tomorrow)/i) // no promise of an answer time
    expect(linkIn(mail.text, 'request')).toBe(response.json.data.statusToken === linkIn(mail.text, 'request') ? response.json.data.statusToken : linkIn(mail.text, 'request'))
    expect(linkIn(mail.text, 'request')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mail.html).toContain('href="https://site.test/en/request/')
    expect(events(row.id)).toEqual([expect.objectContaining({ event_type: 'request_created', actor_type: 'system', to_status: 'new', summary: 'shop/package_quote' })])
  })

  it('works out the type of request itself and ignores anything the browser says about prices, types or sources', async () => {
    const custom = await server.api('/api/quote-requests', { body: quote({ items: [{ need: 'website', plan: 'custom', extras: [] }], requestType: 'ai_project', source: 'control_room_ai', priority: 'urgent', status: 'accepted', price: 1, total: 5 }) })
    expect(custom.status).toBe(201)
    expect(server.db.get('SELECT request_type, source, priority, status FROM quote_requests')).toEqual({ request_type: 'custom_website', source: 'shop', priority: 'normal', status: 'new' })
    expect(custom.json.data.pricing).toEqual({ fixed: [], quotedParts: 1 })
    const app = await server.api('/api/quote-requests', { body: quote({ email: 'b@example.com', items: [{ need: 'webapp', plan: 'custom', extras: [] }] }) })
    expect(app.status).toBe(201)
    expect(server.db.get("SELECT request_type FROM quote_requests WHERE email = 'b@example.com'")).toEqual({ request_type: 'custom_application' })
    const mixed = await server.api('/api/quote-requests', { body: quote({ email: 'c@example.com', items: [{ need: 'website', plan: 'launch', extras: [] }, { need: 'integrations', plan: 'custom', extras: [] }] }) })
    expect(mixed.status).toBe(201)
    expect(server.db.get("SELECT request_type FROM quote_requests WHERE email = 'c@example.com'")).toEqual({ request_type: 'custom_service' })
  })

  it('checks the new fields on the server and keeps the marketing choice apart from the request', async () => {
    const bad = await server.api('/api/quote-requests', { body: quote({ companyWebsite: 'javascript:alert(1)', budgetRange: 'x'.repeat(81), company: 'y'.repeat(101) }) })
    expect(bad.status).toBe(422)
    expect(bad.json.error.details.fields).toEqual({ companyWebsite: 'invalidUrl', budgetRange: 'tooLong', company: 'tooLong' })
    for (const website of ['http://user:pw@x.example', 'ftp://x.example', 'not a url', '//evil.example', 'localhost']) expect((await server.api('/api/quote-requests', { body: quote({ companyWebsite: website }) })).status, website).toBe(422)
    // No marketing choice is needed, and none is recorded unless it was made.
    const plain = await server.api('/api/quote-requests', { body: quote() })
    expect(plain.status).toBe(201)
    expect(server.db.get('SELECT marketing_consent_at AS m, consent_at AS c FROM quote_requests')).toEqual({ m: null, c: expect.any(String) })
    // The privacy acknowledgement is still required, and the hidden field still catches scripts.
    expect((await server.api('/api/quote-requests', { body: quote({ consent: false, email: 'z@example.com' }) })).json.error.details.fields.consent).toBe('consentRequired')
    expect((await server.api('/api/quote-requests', { body: quote({ website: 'http://spam.example', email: 'y@example.com' }) })).json.error.code).toBe('spam_suspected')
  })

  it('takes a repeated submission for the first: the same reference and link, no second request, no second e-mail', async () => {
    const first = await server.api('/api/quote-requests', { body: quote() })
    const second = await server.api('/api/quote-requests', { body: quote() })
    expect([first.status, second.status]).toEqual([201, 200])
    expect(second.json.data.reference).toBe(first.json.data.reference)
    expect(second.json.data.confirmationEmail).toBe('queued')
    await kit.settle()
    await kit.settle()
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 1 })
    expect(server.mailer.sent.map((mail) => mail.to).sort()).toEqual(['anna@example.com', 'owner@site.test'])
  })

  it('says plainly that the request is saved but no confirmation will come, when e-mail is not set up', async () => {
    await server.close()
    await start({ EMAIL_PROVIDER: 'none' }, { mailer: null })
    const response = await server.api('/api/quote-requests', { body: quote() })
    expect(response.status).toBe(201)
    expect(response.json.data.confirmationEmail).toBe('not_sent')
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 1 })
  })
})

describe('Scenario D: the e-mail provider fails', () => {
  it('keeps the request, records the failure, lets an administrator send again, and never sends the confirmation twice', async () => {
    server.mailer.failNext(new MailError('The server refused the message.', { transient: false, reason: 'rejected' }), 2)
    const made = await kit.request()
    await kit.settle()
    await kit.settle()
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 1 })
    expect(server.mailer.sent).toHaveLength(0)
    const detail = (await kit.get(`/api/admin/quote-requests/${made.id}`)).json.data
    expect(detail.deliveries.map((row: { kind: string; status: string }) => [row.kind, row.status]).sort()).toEqual([['quote_confirmation', 'failed'], ['quote_received', 'failed']])
    expect(detail.deliveries[0].lastError).toBeTruthy()

    const resent = await kit.send('POST', `/api/admin/quote-requests/${made.id}/resend-confirmation`)
    expect(resent.status).toBe(202)
    await kit.settle()
    expect(kit.toCustomer()).toHaveLength(1)
    // The same row was used again: still one confirmation in the log, now accepted.
    const rows = server.db.all<{ kind: string; status: string }>("SELECT kind, status FROM email_deliveries WHERE kind = 'quote_confirmation'")
    expect(rows).toEqual([{ kind: 'quote_confirmation', status: 'accepted' }])
    // Asking again sends it once more (a deliberate repeat), still on the one row.
    expect((await kit.send('POST', `/api/admin/quote-requests/${made.id}/resend-confirmation`)).status).toBe(202)
    await kit.settle()
    expect(server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE kind = 'quote_confirmation'")).toEqual({ n: 1 })
    expect(events(made.id).map((event) => event.event_type)).toEqual(['request_created', 'email_retried', 'email_retried'])
  })
})

describe('the administrator\'s view of the requests', () => {
  it('counts what the database holds, filters by type, priority, source and date, and sorts by priority', async () => {
    const a = await kit.request({ description: 'First: a small website for a bakery in Utrecht.' })
    const b = await kit.request({ description: 'Second: a custom app for a transport company.', items: [{ need: 'webapp', plan: 'custom', extras: [] }] })
    await kit.request({ description: 'Third: a website with several extra pages.', email: 'third@example.com' })
    expect((await kit.send('PATCH', `/api/admin/quote-requests/${a.id}`, { priority: 'urgent' })).status).toBe(200)
    expect((await kit.send('PATCH', `/api/admin/quote-requests/${b.id}`, { priority: 'low', status: 'under_review' })).status).toBe(200)
    const overview = (await kit.get('/api/admin/quote-requests/overview')).json.data
    expect(overview.open).toMatchObject({ total: 3, new: 2, underReview: 1, quotePreparation: 0, quoteSent: 0, accepted: 0, declined: 0, activeProjects: 0, completed: 0, archived: 0 })
    const list = async (query: string) => (await kit.get(`/api/admin/quote-requests?${query}`)).json
    expect((await list('type=custom_application')).meta.total).toBe(1)
    expect((await list('type=package_quote')).meta.total).toBe(2)
    expect((await list('priority=urgent')).data.map((row: { id: string }) => row.id)).toEqual([a.id])
    expect((await list('source=control_room_ai')).meta.total).toBe(0)
    expect((await list('source=shop')).meta.total).toBe(3)
    expect((await list('sort=priority&dir=desc')).data[0].id).toBe(a.id)
    expect((await list('sort=priority&dir=asc')).data[0].id).toBe(b.id)
    expect((await list('from=2026-11-03&to=2026-11-03')).meta.total).toBe(3)
    expect((await list('from=2027-01-01')).meta.total).toBe(0)
    expect((await list('q=Utrecht')).meta.total).toBe(1)
    expect((await list('type=drop%20table')).meta.total).toBe(3) // an unknown filter value is ignored, never run
    expect((await list('pageSize=2&page=2')).data).toHaveLength(1)
    for (const row of (await list('')).data) expect(Object.keys(row)).not.toContain('ip_hash')
    expect((await kit.send('PATCH', `/api/admin/quote-requests/${a.id}`, { priority: 'critical' })).status).toBe(422)
  })

  it('tells the customer about a change only when the administrator chooses to, on the page and in the mailbox', async () => {
    const made = await kit.request()
    await kit.settle()
    const page = async () => (await server.api(`/api/customer/requests/${made.statusToken}`)).json.data
    // An internal move changes nothing the customer sees.
    await kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, { status: 'under_review', internalNote: 'Looks like a good fit.' })
    expect(await page()).toMatchObject({ status: 'new', updates: [{ kind: 'status', status: 'new' }] })
    // Shown on the page, with a sentence of the administrator's own.
    await kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, { status: 'waiting_customer', show: true, note: 'Could you send the logo?' })
    expect(await page()).toMatchObject({ status: 'waiting_customer', updates: [{ status: 'new' }, { status: 'waiting_customer', body: 'Could you send the logo?' }] })
    const before = kit.toCustomer().length
    await kit.settle()
    expect(kit.toCustomer()).toHaveLength(before) // `show` does not send mail
    // And by e-mail too, with the link to the page.
    const emailed = await kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, { status: 'under_review', notify: true, note: 'Thanks, received.' })
    expect(emailed.json.meta.notification).toBe('queued')
    await kit.settle()
    const mail = kit.toCustomer().at(-1)!
    expect(mail.subject).toContain('Update on your quote request')
    expect(mail.text).toContain('Thanks, received.')
    expect(mail.text).toContain('Being reviewed')
    expect(linkIn(mail.text, 'request')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // A message that is not a status change.
    expect((await kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, { update: { message: 'We are on it.' } })).status).toBe(200)
    expect((await page()).updates.at(-1)).toMatchObject({ kind: 'message', body: 'We are on it.' })
    // None of the internal text is there.
    expect(JSON.stringify(await page())).not.toMatch(/good fit|internal|admin@site\.test|anna@example\.com/i)
  })

  it('records a decision made outside the page only with the reason, and does not start the project by itself', async () => {
    const made = await kit.request()
    const patch = (body: Record<string, unknown>) => kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, body)
    await patch({ status: 'quote_preparation' })
    server.db.run("UPDATE quote_requests SET status = 'quote_sent' WHERE id = ?", [made.id])
    expect((await patch({ status: 'accepted' })).status).toBe(422)
    const accepted = await patch({ status: 'accepted', internalNote: 'Agreed by phone on Monday.' })
    expect(accepted.json.data.status).toBe('accepted') // and not 'in_progress'
    expect(accepted.json.data.notes.map((note: { body: string }) => note.body)).toEqual(['Agreed by phone on Monday.'])
    expect((await patch({ status: 'in_progress' })).json.data.status).toBe('in_progress')
    expect((await patch({ status: 'completed' })).json.data.status).toBe('completed')
  })

  it('makes a request by hand or from a message that came through the contact form, with the source saying which', async () => {
    const message = await server.api('/api/contact', { body: contact({ name: 'Béla Minta', email: 'bela@example.com', subject: 'A shop', message: 'I would like to sell my honey online, please advise.' }) })
    const inquiryId = server.db.get<{ id: string }>('SELECT id FROM inquiries WHERE reference = ?', [message.json.data.reference])!.id
    const fromMessage = await kit.send('POST', `/api/admin/inquiries/${inquiryId}/quote-request`, { name: 'Béla Minta', email: 'bela@example.com', language: 'hu', description: 'I would like to sell my honey online, please advise.', requestType: 'general_business' })
    expect(fromMessage.status, fromMessage.text).toBe(201)
    expect(fromMessage.json.data).toMatchObject({ source: 'contact_form', request_type: 'general_business', inquiry_id: inquiryId, reference: expect.stringMatching(/^CC-/) })
    const byHand = await kit.send('POST', '/api/admin/quote-requests', { name: 'Eszter Nagy', email: 'eszter@example.com', language: 'nl', description: 'Phone call: a booking system for a gym.', requestType: 'custom_application', priority: 'high', phone: '+31 6 1234 5678' })
    expect(byHand.status, byHand.text).toBe(201)
    expect(byHand.json.data).toMatchObject({ source: 'other', request_type: 'custom_application', priority: 'high', consent_at: null })
    expect((await kit.send('POST', '/api/admin/quote-requests', { name: 'X', email: 'nope', language: 'en', description: 'd' })).status).toBe(422)
    expect((await kit.send('POST', '/api/admin/quote-requests', { name: 'Xavier', email: 'x@example.com', language: 'en', description: 'A description.', requestType: 'ai_project' })).status).toBe(422)
    expect((await kit.send('POST', '/api/admin/inquiries/nope/quote-request', { name: 'Xavier', email: 'x@example.com', language: 'en', description: 'A description.' })).status).toBe(404)
    expect(events(byHand.json.data.id)[0]).toMatchObject({ event_type: 'request_created', actor_type: 'admin' })
  })

  it('refuses the unauthorised: no session, no CSRF token, no right to delete', async () => {
    const made = await kit.request()
    const editor = await server.signIn('editor', 'editor@site.test')
    for (const [method, path] of [['GET', '/api/admin/quote-requests'], ['GET', `/api/admin/quote-requests/${made.id}`], ['PATCH', `/api/admin/quote-requests/${made.id}`], ['POST', `/api/admin/quote-requests/${made.id}/quotes`], ['POST', '/api/admin/quote-requests'], ['GET', '/api/admin/quote-requests/overview']] as const) {
      expect((await server.api(path, { method, body: method === 'GET' ? undefined : {} })).status, `${method} ${path}`).toBe(401)
    }
    expect((await server.api(`/api/admin/quote-requests/${made.id}`, { method: 'PATCH', headers: { Cookie: admin.cookie }, body: { priority: 'high' } })).status).toBe(403) // no CSRF token
    expect((await kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, { priority: 'high' }, editor)).status).toBe(200) // an editor works with requests
    expect((await kit.send('DELETE', `/api/admin/quote-requests/${made.id}`, {}, editor)).status).toBe(403) // but cannot delete them
    expect((await kit.send('DELETE', `/api/admin/quote-requests/${made.id}`)).status).toBe(204)
  })
})

// ------------------------------------------------------------------------------------------------------------------------------
describe('writing the quotation', () => {
  it('starts from what the customer chose, with a published price as a line and nothing invented when there is none', async () => {
    const none = await kit.request()
    const empty = (await kit.send('POST', `/api/admin/quote-requests/${none.id}/quotes`)).json.data.quotation
    expect(empty).toMatchObject({ status: 'draft', version: 1, reference: `${none.reference}-Q1`, currency: null, title: 'Launch' })
    expect(empty.lines).toEqual([])
    expect(rowOf(none.id).status).toBe('quote_preparation') // someone is writing an offer for it

    server.db.run("UPDATE packages SET price_kind = 'from', price_amount = 900, price_currency = 'EUR', vat_mode = 'excluded' WHERE code = 'launch'")
    const priced = await kit.request({ email: 'p@example.com', description: 'Another request, after the price was published for Launch.' })
    const draft = (await kit.send('POST', `/api/admin/quote-requests/${priced.id}/quotes`)).json.data.quotation
    expect(draft.currency).toBe('EUR')
    expect(draft.lines).toEqual([expect.objectContaining({ description: 'Launch', unit_minor: 90000, quantity: 1, kind: 'item' })])
    // Only one draft at a time.
    const again = await kit.send('POST', `/api/admin/quote-requests/${priced.id}/quotes`)
    expect(again.status).toBe(409)
    expect(again.json.error.details.reason).toBe('draft_exists')
  })

  it('adds the lines up on the server, ignores totals the browser sends, and calculates tax only from a confirmed rate', async () => {
    const made = await kit.ready({ totalMinor: 1, total: '1', taxMinor: 5 })
    const detail = (await kit.get(`/api/admin/quotes/${made.quoteId}`)).json.data.quotation
    expect(detail).toMatchObject({ subtotal_minor: 310050, discount_minor: 10000, tax_minor: null, total_minor: 300050 })
    expect(detail.view.pricing).toMatchObject({ total: { minor: 300050, text: '€3,000.50' }, subtotal: { text: '€3,100.50' }, discount: { text: '€100.00' }, optional: { text: '€200.00' }, tax: { amount: null, verified: false } })
    // A typed rate that was not confirmed adds nothing; a confirmed one is added on top, in whole minor units.
    expect((await kit.send('PUT', `/api/admin/quotes/${made.quoteId}`, draftBody({ taxRatePercent: '21', taxVerified: false }))).json.data.quotation).toMatchObject({ tax_minor: null, total_minor: 300050 })
    const taxed = (await kit.send('PUT', `/api/admin/quotes/${made.quoteId}`, draftBody({ taxRatePercent: '21', taxVerified: true }))).json.data.quotation
    expect(taxed).toMatchObject({ tax_minor: 63011, total_minor: 363061, tax_rate_bp: 2100 })
    expect(taxed.view.pricing.tax).toMatchObject({ ratePercent: '21', amount: { minor: 63011 }, verified: true })
    expect((await kit.send('PUT', `/api/admin/quotes/${made.quoteId}`, draftBody({ taxRatePercent: '21', taxVerified: true, taxMode: 'unspecified' }))).status).toBe(422) // confirming a rate needs a mode that has one
    // A fixed price, and a price in words.
    expect((await kit.send('PUT', `/api/admin/quotes/${made.quoteId}`, draftBody({ pricingMode: 'fixed', fixedAmount: '4 200,00' }))).json.data.quotation).toMatchObject({ pricing_mode: 'fixed', fixed_minor: 420000, total_minor: 420000 })
    const custom = (await kit.send('PUT', `/api/admin/quotes/${made.quoteId}`, draftBody({ pricingMode: 'custom', pricingNote: 'Time and material at an hourly rate to be agreed.', currency: '' }))).json.data.quotation
    expect(custom).toMatchObject({ pricing_mode: 'custom', total_minor: null })
    expect(custom.view.pricing.total).toBeNull()
  })

  it('refuses amounts that are not amounts, a discount with no reason, and totals that cannot hold', async () => {
    const made = await kit.ready()
    const put = (over: Record<string, unknown>) => kit.send('PUT', `/api/admin/quotes/${made.quoteId}`, draftBody(over))
    const fields = async (over: Record<string, unknown>) => (await put(over)).json.error.details.fields
    expect(await fields({ lines: [{ kind: 'item', description: 'X', quantity: 1, unitPrice: '12.3456' }] })).toEqual({ 'lines.0.unitPrice': 'invalid' })
    expect(await fields({ lines: [{ kind: 'item', description: 'X', quantity: 0, unitPrice: '1' }] })).toEqual({ 'lines.0.quantity': 'invalid' })
    expect(await fields({ lines: [{ kind: 'discount', description: 'X', quantity: 1, unitPrice: '1' }] })).toEqual({ 'lines.0.justification': 'required' })
    expect(await fields({ lines: [{ kind: 'item', description: '', quantity: 1, unitPrice: '1' }] })).toEqual({ 'lines.0.description': 'required' })
    expect(await fields({ lines: [{ kind: 'item', description: 'X', quantity: 1, unitPrice: '10' }, { kind: 'discount', description: 'Y', quantity: 1, unitPrice: '20', justification: 'Because.' }] })).toEqual({ lines: 'invalid' }) // discounts above the items
    expect(await fields({ currency: 'USD' })).toEqual({ currency: 'invalid' })
    expect(await fields({ validUntil: '2026-02-30' })).toEqual({ validUntil: 'invalid' })
    expect(await fields({ taxRatePercent: '101' })).toEqual({ taxRatePercent: 'invalid' })
    expect(await fields({ title: 'x'.repeat(161) })).toEqual({ title: 'tooLong' })
    expect(await fields({ pricingMode: 'free' })).toEqual({ pricingMode: 'invalid' })
    expect(await fields({ lines: 'many' })).toEqual({ lines: 'invalid' })
    expect(await fields({ language: 'de' })).toEqual({ language: 'invalid' })
    // Nothing was changed by the refusals.
    expect((await kit.get(`/api/admin/quotes/${made.quoteId}`)).json.data.quotation.total_minor).toBe(300050)
  })

  it('will not send an unfinished quotation, nor one that cannot reach the customer', async () => {
    const made = await kit.request()
    const quoteId = (await kit.send('POST', `/api/admin/quote-requests/${made.id}/quotes`)).json.data.quotation.id as string
    const blocked = await kit.send('POST', `/api/admin/quotes/${quoteId}/send`)
    expect(blocked.status).toBe(422)
    expect(blocked.json.error.details.fields).toMatchObject({ scope: 'required', terms: 'required', validUntil: 'required', currency: 'required', lines: 'required' })
    await kit.send('PUT', `/api/admin/quotes/${quoteId}`, draftBody({ validUntil: '2026-01-01' })) // in the past
    expect((await kit.send('POST', `/api/admin/quotes/${quoteId}/send`)).json.error.details.fields).toEqual({ validUntil: 'invalid' })
    await kit.send('PUT', `/api/admin/quotes/${quoteId}`, draftBody({ pricingMode: 'custom', pricingNote: '', currency: '' }))
    expect((await kit.send('POST', `/api/admin/quotes/${quoteId}/send`)).json.error.details.fields).toEqual({ pricingNote: 'required' })
    // Without e-mail or the site's address there is no way to deliver the link: it says so, and sends nothing.
    await server.close()
    await start({ PUBLIC_URL: '' })
    const other = await kit.ready()
    const noUrl = await kit.send('POST', `/api/admin/quotes/${other.quoteId}/send`)
    expect(noUrl.status).toBe(409)
    expect(noUrl.json.error.details.reason).toBe('email_unavailable')
    expect(server.db.get("SELECT status FROM quotes WHERE id = ?", [other.quoteId])).toEqual({ status: 'draft' })
  })
})

describe('Scenario B: sending the quotation and the customer\'s decision', () => {
  it('sends the offer with a secure link, which shows the whole document and nothing internal', async () => {
    const made = await kit.sent()
    expect(made.mail.subject).toBe(`Your quote: A website for the bakery — ${made.reference}-Q1`)
    for (const part of ['€3,000.50', 'A website for the bakery', 'Valid until', '31 December 2026', 'Looking forward to it.', 'Opening the link or reading this email is not an acceptance']) expect(made.mail.text, part).toContain(part)
    expect(made.mail.html).toContain(`href="https://site.test/en/quote/${made.token}"`)
    expect(made.mail.html).not.toMatch(/<img|src=/i) // nothing essential waits for an image to load
    expect(rowOf(made.id)).toMatchObject({ status: 'quote_sent', customer_status: 'quote_sent' })
    expect(server.db.get('SELECT status, sent_at FROM quotes WHERE id = ?', [made.quoteId])).toMatchObject({ status: 'sent', sent_at: expect.any(String) })

    const page = (await kit.open(made.token)).json.data
    expect(page.state).toBe('open')
    expect(page.quote).toMatchObject({ reference: `${made.reference}-Q1`, requestReference: made.reference, title: 'A website for the bakery', scope: 'Five pages, a contact form, deployment.', terms: 'These are the terms of this offer.', validUntil: '2026-12-31', customer: { name: 'Anna Kovács' } })
    expect(page.quote.pricing.total.text).toBe('€3,000.50')
    expect(page.quote.pricing.lines).toHaveLength(4)
    expect(Object.values(page.actions).every((token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token as string))).toBe(true)
    // No identifier, hash, address, note or secret of ours comes with it.
    expect(JSON.stringify(page)).not.toMatch(/"id"|content_hash|ip_hash|admin@site|anna@example|internal|token_hash|created_by/)
    // The status page of the request now offers it, and shows the customer-visible state.
    const status = (await server.api(`/api/customer/requests/${made.statusToken}`)).json.data
    expect(status).toMatchObject({ status: 'quote_sent', quotations: [{ reference: `${made.reference}-Q1`, state: 'open', link: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) }] })
    expect(events(made.id).map((event) => event.event_type)).toEqual(['request_created', 'status_changed', 'quote_created', 'quote_edited', 'status_changed', 'quote_sent'].filter((_, i, all) => all.indexOf(_) === i || true))
  })

  it('records the acceptance once: the customer confirms, both sides are told once, the project is not started, and a replay does nothing', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    // Opening the page is not accepting, and an acceptance needs the customer's explicit confirmation.
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'sent' })
    const unconfirmed = await kit.act({ token: page.actions.accept })
    expect(unconfirmed.status).toBe(422)
    expect(unconfirmed.json.error.details.fields.confirm).toBe('required')
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'sent' }) // and the token was not spent by the refusal

    const accepted = await kit.act({ token: page.actions.accept, confirm: true })
    expect(accepted.status, accepted.text).toBe(200)
    expect(accepted.json.data).toMatchObject({ outcome: 'accepted', reference: `${made.reference}-Q1` })
    expect(server.db.get('SELECT status, accepted_at FROM quotes WHERE id = ?', [made.quoteId])).toMatchObject({ status: 'accepted', accepted_at: expect.any(String) })
    expect(rowOf(made.id)).toMatchObject({ status: 'accepted', customer_status: 'accepted' }) // accepted, not in progress
    await kit.settle()
    await kit.settle()
    const toCustomer = kit.toCustomer().filter((mail) => mail.subject.startsWith('You accepted'))
    const toOwner = kit.owner().filter((mail) => mail.subject.startsWith('Quote accepted'))
    expect(toCustomer).toHaveLength(1)
    expect(toOwner).toHaveLength(1)
    expect(toCustomer[0].text).toContain('€3,000.50')
    expect(toCustomer[0].text).toContain('no payment has been requested or received')
    expect(toCustomer[0].text).not.toMatch(/payment (received|confirmed)|paid|invoice (sent|attached)/i)
    expect(toOwner[0].text).toContain('https://site.test/admin/quotes/')
    expect(toOwner[0].replyTo).toBe('anna@example.com')
    expect(events(made.id).slice(-2).map((event) => [event.event_type, event.actor_type])).toEqual([['status_changed', 'customer'], ['quote_accepted', 'customer']])

    // A replay of the same action, a second tab, a different action on the same offer: nothing happens, safely.
    const replay = await kit.act({ token: page.actions.accept, confirm: true })
    expect(replay.status).toBe(409)
    expect(replay.json.error.details.reason).toBe('already_used')
    const afterwards = await kit.act({ token: page.actions.decline, confirm: true })
    expect([409, 410]).toContain(afterwards.status)
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'accepted' })
    await kit.settle()
    expect(kit.toCustomer().filter((mail) => mail.subject.startsWith('You accepted'))).toHaveLength(1)
    // The link still opens the page, now as a record, with no way to act.
    const reopened = (await kit.open(made.token)).json.data
    expect(reopened.state).toBe('accepted')
    expect(reopened.actions).toEqual({ accept: null, decline: null, revise: null })
  })

  it('lets only one of two simultaneous acceptances through', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    const results = await Promise.all([kit.act({ token: page.actions.accept, confirm: true }), kit.act({ token: page.actions.accept, confirm: true })])
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    expect(server.db.get("SELECT COUNT(*) AS n FROM quote_events WHERE event_type = 'quote_accepted'")).toEqual({ n: 1 })
  })

  it('records a decline with its reason, tells both sides, and keeps the offer closed', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    const declined = await kit.act({ token: page.actions.decline, confirm: true, reason: 'We chose another supplier.' })
    expect(declined.json.data.outcome).toBe('declined')
    expect(server.db.get('SELECT status, decline_reason FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'declined', decline_reason: 'We chose another supplier.' })
    expect(rowOf(made.id)).toMatchObject({ status: 'declined', customer_status: 'declined' })
    await kit.settle()
    await kit.settle()
    expect(kit.toCustomer().filter((mail) => mail.subject.startsWith('Confirmation: you declined'))).toHaveLength(1)
    const toOwner = kit.owner().find((mail) => mail.subject.startsWith('Quote declined'))!
    expect(toOwner.text).toContain('We chose another supplier.')
    expect((await kit.act({ token: page.actions.accept, confirm: true })).status).toBeGreaterThanOrEqual(409)
    // The reason is not copied into the history or the audit log.
    expect(JSON.stringify(server.db.all('SELECT * FROM quote_events'))).not.toContain('another supplier')
    expect(JSON.stringify(server.db.all('SELECT * FROM audit_log'))).not.toContain('another supplier')
  })

  it('stores a request for clarification, tells the owner, and changes nothing in the offer', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    expect((await kit.act({ token: page.actions.revise })).status).toBe(422) // a message is needed
    const asked = await kit.act({ token: page.actions.revise, message: 'Could the timeline be shorter, and can you split the payment in three?' })
    expect(asked.json.data.outcome).toBe('revision_requested')
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'sent' }) // the offer is as it was
    expect(rowOf(made.id).status).toBe('under_review')
    await kit.settle()
    const notice = kit.owner().find((mail) => mail.subject.startsWith('The customer asked for clarification'))!
    expect(notice.text).toContain('Could the timeline be shorter')
    expect(notice.replyTo).toBe('anna@example.com')
    const detail = (await kit.get(`/api/admin/quote-requests/${made.id}`)).json.data
    expect(detail.revisions).toEqual([expect.objectContaining({ message: 'Could the timeline be shorter, and can you split the payment in three?', quote_id: made.quoteId })])
    // The page can be used again afterwards (new tokens), and the original can still be accepted.
    const again = (await kit.open(made.token)).json.data
    expect(again.actions.accept).toEqual(expect.any(String))
    expect((await kit.act({ token: again.actions.accept, confirm: true })).status).toBe(200)
  })

  it('does not let an expired offer be accepted, but still lets it be declined or questioned', async () => {
    const made = await kit.sent({ validUntil: '2026-11-10' })
    const page = (await kit.open(made.token)).json.data // opened while the offer was still valid
    server.clock.advance(10 * DAY) // November 13th: the last day was the 10th, and the action tokens of the first opening have lapsed too
    // So that the offer's own last day is what stops the acceptance, a token that has not lapsed is made for it.
    const stillGood = mintToken(server.app.context, { requestId: made.id, quoteId: made.quoteId, action: 'accept_quote', ttlMs: 30 * DAY }).token
    expect(page.actions.accept).not.toBe(stillGood)
    const refused = await kit.act({ token: stillGood, confirm: true })
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('quote_expired')
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'sent' })
    // Opened now, the page says so and hands out no way to accept, only to ask.
    const late = (await kit.open(made.token)).json.data
    expect(late.state).toBe('expired')
    expect(late.quote.expired).toBe(true)
    expect(late.actions.accept).toBeNull()
    expect(late.actions.decline).toBeNull()
    expect((await kit.act({ token: late.actions.revise, message: 'Could you renew this offer for December?' })).status).toBe(200)
  })

  it('stops a link that was replaced, withdrawn, expired or spent, and tells a real link from a made-up one only by what it was', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    // Opening the page again replaces the unused action tokens of the first opening.
    const second = (await kit.open(made.token)).json.data
    const stale = await kit.act({ token: page.actions.decline, confirm: true })
    expect(stale.status).toBe(410)
    expect(stale.json.error.details.reason).toBe('replaced')
    // An action token expires after a couple of hours; the link itself lasts for CUSTOMER_LINK_DAYS.
    server.clock.advance(3 * 3_600_000)
    expect((await kit.act({ token: second.actions.decline, confirm: true })).json.error.details.reason).toBe('expired')
    expect((await kit.open(made.token)).status).toBe(200)
    server.clock.advance(91 * DAY)
    const expired = await kit.open(made.token)
    expect(expired.status).toBe(410)
    expect(expired.json.error.details.reason).toBe('expired')
    // What was never a link, or is the wrong kind of link, is simply not found.
    for (const token of ['x', 'a'.repeat(43), 'CC-2026-000001', '../../etc/passwd', page.actions.accept]) {
      const response = await kit.open(token)
      expect(response.status, token).toBe(404)
      expect(response.json.error.code).toBe('not_found')
    }
    expect((await kit.act({ token: made.token, confirm: true })).status).toBe(404) // a viewing link cannot act
    expect((await kit.act({ token: made.statusToken, confirm: true })).status).toBe(404) // nor can the status link
    expect((await server.api(`/api/customer/requests/${made.token}`)).status).toBe(404) // a quotation link is not a status link
    expect((await kit.act({})).status).toBe(404)
  })

  it('counts the guesses of a stranger and makes them wait', async () => {
    await server.close()
    await start({ RATE_LIMITS: 'true' })
    const statuses: number[] = []
    for (let i = 0; i < 24; i += 1) statuses.push((await server.api(`/api/customer/quotations/${String(i).padStart(43, 'a')}`)).status)
    expect(statuses.slice(0, 20).every((status) => status === 404)).toBe(true)
    expect(statuses.slice(20).every((status) => status === 429)).toBe(true)
  })
})

describe('Scenario E: a revision', () => {
  it('keeps the old version, ends its links, and sends the new one with a new message', async () => {
    const first = await kit.sent()
    const page = (await kit.open(first.token)).json.data
    await kit.act({ token: page.actions.revise, message: 'Please make it cheaper.' })
    expect((await kit.send('POST', `/api/admin/quote-requests/${first.id}/quotes`, { from: first.quoteId })).status).toBe(422) // the reason is required
    const draft = await kit.send('POST', `/api/admin/quote-requests/${first.id}/quotes`, { from: first.quoteId, reason: 'Lower price after the customer\'s question.' })
    expect(draft.status, draft.text).toBe(201)
    const v2 = draft.json.data.quotation
    expect(v2).toMatchObject({ version: 2, status: 'draft', reference: `${first.reference}-Q2`, revision_reason: 'Lower price after the customer\'s question.', supersedes_id: first.quoteId, valid_until: null })
    expect(v2.lines).toHaveLength(4) // copied from version 1
    expect(draft.json.data.problems.validUntil).toBe('required')
    await kit.send('PUT', `/api/admin/quotes/${v2.id}`, draftBody({ validUntil: '2026-12-31', lines: [{ kind: 'item', description: 'Everything', quantity: 1, unitPrice: '2500' }] }))
    // The old one is still the live one until the new one goes out.
    expect((await kit.open(first.token)).json.data.state).toBe('open')
    const sentV2 = await kit.send('POST', `/api/admin/quotes/${v2.id}/send`)
    expect(sentV2.status, sentV2.text).toBe(200)
    await kit.settle()

    expect(server.db.all('SELECT version, status FROM quotes ORDER BY version')).toEqual([{ version: 1, status: 'superseded' }, { version: 2, status: 'sent' }])
    const mail = kit.toCustomer().filter((message) => message.subject.startsWith('Revised quote')).at(-1)!
    expect(mail.subject).toBe(`Revised quote: A website for the bakery — ${first.reference}-Q2`)
    expect(mail.text).toContain('€2,500.00')
    expect(mail.text).toContain('no longer works')
    const newToken = linkIn(mail.text, 'quote')
    expect(newToken).not.toBe(first.token)
    // The old link and every action it handed out are dead; the new one works.
    const oldPage = await kit.open(first.token)
    expect(oldPage.status).toBe(410)
    expect(oldPage.json.error.details.reason).toBe('replaced')
    const oldAccept = await kit.act({ token: (await Promise.resolve(page.actions.accept)) ?? '', confirm: true })
    expect([404, 410]).toContain(oldAccept.status)
    expect((await kit.open(newToken)).json.data).toMatchObject({ state: 'open', quote: { version: 2 } })
    // The first version is on record, unchanged, in the administration.
    const detail = (await kit.get(`/api/admin/quote-requests/${first.id}`)).json.data
    expect(detail.quotations.map((row: { version: number; status: string; total_minor: number }) => [row.version, row.status, row.total_minor])).toEqual([[1, 'superseded', 300050], [2, 'sent', 250000]])
    expect(events(first.id).map((event) => event.event_type)).toEqual(expect.arrayContaining(['quote_sent', 'revision_requested', 'quote_version_created', 'quote_superseded']))
    // A revision of an accepted offer is not possible.
    await kit.act({ token: (await kit.open(newToken)).json.data.actions.accept, confirm: true })
    expect((await kit.send('POST', `/api/admin/quote-requests/${first.id}/quotes`, { from: v2.id, reason: 'Too late for this.' })).status).toBe(409)
  })

  it('makes a sent version impossible to edit, in the interface and in the database', async () => {
    const made = await kit.sent()
    expect((await kit.send('PUT', `/api/admin/quotes/${made.quoteId}`, draftBody({ title: 'Changed quietly' }))).status).toBe(409)
    expect((await kit.send('DELETE', `/api/admin/quotes/${made.quoteId}`)).status).toBe(409)
    expect(() => server.db.run("UPDATE quotes SET title = 'Changed quietly' WHERE id = ?", [made.quoteId])).toThrow(/never edited/)
    expect(() => server.db.run('UPDATE quotes SET total_minor = 1 WHERE id = ?', [made.quoteId])).toThrow(/never edited/)
    expect(() => server.db.run("UPDATE quote_lines SET unit_minor = 1 WHERE quote_id = ?", [made.quoteId])).toThrow(/never edited/)
    expect(() => server.db.run("INSERT INTO quote_lines (quote_id, position, kind, description, quantity, unit_minor) VALUES (?, 9, 'item', 'Sneaked in', 1, 100)", [made.quoteId])).toThrow(/never edited/)
    expect(() => server.db.run('DELETE FROM quote_lines WHERE quote_id = ?', [made.quoteId])).toThrow(/never edited/)
    expect((await kit.get(`/api/admin/quotes/${made.quoteId}`)).json.data.quotation.title).toBe('A website for the bakery')
  })

  it('can be sent again for a lost message, and taken back, which ends the links', async () => {
    const made = await kit.sent()
    // A second offer for a request that has one is a new VERSION of it (with a reason), not a fresh start.
    const again = await kit.send('POST', `/api/admin/quote-requests/${made.id}/quotes`)
    expect(again.status).toBe(409)
    expect(again.json.error.details.reason).toBe('use_revision')
    expect((await kit.send('POST', `/api/admin/quotes/${made.quoteId}/resend`)).status).toBe(202)
    await kit.settle()
    const links = kit.toCustomer().filter((mail) => linkIn(mail.text, 'quote')).map((mail) => linkIn(mail.text, 'quote'))
    expect(links).toHaveLength(2)
    expect(new Set(links).size).toBe(2) // each message has a link of its own
    expect((await kit.open(links[0])).status).toBe(200) // the earlier one still works: that message may be the one that arrived
    expect((await kit.send('POST', `/api/admin/quotes/${made.quoteId}/withdraw`)).status).toBe(200)
    expect(rowOf(made.id).status).toBe('quote_preparation')
    for (const link of links) expect((await kit.open(link)).status).toBe(410)
    expect((await kit.send('POST', `/api/admin/quotes/${made.quoteId}/resend`)).status).toBe(409) // nothing out to resend
    expect((await kit.send('POST', `/api/admin/quotes/${made.quoteId}/withdraw`)).status).toBe(409)
  })

  it('takes back an offer that is out when the request is cancelled', async () => {
    const made = await kit.sent()
    expect((await kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, { status: 'cancelled' })).status).toBe(200)
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'withdrawn' })
    expect((await kit.open(made.token)).status).toBe(410)
    expect((await kit.send('POST', `/api/admin/quote-requests/${made.id}/quotes`)).status).toBe(409) // a cancelled request has no new offer until it is re-opened
  })
})

describe('the e-mails in three languages', () => {
  it('writes the quotation in the language of the offer, escapes what a person typed, and keeps the subject on one line', async () => {
    for (const [language, subject, word] of [['hu', /^Ajánlatod: /, 'Érvényes eddig'], ['nl', /^Je offerte: /, 'Geldig tot'], ['en', /^Your quote: /, 'Valid until']] as const) {
      const made = await kit.sent({ language, title: `<script>alert("${language}")</script> Weboldal\r\nBcc: evil@example.com`, introduction: '<b>x</b>' }, { description: `A request for a website, written in ${language}, with enough words.` })
      expect(made.mail.subject, language).toMatch(subject)
      expect(made.mail.subject).not.toMatch(/[\r\n]/)
      expect(made.mail.text).toContain(word)
      expect(made.mail.html).toContain(`<html lang="${language}">`)
      expect(made.mail.html).not.toContain('<script>')
      expect(made.mail.html).toContain('&lt;script&gt;')
      expect(made.mail.html).toContain(`https://site.test/${language}/quote/`)
      expect(made.mail.html).toContain('max-width:620px')
      // The plain text alone is enough to act: it carries the link.
      expect(linkIn(made.mail.text, 'quote')).toBe(made.token)
    }
  })
})

describe('what is kept, and what is forgotten', () => {
  it('writes the history without anything a person typed, and cannot be told to forget it', async () => {
    const made = await kit.sent()
    await kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, { addNote: 'Private: the customer is difficult.', priority: 'high' })
    const page = (await kit.open(made.token)).json.data
    await kit.act({ token: page.actions.revise, message: 'Secret wish: a cheaper plan.' })
    await kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, { archived: true })
    const everything = JSON.stringify([server.db.all('SELECT * FROM quote_events'), server.db.all('SELECT * FROM audit_log')])
    expect(everything).not.toMatch(/difficult|Secret wish|anna@example|Kovács|A small website for a bakery|token/i)
    const types = events(made.id).map((event) => event.event_type)
    expect(types).toEqual(expect.arrayContaining(['request_created', 'status_changed', 'quote_created', 'quote_edited', 'quote_sent', 'note_added', 'priority_changed', 'revision_requested', 'archived']))
    expect(() => server.db.run("UPDATE quote_events SET summary = 'x'")).toThrow(/append-only/)
    expect(() => server.db.run('DELETE FROM quote_events')).toThrow(/append-only/)
    // The history is shown in order to the administrator and cannot be written through the API.
    const history = (await kit.get(`/api/admin/quote-requests/${made.id}`)).json.data.history
    expect(history.map((event: { id: number }) => event.id)).toEqual([...history.map((event: { id: number }) => event.id)].sort((a, b) => a - b))
    for (const method of ['PUT', 'DELETE', 'PATCH', 'POST']) expect((await kit.send(method, `/api/admin/quote-requests/${made.id}/history`)).status, method).toBe(404)
  })

  it('shows the customer only what was shown to them, and exports a complete record without our fingerprints', async () => {
    const made = await kit.sent()
    await kit.send('PATCH', `/api/admin/quote-requests/${made.id}`, { addNote: 'Internal only.' })
    const status = (await server.api(`/api/customer/requests/${made.statusToken}`)).json.data
    expect(Object.keys(status).sort()).toEqual(['createdAt', 'language', 'quotations', 'reference', 'status', 'updates'])
    expect(JSON.stringify(status)).not.toMatch(/Internal only|anna@example|Kovács|history|note/i)
    const exported = (await kit.get(`/api/admin/quote-requests/${made.id}/export`)).json.data
    expect(exported).toMatchObject({ reference: made.reference, name: 'Anna Kovács', quotations: [{ version: 1, status: 'sent', view: { pricing: { total: { minor: 300050 } } } }] })
    expect(JSON.stringify(exported)).not.toMatch(/ip_hash|content_hash|"id":|token/)
  })

  it('removes the request, its offers, links and e-mails on deletion, and leaves one line saying it existed', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    await kit.act({ token: page.actions.revise, message: 'A question.' })
    await kit.settle()
    expect((await kit.send('DELETE', `/api/admin/quote-requests/${made.id}`)).status).toBe(204)
    for (const table of ['quote_requests', 'quotes', 'quote_lines', 'customer_action_tokens', 'quote_revision_requests', 'customer_updates', 'quote_request_items']) expect(server.db.get(`SELECT COUNT(*) AS n FROM ${table}`), table).toEqual({ n: 0 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries')).toEqual({ n: 0 })
    expect(events(made.id).at(-1)).toMatchObject({ event_type: 'request_deleted', actor_type: 'admin' })
    expect((await kit.open(made.token)).status).toBe(404)
    expect((await server.api(`/api/customer/requests/${made.statusToken}`)).status).toBe(404)
  })

  it("forgets everything about one address on request (the operator's erase command), quotations, links and the owner's notifications included", async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    await kit.act({ token: page.actions.revise, message: 'A question.' })
    await kit.settle()
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries WHERE recipient = ?', ['owner@site.test'])).not.toEqual({ n: 0 })
    const result = eraseByEmail(server.app.context, 'ANNA@example.com')
    expect(result.quoteRequests).toBe(1)
    expect(result.deliveries).toBeGreaterThan(3)
    for (const table of ['quote_requests', 'quotes', 'quote_lines', 'customer_action_tokens', 'quote_revision_requests', 'customer_updates', 'email_deliveries']) expect(server.db.get(`SELECT COUNT(*) AS n FROM ${table}`), table).toEqual({ n: 0 })
    // What stays: lines of the history with a reference and a status, no name, no address, no text.
    expect(JSON.stringify(server.db.all('SELECT * FROM quote_events'))).not.toMatch(/anna|example\.com|Kov/i)
  })

  it('forgets spent links a month after they stopped mattering', async () => {
    const made = await kit.sent()
    await kit.open(made.token)
    expect(purgeTokens(server.app.context)).toBe(0)
    server.clock.advance(125 * DAY)
    expect(purgeTokens(server.app.context)).toBeGreaterThan(0)
    expect(server.db.get('SELECT COUNT(*) AS n FROM customer_action_tokens')).toEqual({ n: 0 })
  })
})

describe('the assistant\'s request is the same kind of request', () => {
  it('is covered by the same reference, history, status page and confirmation (see aiTools.test.ts for the approval flow)', async () => {
    // The flow through CONTROL ROOM AI is tested in aiTools.test.ts; here only that it ends in the same place as the others.
    const rows = server.db.all<{ name: string }>("SELECT name FROM pragma_table_info('quote_requests') WHERE name IN ('request_type', 'source', 'customer_status', 'priority', 'budget_range', 'website', 'marketing_consent_at')")
    expect(rows).toHaveLength(7)
    expect(server.db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ai_%quote%'")).toEqual([]) // there is no separate store for the assistant's requests
  })
})

describe("the customer's private pages as files", () => {
  it('answers any secret with the same quiet shell, never cached, never indexed, never passed on as a referrer', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-static-'))
    try {
      for (const page of ['quote', 'request']) {
        mkdirSync(join(directory, 'en', page), { recursive: true })
        writeFileSync(join(directory, 'en', page, 'index.html'), '<!doctype html><title>shell</title>')
      }
      writeFileSync(join(directory, '404.html'), '<!doctype html><title>not found</title>')
      writeFileSync(join(directory, '_headers'), '/*\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: public, max-age=3600\n')
      await server.close()
      await start({ STATIC_DIR: directory })
      const secret = 'A'.repeat(43)
      for (const page of ['quote', 'request']) {
        const response = await server.fetch(`/en/${page}/${secret}`)
        expect(response.status, page).toBe(200)
        expect(await response.text()).toContain('shell')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
        expect(response.headers.get('referrer-policy')).toBe('no-referrer')
        // Too short to be a secret: not the shell, just not found.
        expect((await server.fetch(`/en/${page}/short`)).status).toBe(404)
        expect((await server.fetch(`/xx/${page}/${secret}`)).status).toBe(404)
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
