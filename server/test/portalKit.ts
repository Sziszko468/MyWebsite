import { expect } from 'vitest'
import { startServer, type TestServer } from './helpers.ts'
import { linkIn, makeKit as quoteKit } from './quotationKit.ts'

/**
 * What the client portal's tests share: a server with an administrator and an editor signed in, a way to invite a customer through the REAL endpoint, to
 * read the sign-in link out of the e-mail the customer got (the only place a secret ever appears), to open it and to act as that customer with the cookie and
 * the CSRF token the server handed out. Nothing here reaches into the database to make a customer or a session: an account exists because the owner invited
 * it and a session because a link was opened, exactly as in production.
 */

export const LINK = /https:\/\/site\.test\/(hu|en|nl)\/client-portal\/verify#([A-Za-z0-9_-]{43})/

type Api = TestServer['api']
type Reply = Awaited<ReturnType<Api>>

export interface Customer {
  id: string
  email: string
  cookie: string
  csrf: string
  headers: Record<string, string>
  get(path: string): Promise<Reply>
  post(path: string, body?: unknown): Promise<Reply>
  patch(path: string, body: unknown): Promise<Reply>
  del(path: string): Promise<Reply>
}

export interface PortalKit {
  server: TestServer
  api: Api
  admin: Record<string, string>
  editor: Record<string, string>
  adminSession: { cookie: string; csrf: string; email: string }
  settle(): Promise<void>
  mailsTo(address: string): { subject: string; text: string; html: string; to: string }[]
  /** The newest sign-in link in the mail sent to an address. */
  linkTo(address: string): { url: string; token: string; lang: string }
  /** Invites through the administration's endpoint; returns the new account's id. */
  invite(email: string, extra?: Record<string, unknown>): Promise<string>
  /** Opens a link's secret. */
  open(token: string, headers?: Record<string, string>): Promise<Reply>
  /** Invites (if the account does not exist yet), opens the activation link and returns the signed-in customer. */
  customer(email: string, extra?: Record<string, unknown>): Promise<Customer>
  /** A new sign-in for an account that exists: asks for a link, opens it. */
  signInAgain(email: string, language?: string): Promise<Customer>
  as(cookie: string, csrf: string, id?: string, email?: string): Customer
  /** The owner's own calls. */
  put(path: string, body: unknown): Promise<any>
  post(path: string, body: unknown): Promise<any>
  /** A quote request with a sent, accepted quotation, made through the public form and the customer's own link. */
  accepted(email: string, overrides?: { request?: Record<string, unknown>; quote?: Record<string, unknown> }): Promise<{ id: string; reference: string; quoteId: string }>
  /** A request that was made but not answered. */
  request(email: string, overrides?: Record<string, unknown>): Promise<{ id: string; reference: string }>
  /** Links a record to an account through the administration's endpoint (the owner's explicit act). Returns the link's id. */
  link(customerId: string, type: 'quote_request' | 'booking', recordId: string): Promise<string>
  /** A project for a customer, made through the administration's endpoint. Returns its id and reference. */
  project(customerId: string, body?: Record<string, unknown>): Promise<{ id: string; reference: string }>
  close(): Promise<void>
}

/** A portal kit for a server a booking kit already started (its administrator and editor are the ones that kit signed in). */
export async function portalOnBookings(bookings: { server: TestServer; admin: Record<string, string>; editor: Record<string, string> }, options: { registration?: boolean; selfLinking?: boolean } = {}): Promise<PortalKit> {
  return makePortalKit({
    ...options,
    server: bookings.server,
    admin: { cookie: bookings.admin.Cookie, csrf: bookings.admin['X-CSRF-Token'], email: 'owner@site.test' },
    editor: { cookie: bookings.editor.Cookie, csrf: bookings.editor['X-CSRF-Token'], email: 'editor@site.test' },
  })
}

export async function makePortalKit(options: { env?: Record<string, string>; server?: TestServer; admin?: { cookie: string; csrf: string; email: string }; editor?: { cookie: string; csrf: string; email: string }; registration?: boolean; selfLinking?: boolean } = {}): Promise<PortalKit> {
  const server = options.server ?? (await startServer({ env: { PUBLIC_URL: 'https://site.test', ...options.env } }))
  const owner = options.admin ?? (await server.signIn('admin', 'owner@site.test'))
  const helper = options.editor ?? (await server.signIn('editor', 'editor@site.test'))
  const admin = { Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf }
  const editor = { Cookie: helper.cookie, 'X-CSRF-Token': helper.csrf }
  const send = async (method: string, path: string, body: unknown) => {
    const response = await server.api(path, { method, body, headers: admin })
    if (response.status >= 300) throw new Error(`${method} ${path} failed in a test: ${response.status} ${response.text}`)
    return response.json.data
  }
  if (options.registration !== undefined || options.selfLinking !== undefined) {
    await send('PUT', '/api/admin/client-settings', { ...(options.registration !== undefined ? { registration: options.registration } : {}), ...(options.selfLinking !== undefined ? { selfLinking: options.selfLinking } : {}) })
  }
  const settle = async () => {
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
  }
  const quotes = quoteKit(server, owner)

  const as = (cookie: string, csrf: string, id = '', email = ''): Customer => {
    const headers = { Cookie: cookie, 'X-CSRF-Token': csrf }
    return {
      id,
      email,
      cookie,
      csrf,
      headers,
      get: (path) => server.api(path, { headers: { Cookie: cookie } }),
      post: (path, body = {}) => server.api(path, { method: 'POST', body, headers }),
      patch: (path, body) => server.api(path, { method: 'PATCH', body, headers }),
      del: (path) => server.api(path, { method: 'DELETE', headers }),
    }
  }

  const kit: PortalKit = {
    server,
    api: server.api,
    admin,
    editor,
    adminSession: owner,
    settle,
    mailsTo: (address) => server.mailer.sent.filter((message) => message.to === address).map((message) => ({ subject: message.subject, text: message.text, html: message.html, to: message.to })),
    linkTo(address) {
      const mail = server.mailer.sent.filter((message) => message.to === address && LINK.test(message.text)).at(-1)
      if (!mail) throw new Error(`no sign-in link was mailed to ${address}`)
      const match = LINK.exec(mail.text)!
      return { url: match[0], lang: match[1], token: match[2] }
    },
    async invite(email, extra = {}) {
      const data = await send('POST', '/api/admin/clients', { email, language: 'en', ...extra })
      await settle()
      return data.id as string
    },
    open: (token, headers = {}) => server.api('/api/portal/auth/verify', { body: { token }, headers }),
    async customer(email, extra = {}) {
      const existing = server.db.get<{ id: string }>('SELECT id FROM customers WHERE email = ? COLLATE NOCASE', [email])
      const id = existing?.id ?? (await kit.invite(email, extra))
      const reply = await kit.open(kit.linkTo(email).token)
      expect(reply.status, reply.text).toBe(200)
      const cookie = (reply.headers.get('set-cookie') ?? '').split(';')[0]
      return as(cookie, reply.json.data.csrfToken as string, id, email)
    },
    async signInAgain(email, language = 'en') {
      const asked = await server.api('/api/portal/auth/request', { body: { email, language } })
      expect(asked.status, asked.text).toBe(202)
      await settle()
      const reply = await kit.open(kit.linkTo(email).token)
      expect(reply.status, reply.text).toBe(200)
      const id = server.db.get<{ id: string }>('SELECT id FROM customers WHERE email = ? COLLATE NOCASE', [email])!.id
      return as((reply.headers.get('set-cookie') ?? '').split(';')[0], reply.json.data.csrfToken as string, id, email)
    },
    as,
    put: (path, body) => send('PUT', path, body),
    post: (path, body) => send('POST', path, body),
    async request(email, overrides = {}) {
      const made = await quotes.request({ email, ...overrides })
      return { id: made.id, reference: made.reference }
    },
    async accepted(email, overrides = {}) {
      const made = await quotes.ready(overrides.quote ?? {}, { email, ...(overrides.request ?? {}) })
      const sent = await quotes.send('POST', `/api/admin/quotes/${made.quoteId}/send`, { note: 'Looking forward to it.' })
      expect(sent.status, sent.text).toBe(200)
      await settle()
      const mail = server.mailer.sent.filter((message) => message.to === email && linkIn(message.text, 'quote')).at(-1)
      if (!mail) throw new Error(`no quotation was mailed to ${email}`)
      const page = await quotes.open(linkIn(mail.text, 'quote'))
      const done = await quotes.act({ token: page.json.data.actions.accept, confirm: true })
      expect(done.status, done.text).toBe(200)
      return { id: made.id, reference: made.reference, quoteId: made.quoteId }
    },
    async link(customerId, type, recordId) {
      const data = await send('POST', `/api/admin/clients/${customerId}/links`, { type, recordId })
      return data.id as string
    },
    async project(customerId, body = {}) {
      const data = await send('POST', `/api/admin/clients/${customerId}/projects`, { name: 'A website', category: 'website', notify: false, ...body })
      return { id: data.id as string, reference: data.reference as string }
    },
    close: () => server.close(),
  }
  return kit
}
