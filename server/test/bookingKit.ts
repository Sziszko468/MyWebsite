import { expect } from 'vitest'
import { startServer, type TestServer } from './helpers.ts'

/**
 * What the booking tests share: a server whose owner has opened booking through the REAL administration endpoints (a type with a length, weekly
 * hours, the settings), a way to book, and a way to read what was e-mailed. The clock starts on Tuesday 3 November 2026, 11:00 in Budapest
 * (10:00 UTC), so the first bookable weekday is Wednesday 4 November: 09:00, 10:00, 11:00, 13:00, 14:00, 15:00 and 16:00 local, which in
 * winter time is one hour earlier in UTC.
 */

export const ZONE = 'Europe/Budapest'
/** Wednesday 4 November 2026, in UTC (Budapest is UTC+1 then). */
export const WEDNESDAY = '2026-11-04'
export const SLOT_9 = '2026-11-04T08:00:00.000Z'
export const SLOT_10 = '2026-11-04T09:00:00.000Z'
export const SLOT_11 = '2026-11-04T10:00:00.000Z'
export const SLOT_13 = '2026-11-04T12:00:00.000Z'
export const SLOT_14 = '2026-11-04T13:00:00.000Z'

export const WEEK_HOURS = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, start: '09:00', end: '12:00' },
  { weekday, start: '13:00', end: '17:00' },
])

export interface Kit {
  server: TestServer
  /** The headers an administrator's request carries. */
  admin: Record<string, string>
  editor: Record<string, string>
  api: TestServer['api']
  /** Everything the administrator does through an endpoint, answered or thrown if it was refused. */
  put(path: string, body: unknown): Promise<any>
  post(path: string, body: unknown): Promise<any>
  /** Makes a booking as a visitor. */
  book(overrides?: Record<string, unknown>): Promise<{ status: number; json: any; headers: Headers; text: string }>
  /** The free slots of a type, flattened to start instants. */
  slots(from: string, to: string, code?: string): Promise<string[]>
  /** Lets the outbox send what is due. */
  settle(): Promise<void>
  /** The mail sent to an address (most recent last). */
  mailTo(address: string): { subject: string; text: string; html: string; to: string }[]
  /** The secure link in a message's text. */
  linkIn(text: string): string
  /** The token of a link. */
  tokenOf(link: string): string
  /** Changes the owner's settings. */
  settings(changes: Record<string, unknown>): Promise<any>
  close(): Promise<void>
}

let counter = 0

export async function makeKit(options: { env?: Record<string, string>; settings?: Record<string, unknown>; hours?: unknown[]; open?: boolean; duration?: number } = {}): Promise<Kit> {
  const server = await startServer({ env: { PUBLIC_URL: 'https://site.test', ...options.env } })
  const owner = await server.signIn('admin', 'owner@site.test')
  const helper = await server.signIn('editor', 'editor@site.test')
  const admin = { Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf }
  const editor = { Cookie: helper.cookie, 'X-CSRF-Token': helper.csrf }
  const send = async (method: string, path: string, body: unknown) => {
    const response = await server.api(path, { method, body, headers: admin })
    if (response.status >= 300) throw new Error(`${method} ${path} failed in a test: ${response.status} ${response.text}`)
    return response.json.data
  }
  if (options.open !== false) {
    await send('PUT', '/api/admin/consultation-types/discovery', { durationMinutes: options.duration ?? 60, enabled: true })
    await send('PUT', '/api/admin/booking-hours', { hours: options.hours ?? WEEK_HOURS })
    await send('PUT', '/api/admin/booking-settings', { enabled: true, timeZone: ZONE, slotStepMinutes: 60, bufferMinutes: 0, minNoticeHours: 12, horizonDays: 365, ...options.settings })
  }
  const kit: Kit = {
    server,
    admin,
    editor,
    api: server.api,
    put: (path, body) => send('PUT', path, body),
    post: (path, body) => send('POST', path, body),
    async book(overrides = {}) {
      counter += 1
      return server.api('/api/consultations/bookings', {
        body: { language: 'en', type: 'discovery', start: SLOT_9, name: 'Anna Kovács', email: `visitor${counter}@example.com`, consent: true, ...overrides },
      })
    },
    async slots(from, to, code = 'discovery') {
      const response = await server.api(`/api/consultations/types/${code}/days?from=${from}&to=${to}`)
      expect(response.status, response.text).toBe(200)
      return (response.json.data.days as { slots: { start: string }[] }[]).flatMap((day) => day.slots.map((slot) => slot.start))
    },
    async settle() {
      await server.app.context.notifier.processDue()
    },
    mailTo: (address) => server.mailer.sent.filter((message) => message.to === address).map((message) => ({ subject: message.subject, text: message.text, html: message.html, to: message.to })),
    linkIn(text) {
      const match = /https:\/\/site\.test\/(?:hu|en|nl)\/consultation\/booking\/[A-Za-z0-9_-]{43}/.exec(text)
      if (!match) throw new Error(`no booking link in: ${text.slice(0, 200)}`)
      return match[0]
    },
    tokenOf: (link) => link.slice(link.lastIndexOf('/') + 1),
    settings: (changes) => send('PUT', '/api/admin/booking-settings', changes),
    close: () => server.close(),
  }
  return kit
}
