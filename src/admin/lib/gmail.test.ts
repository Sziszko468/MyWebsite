import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError, configureApi, setCsrfToken } from '../api/client'
import * as endpoints from '../api/endpoints'
import type { GmailStatus } from '../api/types'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { GMAIL_ERROR_CATEGORIES, checkGmail, gmailErrorText, gmailState, runOnce, type RunningCall } from './gmail'

const status = (changes: Partial<GmailStatus> = {}): GmailStatus => ({ configured: true, connected: false, accountEmail: 'mailbox@site.test', lastError: null, checkedAt: null, ...changes })

describe('the state of the Gmail connection', () => {
  it('is "not configured" whatever else the status says', () => {
    expect(gmailState(status({ configured: false, lastError: 'not_configured' }))).toBe('not_configured')
    expect(gmailState(status({ configured: false, connected: true }))).toBe('not_configured')
  })

  it('is "not checked" when it is set up and nobody has asked Google yet', () => {
    expect(gmailState(status())).toBe('not_checked')
  })

  it('is "connected" or "failed" once Google has answered', () => {
    expect(gmailState(status({ connected: true, checkedAt: '2026-11-15T10:00:00.000Z' }))).toBe('connected')
    expect(gmailState(status({ lastError: 'invalid_grant', checkedAt: '2026-11-15T10:00:00.000Z' }))).toBe('failed')
  })
})

describe('the words for a Gmail error', () => {
  it.each([['en', en], ['hu', hu]] as const)('exist in %s for every category the backend can send, each with its own sentence', (_name, dictionary) => {
    const sentences = GMAIL_ERROR_CATEGORIES.map((category) => gmailErrorText(dictionary, category))
    for (const [index, sentence] of sentences.entries()) expect(sentence.trim().length, GMAIL_ERROR_CATEGORIES[index]).toBeGreaterThan(10)
    expect(new Set(sentences).size).toBe(GMAIL_ERROR_CATEGORIES.length)
    expect(sentences).not.toContain(dictionary.settings.gmail.errors.unknown)
  })

  it('say "unknown" for a category it does not know, for nothing, and for names that only exist on every object', () => {
    for (const category of [null, 'something_new', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(gmailErrorText(en, category), String(category)).toBe(en.settings.gmail.errors.unknown)
      expect(gmailErrorText(hu, category), String(category)).toBe(hu.settings.gmail.errors.unknown)
    }
  })

  it('cover exactly the categories the backend’s service has (the list cannot drift unnoticed)', () => {
    const source = readFileSync(new URL('../../../server/src/modules/gmail/tokenService.ts', import.meta.url), 'utf8')
    // (Whatever the line endings of the checkout: the union is everything between its declaration and the next one.)
    const union = /export type GmailErrorCategory =([^]*?)const MESSAGES/.exec(source)?.[1] ?? ''
    const backend = [...union.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort()
    expect(backend.length).toBeGreaterThan(5)
    expect([...GMAIL_ERROR_CATEGORIES].sort()).toEqual(backend)
  })
})

describe('the Gmail texts in both languages', () => {
  const required = ['title', 'lead', 'configuration', 'configured', 'notConfigured', 'connection', 'connected', 'failed', 'notChecked', 'mailbox', 'noMailbox', 'lastCheck', 'lastCheckOk', 'lastCheckFailed', 'neverChecked', 'lastError', 'check', 'checking', 'checkOk', 'checkFailed', 'notConfiguredHelp', 'notCheckedHelp', 'noPermission', 'errors'] as const

  it.each([['en', en], ['hu', hu]] as const)('%s has every text the panel uses, none empty', (_name, dictionary) => {
    const gmail = dictionary.settings.gmail as unknown as Record<string, unknown>
    for (const key of required) expect(gmail[key], key).toBeTruthy()
    for (const key of required.filter((name) => name !== 'errors')) expect(String(gmail[key]).trim(), key).not.toBe('')
    expect(Object.keys(dictionary.settings.gmail.errors).sort()).toEqual([...GMAIL_ERROR_CATEGORIES, 'unknown'].sort())
  })

  it('have the same keys, and the same placeholders, in English and in Hungarian', () => {
    const keys = (value: object) => Object.keys(value).sort()
    expect(keys(hu.settings.gmail)).toEqual(keys(en.settings.gmail))
    expect(keys(hu.settings.gmail.errors)).toEqual(keys(en.settings.gmail.errors))
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    expect(placeholders(hu.settings.gmail.lastCheckOk)).toEqual(['when'])
    expect(placeholders(en.settings.gmail.lastCheckOk)).toEqual(['when'])
    expect(placeholders(hu.settings.gmail.checkFailed)).toEqual(['reason'])
    expect(placeholders(en.settings.gmail.checkFailed)).toEqual(['reason'])
  })

  it('say Hungarian in Hungarian: nothing is left in English', () => {
    for (const key of ['title', 'check', 'checking', 'connected', 'failed', 'notChecked', 'notConfigured'] as const) expect(hu.settings.gmail[key], key).not.toBe(en.settings.gmail[key])
  })

  it('label the two audit-log entries the checks write', () => {
    for (const dictionary of [en, hu]) for (const action of ['gmail.check', 'gmail.check_failed']) expect((dictionary.activity.actions as Record<string, string>)[action], action).toBeTruthy()
  })
})

describe('running a check', () => {
  it('says "works" (a success toast) and hands back the new status when Google issued a token', async () => {
    const connected = status({ connected: true, checkedAt: '2026-11-15T10:00:00.000Z' })
    expect(await checkGmail(en, async () => ({ data: connected }))).toEqual({ status: connected, tone: 'success', message: en.settings.gmail.checkOk })
    expect((await checkGmail(hu, async () => ({ data: connected }))).message).toBe(hu.settings.gmail.checkOk)
  })

  it('says why, in the administrator’s language (an error toast), and hands back the failed status, when it did not work', async () => {
    const failed = status({ lastError: 'invalid_grant', checkedAt: '2026-11-15T10:00:00.000Z' })
    const english = await checkGmail(en, async () => ({ data: failed }))
    expect(english).toMatchObject({ status: failed, tone: 'error' })
    expect(english.message).toBe(en.settings.gmail.checkFailed.replace('{reason}', en.settings.gmail.errors.invalid_grant))
    const hungarian = await checkGmail(hu, async () => ({ data: failed }))
    expect(hungarian.message).toBe(hu.settings.gmail.checkFailed.replace('{reason}', hu.settings.gmail.errors.invalid_grant))
    expect(hungarian.message).not.toBe(english.message)
  })

  it('never shows what a backend of the future might send as an error: it says "unknown"', async () => {
    const outcome = await checkGmail(en, async () => ({ data: status({ lastError: 'Token has been expired or revoked: ya29.secret' }) }))
    expect(outcome.message).toContain(en.settings.gmail.errors.unknown)
    expect(outcome.message).not.toContain('ya29')
  })

  it.each([
    [new ApiError(0, 'network', 'The server could not be reached.'), 'errorNetwork'],
    [new ApiError(403, 'forbidden', 'You are not allowed to do this.'), 'errorForbidden'],
    [new ApiError(429, 'rate_limited', 'Too many requests. Try again later.'), 'rateLimited'],
    [new ApiError(500, 'internal_error', 'Something went wrong on our side.'), 'errorGeneric'],
    [new Error('anything else'), 'errorGeneric'],
  ] as [unknown, keyof typeof en.states][])('says a check that could not be made in one sentence, keeping the old status on screen (%#)', async (error, key) => {
    const outcome = await checkGmail(en, async () => {
      throw error
    })
    expect(outcome).toEqual({ status: null, tone: 'error', message: en.states[key] })
  })

  it('sends the check as a POST with the session’s CSRF token, and reads the status with a GET without it', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    configureApi({
      fetch: async (url, init = {}) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({ data: status({ connected: true }) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    })
    setCsrfToken('csrf-token-1')
    expect((await endpoints.gmail.status()).data.connected).toBe(true)
    expect((await endpoints.gmail.check()).data.connected).toBe(true)
    const [read, check] = calls
    expect([read.url, read.init.method]).toEqual(['/api/admin/gmail/status', 'GET'])
    expect((read.init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
    expect([check.url, check.init.method, check.init.body]).toEqual(['/api/admin/gmail/check', 'POST', '{}'])
    expect((check.init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-token-1')
    expect(check.init.credentials).toBe('same-origin')
    setCsrfToken(null)
  })
})

describe('running one call at a time (no duplicate requests)', () => {
  let started: number
  let release: () => void
  let gate: Promise<void>
  beforeEach(() => {
    started = 0
    gate = new Promise<void>((resolve) => (release = resolve))
  })

  it('runs the call once however often it is pressed while it is under way, and gives every press the same answer', async () => {
    const slot: RunningCall<string> = { current: null }
    const press = () =>
      runOnce(slot, async () => {
        started += 1
        await gate
        return `answer ${started}`
      })
    const presses = [press(), press(), press()]
    expect(started).toBe(1)
    release()
    expect(await Promise.all(presses)).toEqual(['answer 1', 'answer 1', 'answer 1'])
    expect(slot.current, 'the slot is free again').toBeNull()
  })

  it('lets the next press through once the call has finished, also after it failed', async () => {
    const slot: RunningCall<number> = { current: null }
    let attempts = 0
    const press = () =>
      runOnce(slot, async () => {
        attempts += 1
        if (attempts === 1) throw new Error('first fails')
        return attempts
      })
    await expect(press()).rejects.toThrow('first fails')
    expect(await press()).toBe(2)
    expect(await press()).toBe(3)
  })
})
