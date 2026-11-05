import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { AdminTextProvider } from '../i18n'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { ActivityTimeline } from './ActivityTimeline'
import { DataList } from './DataList'
import { CheckField, SelectField, TextAreaField, TextField } from './form'
import { InternalNotes } from './InternalNotes'
import { DashboardStatCard, DetailPanel, PageHeader, TabPanel, Tabs } from './layout'
import { Pagination } from './Pagination'
import { EmptyState, ErrorState, LoadingState } from './states'
import { StatusBadge } from './StatusBadge'

/** A component rendered on the server in the administration's own providers, in one of its two languages. */
const render = (node: ReactElement, language: 'en' | 'hu' = 'en'): string => renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language, children: node })))
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const noop = () => undefined

describe('StatusBadge', () => {
  it('says the status in words, with a dot that is only decoration', () => {
    const html = render(h(StatusBadge, { kind: 'inquiry', status: 'in_progress' }))
    expect(html).toContain(en.status.inquiry.in_progress)
    expect(html).toMatch(/<span class="[^"]*badgeDot[^"]*" aria-hidden="true">/)
  })

  it('speaks the administrator’s language', () => {
    expect(render(h(StatusBadge, { kind: 'quote', status: 'quoted' }), 'hu')).toContain(hu.status.quote.quoted)
  })

  it('adds an Archived badge beside the status, not instead of it', () => {
    const html = render(h(StatusBadge, { kind: 'inquiry', status: 'completed', archived: true }))
    expect(html).toContain(en.status.inquiry.completed)
    expect(html).toContain(en.status.archived)
  })

  it('shows a status it does not know as it is, never hiding it', () => {
    expect(render(h(StatusBadge, { kind: 'inquiry', status: 'from_the_future' }))).toContain('from_the_future')
    expect(render(h(StatusBadge, { kind: 'delivery', status: 'from_a_new_provider' }))).toContain('from_a_new_provider')
  })

  it('names the availability of a service in words', () => {
    expect(render(h(StatusBadge, { kind: 'availability', status: 'active' }))).toContain(en.common.active)
    expect(render(h(StatusBadge, { kind: 'availability', status: 'disabled' }))).toContain(en.common.disabled)
  })
})

describe('states', () => {
  it('loading is a polite status and busy, and says what it is doing in words for a screen reader', () => {
    const html = render(h(LoadingState))
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain(en.states.loading)
  })

  it('an error is announced at once, says what happened in a sentence, and gives the way out: trying again', () => {
    const html = render(h(ErrorState, { error: new ApiError(503, 'unavailable', 'x', {}, 'req-42'), onRetry: noop }))
    expect(html).toContain('role="alert"')
    expect(html).toContain(en.states.errorUnavailable)
    expect(html).toContain('req-42')
    expect(html).toContain(en.common.retry)
  })

  it('an error without a way to retry offers no button', () => {
    expect(render(h(ErrorState, { error: new Error('x') }))).not.toContain('<button')
  })

  it('the heading follows the page: h2 by default, h1 when the state is the page, none when there is no title', () => {
    expect(render(h(EmptyState, { title: 'Nothing yet' }))).toContain('<h2')
    expect(render(h(EmptyState, { title: 'Nothing yet', level: 3 }))).toContain('<h3')
    expect(render(h(ErrorState, { error: null, level: 1 }))).toMatch(/<h1\b/)
    expect(render(h(EmptyState, { children: 'Only a sentence' }))).not.toMatch(/<h[1-6]/)
  })

  it('never puts the server’s own wording on the screen', () => {
    expect(render(h(ErrorState, { error: new ApiError(500, 'internal', 'SQLITE_ERROR: no such table users') }))).not.toContain('SQLITE')
  })
})

describe('Pagination', () => {
  it('says how many there are, and offers no pages when everything fits', () => {
    const html = render(h(Pagination, { page: 1, pageSize: 20, total: 3, onPage: noop }))
    expect(html).toContain('3')
    expect(html).not.toContain('<button')
  })

  it('shows the range and where you are, with “previous” off on the first page', () => {
    const html = render(h(Pagination, { page: 1, pageSize: 20, total: 45, onPage: noop }))
    expect(html).toContain('1–20')
    expect(html).toContain('aria-current="page"')
    const previous = html.match(/<button[^>]*aria-label="Previous page"[^>]*>/)?.[0] ?? ''
    expect(previous).toContain('disabled')
    expect(html.match(/<button[^>]*aria-label="Next page"[^>]*>/)?.[0]).not.toContain('disabled')
  })

  it('turns “next” off on the last page, and its last range ends at the total', () => {
    const html = render(h(Pagination, { page: 3, pageSize: 20, total: 45, onPage: noop }))
    expect(html).toContain('41–45')
    expect(html.match(/<button[^>]*aria-label="Next page"[^>]*>/)?.[0]).toContain('disabled')
  })

  it('has a labelled navigation, in the administrator’s language', () => {
    expect(render(h(Pagination, { page: 1, pageSize: 20, total: 45, onPage: noop }), 'hu')).toContain(`aria-label="${escape(hu.list.pagination)}"`)
  })
})

describe('DashboardStatCard', () => {
  it('is a link when there is a list behind the number, and a plain box when there is not', () => {
    expect(render(h(DashboardStatCard, { label: 'New', value: '2', to: '/inquiries?status=new' }))).toMatch(/<a [^>]*href="\/inquiries\?status=new"/)
    expect(render(h(DashboardStatCard, { label: 'Archived', value: '0' }))).not.toContain('<a ')
  })

  it('shows the label, the value and the note', () => {
    const html = render(h(DashboardStatCard, { label: 'Pending', value: '12', note: '3 this week', tone: 'warning' }))
    expect(html).toContain('Pending')
    expect(html).toContain('>12<')
    expect(html).toContain('3 this week')
  })
})

describe('layout parts', () => {
  it('a page header has the page’s one h1, which can take focus after a navigation', () => {
    const html = render(h(PageHeader, { title: 'Inquiries', lead: 'Messages from the website', back: { to: '/', label: 'Back' } }))
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('id="page-title"')
  })

  it('a panel with a title is a section named by it; without one it is not a landmark', () => {
    const titled = render(h(DetailPanel, { title: 'Message', children: 'text' }))
    const id = titled.match(/aria-labelledby="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    expect(titled).toContain(`id="${id}"`)
    expect(render(h(DetailPanel, { children: 'text' }))).not.toContain('aria-labelledby')
  })

  it('tabs: one is in the tab order, each names its panel, the panel names its tab', () => {
    const tabs = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', attention: true, attentionLabel: 'needs attention' }]
    const html = render(h('div', null, h(Tabs, { tabs, value: 'a', onChange: noop, label: 'Languages', idBase: 'x' }), h(TabPanel, { id: 'a', idBase: 'x', active: true, children: 'first' }), h(TabPanel, { id: 'b', idBase: 'x', active: false, children: 'second' })))
    expect(html).toContain('role="tablist"')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/tabindex="-1"/g)).toHaveLength(1)
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('aria-controls="x-panel-a"')
    expect(html).toContain('aria-labelledby="x-tab-a"')
    expect(html).toContain('needs attention')
    expect(html).toContain('first')
    expect(html).not.toContain('second')
  })
})

describe('DataList', () => {
  const rows = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Béla' }]
  const html = render(h(DataList<(typeof rows)[number]>, { rows, rowKey: (row) => row.id, columns: [{ key: 'name', header: 'Name', cell: (row) => row.name }], card: (row) => row.name, caption: 'Inquiries' }))

  it('draws one list twice, as a table and as cards, so CSS can show the one that fits', () => {
    expect(html).toContain('<table')
    expect(html).toContain('<ul')
    expect(html.match(/Anna/g)).toHaveLength(2)
  })

  it('a real table: a caption, column headers with a scope', () => {
    expect(html).toContain('<caption')
    expect(html).toContain('scope="col"')
  })

  it('the scrolling box can be reached and scrolled from the keyboard, and is named', () => {
    expect(html).toMatch(/<div class="[^"]*tableWrap[^"]*" role="group" aria-label="Inquiries" tabindex="0">/)
  })
})

describe('forms', () => {
  it('a field’s label is tied to its control', () => {
    const html = render(h(TextField, { label: 'Name', defaultValue: '' }))
    const id = html.match(/<label[^>]*for="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`<input`)
    expect(html).toContain(`id="${id}"`)
  })

  it('a required field says so to a screen reader, not by an asterisk alone', () => {
    const html = render(h(TextField, { label: 'Name', required: true, defaultValue: '' }))
    expect(html).toContain(`(${en.common.required})`)
    expect(html).toContain('required')
  })

  it('an error is a sentence tied to the control and announced, and the control is marked invalid', () => {
    const html = render(h(TextField, { label: 'Name', error: 'Fill this in', defaultValue: '' }))
    expect(html).toContain('aria-invalid="true"')
    const describedby = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(describedby).toBeTruthy()
    expect(html).toContain(`id="${describedby}"`)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Fill this in')
  })

  it('a field without an error is not marked invalid', () => {
    expect(render(h(TextField, { label: 'Name', defaultValue: '' }))).not.toContain('aria-invalid')
  })

  it('a textarea counts characters against its limit, once, and its hint is not repeated', () => {
    const html = render(h(TextAreaField, { label: 'Note', value: 'héllo', maxLength: 2000, hint: 'Only you see this', onChange: noop }))
    expect(html).toContain('5')
    expect(html).toContain('2000')
    expect(html.match(/Only you see this/g)).toHaveLength(1)
    expect(html).not.toContain('maxlength')
  })

  it('a select lists its options with the chosen one selected', () => {
    const html = render(h(SelectField, { label: 'Status', value: 'b', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }], onChange: noop }))
    expect(html).toContain('Alpha')
    expect(html).toMatch(/<option value="b" selected="">Beta/)
  })

  it('a checkbox with a hint is described by it, and can be switched off', () => {
    const html = render(h(CheckField, { label: 'E-mail the sender', hint: 'E-mail is not set up', checked: false, disabled: true, onChange: noop }))
    expect(html).toContain('disabled')
    expect(html).toMatch(/aria-describedby="[^"]+-hint"/)
  })
})

describe('InternalNotes', () => {
  const note = { id: 'n1', body: '<img src=x onerror=alert(1)> call back', author_email: 'owner@site.test', created_at: '2026-11-03T16:27:00Z' }

  it('shows a note as text, never as markup', () => {
    const html = render(h(InternalNotes, { notes: [note] as never, canAdd: false, onAdd: async () => undefined }))
    expect(html).toContain(escape(note.body))
    expect(html).not.toContain('<img')
  })

  it('says it is empty, and says who may see notes (nobody outside)', () => {
    const html = render(h(InternalNotes, { notes: [], canAdd: false, onAdd: async () => undefined }))
    expect(html).toContain(en.notes.empty)
    expect(html).toContain(en.notes.help)
  })

  it('offers the form only to someone who may write', () => {
    expect(render(h(InternalNotes, { notes: [], canAdd: false, onAdd: async () => undefined }))).not.toContain('<form')
    expect(render(h(InternalNotes, { notes: [], canAdd: true, onAdd: async () => undefined }))).toContain('<form')
  })
})

describe('ActivityTimeline', () => {
  const events = [
    { at: '2026-11-01T10:00:00Z', action: 'received', actor: null, detail: null },
    { at: '2026-11-02T10:00:00Z', action: 'inquiry.status', actor: 'owner@site.test', detail: { from: 'new', to: 'in_progress' } },
  ]

  it('lists the newest first, with the time as a machine-readable value', () => {
    const html = render(h(ActivityTimeline, { events: events as never }))
    expect(html.indexOf(en.status.inquiry.in_progress)).toBeLessThan(html.indexOf(en.activity.received))
    // (HTML attribute names are case-insensitive: the server renderer writes `dateTime`, the browser reads `datetime`.)
    expect(html.toLowerCase()).toContain('<time datetime="2026-11-02t10:00:00z"')
    expect(html).toContain('<ol')
  })

  it('says “system” when nobody did it, and who when somebody did', () => {
    const html = render(h(ActivityTimeline, { events: events as never }))
    expect(html).toContain(en.activity.system)
    expect(html).toContain('owner@site.test')
  })
})
