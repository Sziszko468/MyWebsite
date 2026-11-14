import type { Language } from '../../i18n/config'

/** What the backend's `/api/admin/*` answers (server/src/modules/*), as the application uses it. */

export type Permission = 'requests:read' | 'requests:write' | 'requests:delete' | 'catalog:write' | 'catalog:delete' | 'content:write' | 'content:delete' | 'system:read' | 'system:write'
export type Role = 'admin' | 'editor'
export type InterfaceLanguage = 'hu' | 'en'
export type ThemePreference = 'light' | 'dark'

export interface Preferences {
  language: InterfaceLanguage | null
  theme: ThemePreference | null
}

export interface SessionData {
  user: { email: string; role: Role; permissions: Permission[]; preferences: Preferences }
  csrfToken: string
  meta: {
    statuses: { inquiry: string[]; quote: string[] }
    quoteMeta: { types: string[]; priorities: string[]; sources: string[] }
    /** Whether quotations can be sent at all: e-mail and the site's address are configured. */
    quotationsReady: boolean
    /** Where a request in each status may be moved by hand. */
    quoteTransitions: Record<string, string[]>
    kinds: string[]
    sorts: string[]
    languages: Language[]
    interfaceLanguages: InterfaceLanguage[]
    translationGroups: TranslationGroup[]
    idleMinutes: number
    sessionHours: number
    emailEnabled: boolean
  }
}

export interface LoginData {
  csrfToken: string
  user: SessionData['user']
}

export interface Page {
  page: number
  pageSize: number
  total: number
}

// ---- inquiries and quote requests ---------------------------------------------------------------------------------------

export interface Inquiry {
  id: string
  reference: string
  language: Language
  kind: string
  name: string
  email: string
  subject: string
  message: string
  status: string
  archived_at: string | null
  consent_at: string | null
  created_at: string
  updated_at: string
}

export interface Note {
  id: number
  author_email: string | null
  body: string
  created_at: string
}

export interface ActivityEvent {
  at: string
  actor: string | null
  action: string
  detail: Record<string, unknown> | null
}

export interface LinkedQuote {
  id: string
  reference: string
  status: string
  created_at: string
}

export interface InquiryDetail extends Inquiry {
  notes: Note[]
  quotes: LinkedQuote[]
  activity: ActivityEvent[]
}

export interface PricedPart {
  code: string
  price: { kind: 'quote' | 'tbd' } | { kind: 'from'; amount: number; currency: string }
  vat: string
}

export interface QuoteItem {
  position: number
  need: string
  service: string | null
  plan: string
  package: string | null
  extras: string[]
  snapshot: { plan: PricedPart | null; extras: PricedPart[] }
  /** Names as they were when the request was made (each in every language); empty for a request made before they were saved. */
  names: Record<string, unknown>
}

export interface Quote {
  id: string
  reference: string
  language: Language
  /** `full_experience`: the flagship offer's configurator (no cart lines, a brief); `catalogue`: built from the cart. */
  kind: 'catalogue' | 'full_experience'
  request_type: string
  source: string
  priority: string
  name: string
  email: string
  phone: string | null
  company: string | null
  website: string | null
  budget_range: string | null
  customer_status: string
  /** A FULL EXPERIENCE request's answers as stored (lib/brief.ts reads it). */
  brief_json: string | null
  description: string
  objective: string | null
  reference_notes: string | null
  timing: string | null
  requirements: string | null
  status: string
  inquiry_id: string | null
  archived_at: string | null
  consent_at: string | null
  marketing_consent_at: string | null
  created_at: string
  updated_at: string
  /** Only in the list: a short summary of what was asked for. */
  items?: { need: string; plan: string }[]
}

export interface InquirySummary {
  id: string
  reference: string
  name: string
  subject: string
  status: string
  created_at: string
}

export interface Money {
  minor: number
  text: string
}

export interface QuotationLine {
  kind: 'item' | 'optional' | 'discount'
  description: string
  detail: string
  quantity: number
  unitPrice: string
  justification: string
}

/** The shape the editor sends and the server returns for a draft: every amount is text, so what is typed round-trips exactly. */
export interface QuotationForm {
  language: Language
  title: string
  introduction: string
  understanding: string
  scope: string
  deliverables: string
  exclusions: string
  paymentTerms: string
  terms: string
  notes: string
  estimatedTimeline: string
  validUntil: string
  pricingMode: 'fixed' | 'itemized' | 'custom'
  pricingNote: string
  currency: string
  taxMode: 'unspecified' | 'excluded' | 'included' | 'exempt'
  taxRatePercent: string
  taxVerified: boolean
  taxNote: string
  fixedAmount: string
  lines: QuotationLine[]
}

export interface QuotationView {
  reference: string
  requestReference: string
  version: number
  language: Language
  status: string
  expired: boolean
  title: string
  introduction: string
  understanding: string
  scope: string
  deliverables: string
  exclusions: string
  paymentTerms: string
  terms: string
  notes: string
  estimatedTimeline: string
  customer: { name: string; company: string | null }
  validUntil: string | null
  pricing: {
    mode: string
    note: string
    currency: string | null
    lines: Array<{ kind: string; description: string; detail: string; quantity: number; unit: Money; total: Money; justification: string }>
    fixed: Money | null
    subtotal: Money | null
    discount: Money | null
    optional: Money | null
    tax: { mode: string; ratePercent: string | null; amount: Money | null; verified: boolean; note: string }
    total: Money | null
  }
  [key: string]: unknown
}

export interface Quotation {
  id: string
  quote_request_id: string
  version: number
  reference: string
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'superseded' | 'withdrawn'
  language: Language
  title: string
  valid_until: string | null
  pricing_mode: string
  currency: string | null
  total_minor: number | null
  revision_reason: string | null
  created_at: string
  updated_at: string
  sent_at: string | null
  accepted_at: string | null
  declined_at: string | null
  decline_reason: string | null
  view: QuotationView
  form: QuotationForm
}

export interface QuotationDetail {
  request: { id: string; reference: string; name: string; email: string; company: string | null; language: Language; status: string; request_type: string }
  quotation: Quotation
  problems: Record<string, string>
  canSend: boolean
  siblings: Array<{ id: string; version: number; reference: string; status: string }>
}

export interface RequestDelivery {
  id: string
  kind: string
  relatedType: string
  recipient: string
  status: string
  attempts: number
  lastError: string | null
  errorCode: string | null
  provider: string | null
  providerEvent: string | null
  createdAt: string
  acceptedAt: string | null
  deliveredAt: string | null
}

export interface HistoryEvent {
  id: number
  at: string
  type: string
  actorType: 'admin' | 'customer' | 'system' | 'assistant'
  actor: string | null
  quoteReference: string | null
  from: string | null
  to: string | null
  summary: string | null
}

export interface QuoteOverview {
  total: number
  archived: number
  open: { total: number; new: number; underReview: number; waitingCustomer: number; quotePreparation: number; quoteSent: number; accepted: number; declined: number; activeProjects: number; completed: number; cancelled: number; archived: number }
}

export interface QuoteDetail extends Quote {
  items: QuoteItem[]
  notes: Note[]
  pricing: { fixed: { currency: string; amount: number; vat: string }[]; quotedParts: number }
  inquiry: InquirySummary | null
  candidates: InquirySummary[]
  quotations: Quotation[]
  revisions: Array<{ id: string; quote_id: string; message: string; created_at: string; handled_at: string | null }>
  deliveries: RequestDelivery[]
  history: HistoryEvent[]
  customerUpdates: Array<{ id: number; kind: string; status: string | null; body: string; created_at: string }>
  nextStatuses: string[]
}

export interface ListQuery {
  q?: string
  status?: string
  kind?: string
  type?: string
  priority?: string
  source?: string
  /** The language the customer wrote in. */
  language?: string
  archived?: 'only' | 'all'
  from?: string
  to?: string
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

// ---- dashboard ----------------------------------------------------------------------------------------------------------

export interface RecentActivity extends ActivityEvent {
  entityType: string
  entityId: string | null
  label: string | null
}

export interface EmailSummary {
  enabled: boolean
  provider: string
  pending: number
  failed: number
  accepted: number
  lastFailure: { at: string; error: string } | null
}

export interface DashboardData {
  inquiries: { total: number; new: number; inProgress: number; waitingClient: number; completed: number; archived: number; last7Days: number; last30Days: number }
  quotes: { total: number; new: number; underReview: number; waitingCustomer: number; quotePreparation: number; quoteSent: number; accepted: number; declined: number; inProgress: number; cancelled: number; pending: number; completed: number; archived: number; last7Days: number; last30Days: number }
  completedRequests: number
  recentInquiries: Inquiry[]
  recentQuotes: Quote[]
  recentlyEdited: { kind: 'service' | 'package' | 'extra' | 'faq'; key: string; title: string; status: string; updatedAt: string }[]
  activity: RecentActivity[]
  email: EmailSummary
}

// ---- catalogue ----------------------------------------------------------------------------------------------------------

export type Price = { kind: 'quote' } | { kind: 'tbd' } | { kind: 'from'; amount: number; currency: 'EUR' | 'HUF' }
export type VatMode = 'unspecified' | 'excluded' | 'included' | 'exempt'
export type Status = 'active' | 'disabled'
export type Need = 'website' | 'webapp' | 'improve' | 'ui' | 'integrations' | 'unsure'

export type Translations<T> = Partial<Record<Language, T>>

export interface ServiceText {
  title: string
  summary: string
  tagline: string
  overview: string
  features: string[]
}
export interface PackageText {
  name: string
  tagline: string
  audience: string
  scope: string
  customization: string
  support: string
  priceNote: string | null
  includes: string[]
  fits: string[]
  deliverables: string[]
}
export interface ExtraText {
  name: string
  summary: string
}
export interface FaqText {
  title: string
  description: string
}

export interface ServiceRecord {
  id: number
  slug: string
  category: string
  status: Status
  position: number
  translations: Translations<ServiceText>
  packages: string[]
}
export interface PackageRecord {
  id: number
  code: string
  status: Status
  featured: boolean
  position: number
  price: Price
  vat: VatMode
  quoteRequired: boolean
  translations: Translations<PackageText>
  needs: Need[]
  extras: string[]
}
export interface ExtraRecord {
  id: number
  code: string
  status: Status
  position: number
  price: Price
  vat: VatMode
  translations: Translations<ExtraText>
  appliesTo: Need[]
}
export interface ContentRecord {
  id: number
  type: 'faq' | 'text' | 'project'
  slug: string
  status: Status
  position: number
  translations: Translations<FaqText & { data?: Record<string, unknown> }>
}

export type Orderable = 'services' | 'packages' | 'extras' | 'faq'

// ---- translations -------------------------------------------------------------------------------------------------------

export type TranslationGroup = 'services' | 'packages' | 'extras' | 'faq'
export type TranslationValue = string | string[]

export interface TranslationField {
  name: string
  kind: 'line' | 'block' | 'list'
  max: number
  required: boolean
  values: Record<Language, TranslationValue>
  missing: Language[]
}

export interface TranslationItem {
  key: string
  label: string
  status: Status
  fields: TranslationField[]
  missing: Record<Language, number>
}

export interface TranslationOverview {
  languages: Language[]
  summary: Record<Language, { fields: number; records: number }>
  groups: { id: TranslationGroup; reachesWebsite: boolean; items: TranslationItem[] }[]
}

// ---- notifications ------------------------------------------------------------------------------------------------------

export interface Delivery {
  id: string
  kind: string
  relatedType: 'inquiry' | 'quote_request' | 'system'
  /** The record's id (for a link), or null for a message that belongs to none (a test). */
  relatedId: string | null
  reference: string | null
  recipient: string
  language: string
  status: string
  /** Waiting for another attempt after a failed one. */
  retrying: boolean
  attempts: number
  nextAttemptAt: string | null
  /** What kind of failure it was (auth, quota, rejected, unavailable, bounced, …); the screen words it itself. */
  errorCode: string | null
  /** The reason the provider gave, with addresses and tokens masked. */
  lastError: string | null
  providerEvent: string | null
  acceptedAt: string | null
  deliveredAt: string | null
  createdAt: string
}

export type CheckState = 'verified' | 'not_verified' | 'unknown' | 'not_applicable'

export interface EmailCheck {
  id: 'provider' | 'provider_domain' | 'dkim' | 'spf' | 'dmarc' | 'routing_dns' | 'routing_cloudflare' | 'webhook' | 'sending'
  state: CheckState
  /** What was found, in the server's own (English) words: record names and addresses of the domain, never a secret. */
  detail: string
  checkedAt: string
}

export interface NotificationPreferences {
  newInquiry: boolean
  newQuote: boolean
  confirmInquiry: boolean
  confirmQuote: boolean
  responseNote: Record<Language, string>
}

export interface NotificationsData {
  integration: {
    enabled: boolean
    paused: boolean
    provider: string
    senderConfigured: boolean
    /** The public contact address, which is public and so is shown. */
    replyTo: string | null
    ownerAddressConfigured: boolean
    ownerLanguage: Language
    secure: string | null
    webhookSecretSet: boolean
    cloudflareApiSet: boolean
  }
  types: { id: 'new_inquiry' | 'new_quote' | 'confirm_inquiry' | 'confirm_quote' | 'status_update'; automatic: boolean; enabled: boolean; active: boolean }[]
  preferences: NotificationPreferences
  responseNoteMax: number
  counts: { pending: number; sent: number; delivered: number; failed: number; bounced: number }
  lastFailure: { at: string; error: string } | null
  /** What the checks found when they last ran (`null`: not since the server started). */
  checks: { checkedAt: string; checks: EmailCheck[] } | null
  deliveries: Delivery[]
  paging: { page: number; pageSize: number; total: number }
}

// ---- settings -----------------------------------------------------------------------------------------------------------

export interface Profile {
  email: string
  role: Role
  createdAt: string
  lastLoginAt: string | null
  preferences: Preferences
}

export interface SessionView {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  browser: string
  current: boolean
}

export interface SystemData {
  config: Record<string, unknown>
  migrations: { current: number; latest: number; pending: number }
  stats: { startedAt: number; requests: number; clientErrors: number; serverErrors: number; rateLimited: number }
  email: EmailSummary
  failedDeliveries: { id: string; kind: string; status: string; attempts: number; lastError: string | null; updatedAt: string }[]
  audit: { id: number; actor: string | null; action: string; entity_type: string; entity_id: string | null; detail: string | null; created_at: string }[]
  hasDeployHook: boolean
}
