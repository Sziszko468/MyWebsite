import { afterEach, describe, expect, it } from 'vitest'
import { mirrorProjectEvent } from '../src/modules/communications/events.ts'
import { recordEvent as recordQuoteEvent } from '../src/modules/quotes/events.ts'
import { makeKit as makeBookingKit, type Kit as BookingKit } from './bookingKit.ts'
import { makeCommunicationKit, newToken, type CommunicationKit } from './communicationKit.ts'
import { makeDeliverableKit, type DeliverableKit } from './deliverableKit.ts'
import { portalOnBookings, type PortalKit } from './portalKit.ts'

/**
 * PROMPT 28: system events. What other modules already recorded is mirrored, once, into the customer's activity feed, and only when the customer may see it. These tests do the real
 * things (change a project's status, complete a milestone, answer a task, publish a deliverable, confirm a booking) and read what the customer sees.
 */

let k: CommunicationKit | undefined
let dk: DeliverableKit | undefined
let bookings: BookingKit | undefined
let portal: PortalKit | undefined
afterEach(async () => {
  await k?.close()
  await dk?.close()
  await portal?.close()
  await bookings?.close()
  k = dk = bookings = portal = undefined
})

/** The customer's activity feed for a project (or the one for bookings and quotes), as the customer reads it. */
async function feed(customer: { get(path: string): Promise<any> }, projectReference: string | null) {
  const list = (await customer.get('/api/portal/messages')).json.data.items.filter((entry: any) => entry.kind === 'activity')
  const found = list.find((entry: any) => (entry.project?.reference ?? null) === projectReference)
  if (!found) return { keys: [] as string[], messages: [] as any[] }
  const view = (await customer.get(`/api/portal/messages/${found.reference}`)).json.data
  return { keys: view.messages.map((entry: any) => entry.event.key) as string[], messages: view.messages as any[] }
}

describe('what is mirrored', () => {
  it('a project’s creation, its status, a milestone, a customer task answered and reviewed: each once, as events and not as words', async () => {
    k = await makeCommunicationKit()
    const { w } = k
    await w.call('POST', w.at('/status'), { status: 'design' })
    const milestone = (await w.call('POST', w.at('/milestones'), { title: 'Design approved', dueOn: '2026-12-01' })).json.data
    await w.call('PATCH', w.at(`/milestones/${milestone.id}`), { done: true })
    const hidden = (await w.call('POST', w.at('/milestones'), { title: 'Internal checkpoint', customerVisible: false })).json.data
    await w.call('PATCH', w.at(`/milestones/${hidden.id}`), { done: true })

    const task = await w.task({ title: 'Send the logo', customerVisible: true })
    const given = await w.call('POST', w.at(`/tasks/${task.id}/action`), { actionType: 'provide_content', instruction: 'Please write the text of the logo.' })
    const actionId = given.json.data.action.id
    expect((await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${task.reference}/respond`, { response: 'It says Racing Red.' })).status).toBe(201)
    expect((await w.call('POST', w.at(`/actions/${actionId}/changes`), { customerNote: 'Please add the year as well.', internalNote: 'INTERNAL-NOTE-ONLY' })).status).toBe(200)
    expect((await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${task.reference}/respond`, { response: 'It says Racing Red 2026.' })).status).toBe(201)
    expect((await w.call('POST', w.at(`/actions/${actionId}/accept`), { customerNote: 'Thank you.' })).status).toBe(200)

    const { keys, messages } = await feed(w.anna, w.project.reference)
    expect(keys).toEqual(['project.created', 'project.status_changed', 'milestone.completed', 'task.submitted', 'task.changes_requested', 'task.submitted', 'task.accepted'])
    expect(messages.find((entry) => entry.event.key === 'milestone.completed').event.params).toEqual({ title: 'Design approved' })
    for (const entry of messages) expect(entry).toMatchObject({ type: 'system_event', from: 'system', body: null, removed: false })
    // Never what a person wrote, never a private word: only a key and a title the customer already sees.
    expect(JSON.stringify(messages)).not.toMatch(/INTERNAL|Internal checkpoint|Racing Red|logo\./)
  })

  it('a deliverable that is published, feedback sent, changes asked for and a version approved', async () => {
    dk = await makeDeliverableKit()
    const made = await dk.make({ title: 'Home page design', internalDescription: 'INTERNAL-DESCRIPTION-ONLY' }, true)
    const anna = dk.w.anna
    await anna.post(dk.mine('/comments', made.reference), { body: 'Make the header darker.' })
    await anna.post(dk.mine('/comments', made.reference), { body: 'And the footer.' })
    expect((await anna.post(dk.mine('/feedback', made.reference), {})).status).toBe(201)
    const first = await dk.call('POST', dk.admin('/approvals', made.id), {})
    const approvalId = first.json.data.approvals[0].id
    await anna.post(dk.mine(`/approvals/${approvalId}/changes`, made.reference), { explanation: 'Please try a darker header.', revision: 1 })
    await dk.next(made.id)
    const second = await dk.call('POST', dk.admin('/approvals', made.id), {})
    const open = second.json.data.approvals.find((entry: any) => entry.state === 'requested')
    const version = (await dk.detail(made.id)).versions.find((entry: any) => entry.number === 2)
    expect((await anna.post(dk.mine(`/approvals/${open.id}/approve`, made.reference), { confirm: true, versionNumber: 2, checksum: version.checksum, revision: open.revision })).status).toBe(200)

    const { keys, messages } = await feed(anna, dk.w.project.reference)
    expect(keys).toEqual(['project.created', 'deliverable.published', 'deliverable.feedback_submitted', 'deliverable.changes_requested', 'deliverable.published', 'deliverable.approved'])
    expect(messages[2].event.params).toMatchObject({ title: 'Home page design', version: 1, count: 2 })
    expect(messages[5].event.params).toMatchObject({ title: 'Home page design', version: 2 })
    expect(JSON.stringify(messages)).not.toMatch(/INTERNAL|darker/)
  })

  it('a booking that is confirmed, rescheduled or cancelled, only for the customer it was linked to; a request that was linked and a quote sent or accepted', async () => {
    bookings = await makeBookingKit()
    portal = await portalOnBookings(bookings)
    const anna = await portal.customer('anna@example.com')
    const stranger = await portal.customer('stranger@example.com')
    const before = await bookings.book({ email: 'anna@example.com', description: 'Before it was linked.' })
    expect(before.status, before.text).toBe(201)
    const id = bookings.server.db.get<{ id: string }>('SELECT id FROM bookings WHERE reference = ?', [before.json.data.reference])!.id
    // An event before the link is the owner's business: it is not shown (no history is invented).
    await bookings.api(`/api/admin/bookings/${id}/actions`, { headers: bookings.admin, body: { action: 'confirm' } })
    expect((await feed(anna, null)).keys).toEqual([])
    await portal.link(anna.id, 'booking', id)
    await bookings.api(`/api/admin/bookings/${id}/actions`, { headers: bookings.admin, body: { action: 'cancel' } })
    const afterLink = await feed(anna, null)
    expect(afterLink.keys).toEqual(['consultation.cancelled'])
    expect(afterLink.messages[0].event.params).toMatchObject({ reference: before.json.data.reference })
    expect((await feed(stranger, null)).keys).toEqual([])

    // A quote request linked to Anna: the quote's lines are mirrored the moment they are written, not before.
    const request = await portal.request('anna@example.com')
    const context = bookings.server.app.context
    recordQuoteEvent(context, { requestId: request.id, reference: request.reference, type: 'quote_sent', actor: { type: 'system' } })
    expect((await feed(anna, null)).keys).toEqual(['consultation.cancelled'])
    await portal.link(anna.id, 'quote_request', request.id)
    recordQuoteEvent(context, { requestId: request.id, reference: request.reference, type: 'quote_sent', actor: { type: 'system' } })
    recordQuoteEvent(context, { requestId: request.id, reference: request.reference, type: 'quote_accepted', actor: { type: 'customer' } })
    recordQuoteEvent(context, { requestId: request.id, reference: request.reference, type: 'note_added', actor: { type: 'system' } })
    expect((await feed(anna, null)).keys).toEqual(['consultation.cancelled', 'quote.sent', 'quote.accepted'])
    expect((await feed(stranger, null)).keys).toEqual([])
  }, 30_000)
})

describe('what is not mirrored, and what never goes wrong', () => {
  it('a line the customer may not see, a fact the product does not list, and a line written before anything was mirrored are never shown', async () => {
    k = await makeCommunicationKit()
    const { w } = k
    const hidden = await w.task({ title: 'Private work' })
    await w.call('PATCH', w.at(`/tasks/${hidden.id}`), { title: 'Private work, renamed' })
    await w.call('POST', w.at(`/tasks/${hidden.id}/notes`), { body: 'A private note.' })
    await w.call('PATCH', w.at(''), { startedOn: '2026-12-01' })
    // A line written straight into the history (as if it had been there before the feature): nothing calls the mirror, so nothing is shown.
    w.kit.server.db.run("INSERT INTO client_project_events (project_id, event_type, actor_type, to_status, visibility, created_at) VALUES (?, 'status_changed', 'admin', 'development', 'customer', '2026-01-01T10:00:00.000Z')", [w.project.id])
    expect((await feed(w.anna, w.project.reference)).keys).toEqual(['project.created'])
  })

  it('mirroring the same line again changes nothing: one message per line, whatever happens', async () => {
    k = await makeCommunicationKit()
    const { w } = k
    await w.call('POST', w.at('/status'), { status: 'design' })
    const lines = w.kit.server.db.all<{ id: number }>("SELECT id FROM client_project_events WHERE visibility = 'customer'")
    const context = w.kit.server.app.context
    for (let round = 0; round < 3; round += 1) for (const line of lines) mirrorProjectEvent(context, line.id)
    expect((await feed(w.anna, w.project.reference)).keys).toEqual(['project.created', 'project.status_changed'])
    expect(w.kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM conversation_messages WHERE message_type = 'system_event'")!.n).toBe(2)
    expect(w.kit.server.db.get<{ n: number }>("SELECT COUNT(DISTINCT idempotency_key) AS n FROM conversation_messages WHERE message_type = 'system_event'")!.n).toBe(2)
  })

  it('a failure in the mirror never undoes the real action: the status changes, the history line is written, and only the event is missing', async () => {
    k = await makeCommunicationKit()
    const { w } = k
    const { db } = w.kit.server
    db.exec("CREATE TRIGGER boom BEFORE INSERT ON conversation_messages BEGIN SELECT RAISE(ABORT, 'boom'); END")
    const changed = await w.call('POST', w.at('/status'), { status: 'design' })
    expect(changed.status, changed.text).toBe(200)
    expect(db.get<{ status: string }>('SELECT status FROM client_projects WHERE id = ?', [w.project.id])!.status).toBe('design')
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_project_events WHERE event_type = 'status_changed'")!.n).toBe(1)
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM conversation_messages WHERE message_type = 'system_event' AND event_key = 'project.status_changed'")!.n).toBe(0)
    db.exec('DROP TRIGGER boom')
    // Once it works again the next fact is mirrored as usual.
    await w.call('POST', w.at('/status'), { status: 'development' })
    expect((await feed(w.anna, w.project.reference)).keys.at(-1)).toBe('project.status_changed')
  })

  it('events are never unread and never change who is expected to answer', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    await k.anna.post(k.mine(`/${reference}/read`), { upTo: (await k.view(reference)).page.newestSeq })
    await k.w.call('POST', k.w.at('/status'), { status: 'design' })
    await k.w.call('POST', k.w.at('/status'), { status: 'development' })
    expect((await k.anna.get(k.mine('/summary'))).json.data.unread).toBe(0)
    expect((await k.view(reference)).status).toBe('waiting_customer')
    expect((await k.call('GET', k.admin('/overview'))).json.data).toMatchObject({ unreadMessages: 0, waitingCustomer: 1 })
    // The feed itself is never listed under "unread" or "open".
    expect((await k.anna.get(k.mine('?filter=unread'))).json.data.items).toEqual([])
    expect((await k.anna.get(k.mine('?filter=open'))).json.data.items.map((entry: any) => entry.reference)).toEqual([reference])
  })

  it('a conversation about a project shows that project’s events from the day it began, inline; one about nothing in particular shows none', async () => {
    k = await makeCommunicationKit()
    await k.open()
    const { w } = k
    await w.call('POST', w.at('/status'), { status: 'design' })
    const about = await k.anna.post(k.mine(), { subject: 'About the project', body: 'Hello', context: { type: 'project', reference: w.project.reference }, clientToken: newToken() })
    const general = await k.anna.post(k.mine(), { subject: 'General question', body: 'Hello', clientToken: newToken() })
    await w.call('POST', w.at('/status'), { status: 'development' })
    const aboutView = await k.view(about.json.data.reference)
    expect(aboutView.messages.map((entry: any) => entry.event?.key ?? 'text')).toEqual(['text', 'project.status_changed'])
    expect(aboutView.messages[1]).toMatchObject({ feed: true, event: { params: { status: 'development' } } })
    expect((await k.view(general.json.data.reference)).messages.map((entry: any) => entry.event?.key ?? 'text')).toEqual(['text'])
    // The owner reads the same timeline, and the unread of the thread is unaffected by the events.
    expect((await k.adminView(about.json.data.reference)).messages.map((entry: any) => entry.event?.key ?? 'text')).toEqual(['text', 'project.status_changed'])
  })
})
