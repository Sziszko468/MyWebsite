import { readFileSync } from 'node:fs'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Message } from '../api/communications'
import { AdminTextProvider } from '../i18n'
import { communicationsEn, communicationsHu } from '../i18n/communications'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { NAVIGATION } from '../components/navigation'
import { Entry } from './CommunicationPage'

/**
 * PROMPT 28, the administration's side of a conversation, rendered in its own providers: a private note looks different from a message to the customer in more than colour,
 * only the owner's own words offer to be removed (and only their own notes to be edited), a removed message never shows its words, and the two dictionaries say the same things
 * (same keys, same placeholders) and name the same events and refusals as the server.
 */

const render = (node: ReactElement, language: 'en' | 'hu' = 'en'): string => renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language, children: node })))
const noop = () => undefined
const AT = '2026-11-03T10:00:00.000Z'

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm1', seq: 1, type: 'text', visibility: 'customer', from: 'owner', adminEmail: 'owner@example.test', mine: true, body: 'Hello <b>there</b>', removed: false, edited: false, important: false, event: null, createdAt: AT, feed: false, ...over,
})
const entry = (value: Message, editing = false, language: 'en' | 'hu' = 'en') => render(h('ol', null, h(Entry, { message: value, busy: null, editing, onEdit: noop, onRemove: noop, onCancel: noop, onSave: noop })), language)

describe('a message in the timeline', () => {
  it('shows the customer’s words and the owner’s apart, as text, with who wrote them', () => {
    const owner = entry(message())
    expect(owner).toContain('Hello &lt;b&gt;there&lt;/b&gt;')
    expect(owner).toContain('data-from="owner"')
    expect(owner).toContain('You')
    const customer = entry(message({ from: 'customer', mine: false, adminEmail: null, body: 'A question.' }))
    expect(customer).toContain('The customer')
    expect(customer).toContain('data-from="customer"')
  })

  it('shows a private note in its own look and says in words that the customer never sees it', () => {
    const note = entry(message({ visibility: 'internal', body: 'Remember to invoice.' }))
    expect(note).toContain('data-visibility="internal"')
    expect(note).toContain('Private note')
    expect(note).toContain('Only you and your team see this')
    expect(note).toContain('Remember to invoice.')
    expect(entry(message({ visibility: 'customer' }))).not.toContain('Private note')
    expect(entry(message({ visibility: 'internal', body: 'Notitie' }), false, 'hu')).toContain('Privát jegyzet')
  })

  it('offers removal for the owner’s own messages and editing for their own notes only, never for the customer’s', () => {
    const own = entry(message())
    expect(own).toContain('Remove')
    expect(own).not.toContain('>Edit<')
    const ownNote = entry(message({ visibility: 'internal' }))
    expect(ownNote).toContain('Remove')
    expect(ownNote).toContain('Edit')
    const colleague = entry(message({ mine: false, adminEmail: 'editor@example.test' }))
    expect(colleague).not.toContain('Remove')
    expect(colleague).toContain('editor@example.test')
    const customer = entry(message({ from: 'customer', mine: false, adminEmail: null }))
    expect(customer).not.toContain('Remove')
    expect(customer).not.toContain('Edit')
  })

  it('opens a form for a note being edited, and shows a removed message as removed without its words', () => {
    const editing = entry(message({ visibility: 'internal', body: 'First thought.' }), true)
    expect(editing).toContain('<textarea')
    expect(editing).toContain('First thought.')
    expect(editing).toContain('Save the note')
    const removed = entry(message({ removed: true, body: null }))
    expect(removed).toContain('This message was removed')
    expect(removed).not.toContain('Hello')
    expect(removed).not.toContain('Remove</button>')
  })

  it('shows an announcement and an important message as such, and a system event as a line in the owner’s language', () => {
    const marked = entry(message({ type: 'announcement', important: false, body: 'Closed on Friday.' }))
    expect(marked).toContain('Announcement')
    expect(entry(message({ important: true }))).toContain('Important')
    const event = entry(message({ type: 'system_event', from: 'system', body: null, event: { key: 'deliverable.approved', params: { title: 'Home page', version: 2 } } }))
    expect(event).toContain('The customer approved version 2 of “Home page”.')
    expect(entry(message({ type: 'system_event', from: 'system', body: null, event: { key: 'deliverable.approved', params: { title: 'Főoldal', version: 2 } } }), false, 'hu')).toContain('Az ügyfél jóváhagyta a(z) „Főoldal” 2. verzióját.')
    expect(event.match(/<li class="[^"]*event/g)).toHaveLength(1)
  })
})

const flatten = (value: unknown, path = ''): Array<[string, string]> =>
  typeof value === 'string' ? [[path, value]] : Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => flatten(inner, path ? `${path}.${key}` : key))
const placeholders = (text: string): string[] => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort()

describe('the two dictionaries', () => {
  const english = flatten(communicationsEn)
  const hungarian = new Map(flatten(communicationsHu))

  it('have the same keys, no empty text, and the same placeholders in each text', () => {
    expect(Array.from(hungarian.keys()).sort()).toEqual(english.map(([key]) => key).sort())
    for (const [key, text] of english) {
      expect(text.trim(), key).not.toBe('')
      expect(hungarian.get(key)!.trim(), key).not.toBe('')
      expect(placeholders(hungarian.get(key)!), key).toEqual(placeholders(text))
    }
  })

  it('are part of the administration, with a place in the navigation that has a screen', () => {
    expect(en.communications).toBe(communicationsEn)
    expect(hu.communications).toBe(communicationsHu)
    expect(NAVIGATION.find((item) => item.id === 'communications')).toMatchObject({ path: '/communications' })
    expect(en.nav.communications).toBeTruthy()
    expect(hu.nav.communications).toBeTruthy()
  })

  it('name the same system events, owner’s switches and refusals as the server', () => {
    const model = readFileSync(new URL('../../../server/src/modules/communications/model.ts', import.meta.url), 'utf8')
    const events = /EVENT_KEYS = \[([\s\S]*?)\] as const/.exec(model)![1].match(/'([a-z_.]+)'/g)!.map((value) => value.slice(1, -1))
    expect(Object.keys(communicationsEn.events).filter((key) => key !== 'fallback').sort()).toEqual([...events].sort())
    const settings = /export interface CommunicationSettings \{([\s\S]*?)\n\}/.exec(model)![1].match(/^\s{2}(\w+):/gm)!.map((value) => value.trim().replace(':', ''))
    expect(Object.keys(communicationsEn.settings.choices).sort()).toEqual([...settings].sort())
    const service = readFileSync(new URL('../../../server/src/modules/communications/service.ts', import.meta.url), 'utf8')
    const reasons = new Set([...service.matchAll(/refuse\([^)]*?, '([a-z_]+)'\)/g)].map((match) => match[1]))
    expect(reasons.size).toBeGreaterThan(5)
    // `too_many` is the customer's own refusal (they start too many conversations); the administration never starts one on their behalf.
    for (const reason of reasons) if (reason !== 'too_many') expect(Object.keys(communicationsEn.refused), reason).toContain(reason)
  })
})
