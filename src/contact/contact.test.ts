import { describe, expect, it, vi } from 'vitest'
import { contactConfig } from '../config/contact'
import { createTransport, endpointTransport } from '../forms/submit'
import { LANGUAGES } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { contactErrorText } from './messages'
import { buildContactSummary } from './summary'
import { CONTACT_KINDS, EMPTY_CONTACT, PATH_KIND, isContactPath, type ContactDraft, type ContactField, type ContactRequest } from './types'
import { CONTACT_FIELD_ORDER, CONTACT_LIMITS, toContactRequest, validateContact, type ContactErrorCode } from './validation'
import { shopText } from '../content/shop'
import { localize } from '../content/trilingual'

const options = { requireConsent: true }

const valid: ContactDraft = {
  name: 'Test Person',
  email: 'test.person@example.com',
  kind: 'project',
  subject: 'A new website',
  message: 'I would like to talk about a website for a small studio.',
  consent: true,
}

const withField = <K extends ContactField>(field: K, value: ContactDraft[K]): ContactDraft => ({ ...valid, [field]: value })

describe('the contact form’s rules', () => {
  it('accepts a complete message', () => {
    expect(validateContact(valid, options)).toEqual({})
  })

  it('asks for every answer, and for the acknowledgement while it is required', () => {
    expect(validateContact(EMPTY_CONTACT, options)).toEqual({
      name: 'required',
      email: 'required',
      kind: 'required',
      subject: 'required',
      message: 'required',
      consent: 'consentRequired',
    })
    expect(validateContact({ ...EMPTY_CONTACT }, { requireConsent: false }).consent).toBeUndefined()
  })

  it('treats a field with only spaces as empty', () => {
    expect(validateContact({ ...valid, name: '   ', subject: '\n', message: '  ' }, options)).toEqual({
      name: 'required',
      subject: 'required',
      message: 'required',
    })
  })

  it('refuses answers that are too short or too long', () => {
    expect(validateContact(withField('name', 'A'), options)).toEqual({ name: 'tooShort' })
    expect(validateContact(withField('name', 'x'.repeat(CONTACT_LIMITS.name.max + 1)), options)).toEqual({ name: 'tooLong' })
    expect(validateContact(withField('subject', 'ab'), options)).toEqual({ subject: 'tooShort' })
    expect(validateContact(withField('subject', 'x'.repeat(CONTACT_LIMITS.subject.max + 1)), options)).toEqual({ subject: 'tooLong' })
    expect(validateContact(withField('message', 'too short'), options)).toEqual({ message: 'tooShort' })
    expect(validateContact(withField('message', 'x'.repeat(CONTACT_LIMITS.message.max + 1)), options)).toEqual({ message: 'tooLong' })
  })

  it('checks the shape of the e-mail address', () => {
    for (const email of ['plain', 'a@b', '@example.com', 'a@@example.com', 'a b@example.com', 'a@example..com']) {
      expect(validateContact(withField('email', email), options), email).toEqual({ email: 'invalidEmail' })
    }
    for (const email of ['a@example.com', 'first.last+tag@sub.example.co.uk']) {
      expect(validateContact(withField('email', email), options), email).toEqual({})
    }
  })

  it('accepts each of the four topics and nothing else', () => {
    expect(CONTACT_KINDS).toEqual(['job', 'collaboration', 'project', 'other'])
    for (const kind of CONTACT_KINDS) expect(validateContact(withField('kind', kind), options)).toEqual({})
    // @ts-expect-error not a topic
    expect(validateContact(withField('kind', 'spam'), options)).toEqual({ kind: 'required' })
  })

  it('lists the fields in the order they appear, which is where focus goes first', () => {
    expect(CONTACT_FIELD_ORDER).toEqual(['name', 'email', 'kind', 'subject', 'message', 'consent'])
    expect([...CONTACT_FIELD_ORDER].sort()).toEqual(Object.keys(EMPTY_CONTACT).sort())
  })
})

describe('the contact request', () => {
  it('is built from trimmed answers, names its form and its language, and carries nothing else', () => {
    const request = toContactRequest({ ...valid, name: ' Test Person ', subject: ' A new website ', message: '  Hello there, friend.  ' }, 'nl')
    expect(request).toEqual<ContactRequest>({
      form: 'contact',
      language: 'nl',
      kind: 'project',
      name: 'Test Person',
      email: 'test.person@example.com',
      subject: 'A new website',
      message: 'Hello there, friend.',
    })
    expect(Object.keys(request).sort()).toEqual(['email', 'form', 'kind', 'language', 'message', 'name', 'subject'])
  })

  it('is not built from an incomplete form', () => {
    expect(() => toContactRequest(EMPTY_CONTACT, 'hu')).toThrow()
  })

  it('starts each door on its topic: employers on a job, clients on a project', () => {
    expect(PATH_KIND).toEqual({ employers: 'job', clients: 'project' })
    expect(isContactPath('employers')).toBe(true)
    expect(isContactPath('clients')).toBe(true)
    expect(isContactPath('everyone')).toBe(false)
    expect(isContactPath(null)).toBe(false)
  })

  it('is posted as JSON to the configured address, and is sent only on a 2xx answer', async () => {
    const request = toContactRequest(valid, 'en')
    const ok = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(endpointTransport<ContactRequest>('https://forms.example.com/contact', { fetchImpl: ok }).submit(request)).resolves.toEqual({ status: 'sent' })
    const [url, init] = ok.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://forms.example.com/contact')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(request)

    const refused = vi.fn().mockResolvedValue(new Response('no', { status: 500 }))
    await expect(endpointTransport<ContactRequest>('https://forms.example.com/contact', { fetchImpl: refused }).submit(request)).resolves.toEqual({
      status: 'failed',
      reason: 'rejected',
    })
    const broken = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(endpointTransport<ContactRequest>('https://forms.example.com/contact', { fetchImpl: broken }).submit(request)).resolves.toEqual({
      status: 'failed',
      reason: 'network',
    })
  })

  it('uses a valid endpoint from the configuration or none, and then sends nowhere', () => {
    expect(contactConfig.endpoint === null || /^https?:\/\//.test(contactConfig.endpoint)).toBe(true)
    expect(createTransport<ContactRequest>(contactConfig.endpoint).id).toBe(contactConfig.endpoint ? 'endpoint' : 'none')
    expect(createTransport<ContactRequest>(null).id).toBe('none')
  })
})

describe('the words for every problem', () => {
  const bad: Record<ContactField, unknown[]> = {
    name: ['', 'x', 'x'.repeat(500)],
    email: ['', 'nope', `${'a'.repeat(300)}@example.com`],
    kind: [null],
    subject: ['', 'x', 'x'.repeat(500)],
    message: ['', 'short', 'x'.repeat(5000)],
    consent: [false],
  }

  it.each(LANGUAGES)('has a sentence in %s for each of them, with no placeholder left in it', (lang) => {
    const c = dictionaries[lang].contactPage.form
    let checked = 0
    for (const field of CONTACT_FIELD_ORDER) {
      for (const value of bad[field]) {
        const code = validateContact({ ...valid, [field]: value } as ContactDraft, options)[field] as ContactErrorCode | undefined
        expect(code, `${field} = ${String(value).slice(0, 12)}`).toBeDefined()
        const text = contactErrorText(c, field, code)
        expect(text?.trim(), `${lang}:${field}:${code}`).toBeTruthy()
        expect(text, `${lang}:${field}:${code}`).not.toMatch(/\{\w+\}/)
        checked++
      }
    }
    expect(checked).toBe(14)
  })

  it('names the limit that applies to the field', () => {
    const c = dictionaries.en.contactPage.form
    expect(contactErrorText(c, 'message', 'tooShort')).toContain(String(CONTACT_LIMITS.message.min))
    expect(contactErrorText(c, 'subject', 'tooLong')).toContain(String(CONTACT_LIMITS.subject.max))
    expect(contactErrorText(c, 'name', undefined)).toBeUndefined()
  })
})

describe('the summary offered when nothing can be sent', () => {
  it.each(LANGUAGES)('lists the topic, subject, message, name and e-mail in %s', (lang) => {
    const c = dictionaries[lang].contactPage.form
    const text = buildContactSummary(valid, lang, c)
    expect(text.split('\n')[0]).toBe(c.summary.title)
    expect(text).toContain(c.fields.kind.options.project)
    expect(text).toContain(valid.subject)
    expect(text).toContain(valid.message)
    expect(text).toContain(valid.email)
  })
})

describe('the words of the page', () => {
  it('use the Hungarian of the brief for the headline, the two doors and the four topics', () => {
    const hu = dictionaries.hu.contactPage
    expect(hu.hero.title).toBe('Van egy jó ötleted?')
    expect(hu.hero.lead).toBe('Beszéljünk róla. Legyen szó egy új projektről, szakmai lehetőségről vagy együttműködésről, szívesen meghallgatom.')
    expect(hu.hero.employers.title).toBe('Szakmai lehetőség, fejlesztői pozíció vagy csapatmunka.')
    expect(hu.hero.employers.cta).toBe('Beszéljünk a lehetőségről')
    expect(hu.hero.clients.title).toBe('Weboldal, webalkalmazás vagy egyedi digitális megoldás.')
    expect(hu.hero.clients.cta).toBe('Indítsunk projektet')
    expect(Object.values(hu.form.fields.kind.options)).toEqual(['Álláslehetőség', 'Együttműködés', 'Webfejlesztési projekt', 'Egyéb'])
  })

  it('show no e-mail address in any language, only words', () => {
    for (const lang of LANGUAGES) {
      const strings: string[] = []
      const walk = (value: unknown) => {
        if (typeof value === 'string') strings.push(value)
        else if (Array.isArray(value)) value.forEach(walk)
        else if (value && typeof value === 'object') Object.values(value).forEach(walk)
      }
      walk(dictionaries[lang].contactPage)
      walk(localize(shopText, lang))
      for (const text of strings) expect(text, lang).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
    }
  })

  it('keep the same {placeholders} in every language, string by string', () => {
    const flat = (value: unknown, path: string): Array<[string, string]> =>
      typeof value === 'string'
        ? [[path, value]]
        : Array.isArray(value)
          ? value.flatMap((item, i) => flat(item, `${path}[${i}]`))
          : value && typeof value === 'object'
            ? Object.entries(value).flatMap(([key, item]) => flat(item, `${path}.${key}`))
            : []
    const tokens = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    const reference = new Map(flat(dictionaries.hu.contactPage, 'contactPage').map(([path, text]) => [path, tokens(text)]))
    for (const lang of ['en', 'nl'] as const) {
      const other = flat(dictionaries[lang].contactPage, 'contactPage')
      expect(other.length, lang).toBe(reference.size)
      for (const [path, text] of other) expect(tokens(text), `${lang}: ${path}`).toEqual(reference.get(path))
    }
  })

  it('differ between the languages', () => {
    for (const key of ['title', 'lead'] as const) {
      expect(new Set(LANGUAGES.map((lang) => dictionaries[lang].contactPage.hero[key])).size, key).toBe(3)
    }
  })
})
