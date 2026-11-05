import { promises as dns } from 'node:dns'
import type { Config } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import type { Logger } from '../../lib/logger.ts'
import { iso, type Clock } from '../../lib/time.ts'
import { splitSender } from './mime.ts'
import type { FetchLike } from './resend.ts'

/**
 * What can actually be shown about the e-mail set-up. A setting being present proves nothing: an API key can be
 * wrong, a DNS record can be missing, a forwarding rule can point at a mailbox nobody confirmed. So each line here
 * is the result of asking: the provider's own API, the public DNS, Cloudflare's API (read-only), or the database
 * (what really happened to real messages). A result is `verified` only when the answer proved it; `not_verified`
 * when the answer proved the opposite; `unknown` when it could not be asked (no access, no network, nothing sent
 * yet), which is not the same as fine. Every result says when it was asked. Nothing returned contains a secret.
 */

export type CheckState = 'verified' | 'not_verified' | 'unknown' | 'not_applicable'

export interface Check {
  id: 'provider' | 'provider_domain' | 'dkim' | 'spf' | 'dmarc' | 'routing_dns' | 'routing_cloudflare' | 'webhook' | 'sending'
  state: CheckState
  /** A plain sentence about what was found. Never a secret; addresses and host names of the domain's own records only. */
  detail: string
  checkedAt: string
}

/** The two lookups the checks need, behind an interface so a test does not touch the network. */
export interface DnsResolver {
  mx(name: string): Promise<string[]>
  /** Each TXT record as one string (its chunks joined). */
  txt(name: string): Promise<string[]>
}

/** A name that does not exist, or has no such record, is an empty answer; anything else (a timeout) is an error. */
const empty = (error: unknown): boolean => typeof error === 'object' && error !== null && ['ENODATA', 'ENOTFOUND', 'NXDOMAIN'].includes((error as { code?: string }).code ?? '')

export const systemDns: DnsResolver = {
  async mx(name) {
    try {
      return (await dns.resolveMx(name)).sort((a, b) => a.priority - b.priority).map((record) => record.exchange.toLowerCase().replace(/\.$/, ''))
    } catch (error) {
      if (empty(error)) return []
      throw error
    }
  },
  async txt(name) {
    try {
      return (await dns.resolveTxt(name)).map((chunks) => chunks.join(''))
    } catch (error) {
      if (empty(error)) return []
      throw error
    }
  },
}

const domainOf = (address: string | null): string | null => {
  if (!address) return null
  const domain = splitSender(address).address.split('@')[1]
  return domain ? domain.toLowerCase() : null
}

/** The part of a DKIM selector's TXT record that proves a key is published. */
const hasKey = (records: string[]): boolean => records.some((record) => /\bp=[A-Za-z0-9+/=]{20,}/.test(record))

const MIN_GAP_MS = 5_000
const HTTP_TIMEOUT_MS = 8_000
const CLOUDFLARE = 'https://api.cloudflare.com/client/v4'

export interface ChecksDeps {
  config: Config
  db: Database
  clock: Clock
  log: Logger
  fetch?: FetchLike
  dns?: DnsResolver
}

export class EmailChecks {
  private readonly deps: ChecksDeps
  private cached: { checkedAt: string; checks: Check[] } | null = null
  private running: Promise<{ checkedAt: string; checks: Check[] }> | null = null
  private lastRunMs = 0

  constructor(deps: ChecksDeps) {
    this.deps = deps
  }

  /** What was found the last time, or `null` before the first check since the server started: never a guess. */
  last(): { checkedAt: string; checks: Check[] } | null {
    return this.cached
  }

  /** Asks again (at most once every few seconds: the answers are public lookups and API calls, not something to hammer). */
  async run(): Promise<{ checkedAt: string; checks: Check[] }> {
    if (this.running) return this.running
    if (this.cached && this.deps.clock.now().getTime() - this.lastRunMs < MIN_GAP_MS) return this.cached
    this.running = this.runAll().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async runAll(): Promise<{ checkedAt: string; checks: Check[] }> {
    const at = iso(this.deps.clock.now())
    const make = (id: Check['id'], state: CheckState, detail: string): Check => ({ id, state, detail, checkedAt: at })
    const guard = async (id: Check['id'], work: () => Promise<Check>): Promise<Check> => {
      try {
        return await work()
      } catch (error) {
        this.deps.log.warn('e-mail check failed to run', { check: id, error })
        return make(id, 'unknown', 'The check could not be completed (the lookup failed or timed out). Try again in a moment.')
      }
    }
    const checks = await Promise.all([
      guard('provider', () => this.provider(make)),
      guard('provider_domain', () => this.providerDomain(make)),
      guard('dkim', () => this.dkim(make)),
      guard('spf', () => this.spf(make)),
      guard('dmarc', () => this.dmarc(make)),
      guard('routing_dns', () => this.routingDns(make)),
      guard('routing_cloudflare', () => this.routingCloudflare(make)),
      guard('webhook', async () => this.webhook(make)),
      guard('sending', async () => this.sending(make)),
    ])
    this.cached = { checkedAt: at, checks }
    this.lastRunMs = this.deps.clock.now().getTime()
    return this.cached
  }

  private get resolver(): DnsResolver {
    return this.deps.dns ?? systemDns
  }

  private get http(): FetchLike {
    return this.deps.fetch ?? ((input, init) => fetch(input, init))
  }

  private get senderDomain(): string | null {
    return domainOf(this.deps.config.email.from)
  }

  /** The public contact address's domain (where Cloudflare Email Routing lives); the sender's when no public address is configured. */
  private get contactDomain(): string | null {
    return domainOf(this.deps.config.email.replyTo) ?? this.senderDomain
  }

  private async provider(make: (id: Check['id'], state: CheckState, detail: string) => Check): Promise<Check> {
    const { config } = this.deps
    const { provider, enabled, apiKey } = config.email
    if (provider === 'none') return make('provider', 'not_verified', 'No sending provider is configured (EMAIL_PROVIDER is none), so the website sends no e-mail.')
    if (!enabled) return make('provider', 'not_verified', `The ${provider} provider is configured but sending is paused (EMAIL_ENABLED=false).`)
    if (provider !== 'resend') return make('provider', 'unknown', `The ${provider} provider is configured; the server has no way to ask it whether it accepts this sender, so see "Sending" for what really happened to messages.`)
    if (!apiKey) return make('provider', 'not_verified', 'EMAIL_API_KEY is not set.')
    const answer = await this.http(`${config.email.apiUrl}/domains?limit=1`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
    if (answer.ok) return make('provider', 'verified', 'The provider accepted the API key (it can read the account’s domains).')
    const body = (await answer.json().catch(() => null)) as { name?: string; message?: string } | null
    if (answer.status === 401 && body?.name === 'restricted_api_key') return make('provider', 'unknown', 'The API key is restricted to sending (the safe choice), so the provider cannot be asked about the account. A message the provider accepts proves the key works.')
    if (answer.status === 401 || answer.status === 403) return make('provider', 'not_verified', 'The provider refused the API key. Create a new key in the provider’s dashboard and set EMAIL_API_KEY.')
    return make('provider', 'unknown', `The provider answered ${answer.status}; it may be having trouble.`)
  }

  private async providerDomain(make: (id: Check['id'], state: CheckState, detail: string) => Check): Promise<Check> {
    const { config } = this.deps
    const domain = this.senderDomain
    if (config.email.provider !== 'resend') return make('provider_domain', 'not_applicable', 'Only the API provider reports whether the sending domain is verified.')
    if (!domain || !config.email.apiKey) return make('provider_domain', 'not_verified', 'There is no sender address and key to check a domain for.')
    const answer = await this.http(`${config.email.apiUrl}/domains`, { headers: { Authorization: `Bearer ${config.email.apiKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
    if (answer.status === 401 || answer.status === 403) return make('provider_domain', 'unknown', 'The API key cannot read the account’s domains (a sending-only key cannot), so the provider’s own verdict is not available. The DNS checks below look at the public records instead.')
    if (!answer.ok) return make('provider_domain', 'unknown', `The provider answered ${answer.status}.`)
    const body = (await answer.json().catch(() => null)) as { data?: { name?: string; status?: string }[] } | null
    const list = Array.isArray(body?.data) ? body.data : []
    // The sender may be on a subdomain of the verified domain (or be the verified domain itself).
    const hit = list.find((entry) => typeof entry.name === 'string' && (domain === entry.name.toLowerCase() || domain.endsWith(`.${entry.name.toLowerCase()}`)))
    if (!hit) return make('provider_domain', 'not_verified', `The provider's account has no domain for ${domain}. Add and verify it in the provider's dashboard.`)
    if (hit.status === 'verified') return make('provider_domain', 'verified', `The provider reports ${hit.name} as verified (its SPF and DKIM records were found).`)
    return make('provider_domain', 'not_verified', `The provider reports ${hit.name} as "${String(hit.status)}": its DNS records are not all in place yet.`)
  }

  private async dkim(make: (id: Check['id'], state: CheckState, detail: string) => Check): Promise<Check> {
    const { config } = this.deps
    const domain = this.senderDomain
    if (config.email.provider !== 'resend') return make('dkim', 'not_applicable', 'The DKIM selector of this provider is not known to the server.')
    if (!domain) return make('dkim', 'not_verified', 'There is no sender address, so there is no domain to look up.')
    const name = `resend._domainkey.${domain}`
    const records = await this.resolver.txt(name)
    return hasKey(records) ? make('dkim', 'verified', `A DKIM key is published at ${name}.`) : make('dkim', 'not_verified', `No DKIM key was found at ${name}. Publish the record the provider's dashboard shows for the domain.`)
  }

  private async spf(make: (id: Check['id'], state: CheckState, detail: string) => Check): Promise<Check> {
    const domain = this.contactDomain
    if (!domain) return make('spf', 'not_verified', 'There is no address to take the domain from (set EMAIL_REPLY_TO to the public contact address).')
    const records = (await this.resolver.txt(domain)).filter((record) => /^v=spf1(\s|$)/i.test(record))
    if (records.length === 0) return make('spf', 'not_verified', `${domain} has no SPF record.`)
    if (records.length > 1) return make('spf', 'not_verified', `${domain} has ${records.length} SPF records; there must be exactly one (receivers ignore them all otherwise). Merge them.`)
    const includes = [...records[0].matchAll(/\binclude:([^\s]+)/gi)].map((match) => match[1].toLowerCase())
    return make('spf', 'verified', `${domain} has exactly one SPF record${includes.length ? ` (includes ${includes.join(', ')})` : ''}.`)
  }

  private async dmarc(make: (id: Check['id'], state: CheckState, detail: string) => Check): Promise<Check> {
    const domain = this.contactDomain
    if (!domain) return make('dmarc', 'not_verified', 'There is no address to take the domain from.')
    const records = (await this.resolver.txt(`_dmarc.${domain}`)).filter((record) => /^v=DMARC1\b/i.test(record.trim()))
    if (records.length === 0) return make('dmarc', 'not_verified', `_dmarc.${domain} has no DMARC record.`)
    if (records.length > 1) return make('dmarc', 'not_verified', `_dmarc.${domain} has ${records.length} DMARC records; there must be exactly one.`)
    const policy = /\bp=(none|quarantine|reject)\b/i.exec(records[0])?.[1]?.toLowerCase()
    if (!policy) return make('dmarc', 'not_verified', 'The DMARC record has no valid p= policy.')
    return make('dmarc', 'verified', policy === 'none' ? 'A DMARC record exists with policy p=none (monitoring only: nothing is rejected yet).' : `A DMARC record exists with policy p=${policy} (enforcing).`)
  }

  private async routingDns(make: (id: Check['id'], state: CheckState, detail: string) => Check): Promise<Check> {
    const domain = this.contactDomain
    if (!domain) return make('routing_dns', 'not_verified', 'There is no public contact address configured (EMAIL_REPLY_TO), so there is no domain whose incoming mail could be checked.')
    const hosts = await this.resolver.mx(domain)
    if (hosts.length === 0) return make('routing_dns', 'not_verified', `${domain} has no MX records, so no one can send e-mail to it.`)
    const foreign = hosts.filter((host) => !host.endsWith('.mx.cloudflare.net'))
    if (foreign.length > 0) return make('routing_dns', 'not_verified', `${domain} receives mail at ${foreign.join(', ')}, not (only) at Cloudflare Email Routing. Cloudflare Email Routing cannot work next to other MX records.`)
    return make('routing_dns', 'verified', `${domain}'s MX records all point to Cloudflare Email Routing (${hosts.join(', ')}). This shows the records exist, not that a rule forwards the address or that the mailbox was confirmed.`)
  }

  private async routingCloudflare(make: (id: Check['id'], state: CheckState, detail: string) => Check): Promise<Check> {
    const { config } = this.deps
    const cf = config.email.cloudflare
    const address = config.email.replyTo ? splitSender(config.email.replyTo).address.toLowerCase() : null
    if (!cf) return make('routing_cloudflare', 'unknown', 'The server has no read-only Cloudflare access (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, CLOUDFLARE_ACCOUNT_ID), so it cannot see the forwarding rule or whether the destination mailbox was confirmed. Check both in the Cloudflare dashboard.')
    if (!address) return make('routing_cloudflare', 'not_verified', 'There is no public contact address (EMAIL_REPLY_TO) to look for among the forwarding rules.')
    const headers = { Authorization: `Bearer ${cf.apiToken}`, Accept: 'application/json' }
    const ask = async (path: string): Promise<{ ok: boolean; status: number; result: unknown }> => {
      const response = await this.http(`${CLOUDFLARE}${path}`, { headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
      const body = (await response.json().catch(() => null)) as { result?: unknown } | null
      return { ok: response.ok, status: response.status, result: body?.result }
    }
    const settings = await ask(`/zones/${cf.zoneId}/email/routing`)
    if (settings.status === 401 || settings.status === 403) return make('routing_cloudflare', 'not_verified', 'Cloudflare refused the token (it needs read access to Email Routing and Zone Settings for this zone).')
    if (!settings.ok) return make('routing_cloudflare', 'unknown', `Cloudflare answered ${settings.status}.`)
    const routing = (settings.result ?? {}) as { enabled?: boolean; status?: string }
    if (routing.enabled !== true || routing.status !== 'ready') return make('routing_cloudflare', 'not_verified', `Email Routing is ${routing.enabled === true ? 'enabled' : 'not enabled'} for the zone, status "${String(routing.status)}".`)
    const rules = await ask(`/zones/${cf.zoneId}/email/routing/rules`)
    if (!rules.ok) return make('routing_cloudflare', 'unknown', `Cloudflare answered ${rules.status} when asked for the forwarding rules.`)
    type Rule = { enabled?: boolean; matchers?: { type?: string; field?: string; value?: string }[]; actions?: { type?: string; value?: string[] }[] }
    const rule = ((Array.isArray(rules.result) ? rules.result : []) as Rule[]).find((candidate) => candidate.enabled !== false && (candidate.matchers ?? []).some((matcher) => matcher.type === 'literal' && matcher.field === 'to' && matcher.value?.toLowerCase() === address))
    if (!rule) return make('routing_cloudflare', 'not_verified', `No enabled forwarding rule matches ${address}.`)
    const destinations = (rule.actions ?? []).filter((action) => action.type === 'forward').flatMap((action) => action.value ?? []).map((value) => value.toLowerCase())
    if (destinations.length === 0) return make('routing_cloudflare', 'not_verified', `The rule for ${address} does not forward to a mailbox.`)
    const addresses = await ask(`/accounts/${cf.accountId}/email/routing/addresses?per_page=50`)
    if (!addresses.ok) return make('routing_cloudflare', 'unknown', `Cloudflare answered ${addresses.status} when asked for the destination mailboxes.`)
    const known = (Array.isArray(addresses.result) ? addresses.result : []) as { email?: string; verified?: string | null }[]
    const unverified = destinations.filter((destination) => !known.some((entry) => entry.email?.toLowerCase() === destination && entry.verified))
    if (unverified.length > 0) return make('routing_cloudflare', 'not_verified', `The rule for ${address} forwards to a mailbox Cloudflare has not verified yet. Open the verification e-mail Cloudflare sent to it.`)
    return make('routing_cloudflare', 'verified', `Email Routing is ready, and ${address} is forwarded by an enabled rule to ${destinations.length} verified mailbox${destinations.length === 1 ? '' : 'es'}.`)
  }

  private webhook(make: (id: Check['id'], state: CheckState, detail: string) => Check): Check {
    const { config, db } = this.deps
    if (config.email.provider !== 'resend') return make('webhook', 'not_applicable', 'Delivery events come from the API provider’s webhook.')
    if (!config.email.webhookSecret) return make('webhook', 'not_verified', 'EMAIL_WEBHOOK_SECRET is not set, so the webhook address does not exist and no message can ever be shown as delivered.')
    const last = db.get<{ received_at: string }>('SELECT received_at FROM email_events ORDER BY received_at DESC LIMIT 1')
    if (!last) return make('webhook', 'unknown', 'The secret is set, but no signed event has been received yet. Send a test message: its delivery event should arrive within a minute.')
    return make('webhook', 'verified', `A signed event from the provider was received at ${last.received_at}.`)
  }

  private sending(make: (id: Check['id'], state: CheckState, detail: string) => Check): Check {
    const { config, db } = this.deps
    if (config.email.provider === 'none') return make('sending', 'not_verified', 'No provider is configured.')
    if (!config.email.enabled) return make('sending', 'not_verified', 'Sending is paused (EMAIL_ENABLED=false).')
    // Only what the CURRENT provider did counts: a message an earlier provider accepted says nothing about this one.
    const last = db.get<{ status: string; updated_at: string; error_code: string | null }>(
      "SELECT status, updated_at, error_code FROM email_deliveries WHERE attempts > 0 AND provider = ? AND status NOT IN ('pending', 'sending', 'cancelled') ORDER BY updated_at DESC LIMIT 1",
      [config.email.provider],
    )
    if (!last) return make('sending', 'unknown', `No message has been sent through the ${config.email.provider} provider yet. Send a test message to find out.`)
    if (last.status === 'failed') return make('sending', 'not_verified', `The most recent message failed at ${last.updated_at}${last.error_code ? ` (${last.error_code})` : ''}.`)
    return make('sending', 'verified', `The provider accepted the most recent message at ${last.updated_at}.`)
  }
}
