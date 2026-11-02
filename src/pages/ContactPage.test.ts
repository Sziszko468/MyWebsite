import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { CONTACT_RHYTHM } from '../components/contact/rhythm'
import { CONTACT_KINDS } from '../contact/types'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { ThemeContext } from '../theme/context'
import { ContactPage } from './ContactPage'
import { flattenKinetic } from '../test/markup'

/** The contact page rendered on the server, with the real providers. */
function render(lang: Language, url = '/contact', theme: 'dark' | 'light' = 'dark'): string {
  return flattenKinetic(renderToStaticMarkup(
    createElement(
      ThemeContext.Provider,
      { value: { theme, setTheme: () => undefined, toggleTheme: () => undefined } },
      createElement(
        MemoryRouter,
        { initialEntries: [`/${lang}${url}`] },
        createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, createElement(ContactPage)),
      ),
    ),
  ))
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

describe.each(LANGUAGES)('the contact page in %s', (lang) => {
  const html = render(lang)
  const t = dictionaries[lang]
  const c = t.contactPage

  it('renders one h1: the question of the brief', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain(escape(c.hero.title))
    expect(html).toContain(escape(c.hero.lead))
  })

  it('shows two doors, each leading to the form', () => {
    for (const door of [c.hero.employers, c.hero.clients]) {
      expect(html).toContain(escape(door.label))
      expect(html).toContain(escape(door.title))
      expect(html).toMatch(new RegExp(`<a[^>]*href="#message"[^>]*>(?:(?!</a>).)*${escape(door.cta)}`))
    }
    expect(html.match(/href="#message"/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('has the form band, named by a heading', () => {
    for (const { id } of CONTACT_RHYTHM) expect(html, id).toMatch(new RegExp(`<section[^>]*id="${id}"[^>]*aria-labelledby="[^"]+"`))
  })

  it('asks for the name, the e-mail address, the topic, the subject and the message, each with a label', () => {
    for (const label of [c.form.fields.name.label, c.form.fields.email.label, c.form.fields.subject.label, c.form.fields.message.label]) {
      expect(html).toMatch(new RegExp(`<label[^>]*>${escape(label)}`))
    }
    expect(html).toContain(escape(c.form.fields.kind.label))
    for (const kind of CONTACT_KINDS) expect(html).toContain(escape(c.form.fields.kind.options[kind]))
    expect(html).toMatch(/type="email"[^>]*autoComplete="email"|autoComplete="email"[^>]*type="email"/)
  })

  it('asks for the acknowledgement, with no link to a privacy page that has not been set', () => {
    expect(html).toContain(escape(c.form.fields.consent.label))
    expect(html).not.toContain(escape(c.form.fields.consent.privacy))
  })

  it('says up front that nothing can be sent yet, because no endpoint is configured, and offers no success', () => {
    expect(html).toContain(escape(c.form.unavailable.notice))
    expect(html).toContain(escape(c.form.actions.prepare))
    expect(html).not.toContain(escape(c.form.sent.title + '<'))
  })

  it('starts with no topic chosen and no subject', () => {
    expect(html).not.toMatch(/type="radio"[^>]*checked=""/)
  })

  it('shows no e-mail address or profile link that was not configured', () => {
    expect(html).not.toMatch(/href="mailto:/)
    expect(html).not.toMatch(/href="https?:\/\//)
  })

  it('leaks no template, no undefined and no object into the text', () => {
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/\{\w+\}|undefined|\[object|NaN/)
  })
})

describe('the contact page’s two doors', () => {
  it('start the form on a web development project for a client, with its subject', () => {
    const html = render('hu', '/contact?for=clients')
    const c = dictionaries.hu.contactPage.form
    expect(html).toMatch(/value="project"[^>]*checked=""|checked=""[^>]*value="project"/)
    expect(html).toContain(`value="${escape(c.subjects.project)}"`)
  })

  it('start the form on a job opportunity for an employer, with its subject', () => {
    const html = render('en', '/contact?for=employers')
    const c = dictionaries.en.contactPage.form
    expect(html).toMatch(/value="job"[^>]*checked=""|checked=""[^>]*value="job"/)
    expect(html).toContain(`value="${escape(c.subjects.job)}"`)
  })

  it('ignore a door that does not exist', () => {
    const html = render('nl', '/contact?for=everyone')
    expect(html).not.toMatch(/type="radio"[^>]*checked=""/)
  })

  it('render the same band in the light theme', () => {
    const html = render('hu', '/contact', 'light')
    expect(html).toContain('id="message"')
    expect(html).toContain('data-theme="dark"')
  })
})
