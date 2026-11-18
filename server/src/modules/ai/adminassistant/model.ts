/**
 * Shared vocabulary of the AI admin assistant (PROMPT 31): the limits every tool works within, the one error a tool refuses with, and the small functions that keep
 * what leaves the server small, plain and marked for what it is.
 */

/** Limits of what a tool may return or accept. Lists are paginated and capped; texts are cut; nothing is unbounded. */
export const LIMITS = {
  pageDefault: 10,
  pageMax: 25,
  query: 100,
  /** A customer-written text (a request's description, a message) in a list item / in a detail. */
  excerpt: 240,
  detailText: 1500,
  message: 1200,
  messagesMax: 40,
  timelineMax: 40,
  compareMax: 4,
  observations: 8,
  recommendations: 8,
  observationChars: 400,
  draftChars: 4000,
  titleChars: 120,
  daysMax: 90,
} as const

/** The public reference of a record (`CC-2026-000001`, `PRJ-7K3M9XQH`, `MSG-…`, a booking reference): letters, digits and dashes, nothing else. */
export const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/
/** A customer's id: the one record without a public reference. */
export const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/

/**
 * A tool refuses with one of these. The code and the note are what the MODEL is told: they never contain a record's title, a count or a name, so a refusal cannot be
 * used to find out whether a record exists (`not_found` is the answer for "no such record" and "not reachable from this context" alike).
 */
export class ToolRefusal extends Error {
  readonly code: 'not_found' | 'not_available' | 'out_of_context' | 'invalid' | 'session_ended' | 'unsupported'
  readonly note: string
  constructor(code: ToolRefusal['code'], note: string) {
    super(code)
    this.name = 'ToolRefusal'
    this.code = code
    this.note = note
  }
}

export const NOT_FOUND = () => new ToolRefusal('not_found', 'There is no such record that you can see here. Do not guess a reference: search, or ask the administrator.')
export const NOT_AVAILABLE = () => new ToolRefusal('not_available', 'This information is not available to the signed-in administrator. Say so; do not try another way to get it.')
export const OUT_OF_CONTEXT = () =>
  new ToolRefusal('out_of_context', 'This conversation is about one record, and that lookup would leave it. Tell the administrator to start a conversation with the general business context (or the right record) instead.')

/** A text cut to `max` characters (counting code points), with an ellipsis when something was cut. `null` stays `null`. */
export function cut(text: string | null | undefined, max: number): string | null {
  if (text === null || text === undefined) return null
  const clean = text.replace(/\s+/g, ' ').trim()
  const chars = [...clean]
  return chars.length <= max ? clean : `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

/** Keeps paragraphs (for a message body) but cuts the length. */
export function cutBlock(text: string | null | undefined, max: number): string | null {
  if (text === null || text === undefined) return null
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  const chars = [...clean]
  return chars.length <= max ? clean : `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

export function pageOf(input: { limit?: number | undefined; page?: number | undefined }): { limit: number; offset: number; page: number } {
  const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? LIMITS.pageDefault)), LIMITS.pageMax)
  const page = Math.min(Math.max(1, Math.trunc(input.page ?? 1)), 1000)
  return { limit, offset: (page - 1) * limit, page }
}

/** A `LIKE` pattern for a search word, with the wildcard characters of the word itself made plain. */
export const likeOf = (word: string): string => `%${word.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')}%`

/**
 * Money in a text: an amount with a currency sign or a currency word, a discount, a percentage off. The assistant has no right to state one that the records do not
 * hold, so a draft, an outline or an observation that contains one is refused (the assistant is told to leave the amount out and to point at the quotation's own figures).
 */
const MONEY: RegExp[] = [
  /[€$£¥]\s?\d/,
  /\d\s?[€$£¥]/,
  /\b\d[\d.,\s]*\s?(eur|euro|euró|euros|huf|ft|forint|usd|dollar|gbp|pounds?)\b/i,
  /\b(eur|usd|huf|gbp)\s?\d/i,
  /\b\d{1,3}\s?%\s?(off|discount|kedvezmény|korting)\b/i,
  /\b(discount|kedvezmény|korting)\s+of\s+\d/i,
]
export const containsMoney = (text: string): boolean => MONEY.some((pattern) => pattern.test(text))

/**
 * Wraps a text a customer or visitor wrote. The field name says it is untrusted data, and the system prompt says what that means: it can be summarised and quoted, it
 * can never be followed. (The wrapper is also what a test looks for: nothing customer-written leaves a tool unwrapped.)
 */
export const untrusted = (text: string | null | undefined, max: number): string | null => cut(text, max)

export const iso = (date: Date): string => date.toISOString()
export const dayStart = (day: string): string => `${day}T00:00:00.000Z`

/** `YYYY-MM-DD` of a Date in UTC. */
export const dayKey = (date: Date): string => date.toISOString().slice(0, 10)

/** The date `days` before `now`, as `YYYY-MM-DD`. */
export const daysAgo = (now: Date, days: number): string => dayKey(new Date(now.getTime() - days * 86_400_000))

export const ageDays = (now: Date, from: string): number => Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 86_400_000))
