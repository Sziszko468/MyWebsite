import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Level } from './lib/logger.ts'
import { AI_MODEL_ID } from './modules/ai/model.ts'
import { AI_PRICING, PRICES_AS_OF } from './modules/ai/pricing.ts'

/**
 * The server's whole configuration, read from the environment once and checked at start-up. A bad value
 * stops the server with one message that names every variable that is wrong; nothing falls back to a guess
 * that could be unsafe in production (no default secret, no default recipient, no default CORS origin).
 * Secrets live only here and in the environment: `redactedConfig` is the only view of this object that is
 * ever shown (the admin's System page) and it carries no secret.
 */

export type AppEnv = 'development' | 'test' | 'production'
export type Language = 'hu' | 'en' | 'nl'
export const LANGUAGES: readonly Language[] = ['hu', 'en', 'nl']
/**
 * The language of every visitor the site cannot place, and of the `x-default` alternate. The same value as `DEFAULT_LANGUAGE` in
 * src/i18n/config.ts: `test/contract.test.ts` fails when the two differ, so a page's own head and the live sitemap never disagree.
 */
export const DEFAULT_LANGUAGE: Language = 'en'

export interface SmtpConfig {
  host: string
  port: number
  /** `tls`: encrypted from the first byte (usually port 465). `starttls`: upgraded after the greeting (587). `none`: plain text, refused in production. */
  secure: 'tls' | 'starttls' | 'none'
  user: string | null
  password: string | null
  /** Refuse a server certificate that cannot be verified. Switching it off is possible only outside production. */
  rejectUnauthorized: boolean
  timeoutMs: number
}

/** Read-only access to Cloudflare, used only by the administration's "is routing set up?" check. Never sends or changes anything. */
export interface CloudflareConfig {
  apiToken: string
  zoneId: string
  accountId: string
}

export interface EmailConfig {
  provider: 'none' | 'smtp' | 'file' | 'resend'
  /**
   * `EMAIL_ENABLED=false` pauses sending without removing the configuration (the way to prepare a provider and its DNS before
   * going live): nothing is queued, the administration says so.
   */
  enabled: boolean
  /** `Name <address>` or an address; the sender of every message. Must be on a domain the provider has verified. */
  from: string | null
  /** The public contact address (for example hello@domain.hu): what a customer's reply goes to. Never the owner's private inbox (`notifyTo`). */
  replyTo: string | null
  /** The transactional provider's API key (provider `resend`). A secret: never logged, never in an answer, never in the browser. */
  apiKey: string | null
  /** The provider's API origin; https outside development. */
  apiUrl: string
  /** The secret that signs the provider's webhooks (`whsec_…`). Without it the webhook address does not exist and nothing is ever "delivered". */
  webhookSecret: string | null
  cloudflare: CloudflareConfig | null
  /** Where the owner's notifications go. Never defaulted: no recipient, no owner notification. */
  notifyTo: string | null
  /** The language of the owner's notifications. */
  notifyLanguage: Language
  brandName: string
  smtp: SmtpConfig | null
  fileDirectory: string | null
  maxAttempts: number
}

/**
 * What an administrator may change about the assistant while the server runs (stored in `settings`, modules/ai/settings.ts).
 * The environment gives the starting values; a saved value wins. The model, the API key and the address of the provider are
 * NOT here: they are the operator's, set in the environment, and the browser cannot choose them.
 */
export interface AiSettings {
  /**
   * The administrator's activation of the assistant. It starts OFF and can be switched on only while the required model is
   * verified (a successful connection test); a successful test never switches it on by itself.
   */
  enabled: boolean
  plannerEnabled: boolean
  /** Project discovery (PROMPT 30): the structured discovery workflow and plan editor. Needs the planner; when off, the older free-form planner is used. */
  discoveryEnabled: boolean
  /** Whether an approved plan may be sent to the quote-request system. */
  quoteEnabled: boolean
  /**
   * The AI ADMIN ASSISTANT (PROMPT 31): the read-only copilot inside the administration. It starts OFF, needs the same verified model as the visitor
   * assistant (it cannot be switched on without it), and is switched on or off by an administrator with `system:write`, apart from the visitor assistant.
   */
  adminAssistantEnabled: boolean
  /** Model requests one administrator may make in an hour (counted from the usage ledger, so it survives a restart). */
  adminMaxRequestsPerHour: number
  /** Model steps (tool rounds) in one answer of the admin assistant (analysis needs more rounds than a visitor's question). */
  adminMaxToolCalls: number
  adminMaxOutputTokens: number
  /** Characters of one administrator message (a draft to translate or a long customer message to summarise is longer than a visitor's question). */
  adminMaxInputChars: number
  languages: Language[]
  /** Limits of one message and of what is kept and replayed. */
  maxInputChars: number
  maxHistoryMessages: number
  maxConversationMessages: number
  /** Includes the model's thinking: the provider counts it. */
  maxOutputTokens: number
  /** Model steps (tool rounds) in one answer. */
  maxToolCalls: number
  maxRequestsPerSession: number
  /** Per client address in a ten minute window (kept in memory). */
  maxRequestsPerIp: number
  /** Answers being written at the same moment, all visitors together. Further requests are refused at once ("busy"), not queued. */
  maxConcurrentRequests: number
  maxDailyConversations: number
  dailyRequests: number
  dailyTokenBudget: number
  /** USD. A request that could take the day or the month over its budget is refused before it starts. */
  dailyBudgetUsd: number
  monthlyBudgetUsd: number
  /** An administration alert is raised once a day / month when spending reaches this percentage of the daily / monthly budget. */
  alertPercent: number
  conversationMaxHours: number
  /** Days the words of a conversation are kept (counts and numbers are kept longer). */
  retentionDays: number
  effort: 'low' | 'medium' | 'high'
  thinking: 'adaptive' | 'disabled'
  /** USD per million tokens, as published by the provider on `pricesAsOf`; they are configuration, never a guess in code. */
  priceInputPerMTok: number
  priceOutputPerMTok: number
  pricesAsOf: string
  /** Empty: the built-in text. */
  welcome: Record<Language, string>
  /** Empty: the built-in chips. */
  suggestions: Record<Language, string[]>
}

/**
 * The operator's HARD ceilings (PROMPT 29): environment only, never a setting. An administrator can lower a limit but not raise it past
 * its ceiling, and a saved value above a ceiling (because the ceiling was lowered later) is applied as the ceiling. Budgets cannot be used
 * to switch cost protection off: the administration has no way to change the prices either (modules/ai/pricing.ts).
 */
export const AI_CEILING_KEYS = ['dailyBudgetUsd', 'monthlyBudgetUsd', 'dailyTokenBudget', 'dailyRequests', 'maxConcurrentRequests', 'maxOutputTokens', 'maxInputChars', 'maxToolCalls', 'maxRequestsPerSession', 'maxDailyConversations'] as const
export type AiCeilingKey = (typeof AI_CEILING_KEYS)[number]
export type AiCeilings = Record<AiCeilingKey, number>
/** The environment variable that sets each ceiling. */
export const AI_CEILING_ENV: Record<AiCeilingKey, string> = {
  dailyBudgetUsd: 'AI_CEILING_DAILY_BUDGET',
  monthlyBudgetUsd: 'AI_CEILING_MONTHLY_BUDGET',
  dailyTokenBudget: 'AI_CEILING_DAILY_TOKENS',
  dailyRequests: 'AI_CEILING_DAILY_REQUESTS',
  maxConcurrentRequests: 'AI_CEILING_CONCURRENT',
  maxOutputTokens: 'AI_CEILING_OUTPUT_TOKENS',
  maxInputChars: 'AI_CEILING_INPUT_CHARS',
  maxToolCalls: 'AI_CEILING_TOOL_CALLS',
  maxRequestsPerSession: 'AI_CEILING_REQUESTS_PER_SESSION',
  maxDailyConversations: 'AI_CEILING_DAILY_CONVERSATIONS',
}

/**
 * Controlled automation (PROMPT 33): the operator's own switch for the assistant's APPROVAL-GATED actions. Off by default, and separate from the assistant itself: with it off the
 * assistant has no proposal tool at all, the administration's automation screen says so, and nothing can be proposed, approved or executed. It changes no model, key or budget.
 */
export interface AutomationConfig {
  /** `AI_AUTOMATION_ENABLED` (default off). */
  enabled: boolean
  /** `AI_AUTOMATION_TTL_MINUTES`: how long a proposal waits for a decision before it expires (default 60, 5 to 1440). */
  ttlMinutes: number
  /** `AI_AUTOMATION_MAX_PENDING`: how many proposals one administrator may have waiting (default 20). */
  maxPending: number
}

export interface AiConfig {
  /** `AI_ASSISTANT_ENABLED`: the operator's master switch. The assistant is offered only with this on AND an API key. */
  enabled: boolean
  /** Approval-gated actions (PROMPT 33). */
  automation: AutomationConfig
  /** `ANTHROPIC_API_KEY`. A secret: server only, never logged, never in an answer. Null when it is missing OR malformed (`keyProblem`). */
  apiKey: string | null
  /**
   * `malformed`: a key was configured but cannot be one (too short, or it contains white space). The server still starts (the website,
   * the shop and the quote requests must not depend on the assistant), the key is NOT used and not kept, and the assistant is unavailable.
   */
  keyProblem: 'malformed' | null
  /** `AI_CONNECT_TIMEOUT_MS`: the longest the provider may take to start answering (to send its response headers). */
  connectTimeoutMs: number
  /** `AI_CEILING_*`: the hard limits an administrator cannot go past. */
  ceilings: AiCeilings
  /** `ANTHROPIC_BASE_URL`: another address for the provider's API (a proxy, or the local stand-in the tests use). */
  baseUrl: string | null
  /**
   * The one model the assistant uses: Claude Haiku 5.5, a constant in code (modules/ai/model.ts). It is not read from the
   * environment and no setting can change it.
   */
  model: typeof AI_MODEL_ID
  /**
   * A value found in `ANTHROPIC_MODEL` that is not the required model. It is NOT used for anything: its presence only makes
   * the assistant unavailable (`model_lock`) and tells the operator why, so a leftover or hostile setting can never pick a model.
   */
  modelOverride: string | null
  /** Signs the anonymous session tokens (`AI_SESSION_SECRET`, or derived from APP_SECRET). */
  sessionSecret: string
  /** `AI_TIMEOUT_MS`: the longest one answer may take, tool rounds included; a stalled provider is cut off after this. */
  timeoutMs: number
  /** The starting values of the settings an administrator can change. */
  defaults: AiSettings
}

export interface Config {
  env: AppEnv
  host: string
  port: number
  /** The origin of the public website, for links in e-mails. */
  publicUrl: string | null
  /** The origin this server is reached at; decides whether cookies are `Secure`. */
  apiPublicUrl: string | null
  corsOrigins: readonly string[]
  /** The https origins a deliverable's preview may be shown from INSIDE the portal (an embedded page, a picture to comment on). Empty: nothing is embedded; a preview is a link the customer opens. */
  previewOrigins: readonly string[]
  databasePath: string
  migrateOnStart: boolean
  /** Load the website's catalogue into an empty database at start-up (never overwrites). */
  seedOnStart: boolean
  /** Keys the hash of a client address; at least 32 characters in production. */
  appSecret: string
  /** How many reverse proxies sit in front (0: none, the socket's address is the client's). */
  trustProxy: number
  secureCookies: boolean
  logLevel: Level
  requireConsent: boolean
  email: EmailConfig
  /** Closed or archived requests older than this many days are deleted by the maintenance task; `null` keeps them. */
  retentionDays: number | null
  adminSessionHours: number
  adminIdleMinutes: number
  deployHookUrl: string | null
  staticDir: string | null
  /**
   * `COUNTRY_HEADER` (PROMPT 20): the name of the one request header the visitor's country is read from, for the starting language of an
   * address without a language (modules/system/language.ts). `CF-IPCountry` behind Cloudflare. `null` (the default) switches it off.
   */
  countryHeader: string | null
  rateLimitsEnabled: boolean
  bodyLimitBytes: number
  /** Where uploaded images are kept (never in the database). */
  mediaDir: string
  /** The largest image an administrator may upload, in bytes. */
  mediaMaxBytes: number
  /** `QUOTE_REFERENCE_FORMAT`: how a quote request's public reference is written, for example `CC-{YYYY}-{NNNNNN}` (the Ns are the padded sequence number). */
  quoteReferenceFormat: string
  /** `CUSTOMER_LINK_DAYS`: how long the link in a customer's e-mail (the quotation, the status page) works. */
  customerLinkDays: number
  /** The client portal (PROMPT 25): how long a sign-in lasts (`CLIENT_SESSION_HOURS`), how long it may sit unused (`CLIENT_IDLE_MINUTES`), how long a link in an e-mail works (`CLIENT_LINK_MINUTES`; an invitation: `CLIENT_INVITE_HOURS`). */
  client: { sessionHours: number; idleMinutes: number; linkMinutes: number; inviteHours: number }
  ai: AiConfig
  backup: { enabled: boolean; clientId: string; clientSecret: string; refreshToken: string; folderId: string | null; retentionDays: number; hourUtc: number }
}

export class ConfigError extends Error {
  readonly problems: readonly string[]
  constructor(problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

type Env = Record<string, string | undefined>

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:.]+(\.[^\s@<>()",;:.]+)+$/

export const isEmailAddress = (value: string): boolean => value.length <= 254 && EMAIL.test(value) && !value.includes('..')

/** `Name <a@b.c>` or `a@b.c`; no line breaks (they would let a value add headers to a message). */
export function isSender(value: string): boolean {
  if (/[\r\n]/.test(value)) return false
  const match = /^(?:[^<>@]*<([^<>\s]+)>|([^<>\s]+))$/.exec(value.trim())
  const address = match?.[1] ?? match?.[2]
  return address !== undefined && isEmailAddress(address)
}

/** An ordinary public host name: dotted labels of letters, digits and hyphens, not a number, not a name that only exists inside a network. */
function publicHostName(host: string): boolean {
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(host) && !/^[0-9.]+$/.test(host) && !/\.(local|localhost|internal|intranet|lan|home|corp|onion)$/i.test(host)
}

function origin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

const isLocalOrigin = (value: string): boolean => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(value)

export function loadConfig(env: Env = process.env): Config {
  const problems: string[] = []
  const bad = (name: string, why: string) => void problems.push(`${name}: ${why}`)
  const text = (name: string): string | null => {
    const value = env[name]?.trim()
    return value ? value : null
  }
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const raw = text(name)
    if (raw === null) return fallback
    const value = Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) {
      bad(name, `must be a whole number from ${min} to ${max} (got "${raw}")`)
      return fallback
    }
    return value
  }
  const flag = (name: string, fallback: boolean): boolean => {
    const raw = text(name)?.toLowerCase()
    if (raw === undefined) return fallback
    if (['1', 'true', 'yes', 'on'].includes(raw)) return true
    if (['0', 'false', 'no', 'off'].includes(raw)) return false
    bad(name, `must be true or false (got "${raw}")`)
    return fallback
  }

  const envName = text('APP_ENV') ?? 'development'
  if (!['development', 'test', 'production'].includes(envName)) bad('APP_ENV', `must be development, test or production (got "${envName}")`)
  const appEnv = (['development', 'test', 'production'].includes(envName) ? envName : 'development') as AppEnv
  const production = appEnv === 'production'

  const port = integer('PORT', 8787, 0, 65535)
  const host = text('HOST') ?? '127.0.0.1'

  const originOf = (name: string): string | null => {
    const raw = text(name)
    if (raw === null) return null
    const value = origin(raw)
    if (!value) {
      bad(name, `must be an origin such as https://example.com, without a path (got "${raw}")`)
      return null
    }
    if (production && !value.startsWith('https://')) bad(name, 'must be https in production')
    return value
  }
  const publicUrl = originOf('PUBLIC_URL')
  const apiPublicUrl = originOf('API_PUBLIC_URL')

  const corsOrigins: string[] = []
  for (const raw of (text('CORS_ORIGINS') ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const value = raw === '*' ? null : origin(raw)
    if (!value) bad('CORS_ORIGINS', `"${raw}" is not an origin (a wildcard is not allowed; list exact origins such as https://example.com)`)
    else if (production && !value.startsWith('https://') && !isLocalOrigin(value)) bad('CORS_ORIGINS', `"${raw}" must be https in production`)
    else corsOrigins.push(value)
  }
  if (production && corsOrigins.length === 0 && publicUrl) corsOrigins.push(publicUrl)

  // PROMPT 27: exact https origins, no wildcard, no path: what may be embedded or drawn in the client portal. The build's Content-Security-Policy must list the same (VITE_PREVIEW_ORIGINS).
  // The host must be an ordinary public name (the same rule as a preview address, modules/deliverables/preview.ts and src/config/preview.ts): `new URL` would accept `*.example.com` or `10.0.0.1`.
  const previewOrigins: string[] = []
  for (const raw of (text('PREVIEW_ORIGINS') ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const value = raw.includes('*') ? null : origin(raw)
    if (!value || !value.startsWith('https://') || !publicHostName(new URL(value).hostname)) bad('PREVIEW_ORIGINS', `"${raw}" is not an https origin (list exact origins such as https://previews.example.com; no wildcard, no path)`)
    else if (value === publicUrl || value === apiPublicUrl) bad('PREVIEW_ORIGINS', `"${raw}" is this site's own origin: a preview is somebody else's page, and the portal never frames itself`)
    else if (!previewOrigins.includes(value)) previewOrigins.push(value)
  }

  const databasePath = text('DATABASE_PATH') ?? (appEnv === 'test' ? ':memory:' : './data/app.sqlite')
  if (production && databasePath === ':memory:') bad('DATABASE_PATH', 'an in-memory database loses everything on restart; give a file path in production')

  const secret = text('APP_SECRET')
  if (production && (!secret || secret.length < 32)) bad('APP_SECRET', 'required in production, at least 32 characters (for example: openssl rand -base64 48)')
  if (secret && /^(change[-_ ]?me|secret|password|test)/i.test(secret) && production) bad('APP_SECRET', 'looks like a placeholder')
  const appSecret = secret ?? (appEnv === 'production' ? '' : 'development-only-secret-do-not-use-in-production')

  const trustProxy = integer('TRUST_PROXY', 0, 0, 5)

  const logRaw = text('LOG_LEVEL') ?? (appEnv === 'test' ? 'error' : 'info')
  if (!['debug', 'info', 'warn', 'error'].includes(logRaw)) bad('LOG_LEVEL', `must be debug, info, warn or error (got "${logRaw}")`)
  const logLevel = (['debug', 'info', 'warn', 'error'].includes(logRaw) ? logRaw : 'info') as Level

  // ---- e-mail ----
  const providerRaw = text('EMAIL_PROVIDER') ?? 'none'
  if (!['none', 'smtp', 'file', 'resend'].includes(providerRaw)) bad('EMAIL_PROVIDER', `must be none, resend, smtp or file (got "${providerRaw}")`)
  const provider = (['none', 'smtp', 'file', 'resend'].includes(providerRaw) ? providerRaw : 'none') as EmailConfig['provider']
  if (provider === 'file' && production) bad('EMAIL_PROVIDER', 'file is for development: it writes messages to disk instead of sending them')

  const from = text('EMAIL_FROM')
  if (from !== null && !isSender(from)) bad('EMAIL_FROM', `must be an address or Name <address> (got "${from}")`)
  const notifyTo = text('NOTIFY_TO')
  if (notifyTo !== null && !isEmailAddress(notifyTo)) bad('NOTIFY_TO', `must be one e-mail address (got "${notifyTo}")`)
  const notifyLanguageRaw = text('NOTIFY_LANGUAGE') ?? 'hu'
  if (!LANGUAGES.includes(notifyLanguageRaw as Language)) bad('NOTIFY_LANGUAGE', `must be hu, en or nl (got "${notifyLanguageRaw}")`)
  const notifyLanguage = (LANGUAGES.includes(notifyLanguageRaw as Language) ? notifyLanguageRaw : 'hu') as Language

  let smtp: SmtpConfig | null = null
  if (provider === 'smtp') {
    if (!from) bad('EMAIL_FROM', 'required when EMAIL_PROVIDER is smtp')
    const smtpHost = text('SMTP_HOST')
    if (!smtpHost) bad('SMTP_HOST', 'required when EMAIL_PROVIDER is smtp')
    const secureRaw = text('SMTP_SECURE') ?? 'starttls'
    if (!['tls', 'starttls', 'none'].includes(secureRaw)) bad('SMTP_SECURE', `must be tls, starttls or none (got "${secureRaw}")`)
    if (secureRaw === 'none' && production) bad('SMTP_SECURE', 'none sends credentials and messages in clear text; not allowed in production')
    const defaultPort = secureRaw === 'tls' ? 465 : secureRaw === 'none' ? 25 : 587
    const user = text('SMTP_USER')
    const password = text('SMTP_PASSWORD')
    if ((user === null) !== (password === null)) bad('SMTP_USER', 'SMTP_USER and SMTP_PASSWORD must be set together')
    const reject = flag('SMTP_TLS_REJECT_UNAUTHORIZED', true)
    if (!reject && production) bad('SMTP_TLS_REJECT_UNAUTHORIZED', 'cannot be switched off in production')
    smtp = {
      host: smtpHost ?? '',
      port: integer('SMTP_PORT', defaultPort, 1, 65535),
      secure: (['tls', 'starttls', 'none'].includes(secureRaw) ? secureRaw : 'starttls') as SmtpConfig['secure'],
      user,
      password,
      rejectUnauthorized: reject,
      timeoutMs: integer('SMTP_TIMEOUT_MS', 15000, 1000, 120000),
    }
  }
  const fileDirectory = provider === 'file' ? (text('EMAIL_FILE_DIR') ?? './data/mail') : null

  // The transactional provider (resend): an API key, a sender on a verified domain, an https API.
  const apiKey = text('EMAIL_API_KEY')
  let apiUrl = 'https://api.resend.com'
  const apiUrlRaw = text('EMAIL_API_URL')
  if (apiUrlRaw !== null) {
    try {
      const url = new URL(apiUrlRaw)
      if (url.protocol !== 'https:' && !(isLocalOrigin(url.origin) && !production)) bad('EMAIL_API_URL', 'must be an https address (plain http only for a local test server outside production)')
      else apiUrl = url.origin
    } catch {
      bad('EMAIL_API_URL', 'is not a valid URL')
    }
  }
  if (provider === 'resend') {
    if (!from) bad('EMAIL_FROM', 'required when EMAIL_PROVIDER is resend (an address on the domain you verified with the provider)')
    if (!apiKey) bad('EMAIL_API_KEY', 'required when EMAIL_PROVIDER is resend')
    else if (apiKey.length < 10 || /\s/.test(apiKey)) bad('EMAIL_API_KEY', 'does not look like an API key')
  }
  const webhookSecret = text('EMAIL_WEBHOOK_SECRET')
  // The provider signs webhooks with a secret of the form whsec_<base64>; anything else would never verify.
  if (webhookSecret !== null && !/^whsec_[A-Za-z0-9+/]{16,}={0,2}$/.test(webhookSecret)) bad('EMAIL_WEBHOOK_SECRET', 'must be the signing secret the provider shows for the webhook (it starts with whsec_)')
  const replyTo = text('EMAIL_REPLY_TO')
  if (replyTo !== null && !isSender(replyTo)) bad('EMAIL_REPLY_TO', `must be an address or Name <address> (got "${replyTo}")`)
  const emailEnabled = flag('EMAIL_ENABLED', true)

  const cloudflareToken = text('CLOUDFLARE_API_TOKEN')
  const cloudflareZone = text('CLOUDFLARE_ZONE_ID')
  const cloudflareAccount = text('CLOUDFLARE_ACCOUNT_ID')
  let cloudflare: CloudflareConfig | null = null
  if (cloudflareToken !== null || cloudflareZone !== null || cloudflareAccount !== null) {
    if (cloudflareToken === null || cloudflareZone === null || cloudflareAccount === null) bad('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID and CLOUDFLARE_ACCOUNT_ID must be set together')
    else if (!/^[a-f0-9]{32}$/i.test(cloudflareZone) || !/^[a-f0-9]{32}$/i.test(cloudflareAccount)) bad('CLOUDFLARE_ZONE_ID', 'the zone and account ids are 32 hexadecimal characters (copy them from the Cloudflare dashboard)')
    else cloudflare = { apiToken: cloudflareToken, zoneId: cloudflareZone, accountId: cloudflareAccount }
  }

  const retention = text('RETENTION_DAYS')
  const retentionDays = retention === null ? null : integer('RETENTION_DAYS', 0, 1, 3650)

  const hook = text('DEPLOY_HOOK_URL')
  const countryHeader = text('COUNTRY_HEADER')
  if (countryHeader !== null && !/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(countryHeader)) bad('COUNTRY_HEADER', 'must be a header name (letters, digits and hyphens), for example CF-IPCountry')
  let deployHookUrl: string | null = null
  if (hook !== null) {
    try {
      const url = new URL(hook)
      if (url.protocol !== 'https:' && !(isLocalOrigin(url.origin) && !production)) bad('DEPLOY_HOOK_URL', 'must be an https address')
      else deployHookUrl = url.toString()
    } catch {
      bad('DEPLOY_HOOK_URL', 'is not a valid URL')
    }
  }

  // Read every remaining setting before the check, so a bad value in any of them is reported with the rest.
  const migrateOnStart = flag('MIGRATE_ON_START', true)
  const seedOnStart = flag('SEED_ON_START', true)
  const requireConsent = flag('REQUIRE_CONSENT', true)
  const maxAttempts = integer('EMAIL_MAX_ATTEMPTS', 5, 1, 20)
  const adminSessionHours = integer('ADMIN_SESSION_HOURS', 12, 1, 168)
  const adminIdleMinutes = integer('ADMIN_IDLE_MINUTES', 30, 5, 1440)
  const rateLimitsEnabled = flag('RATE_LIMITS', true)
  const bodyLimitBytes = integer('BODY_LIMIT_BYTES', 65536, 1024, 1048576)
  const mediaMaxBytes = integer('MEDIA_MAX_BYTES', 6 * 1024 * 1024, 100 * 1024, 25 * 1024 * 1024)
  const mediaDir = text('MEDIA_DIR') ?? (databasePath === ':memory:' ? join(tmpdir(), `cc-media-${process.pid}`) : join(dirname(databasePath), 'media'))
  const quoteReferenceFormat = text('QUOTE_REFERENCE_FORMAT') ?? 'CC-{YYYY}-{NNNNNN}'
  if (!/^[A-Za-z0-9-]{0,16}(\{YYYY\}|\{YY\})?[A-Za-z0-9-]{0,16}\{N{3,10}\}[A-Za-z0-9-]{0,16}$/.test(quoteReferenceFormat)) bad('QUOTE_REFERENCE_FORMAT', `must be letters, digits and hyphens around one sequence placeholder such as {NNNNNN}, optionally with {YYYY} or {YY} before it (got "${quoteReferenceFormat}")`)
  const customerLinkDays = integer('CUSTOMER_LINK_DAYS', 90, 1, 365)
  const client = { sessionHours: integer('CLIENT_SESSION_HOURS', 168, 1, 720), idleMinutes: integer('CLIENT_IDLE_MINUTES', 2880, 5, 43200), linkMinutes: integer('CLIENT_LINK_MINUTES', 30, 5, 1440), inviteHours: integer('CLIENT_INVITE_HOURS', 72, 1, 720) }

  // ---- Google Drive backups ----
  const driveClientId = text('GOOGLE_DRIVE_CLIENT_ID')
  const driveClientSecret = text('GOOGLE_DRIVE_CLIENT_SECRET')
  const driveRefreshToken = text('GOOGLE_DRIVE_REFRESH_TOKEN')
  const driveFolderId = text('GOOGLE_DRIVE_FOLDER_ID')
  const backupParts = [driveClientId, driveClientSecret, driveRefreshToken]
  if (backupParts.some(Boolean) && backupParts.some((part) => !part)) bad('GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN must be set together')
  const backupRetentionDays = integer('BACKUP_RETENTION_DAYS', 30, 1, 365)
  const backupHourUtc = integer('BACKUP_HOUR_UTC', 3, 0, 23)

  // ---- the assistant (PROMPT 16) ----
  const decimal = (name: string, fallback: number, min: number, max: number): number => {
    const raw = text(name)
    if (raw === null) return fallback
    const value = Number(raw)
    if (!Number.isFinite(value) || value < min || value > max) {
      bad(name, `must be a number from ${min} to ${max} (got "${raw}")`)
      return fallback
    }
    return value
  }
  // The model is fixed in code (modules/ai/model.ts). A leftover ANTHROPIC_MODEL is never used and never stops the server (the
  // website, the shop and the quote requests must not depend on the assistant): it only keeps the assistant switched off.
  const aiModelEnv = text('ANTHROPIC_MODEL')
  const aiModelOverride = aiModelEnv !== null && aiModelEnv !== AI_MODEL_ID ? aiModelEnv.slice(0, 80) : null
  // A malformed key does NOT stop the server (PROMPT 29): the key is dropped, the assistant is unavailable and says why in the administration.
  // The value is never echoed. A key the provider rejects is a different case: it is only known by asking, and is handled at run time.
  const aiKeyRaw = text('ANTHROPIC_API_KEY')
  const aiKeyMalformed = aiKeyRaw !== null && (aiKeyRaw.length < 20 || /\s/.test(aiKeyRaw))
  const aiKey = aiKeyMalformed ? null : aiKeyRaw
  let aiBaseUrl: string | null = null
  const aiBaseRaw = text('ANTHROPIC_BASE_URL')
  if (aiBaseRaw !== null) {
    try {
      const url = new URL(aiBaseRaw)
      if (url.protocol !== 'https:' && !(isLocalOrigin(url.origin) && !production)) bad('ANTHROPIC_BASE_URL', 'must be an https address (plain http only for a local stand-in outside production)')
      else aiBaseUrl = aiBaseRaw.replace(/\/+$/, '')
    } catch {
      bad('ANTHROPIC_BASE_URL', 'is not a valid URL')
    }
  }
  const aiSessionSecret = text('AI_SESSION_SECRET')
  if (aiSessionSecret !== null && production && aiSessionSecret.length < 32) bad('AI_SESSION_SECRET', 'at least 32 characters in production')
  const aiEffort = text('AI_EFFORT') ?? 'low'
  if (!['low', 'medium', 'high'].includes(aiEffort)) bad('AI_EFFORT', `must be low, medium or high (got "${aiEffort}")`)
  const aiThinking = text('AI_THINKING') ?? 'adaptive'
  if (!['adaptive', 'disabled'].includes(aiThinking)) bad('AI_THINKING', `must be adaptive or disabled (got "${aiThinking}")`)
  const noText: Record<Language, string> = { hu: '', en: '', nl: '' }
  // The hard ceilings: what an administrator can never go past (the defaults are generous for a portfolio and still small money).
  const aiCeilings: AiCeilings = {
    dailyBudgetUsd: decimal(AI_CEILING_ENV.dailyBudgetUsd, 25, 0, 100000),
    monthlyBudgetUsd: decimal(AI_CEILING_ENV.monthlyBudgetUsd, 250, 0, 1000000),
    dailyTokenBudget: integer(AI_CEILING_ENV.dailyTokenBudget, 50_000_000, 1000, 1_000_000_000),
    dailyRequests: integer(AI_CEILING_ENV.dailyRequests, 20_000, 1, 1000000),
    maxConcurrentRequests: integer(AI_CEILING_ENV.maxConcurrentRequests, 25, 1, 200),
    maxOutputTokens: integer(AI_CEILING_ENV.maxOutputTokens, 4000, 200, 16000),
    maxInputChars: integer(AI_CEILING_ENV.maxInputChars, 4000, 100, 8000),
    maxToolCalls: integer(AI_CEILING_ENV.maxToolCalls, 10, 1, 20),
    maxRequestsPerSession: integer(AI_CEILING_ENV.maxRequestsPerSession, 200, 1, 2000),
    maxDailyConversations: integer(AI_CEILING_ENV.maxDailyConversations, 2000, 1, 100000),
  }
  const aiDefaults: AiSettings = {
    enabled: false,
    plannerEnabled: true,
    discoveryEnabled: flag('AI_DISCOVERY_ENABLED', true),
    quoteEnabled: true,
    adminAssistantEnabled: flag('AI_ADMIN_ASSISTANT_ENABLED', false),
    adminMaxRequestsPerHour: integer('AI_ADMIN_MAX_REQUESTS_PER_HOUR', 60, 1, 600),
    adminMaxToolCalls: integer('AI_ADMIN_MAX_TOOL_CALLS', 10, 1, 20),
    adminMaxOutputTokens: integer('AI_ADMIN_MAX_OUTPUT_TOKENS', 3000, 200, 8000),
    adminMaxInputChars: integer('AI_ADMIN_MAX_INPUT_CHARS', 4000, 100, 20000),
    languages: [...LANGUAGES],
    maxInputChars: integer('AI_MAX_INPUT_CHARS', 1200, 100, 8000),
    maxHistoryMessages: integer('AI_MAX_HISTORY_MESSAGES', 20, 2, 100),
    maxConversationMessages: integer('AI_MAX_CONVERSATION_MESSAGES', 60, 4, 400),
    maxOutputTokens: integer('AI_MAX_OUTPUT_TOKENS', 1500, 200, 16000),
    maxToolCalls: integer('AI_MAX_TOOL_CALLS', 6, 1, 20),
    maxRequestsPerSession: integer('AI_MAX_REQUESTS_PER_SESSION', 40, 1, 2000),
    maxRequestsPerIp: integer('AI_MAX_REQUESTS_PER_IP', 30, 1, 2000),
    maxConcurrentRequests: integer('AI_MAX_CONCURRENT_REQUESTS', 8, 1, 200),
    maxDailyConversations: integer('AI_MAX_DAILY_CONVERSATIONS', 100, 1, 100000),
    dailyRequests: integer('AI_DAILY_REQUESTS', 1000, 1, 1000000),
    dailyTokenBudget: integer('AI_DAILY_TOKEN_BUDGET', 2_000_000, 1000, 1_000_000_000),
    dailyBudgetUsd: decimal('AI_DAILY_BUDGET', 1, 0, 100000),
    monthlyBudgetUsd: decimal('AI_MONTHLY_BUDGET', 10, 0, 1000000),
    alertPercent: integer('AI_ALERT_PERCENT', 80, 1, 100),
    conversationMaxHours: integer('AI_CONVERSATION_MAX_HOURS', 24, 1, 720),
    retentionDays: integer('AI_RETENTION_DAYS', 7, 1, 365),
    effort: aiEffort as AiSettings['effort'],
    thinking: aiThinking as AiSettings['thinking'],
    // The prices Anthropic lists for Claude Haiku 5.5 (modules/ai/pricing.ts, with its source and date). The operator may override them in the
    // environment; an administrator cannot (a price of 0 would switch the budgets off).
    priceInputPerMTok: decimal('AI_PRICE_INPUT_PER_MTOK', AI_PRICING.inputPerMTok, 0, 1000),
    priceOutputPerMTok: decimal('AI_PRICE_OUTPUT_PER_MTOK', AI_PRICING.outputPerMTok, 0, 1000),
    pricesAsOf: text('AI_PRICES_AS_OF') ?? PRICES_AS_OF,
    welcome: noText,
    suggestions: { hu: [], en: [], nl: [] },
  }
  // A starting value above its own ceiling is a mistake in the environment: say so instead of silently clamping it.
  for (const key of AI_CEILING_KEYS) {
    if (aiDefaults[key] > aiCeilings[key]) bad(AI_CEILING_ENV[key], `is lower than the starting value of ${key} (${aiDefaults[key]}); raise the ceiling or lower the starting value`)
  }
  const ai: AiConfig = {
    enabled: flag('AI_ASSISTANT_ENABLED', true),
    automation: { enabled: flag('AI_AUTOMATION_ENABLED', false), ttlMinutes: integer('AI_AUTOMATION_TTL_MINUTES', 60, 5, 1440), maxPending: integer('AI_AUTOMATION_MAX_PENDING', 20, 1, 100) },
    apiKey: aiKey,
    keyProblem: aiKeyMalformed ? 'malformed' : null,
    connectTimeoutMs: integer('AI_CONNECT_TIMEOUT_MS', 20_000, 500, 120_000),
    ceilings: aiCeilings,
    baseUrl: aiBaseUrl,
    model: AI_MODEL_ID,
    modelOverride: aiModelOverride,
    sessionSecret: aiSessionSecret ?? '',
    timeoutMs: integer('AI_TIMEOUT_MS', 90_000, 200, 600_000),
    defaults: aiDefaults,
  }

  if (problems.length > 0) throw new ConfigError(problems)
  ai.sessionSecret = aiSessionSecret ?? `${appSecret}:control-room-ai`

  return {
    env: appEnv,
    host,
    port,
    publicUrl,
    apiPublicUrl,
    corsOrigins,
    previewOrigins,
    databasePath,
    migrateOnStart,
    seedOnStart,
    appSecret,
    trustProxy,
    secureCookies: production || (apiPublicUrl?.startsWith('https://') ?? false),
    logLevel,
    requireConsent,
    email: {
      provider,
      enabled: emailEnabled,
      from,
      replyTo,
      apiKey,
      apiUrl,
      webhookSecret,
      cloudflare,
      notifyTo,
      notifyLanguage,
      brandName: text('BRAND_NAME') ?? 'Website',
      smtp,
      fileDirectory,
      maxAttempts,
    },
    retentionDays,
    adminSessionHours,
    adminIdleMinutes,
    deployHookUrl,
    staticDir: text('STATIC_DIR'),
    countryHeader,
    rateLimitsEnabled,
    bodyLimitBytes,
    mediaDir,
    mediaMaxBytes,
    quoteReferenceFormat,
    customerLinkDays,
    client,
    ai,
    backup: { enabled: backupParts.every(Boolean), clientId: driveClientId ?? '', clientSecret: driveClientSecret ?? '', refreshToken: driveRefreshToken ?? '', folderId: driveFolderId, retentionDays: backupRetentionDays, hourUtc: backupHourUtc },
  }
}

/** What the admin's System page may show: how the server is set up, never a secret, a password or a full address. */
export function redactedConfig(config: Config): Record<string, unknown> {
  return {
    environment: config.env,
    listen: `${config.host}:${config.port}`,
    publicUrl: config.publicUrl,
    apiPublicUrl: config.apiPublicUrl,
    corsOrigins: config.corsOrigins,
    previewOrigins: config.previewOrigins,
    database: config.databasePath === ':memory:' ? 'memory' : 'file',
    appSecret: config.appSecret ? 'set' : 'missing',
    trustProxy: config.trustProxy,
    secureCookies: config.secureCookies,
    requireConsent: config.requireConsent,
    emailProvider: config.email.provider,
    emailEnabled: config.email.enabled,
    emailFromSet: config.email.from !== null,
    emailReplyToSet: config.email.replyTo !== null,
    emailApiKey: config.email.apiKey ? 'set' : 'missing',
    emailWebhookSecret: config.email.webhookSecret ? 'set' : 'missing',
    cloudflareApi: config.email.cloudflare ? 'set' : 'missing',
    ownerNotifications: config.email.provider !== 'none' && config.email.notifyTo !== null,
    smtp: config.email.smtp ? { host: config.email.smtp.host, port: config.email.smtp.port, secure: config.email.smtp.secure, authenticated: config.email.smtp.user !== null } : null,
    retentionDays: config.retentionDays,
    rateLimits: config.rateLimitsEnabled,
    deployHook: config.deployHookUrl !== null,
    servesWebsite: config.staticDir !== null,
    mediaDir: config.mediaDir,
    mediaMaxBytes: config.mediaMaxBytes,
    quoteReferenceFormat: config.quoteReferenceFormat,
    customerLinkDays: config.customerLinkDays,
    clientPortal: config.client,
    googleDriveBackup: { enabled: config.backup.enabled, credentials: config.backup.enabled ? 'set' : 'missing', folderIdSet: config.backup.folderId !== null, retentionDays: config.backup.retentionDays, hourUtc: config.backup.hourUtc },
    assistant: { enabled: config.ai.enabled, apiKey: config.ai.apiKey ? 'set' : config.ai.keyProblem === 'malformed' ? 'malformed' : 'missing', ceilings: config.ai.ceilings, model: config.ai.model, modelOverrideRejected: config.ai.modelOverride !== null, customBaseUrl: config.ai.baseUrl !== null },
  }
}
