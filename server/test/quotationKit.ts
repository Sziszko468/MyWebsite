import { expect } from 'vitest'
import { quote, type TestServer } from './helpers.ts'

/**
 * What the quotation tests share: a way to drive the administration's API, to make a request through the public form, to write and send a
 * quotation, and to find the link in the e-mail the customer got. Built for one running test server and one signed-in administrator.
 */

export interface Admin {
  cookie: string
  csrf: string
  email: string
}

export const linkIn = (text: string, page: 'quote' | 'request'): string => new RegExp(`https://site\\.test/(?:hu|en|nl)/${page}/([A-Za-z0-9_-]{43})`).exec(text)?.[1] ?? ''

export const draftBody = (over: Record<string, unknown> = {}) => ({
  language: 'en',
  title: 'A website for the bakery',
  introduction: 'Thank you for asking.',
  understanding: 'A small site with opening hours and a form.',
  scope: 'Five pages, a contact form, deployment.',
  deliverables: 'The finished website.',
  exclusions: 'Copywriting and photography.',
  paymentTerms: 'To be agreed in the contract.',
  terms: 'These are the terms of this offer.',
  notes: '',
  estimatedTimeline: 'About six weeks.',
  validUntil: '2026-12-31',
  pricingMode: 'itemized',
  currency: 'EUR',
  taxMode: 'excluded',
  taxRatePercent: '',
  taxVerified: false,
  taxNote: 'VAT is added where it applies.',
  lines: [
    { kind: 'item', description: 'Design', quantity: 1, unitPrice: '1500.50' },
    { kind: 'item', description: 'Build', quantity: 2, unitPrice: '800' },
    { kind: 'optional', description: 'Hosting set-up', quantity: 1, unitPrice: '200' },
    { kind: 'discount', description: 'Early booking', quantity: 1, unitPrice: '100', justification: 'Agreed on the phone.' },
  ],
  ...over,
})

export function makeKit(server: TestServer, admin: Admin) {
  const as = (who: Admin = admin) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })
  const get = (path: string, who: Admin = admin) => server.api(path, { headers: { Cookie: who.cookie } })
  const send = (method: string, path: string, body: unknown = {}, who: Admin = admin) => server.api(path, { method, headers: as(who), body })
  const settle = async () => {
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
  }
  const owner = () => server.mailer.sent.filter((mail) => mail.to === 'owner@site.test')
  const toCustomer = () => server.mailer.sent.filter((mail) => mail.to === 'anna@example.com')

  /** A request through the public form; returns its id and the secrets the visitor got. */
  async function request(overrides: Record<string, unknown> = {}) {
    const response = await server.api('/api/quote-requests', { body: quote(overrides) })
    expect([200, 201]).toContain(response.status)
    const id = server.db.get<{ id: string }>('SELECT id FROM quote_requests WHERE reference = ?', [response.json.data.reference])!.id
    return { id, reference: response.json.data.reference as string, statusToken: response.json.data.statusToken as string, response }
  }

  /** A request with a finished draft, ready to send. */
  async function ready(over: Record<string, unknown> = {}, requestOverrides: Record<string, unknown> = {}) {
    const made = await request(requestOverrides)
    const draft = await send('POST', `/api/admin/quote-requests/${made.id}/quotes`)
    expect(draft.status, draft.text).toBe(201)
    const quoteId = draft.json.data.quotation.id as string
    const saved = await send('PUT', `/api/admin/quotes/${quoteId}`, draftBody(over))
    expect(saved.status, saved.text).toBe(200)
    return { ...made, quoteId }
  }

  /** Sends it, delivers the e-mail, and returns the customer's link. */
  async function sent(over: Record<string, unknown> = {}, requestOverrides: Record<string, unknown> = {}) {
    const made = await ready(over, requestOverrides)
    const response = await send('POST', `/api/admin/quotes/${made.quoteId}/send`, { note: 'Looking forward to it.' })
    expect(response.status, response.text).toBe(200)
    await settle()
    const mail = toCustomer().filter((message) => linkIn(message.text, 'quote')).at(-1)!
    expect(mail, 'the quotation e-mail').toBeDefined()
    return { ...made, token: linkIn(mail.text, 'quote'), mail }
  }

  const open = (token: string) => server.api(`/api/customer/quotations/${token}`)
  const act = (body: Record<string, unknown>) => server.api('/api/customer/actions', { body })

  return { as, get, send, settle, owner, toCustomer, request, ready, sent, open, act }
}
