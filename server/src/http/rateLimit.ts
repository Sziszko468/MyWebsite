import { rateLimited } from './errors.ts'
import type { Clock } from '../lib/time.ts'
import { HOUR, MINUTE } from '../lib/time.ts'

/**
 * A fixed-window limiter kept in memory: right for one server process, which is what this backend is (the
 * architecture document says what changes with more). A client that goes over the limit is told how long to
 * wait. The key is the client's network address; the windows are short so a shared address (an office, a
 * mobile carrier) recovers quickly.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>()
  private readonly clock: Clock
  readonly windowMs: number
  readonly max: number

  constructor(clock: Clock, windowMs: number, max: number) {
    this.clock = clock
    this.windowMs = windowMs
    this.max = max
  }

  hit(key: string): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const now = this.clock.now().getTime()
    let bucket = this.buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs }
      this.buckets.set(key, bucket)
    }
    bucket.count += 1
    return {
      allowed: bucket.count <= this.max,
      remaining: Math.max(0, this.max - bucket.count),
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    }
  }

  /** Forgets the windows that have ended, so the map does not grow with every address ever seen. */
  sweep(): void {
    const now = this.clock.now().getTime()
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key)
  }

  get size(): number {
    return this.buckets.size
  }
}

/** The limits by kind of request. Each is a count per window per client address. */
export const LIMITS = {
  /** Every request, a ceiling against crude flooding. */
  global: { windowMs: MINUTE, max: 600 },
  /** A contact message: a person sends one or two; a script sends hundreds. */
  contact: { windowMs: 15 * MINUTE, max: 5 },
  quote: { windowMs: 15 * MINUTE, max: 5 },
  /** Public reads (the catalogue). */
  catalog: { windowMs: MINUTE, max: 180 },
  /** Sign-in attempts from one address; an account has its own lock on top (modules/auth). */
  login: { windowMs: 15 * MINUTE, max: 10 },
  /** Everything an administrator does once signed in. */
  admin: { windowMs: MINUTE, max: 300 },
  /** A new assistant session, and the assistant's reads (the session's conversations, the public configuration). */
  aiSession: { windowMs: HOUR, max: 20 },
  aiRead: { windowMs: MINUTE, max: 120 },
  /** The customer's pages (a quotation, a request's status) and what they do there. */
  customer: { windowMs: MINUTE, max: 90 },
  /** Answers to a link that does not exist or no longer works are counted separately, against whoever keeps asking: guessing a token costs the guesser. */
  tokenMiss: { windowMs: 15 * MINUTE, max: 20 },
  /** The e-mail provider's webhook: a handful of events per message, far below this, and a flood of unsigned ones is refused cheaply. */
  webhook: { windowMs: MINUTE, max: 240 },
} as const

export type LimitName = keyof typeof LIMITS

export class Limiters {
  private readonly limiters: Record<LimitName, RateLimiter>
  private readonly enabled: boolean

  constructor(clock: Clock, enabled: boolean) {
    this.enabled = enabled
    const make = (name: LimitName) => new RateLimiter(clock, LIMITS[name].windowMs, LIMITS[name].max)
    this.limiters = { global: make('global'), contact: make('contact'), quote: make('quote'), catalog: make('catalog'), login: make('login'), admin: make('admin'), aiSession: make('aiSession'), aiRead: make('aiRead'), customer: make('customer'), tokenMiss: make('tokenMiss'), webhook: make('webhook') }
  }

  /** Counts one request against a limit and throws the 429 when it is over. */
  check(name: LimitName, key: string): { remaining: number } {
    if (!this.enabled) return { remaining: Infinity }
    const result = this.limiters[name].hit(`${name}:${key}`)
    if (!result.allowed) throw rateLimited(result.retryAfterSeconds)
    return { remaining: result.remaining }
  }

  sweep(): void {
    for (const limiter of Object.values(this.limiters)) limiter.sweep()
  }
}
