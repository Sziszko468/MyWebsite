import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Level } from './lib/logger.ts'

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
  /** The assistant's availability switch. With it off the website simply does not offer the assistant. */
  enabled: boolean
  plannerEnabled: boolean
  /** Whether an approved plan may be sent to the quote-request system. */
  quoteEnabled: boolean
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
  maxDailyConversations: number
  dailyRequests: number
  dailyTokenBudget: number
  /** USD. A request that could take the day or the month over its budget is refused before it starts. */
  dailyBudgetUsd: number
  monthlyBudgetUsd: number
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

export interface AiConfig {
  /** `AI_ASSISTANT_ENABLED`: the operator's master switch. The assistant is offered only with this on AND an API key. */
  enabled: boolean
  /** `ANTHROPIC_API_KEY`. A secret: server only, never logged, never in an answer. */
  apiKey: string | null
  /** `ANTHROPIC_BASE_URL`: another address for the provider's API (a proxy, or the local stand-in the tests use). */
  baseUrl: string | null
  /** `ANTHROPIC_MODEL`: the one model the assistant uses. */
  model: string
  /** Signs the anonymous session tokens (`AI_SESSION_SECRET`, or derived from APP_SECRET). */
  sessionSecret: string
  /** `AI_TIMEOUT_MS`: the longest one answer may take, tool rounds included; a stalled provider is cut off after this. */
  timeoutMs: number
  /** The starting values of the settings an administrator can change. */
  defaults: AiSettings
}

export const AI_DEFAULT_MODEL = 'claude-haiku-5-5'

export interface Config {
  env: AppEnv
  host: string
  port: number
  /** The origin of the public website, for links in e-mails. */
  publicUrl: string | null
  /** The origin this server is reached at; decides whether cookies are `Secure`. */
  apiPublicUrl: string | null
  corsOrigins: readonly string[]
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
  rateLimitsEnabled: boolean
  bodyLimitBytes: number
  /** Where uploaded images are kept (never in the database). */
  mediaDir: string
  /** The largest image an administrator may upload, in bytes. */
  mediaMaxBytes: number
  ai: AiConfig
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
  const aiModel = text('ANTHROPIC_MODEL') ?? AI_DEFAULT_MODEL
  if (!/^claude-[a-z0-9][a-z0-9.-]{2,60}$/.test(aiModel)) bad('ANTHROPIC_MODEL', `must be a Claude model identifier such as ${AI_DEFAULT_MODEL} (got "${aiModel}")`)
  const aiKey = text('ANTHROPIC_API_KEY')
  if (aiKey !== null && (aiKey.length < 20 || /\s/.test(aiKey))) bad('ANTHROPIC_API_KEY', 'does not look like an API key')
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
  const aiDefaults: AiSettings = {
    enabled: true,
    plannerEnabled: true,
    quoteEnabled: true,
    languages: [...LANGUAGES],
    maxInputChars: integer('AI_MAX_INPUT_CHARS', 1200, 100, 8000),
    maxHistoryMessages: integer('AI_MAX_HISTORY_MESSAGES', 20, 2, 100),
    maxConversationMessages: integer('AI_MAX_CONVERSATION_MESSAGES', 60, 4, 400),
    maxOutputTokens: integer('AI_MAX_OUTPUT_TOKENS', 1500, 200, 16000),
    maxToolCalls: integer('AI_MAX_TOOL_CALLS', 6, 1, 20),
    maxRequestsPerSession: integer('AI_MAX_REQUESTS_PER_SESSION', 40, 1, 2000),
    maxRequestsPerIp: integer('AI_MAX_REQUESTS_PER_IP', 30, 1, 2000),
    maxDailyConversations: integer('AI_MAX_DAILY_CONVERSATIONS', 100, 1, 100000),
    dailyRequests: integer('AI_DAILY_REQUESTS', 1000, 1, 1000000),
    dailyTokenBudget: integer('AI_DAILY_TOKEN_BUDGET', 2_000_000, 1000, 1_000_000_000),
    dailyBudgetUsd: decimal('AI_DAILY_BUDGET', 1, 0, 100000),
    monthlyBudgetUsd: decimal('AI_MONTHLY_BUDGET', 10, 0, 1000000),
    conversationMaxHours: integer('AI_CONVERSATION_MAX_HOURS', 24, 1, 720),
    retentionDays: integer('AI_RETENTION_DAYS', 7, 1, 365),
    effort: aiEffort as AiSettings['effort'],
    thinking: aiThinking as AiSettings['thinking'],
    // The prices Anthropic lists for Claude Haiku 5.5 (prompts up to 100K tokens) on 2026-10-06. Change them here or in the
    // administration when the provider changes them; the code holds no other price.
    priceInputPerMTok: decimal('AI_PRICE_INPUT_PER_MTOK', 0.1, 0, 1000),
    priceOutputPerMTok: decimal('AI_PRICE_OUTPUT_PER_MTOK', 0.5, 0, 1000),
    pricesAsOf: text('AI_PRICES_AS_OF') ?? '2026-10-06',
    welcome: noText,
    suggestions: { hu: [], en: [], nl: [] },
  }
  const ai: AiConfig = {
    enabled: flag('AI_ASSISTANT_ENABLED', true),
    apiKey: aiKey,
    baseUrl: aiBaseUrl,
    model: aiModel,
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
    rateLimitsEnabled,
    bodyLimitBytes,
    mediaDir,
    mediaMaxBytes,
    ai,
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
    assistant: { enabled: config.ai.enabled, apiKey: config.ai.apiKey ? 'set' : 'missing', model: config.ai.model, customBaseUrl: config.ai.baseUrl !== null },
  }
}
