import { afterEach, describe, expect, it, vi } from 'vitest'
import { LANGUAGES } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { errorText } from './messages'
import { createTransport, endpointTransport, normalizeEndpoint, unavailableTransport } from './submit'
import { buildSummary, mailtoHref, packageLabel, summaryRows } from './summary'
import {
  EMPTY_DRAFT,
  PACKAGE_CHOICES,
  PROJECT_TYPES,
  STEPS,
  TIMINGS,
  type FieldId,
  type QuoteDraft,
  type QuoteRequest,
} from './types'
import {
  LIMITS,
  STEP_FIELDS,
  firstInvalidStep,
  isEmail,
  isPhone,
  toRequest,
  validateStep,
  type ErrorCode,
} from './validation'

const options = { requireConsent: true }

const valid: QuoteDraft = {
  projectType: 'webapp',
  package: 'build',
  description: 'A booking application for a small studio, with a calendar and reminders.',
  reference: 'https://example.com/old-site',
  budget: '',
  timing: 'months',
  name: 'Test Person',
  email: 'test.person@example.com',
  phone: '',
  consent: true,
}

const withField = <K extends FieldId>(field: K, value: QuoteDraft[K]): QuoteDraft => ({ ...valid, [field]: value })
const codes = (step: (typeof STEPS)[number], draft: QuoteDraft, opts = options) => validateStep(step, draft, opts)

describe('the four steps', () => {
  it('own every answer exactly once, in the order the seven questions are asked', () => {
    const owned = STEPS.flatMap((step) => STEP_FIELDS[step])
    expect([...owned].sort()).toEqual(Object.keys(EMPTY_DRAFT).sort())
    expect(new Set(owned).size).toBe(owned.length)
    expect(STEP_FIELDS.project).toEqual(['projectType', 'package'])
  })

  it('start empty, so nothing is answered for the visitor', () => {
    expect(EMPTY_DRAFT.projectType).toBeNull()
    expect(EMPTY_DRAFT.package).toBeNull()
    expect(EMPTY_DRAFT.consent).toBe(false)
    expect(firstInvalidStep(EMPTY_DRAFT, options)?.step).toBe('project')
  })
})

describe('step 1: the project and the package', () => {
  it('needs both answers, and accepts "not sure" for each', () => {
    expect(codes('project', EMPTY_DRAFT)).toEqual({ projectType: 'required', package: 'required' })
    expect(codes('project', { ...valid, projectType: 'unsure', package: 'unsure' })).toEqual({})
  })

  it('accepts every kind of project and every package choice, and nothing else', () => {
    for (const type of PROJECT_TYPES) expect(codes('project', withField('projectType', type))).toEqual({})
    for (const choice of PACKAGE_CHOICES) expect(codes('project', withField('package', choice))).toEqual({})
    // @ts-expect-error not a project type
    expect(codes('project', withField('projectType', 'toaster'))).toEqual({ projectType: 'required' })
  })
})

describe('step 2: the description and the reference', () => {
  it('needs a description of some substance', () => {
    expect(codes('details', withField('description', ''))).toEqual({ description: 'required' })
    expect(codes('details', withField('description', '     \n  '))).toEqual({ description: 'required' })
    expect(codes('details', withField('description', 'x'.repeat(LIMITS.description.min - 1)))).toEqual({ description: 'tooShort' })
    expect(codes('details', withField('description', 'x'.repeat(LIMITS.description.min)))).toEqual({})
    expect(codes('details', withField('description', 'x'.repeat(LIMITS.description.max + 1)))).toEqual({ description: 'tooLong' })
  })

  it('counts the length without the spaces around it', () => {
    const padded = `   ${'x'.repeat(LIMITS.description.min - 1)}   `
    expect(codes('details', withField('description', padded))).toEqual({ description: 'tooShort' })
  })

  it('lets the reference stay empty', () => {
    expect(codes('details', withField('reference', ''))).toEqual({})
    expect(codes('details', withField('reference', 'x'.repeat(LIMITS.reference.max + 1)))).toEqual({ reference: 'tooLong' })
  })
})

describe('step 3: the optional answers', () => {
  it('passes with nothing filled in', () => {
    expect(codes('extras', { ...valid, budget: '', timing: null })).toEqual({})
  })

  it('still limits the size of what is written, and the choices that exist', () => {
    expect(codes('extras', withField('budget', 'x'.repeat(LIMITS.budget.max + 1)))).toEqual({ budget: 'tooLong' })
    for (const timing of TIMINGS) expect(codes('extras', withField('timing', timing))).toEqual({})
    // @ts-expect-error not a timing
    expect(codes('extras', withField('timing', 'yesterday'))).toEqual({ timing: 'required' })
  })
})

describe('step 4: how to reach the visitor', () => {
  it('needs a name and an e-mail address, and nothing else', () => {
    expect(codes('contact', { ...valid, name: '', email: '', consent: true })).toEqual({ name: 'required', email: 'required' })
    expect(codes('contact', valid)).toEqual({})
  })

  it('refuses a name that is one letter or a novel', () => {
    expect(codes('contact', withField('name', 'A'))).toEqual({ name: 'tooShort' })
    expect(codes('contact', withField('name', 'x'.repeat(LIMITS.name.max + 1)))).toEqual({ name: 'tooLong' })
  })

  it('recognises an e-mail address that cannot be one', () => {
    const bad = ['plain', 'a@b', '@example.com', 'a@@example.com', 'a b@example.com', 'a@example..com', 'a@.com', 'a@example.', 'a@example.com ,b@example.com']
    for (const email of bad) {
      expect(isEmail(email), email).toBe(false)
      expect(codes('contact', withField('email', email)), email).toEqual({ email: 'invalidEmail' })
    }
    for (const email of ['a@example.com', 'first.last+tag@sub.example.co.uk', 'a_b-c@exam-ple.nl']) {
      expect(isEmail(email), email).toBe(true)
    }
  })

  it('keeps the e-mail address within the length the standard allows', () => {
    const long = `${'a'.repeat(250)}@example.com`
    expect(codes('contact', withField('email', long))).toEqual({ email: 'tooLong' })
  })

  it('takes a phone number as optional, loose in format, firm about nonsense', () => {
    expect(codes('contact', withField('phone', ''))).toEqual({})
    for (const phone of ['+36 30 123 4567', '+31 (0)6 1234 5678', '06-12345678', '020/1234567']) {
      expect(isPhone(phone), phone).toBe(true)
      expect(codes('contact', withField('phone', phone))).toEqual({})
    }
    for (const phone of ['12345', 'call me', '+36 30 abc 4567', '<script>1234567</script>']) {
      expect(isPhone(phone), phone).toBe(false)
      expect(codes('contact', withField('phone', phone))).toEqual({ phone: 'invalidPhone' })
    }
  })

  it('asks for the acknowledgement only while the configuration says so', () => {
    expect(codes('contact', withField('consent', false))).toEqual({ consent: 'consentRequired' })
    expect(codes('contact', withField('consent', false), { requireConsent: false })).toEqual({})
  })
})

describe('the whole form', () => {
  it('names the first step that is not acceptable', () => {
    expect(firstInvalidStep(valid, options)).toBeNull()
    expect(firstInvalidStep({ ...valid, description: '' }, options)?.step).toBe('details')
    expect(firstInvalidStep({ ...valid, email: 'nope' }, options)).toEqual({ step: 'contact', errors: { email: 'invalidEmail' } })
  })

  it('builds the request from trimmed answers, with empty optional answers as null and the language attached', () => {
    const request = toRequest(
      { ...valid, description: `  ${valid.description}  `, reference: '  ', budget: ' ', phone: '', name: ' Test Person ', timing: null },
      'nl',
    )
    expect(request).toEqual<QuoteRequest>({
      language: 'nl',
      projectType: 'webapp',
      package: 'build',
      description: valid.description,
      reference: null,
      budget: null,
      timing: null,
      name: 'Test Person',
      email: 'test.person@example.com',
      phone: null,
    })
  })

  it('does not build a request from an incomplete form', () => {
    expect(() => toRequest(EMPTY_DRAFT, 'hu')).toThrow()
  })

  it('never puts the consent box, or anything else that is not an answer, into the request', () => {
    expect(Object.keys(toRequest(valid, 'hu')).sort()).toEqual(
      ['budget', 'description', 'email', 'language', 'name', 'package', 'phone', 'projectType', 'reference', 'timing'].sort(),
    )
  })
})

describe('the words for every problem', () => {
  // Bad values for each answer; whatever code they raise must have a sentence in every language.
  const bad: Record<FieldId, unknown[]> = {
    projectType: [null],
    package: [null],
    description: ['', 'x', 'x'.repeat(3000)],
    reference: ['x'.repeat(3000)],
    budget: ['x'.repeat(3000)],
    timing: ['nope'],
    name: ['', 'x', 'x'.repeat(500)],
    email: ['', 'nope', `${'a'.repeat(300)}@example.com`],
    phone: ['abc', 'x'.repeat(500)],
    consent: [false],
  }

  it.each(LANGUAGES)('has a sentence in %s for each of them', (lang) => {
    const q = dictionaries[lang].servicesPage.quote
    let checked = 0
    for (const step of STEPS) {
      for (const field of STEP_FIELDS[step]) {
        for (const value of bad[field]) {
          const code = validateStep(step, { ...valid, [field]: value } as QuoteDraft, options)[field] as ErrorCode | undefined
          expect(code, `${field} = ${String(value).slice(0, 12)}`).toBeDefined()
          const text = errorText(q, field, code)
          expect(text?.trim(), `${lang}:${field}:${code}`).toBeTruthy()
          expect(text, `${lang}:${field}:${code}`).not.toMatch(/\{\w+\}/)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(15)
  })

  it('names the limit that applies to the field', () => {
    const q = dictionaries.en.servicesPage.quote
    expect(errorText(q, 'description', 'tooShort')).toContain(String(LIMITS.description.min))
    expect(errorText(q, 'name', 'tooShort')).toContain(String(LIMITS.name.min))
    expect(errorText(q, 'description', 'tooLong')).toContain(String(LIMITS.description.max))
    expect(errorText(q, 'phone', 'tooLong')).toContain(String(LIMITS.phone.max))
    expect(errorText(q, 'name', undefined)).toBeUndefined()
  })
})

describe('where the request goes', () => {
  it('accepts an https address, and a local http one only when asked to', () => {
    expect(normalizeEndpoint('https://forms.example.com/quote')).toBe('https://forms.example.com/quote')
    expect(normalizeEndpoint('  https://forms.example.com/quote  ')).toBe('https://forms.example.com/quote')
    expect(normalizeEndpoint('http://localhost:8787/quote')).toBeNull()
    expect(normalizeEndpoint('http://localhost:8787/quote', true)).toBe('http://localhost:8787/quote')
    expect(normalizeEndpoint('http://127.0.0.1:8787/quote', true)).toBe('http://127.0.0.1:8787/quote')
  })

  it('treats everything else as not configured', () => {
    for (const value of [undefined, null, '', '   ', 42, 'forms.example.com', 'http://forms.example.com/quote', 'javascript:alert(1)', 'ftp://example.com', 'https://user:secret@example.com/quote']) {
      expect(normalizeEndpoint(value, true), String(value)).toBeNull()
    }
    expect(normalizeEndpoint('http://example.com/quote', true)).toBeNull()
  })

  it('uses the endpoint from the configuration only if it is a valid address, and sends nowhere otherwise', async () => {
    const { quoteConfig } = await import('../config/quote')
    expect(quoteConfig.endpoint === null || normalizeEndpoint(quoteConfig.endpoint, true) === quoteConfig.endpoint).toBe(true)
    expect(createTransport(quoteConfig.endpoint).id).toBe(quoteConfig.endpoint ? 'endpoint' : 'none')
    expect(createTransport(null).id).toBe('none')
    expect(createTransport('https://forms.example.com/quote').id).toBe('endpoint')
  })
})

describe('sending', () => {
  const request = toRequest(valid, 'hu')

  afterEach(() => vi.useRealTimers())

  it('says "unavailable" and sends nothing when there is no endpoint', async () => {
    const fetchImpl = vi.fn()
    expect(createTransport(null).id).toBe('none')
    await expect(unavailableTransport.submit(request)).resolves.toEqual({ status: 'unavailable' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts the request as JSON, without credentials or a referrer, and says "sent" for a 2xx answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const transport = endpointTransport('https://forms.example.com/quote', { fetchImpl })
    await expect(transport.submit(request)).resolves.toEqual({ status: 'sent' })

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://forms.example.com/quote')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(init.referrerPolicy).toBe('no-referrer')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual(request)
  })

  it.each([400, 404, 422, 500, 503])('does not say "sent" for a %s answer', async (status) => {
    const transport = endpointTransport('https://forms.example.com/quote', {
      fetchImpl: vi.fn().mockResolvedValue(new Response('no', { status })),
    })
    await expect(transport.submit(request)).resolves.toEqual({ status: 'failed', reason: 'rejected' })
  })

  it('does not say "sent" when the network fails', async () => {
    const transport = endpointTransport('https://forms.example.com/quote', {
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    })
    await expect(transport.submit(request)).resolves.toEqual({ status: 'failed', reason: 'network' })
  })

  it('gives up on a service that never answers, and says it timed out', async () => {
    vi.useFakeTimers()
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })) as unknown as typeof fetch
    const transport = endpointTransport('https://forms.example.com/quote', { fetchImpl: hanging, timeoutMs: 5000 })

    const outcome = transport.submit(request)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(outcome).resolves.toEqual({ status: 'failed', reason: 'timeout' })
  })

  it('is the only code in the quote module that talks to the network or to storage', async () => {
    const files = import.meta.glob('./*.ts', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
    for (const [file, source] of Object.entries(files)) {
      if (file.endsWith('.test.ts')) continue
      const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(body, file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon|console\./)
      if (!file.endsWith('submit.ts')) expect(body, file).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket/)
    }
  })
})

describe('the summary', () => {
  it.each(LANGUAGES)('lists every answer in %s, and a dash for the ones not given', (lang) => {
    const q = dictionaries[lang].servicesPage.quote
    const rows = summaryRows(valid, q, { contact: true })
    expect(rows.map(([label]) => label)).toEqual([
      q.summary.labels.projectType,
      q.summary.labels.package,
      q.summary.labels.description,
      q.summary.labels.reference,
      q.summary.labels.budget,
      q.summary.labels.timing,
      q.summary.labels.name,
      q.summary.labels.email,
      q.summary.labels.phone,
    ])
    expect(rows.find(([label]) => label === q.summary.labels.budget)?.[1]).toBe(q.summary.empty)
    expect(rows.find(([label]) => label === q.summary.labels.package)?.[1]).toBe('Build')
    expect(summaryRows(valid, q, { contact: false })).toHaveLength(6)
  })

  it('names the package, or says the visitor is not sure', () => {
    const q = dictionaries.en.servicesPage.quote
    expect(packageLabel('care', q)).toBe('Care')
    expect(packageLabel('unsure', q)).toBe(q.fields.package.unsure)
  })

  it('is plain text with the title first and the language last', () => {
    const q = dictionaries.hu.servicesPage.quote
    const text = buildSummary(valid, 'hu', q)
    const lines = text.split('\n')
    expect(lines[0]).toBe(q.summary.title)
    expect(lines.at(-1)).toBe(`${q.summary.labels.language}: Magyar`)
    expect(text).toContain(valid.email)
    expect(text).toContain(valid.description)
  })

  it('puts a multi-line description under its label', () => {
    const q = dictionaries.en.servicesPage.quote
    const text = buildSummary({ ...valid, description: 'First line\nSecond line' }, 'en', q)
    expect(text).toContain(`${q.summary.labels.description}:\nFirst line\nSecond line`)
  })

  it('makes a mailto: link that carries the text safely', () => {
    const href = mailtoHref('hello@example.com', 'Quote & more', 'Line one\nLine two? "yes"')
    expect(href.startsWith('mailto:hello@example.com?subject=')).toBe(true)
    expect(href).not.toMatch(/[\n" ]/)
    const url = new URL(href)
    expect(url.searchParams.get('subject')).toBe('Quote & more')
    expect(url.searchParams.get('body')).toBe('Line one\nLine two? "yes"')
  })
})
