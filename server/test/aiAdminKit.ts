import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { sha256Hex } from '../src/lib/crypto.ts'
import type { Authority, Policy } from '../src/modules/ai/adminassistant/access.ts'
import { createAdminConversation, type ContextType } from '../src/modules/ai/adminassistant/store.ts'
import { ADMIN_TOOL_NAMES, buildAdminTools, type AdminToolName } from '../src/modules/ai/adminassistant/tools.ts'
import { scriptedModel } from './aiMock.ts'
import { makePortalKit, type Customer, type PortalKit } from './portalKit.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * What the AI admin assistant's tests share (PROMPT 31): a server with a scripted model (nothing is ever requested from the real provider), a portal kit on it (an
 * administrator and an editor signed in; customers, projects, quote requests, through the real endpoints), a few builders for the records the assistant reads, and a way to
 * call the assistant's tools exactly as the model would: through their input schemas and `execute`, for a given administrator and conversation.
 */

export interface AdminAiKit {
  s: TestServer
  portal: PortalKit
  model: ReturnType<typeof scriptedModel>
  /** The administrator (owner) and the editor, as the assistant sees them. */
  owner: Authority
  editor: Authority
  /** Another administrator account (a second one with the `admin` role). */
  second: Authority
  headers: { owner: Record<string, string>; editor: Record<string, string>; second: Record<string, string> }
  authorityOf(session: { cookie: string; email: string }): Authority
  /** Switches the admin assistant on through the administration's own endpoint (it is off until then). */
  enable(): Promise<void>
  /** A conversation row for an administrator (the tools find the context there). */
  conversation(authority: Authority, context?: { type: ContextType; ref: string | null }, language?: 'hu' | 'en' | 'nl'): string
  /** The tools of one answer, called as the model would call them. */
  tools(authority: Authority, conversationId: string, options?: { policy?: Policy; maxToolCalls?: number; language?: 'hu' | 'en' | 'nl' }): Promise<{ call(name: AdminToolName, input?: Record<string, unknown>): Promise<any>; set: Record<string, any>; counter: { calls: number } }>
  customer(email: string, extra?: Record<string, unknown>): Promise<Customer>
  task(project: { id: string }, body?: Record<string, unknown>): Promise<{ id: string; reference: string }>
  /** A conversation a customer starts, with the owner's switch turned on first. Returns its reference. */
  talk(customer: Customer, subject: string, body: string, context?: { type: string; reference: string }): Promise<string>
  /** A consultation booking written straight into the table (what the booking page would have written). Returns its id and reference. */
  booking(overrides?: Record<string, unknown>): { id: string; reference: string }
  close(): Promise<void>
}

let counter = 0

export async function makeAdminAiKit(options: { env?: Record<string, string>; script?: Parameters<typeof scriptedModel>[0]; /** Start with the model verified and the visitors' assistant on (default). `false`: a server that was never activated. */ aiActive?: boolean } = {}): Promise<AdminAiKit> {
  const model = scriptedModel(options.script ?? [])
  const s = await startServer({ env: { PUBLIC_URL: 'https://site.test', MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-aiadmin-media-')), ...options.env }, aiModel: async () => model, ...(options.aiActive === undefined ? {} : { aiActive: options.aiActive }) })
  const portal = await makePortalKit({ server: s })
  const authorityOf = (session: { cookie: string; email: string }): Authority => {
    const token = session.cookie.slice(session.cookie.indexOf('=') + 1)
    const row = s.db.get<{ id: string }>('SELECT id FROM admin_users WHERE email = ?', [session.email])
    if (!row) throw new Error('no such administrator in the test')
    return { userId: row.id, tokenHash: sha256Hex(token) }
  }
  const secondSession = await s.signIn('admin', 'second@site.test')
  const kit: AdminAiKit = {
    s,
    portal,
    model,
    owner: authorityOf(portal.adminSession),
    editor: authorityOf({ cookie: portal.editor.Cookie, email: 'editor@site.test' }),
    second: authorityOf(secondSession),
    headers: { owner: portal.admin, editor: portal.editor, second: { Cookie: secondSession.cookie, 'X-CSRF-Token': secondSession.csrf } },
    authorityOf,
    async enable() {
      const reply = await s.api('/api/admin/ai/settings', { method: 'PUT', body: { adminAssistantEnabled: true }, headers: portal.admin })
      expect(reply.status, reply.text).toBe(200)
    },
    conversation(authority, context = { type: 'general', ref: null }, language = 'en') {
      counter += 1
      const id = `conv-admin-${String(counter).padStart(10, '0')}-abcdef`
      createAdminConversation(s.db, s.app.context.clock, { id, userId: authority.userId, language, contextType: context.type, contextRef: context.ref })
      return id
    },
    async tools(authority, conversationId, opts = {}) {
      const counterBox = { calls: 0 }
      const app = s.app.context
      const set = (await buildAdminTools({ app, authority, policy: opts.policy, conversationId, language: opts.language ?? 'en', requestId: `req-${counter}`, maxToolCalls: opts.maxToolCalls ?? 10, counter: counterBox })) as unknown as Record<string, { inputSchema: { safeParse(input: unknown): { success: boolean; data?: unknown; error?: unknown } }; execute(input: unknown, options: unknown): Promise<unknown> }>
      return {
        set,
        counter: counterBox,
        async call(name, input = {}) {
          const tool = set[name]
          if (!tool) throw new Error(`no such tool in the test: ${name}`)
          const parsed = tool.inputSchema.safeParse(input)
          // The AI SDK validates the model's input against the schema before `execute` runs: an input that fails never reaches it.
          if (!parsed.success) return { schemaRejected: true }
          return tool.execute(parsed.data, { toolCallId: 't', messages: [] })
        },
      }
    },
    customer: (email, extra) => portal.customer(email, extra),
    async task(project, body = {}) {
      const reply = await s.api(`/api/admin/client-projects/${project.id}/tasks`, { method: 'POST', body: { title: 'Design the home page', ...body }, headers: portal.admin })
      expect(reply.status, reply.text).toBe(201)
      return { id: reply.json.data.id as string, reference: reply.json.data.reference as string }
    },
    async talk(customer, subject, body, context) {
      const opened = await s.api('/api/admin/communication-settings', { method: 'PUT', body: { customerCanStart: true }, headers: portal.admin })
      expect(opened.status, opened.text).toBe(200)
      const reply = await customer.post('/api/portal/messages', { subject, body, ...(context ? { context } : {}), clientToken: `tok${String((counter += 1)).padStart(6, '0')}abcd` })
      expect(reply.status, reply.text).toBe(201)
      await portal.settle()
      return reply.json.data.reference as string
    },
    booking(overrides = {}) {
      counter += 1
      const type = s.db.get<{ id: string }>('SELECT id FROM consultation_types ORDER BY sort_order LIMIT 1')!
      const id = `bk-test-${String(counter).padStart(6, '0')}`
      const reference = `BK-2026-9${String(counter).padStart(5, '0')}`
      const now = s.app.context.clock.now().toISOString()
      const row = { id, reference, consultation_type_id: type.id, language: 'en', name: 'Booking Person', email: 'booker@example.com', company: null, description: 'We would like to talk about a webshop.', start_at: '2026-11-20T09:00:00.000Z', end_at: '2026-11-20T09:30:00.000Z', time_zone: 'Europe/Budapest', status: 'confirmed', quote_request_id: null, created_at: now, updated_at: now, ...overrides }
      s.db.run(
        'INSERT INTO bookings (id, reference, consultation_type_id, language, name, email, company, description, start_at, end_at, time_zone, status, quote_request_id, created_at, updated_at, confirmed_at, cancelled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [row.id, row.reference, row.consultation_type_id, row.language, row.name, row.email, row.company, row.description, row.start_at, row.end_at, row.time_zone, row.status, row.quote_request_id, row.created_at, row.updated_at, row.status === 'confirmed' ? now : null, row.status === 'cancelled' ? now : null],
      )
      return { id: row.id as string, reference: row.reference as string }
    },
    close: () => portal.close(),
  }
  return kit
}

export { ADMIN_TOOL_NAMES }

/** A digest of every table that holds business data: everything except the assistant's own tables, the usage ledger, the audit log and the sessions. Equal before and after = nothing was written. */
export function businessDigest(s: TestServer): string {
  const skip = /^(ai_|audit_log|admin_sessions|sqlite_|email_deliveries|email_events|reference_counters|settings)/
  const tables = s.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((row) => row.name).filter((name) => !skip.test(name))
  return sha256Hex(tables.map((name) => `${name}:${JSON.stringify(s.db.all(`SELECT * FROM ${name}`))}`).join('\n'))
}
