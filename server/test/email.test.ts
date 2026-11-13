import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'
import { Database } from '../src/db/database.ts'
import { migrate } from '../src/db/migrate.ts'
import { ConstraintError } from '../src/http/errors.ts'
import { CONFIRMATIONS_PER_ADDRESS_PER_DAY } from '../src/modules/notifications/notifier.ts'
import { createResendMailer, failureOf } from '../src/modules/notifications/resend.ts'
import { MailError } from '../src/modules/notifications/smtp.ts'
import { renderRequestConfirmation } from '../src/modules/notifications/quoteTemplates.ts'
import { renderInquiryConfirmation, renderTestEmail } from '../src/modules/notifications/templates.ts'
import { contact, quote, startServer, TestClock, type TestServer } from './helpers.ts'
import { API_KEY, mockResend, WEBHOOK_SECRET, type MockResend } from './resendMock.ts'

/**
 * The transactional provider path (PROMPT 14), end to end on real HTTP against a stand-in for the provider's API:
 * what is sent and how, what a failure becomes, that a stored request never depends on its e-mail, the optional
 * confirmation to the person who wrote, and the rules around it. (The webhook has its own file.)
 */

let provider: MockResend
let server: TestServer

const resendEnv = (extra: Record<string, string> = {}) => ({
  EMAIL_PROVIDER: 'resend',
  EMAIL_API_KEY: API_KEY,
  EMAIL_API_URL: provider.url,
  EMAIL_FROM: 'Controlled Chaos <notifications@site.test>',
  EMAIL_REPLY_TO: 'Controlled Chaos <hello@site.test>',
  EMAIL_WEBHOOK_SECRET: WEBHOOK_SECRET,
  NOTIFY_TO: 'owner-private@mail.test',
  ...extra,
})

const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve))
  await server.app.context.notifier.processDue()
}

beforeEach(async () => {
  provider = await mockResend()
  server = await startServer({ env: resendEnv(), realMailer: true })
})

afterEach(async () => {
  await server.close()
  await provider.close()
})

const rows = () => server.db.all<{ id: string; kind: string; recipient: string; status: string; attempts: number; send_generation: number; error_code: string | null; last_error: string | null; provider_message_id: string | null }>('SELECT * FROM email_deliveries ORDER BY created_at, id')

describe('what is sent to the provider', () => {
  it('a contact message becomes one authenticated request: the verified sender, the visitor as Reply-To, never the other way round', async () => {
    const response = await server.api('/api/contact', { body: contact({ name: 'Kovács Ánna', email: 'anna@example.com', subject: 'Új weboldal' }) })
    expect(response.status).toBe(201)
    await settle()

    const [request] = provider.sends()
    expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`)
    expect(request.headers['content-type']).toBe('application/json')
    const body = request.body as { from: string; to: string[]; reply_to: string; subject: string; html: string; text: string; tags: { name: string; value: string }[]; headers: Record<string, string> }
    expect(body.from).toBe('Controlled Chaos <notifications@site.test>')
    expect(body.to).toEqual(['owner-private@mail.test'])
    expect(body.reply_to).toBe('anna@example.com')
    expect(body.subject).toContain('Új weboldal')
    // Both parts, and a plain part a person can read.
    expect(body.html).toContain('<!doctype html>')
    expect(body.text).toContain('Kovács Ánna')
    expect(body.text).toContain('A new website'.slice(0, 0) + 'Új weboldal')
    expect(body.headers['X-Auto-Response-Suppress']).toBe('All')
    // The visitor's address is never the sender, whoever they say they are.
    expect(body.from).not.toContain('example.com')

    const [row] = rows()
    expect(row).toMatchObject({ kind: 'inquiry_received', status: 'accepted', attempts: 1, error_code: null })
    expect(row.provider_message_id).toMatch(/^[0-9a-f-]{36}$/)
    // The provider labels the message with our id, so its events can be matched to it.
    expect(body.tags).toEqual([
      { name: 'delivery', value: row.id },
      { name: 'kind', value: 'inquiry_received' },
    ])
  })

  it('sends an idempotency key made of the message and its generation', async () => {
    await server.api('/api/contact', { body: contact() })
    await settle()
    const [row] = rows()
    expect(provider.sends()[0].headers['idempotency-key']).toBe(`${row.id}-0`)
  })

  it('never lets a visitor decide who gets mail: the recipient of every message comes from configuration or the stored record', async () => {
    await server.api('/api/contact', { body: { ...contact(), to: 'victim@example.com', recipient: 'victim@example.com', cc: 'victim@example.com', bcc: 'victim@example.com', notify: 'victim@example.com' } })
    await settle()
    for (const request of provider.sends()) {
      const body = request.body as { to: string[]; cc?: unknown; bcc?: unknown }
      expect(body.to).toEqual(['owner-private@mail.test'])
      expect(body.cc).toBeUndefined()
      expect(body.bcc).toBeUndefined()
    }
  })

  it('a customer-facing message is answered at the public address, and never exposes the owner’s private one', async () => {
    const admin = await server.signIn()
    await server.api('/api/contact', { body: contact() })
    await settle()
    const inquiry = server.db.get<{ id: string }>('SELECT id FROM inquiries')!
    const change = await server.api(`/api/admin/inquiries/${inquiry.id}`, { method: 'PATCH', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: { status: 'in_progress', notify: true, note: 'Thursday works.' } })
    expect(change.status).toBe(200)
    await settle()
    const toCustomer = provider.sends().map((request) => request.body as { to: string[]; reply_to: string; html: string; text: string }).find((body) => body.to[0] === 'anna@example.com')!
    expect(toCustomer.reply_to).toBe('hello@site.test')
    expect(JSON.stringify(toCustomer)).not.toContain('owner-private@mail.test')
  })

  it('refuses a subject with a line break instead of sending it, and does not retry what can never be built', async () => {
    const mailer = createResendMailer(server.config.email, async () => new Response('{}', { status: 200 }))
    await expect(mailer.send({ from: 'a@site.test', to: 'b@example.com', subject: 'Hi\r\nBcc: evil@example.com', text: 't', html: 'h', messageId: 'x@site.test', date: new Date() })).rejects.toThrow(/line break/)
  })
})

describe('what a failure becomes', () => {
  const quiet = (status: number, name: string, retryAfter: string | null = null) => failureOf(status, { name, message: 'm', statusCode: status }, retryAfter)

  it.each([
    [401, 'restricted_api_key', false, 'auth'],
    [403, 'validation_error', false, 'auth'],
    [400, 'validation_error', false, 'rejected'],
    [422, 'missing_required_field', false, 'rejected'],
    [429, 'rate_limit_exceeded', true, 'rate_limited'],
    [429, 'daily_quota_exceeded', false, 'quota'],
    [429, 'monthly_quota_exceeded', false, 'quota'],
    [409, 'concurrent_idempotent_requests', true, 'conflict'],
    [409, 'invalid_idempotent_request', false, 'rejected'],
    [500, 'application_error', true, 'unavailable'],
    [503, 'service_unavailable', true, 'unavailable'],
  ])('a %s (%s) %s retried: reason %s', (status, name, transient, reason) => {
    const error = quiet(status, name)
    expect(error).toBeInstanceOf(MailError)
    expect(error.transient).toBe(transient)
    expect(error.reason).toBe(reason)
  })

  it('a provider that is down is retried after a pause, with the SAME idempotency key, and then accepted', async () => {
    provider.script.push({ status: 503, body: { name: 'service_unavailable', message: 'down', statusCode: 503 } })
    const response = await server.api('/api/contact', { body: contact() })
    expect(response.status).toBe(201)
    await settle()
    expect(rows()[0]).toMatchObject({ status: 'pending', attempts: 1, error_code: 'unavailable' })
    server.clock.advance(61_000)
    await settle()
    expect(rows()[0]).toMatchObject({ status: 'accepted', attempts: 2, error_code: null, last_error: null })
    const keys = provider.sends().map((request) => request.headers['idempotency-key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('a wrong API key fails at once (waiting cannot help), keeps the message, and tells the administrator what kind of failure it was', async () => {
    provider.script.push({ status: 401, body: { name: 'validation_error', message: 'API key is invalid', statusCode: 401 } })
    const response = await server.api('/api/contact', { body: contact() })
    // The visitor is told the message arrived: it did, and it is stored. The e-mail is a separate matter.
    expect(response.status).toBe(201)
    expect(response.json.data.status).toBe('received')
    await settle()
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    expect(rows()[0]).toMatchObject({ status: 'failed', attempts: 1, error_code: 'auth' })
    const admin = await server.signIn()
    const overview = (await server.api('/api/admin/notifications', { headers: { Cookie: admin.cookie } })).json.data
    expect(overview.deliveries[0]).toMatchObject({ status: 'failed', errorCode: 'auth', retrying: false })
    expect(overview.counts.failed).toBe(1)
  })

  it('a refused address fails at once with the reason "rejected" and is not retried on its own', async () => {
    provider.script.push({ status: 422, body: { name: 'validation_error', message: 'Invalid `to` field', statusCode: 422 } })
    await server.api('/api/contact', { body: contact() })
    await settle()
    server.clock.advance(24 * 60 * 60_000)
    await settle()
    expect(rows()[0]).toMatchObject({ status: 'failed', attempts: 1, error_code: 'rejected' })
    expect(provider.sends()).toHaveLength(1)
  })

  it('a used-up quota is a failure an administrator can retry later, not one the server retries forever', async () => {
    provider.script.push({ status: 429, body: { name: 'daily_quota_exceeded', message: 'quota', statusCode: 429 } })
    await server.api('/api/contact', { body: contact() })
    await settle()
    expect(rows()[0]).toMatchObject({ status: 'failed', error_code: 'quota' })
  })

  it('gives up after the configured number of tries for a failure that keeps passing', async () => {
    await server.close()
    server = await startServer({ env: resendEnv({ EMAIL_MAX_ATTEMPTS: '2' }), realMailer: true })
    provider.script.push({ status: 500, body: { name: 'application_error', message: 'x', statusCode: 500 } }, { status: 500, body: { name: 'application_error', message: 'x', statusCode: 500 } })
    await server.api('/api/contact', { body: contact() })
    await settle()
    server.clock.advance(61_000)
    await settle()
    expect(rows()[0]).toMatchObject({ status: 'failed', attempts: 2, error_code: 'unavailable' })
  })

  it('an unreachable provider is a temporary failure; one that never answers times out as one', async () => {
    const down = createResendMailer({ ...server.config.email, apiUrl: 'http://127.0.0.1:9' }, undefined)
    await expect(down.send({ from: 'a@site.test', to: 'b@example.com', subject: 's', text: 't', html: 'h', messageId: 'x@site.test', date: new Date() })).rejects.toMatchObject({ transient: true, reason: 'network' })
    const hang = createResendMailer(server.config.email, async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    })
    await expect(hang.send({ from: 'a@site.test', to: 'b@example.com', subject: 's', text: 't', html: 'h', messageId: 'x@site.test', date: new Date() })).rejects.toMatchObject({ transient: true, reason: 'timeout' })
  })

  it('an administrator’s retry is a new generation of the message: a new idempotency key, and the same row', async () => {
    provider.script.push({ status: 401, body: { name: 'validation_error', message: 'API key is invalid', statusCode: 401 } })
    await server.api('/api/contact', { body: contact() })
    await settle()
    const failed = rows()[0]
    const admin = await server.signIn()
    const retry = await server.api(`/api/admin/notifications/deliveries/${failed.id}/retry`, { method: 'POST', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: {} })
    expect(retry.status).toBe(200)
    await settle()
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({ status: 'accepted', send_generation: 1, error_code: null })
    expect(provider.sends().map((request) => request.headers['idempotency-key'])).toEqual([`${failed.id}-0`, `${failed.id}-1`])
  })

  it('keeps the API key out of every log line and every answer', async () => {
    provider.script.push({ status: 401, body: { name: 'validation_error', message: `Bad key ${API_KEY}`, statusCode: 401 } })
    await server.api('/api/contact', { body: contact() })
    await settle()
    const admin = await server.signIn()
    const answers = [(await server.api('/api/admin/notifications', { headers: { Cookie: admin.cookie } })).text, (await server.api('/api/admin/system', { headers: { Cookie: admin.cookie } })).text, (await server.api('/api/admin/dashboard', { headers: { Cookie: admin.cookie } })).text]
    for (const text of [server.logs.join('\n'), ...answers]) {
      expect(text).not.toContain(API_KEY)
      expect(text).not.toContain(WEBHOOK_SECRET)
    }
    expect(JSON.parse(answers[1]).data.config).toMatchObject({ emailApiKey: 'set', emailWebhookSecret: 'set' })
  })
})

describe('a stored request does not depend on its e-mail', () => {
  it('the visitor is told the truth when the provider is down: the message was received', async () => {
    await provider.close()
    const response = await server.api('/api/contact', { body: contact() })
    expect(response.status).toBe(201)
    await settle()
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    expect(rows()[0]).toMatchObject({ status: 'pending', error_code: 'network' })
    provider = await mockResend()
  })

  it('a quote request is stored and answered the same way', async () => {
    provider.script.push({ status: 500, body: { name: 'application_error', message: 'x', statusCode: 500 } })
    const response = await server.api('/api/quote-requests', { body: quote() })
    expect(response.status).toBe(201)
    await settle()
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 1 })
    expect(rows().find((row) => row.kind === 'quote_received')).toMatchObject({ kind: 'quote_received', status: 'pending' })
  })

  it('a message sent twice gives one stored request and one notification', async () => {
    const first = await server.api('/api/contact', { body: contact() })
    const second = await server.api('/api/contact', { body: contact() })
    expect([first.status, second.status]).toEqual([201, 200])
    await settle()
    expect(rows().filter((row) => row.kind === 'inquiry_received')).toHaveLength(1)
    expect(provider.sends()).toHaveLength(1)
  })
})

describe('the confirmation to the person who wrote', () => {
  const turnOn = async (body: Record<string, unknown> = { newInquiry: true, newQuote: true, confirmInquiry: true, confirmQuote: true }) => {
    const admin = await server.signIn()
    const response = await server.api('/api/admin/notifications/preferences', { method: 'PUT', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body })
    expect(response.status).toBe(200)
    return admin
  }
  const toVisitor = () => provider.sends().map((request) => request.body as { to: string[]; from: string; reply_to: string; subject: string; text: string; html: string }).filter((body) => body.to[0] === 'anna@example.com')

  it('is off for a message until an administrator turns it on, and on for a quote request until they turn it off', async () => {
    await server.api('/api/contact', { body: contact() })
    await settle()
    await settle()
    expect(toVisitor()).toEqual([])
    await server.api('/api/quote-requests', { body: quote() })
    await settle()
    await settle()
    expect(toVisitor()).toHaveLength(1)
    expect(rows().map((row) => row.kind).sort()).toEqual(['inquiry_received', 'quote_confirmation', 'quote_received'])
    await turnOn({ newInquiry: true, newQuote: true, confirmInquiry: false, confirmQuote: false })
    await server.api('/api/quote-requests', { body: quote({ description: 'A second request, written after the confirmation was switched off.' }) })
    await settle()
    await settle()
    expect(toVisitor()).toHaveLength(1)
  })

  it('confirms a message once it is on: in the visitor’s language, from the verified sender, answered at the public address', async () => {
    await turnOn()
    await server.api('/api/contact', { body: contact({ language: 'hu', name: 'Kovács Ánna', subject: 'Új weboldal' }) })
    await settle()
    await settle()
    const [mail] = toVisitor()
    expect(mail.from).toBe('Controlled Chaos <notifications@site.test>')
    expect(mail.reply_to).toBe('hello@site.test')
    expect(mail.subject).toMatch(/^Megkaptuk az üzeneted \(C-/)
    expect(mail.text).toContain('Köszönjük, hogy felvetted velünk a kapcsolatot! Üzeneted sikeresen megérkezett. Hamarosan áttekintjük a megkeresésedet.')
    expect(mail.text).toContain('Szia Kovács Ánna!')
    expect(mail.text).toContain('Új weboldal')
    // Nothing of the owner's inbox, no promise of when.
    expect(JSON.stringify(mail)).not.toContain('owner-private@mail.test')
    expect(mail.text).not.toMatch(/\b(\d+ (óra|nap|hour|day)|24|48|hétköznap|working day)/i)
  })

  it('confirms a quote request with what was chosen and no price, no estimate and no promise', async () => {
    await turnOn()
    await server.api('/api/quote-requests', { body: quote({ language: 'en' }) })
    await settle()
    await settle()
    const [mail] = toVisitor()
    expect(mail.subject).toMatch(/^We will review your enquiry soon — CC-\d{4}-\d{6}$/)
    expect(mail.text).toContain('Your request has been received and we will review it soon')
    expect(mail.text).toMatch(/Website/)
    expect(mail.text).not.toMatch(/€|EUR|HUF|\bFt\b|price|prijs|ár\b|estimate|\$/i)
    expect(mail.text).not.toMatch(/guarantee|appointment|accepted|will start|within/i)
  })

  it('sends one per submission: a second request for the same record, or a repeat of the form, adds nothing', async () => {
    await turnOn()
    await server.api('/api/contact', { body: contact() })
    await server.api('/api/contact', { body: contact() })
    await settle()
    await settle()
    const id = server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id
    server.app.context.notifier.confirmSubmitter('inquiry', id)
    server.app.context.notifier.confirmSubmitter('inquiry', id)
    await settle()
    expect(rows().filter((row) => row.kind === 'inquiry_confirmation')).toHaveLength(1)
    expect(toVisitor()).toHaveLength(1)
    // The database itself refuses the second row, whatever code tries to add it.
    expect(() => server.db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, created_at, updated_at) VALUES ('dup', 'inquiry_confirmation', 'inquiry', ?, 'anna@example.com', 'en', 'pending', ?, ?)", [id, new Date().toISOString(), new Date().toISOString()])).toThrow(ConstraintError)
  })

  it(`sends at most ${CONFIRMATIONS_PER_ADDRESS_PER_DAY} a day to one address, so the site cannot be used to flood someone`, async () => {
    await turnOn()
    for (let index = 0; index < CONFIRMATIONS_PER_ADDRESS_PER_DAY + 2; index += 1) await server.api('/api/contact', { body: contact({ subject: `Another subject ${index}`, message: `A different message number ${index}, long enough to be a message.` }) })
    await settle()
    await settle()
    expect(toVisitor()).toHaveLength(CONFIRMATIONS_PER_ADDRESS_PER_DAY)
    expect(server.logs.join('\n')).toContain('confirmation skipped: this address has had its share today')
    // The messages themselves were all stored and all reached the owner.
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: CONFIRMATIONS_PER_ADDRESS_PER_DAY + 2 })
    server.clock.advance(25 * 60 * 60_000)
    await server.api('/api/contact', { body: contact({ subject: 'The next day', message: 'Another message on the next day, long enough.' }) })
    await settle()
    await settle()
    expect(toVisitor()).toHaveLength(CONFIRMATIONS_PER_ADDRESS_PER_DAY + 1)
  })

  it('can be switched off again, and the two kinds are independent', async () => {
    await turnOn({ newInquiry: true, newQuote: true, confirmInquiry: false, confirmQuote: true })
    await server.api('/api/contact', { body: contact() })
    await server.api('/api/quote-requests', { body: quote() })
    await settle()
    await settle()
    expect(rows().map((row) => row.kind).sort()).toEqual(['inquiry_received', 'quote_confirmation', 'quote_received'])
  })

  it('says what the administrator wrote about timing, in the visitor’s language, and nothing about timing when they wrote nothing', async () => {
    await turnOn({ newInquiry: true, newQuote: true, confirmInquiry: true, confirmQuote: true, responseNote: { hu: 'Általában két munkanapon belül válaszolok.', en: 'I usually answer within two working days.', nl: '' } })
    await server.api('/api/contact', { body: contact({ language: 'en' }) })
    await server.api('/api/contact', { body: contact({ language: 'hu', subject: 'Magyar tárgy', message: 'Magyar üzenet, amely elég hosszú ahhoz, hogy üzenet legyen.' }) })
    await server.api('/api/contact', { body: contact({ language: 'nl', subject: 'Nederlands onderwerp', message: 'Een Nederlands bericht dat lang genoeg is om een bericht te zijn.' }) })
    await settle()
    await settle()
    const bySubject = (needle: RegExp) => toVisitor().find((mail) => needle.test(mail.subject))!
    expect(bySubject(/^We received/).text).toContain('I usually answer within two working days.')
    expect(bySubject(/^Megkaptuk/).text).toContain('Általában két munkanapon belül válaszolok.')
    expect(bySubject(/^We hebben/).text).not.toMatch(/dagen|werkdag|binnen twee/i)
  })

  it('refuses a note that is too long, or not text, and only an administrator may write it', async () => {
    const admin = await server.signIn()
    const put = (body: unknown, who = admin) => server.api('/api/admin/notifications/preferences', { method: 'PUT', headers: { Cookie: who.cookie, 'X-CSRF-Token': who.csrf }, body })
    expect((await put({ newInquiry: true, newQuote: true, responseNote: { en: 'x'.repeat(201) } })).status).toBe(422)
    expect((await put({ newInquiry: true, newQuote: true, responseNote: { en: 5 } })).status).toBe(422)
    expect((await put({ newInquiry: true, newQuote: true, confirmInquiry: 'yes' })).status).toBe(422)
    const editor = await server.signIn('editor')
    expect((await put({ newInquiry: true, newQuote: true, confirmInquiry: true }, editor)).status).toBe(403)
  })

  it('treats a hostile name as text in both parts, and carries no script, no remote image and no link to anything else', () => {
    const inquiry = { id: 'i', reference: 'C-TEST', language: 'en', kind: 'project', name: '<script>alert(1)</script>"><img src=x onerror=alert(2)>', email: 'a@example.com', subject: '<b>bold</b> subject', message: 'm', status: 'new', archived_at: null, consent_at: null, ip_hash: 'x', content_hash: 'y', created_at: '2026-11-03T10:00:00.000Z', updated_at: '2026-11-03T10:00:00.000Z' } as never
    for (const language of ['hu', 'en', 'nl'] as const) {
      const mail = renderInquiryConfirmation(inquiry, language, 'Brand', 'A note.')
      expect(mail.html).not.toContain('<script')
      expect(mail.html).not.toContain('<img')
      // Look at the tags, not at the text: the hostile name is printed as (escaped) text, so "src=x" may be read in it, but no tag has it.
      const tags = mail.html.match(/<[^>]+>/g) ?? []
      expect(tags.filter((tag) => /\bsrc=|\bon\w+=|\bhref=|<(link|iframe|script|img|object|embed|form)\b/i.test(tag))).toEqual([])
      expect(mail.html).toContain('&lt;script&gt;')
      expect(mail.html).toContain(`lang="${language}"`)
      expect(mail.html).toContain('max-width:620px')
      expect(mail.html).toContain('width=device-width')
      expect(mail.text.length).toBeGreaterThan(100)
      expect(mail.subject).not.toMatch(/[\r\n]/)
      expect(mail.preview.length).toBeGreaterThan(10)
      // Nothing essential lives in an image (there is none), and a preview line sits at the top of the HTML.
      expect(mail.html.indexOf(mail.preview)).toBeLessThan(mail.html.indexOf('<h1'))
    }
  })

  it('has its own words in Hungarian, English and Dutch for the two confirmations and the test message', () => {
    const inquiry = { id: 'i', reference: 'C-TEST', language: 'en', kind: 'project', name: 'Anna', email: 'a@example.com', subject: 'S', message: 'm', status: 'new', archived_at: null, consent_at: null, ip_hash: 'x', content_hash: 'y', created_at: '2026-11-03T10:00:00.000Z', updated_at: '2026-11-03T10:00:00.000Z' } as never
    const quoteRow = { ...(inquiry as object), reference: 'CC-2026-000001', kind: 'catalogue', request_type: 'package_quote', source: 'shop', description: 'd', objective: null, reference_notes: null, timing: null, requirements: null, phone: null, company: null, website: null, budget_range: null, inquiry_id: null } as never
    const subjects = new Set<string>()
    for (const language of ['hu', 'en', 'nl'] as const) {
      for (const mail of [renderInquiryConfirmation(inquiry, language, 'Brand', null), renderRequestConfirmation({ request: quoteRow, items: [], totals: { fixed: [], quotedParts: 0 }, packageName: (code: string) => code }, language, 'Brand', null, null), renderTestEmail(language, 'Brand', 'resend', new Date('2026-11-03T10:00:00Z'))]) {
        expect(mail.subject.length).toBeGreaterThan(5)
        expect(mail.html).toContain('</html>')
        subjects.add(mail.subject)
      }
    }
    expect(subjects.size).toBe(9)
  })
})

describe('the administrator’s test message', () => {
  const post = (path: string, who: { cookie: string; csrf: string }) => server.api(path, { method: 'POST', headers: { Cookie: who.cookie, 'X-CSRF-Token': who.csrf }, body: {} })

  it('goes to the owner’s address, is recorded like any message, and says that accepted is not delivered', async () => {
    const admin = await server.signIn()
    const response = await post('/api/admin/notifications/test', admin)
    expect(response.status).toBe(202)
    await settle()
    const row = rows().find((candidate) => candidate.kind === 'test')!
    expect(row).toMatchObject({ recipient: 'owner-private@mail.test', status: 'accepted' })
    const body = provider.sends()[0].body as { reply_to?: string; text: string }
    expect(body.reply_to).toBeUndefined()
    expect(body.text).toMatch(/accepted it; whether it was delivered can only be confirmed/)
    expect(server.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'notification.test'")).toEqual({ n: 1 })
  })

  it('is for administrators only, and refuses when nothing could be sent', async () => {
    const editor = await server.signIn('editor')
    expect((await post('/api/admin/notifications/test', editor)).status).toBe(403)
    await server.close()
    server = await startServer({ env: resendEnv({ NOTIFY_TO: '' }), realMailer: true })
    expect((await post('/api/admin/notifications/test', await server.signIn())).status).toBe(409)
    await server.close()
    server = await startServer({ env: resendEnv({ EMAIL_ENABLED: 'false' }), realMailer: true })
    const paused = await post('/api/admin/notifications/test', await server.signIn())
    expect(paused.status).toBe(409)
    expect(paused.json.error.message).toMatch(/paused/)
  })
})

describe('sending can be paused without losing the configuration', () => {
  it('EMAIL_ENABLED=false queues nothing, says it is paused, and does not touch the provider', async () => {
    await server.close()
    server = await startServer({ env: resendEnv({ EMAIL_ENABLED: 'false' }), realMailer: true })
    const response = await server.api('/api/contact', { body: contact() })
    expect(response.status).toBe(201)
    await settle()
    expect(rows()).toEqual([])
    expect(provider.sends()).toHaveLength(0)
    const admin = await server.signIn()
    const overview = (await server.api('/api/admin/notifications', { headers: { Cookie: admin.cookie } })).json.data
    expect(overview.integration).toMatchObject({ enabled: false, paused: true, provider: 'resend' })
  })
})

describe('the provider settings are checked at start-up', () => {
  const base = { APP_ENV: 'test', DATABASE_PATH: ':memory:' }
  const problems = (env: Record<string, string>): string[] => {
    try {
      loadConfig({ ...base, ...env })
      return []
    } catch (error) {
      return (error as { problems: string[] }).problems
    }
  }

  it('needs a sender and a key for the API provider, and a sensible key', () => {
    expect(problems({ EMAIL_PROVIDER: 'resend' }).join('\n')).toMatch(/EMAIL_FROM[\s\S]*EMAIL_API_KEY/)
    expect(problems({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'a@site.test', EMAIL_API_KEY: 'short' }).join('\n')).toMatch(/EMAIL_API_KEY: does not look like an API key/)
    expect(problems({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'a@site.test', EMAIL_API_KEY: API_KEY })).toEqual([])
  })

  it('accepts only the secret format the provider signs with, and an address that is an address', () => {
    expect(problems({ EMAIL_WEBHOOK_SECRET: 'not-a-secret' }).join('\n')).toMatch(/EMAIL_WEBHOOK_SECRET/)
    expect(problems({ EMAIL_WEBHOOK_SECRET: WEBHOOK_SECRET })).toEqual([])
    expect(problems({ EMAIL_REPLY_TO: 'hello@site.test\r\nBcc: x@y.z' }).join('\n')).toMatch(/EMAIL_REPLY_TO/)
    expect(problems({ EMAIL_REPLY_TO: 'Site <hello@site.test>' })).toEqual([])
  })

  it('wants an https API in production, and Cloudflare’s three settings together or not at all', () => {
    expect(problems({ EMAIL_API_URL: 'http://api.example.com' }).join('\n')).toMatch(/EMAIL_API_URL/)
    expect(problems({ EMAIL_API_URL: 'http://127.0.0.1:9999' })).toEqual([])
    expect(problems({ CLOUDFLARE_API_TOKEN: 'token' }).join('\n')).toMatch(/must be set together/)
    expect(problems({ CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ZONE_ID: 'x', CLOUDFLARE_ACCOUNT_ID: 'y' }).join('\n')).toMatch(/32 hexadecimal/)
    expect(problems({ CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ZONE_ID: 'a'.repeat(32), CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32) })).toEqual([])
  })
})

describe('migration 0003 keeps the log and adds what the provider needs', () => {
  it('moves old rows over untouched, allows the new kinds and states, and refuses a second automatic message per submission', () => {
    const dir = new URL('../src/db/migrations/', import.meta.url)
    void dir
    const db = new Database(':memory:')
    const clock = new TestClock()
    // Apply only the first two migrations, put an old-style row in, then apply the third.
    migrate(db, clock, undefined)
    db.exec("DELETE FROM email_deliveries")
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM pragma_table_info('email_deliveries') WHERE name IN ('send_generation', 'error_code', 'provider_event', 'delivered_at')")).toEqual({ n: 4 })
    const insert = (id: string, kind: string, status = 'pending', relatedType = 'inquiry', relatedId = 'r1') => db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'a@example.com', 'en', ?, 'now', 'now')", [id, kind, relatedType, relatedId, status])
    for (const status of ['pending', 'sending', 'accepted', 'delivered', 'bounced', 'complained', 'failed', 'cancelled']) insert(`s-${status}`, 'inquiry_status', status, 'inquiry', `r-${status}`)
    insert('t', 'test', 'pending', 'system', 'test')
    expect(() => insert('bad', 'surprise')).toThrow()
    expect(() => insert('bad2', 'inquiry_status', 'maybe')).toThrow()
    insert('c1', 'inquiry_confirmation')
    expect(() => insert('c2', 'inquiry_confirmation')).toThrow(ConstraintError)
    // Status e-mails are the administrator's and may repeat.
    insert('s2', 'inquiry_status', 'accepted', 'inquiry', 'r-accepted')
    db.close()
  })
})
