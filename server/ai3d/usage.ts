import type { Stage } from './provider.ts'

/**
 * What the engine is asked to do and what that costs, kept on the server only. The browser is told
 * whether it may go on, never how many credits the account has or what a task cost.
 *
 * A task is counted when it is created, at the provider's estimated price; when the provider later says
 * what it really charged (a failed task is refunded: 0) the entry is corrected. The day's total is what
 * the optional budget (AI3D_DAILY_CREDIT_BUDGET) is checked against. Every event is also written as one
 * line of JSON to the log, with the visitor reduced to a short hash.
 */
export type UsageEvent =
  | 'prompt-prepared'
  | 'task-created'
  | 'task-finished'
  | 'task-failed'
  | 'task-cancelled'
  | 'refused'
  | 'error'
  | 'asset-stored'

export interface UsageLine {
  event: UsageEvent
  job?: string
  stage?: Stage
  task?: string
  credits?: number
  /** A short code, never a provider's message and never a secret. */
  reason?: string
  by?: string
  bytes?: number
}

export interface Usage {
  /** Whether a task of this estimated price still fits today's budget. */
  fits(credits: number): boolean
  /** Records a task as created at its estimate. */
  created(entry: { task: string; credits: number }): void
  /** Corrects a task's cost to what the provider says it was. */
  settle(task: string, credits: number): void
  /** Today's credits in total (server side only). */
  today(): number
  /** `who` is a visitor already reduced by `pseudonym`; an address is never written. */
  log(who: string, line: UsageLine): void
}

const DAY = 24 * 60 * 60_000

/** A short stable label for a visitor's address, so the log can tell visitors apart without holding addresses. */
export function pseudonym(client: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < client.length; i++) {
    hash ^= client.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function createUsage(options: { budget: number | null; now: () => number; sink: (line: string) => void }): Usage {
  const entries = new Map<string, { time: number; credits: number }>()
  const prune = () => {
    const cutoff = options.now() - DAY
    for (const [task, entry] of entries) if (entry.time < cutoff) entries.delete(task)
  }
  const today = () => {
    prune()
    let total = 0
    for (const entry of entries.values()) total += entry.credits
    return total
  }
  return {
    fits: (credits) => options.budget === null || today() + credits <= options.budget,
    created({ task, credits }) {
      entries.set(task, { time: options.now(), credits })
    },
    settle(task, credits) {
      const entry = entries.get(task)
      if (entry) entry.credits = Math.max(0, credits)
    },
    today,
    log(who, line) {
      options.sink(JSON.stringify({ time: new Date(options.now()).toISOString(), client: who, ...line }))
    },
  }
}
