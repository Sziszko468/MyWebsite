import { afterEach, describe, expect, it } from 'vitest'
import { makeCommunicationKit, newToken, type CommunicationKit } from './communicationKit.ts'

/**
 * PROMPT 28: who has read what, and searching. A read marker is a message sequence, one per reader; nothing about unread is cached; a search is parameterized and scoped.
 */

let k: CommunicationKit | undefined
afterEach(async () => {
  await k?.close()
  k = undefined
})

const newest = (data: any): number => data.page.newestSeq

describe('read tracking', () => {
  it('opening a conversation marks nothing; the screen says what it has shown, and only then it is read', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'And the photos?', clientToken: newToken() })
    const summary = async () => (await k!.anna.get(k!.mine('/summary'))).json.data.unread
    expect(await summary()).toBe(2)
    const view = await k.view(reference)
    expect(view.unread).toBe(2)
    // Looking at it (a GET, any number of times) changes nothing.
    await k.view(reference)
    expect(await summary()).toBe(2)
    const marked = await k.anna.post(k.mine(`/${reference}/read`), { upTo: newest(view) })
    expect(marked.status, marked.text).toBe(200)
    expect(marked.json.data.unread).toBe(0)
    expect(await summary()).toBe(0)
    expect((await k.view(reference)).unread).toBe(0)
    expect((await k.anna.get(k.mine('?filter=unread'))).json.data.items).toHaveLength(0)
  })

  it('a marker covers only what the screen had: a message that arrived after it stays unread', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const seen = newest(await k.view(reference))
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'A second message arrived.', clientToken: newToken() })
    await k.anna.post(k.mine(`/${reference}/read`), { upTo: seen })
    const view = await k.view(reference)
    expect(view.unread).toBe(1)
    expect(view.marker).toBe(seen)
    expect((await k.anna.get(k.mine('?filter=unread'))).json.data.items.map((entry: any) => entry.reference)).toEqual([reference])
  })

  it('a marker never claims more than exists, never covers what the reader cannot see, and never moves back', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'A private note after the message.' })
    const view = await k.view(reference)
    const visible = newest(view)
    // The owner's private note has a higher sequence than anything the customer can see: a huge `upTo` stops at what they can see.
    const huge = await k.anna.post(k.mine(`/${reference}/read`), { upTo: 1_000_000 })
    expect(huge.json.data.marker).toBe(visible)
    const back = await k.anna.post(k.mine(`/${reference}/read`), { upTo: 1 })
    expect(back.json.data.marker).toBe(visible)
    for (const upTo of [-1, 1.5, '3', null, [1], {}]) expect((await k.anna.post(k.mine(`/${reference}/read`), { upTo })).status, JSON.stringify(upTo)).toBe(422)
    expect((await k.anna.post(k.mine(`/${reference}/read`), { upTo: 1, extra: 1 })).status).toBe(422)
    expect((await k.anna.post(k.mine(`/${reference}/read`), {})).status).toBe(422)
  })

  it('the customer’s own messages, the owner’s private notes, system events and removed messages are never unread for them', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    await k.anna.post(k.mine(`/${reference}/read`), { upTo: newest(await k.view(reference)) })
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'My own words.', clientToken: newToken() })
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'Private.' })
    const first = await k.adminView(reference)
    await k.call('POST', k.admin(`/${reference}/status`), { status: 'resolved', revision: first.revision })
    expect((await k.view(reference)).unread).toBe(0)
    // A removed message was never a reason to look.
    const sent = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'Oops, wrong thread.' })
    const mistaken = sent.json.data.messages.find((entry: any) => entry.body === 'Oops, wrong thread.')
    await k.call('DELETE', k.admin(`/${reference}/messages/${mistaken.id}`))
    expect((await k.view(reference)).unread).toBe(0)
  })

  it('the owner’s unread is the customer’s messages after that administrator’s own marker: two administrators have two markers', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByCustomer()
    const overview = async (as: 'admin' | 'editor') => (await k!.call('GET', k!.admin('/overview'), undefined, as)).json.data
    expect(await overview('admin')).toMatchObject({ unreadThreads: 1, unreadMessages: 1 })
    expect(await overview('editor')).toMatchObject({ unreadThreads: 1, unreadMessages: 1 })
    const view = await k.adminView(reference)
    expect(view.unread).toBe(1)
    // The administrator's own screen reports what it showed.
    const marked = await k.call('POST', k.admin(`/${reference}/read`), { upTo: newest(view) })
    expect(marked.status, marked.text).toBe(200)
    expect(await overview('admin')).toMatchObject({ unreadThreads: 0, unreadMessages: 0 })
    // The editor has read nothing.
    expect(await overview('editor')).toMatchObject({ unreadThreads: 1, unreadMessages: 1 })
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'A second question.', clientToken: newToken() })
    expect(await overview('admin')).toMatchObject({ unreadThreads: 1, unreadMessages: 1 })
    expect(await overview('editor')).toMatchObject({ unreadThreads: 1, unreadMessages: 2 })
    expect((await k.call('GET', k.admin('?filter=unread'))).json.data.items).toHaveLength(1)
  })

  it('another customer cannot move or even test somebody else’s marker', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const { customer: bela } = await k.other()
    expect((await bela.post(k.mine(`/${reference}/read`), { upTo: 5 })).status).toBe(404)
    expect(k.w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM conversation_reads')!.n).toBe(0)
    expect((await k.anna.get(k.mine('/summary'))).json.data.unread).toBe(1)
  })
})

describe('search', () => {
  it('finds a customer’s own conversations by subject, words, project and reference, and never anybody else’s or the owner’s private notes', async () => {
    k = await makeCommunicationKit()
    await k.open()
    const own = await k.startedByCustomer({ subject: 'Colours of the header', body: 'We prefer crimson.' })
    await k.call('POST', k.admin(`/${own}/messages`), { kind: 'note', body: 'INTERNAL-ONLY-WORD: price is negotiable.' })
    const { customer: bela } = await k.other()
    const foreign = await k.startedByCustomer({ subject: 'Crimson for Béla', body: 'Crimson, crimson.' }, bela)

    const find = async (term: string, as = k!.anna) => (await as.get(k!.mine(`/search?q=${encodeURIComponent(term)}`))).json.data.items.map((entry: any) => entry.reference)
    expect(await find('crimson')).toEqual([own])
    expect(await find('header')).toEqual([own])
    expect(await find(k.w.project.reference.slice(0, 8))).toEqual([])
    expect(await find(own.slice(0, 8))).toEqual([own])
    expect(await find('crimson', bela)).toEqual([foreign])
    // The owner's private note is not found by the customer, whatever they type, and never shown.
    expect(await find('INTERNAL-ONLY-WORD')).toEqual([])
    expect(await find('negotiable')).toEqual([])
    const hit = (await k.anna.get(k.mine('/search?q=crimson'))).json.data.items[0]
    expect(hit.snippet).toContain('crimson')
    expect(JSON.stringify(hit)).not.toContain('INTERNAL-ONLY')
    // A project's reference finds the conversations about that project.
    const about = await k.anna.post(k.mine(), { subject: 'The plan', body: 'Hi', context: { type: 'project', reference: k.w.project.reference }, clientToken: newToken() })
    expect(await find(k.w.project.reference)).toEqual([about.json.data.reference])
  })

  it('the administration finds the same and also the private notes and the customer’s name, and says which was a note', async () => {
    k = await makeCommunicationKit({ email: 'anna.search@example.com' })
    const reference = await k.startedByOwner({ subject: 'The next step' })
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'Remember: INTERNAL-ONLY-WORD.' })
    const search = async (term: string, as: 'admin' | 'editor' = 'admin') => (await k!.call('GET', k!.admin(`/search?q=${encodeURIComponent(term)}`), undefined, as)).json.data.items
    const byNote = await search('INTERNAL-ONLY-WORD')
    expect(byNote.map((entry: any) => entry.reference)).toEqual([reference])
    expect(byNote[0]).toMatchObject({ inNote: true })
    expect(byNote[0].snippet).toContain('INTERNAL-ONLY-WORD')
    expect((await search('anna.search')).map((entry: any) => entry.reference)).toEqual([reference])
    expect((await search('logo')).map((entry: any) => entry.reference)).toEqual([reference])
    expect((await search('nothing-like-this'))).toEqual([])
    // Inside one conversation, notes included; a stranger has no access to the endpoint.
    const within = (await k.call('GET', k.admin(`/${reference}/search?q=INTERNAL`))).json.data.items
    expect(within).toHaveLength(1)
    expect(within[0]).toMatchObject({ visibility: 'internal' })
    expect((await k.call('GET', k.admin(`/search?q=logo`), undefined, 'none')).status).toBe(401)
    expect((await k.anna.get(k.admin('/search?q=logo'))).status).toBe(401)
  })

  it('treats what is typed as text: wildcards find themselves, and a length is required', async () => {
    k = await makeCommunicationKit()
    await k.open()
    const percent = await k.startedByCustomer({ subject: 'A discount', body: 'We agreed 50% off.' })
    await k.startedByCustomer({ subject: 'Plain', body: 'Nothing special here, just words.' })
    const find = async (term: string) => (await k!.anna.get(k!.mine(`/search?q=${encodeURIComponent(term)}`))).json.data.items.map((entry: any) => entry.reference)
    expect(await find('50%')).toEqual([percent])
    expect(await find('%%')).toEqual([])
    expect(await find('_ _')).toEqual([])
    expect(await find('\\\\')).toEqual([])
    expect((await k.anna.get(k.mine('/search?q=a'))).status).toBe(422)
    expect((await k.anna.get(k.mine('/search'))).status).toBe(422)
    expect((await k.anna.get(k.mine(`/search?q=${'x'.repeat(101)}`))).status).toBe(422)
    expect((await k.anna.get(k.mine(`/search?q=${'x'.repeat(100)}`))).status).toBe(200)
    expect((await k.anna.get(k.mine('/search?q=ab%00cd'))).status).toBe(422)
  })

  it('hostile text in a query, a filter, a cursor, a reference or a number is answered as text, never as SQL, and nothing leaks', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const { customer: bela } = await k.other()
    const payloads = ["' OR '1'='1", "'; DROP TABLE conversations; --", '" OR 1=1 --', "%' UNION SELECT body FROM conversation_messages WHERE '%'='", '1; SELECT 1', "\\' --"]
    for (const payload of payloads) {
      const encoded = encodeURIComponent(payload)
      for (const path of [`/search?q=${encoded}`, `?filter=${encoded}`, `?cursor=${encoded}`, `?limit=${encoded}`, `/${encoded}`, `/${reference}?before=${encoded}`]) {
        const reply = await bela.get(k.mine(path))
        expect([200, 404, 422], `${path} -> ${reply.status}`).toContain(reply.status)
        expect(JSON.stringify(reply.json)).not.toContain('Could you send us the logo')
      }
      for (const path of [`/search?q=${encoded}`, `?filter=${encoded}`, `?customerId=${encoded}`, `?from=${encoded}`, `?context=${encoded}`, `/${encoded}`]) {
        const reply = await k.call('GET', k.admin(path))
        expect([200, 404, 422], `${path} -> ${reply.status}`).toContain(reply.status)
      }
    }
    expect(k.w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM conversations')!.n).toBeGreaterThan(0)
  }, 30_000)

  it('pages through a long list by a cursor, once each, newest first; a bad cursor or limit is refused', async () => {
    k = await makeCommunicationKit()
    const references: string[] = []
    for (let index = 0; index < 7; index += 1) references.push(await k.startedByOwner({ subject: `Topic ${index}` }))
    const seen: string[] = []
    let cursor = ''
    for (let guard = 0; guard < 6; guard += 1) {
      const page = (await k.anna.get(k.mine(`?filter=open&limit=3${cursor}`))).json.data
      seen.push(...page.items.map((entry: any) => entry.reference))
      if (!page.next) break
      cursor = `&cursor=${encodeURIComponent(page.next)}`
    }
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
    expect([...seen].sort()).toEqual([...references].sort())
    expect((await k.anna.get(k.mine('?cursor=nonsense'))).status).toBe(422)
    expect((await k.anna.get(k.mine('?limit=0'))).status).toBe(422)
    expect((await k.anna.get(k.mine('?limit=abc'))).status).toBe(422)
    expect((await k.anna.get(k.mine('?limit=5000'))).json.data.items.length).toBeLessThanOrEqual(50)
    const messages = (await k.anna.get(k.mine(`/${references[0]}?limit=1`))).json.data
    expect(messages.messages.length).toBe(1)
    expect((await k.anna.get(k.mine(`/${references[0]}?before=0`))).status).toBe(422)
  })

  it('filters the owner’s inbox by status, customer, project, context and date', async () => {
    k = await makeCommunicationKit()
    const waiting = await k.startedByOwner({ subject: 'Waiting for the customer' })
    const answered = await k.startedByCustomer({ subject: 'Waiting for the owner' })
    const resolvedRef = await k.startedByOwner({ subject: 'To resolve' })
    const detail = await k.adminView(resolvedRef)
    await k.call('POST', k.admin(`/${resolvedRef}/status`), { status: 'resolved', revision: detail.revision })
    const { customer: bela } = await k.other()
    const foreign = await k.startedByCustomer({ subject: 'Béla asks' }, bela)
    const refs = async (query: string) => (await k!.call('GET', k!.admin(query))).json.data.items.map((entry: any) => entry.reference).sort()
    expect(await refs('?filter=waiting_customer')).toEqual([waiting, resolvedRef].filter((entry) => entry !== resolvedRef).sort())
    expect(await refs('?filter=waiting_owner')).toEqual([answered, foreign].sort())
    expect(await refs('?filter=resolved')).toEqual([resolvedRef])
    expect(await refs('?filter=archived')).toEqual([])
    expect(await refs('?filter=open')).toEqual([waiting, answered, foreign].sort())
    expect(await refs(`?customerId=${bela.id}`)).toEqual([foreign])
    expect(await refs('?context=project')).toEqual([])
    expect(await refs('?from=2000-01-01&to=2000-01-02')).toEqual([])
    expect((await refs('?from=2000-01-01')).length).toBe(4)
    expect((await k.call('GET', k.admin('?from=2026-13-40'))).status).toBe(422)
    expect((await k.call('GET', k.admin('?from=2026-02-02&to=2026-01-01'))).status).toBe(422)
    expect((await k.call('GET', k.admin('?context=nonsense'))).status).toBe(422)
    expect((await k.call('GET', k.admin('?filter=nonsense'))).status).toBe(422)
    expect((await k.call('GET', k.admin(`?projectId=${k.w.project.id}`))).json.data.items).toEqual([])
    const overview = (await k.call('GET', k.admin('/overview'))).json.data
    expect(overview).toMatchObject({ open: 3, waitingOwner: 2, waitingCustomer: 1, resolved: 1, archived: 0 })
    expect(overview.recent).toHaveLength(4)
    expect(overview.settings).toMatchObject({ customerCanStart: true })
  }, 30_000)
})
