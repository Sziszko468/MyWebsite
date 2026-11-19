import type { Database } from '../src/db/database.ts'

/**
 * SYNTHETIC data for the performance tests of the analytics (PROMPT 32). Everything generated here is labelled `SYN-…` / `SYNTHETIC`, is deterministic (the same rows on every run) and
 * is written only into the in-memory database of a test: it is never part of the application's own database, the seed or any migration.
 *
 * Size: 25,000 quote requests, up to 14,000 quotations, ~70,000 quote events, 6,000 customers, 8,000 projects, 14,000 milestones, 50,000 tasks, 5,000 conversations with 150,000
 * messages, 9,000 consultations, 70,000 AI ledger rows and ~23,000 tool calls.
 */

export const N = { requests: 25_000, customers: 6_000, projects: 8_000, tasks: 50_000, milestones: 14_000, conversations: 5_000, messages: 150_000, bookings: 9_000, ai: 70_000 }

// A small deterministic generator: the same data on every run.
let seed = 42
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]
const END = Date.parse('2026-11-03T10:00:00.000Z')
const YEARS = 3
/** A timestamp somewhere in the last three years, older ones less often than recent ones (a business that grows). */
const when = (): string => new Date(END - Math.floor(Math.pow(rnd(), 1.4) * YEARS * 365 * 86_400_000)).toISOString()
const dayOf = (iso: string) => iso.slice(0, 10)
const after = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString()


export type SyntheticSize = typeof N

/** Writes the synthetic rows into `db` (an in-memory test database, or a throw-away scratch database for the browser checks); `size` can be smaller than the performance size. */
export function buildSyntheticDataset(db: Database, size: SyntheticSize = N): void {
  db.transaction(() => {
    const language = ['hu', 'en', 'nl'] as const
    for (let i = 0; i < size.customers; i += 1) {
      const at = when()
      db.run("INSERT INTO customers (id, email, name, language, status, origin, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [`syn-c-${i}`, `syn${i}@example.test`, `SYNTHETIC ${i}`, pick(language), pick(['active', 'active', 'invited', 'disabled']), pick(['invitation', 'registration']), at, at, at])
    }
    const requestStatus = ['new', 'under_review', 'waiting_customer', 'quote_preparation', 'quote_sent', 'accepted', 'declined', 'completed', 'cancelled'] as const
    for (let i = 0; i < size.requests; i += 1) {
      const at = when()
      db.run("INSERT INTO quote_requests (id, reference, language, name, email, description, status, source, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [`syn-r-${i}`, `SYN-R-${i}`, pick(language), `SYNTHETIC ${i}`, `syn-r${i}@example.test`, 'A synthetic request for the performance test of the analytics.', pick(requestStatus), pick(['shop', 'shop', 'control_room_ai', 'contact_form']), `h${i}`, at, at])
      db.run('INSERT INTO quote_events (quote_request_id, reference, event_type, actor_type, from_status, to_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [`syn-r-${i}`, `SYN-R-${i}`, 'created', 'customer', null, 'new', at])
      if (rnd() < 0.7) db.run('INSERT INTO quote_events (quote_request_id, reference, event_type, actor_type, from_status, to_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [`syn-r-${i}`, `SYN-R-${i}`, 'status_changed', 'admin', 'new', 'under_review', after(at, 1)])
      if (rnd() < 0.5) db.run('INSERT INTO quote_events (quote_request_id, reference, event_type, actor_type, from_status, to_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [`syn-r-${i}`, `SYN-R-${i}`, 'status_changed', 'admin', 'under_review', 'quote_preparation', after(at, 2)])
      if (rnd() < 0.55) {
        const sentAt = after(at, 3)
        const fate = rnd()
        const status = fate < 0.4 ? 'accepted' : fate < 0.6 ? 'declined' : 'sent'
        const cur = rnd() < 0.7 ? 'EUR' : 'HUF'
        const total = cur === 'EUR' ? Math.floor(50_000 + rnd() * 900_000) : Math.floor(200_000 + rnd() * 5_000_000)
        db.run("INSERT INTO quotes (id, quote_request_id, version, reference, status, language, title, pricing_mode, currency, fixed_minor, total_minor, created_at, updated_at, sent_at, accepted_at, declined_at) VALUES (?, ?, 1, ?, ?, 'en', 'SYNTHETIC', 'fixed', ?, ?, ?, ?, ?, ?, ?, ?)", [`syn-q-${i}`, `syn-r-${i}`, `SYN-Q-${i}`, status, cur, total, total, after(at, 2), sentAt, sentAt, status === 'accepted' ? after(sentAt, 4) : null, status === 'declined' ? after(sentAt, 6) : null])
        if (status === 'accepted' && rnd() < 0.6) {
          db.run("INSERT INTO client_projects (id, reference, customer_id, quote_request_id, name, category, status, started_on, expected_on, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'website', ?, ?, ?, ?, ?, ?)", [`syn-pq-${i}`, `SYN-PQ-${i}`, `syn-c-${i % size.customers}`, `syn-r-${i}`, 'SYNTHETIC', 'development', dayOf(after(sentAt, 5)), dayOf(after(sentAt, 60)), null, after(sentAt, 5), after(sentAt, 5)])
        }
      }
    }
    const projectStatus = ['awaiting_start', 'discovery', 'planning', 'design', 'development', 'review', 'waiting_customer', 'finalization', 'completed', 'completed', 'on_hold', 'cancelled'] as const
    for (let i = 0; i < size.projects; i += 1) {
      const at = when()
      const status = pick(projectStatus)
      db.run("INSERT INTO client_projects (id, reference, customer_id, name, category, status, started_on, expected_on, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'webapp', ?, ?, ?, ?, ?, ?)", [`syn-p-${i}`, `SYN-P-${i}`, `syn-c-${Math.floor(rnd() * size.customers)}`, 'SYNTHETIC', status, dayOf(at), dayOf(after(at, 45)), status === 'completed' ? after(at, 40) : null, at, at])
    }
    for (let i = 0; i < size.milestones; i += 1) {
      const at = when()
      const status = pick(['upcoming', 'in_progress', 'completed', 'completed', 'delayed'] as const)
      db.run('INSERT INTO client_milestones (id, project_id, title, due_on, completed_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [`syn-m-${i}`, `syn-p-${Math.floor(rnd() * size.projects)}`, 'SYNTHETIC', dayOf(after(at, 20)), status === 'completed' ? after(at, 18) : null, status, at])
    }
    for (let i = 0; i < size.tasks; i += 1) {
      const at = when()
      const status = pick(['backlog', 'planned', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'completed', 'completed', 'completed', 'cancelled'] as const)
      db.run('INSERT INTO project_tasks (id, reference, project_id, title, status, due_on, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [`syn-t-${i}`, `SYN-T-${i}`, `syn-p-${Math.floor(rnd() * size.projects)}`, 'SYNTHETIC', status, dayOf(after(at, 14)), status === 'completed' ? after(at, 10) : null, at, at])
    }
    for (let i = 0; i < size.conversations; i += 1) {
      const at = when()
      const status = pick(['open', 'waiting_owner', 'waiting_customer', 'resolved', 'resolved'] as const)
      db.run("INSERT INTO conversations (id, reference, kind, customer_id, subject, status, started_by, last_activity_at, created_at, updated_at, resolved_at) VALUES (?, ?, 'thread', ?, 'SYNTHETIC', ?, 'customer', ?, ?, ?, ?)", [`syn-v-${i}`, `SYN-V-${i}`, `syn-c-${Math.floor(rnd() * size.customers)}`, status, at, at, at, status === 'resolved' ? after(at, 2) : null])
    }
    for (let i = 0; i < size.messages; i += 1) {
      const conversation = Math.floor(rnd() * size.conversations)
      const at = when()
      db.run("INSERT INTO conversation_messages (id, conversation_id, sender_type, message_type, visibility, body, created_at) VALUES (?, ?, ?, 'text', 'customer', 'SYNTHETIC', ?)", [`syn-msg-${i}`, `syn-v-${conversation}`, rnd() < 0.5 ? 'customer' : 'admin', at])
    }
    for (let i = 0; i < size.bookings; i += 1) {
      // Every slot is its own three hours: the database refuses two live bookings at the same moment (a trigger), and the synthetic data must not bypass that.
      const start = new Date(END - YEARS * 365 * 86_400_000 + i * 3 * 3_600_000).toISOString()
      const at = after(start, -5)
      const status = pick(['pending', 'confirmed', 'confirmed', 'completed', 'cancelled', 'no_show'] as const)
      db.run("INSERT INTO bookings (id, reference, consultation_type_id, language, name, email, start_at, end_at, time_zone, status, created_at, updated_at, confirmed_at, completed_at, cancelled_at) SELECT ?, ?, id, ?, 'SYNTHETIC', ?, ?, ?, 'Europe/Budapest', ?, ?, ?, ?, ?, ? FROM consultation_types LIMIT 1", [`syn-b-${i}`, `SYN-B-${i}`, pick(language), `syn-b${i}@example.test`, start, after(start, 0.02), status, at, at, status === 'pending' || status === 'cancelled' ? null : after(at, 1), status === 'completed' ? after(start, 0.03) : null, status === 'cancelled' ? after(at, 2) : null])
    }
    for (let i = 0; i < size.ai; i += 1) {
      const at = when()
      db.run("INSERT INTO ai_requests (id, ip_hash, model, status, reserved_cost_usd, actual_cost_usd, cost_source, input_tokens, output_tokens, day, created_at, audience, latency_ms, tool_calls, error_code) VALUES (?, 'h', 'claude-haiku-5-5', ?, 0.01, ?, 'provider_usage', 1000, 100, ?, ?, ?, 1500, 1, ?)", [`syn-a-${i}`, pick(['completed', 'completed', 'completed', 'failed', 'aborted'] as const), 0.003, dayOf(at), at, rnd() < 0.8 ? 'visitor' : 'admin', null])
      if (i % 3 === 0) db.run("INSERT INTO ai_tool_calls (id, request_id, conversation_id, tool, status, duration_ms, day, created_at, audience) VALUES (?, ?, 'c', ?, 'ok', 20, ?, ?, 'visitor')", [`syn-tc-${i}`, `syn-a-${i}`, pick(['getPublishedServices', 'getPackageDetails', 'searchFaq']), dayOf(at), at])
    }
  })
}
