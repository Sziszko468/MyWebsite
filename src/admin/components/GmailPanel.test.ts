import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { GmailStatus } from '../api/types'
import { AdminTextProvider, formatDateTime } from '../i18n'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { GmailPanelView, type GmailPanelViewProps } from './GmailPanel'

/** A component rendered on the server in the administration's own providers, in one of its two languages. */
const render = (node: ReactElement, language: 'en' | 'hu' = 'en'): string => renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language, children: node })))
const noop = () => undefined
const AT = '2026-11-15T10:30:00.000Z'

const status = (changes: Partial<GmailStatus> = {}): GmailStatus => ({ configured: true, connected: false, accountEmail: 'mailbox@site.test', lastError: null, checkedAt: null, ...changes })
const panel = (changes: Partial<GmailStatus> = {}, props: Partial<GmailPanelViewProps> = {}, language: 'en' | 'hu' = 'en') =>
  render(h(GmailPanelView, { status: status(changes), checking: false, canCheck: true, onCheck: noop, ...props }), language)

/** The check button's own tag, so its attributes can be read. */
const button = (html: string): string => /<button[^>]*>/.exec(html)?.[0] ?? ''

describe('the Gmail panel', () => {
  it('says "not configured" and how to set it up, shows no mailbox, and has a check button that cannot be pressed', () => {
    const html = panel({ configured: false, accountEmail: null, lastError: 'not_configured' })
    expect(html).toContain(en.settings.gmail.title)
    expect(html).toContain(en.settings.gmail.notConfigured)
    expect(html).toContain(en.settings.gmail.notConfiguredHelp)
    expect(html).toContain(en.settings.gmail.noMailbox)
    expect(html).not.toContain(en.settings.gmail.lastError) // nothing failed: there was nothing to try
    expect(button(html)).toContain('disabled')
  })

  it('says "configured, not checked", names the mailbox, and invites a check', () => {
    const html = panel()
    expect(html).toContain(en.settings.gmail.configured)
    expect(html).toContain(en.settings.gmail.notChecked)
    expect(html).toContain(en.settings.gmail.notCheckedHelp)
    expect(html).toContain(en.settings.gmail.neverChecked)
    expect(html).toContain('mailbox@site.test')
    expect(button(html)).not.toContain('disabled')
    expect(html).toContain(en.settings.gmail.check)
  })

  it('says "connected", and when the last check was', () => {
    const html = panel({ connected: true, checkedAt: AT })
    expect(html).toContain(en.settings.gmail.connected)
    expect(html).toContain(en.settings.gmail.lastCheckOk.replace('{when}', formatDateTime(AT, 'en')))
    expect(html).not.toContain(en.settings.gmail.failed)
    expect(html).not.toContain(en.settings.gmail.lastError)
  })

  it('says "connection failed", when, and why in words an administrator can act on', () => {
    const html = panel({ lastError: 'invalid_grant', checkedAt: AT })
    expect(html).toContain(en.settings.gmail.failed)
    expect(html).toContain(en.settings.gmail.lastCheckFailed.replace('{when}', formatDateTime(AT, 'en')))
    expect(html).toContain(en.settings.gmail.lastError)
    expect(html).toContain(en.settings.gmail.errors.invalid_grant.replace(/’/g, '&#x27;'))
    expect(html).not.toContain('invalid_grant') // the category is a code, not a sentence
    expect(button(html)).not.toContain('disabled') // trying again is the point
  })

  it.each(['invalid_credentials', 'invalid_grant', 'insufficient_scope', 'rate_limited', 'provider_unavailable', 'network', 'invalid_response', 'something_new'])('words the error %s in both languages, never as the raw code', (category) => {
    for (const language of ['en', 'hu'] as const) {
      const html = panel({ lastError: category, checkedAt: AT }, {}, language)
      expect(html, `${language} ${category}`).not.toContain(category)
      expect(html).toContain((language === 'en' ? en : hu).settings.gmail.lastError)
    }
  })

  it('shows the busy state while a check is under way: the button is loading and says so, and the panel is marked busy', () => {
    const html = panel({ lastError: 'network', checkedAt: AT }, { checking: true })
    expect(button(html)).toContain('aria-busy="true"')
    expect(button(html)).toContain('data-loading')
    expect(html).toContain(en.settings.gmail.checking)
    expect(html).toMatch(/<div class="[^"]*" aria-busy="true">/)
    expect(panel()).not.toContain('aria-busy')
  })

  it('does not offer a check to someone who may only read, and says why', () => {
    const html = panel({}, { canCheck: false })
    expect(button(html)).toContain('disabled')
    expect(html).toContain(en.settings.gmail.noPermission)
    expect(panel()).not.toContain(en.settings.gmail.noPermission)
  })

  it('speaks Hungarian when the administration does', () => {
    const html = panel({ lastError: 'provider_unavailable', checkedAt: AT }, {}, 'hu')
    expect(html).toContain(hu.settings.gmail.title)
    expect(html).toContain(hu.settings.gmail.failed)
    expect(html).toContain(hu.settings.gmail.errors.provider_unavailable)
    expect(html).toContain(hu.settings.gmail.check)
    expect(html).not.toContain(en.settings.gmail.title)
  })

  it('shows the mailbox address as text, never as markup', () => {
    const html = panel({ accountEmail: '"><img src=x onerror=alert(1)>@site.test' })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('shows nothing but the five fields: a secret handed to it by mistake is not drawn', () => {
    const html = panel({ lastError: 'invalid_grant', checkedAt: AT, ...({ refreshToken: '1//0g-refresh-VALUE', clientSecret: 'GOCSPX-secret-VALUE', accessToken: 'ya29.access-VALUE' } as object) })
    for (const secret of ['1//0g-refresh-VALUE', 'GOCSPX-secret-VALUE', 'ya29.access-VALUE']) expect(html).not.toContain(secret)
  })
})
