import type { IncomingMessage } from 'node:http'
import type { Config } from './config.ts'
import type { Database } from './db/database.ts'
import type { Limiters } from './http/rateLimit.ts'
import type { Reply } from './http/reply.ts'
import type { Logger } from './lib/logger.ts'
import type { Clock } from './lib/time.ts'
import type { EmailChecks } from './modules/notifications/checks.ts'
import type { Notifier } from './modules/notifications/notifier.ts'

/** The few counters the System page shows, kept since the process started. */
export interface Stats {
  startedAt: number
  requests: number
  clientErrors: number
  serverErrors: number
  rateLimited: number
}

/** What every module is given instead of reaching for globals: the pieces a request needs, and nothing else. */
export interface AppContext {
  config: Config
  db: Database
  clock: Clock
  log: Logger
  limiters: Limiters
  notifier: Notifier
  /** What can be verified about the e-mail set-up (checks.ts). */
  emailChecks: EmailChecks
  stats: Stats
}

export interface SessionInfo {
  userId: string
  email: string
  role: 'admin' | 'editor'
  csrfToken: string
  /** Hash of the cookie's token: the session's key in the database. */
  tokenHash: string
}

/** One request, as a handler sees it. */
export interface RequestCtx {
  app: AppContext
  req: IncomingMessage
  method: string
  path: string
  query: URLSearchParams
  params: Record<string, string>
  ip: string
  ipHash: string
  requestId: string
  log: Logger
  cookies: Record<string, string>
  /** The `Origin` header, when the browser sent one. */
  origin: string | null
  session: SessionInfo | null
  json(): Promise<Record<string, unknown>>
  form(): Promise<URLSearchParams>
  /** The body exactly as it arrived (for a signature, which is over the bytes, not over what they parse to). */
  raw(): Promise<Buffer>
}

export type Handler = (ctx: RequestCtx) => Promise<Reply> | Reply
