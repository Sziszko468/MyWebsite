import { afterEach, describe, expect, it } from 'vitest'
import { makeCommunicationKit, newToken, type CommunicationKit } from './communicationKit.ts'

/**
 * PROMPT 28: the conversation and its rules. Everything goes through the real endpoints; the database is read only to prove what an endpoint was not asked to show.
 */

let k: CommunicationKit | undefined
afterEach(async () => {
  await k?.close()
  k = undefined
})

const bodies = (data: any) => data.messages.map((entry: any) => entry.body)

describe('who may start a conversation', () => {
  it('the owner starts one and the customer sees it; a customer cannot start one until the owner opens that', async () => {
    k = await makeCommunicationKit()
    const closed = await k.anna.post(k.mine(), { subject: 'Hello', body: 'Can I ask something?', clientToken: newToken() })
    expect(closed.status).toBe(409)
    expect(closed.json.error.details.reason).toBe('start_closed')
    expect((await k.anna.get(k.mine('/summary'))).json.data.canStart).toBe(false)

    const reference = await k.startedByOwner()
    // (The project's own creation is in the feed, which is listed with the threads.)
    const inbox = (await k.anna.get(k.mine())).json.data
    const threads = inbox.items.filter((entry: any) => entry.kind === 'thread')
    expect(threads).toHaveLength(1)
    expect(inbox.items.filter((entry: any) => entry.kind === 'activity')).toHaveLength(1)
    expect(threads[0]).toMatchObject({ reference, kind: 'thread', subject: 'The next step', status: 'waiting_customer', unread: 1, lastSender: 'studio', project: null })

    await k.open()
    expect((await k.anna.get(k.mine('/summary'))).json.data.canStart).toBe(true)
    const started = await k.startedByCustomer()
    expect((await k.view(started)).status).toBe('waiting_owner')
  })

  it('a conversation can be about a project, a deliverable, a task, a booking or a quote request of the customer’s own, and about nothing else', async () => {
    k = await makeCommunicationKit()
    await k.open()
    const stranger = await k.other()
    const task = await k.w.task({ title: 'Send the logo', customerVisible: true })
    const hidden = await k.w.task({ title: 'Internal checks' })
    const options = (await k.anna.get(k.mine('/contexts'))).json.data.items
    expect(options.map((entry: any) => entry.type)).toContain('project')
    expect(options.find((entry: any) => entry.reference === task.reference)).toBeTruthy()
    expect(options.find((entry: any) => entry.reference === hidden.reference)).toBeUndefined()

    const about = await k.anna.post(k.mine(), { subject: 'About the project', body: 'Hello', context: { type: 'project', reference: k.w.project.reference }, clientToken: newToken() })
    expect(about.status, about.text).toBe(201)
    expect(about.json.data.project).toMatchObject({ reference: k.w.project.reference })
    expect(about.json.data.context).toMatchObject({ type: 'project', reference: k.w.project.reference })
    const aboutTask = await k.anna.post(k.mine(), { subject: 'About a task', body: 'Hello', context: { type: 'task', reference: task.reference }, clientToken: newToken() })
    expect(aboutTask.status).toBe(201)
    expect(aboutTask.json.data.project.reference).toBe(k.w.project.reference)

    // Somebody else's project, a task nobody shared, and a made-up record: the same refusal.
    for (const context of [{ type: 'project', reference: stranger.project.reference }, { type: 'task', reference: hidden.reference }, { type: 'deliverable', reference: 'DLV-NOPE0000' }, { type: 'booking', reference: 'BK-2026-000001' }, { type: 'quote', reference: 'CC-2026-000001' }]) {
      const refused = await k.anna.post(k.mine(), { subject: 'No', body: 'No', context, clientToken: newToken() })
      expect(refused.status, JSON.stringify(context)).toBe(422)
    }
  })

  it('validates what is written: a subject and words are needed, are not too long, and carry no control characters', async () => {
    k = await makeCommunicationKit()
    await k.open()
    const start = (body: Record<string, unknown>) => k!.anna.post(k!.mine(), { subject: 'Hello', body: 'Hi', clientToken: newToken(), ...body })
    expect((await start({ subject: '   ' })).status).toBe(422)
    expect((await start({ body: '' })).status).toBe(422)
    expect((await start({ body: 'x'.repeat(4001) })).status).toBe(422)
    expect((await start({ subject: 'x'.repeat(201) })).status).toBe(422)
    // Control characters are stripped from what is written, not stored.
    const stripped = await start({ body: 'a\u0000b' })
    expect(stripped.status).toBe(201)
    expect(stripped.json.data.messages.at(-1).body).toBe('ab')
    expect((await start({ clientToken: 'short' })).status).toBe(422)
    expect((await start({ extra: true })).status).toBe(422)
    expect((await start({ body: 'x'.repeat(4000) })).status).toBe(201)
  })

  it('a customer cannot leave more than ten conversations waiting for an answer', async () => {
    k = await makeCommunicationKit()
    await k.open()
    for (let index = 0; index < 10; index += 1) expect((await k.anna.post(k.mine(), { subject: `Q${index}`, body: 'Hi', clientToken: newToken() })).status).toBe(201)
    const eleventh = await k.anna.post(k.mine(), { subject: 'One more', body: 'Hi', clientToken: newToken() })
    expect(eleventh.status).toBe(409)
    expect(eleventh.json.error.details.reason).toBe('too_many')
  })
})

describe('the status follows who is expected to answer', () => {
  it('customer writes: waiting for the owner; the owner writes: waiting for the customer; each in turn, with the words in order', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    expect((await k.view(reference)).status).toBe('waiting_customer')
    const sent = await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Here is the logo.', clientToken: newToken() })
    expect(sent.status, sent.text).toBe(201)
    expect(sent.json.data.status).toBe('waiting_owner')
    const answered = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'Thank you.', clientToken: newToken() })
    expect(answered.status, answered.text).toBe(201)
    expect(answered.json.data.status).toBe('waiting_customer')
    const view = await k.view(reference)
    expect(bodies(view)).toEqual(['Could you send us the logo?', 'Here is the logo.', 'Thank you.'])
    expect(view.messages.map((entry: any) => entry.from)).toEqual(['studio', 'you', 'studio'])
  })

  it('an announcement and a private note change nothing about who is expected to answer', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Done.', clientToken: newToken() })
    const before = await k.adminView(reference)
    expect(before.status).toBe('waiting_owner')
    expect((await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'Remember to invoice.' })).status).toBe(201)
    expect((await k.adminView(reference)).status).toBe('waiting_owner')
    expect((await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'announcement', body: 'We are closed on Friday.', confirm: true })).status).toBe(201)
    expect((await k.adminView(reference)).status).toBe('waiting_owner')
  })

  it('the owner sets any status by hand; a stale screen and the same status are refused; the customer cannot', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const first = await k.adminView(reference)
    const resolved = await k.call('POST', k.admin(`/${reference}/status`), { status: 'resolved', revision: first.revision })
    expect(resolved.status, resolved.text).toBe(200)
    expect(resolved.json.data.status).toBe('resolved')
    const stale = await k.call('POST', k.admin(`/${reference}/status`), { status: 'archived', revision: first.revision })
    expect(stale.status).toBe(409)
    expect(stale.json.error.details.reason).toBe('stale')
    const same = await k.call('POST', k.admin(`/${reference}/status`), { status: 'resolved', revision: resolved.json.data.revision })
    expect(same.status).toBe(409)
    expect((await k.call('POST', k.admin(`/${reference}/status`), { status: 'nonsense', revision: resolved.json.data.revision })).status).toBe(422)
    // An editor may (it is the work of a project); the customer has no such door.
    expect((await k.call('POST', k.admin(`/${reference}/status`), { status: 'open', revision: resolved.json.data.revision }, 'editor')).status).toBe(200)
    expect((await k.anna.post(k.mine(`/${reference}/status`), { status: 'resolved' })).status).toBe(404)
  })

  it('a resolved conversation is reopened by the customer’s next message, and an archived one takes none until the owner reopens it', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const first = await k.adminView(reference)
    await k.call('POST', k.admin(`/${reference}/status`), { status: 'resolved', revision: first.revision })
    const view = await k.view(reference)
    expect(view.status).toBe('resolved')
    expect(view.messages.at(-1)).toMatchObject({ type: 'system_event', from: 'system', event: { key: 'conversation.resolved' } })
    const again = await k.anna.post(k.mine(`/${reference}/messages`), { body: 'One more thing.', clientToken: newToken() })
    expect(again.status).toBe(201)
    expect(again.json.data.status).toBe('waiting_owner')
    expect(again.json.data.messages.map((entry: any) => entry.event?.key ?? 'text')).toEqual(['text', 'conversation.resolved', 'conversation.reopened', 'text'])

    const now = await k.adminView(reference)
    await k.call('POST', k.admin(`/${reference}/status`), { status: 'archived', revision: now.revision })
    const refused = await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Still there?', clientToken: newToken() })
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('archived')
    expect((await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'Hello?' })).status).toBe(409)
    // A private note is allowed in an archived conversation: it is a record for the owner.
    expect((await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'Archived on purpose.' })).status).toBe(201)
  })

  it('the customer can ask for a resolution once; it is a request, not a status, and the owner decides', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const asked = await k.anna.post(k.mine(`/${reference}/request-resolution`), {})
    expect(asked.status, asked.text).toBe(200)
    expect(asked.json.data.resolutionRequested).toBe(true)
    expect(asked.json.data.status).toBe('waiting_customer')
    expect(asked.json.data.can.requestResolution).toBe(false)
    const twice = await k.anna.post(k.mine(`/${reference}/request-resolution`), {})
    expect(twice.status).toBe(200)
    expect(twice.json.data.messages.filter((entry: any) => entry.event?.key === 'conversation.resolution_requested')).toHaveLength(1)
    expect((await k.adminView(reference)).resolutionRequested).toBe(true)
    // Setting the status by hand answers the request.
    const view = await k.adminView(reference)
    await k.call('POST', k.admin(`/${reference}/status`), { status: 'resolved', revision: view.revision })
    expect((await k.adminView(reference)).resolutionRequested).toBe(false)
    expect((await k.anna.post(k.mine(`/${reference}/request-resolution`), {})).status).toBe(409)
  })
})

describe('what an owner may write', () => {
  it('an announcement needs the owner’s confirmation, is marked, and important is for a reply only', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const unconfirmed = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'announcement', body: 'Closed on Friday.' })
    expect(unconfirmed.status).toBe(422)
    const confirmed = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'announcement', body: 'Closed on Friday.', confirm: true })
    expect(confirmed.status).toBe(201)
    expect((await k.view(reference)).messages.at(-1)).toMatchObject({ type: 'announcement', from: 'studio', body: 'Closed on Friday.' })
    const important = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'Please look at this today.', important: true })
    expect(important.status).toBe(201)
    expect((await k.view(reference)).messages.at(-1)).toMatchObject({ important: true })
    expect((await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'announcement', body: 'x', confirm: true, important: true })).status).toBe(422)
    expect((await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'x', important: true })).status).toBe(422)
  })

  it('a customer’s message is never removed or edited; the owner removes their own message (the customer sees that it was removed) and edits their own private note', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const sent = await k.anna.post(k.mine(`/${reference}/messages`), { body: 'My words stay.', clientToken: newToken() })
    expect(sent.status).toBe(201)
    const view = await k.adminView(reference)
    const customerMessage = view.messages.find((entry: any) => entry.body === 'My words stay.')
    const ownerMessage = view.messages.find((entry: any) => entry.body === 'Could you send us the logo?')
    expect((await k.call('DELETE', k.admin(`/${reference}/messages/${customerMessage.id}`))).status).toBe(404)
    expect((await k.call('PATCH', k.admin(`/${reference}/messages/${customerMessage.id}`), { body: 'Changed.' })).status).toBe(404)
    expect((await k.anna.del(k.mine(`/${reference}/messages/${customerMessage.id}`))).status).toBe(404)
    // The owner's own customer-visible message cannot be edited (a correction is a new message) but can be removed.
    expect((await k.call('PATCH', k.admin(`/${reference}/messages/${ownerMessage.id}`), { body: 'Changed.' })).status).toBe(409)
    const removed = await k.call('DELETE', k.admin(`/${reference}/messages/${ownerMessage.id}`))
    expect(removed.status, removed.text).toBe(200)
    const customerView = await k.view(reference)
    expect(customerView.messages.find((entry: any) => entry.id === ownerMessage.id)).toMatchObject({ removed: true, body: null })
    expect(JSON.stringify(customerView)).not.toContain('Could you send us the logo?')
    expect((await k.adminView(reference)).messages.find((entry: any) => entry.id === ownerMessage.id)).toMatchObject({ removed: true, body: null })
    // The words stay in the record.
    expect(k.w.kit.server.db.get<{ body: string }>('SELECT body FROM conversation_messages WHERE id = ?', [ownerMessage.id])!.body).toBe('Could you send us the logo?')

    const note = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'First thought.' })
    const noteId = note.json.data.messages.find((entry: any) => entry.visibility === 'internal').id
    const edited = await k.call('PATCH', k.admin(`/${reference}/messages/${noteId}`), { body: 'Second thought.' })
    expect(edited.status, edited.text).toBe(200)
    expect(edited.json.data.messages.find((entry: any) => entry.id === noteId)).toMatchObject({ body: 'Second thought.', edited: true, mine: true })
    // Another administrator may not touch it.
    expect((await k.call('PATCH', k.admin(`/${reference}/messages/${noteId}`), { body: 'Not yours.' }, 'editor')).status).toBe(404)
    expect((await k.call('DELETE', k.admin(`/${reference}/messages/${noteId}`), undefined, 'editor')).status).toBe(404)
  })

  it('sending the same message twice (a double click, a retry, a second tab) stores it once', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const token = newToken()
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => k!.anna.post(k!.mine(`/${reference}/messages`), { body: 'Only once, please.', clientToken: token })))
    for (const result of results) expect(result.status, result.text).toBe(201)
    const view = await k.view(reference)
    expect(bodies(view).filter((entry: string) => entry === 'Only once, please.')).toHaveLength(1)
    // And a thread started twice with one token is one thread.
    await k.open()
    const start = newToken()
    const twice = await Promise.all([1, 2, 3].map(() => k!.anna.post(k!.mine(), { subject: 'Twice?', body: 'Hello', clientToken: start })))
    expect(new Set(twice.map((entry) => entry.json.data.reference)).size).toBe(1)
    expect(k.w.kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM conversations WHERE subject = 'Twice?'")!.n).toBe(1)
  })

  it('concurrent messages all arrive, each once, in a strict order', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const sends = await Promise.all(Array.from({ length: 12 }, (_, index) => k!.anna.post(k!.mine(`/${reference}/messages`), { body: `Message ${index}`, clientToken: newToken() })))
    for (const sent of sends) expect(sent.status, sent.text).toBe(201)
    const rows = k.w.kit.server.db.all<{ seq: number; body: string }>("SELECT seq, body FROM conversation_messages WHERE sender_type = 'customer' ORDER BY seq")
    expect(rows).toHaveLength(12)
    expect(new Set(rows.map((row) => row.seq)).size).toBe(12)
    expect(new Set(rows.map((row) => row.body)).size).toBe(12)
  })
})

describe('the activity feed', () => {
  it('is read only for everybody: nobody writes in it', async () => {
    k = await makeCommunicationKit()
    // Changing the project's status is a real fact; it is mirrored into the customer's feed.
    const changed = await k.call('POST', `/api/admin/client-projects/${k.w.project.id}/status`, { status: 'design' })
    expect(changed.status, changed.text).toBe(200)
    const feed = (await k.anna.get(k.mine('?filter=all'))).json.data.items.find((entry: any) => entry.kind === 'activity')
    expect(feed).toBeTruthy()
    expect(feed.subject).toBeNull()
    const view = await k.view(feed.reference)
    expect(view.can).toEqual({ reply: false, requestResolution: false })
    expect(view.messages.map((entry: any) => entry.event?.key)).toEqual(['project.created', 'project.status_changed'])
    expect(view.messages[1]).toMatchObject({ type: 'system_event', from: 'system', body: null, event: { params: { status: 'design' } } })
    const write = await k.anna.post(k.mine(`/${feed.reference}/messages`), { body: 'Hello feed', clientToken: newToken() })
    expect(write.status).toBe(409)
    expect(write.json.error.details.reason).toBe('read_only')
    expect((await k.anna.post(k.mine(`/${feed.reference}/request-resolution`), {})).status).toBe(404)
    // The administration lists conversations people write in; a feed is not one, and cannot be opened as one.
    expect((await k.call('GET', k.admin(`/${feed.reference}`))).status).toBe(404)
    expect((await k.call('POST', k.admin(`/${feed.reference}/messages`), { kind: 'note', body: 'x' })).status).toBe(404)
  })
})
