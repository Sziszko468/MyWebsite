import type { GmailConfig } from '../../config.ts'
import type { Logger } from '../../lib/logger.ts'
import { systemClock, type Clock } from '../../lib/time.ts'

/**
 * Gmail OAuth 2.0, step 1: turns the mailbox's refresh token into short-lived access tokens, and says whether that works.
 * Nothing here reads or sends mail, and nothing here is reachable from the browser.
 *
 * The rules this file keeps:
 *  - It uses `config.gmail` and nothing else: its own client and its own refresh token, never another Google integration's.
 *  - A credential or a token is never put in an error, a log line or a status. Google's answer is read, checked, and then only
 *    a category from a fixed list (and an HTTP status number) leaves this file; the text of an answer or of a network error
 *    never does, so neither can carry a secret out.
 *  - Without a complete configuration it makes no request at all.
 */

export const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/** What the mailbox must have granted: read it, send from it. Nothing broader is asked for. */
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'] as const

/** Why a connection does not work, in words that are safe to show: it says what to check, never what Google (or the network) said. */
export type GmailErrorCategory =
  | 'not_configured'
  | 'invalid_credentials'
  | 'invalid_grant'
  | 'insufficient_scope'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'network'
  | 'invalid_response'

const MESSAGES: Record<GmailErrorCategory, string> = {
  not_configured: 'Gmail is not configured.',
  invalid_credentials: 'Google rejected the Gmail client ID, client secret or refresh token.',
  invalid_grant: 'Google no longer accepts the Gmail refresh token (it expired or was revoked); authorize the account again.',
  insufficient_scope: 'The Gmail refresh token was not granted the permissions the integration needs.',
  rate_limited: 'Google is limiting token requests; try again later.',
  provider_unavailable: 'Google could not answer the token request; try again later.',
  network: 'Google could not be reached.',
  invalid_response: 'Google answered the token request with something the server cannot use.',
}

/** The only error this module throws. Its message is fixed text chosen by the category; it carries no cause and no response text. */
export class GmailAuthError extends Error {
  readonly category: GmailErrorCategory
  /** Google's HTTP status when it answered, otherwise null. A number, never text. */
  readonly httpStatus: number | null
  constructor(category: GmailErrorCategory, httpStatus: number | null = null) {
    super(MESSAGES[category])
    this.name = 'GmailAuthError'
    this.category = category
    this.httpStatus = httpStatus
  }
}

/** All a caller (or, later, the administration) may learn about the connection. */
export interface GmailConnectionStatus {
  /** All four settings are present and usable. */
  configured: boolean
  /** A usable access token was obtained (or is still valid from an earlier request). It does not mean the mailbox has been read. */
  connected: boolean
  /** The mailbox the integration is set up for, or null. Not a secret, and not verified with Google in this step. */
  accountEmail: string | null
  /** Why `connected` is false; null when connected. */
  lastError: GmailErrorCategory | null
}

export interface GmailTokenServiceOptions {
  /** Defaults to the global `fetch`; tests hand in a stand-in for Google. */
  fetch?: typeof fetch
  clock?: Clock
  /** Gets the category and HTTP status of a failure, and a note when it recovers; never a credential, a token or a response. */
  log?: Pick<Logger, 'info' | 'warn'>
  /** How long Google may take to answer one request. */
  timeoutMs?: number
}

export interface GmailTokenService {
  /**
   * A valid access token: the cached one, or a fresh one when there is none or it expires within a minute. Requests made at the
   * same time share one refresh. Throws `GmailAuthError` (and nothing else).
   */
  getAccessToken(): Promise<string>
  /** Whether the mailbox can be reached. Never throws, never returns more than the four fields of `GmailConnectionStatus`. */
  status(): Promise<GmailConnectionStatus>
}

/** A token is renewed this long before it expires, so one that is used straight away is still good when Google receives it. */
const REFRESH_MARGIN_MS = 60_000
/** Google's tokens last an hour; a longer lifetime in an answer is not believed. */
const MAX_LIFETIME_SECONDS = 3600
const DEFAULT_TIMEOUT_MS = 10_000

function categoryForStatus(status: number, body: unknown): GmailErrorCategory {
  if (status >= 500) return 'provider_unavailable'
  if (status === 429) return 'rate_limited'
  if (status === 400 || status === 401 || status === 403) {
    // Only Google's error code is looked at, and only to tell "the refresh token is dead" from "something else is wrong".
    const code = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
    return code === 'invalid_grant' ? 'invalid_grant' : 'invalid_credentials'
  }
  return 'invalid_response'
}

/** Checks Google's success answer. Returns what is needed from it, or null when anything is off. */
function readToken(body: unknown): { token: string; lifetimeMs: number; scope: string | null } | null {
  if (typeof body !== 'object' || body === null) return null
  const { access_token: token, expires_in: lifetime, token_type: type, scope } = body as Record<string, unknown>
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096 || /\s/.test(token)) return null
  if (typeof lifetime !== 'number' || !Number.isFinite(lifetime) || lifetime <= 0) return null
  if (type !== undefined && (typeof type !== 'string' || type.toLowerCase() !== 'bearer')) return null
  return { token, lifetimeMs: Math.min(lifetime, MAX_LIFETIME_SECONDS) * 1000, scope: typeof scope === 'string' ? scope : null }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text())
  } catch {
    return null
  }
}

export function createGmailTokenService(config: GmailConfig, options: GmailTokenServiceOptions = {}): GmailTokenService {
  const clock = options.clock ?? systemClock
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let cached: { token: string; expiresAt: number } | null = null
  let inFlight: Promise<string> | null = null
  let lastFailure: GmailErrorCategory | null = null

  async function exchange(): Promise<string> {
    const fetchImpl = options.fetch ?? fetch
    const requestedAt = clock.now().getTime()
    let response: Response
    try {
      response = await fetchImpl(GMAIL_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: 'refresh_token' }).toString(),
        // The credentials are in this request: never follow it somewhere else, never wait for it forever.
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      // What the network layer said is dropped on purpose: it can quote the address, and an address can carry a secret.
      throw new GmailAuthError('network')
    }
    const body = await readJson(response)
    if (!response.ok) throw new GmailAuthError(categoryForStatus(response.status, body), response.status)
    const answer = readToken(body)
    if (!answer) throw new GmailAuthError('invalid_response', response.status)
    // Google lists what the token may do. If it says, it must include everything the integration needs.
    if (answer.scope !== null) {
      const granted = answer.scope.split(/\s+/)
      if (!GMAIL_SCOPES.every((scope) => granted.includes(scope))) throw new GmailAuthError('insufficient_scope', response.status)
    }
    cached = { token: answer.token, expiresAt: requestedAt + answer.lifetimeMs }
    return answer.token
  }

  /** One refresh, with the bookkeeping: a failure drops the cached token and is logged when it is new; a recovery is noted once. */
  async function refresh(): Promise<string> {
    try {
      const token = await exchange()
      if (lastFailure !== null) options.log?.info('Gmail token refresh recovered')
      lastFailure = null
      return token
    } catch (error) {
      const failure = error instanceof GmailAuthError ? error : new GmailAuthError('invalid_response')
      cached = null
      if (lastFailure !== failure.category) options.log?.warn('Gmail token refresh failed', { category: failure.category, httpStatus: failure.httpStatus })
      lastFailure = failure.category
      throw failure
    }
  }

  async function getAccessToken(): Promise<string> {
    if (!config.enabled) throw new GmailAuthError('not_configured')
    if (cached && clock.now().getTime() < cached.expiresAt - REFRESH_MARGIN_MS) return cached.token
    inFlight ??= refresh().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  async function status(): Promise<GmailConnectionStatus> {
    const accountEmail = config.accountEmail === '' ? null : config.accountEmail
    if (!config.enabled) return { configured: false, connected: false, accountEmail, lastError: 'not_configured' }
    try {
      await getAccessToken()
      return { configured: true, connected: true, accountEmail, lastError: null }
    } catch (error) {
      return { configured: true, connected: false, accountEmail, lastError: error instanceof GmailAuthError ? error.category : 'invalid_response' }
    }
  }

  return { getAccessToken, status }
}
