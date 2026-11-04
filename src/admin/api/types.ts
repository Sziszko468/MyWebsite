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
}

export interface Quote {
  id: string
  reference: string
  language: Language
  name: string
  email: string
  phone: string | null
  description: string
  objective: string | null
  reference_notes: string | null
  timing: string | null
  requirements: string | null
  status: string
  inquiry_id: string | null
  archived_at: string | null
  consent_at: string | null
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

export interface QuoteDetail extends Quote {
  items: QuoteItem[]
  notes: Note[]
  pricing: { fixed: { currency: string; amount: number; vat: string }[]; quotedParts: number }
  inquiry: InquirySummary | null
  candidates: InquirySummary[]
  activity: ActivityEvent[]
}

export interface ListQuery {
  q?: string
  status?: string
  kind?: string
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
  quotes: { total: number; new: number; inReview: number; quoted: number; accepted: number; declined: number; closed: number; pending: number; completed: number; archived: number; last7Days: number; last30Days: number }
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
  reference: string | null
  recipient: string
  language: string
  status: string
  attempts: number
  nextAttemptAt: string | null
  lastError: string | null
  acceptedAt: string | null
  createdAt: string
}

export interface NotificationsData {
  integration: { enabled: boolean; provider: string; senderConfigured: boolean; ownerAddressConfigured: boolean; ownerLanguage: Language; secure: string | null }
  types: { id: 'new_inquiry' | 'new_quote' | 'status_update'; automatic: boolean; enabled: boolean; active: boolean }[]
  preferences: { newInquiry: boolean; newQuote: boolean }
  counts: { pending: number; accepted: number; failed: number }
  lastFailure: { at: string; error: string } | null
  deliveries: Delivery[]
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
