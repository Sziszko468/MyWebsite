import { afterEach, describe, expect, it } from 'vitest'
import { ConstraintError } from '../src/http/errors.ts'
import { IMAGE, makeDeliverableKit, type DeliverableKit } from './deliverableKit.ts'

/**
 * Feedback and approval (PROMPT 27): the customer's drafts and sent comments (with positions on a picture), the owner's replies, resolving and reopening, and the formal approval of
 * ONE EXACT version. The customer is a real signed-in customer; every call is the real endpoint.
 */

let k: DeliverableKit
afterEach(async () => {
  await k?.close()
})

const SECRET = 'PRIVATE-NOTE-9921'

/** A published picture deliverable, ready for comments. */
async function picture(options: { publish?: boolean } = {}) {
  const made = await k.make({ title: 'Mock-up', type: 'image', previewUrl: undefined, imageUrl: IMAGE }, options.publish !== false)
  return made
}

const comment = (reference: string, body: unknown) => k.w.anna.post(k.mine('/comments', reference), body)
const sendAll = (reference: string) => k.w.anna.post(k.mine('/feedback', reference), {})

describe('drafts of feedback', () => {
  it('a customer writes general and positioned comments on the current version; they are theirs alone and are numbered like their markers', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    expect((await comment(made.reference, { body: 'The logo looks small.' })).status).toBe(201)
    const second = await comment(made.reference, { body: 'Move this button.', position: { x: 0.25, y: 0.5 } })
    expect(second.status, second.text).toBe(201)
    await comment(made.reference, { body: 'And this one.', position: { x: 0.9, y: 0.1 } })
    const seen = await k.view(made.reference)
    expect(seen.comments.map((entry: { body: string; marker: number | null; status: string; author: string; editable: boolean; position: unknown }) => [entry.body, entry.marker, entry.status, entry.author, entry.editable, entry.position])).toEqual([
      ['The logo looks small.', null, 'draft', 'you', true, null],
      ['Move this button.', 1, 'draft', 'you', true, { x: 0.25, y: 0.5 }],
      ['And this one.', 2, 'draft', 'you', true, { x: 0.9, y: 0.1 }],
    ])
    expect(seen.drafts).toEqual({ current: 3, earlier: 0 })
    // The owner does not see them: they are the customer's until sent.
    expect((await k.detail(made.id)).comments).toEqual([])
  })

  it('validates the words and the position: numbers in 0 to 1, both or neither, nothing else, and only on a version that has a picture', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    for (const body of [{}, { body: '' }, { body: '   ' }, { body: 'x'.repeat(2001) }, { body: 5 }, { body: 'ok', position: { x: 1.2, y: 0.5 } }, { body: 'ok', position: { x: -0.1, y: 0.5 } }, { body: 'ok', position: { x: 0.5 } }, { body: 'ok', position: { x: 'a', y: 0.1 } }, { body: 'ok', position: { x: 0.5, y: 0.5, z: 1 } }, { body: 'ok', position: [0.5, 0.5] }, { body: 'ok', position: 'middle' }, { body: 'ok', author: 'studio' }, { body: 'ok', version: 1 }, { body: 'ok', status: 'submitted' }, { body: 'ok', parentId: 'x' }]) {
      expect((await comment(made.reference, body)).status, JSON.stringify(body)).toBe(422)
    }
    const site = await k.make({ title: 'A site' }, true)
    expect((await comment(site.reference, { body: 'There is no picture here.', position: { x: 0.5, y: 0.5 } })).status).toBe(422)
    expect((await comment(site.reference, { body: 'But general feedback works.' })).status).toBe(201)
    expect(k.w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliverable_comments')!.n).toBe(1)
  })

  it('rounds a position to four decimals, so the same number is kept at any size of the picture', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    await comment(made.reference, { body: 'Precise.', position: { x: 0.123456789, y: 0.999999 } })
    expect((await k.view(made.reference)).comments[0].position).toEqual({ x: 0.1235, y: 1 })
    expect(() => k.w.kit.server.db.run('UPDATE deliverable_comments SET x = 1.5')).toThrow(ConstraintError)
    expect(() => k.w.kit.server.db.run('UPDATE deliverable_comments SET y = NULL')).toThrow(ConstraintError)
  })

  it('a draft can be changed and removed by its author while it is a draft; once sent it is final', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    await comment(made.reference, { body: 'First thought.', position: { x: 0.5, y: 0.5 } })
    const id = (await k.view(made.reference)).comments[0].id as string
    const edited = await k.w.anna.patch(k.mine(`/comments/${id}`, made.reference), { body: 'Second thought.', position: { x: 0.6, y: 0.4 } })
    expect(edited.status, edited.text).toBe(200)
    expect(edited.json.data.comments[0]).toMatchObject({ body: 'Second thought.', position: { x: 0.6, y: 0.4 }, marker: 1 })
    expect((await k.w.anna.patch(k.mine(`/comments/${id}`, made.reference), { position: null })).json.data.comments[0]).toMatchObject({ position: null, marker: null })
    expect((await k.w.anna.patch(k.mine(`/comments/${id}`, made.reference), {})).status).toBe(422)
    expect((await k.w.anna.del(k.mine(`/comments/${id}`, made.reference))).status).toBe(204)
    expect((await k.view(made.reference)).comments).toEqual([])
    await comment(made.reference, { body: 'To be sent.' })
    await sendAll(made.reference)
    const sentId = (await k.view(made.reference)).comments[0].id as string
    expect((await k.w.anna.patch(k.mine(`/comments/${sentId}`, made.reference), { body: 'Changed my mind.' })).status, 'a sent comment cannot be edited').toBe(404)
    expect((await k.w.anna.del(k.mine(`/comments/${sentId}`, made.reference))).status, 'nor deleted').toBe(404)
    const { db } = k.w.kit.server
    for (const sql of ["UPDATE deliverable_comments SET body = 'Changed'", 'UPDATE deliverable_comments SET x = 0.1, y = 0.1', "UPDATE deliverable_comments SET status = 'draft', submitted_at = NULL", "UPDATE deliverable_comments SET author_type = 'admin'"]) expect(() => db.run(sql), sql).toThrow(ConstraintError)
    expect(db.get<{ body: string }>('SELECT body FROM deliverable_comments')!.body).toBe('To be sent.')
  })

  it('another customer’s comment is never reachable: a draft id from one deliverable is "not found" in another', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    await comment(made.reference, { body: 'Mine.' })
    const id = (await k.view(made.reference)).comments[0].id as string
    const bob = await k.w.kit.customer('bob@example.com')
    const bobs = await k.w.kit.project(bob.id, { name: 'Bob site' })
    const theirs = await k.call('POST', k.w.at('/deliverables', bobs), { title: 'Bob’s', type: 'design', versionDescription: 'words' })
    await k.call('POST', k.w.at(`/deliverables/${theirs.json.data.id}/versions/${(await k.call('GET', k.w.at(`/deliverables/${theirs.json.data.id}`, bobs))).json.data.versions[0].id}/publish`, bobs))
    const path = `/api/portal/projects/${bobs.reference}/deliverables/${theirs.json.data.reference}/comments/${id}`
    expect((await bob.patch(path, { body: 'Hijacked.' })).status).toBe(404)
    expect((await bob.del(path)).status).toBe(404)
    expect((await bob.post(`${path}/follow-up`, { body: 'Hijacked.' })).status).toBe(404)
    // Nor through Anna's own project address.
    expect((await bob.patch(k.mine(`/comments/${id}`, made.reference), { body: 'Hijacked.' })).status).toBe(404)
    expect(k.w.kit.server.db.get<{ body: string }>('SELECT body FROM deliverable_comments')!.body).toBe('Mine.')
  })
})

describe('sending feedback', () => {
  it('sends every draft of the current version at once: each is final, the owner sees them, one line of history, one message to the owner', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    await comment(made.reference, { body: 'First.', position: { x: 0.1, y: 0.1 } })
    await comment(made.reference, { body: 'Second.' })
    expect((await sendAll(made.reference)).json.data.sent).toBe(2)
    const seen = await k.view(made.reference)
    expect(seen.comments.map((entry: { status: string; editable: boolean }) => [entry.status, entry.editable])).toEqual([['submitted', false], ['submitted', false]])
    expect(seen.drafts.current).toBe(0)
    const owner = await k.detail(made.id)
    expect(owner.comments.map((entry: { body: string; status: string; author_type: string; marker: number | null }) => [entry.body, entry.status, entry.author_type, entry.marker])).toEqual([['First.', 'submitted', 'customer', 1], ['Second.', 'submitted', 'customer', null]])
    expect(owner.deliverable.last_customer_activity_at).not.toBeNull()
    expect(owner.events.filter((event: { event_type: string }) => event.event_type === 'feedback_submitted')).toHaveLength(1)
    await k.w.kit.settle()
    expect(k.w.kit.server.mailer.sent.filter((message) => message.to === 'owner@site.test' && /A customer sent feedback/.test(message.subject))).toHaveLength(1)
    expect((await sendAll(made.reference)).json.error.details.reason).toBe('nothing_to_send')
  })

  it('a follow-up adds to a thread without changing what was said, and is final at once', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    await comment(made.reference, { body: 'Original words.', position: { x: 0.5, y: 0.5 } })
    await sendAll(made.reference)
    const root = (await k.view(made.reference)).comments[0].id as string
    const followed = await k.w.anna.post(k.mine(`/comments/${root}/follow-up`, made.reference), { body: 'Actually, make it bigger.' })
    expect(followed.status, followed.text).toBe(201)
    const comments = followed.json.data.comments
    expect(comments.map((entry: { body: string; parentId: string | null; status: string }) => [entry.body, entry.parentId === root, entry.status])).toEqual([['Original words.', false, 'submitted'], ['Actually, make it bigger.', true, 'submitted']])
    expect(comments[1].position).toBeNull()
    for (const body of [{}, { body: '' }, { body: 'x', position: { x: 0.1, y: 0.1 } }, { body: 'x', parentId: root }]) expect((await k.w.anna.post(k.mine(`/comments/${root}/follow-up`, made.reference), body)).status, JSON.stringify(body)).toBe(422)
    expect((await k.w.anna.post(k.mine('/comments/ghost/follow-up', made.reference), { body: 'x' })).status).toBe(404)
  })

  it('feedback is about the CURRENT version: after a new version the earlier comments stay with the version they were made on, and new ones go to the new one', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    await comment(made.reference, { body: 'About version one.' })
    await sendAll(made.reference)
    await comment(made.reference, { body: 'An unsent thought about one.' })
    await k.next(made.id)
    const now = await k.view(made.reference)
    expect(now.viewing).toBe(2)
    expect(now.comments).toEqual([])
    expect(now.drafts).toEqual({ current: 0, earlier: 1 })
    const before = await k.view(made.reference, 1)
    expect(before.viewing).toBe(1)
    expect(before.comments.map((entry: { body: string; status: string; editable: boolean }) => [entry.body, entry.status, entry.editable])).toEqual([['About version one.', 'submitted', false], ['An unsent thought about one.', 'draft', false]])
    expect(before.can.comment).toBe(false)
    await comment(made.reference, { body: 'About version two.' })
    expect((await k.view(made.reference)).comments.map((entry: { body: string }) => entry.body)).toEqual(['About version two.'])
    // A tampered version number never reaches a version nobody published.
    expect((await k.view(made.reference, 99)).viewing).toBe(2)
    expect((await k.w.anna.get(k.mine('?version=-1', made.reference))).json.data.viewing).toBe(2)
    expect((await k.w.anna.get(k.mine('?version=abc', made.reference))).json.data.viewing).toBe(2)
  })

  it('every sent comment keeps its author, its version, its time and its position in the database', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    await comment(made.reference, { body: 'Kept.', position: { x: 0.3, y: 0.7 } })
    await sendAll(made.reference)
    const row = k.w.kit.server.db.get<Record<string, unknown>>('SELECT * FROM deliverable_comments')!
    expect(row).toMatchObject({ author_type: 'customer', author_id: k.w.anna.id, body: 'Kept.', x: 0.3, y: 0.7, status: 'submitted' })
    expect(row.version_id).toBe(k.w.kit.server.db.get<{ id: string }>('SELECT id FROM deliverable_versions')!.id)
    expect(row.submitted_at).not.toBeNull()
    expect(row.created_at).not.toBeNull()
    expect(row.updated_at).not.toBeNull()
  })
})

describe('the owner’s replies, resolving and notes', () => {
  async function sent(positioned = true) {
    const made = await picture()
    await comment(made.reference, { body: 'Please change this.', ...(positioned ? { position: { x: 0.5, y: 0.5 } } : {}) })
    await sendAll(made.reference)
    const root = (await k.detail(made.id)).comments[0].id as string
    return { made, root }
  }

  it('replies are final, part of the thread, shown to the customer as the studio (never as a person), and the customer is told', async () => {
    k = await makeDeliverableKit()
    const { made, root } = await sent()
    const replied = await k.call('POST', k.admin(`/comments/${root}/replies`, made.id), { body: 'Done, see the next version.' })
    expect(replied.status, replied.text).toBe(201)
    const seen = await k.view(made.reference)
    expect(seen.comments.map((entry: { author: string; body: string; parentId: string | null }) => [entry.author, entry.body, entry.parentId === root])).toEqual([['you', 'Please change this.', false], ['studio', 'Done, see the next version.', true]])
    expect(JSON.stringify(seen)).not.toContain('owner@site.test')
    expect((await k.call('POST', k.admin(`/comments/${root}/replies`, made.id), { body: '' })).status).toBe(422)
    expect((await k.call('POST', k.admin('/comments/ghost/replies', made.id), { body: 'x' })).status).toBe(404)
    expect((await k.call('POST', k.admin(`/comments/${root}/replies`, made.id), { body: 'x', author: 'customer' })).status).toBe(422)
    const { db } = k.w.kit.server
    expect(() => db.run("UPDATE deliverable_comments SET body = 'Edited' WHERE author_type = 'admin'")).toThrow(ConstraintError)
    // A reply cannot start a thread and cannot carry a position (the database refuses what the application never writes).
    expect(() => db.run("INSERT INTO deliverable_comments (id, deliverable_id, version_id, author_type, body, status, submitted_at, created_at, updated_at) SELECT 'x', deliverable_id, version_id, 'admin', 'orphan', 'submitted', 'now', 'now', 'now' FROM deliverable_comments LIMIT 1")).toThrow(ConstraintError)
    await k.w.kit.settle()
    expect(k.w.kit.server.mailer.sent.filter((message) => message.to === 'anna@example.com' && /We replied to your feedback/.test(message.subject))).toHaveLength(1)
  })

  it('the owner cannot see or answer a customer’s unsent draft', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    await comment(made.reference, { body: 'A private thought, not sent.' })
    const draftId = (await k.view(made.reference)).comments[0].id as string
    expect(JSON.stringify(await k.detail(made.id))).not.toContain('A private thought')
    expect((await k.call('POST', k.admin(`/comments/${draftId}/replies`, made.id), { body: 'Peeking.' })).status).toBe(404)
    expect((await k.call('POST', k.admin(`/comments/${draftId}/resolve`, made.id))).status).toBe(404)
  })

  it('a thread is resolved by the owner and reopened by either side; a follow-up waits until it is reopened; the words stay', async () => {
    k = await makeDeliverableKit()
    const { made, root } = await sent()
    expect((await k.call('POST', k.admin(`/comments/${root}/reopen`, made.id))).json.error.details.reason).toBe('invalid_transition')
    const resolved = await k.call('POST', k.admin(`/comments/${root}/resolve`, made.id))
    expect(resolved.status).toBe(200)
    expect(resolved.json.data.comments[0]).toMatchObject({ status: 'resolved', body: 'Please change this.' })
    expect((await k.view(made.reference)).comments[0].status).toBe('resolved')
    expect((await k.w.anna.post(k.mine(`/comments/${root}/follow-up`, made.reference), { body: 'One more thing.' })).json.error.details.reason).toBe('thread_resolved')
    const reopened = await k.w.anna.post(k.mine(`/comments/${root}/reopen`, made.reference), {})
    expect(reopened.status, reopened.text).toBe(200)
    expect(reopened.json.data.comments[0].status).toBe('submitted')
    expect((await k.w.anna.post(k.mine(`/comments/${root}/follow-up`, made.reference), { body: 'One more thing.' })).status).toBe(201)
    // The owner resolves again (through a reply's id as well: the thread is the unit), and reopens it himself.
    expect((await k.call('POST', k.admin(`/comments/${root}/resolve`, made.id))).status).toBe(200)
    expect((await k.call('POST', k.admin(`/comments/${root}/reopen`, made.id))).status).toBe(200)
    const events = (await k.detail(made.id)).events.map((event: { event_type: string }) => event.event_type)
    expect(events.filter((type: string) => type === 'comment_resolved')).toHaveLength(2)
    expect(events.filter((type: string) => type === 'comment_reopened')).toHaveLength(2)
    // Only a start of a thread resolves.
    expect(() => k.w.kit.server.db.run("INSERT INTO deliverable_comments (id, deliverable_id, version_id, parent_id, author_type, body, status, submitted_at, resolved_at, created_at, updated_at) SELECT 'y', deliverable_id, version_id, id, 'customer', 'x', 'resolved', 'now', 'now', 'now', 'now' FROM deliverable_comments LIMIT 1")).toThrow(ConstraintError)
  })

  it('private notes are stored apart, shown only to the owner, and appear nowhere a customer can look', async () => {
    k = await makeDeliverableKit()
    const { made, root } = await sent()
    expect((await k.call('POST', k.admin('/notes', made.id), { body: SECRET, commentId: root })).status).toBe(201)
    expect((await k.call('POST', k.admin('/notes', made.id), { body: SECRET, versionId: 'ghost' })).status).toBe(404)
    expect((await k.call('POST', k.admin('/notes', made.id), { body: SECRET, commentId: 'ghost' })).status).toBe(404)
    expect((await k.call('POST', k.admin('/notes', made.id), { body: '' })).status).toBe(422)
    const owner = await k.detail(made.id)
    expect(owner.notes.map((note: { body: string; commentId: string }) => [note.body, note.commentId])).toEqual([[SECRET, root]])
    expect(owner.events.find((event: { event_type: string }) => event.event_type === 'note_added')).toMatchObject({ visibility: 'internal', note: null })
    for (const path of [k.mine(), k.mine('', made.reference), '/api/portal/overview', `/api/portal/projects/${k.w.project.reference}`]) expect(JSON.stringify((await k.w.anna.get(path)).json), path).not.toContain(SECRET)
    await k.w.kit.settle()
    expect(k.w.kit.server.mailer.sent.map((message) => message.text + message.html).join('\n')).not.toContain(SECRET)
    expect(() => k.w.kit.server.db.run("UPDATE deliverable_internal_notes SET body = 'x'")).toThrow(ConstraintError)
  })
})

describe('asking for approval', () => {
  it('is the owner’s act, for the current published version only; one request at a time; the review state follows', async () => {
    k = await makeDeliverableKit()
    const draft = await k.make()
    expect((await k.call('POST', k.admin('/approvals', draft.id), {})).json.error.details.reason).toBe('not_published')
    const made = await k.make({}, true)
    const asked = await k.call('POST', k.admin('/approvals', made.id), { note: 'Please decide by Friday.' })
    expect(asked.status, asked.text).toBe(201)
    expect(asked.json.data.deliverable.review_state).toBe('awaiting_customer')
    const [approval] = asked.json.data.approvals
    expect(approval).toMatchObject({ state: 'requested', request_note: 'Please decide by Friday.', revision: 1 })
    expect((await k.call('POST', k.admin('/approvals', made.id), {})).json.error.details.reason).toBe('approval_open')
    expect((await k.call('POST', k.admin('/approvals', made.id), { note: 'x', version: 1 })).status).toBe(422)
    const seen = await k.view(made.reference)
    expect(seen.reviewState).toBe('awaiting_customer')
    expect(seen.approval).toMatchObject({ id: approval.id, versionNumber: 1, note: 'Please decide by Friday.', revision: 1 })
    expect(seen.can.decide).toBe(true)
    expect((await k.w.anna.get(`/api/portal/overview`)).json.data.awaitingApproval.map((entry: { deliverable: { reference: string }; version: number }) => [entry.deliverable.reference, entry.version])).toEqual([[made.reference, 1]])
    // The project's own status is not touched by a deliverable.
    expect((await k.w.call('GET', `/api/admin/client-projects/${k.w.project.id}`)).json.data.project.status).toBe('awaiting_start')
  })

  it('the owner can cancel a request nobody decided, and then ask again', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    const asked = await k.call('POST', k.admin('/approvals', made.id), {})
    const id = asked.json.data.approvals[0].id
    const cancelled = await k.call('POST', k.admin(`/approvals/${id}/cancel`, made.id), {})
    expect(cancelled.status).toBe(200)
    expect(cancelled.json.data.approvals[0]).toMatchObject({ state: 'cancelled', closed_by: 'admin' })
    expect(cancelled.json.data.deliverable.review_state).toBe('not_submitted')
    expect((await k.call('POST', k.admin(`/approvals/${id}/cancel`, made.id), {})).json.error.details.reason).toBe('invalid_transition')
    expect((await k.call('POST', k.admin('/approvals', made.id), {})).status).toBe(201)
    expect((await k.view(made.reference)).reviewState).toBe('awaiting_customer')
  })
})

describe('deciding', () => {
  async function asked() {
    const made = await k.make({}, true)
    const requested = await k.call('POST', k.admin('/approvals', made.id), { note: 'Please decide.' })
    const approval = requested.json.data.approvals[0]
    const version = (await k.detail(made.id)).versions[0]
    return { made, approval, version }
  }
  const approveBody = (version: { number: number; checksum: string }, approval: { revision: number }) => ({ confirm: true, versionNumber: version.number, checksum: version.checksum, revision: approval.revision })
  const approvePath = (reference: string, id: string, move: string) => k.mine(`/approvals/${id}/${move}`, reference)

  it('approves ONE EXACT version, only on an explicit confirmation: the page, the number and the fingerprint the customer saw', async () => {
    k = await makeDeliverableKit()
    const { made, approval, version } = await asked()
    for (const body of [{}, { ...approveBody(version, approval), confirm: false }, { ...approveBody(version, approval), confirm: 'yes' }, { ...approveBody(version, approval), confirm: 1 }, { versionNumber: 1, checksum: version.checksum, revision: 1 }]) {
      expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), body)).status, JSON.stringify(body)).toBe(422)
    }
    const wrongNumber = await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), { ...approveBody(version, approval), versionNumber: 2 })
    expect(wrongNumber.json.error.details.reason).toBe('version_mismatch')
    const wrongSum = await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), { ...approveBody(version, approval), checksum: 'f'.repeat(64) })
    expect(wrongSum.json.error.details.reason).toBe('version_mismatch')
    expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), { ...approveBody(version, approval), revision: 5 })).json.error.details.reason).toBe('stale')
    expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), { ...approveBody(version, approval), extra: 1 })).status).toBe(422)
    expect((await k.detail(made.id)).deliverable.review_state).toBe('awaiting_customer')
    const approved = await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), approveBody(version, approval))
    expect(approved.status, approved.text).toBe(200)
    expect(approved.json.data).toMatchObject({ reviewState: 'approved', approval: null })
    expect(approved.json.data.versions[0]).toMatchObject({ number: 1, outcome: 'approved', awaiting: false })
    const row = k.w.kit.server.db.get<Record<string, unknown>>('SELECT * FROM deliverable_approvals')!
    expect(row).toMatchObject({ state: 'approved', confirmed_version: 1, confirmed_checksum: version.checksum, decided_by_customer: k.w.anna.id })
    expect(row.decided_at).not.toBeNull()
  })

  it('viewing or opening a deliverable approves nothing, however many times', async () => {
    k = await makeDeliverableKit()
    const { made } = await asked()
    for (let round = 0; round < 3; round += 1) await k.view(made.reference)
    await k.w.anna.get(k.mine())
    await k.w.anna.get('/api/portal/overview')
    expect(k.w.kit.server.db.get<{ state: string }>('SELECT state FROM deliverable_approvals')!.state).toBe('requested')
    expect((await k.detail(made.id)).deliverable.review_state).toBe('awaiting_customer')
  })

  it('a duplicate approval is impossible: three at once approve once, a repeat is refused, and the database allows one approval per version', async () => {
    k = await makeDeliverableKit()
    const { made, approval, version } = await asked()
    const path = approvePath(made.reference, approval.id, 'approve')
    const results = await Promise.all([k.w.anna.post(path, approveBody(version, approval)), k.w.anna.post(path, approveBody(version, approval)), k.w.anna.post(path, approveBody(version, approval))])
    expect(results.map((reply) => reply.status).sort()).toEqual([200, 409, 409])
    expect(k.w.kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM deliverable_approvals WHERE state = 'approved'")!.n).toBe(1)
    await k.w.kit.settle()
    expect(k.w.kit.server.mailer.sent.filter((message) => /approved a version/.test(message.subject))).toHaveLength(1)
    expect((await k.w.anna.post(path, approveBody(version, approval))).json.error.details.reason).toBe('invalid_transition')
    expect((await k.call('POST', k.admin('/approvals', made.id), {})).json.error.details.reason).toBe('already_approved')
    const { db } = k.w.kit.server
    expect(() => db.run("INSERT INTO deliverable_approvals (id, deliverable_id, version_id, state, requested_at, decided_at, decided_by_customer, confirmed_version, confirmed_checksum, created_at, updated_at) SELECT 'again', deliverable_id, id, 'approved', 'now', 'now', 'c', 1, checksum, 'now', 'now' FROM deliverable_versions")).toThrow(ConstraintError)
  })

  it('a decided approval is final: the database refuses to change it, and it cannot be withdrawn or cancelled', async () => {
    k = await makeDeliverableKit()
    const { made, approval, version } = await asked()
    await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), approveBody(version, approval))
    expect(() => k.w.kit.server.db.run("UPDATE deliverable_approvals SET state = 'cancelled'")).toThrow(ConstraintError)
    expect(() => k.w.kit.server.db.run("UPDATE deliverable_approvals SET decision_note = 'x'")).toThrow(ConstraintError)
    expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'withdraw'), { revision: 2 })).json.error.details.reason).toBe('invalid_transition')
    expect((await k.call('POST', k.admin(`/approvals/${approval.id}/cancel`, made.id), {})).json.error.details.reason).toBe('invalid_transition')
    expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'changes'), { explanation: 'Too late.', revision: 2 })).json.error.details.reason).toBe('invalid_transition')
  })

  it('asking for changes needs an explanation the owner reads; it is final for that request, and the owner can ask again', async () => {
    k = await makeDeliverableKit()
    const { made, approval } = await asked()
    for (const body of [{ revision: 1 }, { explanation: '', revision: 1 }, { explanation: 'ab', revision: 1 }, { explanation: '   ', revision: 1 }, { explanation: 'x'.repeat(2001), revision: 1 }, { explanation: 'Fine.' }]) {
      expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'changes'), body)).status, JSON.stringify(body)).toBe(422)
    }
    const changed = await k.w.anna.post(approvePath(made.reference, approval.id, 'changes'), { explanation: 'The header needs more contrast.', revision: 1 })
    expect(changed.status, changed.text).toBe(200)
    expect(changed.json.data.reviewState).toBe('changes_requested')
    const owner = await k.detail(made.id)
    expect(owner.approvals[0]).toMatchObject({ state: 'changes_requested', decision_note: 'The header needs more contrast.' })
    expect(owner.deliverable.review_state).toBe('changes_requested')
    await k.w.kit.settle()
    const mail = k.w.kit.server.mailer.sent.filter((message) => /asked for changes/.test(message.subject))
    expect(mail).toHaveLength(1)
    expect(mail[0].text).toContain('The header needs more contrast.')
    expect((await k.call('POST', k.admin('/approvals', made.id), {})).status).toBe(201)
  })

  it('the customer may withdraw a request nobody has decided; the owner may then ask again', async () => {
    k = await makeDeliverableKit()
    const { made, approval } = await asked()
    const withdrawn = await k.w.anna.post(approvePath(made.reference, approval.id, 'withdraw'), { revision: 1 })
    expect(withdrawn.status, withdrawn.text).toBe(200)
    expect(withdrawn.json.data.reviewState).toBe('not_submitted')
    expect(k.w.kit.server.db.get<{ state: string; closed_by: string }>('SELECT state, closed_by FROM deliverable_approvals')).toEqual({ state: 'cancelled', closed_by: 'customer' })
    expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'withdraw'), { revision: 2 })).json.error.details.reason).toBe('invalid_transition')
    expect((await k.call('POST', k.admin('/approvals', made.id), {})).status).toBe(201)
  })

  it('a new version supersedes a waiting request: the old version can no longer be approved, and approving version 2 never approves version 3', async () => {
    k = await makeDeliverableKit()
    const { made, approval, version } = await asked()
    await k.next(made.id)
    const afterOne = await k.detail(made.id)
    expect(afterOne.approvals[0]).toMatchObject({ id: approval.id, state: 'superseded', closed_by: 'system' })
    expect(afterOne.deliverable.review_state).toBe('superseded')
    expect((await k.view(made.reference)).approval).toBeNull()
    const stale = await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), approveBody(version, approval))
    expect(stale.status).toBe(409)
    expect(stale.json.error.details.reason).toBe('superseded')
    expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'changes'), { explanation: 'Late words.', revision: 1 })).json.error.details.reason).toBe('superseded')
    // Version 2 is asked about and approved; version 3 is published; the approval stays with version 2 and the new one is not approved.
    const second = await k.call('POST', k.admin('/approvals', made.id), {})
    const open = second.json.data.approvals[0]
    const v2 = (await k.detail(made.id)).versions[0]
    expect((await k.w.anna.post(approvePath(made.reference, open.id, 'approve'), approveBody(v2, open))).status).toBe(200)
    const three = await k.next(made.id)
    const detail = await k.detail(made.id)
    expect(detail.deliverable).toMatchObject({ current_version: three.number, review_state: 'superseded' })
    expect(detail.approvals.filter((entry: { state: string }) => entry.state === 'approved').map((entry: { version_id: string }) => entry.version_id)).toEqual([v2.id])
    expect((await k.view(made.reference)).versions.map((entry: { number: number; outcome: string | null }) => [entry.number, entry.outcome])).toEqual([[3, null], [2, 'approved'], [1, null]])
    expect((await k.call('POST', k.admin('/approvals', made.id), {})).status).toBe(201)
  })

  it('nothing unpublished can be approved: the database refuses a request about a draft or about another deliverable’s version', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    const draft = await k.call('POST', k.admin('/versions', made.id))
    const draftId = draft.json.data.versions[0].id
    const other = await k.make({ title: 'Other' }, true)
    const { db } = k.w.kit.server
    const insert = (deliverable: string, version: string) => db.run("INSERT INTO deliverable_approvals (id, deliverable_id, version_id, state, requested_at, created_at, updated_at) VALUES (?, ?, ?, 'requested', 'now', 'now', 'now')", [`a-${Math.random()}`, deliverable, version])
    expect(() => insert(made.id, draftId)).toThrow(ConstraintError)
    expect(() => insert(made.id, other.versionId)).toThrow(ConstraintError)
    expect(() => insert(other.id, other.versionId)).not.toThrow()
  })

  it('another customer cannot decide, and a request of one deliverable cannot be used on another', async () => {
    k = await makeDeliverableKit()
    const { made, approval, version } = await asked()
    const bob = await k.w.kit.customer('bob@example.com')
    expect((await bob.post(approvePath(made.reference, approval.id, 'approve'), approveBody(version, approval))).status).toBe(404)
    const bobs = await k.w.kit.project(bob.id, { name: 'Bob site' })
    expect((await bob.post(`/api/portal/projects/${bobs.reference}/deliverables/${made.reference}/approvals/${approval.id}/approve`, approveBody(version, approval))).status).toBe(404)
    const twin = await k.make({ title: 'Twin' }, true)
    await k.call('POST', k.admin('/approvals', twin.id), {})
    expect((await k.w.anna.post(approvePath(twin.reference, approval.id, 'approve'), approveBody(version, approval))).status, 'an approval id of another deliverable').toBe(404)
    expect(k.w.kit.server.db.all<{ state: string }>('SELECT state FROM deliverable_approvals ORDER BY created_at').map((row) => row.state)).toEqual(['requested', 'requested'])
  })

  it('archiving ends a waiting request, and an archived deliverable accepts no decision', async () => {
    k = await makeDeliverableKit()
    const { made, approval, version } = await asked()
    await k.call('POST', k.admin('/archive', made.id))
    expect(k.w.kit.server.db.get<{ state: string; closed_by: string }>('SELECT state, closed_by FROM deliverable_approvals')).toEqual({ state: 'cancelled', closed_by: 'system' })
    expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), approveBody(version, approval))).status).toBe(409)
  })

  it('a finished project accepts no feedback and no decision', async () => {
    k = await makeDeliverableKit()
    const { made, approval, version } = await asked()
    await k.w.call('POST', k.w.at('/status'), { status: 'completed' })
    expect((await comment(made.reference, { body: 'Too late.' })).json.error.details.reason).toBe('project_closed')
    expect((await k.w.anna.post(approvePath(made.reference, approval.id, 'approve'), approveBody(version, approval))).json.error.details.reason).toBe('project_closed')
    expect((await k.view(made.reference)).can).toEqual({ comment: false, decide: false, follow: false })
  })
})

describe('the history', () => {
  it('records every step in order, append-only, with who, and shows the customer only their own lines and the studio’s, never the owner’s internal ones', async () => {
    k = await makeDeliverableKit()
    const made = await picture()
    await comment(made.reference, { body: 'Hello.' })
    await sendAll(made.reference)
    const root = (await k.detail(made.id)).comments[0].id as string
    await k.call('POST', k.admin(`/comments/${root}/replies`, made.id), { body: 'Hi.' })
    await k.call('POST', k.admin('/notes', made.id), { body: SECRET })
    await k.call('PATCH', k.admin('', made.id), { internalDescription: 'changed internally' })
    const asked = await k.call('POST', k.admin('/approvals', made.id), {})
    const approval = asked.json.data.approvals[0]
    const version = (await k.detail(made.id)).versions[0]
    await k.w.anna.post(k.mine(`/approvals/${approval.id}/approve`, made.reference), { confirm: true, versionNumber: 1, checksum: version.checksum, revision: 1 })
    const owner = await k.detail(made.id)
    expect(owner.events.map((event: { event_type: string }) => event.event_type).reverse()).toEqual(['deliverable_created', 'version_published', 'feedback_submitted', 'reply_posted', 'note_added', 'deliverable_edited', 'approval_requested', 'approval_approved'])
    const approvalLines = owner.events.filter((event: { approval_id: string | null }) => event.approval_id === approval.id).map((event: { event_type: string; actor_type: string; from_state: string | null; to_state: string | null }) => [event.event_type, event.actor_type, event.from_state, event.to_state]).reverse()
    expect(approvalLines).toEqual([['approval_requested', 'admin', null, 'requested'], ['approval_approved', 'customer', 'requested', 'approved']])
    const customer = (await k.view(made.reference)).history.map((line: { type: string; by: string }) => [line.type, line.by]).reverse()
    expect(customer).toEqual([['version_published', 'studio'], ['feedback_submitted', 'you'], ['reply_posted', 'studio'], ['approval_requested', 'studio'], ['approval_approved', 'you']])
    expect(JSON.stringify(customer)).not.toContain(SECRET)
    const { db } = k.w.kit.server
    expect(() => db.run("UPDATE deliverable_events SET note = 'x'")).toThrow(ConstraintError)
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliverable_events')!.n).toBe(8)
  })
})
