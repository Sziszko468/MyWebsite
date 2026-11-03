import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consentActions, consentStore, mayMeasure, parseConsent, privacySignal } from './consent'
import { endpointProvider } from './endpointProvider'
import { EVENT_NAMES, type AnalyticsEvent } from './events'
import { measurementIsOffered } from './offer'
import { setupAnalytics } from './setup'
import { clearProviders, hasProviders, registerProvider, sanitize, track } from './tracker'

const SRC = join(process.cwd(), 'src')
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('sanitize', () => {
  it('keeps ids, small whole numbers and yes/no', () => {
    expect(sanitize({ service: 'website', needs: 3, ok: true, plan: 'launch' })).toEqual({ service: 'website', needs: 3, ok: true, plan: 'launch' })
  })

  it('drops everything that could be text a visitor wrote', () => {
    const typed = 'Hello, I need a webshop for my bakery in Utrecht, call me on +31 6 1234 5678 or mail jan@example.com'
    expect(sanitize({ message: typed, name: 'Jan de Vries', email: 'jan@example.com', phone: '+31 6 1234 5678', url: 'https://example.com/x' })).toEqual({})
    expect(sanitize({ a: 'x'.repeat(41), b: 'Has Space', c: 'UPPER', d: '' })).toEqual({})
  })

  it('drops numbers that are not counts, and values that are not plain', () => {
    expect(sanitize({ a: 1.5, b: -1, c: 1000, d: Number.NaN, e: { nested: 'x' }, f: ['a'], g: null, h: undefined })).toEqual({})
  })
})

describe('consent', () => {
  it('reads only an exact version-1 record, and treats anything else as no choice', () => {
    expect(parseConsent(JSON.stringify({ v: 1, analytics: true }))).toBe('granted')
    expect(parseConsent(JSON.stringify({ v: 1, analytics: false }))).toBe('denied')
    for (const raw of [null, undefined, '', 'true', '{', '{"v":2,"analytics":true}', '{"v":1,"analytics":"yes"}', '[]', 'null']) {
      expect(parseConsent(raw), String(raw)).toBe('unknown')
    }
  })

  it('counts the browser signals as a refusal, whatever was answered', () => {
    expect(privacySignal({ globalPrivacyControl: true })).toBe(true)
    expect(privacySignal({ doNotTrack: '1' })).toBe(true)
    expect(privacySignal({ doNotTrack: '0' })).toBe(false)
    expect(privacySignal({})).toBe(false)
    expect(mayMeasure('granted', true)).toBe(false)
    expect(mayMeasure('granted', false)).toBe(true)
    expect(mayMeasure('unknown', false)).toBe(false)
    expect(mayMeasure('denied', false)).toBe(false)
  })
})

describe('track', () => {
  const received: AnalyticsEvent[] = []

  beforeEach(() => {
    received.length = 0
    clearProviders()
    consentActions.reset()
    registerProvider({ id: 'test', send: (event) => void received.push(event) })
  })
  afterEach(() => {
    clearProviders()
    consentActions.reset()
  })

  it('sends nothing until the visitor has agreed, and drops (never queues) what happened before', () => {
    track('project_opened', { project: 'spendly' })
    expect(received).toEqual([])
    consentActions.grant()
    expect(received, 'the earlier event is gone, not delivered late').toEqual([])
    track('project_opened', { project: 'spendly' })
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ name: 'project_opened', props: { project: 'spendly' }, page: '/', lang: 'hu' })
    expect(typeof received[0].time).toBe('number')
  })

  it('stops sending when the visitor declines or takes the choice back', () => {
    consentActions.grant()
    consentActions.deny()
    track('service_viewed', { service: 'website' })
    expect(consentStore.get()).toBe('denied')
    expect(received).toEqual([])
    consentActions.grant()
    consentActions.reset()
    track('service_viewed', { service: 'website' })
    expect(received).toEqual([])
  })

  it('never lets free text through, even if a call site tries', () => {
    consentActions.grant()
    track('quote_request_submitted', { form: 'contact', items: 0, message: 'a private project description' } as never)
    expect(received[0].props).toEqual({ form: 'contact', items: 0 })
    expect(JSON.stringify(received)).not.toContain('private')
  })

  it('ignores an event it does not know', () => {
    consentActions.grant()
    track('made_up_event' as never, {} as never)
    expect(received).toEqual([])
  })

  it('is not broken by a provider that throws, and still reaches the others', () => {
    consentActions.grant()
    registerProvider({
      id: 'broken',
      send: () => {
        throw new Error('boom')
      },
    })
    expect(() => track('lab_experience_opened', { experiment: 'liquid-matter' })).not.toThrow()
    expect(received).toHaveLength(1)
  })
})

describe('the shipped site measures nothing', () => {
  it('registers no provider while no collector is configured, so nothing is asked and nothing is sent', () => {
    clearProviders()
    setupAnalytics()
    expect(import.meta.env.VITE_ANALYTICS_ENDPOINT).toBeUndefined()
    expect(hasProviders()).toBe(false)
    expect(measurementIsOffered()).toBe(false)
    consentActions.grant()
    track('project_opened', { project: 'spendly' })
    consentActions.reset()
  })

  it('has no third-party measurement or tracking code, host or cookie anywhere in the sources', () => {
    const vendors = /google-analytics|googletagmanager|gtag\(|plausible\.io|matomo|hotjar|clarity\.ms|segment\.(io|com)|mixpanel|posthog|fullstory|facebook\.net|connect\.facebook|doubleclick|sentry\.io|datadoghq/i
    for (const file of sources()) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(vendors)
      expect(text, file).not.toMatch(/document\.cookie/)
    }
  })

  it('reports every event it declares from somewhere, and nothing it does not declare', () => {
    const used = new Set<string>()
    for (const file of sources()) {
      if (file.includes(join('src', 'analytics'))) continue
      for (const match of readFileSync(file, 'utf8').matchAll(/\btrack\('([a-z_]+)'/g)) used.add(match[1])
    }
    expect([...used].sort()).toEqual([...EVENT_NAMES].sort())
  })
})

describe('the collector provider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the event with no credentials and no referrer, as plain text so no preflight is needed', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchMock)
    const event: AnalyticsEvent = { name: 'project_opened', props: { project: 'spendly' }, page: '/work/spendly', lang: 'en', time: 1 }
    endpointProvider('https://collector.example/e').send(event)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://collector.example/e')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true })
    expect((init.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/)
    expect(JSON.parse(init.body as string)).toEqual(event)
  })

  it('prefers sendBeacon, so an event sent as the page closes still arrives', () => {
    const beacon = vi.fn(() => true)
    const fetchMock = vi.fn()
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    vi.stubGlobal('fetch', fetchMock)
    endpointProvider('https://collector.example/e').send({ name: 'service_viewed', props: { service: 'ui' }, page: '/services/ui', lang: 'nl', time: 2 })
    expect(beacon).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
