import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AdminTextProvider } from '../i18n'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { TextField } from './form'
import { StatusBadge } from './StatusBadge'
import { ToastNotification } from './Toast'

/**
 * PROMPT 25: the invisible hooks the browser journeys use (tools/e2e/selectors.cjs) say WHAT happened and never how it is worded, so a reworded or
 * translated message does not break a journey. These tests hold the hooks in place; the roles and the visible words stay as they are.
 */

const render = (node: ReactElement, language: 'en' | 'hu' = 'en'): string => renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language, children: node })))
const noop = () => undefined

describe('a toast says its tone and its order without its words', () => {
  it('carries the tone and a sequence number, in either language, with the message still visible', () => {
    for (const language of ['en', 'hu'] as const) {
      const html = render(h(ToastNotification, { toast: { id: 7, tone: 'success', message: 'Elmentve' }, onDismiss: noop }), language)
      expect(html).toContain('data-testid="toast"')
      expect(html).toContain('data-tone="success"')
      expect(html).toContain('data-seq="7"')
      expect(html).toContain('Elmentve')
      expect(html).toContain('role="status"')
    }
  })

  it('keeps an error an alert, announced at once', () => {
    const html = render(h(ToastNotification, { toast: { id: 2, tone: 'error', message: 'Nem sikerült' }, onDismiss: noop }))
    expect(html).toContain('data-tone="error"')
    expect(html).toContain('role="alert"')
  })

  it('does not put the words in the hooks: the same state looks the same in every language', () => {
    const a = render(h(ToastNotification, { toast: { id: 1, tone: 'info', message: en.toast.dismiss }, onDismiss: noop }), 'en')
    const b = render(h(ToastNotification, { toast: { id: 1, tone: 'info', message: hu.toast.dismiss }, onDismiss: noop }), 'hu')
    const hooks = (html: string) => [...html.matchAll(/data-[a-z-]+="[^"]*"/g)].map((m) => m[0])
    expect(hooks(a)).toEqual(hooks(b))
    expect(hooks(a).length).toBeGreaterThanOrEqual(3)
  })
})

describe('a status badge says its status key', () => {
  it('is the same hook whatever the language of the word', () => {
    const en1 = render(h(StatusBadge, { kind: 'inquiry', status: 'in_progress' }), 'en')
    const hu1 = render(h(StatusBadge, { kind: 'inquiry', status: 'in_progress' }), 'hu')
    for (const html of [en1, hu1]) {
      expect(html).toContain('data-testid="status-badge"')
      expect(html).toContain('data-kind="inquiry"')
      expect(html).toContain('data-status="in_progress"')
    }
    expect(en1).toContain(en.status.inquiry.in_progress)
    expect(hu1).toContain(hu.status.inquiry.in_progress)
  })
})

describe('a field error is findable without its sentence', () => {
  it('marks the message under a field and leaves it an alert tied to the field', () => {
    const html = render(h(TextField, { label: 'Name', value: '', onChange: noop, error: 'Required.' }))
    expect(html).toMatch(/<p[^>]*data-testid="field-error"[^>]*role="alert"|<p[^>]*role="alert"[^>]*data-testid="field-error"/)
    expect(html).toContain('Required.')
    expect(html).toContain('aria-invalid="true"')
  })

  it('shows no hook when there is no error', () => {
    expect(render(h(TextField, { label: 'Name', value: '', onChange: noop }))).not.toContain('field-error')
  })
})
