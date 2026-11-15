import { readFileSync } from 'node:fs'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Approval, Comment, Deliverable, DeliverableSettings, Version } from '../api/deliverables'
import { AdminTextProvider } from '../i18n'
import { deliverablesEn, deliverablesHu } from '../i18n/deliverables'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { ApprovalLine, Thread, VersionCard } from './DeliverablePage'

/**
 * PROMPT 27, the administration's side of the deliverables, rendered in its own providers: a published version is never editable (no form, no publish), a draft shows what the
 * customer will see before it is published, a thread says where its marker is in words, an approval can be cancelled only while it waits, and the two dictionaries say the same
 * things (same keys, same placeholders) and name the same events as the server.
 */

const render = (node: ReactElement, language: 'en' | 'hu' = 'en'): string => renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language, children: node })))
const noop = () => undefined
const AT = '2026-11-03T10:00:00.000Z'

const version = (over: Partial<Version> = {}): Version => ({
  id: 'v1', number: 1, title: 'Home page', customer_description: 'For the customer', preview_url: 'https://previews.example.test/a', image_url: null, checksum: 'c'.repeat(64), status: 'published', published_at: AT, created_at: AT,
  embeddable: true, previewHost: 'previews.example.test', ...over,
})
const deliverable = (over: Partial<Deliverable> = {}): Deliverable => ({
  id: 'd1', reference: 'DLV-1', project_id: 'p1', task_id: null, title: 'Home page', customer_description: '', internal_description: 'Only for me', type: 'website_preview', publication_state: 'published', review_state: 'not_submitted',
  current_version: 1, revision: 1, published_at: AT, last_customer_activity_at: null, created_at: AT, updated_at: AT, ...over,
})
const comment = (over: Partial<Comment> = {}): Comment => ({ id: 'c1', version_id: 'v1', parent_id: null, author_type: 'customer', body: 'Make the logo larger', x: null, y: null, status: 'submitted', created_at: AT, adminEmail: null, marker: null, ...over })
const approval = (over: Partial<Approval> = {}): Approval => ({ id: 'a1', version_id: 'v1', state: 'requested', requested_at: AT, request_note: null, decided_at: null, decision_note: null, confirmed_version: null, confirmed_checksum: null, closed_by: null, revision: 1, ...over })

const card = (v: Version, d: Deliverable = deliverable(), language: 'en' | 'hu' = 'en') => render(h(VersionCard, { version: v, current: v.status === 'published', deliverable: d, busy: null, errors: {}, onEdit: async () => true, onPublish: noop }), language)

describe('a version', () => {
  it('that is published has no form and no publish button: it is never changed, and its fingerprint is shown short', () => {
    const html = card(version())
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain(deliverablesEn.versions.publish)
    expect(html).not.toContain(deliverablesEn.versions.edit)
    expect(html).toContain('cccccccccccc')
    expect(html).not.toContain('c'.repeat(40))
    expect(html).toContain('rel="noopener noreferrer nofollow external"')
  })

  it('that is a draft says it is only yours, shows what the customer will get, and has the two actions', () => {
    const html = card(version({ id: 'v2', number: 2, status: 'draft', published_at: null, checksum: null }))
    expect(html).toContain(deliverablesEn.versions.draftNote)
    expect(html).toContain(deliverablesEn.versions.previewBefore)
    expect(html).toContain(deliverablesEn.versions.embeddable)
    expect(html).toContain(deliverablesEn.versions.edit)
    expect(html).toContain(deliverablesEn.versions.publish)
  })

  it('that is a draft says when the address will only be a link, and when there is no address at all', () => {
    expect(card(version({ status: 'draft', published_at: null, embeddable: false }))).toContain(deliverablesEn.versions.linkOnly)
    expect(card(version({ status: 'draft', published_at: null, preview_url: null, previewHost: null, embeddable: false }))).toContain(deliverablesEn.versions.noAddress)
    expect(card(version({ status: 'draft', published_at: null, image_url: 'https://previews.example.test/p.png' }))).toContain(deliverablesEn.versions.picture)
  })

  it('is told in the administrator’s own language', () => {
    const html = card(version({ status: 'draft', published_at: null }), deliverable(), 'hu')
    expect(html).toContain(deliverablesHu.versions.previewBefore)
    expect(html).not.toContain(deliverablesEn.versions.previewBefore)
  })
})

describe('a thread', () => {
  const thread = (root: Comment, replies: Comment[] = [], archived = false, language: 'en' | 'hu' = 'en') => render(h(Thread, { root, replies, busy: null, onReply: async () => true, onResolve: noop, onReopen: noop, archived }), language)

  it('says where the marker is in words, and shows the customer’s words and the reply in order, as text', () => {
    const html = thread(comment({ marker: 2, x: 0.25, y: 0.5 }), [comment({ id: 'r1', parent_id: 'c1', author_type: 'admin', body: 'Done <b>now</b>' })])
    expect(html).toContain('Marker 2')
    expect(html).toContain('25% from the left, 50% from the top')
    expect(html).toContain('Make the logo larger')
    expect(html).toContain('Done &lt;b&gt;now&lt;/b&gt;')
    expect(html.indexOf('Make the logo larger')).toBeLessThan(html.indexOf('Done'))
  })

  it('offers a reply and a resolution while it is open, a reopening once resolved, and nothing on an archived deliverable', () => {
    expect(thread(comment())).toContain(deliverablesEn.feedback.resolve)
    expect(thread(comment())).toContain(deliverablesEn.feedback.reply)
    expect(thread(comment({ status: 'resolved' }))).toContain(deliverablesEn.feedback.reopen)
    expect(thread(comment({ status: 'resolved' }))).not.toContain(`>${deliverablesEn.feedback.resolve}<`)
    const archived = thread(comment(), [], true)
    expect(archived).not.toContain(deliverablesEn.feedback.reply)
    expect(archived).not.toContain(deliverablesEn.feedback.resolve)
  })

  it('calls a comment without a marker a general one', () => {
    expect(thread(comment())).toContain(deliverablesEn.feedback.general)
    expect(thread(comment(), [], false, 'hu')).toContain(deliverablesHu.feedback.general)
  })
})

describe('an approval line', () => {
  const line = (a: Approval) => render(h(ApprovalLine, { approval: a, versions: [version()], onCancel: noop, busy: null }))

  it('can be cancelled only while it waits', () => {
    expect(line(approval())).toContain(deliverablesEn.approval.cancel)
    for (const state of ['approved', 'changes_requested', 'cancelled', 'superseded'] as const) expect(line(approval({ state })), state).not.toContain(deliverablesEn.approval.cancel)
  })

  it('names the version and the fingerprint the customer confirmed, and keeps their explanation as text', () => {
    const html = line(approval({ state: 'approved', decided_at: AT, confirmed_version: 1, confirmed_checksum: 'c'.repeat(64) }))
    expect(html).toContain('cccccccccccc')
    expect(html).toContain('version 1')
    expect(line(approval({ state: 'changes_requested', decided_at: AT, decision_note: 'Too <i>red</i>' }))).toContain('Too &lt;i&gt;red&lt;/i&gt;')
  })
})

/** Every `{placeholder}` of a string, sorted. */
const placeholders = (text: string): string[] => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort()
const flatten = (value: unknown, path = ''): Array<[string, string]> =>
  typeof value === 'string' ? [[path, value]] : Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => flatten(inner, path ? `${path}.${key}` : key))

describe('the two dictionaries', () => {
  const english = flatten(deliverablesEn)
  const hungarian = new Map(flatten(deliverablesHu))

  it('have the same keys, no empty text, and the same placeholders in each text', () => {
    expect(Array.from(hungarian.keys()).sort()).toEqual(english.map(([key]) => key).sort())
    for (const [key, text] of english) {
      const other = hungarian.get(key)!
      expect(text.trim(), key).not.toBe('')
      expect(other.trim(), key).not.toBe('')
      expect(placeholders(other), key).toEqual(placeholders(text))
    }
  })

  it('are part of the administration’s dictionaries', () => {
    expect(en.deliverables).toBe(deliverablesEn)
    expect(hu.deliverables).toBe(deliverablesHu)
  })

  it('name the same events as the server, the same kinds of e-mail choices and the same refusals', () => {
    const model = readFileSync(new URL('../../../server/src/modules/deliverables/model.ts', import.meta.url), 'utf8')
    const events = /EVENT_TYPES = \[([\s\S]*?)\] as const/.exec(model)![1].match(/'([a-z_]+)'/g)!.map((entry) => entry.slice(1, -1))
    expect(Object.keys(deliverablesEn.history.types).sort()).toEqual([...events].sort())
    const settings: Array<keyof DeliverableSettings> = ['ready', 'newVersion', 'approvalRequested', 'reply', 'feedback', 'changesRequested', 'approved']
    expect(Object.keys(deliverablesEn.settings.choices).sort()).toEqual([...settings].sort())
    const service = readFileSync(new URL('../../../server/src/modules/deliverables/service.ts', import.meta.url), 'utf8')
    const reasons = new Set([...service.matchAll(/refuse\([^)]*?, '([a-z_]+)'\)/g)].map((match) => match[1]))
    expect(reasons.size).toBeGreaterThan(8)
    for (const reason of reasons) expect(Object.keys(deliverablesEn.versions.refused), reason).toContain(reason)
  })
})
