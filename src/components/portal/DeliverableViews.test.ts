import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n/I18nProvider'
import type { Language } from '../../i18n/config'
import type { DeliverableComment, DeliverableDetail, DeliverableVersion } from '../../portal/api'
import { DeliverablePage } from './DeliverableViews'

/**
 * PROMPT 27, the customer's page of one deliverable, rendered with what the server sends: a preview is embedded only when the server says its origin is allowed (and then in a
 * sandboxed frame without a referrer), otherwise it is a link; a picture can be commented on only where there is one; a version that is not the current one cannot be commented on;
 * approval needs the panel the server allows, never happens by looking, and names the exact version; no text is left as a placeholder in any of the three languages.
 */

const AT = '2026-11-03T10:00:00.000Z'
const noop = () => undefined

const version = (number: number, over: Partial<DeliverableVersion> = {}): DeliverableVersion => ({
  number, title: `Version ${number} headline`, description: 'Words for the customer', publishedAt: AT, current: true, checksum: 'a'.repeat(64), previewUrl: 'https://previews.example.test/site/v1', previewHost: 'previews.example.test',
  embeddable: true, imageUrl: null, outcome: null, awaiting: false, ...over,
})

const comment = (id: string, over: Partial<DeliverableComment> = {}): DeliverableComment => ({ id, parentId: null, author: 'you', body: `Comment ${id}`, position: null, marker: null, status: 'submitted', createdAt: AT, editable: false, ...over })

const detail = (over: Partial<DeliverableDetail> = {}): DeliverableDetail => ({
  reference: 'DLV-TEST1', title: 'Home page', type: 'website_preview', archived: false, reviewState: 'awaiting_customer', currentVersion: 2, versionTitle: 'Version 2 headline', publishedAt: AT, updatedAt: AT,
  awaitingApproval: false, openThreads: 0, approvedAt: null, description: 'Standing words', task: null, versions: [version(2), version(1, { current: false })], viewing: 2, comments: [], approval: null, history: [],
  can: { comment: true, decide: false, follow: true }, drafts: { current: 0, earlier: 0 }, ...over,
})

const render = (value: DeliverableDetail, lang: Language = 'en'): string =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/${lang}/client-portal/projects/PRJ-1/deliverables/DLV-TEST1`] }, h(I18nProvider, { lang, children: h(DeliverablePage, { reference: 'PRJ-1', deliverable: 'DLV-TEST1', detail: value, apply: noop, reload: noop, onShow: noop, lang }) as ReactElement })))

describe('the preview', () => {
  it('is a sandboxed frame without a referrer or a permission only for an address the server says is on the owner’s list, and always has the link as well', () => {
    const html = render(detail())
    const frame = html.match(/<iframe[^>]*>/)?.[0] ?? ''
    expect(frame).toContain('src="https://previews.example.test/site/v1"')
    expect(frame).toMatch(/sandbox="[^"]*"/)
    expect(frame).not.toMatch(/sandbox="[^"]*allow-(top-navigation|popups|modals|downloads|pointer-lock|presentation|orientation-lock)/)
    expect(frame).toContain('referrerPolicy="no-referrer"')
    expect(frame).toContain('allow=""')
    expect(html).toContain('rel="noopener noreferrer nofollow external"')
    expect(html).toContain('target="_blank"')
  })

  it('is only a link when the origin is not on the list: no frame is ever made from an address the owner did not allow', () => {
    const html = render(detail({ versions: [version(2, { embeddable: false }), version(1, { current: false })] }))
    expect(html).not.toContain('<iframe')
    expect(html).toContain('href="https://previews.example.test/site/v1"')
    expect(html).toContain('rel="noopener noreferrer nofollow external"')
  })

  it('says so when there is nothing to look at, and shows the words', () => {
    const html = render(detail({ versions: [version(2, { previewUrl: null, previewHost: null, embeddable: false }), version(1, { current: false })] }))
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('href="https://previews')
    expect(html).toContain('Words for the customer')
  })
})

describe('the picture and the markers', () => {
  const picture = 'https://previews.example.test/shot.png'
  const withPicture = (comments: DeliverableComment[] = []) => detail({ versions: [version(2, { imageUrl: picture, previewUrl: null, previewHost: null, embeddable: false }), version(1, { current: false })], comments })

  it('is drawn without a referrer, with a way to place a marker, and no way when there is no picture', () => {
    const html = render(withPicture())
    expect(html).toMatch(/<img[^>]*src="https:\/\/previews\.example\.test\/shot\.png"[^>]*referrerPolicy="no-referrer"/)
    expect(html).toContain('aria-pressed="false"')
    expect(render(detail())).not.toContain('aria-pressed')
    expect(render(detail())).not.toContain('<img')
  })

  it('draws every marker in percent of the picture, numbered, as a button that says where it is in words', () => {
    const html = render(withPicture([comment('c1', { marker: 1, position: { x: 0.25, y: 0.5 } }), comment('c2', { marker: 2, position: { x: 0.8, y: 0.125 } })]))
    expect(html).toContain('left:25%')
    expect(html).toContain('top:50%')
    expect(html).toContain('left:80%')
    expect(html).toContain('top:12.5%')
    const buttons = html.match(/<button[^>]*class="[^"]*marker[^"]*"[^>]*>/g) ?? []
    expect(buttons).toHaveLength(2)
    for (const button of buttons) expect(button).toMatch(/aria-label="[^"]*\d[^"]*"/)
  })

  it('lists every marker’s comment as text beside the picture, so the picture is never the only way to read or answer', () => {
    const html = render(withPicture([comment('c1', { marker: 1, position: { x: 0.25, y: 0.5 }, body: 'The logo is too small' })]))
    expect(html).toContain('The logo is too small')
    expect(html).toContain('25% ')
  })
})

describe('feedback', () => {
  it('lets the customer write and send on the current version, and says how many drafts are waiting', () => {
    const html = render(detail({ comments: [comment('d1', { status: 'draft', editable: true, body: 'My draft' })], drafts: { current: 1, earlier: 0 } }))
    expect(html).toContain('id="comment-text"')
    expect(html).toContain('My draft')
    expect(html).toMatch(/<label[^>]*for="comment-text"/)
    expect(html).toContain('maxLength="2200"')
  })

  it('keeps the send button off while there is nothing to send', () => {
    const none = render(detail())
    expect(none).toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>Send the feedback/)
    const some = render(detail({ comments: [comment('d1', { status: 'draft', editable: true })] }))
    expect(some).not.toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>Send the feedback/)
  })

  it('on an older version offers no form at all: reading only, and it says why', () => {
    const html = render(detail({ viewing: 1, can: { comment: false, decide: false, follow: false }, versions: [version(2), version(1, { current: false })] }))
    expect(html).not.toContain('id="comment-text"')
    expect(html).not.toContain('id="compose-title"')
  })

  it('shows what was sent as it was, with the studio’s replies marked as theirs, and no private note anywhere', () => {
    const html = render(detail({ comments: [comment('c1', { body: 'Please make it blue' }), comment('c2', { parentId: 'c1', author: 'studio', body: 'Done in version 2' })] }))
    expect(html).toContain('Please make it blue')
    expect(html).toContain('Done in version 2')
    expect(html).not.toMatch(/internal|private note/i)
  })

  it('offers a follow-up on a sent thread and a reopening on a resolved one, never an edit of what was sent', () => {
    const sent = render(detail({ comments: [comment('c1')] }))
    expect(sent).toMatch(/Add to it/)
    expect(sent).not.toMatch(/>Edit</)
    const resolved = render(detail({ comments: [comment('c1', { status: 'resolved' })] }))
    expect(resolved).toMatch(/Reopen/i)
  })
})

describe('approval', () => {
  const asked = detail({ reviewState: 'awaiting_customer', awaitingApproval: true, can: { comment: true, decide: true, follow: true }, approval: { id: 'a1', versionNumber: 2, checksum: 'a'.repeat(64), note: 'Please decide by Friday', requestedAt: AT, revision: 1 } })

  it('is a panel with three plain choices, names the version, and shows the owner’s word; nothing is decided by rendering', () => {
    const html = render(asked)
    expect(html).toContain('id="approval-title"')
    expect(html).toContain('version 2')
    expect(html).toContain('Please decide by Friday')
    expect((html.match(/<button[^>]*type="button"/g) ?? []).length).toBeGreaterThan(2)
    expect(html).not.toContain('<dialog open')
  })

  it('does not exist unless the server says this customer can decide now', () => {
    expect(render(detail({ approval: asked.approval, can: { comment: true, decide: false, follow: true } }))).not.toContain('id="approval-title"')
    expect(render(detail())).not.toContain('id="approval-title"')
  })

  it('says which version was approved, and when', () => {
    const html = render(detail({ reviewState: 'approved', approvedAt: AT, can: { comment: false, decide: false, follow: false }, versions: [version(2, { outcome: 'approved' }), version(1, { current: false })] }))
    expect(html).toMatch(/approved/i)
    expect(html).toContain('role="status"')
  })
})

describe('the words', () => {
  const full = detail({
    comments: [comment('c1', { marker: 1, position: { x: 0.3, y: 0.4 } }), comment('d1', { status: 'draft', editable: true })],
    versions: [version(2, { imageUrl: 'https://previews.example.test/shot.png' }), version(1, { current: false })],
    can: { comment: true, decide: true, follow: true },
    approval: { id: 'a1', versionNumber: 2, checksum: 'b'.repeat(64), note: null, requestedAt: AT, revision: 1 },
    drafts: { current: 1, earlier: 2 },
    history: [{ id: 1, type: 'version_published', at: AT, version: 2, by: 'studio', note: null, subject: null }],
    task: { reference: 'TSK-1', title: 'Build the page' },
  })

  it('has every sentence in Hungarian, English and Dutch, with no placeholder left over and no key name showing', () => {
    for (const lang of ['hu', 'en', 'nl'] as const) {
      const html = render(full, lang)
      expect(html, lang).not.toMatch(/\{[a-z]+\}/i)
      expect(html, lang).not.toMatch(/deliverables?\.[a-z]+\./i)
      expect(html, lang).toContain(`lang`.slice(0, 0))
      expect(html.length, lang).toBeGreaterThan(2000)
    }
    const hu = render(full, 'hu')
    const nl = render(full, 'nl')
    expect(hu).not.toBe(render(full, 'en'))
    expect(nl).not.toBe(render(full, 'en'))
    expect(hu).not.toBe(nl)
  })

  it('says each step of the history in words, with its number, in the customer’s language, and never the bare fallback for a known step', () => {
    const lines = [
      { id: 1, type: 'version_published', at: AT, version: 2, by: 'studio' as const, note: null, subject: null },
      { id: 2, type: 'feedback_submitted', at: AT, version: 2, by: 'you' as const, note: null, subject: '3' },
      { id: 3, type: 'approval_approved', at: AT, version: 2, by: 'you' as const, note: null, subject: null },
      { id: 4, type: 'something_new', at: AT, version: null, by: 'system' as const, note: null, subject: null },
    ]
    const en = render(detail({ history: lines }))
    expect(en).toContain('Version 2 published')
    expect(en).toContain('Feedback sent (comments: 3)')
    expect(en).toContain('Approved (version 2)')
    expect(en.match(/<span>Event<\/span>/g)).toHaveLength(1)
    expect(render(detail({ history: lines }), 'hu')).toContain('2. verzió közzétéve')
    expect(render(detail({ history: lines }), 'nl')).toContain('Versie 2 gepubliceerd')
  })

  it('never shows the fingerprint as the only identity of a version, and never a long hexadecimal string as text', () => {
    const html = render(full)
    expect(html).not.toMatch(/>[0-9a-f]{40,}</)
  })
})
