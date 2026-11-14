import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MailError } from '../src/modules/notifications/smtp.ts'
import { eraseByEmail } from '../src/modules/system/maintenance.ts'
import { contact, startServer, type TestServer } from './helpers.ts'
import { draftBody, linkIn, makeKit } from './quotationKit.ts'
import { eventFor, signedEvent, WEBHOOK_SECRET } from './resendMock.ts'

/**
 * PROMPT 21: what the quotation system needed to be complete as a customer workflow. The customer's receipt for a change request; the owner's alert
 * when a message to a customer does not get through; the administration's language filter, its "end the customer's links" action and the turning
 * of a contact message into a request; and the isolation and logging guarantees that the earlier tests did not state in words.
 */

let server: TestServer
let kit: ReturnType<typeof makeKit>
let admin: Awaited<ReturnType<TestServer['signIn']>>

async function start(env: Record<string, string> = {}) {
  server = await startServer({ env: { PUBLIC_URL: 'https://site.test', ...env } })
  admin = await server.signIn('admin', 'admin@site.test')
  kit = makeKit(server, admin)
}
beforeEach(async () => {
  await start()
})
afterEach(async () => {
  await server.close()
})

const events = (requestId: string) => server.db.all<{ event_type: string; actor_type: string; summary: string | null }>('SELECT event_type, actor_type, summary FROM quote_events WHERE quote_request_id = ? ORDER BY id', [requestId])
const alerts = () => server.db.all<{ related_id: string; status: string; language: string }>("SELECT related_id, status, language FROM email_deliveries WHERE kind = 'delivery_failed_admin'")
const settleAll = async () => {
  for (let i = 0; i < 3; i += 1) await kit.settle()
}
const refuse = () => new MailError('The server refused the message.', { transient: false, reason: 'rejected' })

// ------------------------------------------------------------------------------------------------------------------------------
describe('the customer is told that their request for a change arrived', () => {
  it.each([
    ['hu', 'Megkaptuk a módosítási kérésedet', 'nem jelent sem elfogadást, sem elutasítást'],
    ['en', 'We received your request for a change', 'neither an acceptance nor a decline'],
    ['nl', 'We hebben je verzoek om een wijziging ontvangen', 'geen acceptatie of afwijzing'],
  ])('in the language of the offer (%s), with what they wrote, escaped, and nothing promised', async (language, subject, sentence) => {
    const made = await kit.sent({ language })
    const page = (await kit.open(made.token)).json.data
    const asked = await kit.act({ token: page.actions.revise, message: 'Could the timeline be shorter? <script>alert(1)</script>' })
    expect(asked.json.data.outcome).toBe('revision_requested')
    await settleAll()

    const receipt = kit.toCustomer().find((mail) => mail.subject.startsWith(subject))!
    expect(receipt, 'the receipt').toBeDefined()
    expect(receipt.subject).toContain(made.reference)
    expect(receipt.subject).not.toMatch(/[\r\n]/)
    expect(receipt.text).toContain(sentence)
    expect(receipt.text).toContain('Could the timeline be shorter?')
    // What a person typed is text, never markup, and the mail says nothing was accepted or paid and names no deadline.
    expect(receipt.html).toContain('&lt;script&gt;')
    expect(receipt.html).not.toContain('<script>alert')
    expect(receipt.text).not.toMatch(/within \d+|binnen \d+|\d+ órán belül|paid|betaald|fizetve/i)
    // The reply goes to the public address, never to the owner's private inbox, and the link in it opens the same offer.
    expect(receipt.replyTo).not.toBe('owner@site.test')
    expect(kit.owner().find((mail) => mail.subject.startsWith('The customer asked for clarification'))).toBeDefined() // the owner's notice is unchanged
    const link = linkIn(receipt.text, 'quote')
    expect(link).toHaveLength(43)
    expect((await kit.open(link)).json.data.quote.reference).toBe(page.quote.reference)
    expect(server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE kind = 'revision_received'")).toEqual({ n: 1 })
  })

  it('sends one receipt per request, none for a replayed click, and says nothing about a delivery it did not verify', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    expect((await kit.act({ token: page.actions.revise, message: 'First question about the scope.' })).status).toBe(200)
    expect((await kit.act({ token: page.actions.revise, message: 'First question about the scope.' })).status).toBe(409) // the same button twice
    await settleAll()
    expect(kit.toCustomer().filter((mail) => mail.subject.startsWith('We received your request for a change'))).toHaveLength(1)
    expect(server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE kind IN ('revision_received', 'revision_requested_admin')")).toEqual({ n: 2 })
    // A second, different question is a second request and gets its own receipt.
    const again = (await kit.open(made.token)).json.data
    expect((await kit.act({ token: again.actions.revise, message: 'And a second question about the timeline.' })).status).toBe(200)
    await settleAll()
    expect(kit.toCustomer().filter((mail) => mail.subject.startsWith('We received your request for a change'))).toHaveLength(2)
    expect(server.db.all("SELECT status FROM email_deliveries WHERE kind = 'revision_received'").every((row) => (row as { status: string }).status === 'accepted')).toBe(true) // sent, not "delivered"
    // The request is in the state the customer's action put it in, and the offer did not change.
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'sent' })
  })
})

// ------------------------------------------------------------------------------------------------------------------------------
describe('the owner is told when a message to a customer does not get through', () => {
  it('writes it in the history, alerts the owner once in their language, and never alerts again for the same message', async () => {
    const made = await kit.ready()
    await settleAll() // the request's own two messages go first
    server.mailer.failNext(refuse(), 1)
    expect((await kit.send('POST', `/api/admin/quotes/${made.quoteId}/send`, { note: '' })).status).toBe(200)
    await settleAll()

    const failed = server.db.get<{ id: string; status: string }>("SELECT id, status FROM email_deliveries WHERE kind = 'quote_sent'")!
    expect(failed.status).toBe('failed')
    expect(kit.toCustomer().filter((mail) => mail.subject.startsWith('Your quote'))).toHaveLength(0)
    const alert = kit.owner().find((mail) => mail.subject.startsWith('Delivery problem with an email to a customer'))!
    expect(alert, 'the alert').toBeDefined()
    expect(alert.subject).toContain(made.reference)
    expect(alert.text).toContain('The quote') // which message
    expect(alert.text).toContain('anna@example.com') // to whom
    expect(alert.text).toContain('Failed')
    expect(alert.text).toContain(`https://site.test/admin/quotes/${made.id}`) // where to look
    expect(alert.replyTo).toBeNull() // an alert is not something to answer to the customer
    expect(alerts()).toEqual([{ related_id: failed.id, status: 'accepted', language: 'en' }])
    expect(events(made.id).filter((event) => event.event_type === 'email_failed')).toEqual([{ event_type: 'email_failed', actor_type: 'system', summary: 'quote_sent: failed' }])
    // The offer itself is not lost: it is still out, and the administrator sends it again.
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'sent' })

    // The same message tried again and refused again: the history says so a second time, the owner is not alerted a second time.
    server.mailer.failNext(refuse(), 1)
    expect((await kit.send('POST', `/api/admin/notifications/deliveries/${failed.id}/retry`)).status).toBeLessThan(300)
    await settleAll()
    expect(alerts()).toHaveLength(1)
    expect(events(made.id).filter((event) => event.event_type === 'email_failed').map((event) => event.summary)).toEqual(['quote_sent: failed', 'quote_sent: failed'])
    // And when it finally goes out the customer has it, and nobody is alerted about a message that arrived.
    expect((await kit.send('POST', `/api/admin/notifications/deliveries/${failed.id}/retry`)).status).toBeLessThan(300)
    await settleAll()
    expect(kit.toCustomer().filter((mail) => mail.subject.startsWith('Your quote'))).toHaveLength(1)
    expect(alerts()).toHaveLength(1)
    // Sending the quotation again on purpose is a new message: if that one is refused, it is its own alert.
    server.mailer.failNext(refuse(), 1)
    expect((await kit.send('POST', `/api/admin/quotes/${made.quoteId}/resend`)).status).toBe(202)
    await settleAll()
    expect(alerts()).toHaveLength(2)
  })

  it('is raised by a verified bounce or complaint, and by nothing else', async () => {
    await server.close()
    await start({ EMAIL_WEBHOOK_SECRET: WEBHOOK_SECRET })
    const made = await kit.sent()
    const row = server.db.get<{ id: string; provider_message_id: string }>("SELECT id, provider_message_id FROM email_deliveries WHERE kind = 'quote_sent'")!
    const post = (type: string, id?: string) => {
      const request = signedEvent(eventFor(type, row.provider_message_id, {}, row.id), { at: server.clock.now(), id })
      return server.api('/api/webhooks/email', { method: 'POST', headers: request.headers, raw: request.raw })
    }
    // Good news and an unsigned claim change nothing and alert nobody.
    expect((await post('email.delivered')).status).toBe(200)
    await settleAll()
    expect(alerts()).toHaveLength(0)
    const forged = signedEvent(eventFor('email.bounced', row.provider_message_id, {}, row.id), { at: server.clock.now(), tamper: true })
    expect((await server.api('/api/webhooks/email', { method: 'POST', headers: forged.headers, raw: forged.raw })).status).toBeGreaterThanOrEqual(400)
    await settleAll()
    expect(alerts()).toHaveLength(0)
    expect(server.db.get('SELECT status FROM email_deliveries WHERE id = ?', [row.id])).toEqual({ status: 'delivered' })

    // A recipient marking the message as spam after it was delivered is news the owner should have.
    expect((await post('email.complained')).status).toBe(200)
    await settleAll()
    expect(server.db.get('SELECT status FROM email_deliveries WHERE id = ?', [row.id])).toEqual({ status: 'complained' })
    expect(alerts()).toEqual([{ related_id: row.id, status: 'accepted', language: 'en' }])
    expect(kit.owner().find((mail) => mail.subject.startsWith('Delivery problem with an email to a customer'))!.text).toContain('Marked as spam')
    expect(events(made.id).filter((event) => event.event_type === 'email_failed')).toEqual([{ event_type: 'email_failed', actor_type: 'system', summary: 'quote_sent: complained' }])
    // The same event delivered again (the provider retries) changes and sends nothing more.
    expect((await post('email.complained', 'evt_again')).status).toBe(200)
    await settleAll()
    expect(alerts()).toHaveLength(1)
  })

  it('does not alert about the owner\'s own messages, and a failing alert does not raise another', async () => {
    // The owner's notification fails: it is in the history, and there is nobody else to tell.
    server.mailer.failNext(refuse(), 1)
    const first = await kit.request()
    await settleAll()
    expect(server.db.get("SELECT status FROM email_deliveries WHERE kind = 'quote_received'")).toEqual({ status: 'failed' })
    expect(events(first.id).filter((event) => event.event_type === 'email_failed')).toEqual([{ event_type: 'email_failed', actor_type: 'system', summary: 'quote_received: failed' }])
    expect(alerts()).toHaveLength(0)

    // A customer's message fails, and so does the alert about it: one alert row, two history lines, no loop.
    const made = await kit.ready({}, { email: 'carla@example.com' })
    await settleAll()
    server.mailer.failNext(refuse(), 2)
    await kit.send('POST', `/api/admin/quotes/${made.quoteId}/send`, {})
    await settleAll()
    await settleAll()
    expect(alerts()).toEqual([{ related_id: expect.any(String), status: 'failed', language: 'en' }])
    expect(events(made.id).filter((event) => event.event_type === 'email_failed').map((event) => event.summary)).toEqual(['quote_sent: failed', 'delivery_failed_admin: failed'])
  })

  it('takes its alerts away with the request, on deletion and on erasure', async () => {
    const made = await kit.ready()
    await settleAll()
    server.mailer.failNext(refuse(), 1)
    await kit.send('POST', `/api/admin/quotes/${made.quoteId}/send`, {})
    await settleAll()
    expect(alerts()).toHaveLength(1)
    expect((await kit.send('DELETE', `/api/admin/quote-requests/${made.id}`)).status).toBe(204)
    expect(server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE related_type IN ('email_delivery', 'quote', 'quote_request', 'quote_revision')")).toEqual({ n: 0 })

    const second = await kit.ready({}, { email: 'dora@example.com' })
    await settleAll()
    server.mailer.failNext(refuse(), 1)
    await kit.send('POST', `/api/admin/quotes/${second.quoteId}/send`, {})
    await settleAll()
    expect(alerts()).toHaveLength(1)
    eraseByEmail(server.app.context, 'dora@example.com')
    expect(server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE related_type = 'email_delivery'")).toEqual({ n: 0 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 0 })
  })
})

// ------------------------------------------------------------------------------------------------------------------------------
describe('the list can be filtered by the language the customer wrote in', () => {
  it('on the server, in the CSV, together with the other filters, and ignores a language that does not exist', async () => {
    const hu = await kit.request({ language: 'hu', email: 'hu@example.com' })
    const nl = await kit.request({ language: 'nl', email: 'nl@example.com' })
    const en = await kit.request({ language: 'en', email: 'en@example.com' })
    const ids = async (query: string) => ((await kit.get(`/api/admin/quote-requests${query}`)).json.data as Array<{ id: string; language: string }>).map((row) => row.id).sort()
    expect(await ids('?language=nl')).toEqual([nl.id])
    expect(await ids('?language=hu')).toEqual([hu.id])
    expect(await ids('?language=en')).toEqual([en.id])
    expect(await ids('')).toEqual([hu.id, nl.id, en.id].sort())
    expect(await ids('?language=xx')).toEqual([hu.id, nl.id, en.id].sort()) // a stale bookmark still opens the list
    expect(await ids("?language=nl' OR 1=1 --")).toEqual([hu.id, nl.id, en.id].sort()) // and the value never reaches SQL as text
    expect(await ids('?language=nl&status=under_review')).toEqual([])
    expect(await ids('?language=nl&status=new')).toEqual([nl.id])
    const csv = (await kit.get('/api/admin/quote-requests/export.csv?language=hu')).text
    expect(csv).toContain('hu@example.com')
    expect(csv).not.toContain('nl@example.com')
    expect(csv).not.toContain('en@example.com')
  })
})

// ------------------------------------------------------------------------------------------------------------------------------
describe('an administrator can end the customer\'s links', () => {
  it('ends the status page, the quotation page and the buttons it handed out, changes nothing else, and does nothing the second time', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    expect((await server.api(`/api/customer/requests/${made.statusToken}`)).status).toBe(200)

    const revoked = await kit.send('POST', `/api/admin/quote-requests/${made.id}/revoke-links`)
    expect(revoked.status, revoked.text).toBe(200)
    expect(revoked.json.data.revoked).toBeGreaterThanOrEqual(4) // the status page, the quotation page and its three buttons (at least)
    for (const secret of [made.statusToken, made.token]) {
      const answer = await server.api(secret === made.token ? `/api/customer/quotations/${secret}` : `/api/customer/requests/${secret}`)
      expect(answer.status).toBe(410)
      expect(answer.json.error.details.reason).toBe('replaced')
    }
    expect((await kit.act({ token: page.actions.accept, confirm: true })).status).toBe(410) // the button handed out before is dead too
    // Nothing was withdrawn, answered or changed: the offer is out, the request is as it was, and the customer was not written to.
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [made.quoteId])).toEqual({ status: 'sent' })
    expect(server.db.get('SELECT status, customer_status FROM quote_requests WHERE id = ?', [made.id])).toEqual({ status: 'quote_sent', customer_status: 'quote_sent' })
    const before = kit.toCustomer().length
    await settleAll()
    expect(kit.toCustomer()).toHaveLength(before)
    // The history says who did it and how many links ended, in fixed words; the audit log has it too.
    const line = events(made.id).find((event) => event.event_type === 'link_revoked')!
    expect(line).toMatchObject({ actor_type: 'admin', summary: expect.stringMatching(/^\d+ link\(s\) ended by an administrator$/) })
    expect(server.db.get("SELECT actor_id IS NOT NULL AS has_actor FROM audit_log WHERE action = 'quote.revoke_links'")).toEqual({ has_actor: 1 })

    // Twice is harmless: nothing more to end, nothing more written.
    const again = await kit.send('POST', `/api/admin/quote-requests/${made.id}/revoke-links`)
    expect(again.json.data.revoked).toBe(0)
    expect(events(made.id).filter((event) => event.event_type === 'link_revoked')).toHaveLength(1)

    // Giving the customer access again is the existing "send again": a new message with a new link that works.
    expect((await kit.send('POST', `/api/admin/quotes/${made.quoteId}/resend`)).status).toBe(202)
    await settleAll()
    const fresh = linkIn(kit.toCustomer().filter((mail) => linkIn(mail.text, 'quote')).at(-1)!.text, 'quote')
    expect(fresh).not.toBe(made.token)
    expect((await kit.open(fresh)).status).toBe(200)
    expect((await kit.open(made.token)).status).toBe(410)
  })

  it('needs a signed-in administrator and the CSRF token, and tells a request that does not exist from one that does', async () => {
    const made = await kit.request()
    const path = `/api/admin/quote-requests/${made.id}/revoke-links`
    expect((await server.api(path, { method: 'POST', body: {} })).status).toBe(401)
    expect((await server.api(path, { method: 'POST', headers: { Cookie: admin.cookie }, body: {} })).status).toBe(403)
    expect((await kit.send('POST', '/api/admin/quote-requests/does-not-exist/revoke-links')).status).toBe(404)
    // An editor may (they may write requests); the link of the status page stays valid until someone with the right does it.
    const editor = await server.signIn('editor', 'editor@site.test')
    expect((await kit.send('POST', path, {}, editor)).status).toBe(200)
  })
})

// ------------------------------------------------------------------------------------------------------------------------------
describe('a contact message becomes a quote request once', () => {
  const messageId = async (overrides: Record<string, unknown> = {}) => {
    const response = await server.api('/api/contact', { body: contact(overrides) })
    expect(response.status, response.text).toBe(201)
    return server.db.get<{ id: string }>('SELECT id FROM inquiries WHERE reference = ?', [response.json.data.reference])!.id
  }

  it('is prefilled from the message, linked to it, recorded as the administrator\'s doing, and sends the customer nothing', async () => {
    const inquiryId = await messageId()
    const made = await kit.send('POST', `/api/admin/inquiries/${inquiryId}/quote-request`, {})
    expect(made.status, made.text).toBe(201)
    const row = server.db.get<Record<string, any>>('SELECT * FROM quote_requests WHERE id = ?', [made.json.data.id])!
    expect(row).toMatchObject({ name: 'Anna Kovács', email: 'anna@example.com', language: 'en', source: 'contact_form', request_type: 'general_business', inquiry_id: inquiryId, status: 'new' })
    expect(row.description).toContain('A new website')
    expect(row.description).toContain('bakery in Utrecht')
    expect(row.consent_at).not.toBeNull() // the message's own agreement carries over
    expect(row.marketing_consent_at).toBeNull()
    expect(events(row.id)).toEqual([{ event_type: 'request_created', actor_type: 'admin', summary: 'contact_form/general_business' }])
    await settleAll()
    expect(server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE kind IN ('quote_confirmation', 'quote_received')")).toEqual({ n: 0 })
    const inquiry = (await kit.get(`/api/admin/inquiries/${inquiryId}`)).json.data
    expect(inquiry.quotes).toEqual([expect.objectContaining({ id: row.id })])
  })

  it('refuses a second conversion and says which request exists, unless that request was cancelled; what the administrator types wins', async () => {
    const inquiryId = await messageId()
    const first = await kit.send('POST', `/api/admin/inquiries/${inquiryId}/quote-request`, { requestType: 'custom_website', priority: 'high', name: 'Anna K.' })
    expect(first.status).toBe(201)
    expect(server.db.get('SELECT name, request_type, priority FROM quote_requests WHERE id = ?', [first.json.data.id])).toEqual({ name: 'Anna K.', request_type: 'custom_website', priority: 'high' })
    const second = await kit.send('POST', `/api/admin/inquiries/${inquiryId}/quote-request`, {})
    expect(second.status).toBe(409)
    expect(second.json.error.details).toMatchObject({ reason: 'already_converted', reference: first.json.data.reference, id: first.json.data.id })
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 1 })
    expect((await kit.send('PATCH', `/api/admin/quote-requests/${first.json.data.id}`, { status: 'cancelled' })).status).toBe(200)
    expect((await kit.send('POST', `/api/admin/inquiries/${inquiryId}/quote-request`, {})).status).toBe(201)
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 2 })
  })

  it('needs a session and the CSRF token, and a message that exists', async () => {
    const inquiryId = await messageId()
    expect((await server.api(`/api/admin/inquiries/${inquiryId}/quote-request`, { method: 'POST', body: {} })).status).toBe(401)
    expect((await server.api(`/api/admin/inquiries/${inquiryId}/quote-request`, { method: 'POST', headers: { Cookie: admin.cookie }, body: {} })).status).toBe(403)
    expect((await kit.send('POST', '/api/admin/inquiries/nope/quote-request', {})).status).toBe(404)
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 0 })
  })
})

// ------------------------------------------------------------------------------------------------------------------------------
describe('one customer\'s secret opens one customer\'s page', () => {
  it('opens nothing of anyone else\'s, nothing with the wrong kind of secret, and answers every wrong guess in the same words', async () => {
    const anna = await kit.sent()
    // The kit reads Anna's mailbox; Béla's own mail is read here, from the recorded messages addressed to him.
    const belaMade = await kit.ready({}, { email: 'bela@example.com', name: 'Béla Tóth' })
    expect((await kit.send('POST', `/api/admin/quotes/${belaMade.quoteId}/send`, {})).status).toBe(200)
    await settleAll()
    const belaMail = server.mailer.sent.filter((mail) => mail.to === 'bela@example.com' && linkIn(mail.text, 'quote')).at(-1)!
    const bela = { ...belaMade, token: linkIn(belaMail.text, 'quote') }
    expect(bela.token).not.toBe(anna.token)
    const annaPage = (await kit.open(anna.token)).json.data
    // Each page is about its own request and carries nothing of the other.
    const annaText = JSON.stringify(annaPage)
    expect(annaText).toContain(anna.reference)
    expect(annaText).not.toContain(bela.reference)
    expect(annaText).not.toContain('Béla')
    expect(annaText).not.toContain('bela@example.com')
    const statusOfBela = (await server.api(`/api/customer/requests/${bela.statusToken}`)).json.data
    expect(JSON.stringify(statusOfBela)).not.toContain(anna.reference)
    expect(JSON.stringify(statusOfBela)).not.toContain('Kovács')

    // The wrong kind of secret opens nothing: a status link on the quotation page and the other way round, a button where a link belongs.
    const wrong = [
      await server.api(`/api/customer/quotations/${anna.statusToken}`),
      await server.api(`/api/customer/requests/${anna.token}`),
      await server.api(`/api/customer/quotations/${annaPage.actions.accept}`),
      await server.api(`/api/customer/requests/${annaPage.actions.decline}`),
      await server.api(`/api/customer/quotations/${anna.reference}`),
      await server.api(`/api/customer/requests/${anna.id}`),
      await server.api('/api/customer/quotations/anna@example.com'),
      await server.api(`/api/customer/quotations/${'a'.repeat(43)}`),
    ]
    for (const answer of wrong) expect(answer.status).toBe(404)
    expect(new Set(wrong.map((answer) => `${answer.json.error.code}|${answer.json.error.message}`)).size).toBe(1) // not told apart by what they say
    // A view link cannot act, and an action button works only for the offer it was made for.
    expect((await kit.act({ token: anna.token, confirm: true })).status).toBe(404)
    const belaPage = (await kit.open(bela.token)).json.data
    expect((await kit.act({ token: belaPage.actions.accept, confirm: true })).status).toBe(200)
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [anna.quoteId])).toEqual({ status: 'sent' })
    expect(server.db.get('SELECT status FROM quotes WHERE id = ?', [bela.quoteId])).toEqual({ status: 'accepted' })
  })

  it('is written nowhere it could be read back: not in the database, not in the logs, not in the history', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    expect((await kit.act({ token: page.actions.revise, message: 'A question about the timeline.' })).status).toBe(200)
    const again = (await kit.open(made.token)).json.data
    expect((await kit.act({ token: again.actions.accept, confirm: true })).status).toBe(200)
    await settleAll()
    const secrets = [made.token, made.statusToken, page.actions.accept, page.actions.revise, again.actions.accept, again.actions.decline]
    const everything = JSON.stringify([
      server.db.all('SELECT * FROM customer_action_tokens'),
      server.db.all('SELECT * FROM quote_events'),
      server.db.all('SELECT * FROM audit_log'),
      server.db.all('SELECT id, kind, last_error, error_code, note FROM email_deliveries'),
      server.logs,
    ])
    for (const secret of secrets) expect(everything, 'a secret was stored or logged').not.toContain(secret)
    // What the log does say about the visits is the route and the answer, not the address.
    const visits = server.logs.filter((line) => line.includes('/api/customer') || line.includes('"customer action"'))
    expect(visits.length).toBeGreaterThan(0)
    expect(server.logs.join('\n')).not.toContain('anna@example.com')
    // The customer's pages are never cached.
    expect((await kit.open(made.token)).headers.get('cache-control')).toBe('no-store')
    expect((await server.api(`/api/customer/requests/${made.statusToken}`)).headers.get('cache-control')).toBe('no-store')
  })

  it('does not take an amount, a total, a status or an owner from the customer\'s action', async () => {
    const made = await kit.sent()
    const page = (await kit.open(made.token)).json.data
    const answer = await kit.act({ token: page.actions.accept, confirm: true, totalMinor: 1, status: 'completed', quoteId: 'other', requestId: 'other', price: 1, acceptedAt: '2020-01-01T00:00:00Z' })
    expect(answer.status).toBe(200)
    const row = server.db.get<{ status: string; accepted_at: string; total_minor: number }>('SELECT status, accepted_at, total_minor FROM quotes WHERE id = ?', [made.quoteId])!
    expect(row.status).toBe('accepted')
    expect(row.accepted_at.startsWith('2020')).toBe(false)
    expect(row.total_minor).toBeGreaterThan(1)
    expect(server.db.get('SELECT status FROM quote_requests WHERE id = ?', [made.id])).toEqual({ status: 'accepted' })
  })
})

// A quotation's body is checked here once, so a change to its fixture is noticed in this file too.
describe('the fixture the integration tests rely on', () => {
  it('is a finished offer in a language of the tester\'s choice', () => {
    expect(draftBody({ language: 'nl' }).language).toBe('nl')
  })
})
