import { readFileSync } from 'node:fs'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { messagesText } from '../../content/portal/messages'
import { I18nProvider } from '../../i18n/I18nProvider'
import type { Language } from '../../i18n/config'
import type { ConversationDetail, ConversationMessage, ConversationSummary } from '../../portal/api'
import { formatZoned } from '../../utils/format'
import { Card, ConversationPage } from './MessagesViews'

/**
 * PROMPT 28, the customer's messages rendered with what the server sends: an inbox card says who wrote last and what is unread, an event is a line and not a bubble, a removed
 * message shows that it was removed and not what it said, nothing can be written in an archived conversation or in the activity feed, and every sentence exists in three languages.
 */

const AT = '2026-11-03T10:00:00.000Z'
const noop = () => undefined

const summary = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  reference: 'MSG-TEST0001', kind: 'thread', subject: 'About the logo', status: 'waiting_customer', project: { reference: 'PRJ-1', name: 'Bakery website' }, context: null, lastMessageAt: AT, lastActivityAt: AT,
  lastSender: 'studio', preview: 'Could you send us the logo?', removed: false, unread: 0, resolutionRequested: false, ...over,
})

const message = (seq: number, over: Partial<ConversationMessage> = {}): ConversationMessage => ({ id: `m${seq}`, seq, type: 'text', from: 'studio', body: `Words ${seq}`, removed: false, important: false, event: null, createdAt: AT, feed: false, ...over })

const detail = (over: Partial<ConversationDetail> = {}): ConversationDetail => ({
  reference: 'MSG-TEST0001', kind: 'thread', subject: 'About the logo', status: 'waiting_customer', project: { reference: 'PRJ-1', name: 'Bakery website' }, context: null, lastMessageAt: AT, lastActivityAt: AT, unread: 0,
  resolutionRequested: false, startedBy: 'admin', createdAt: AT, messages: [message(1), message(2, { from: 'you', body: 'My answer.' })], page: { hasOlder: false, oldestSeq: 1, newestSeq: 2 }, marker: 2,
  can: { reply: true, requestResolution: true }, ...over,
})

const frame = (node: ReactElement, lang: Language): string =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/${lang}/client-portal/messages`] }, h(I18nProvider, { lang, children: node })))
const card = (entry: ConversationSummary, lang: Language = 'en') => frame(h('ul', null, h(Card, { entry })), lang)
const page = (value: ConversationDetail, lang: Language = 'en') => frame(h(ConversationPage, { detail: value, apply: noop, reference: value.reference }), lang)

describe('an inbox card', () => {
  it('says the subject (as a link), the state in words, who wrote last, the project and what is unread', () => {
    const html = card(summary({ unread: 2 }))
    expect(html).toContain('About the logo')
    expect(html).toContain('href="/en/client-portal/messages/MSG-TEST0001"')
    expect(html).toContain('Waiting for you')
    expect(html).toContain('We wrote')
    expect(html).toContain('Project: Bakery website')
    expect(html).toContain('Unread: 2')
    expect(html).toContain('Could you send us the logo?')
    expect(card(summary({ unread: 0 }))).not.toContain('Unread:')
  })

  it('shows words as text (markup is never run), says when the last message was removed, and never shows the words of one', () => {
    expect(card(summary({ preview: '<img src=x onerror=alert(1)>' }))).toContain('&lt;img src=x onerror=alert(1)&gt;')
    const removed = card(summary({ preview: null, removed: true }))
    expect(removed).toContain('A message was removed.')
  })

  it('is told in the customer’s language', () => {
    expect(card(summary(), 'hu')).toContain('Rád vár')
    expect(card(summary(), 'nl')).toContain('Wacht op jou')
  })

  it('names the activity feed by its project, says it is the system’s, and has no status', () => {
    const html = card(summary({ kind: 'activity', subject: null, status: 'open', lastSender: null, preview: null }))
    expect(html).toContain('Project activity: Bakery website')
    expect(html).toContain('The system writes here')
    expect(html).not.toContain('Waiting for')
  })
})

describe('a conversation', () => {
  it('is a log of messages in order, each with who wrote it and when, and a form to answer', () => {
    const html = page(detail())
    expect(html).toContain('role="log"')
    expect(html).toContain('aria-live="polite"')
    expect(html.indexOf('Words 1')).toBeLessThan(html.indexOf('My answer.'))
    expect(html).toMatch(/<strong>Us<\/strong>/)
    expect(html).toMatch(/<strong>You<\/strong>/)
    expect(html).toContain('<time dateTime="2026-11-03T10:00:00.000Z">')
    expect(html).toContain('id="message-text"')
    expect(html).toMatch(/<label[^>]*for="message-text"/)
    expect(html).toContain('You cannot attach a file here')
  })

  it('marks an announcement and an important message, shows a removed one as removed, and a system event as a line in its own words', () => {
    const html = page(
      detail({
        messages: [
          message(1, { type: 'announcement', body: 'We are closed on Friday.' }),
          message(2, { important: true, body: 'Please look today.' }),
          message(3, { removed: true, body: null }),
          message(4, { type: 'system_event', from: 'system', body: null, event: { key: 'project.status_changed', params: { status: 'design' } } }),
          message(5, { type: 'system_event', from: 'system', body: null, event: { key: 'consultation.confirmed', params: { reference: 'BK-2026-000001', at: '2026-11-04T08:00:00.000Z', zone: 'Europe/Budapest' } } }),
        ],
        page: { hasOlder: false, oldestSeq: 1, newestSeq: 5 },
      }),
    )
    expect(html).toContain('Announcement')
    expect(html).toContain('We are closed on Friday.')
    expect(html).toContain('Important')
    expect(html).toContain('This message was removed.')
    expect(html).toContain('The project status changed: Design.')
    expect(html).toContain('We confirmed your consultation BK-2026-000001')
    expect(html).toContain('9:00')
    expect(html.match(/<li class="[^"]*event/g)).toHaveLength(2)
  })

  it('takes no message in an archived conversation or in the activity feed, and says why', () => {
    const archived = page(detail({ status: 'archived', can: { reply: false, requestResolution: false } }))
    expect(archived).not.toContain('id="message-text"')
    expect(archived).toContain('This conversation was archived')
    const feed = page(detail({ kind: 'activity', subject: null, status: 'open', can: { reply: false, requestResolution: false } }))
    expect(feed).not.toContain('id="message-text"')
    expect(feed).toContain('read-only list')
  })

  it('offers to ask for a resolution only when it can, and says when it was asked; a resolved conversation says it opens again', () => {
    expect(page(detail())).toContain('Ask to resolve')
    expect(page(detail({ can: { reply: true, requestResolution: false } }))).not.toContain('Ask to resolve')
    expect(page(detail({ can: { reply: true, requestResolution: false }, resolutionRequested: true }))).toContain('You asked for this to be resolved')
    expect(page(detail({ status: 'resolved' }))).toContain('If you write again, it opens')
  })

  it('offers earlier messages only when there are some, and links the thing it is about', () => {
    expect(page(detail())).not.toContain('Earlier messages')
    expect(page(detail({ page: { hasOlder: true, oldestSeq: 5, newestSeq: 9 } }))).toContain('Earlier messages')
    const about = page(detail({ context: { type: 'deliverable', reference: 'DLV-1', title: 'Home page design' } }))
    expect(about).toContain('About: Home page design')
    expect(about).toContain('href="/en/client-portal/projects/PRJ-1/deliverables/DLV-1"')
  })
})

describe('the words', () => {
  it('has a sentence for every system event the server can write, in all three languages, and nothing is left as a placeholder', () => {
    const model = readFileSync(new URL('../../../server/src/modules/communications/model.ts', import.meta.url), 'utf8')
    const keys = /EVENT_KEYS = \[([\s\S]*?)\] as const/.exec(model)![1].match(/'([a-z_.]+)'/g)!.map((entry) => entry.slice(1, -1))
    expect(Object.keys(messagesText.events).filter((key) => key !== 'fallback').sort()).toEqual([...keys].sort())
    for (const lang of ['hu', 'en', 'nl'] as const) {
      const html = page(
        detail({
          messages: keys.map((key, index) => message(index + 1, { type: 'system_event', from: 'system', body: null, event: { key, params: { name: 'N', status: 'design', title: 'T', version: 2, reference: 'R-1', at: AT, zone: 'Europe/Budapest', count: 1 } } })),
          page: { hasOlder: false, oldestSeq: 1, newestSeq: keys.length },
        }),
        lang,
      )
      expect(html, lang).not.toMatch(/\{[a-z]+\}/i)
      expect(html, lang).not.toContain('Something happened')
    }
    expect(page(detail(), 'hu')).toContain('Üzenet küldése')
    expect(page(detail(), 'nl')).toContain('Bericht versturen')
  })

  it('writes a moment in the zone it names, not the visitor’s', () => {
    expect(formatZoned('2026-11-04T08:00:00.000Z', 'Europe/Budapest', 'en')).toContain('9:00')
    expect(formatZoned('2026-11-04T08:00:00.000Z', 'America/New_York', 'en')).toContain('3:00')
    expect(formatZoned('2026-11-04T08:00:00.000Z', 'Not/AZone', 'en')).toMatch(/2026/)
  })
})
