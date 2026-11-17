import { expect } from 'vitest'
import type { Customer } from './portalKit.ts'
import { makeWorkKit, type Reply, type WorkKit } from './workKit.ts'

/**
 * What the communication tests share (PROMPT 28): a work kit (an administrator and an editor signed in, a customer with a project; the server allows preview origins so the
 * deliverable endpoints work too) and short calls for the customer's and the administration's conversation endpoints. Everything goes through the real endpoints; the database is
 * read only to prove what a response was not asked to show.
 */

export const PREVIEW = 'https://previews.example.test'

export interface CommunicationKit {
  w: WorkKit
  anna: Customer
  call: WorkKit['call']
  /** The customer's calls. */
  mine(path?: string): string
  /** The administration's calls. */
  admin(path?: string): string
  put(customer: Customer, path: string, body: unknown): Promise<Reply>
  /** Lets customers start conversations (the owner's switch). */
  open(): Promise<void>
  /** Another customer (with a project of their own). */
  other(email?: string, language?: 'hu' | 'en' | 'nl'): Promise<{ customer: Customer; project: { id: string; reference: string } }>
  /** A conversation the customer starts (the owner's switch is turned on first). Returns its reference. */
  startedByCustomer(body?: Record<string, unknown>, as?: Customer): Promise<string>
  /** A conversation the owner starts with Anna. Returns its reference. */
  startedByOwner(body?: Record<string, unknown>): Promise<string>
  /** The customer's view of a conversation (the whole answer's data). */
  view(reference: string, as?: Customer, query?: string): Promise<any>
  /** The administration's view. */
  adminView(reference: string, query?: string): Promise<any>
  /** The e-mails queued for an address, as sent (after the outbox ran). */
  mails(address: string): { subject: string; text: string; html: string; to: string }[]
  /** The outbox rows about conversations, in order. */
  outbox(): Array<{ kind: string; related_id: string; recipient: string; status: string }>
  close(): Promise<void>
}

let counter = 0
const token = () => `tok${(counter += 1).toString().padStart(6, '0')}abcd`

export const newToken = token

export async function makeCommunicationKit(options: { email?: string; language?: 'hu' | 'en' | 'nl'; env?: Record<string, string> } = {}): Promise<CommunicationKit> {
  const w = await makeWorkKit({ ...options, env: { PREVIEW_ORIGINS: PREVIEW, ...options.env } })
  const mine = (path = '') => `/api/portal/messages${path}`
  const admin = (path = '') => `/api/admin/communications${path}`
  const kit: CommunicationKit = {
    w,
    anna: w.anna,
    call: w.call,
    mine,
    admin,
    put: (customer, path, body) => w.kit.api(path, { method: 'PUT', body, headers: customer.headers }),
    async open() {
      const reply = await w.call('PUT', '/api/admin/communication-settings', { customerCanStart: true })
      expect(reply.status, reply.text).toBe(200)
    },
    async other(email = 'bela@example.com', language) {
      const customer = await w.kit.customer(email, language ? { language } : {})
      const project = await w.kit.project(customer.id)
      return { customer, project }
    },
    async startedByCustomer(body = {}, as = w.anna) {
      await kit.open()
      const reply = await as.post(mine(), { subject: 'A question about the home page', body: 'Could we move the contact button up?', clientToken: token(), ...body })
      expect(reply.status, reply.text).toBe(201)
      await w.kit.settle()
      return reply.json.data.reference as string
    },
    async startedByOwner(body = {}) {
      const reply = await w.call('POST', admin(), { customerId: w.anna.id, subject: 'The next step', body: 'Could you send us the logo?', clientToken: token(), ...body })
      expect(reply.status, reply.text).toBe(201)
      await w.kit.settle()
      return reply.json.data.reference as string
    },
    async view(reference, as = w.anna, query = '') {
      const reply = await as.get(mine(`/${reference}${query}`))
      expect(reply.status, reply.text).toBe(200)
      return reply.json.data
    },
    async adminView(reference, query = '') {
      const reply = await w.call('GET', admin(`/${reference}${query}`))
      expect(reply.status, reply.text).toBe(200)
      return reply.json.data
    },
    mails: (address) => w.kit.mailsTo(address),
    outbox: () =>
      w.kit.server.db.all<{ kind: string; related_id: string; recipient: string; status: string }>(
        "SELECT kind, related_id, recipient, status FROM email_deliveries WHERE related_type = 'conversation_message' ORDER BY created_at, rowid",
      ),
    close: () => w.close(),
  }
  return kit
}
