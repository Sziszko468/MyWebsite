import { del, get, post, put, patch, request, queryString, type Envelope } from './client'
import type {
  ContentRecord, DashboardData, ExtraRecord, Inquiry, InquiryDetail, ListQuery, LoginData, NotificationPreferences, NotificationsData, EmailCheck, Orderable, Page, PackageRecord, Preferences, Profile, Quote, QuoteDetail,
  ServiceRecord, SessionData, SessionView, SystemData, TranslationGroup, TranslationItem, TranslationOverview,
} from './types'

/** One function per backend route the application uses (server/src/modules/admin/routes.ts). */

const base = '/api/admin'

const listQuery = (query: ListQuery) => ({ ...query, archived: query.archived })
const pageOf = (meta: Envelope<unknown>['meta']): Page => meta as unknown as Page

export const session = {
  current: () => request<SessionData>('GET', `${base}/session`, { anonymous: true }),
  login: (email: string, password: string) => request<LoginData>('POST', `${base}/login`, { body: { email, password }, anonymous: true }),
  logout: () => post<undefined>(`${base}/logout`, {}),
}

export const dashboard = (signal?: AbortSignal) => get<DashboardData>(`${base}/dashboard`, { signal })

export const inquiries = {
  list: async (query: ListQuery, signal?: AbortSignal) => {
    const { data, meta } = await get<Inquiry[]>(`${base}/inquiries`, { query: listQuery(query), signal })
    return { rows: data, page: pageOf(meta) }
  },
  get: (id: string, signal?: AbortSignal) => get<InquiryDetail>(`${base}/inquiries/${encodeURIComponent(id)}`, { signal }),
  update: (id: string, changes: { status?: string; notify?: boolean; note?: string; archived?: boolean; addNote?: string }) => patch<InquiryDetail>(`${base}/inquiries/${encodeURIComponent(id)}`, changes),
  remove: (id: string) => del(`${base}/inquiries/${encodeURIComponent(id)}`),
}

export const quotes = {
  list: async (query: ListQuery, signal?: AbortSignal) => {
    const { data, meta } = await get<Quote[]>(`${base}/quote-requests`, { query: listQuery(query), signal })
    return { rows: data, page: pageOf(meta) }
  },
  get: (id: string, signal?: AbortSignal) => get<QuoteDetail>(`${base}/quote-requests/${encodeURIComponent(id)}`, { signal }),
  update: (id: string, changes: { status?: string; notify?: boolean; note?: string; archived?: boolean; addNote?: string; inquiryId?: string | null }) =>
    patch<QuoteDetail>(`${base}/quote-requests/${encodeURIComponent(id)}`, changes),
  remove: (id: string) => del(`${base}/quote-requests/${encodeURIComponent(id)}`),
  /** Plain links: the browser downloads these with its own session cookie. */
  csvUrl: (query: ListQuery) => `${base}/quote-requests/export.csv${queryString(listQuery({ ...query, page: undefined, pageSize: undefined }))}`,
  jsonUrl: (id: string) => `${base}/quote-requests/${encodeURIComponent(id)}/export.json`,
}

export const catalog = {
  services: () => get<ServiceRecord[]>(`${base}/services`),
  service: (slug: string, signal?: AbortSignal) => get<ServiceRecord>(`${base}/services/${encodeURIComponent(slug)}`, { signal }),
  createService: (body: unknown) => post<ServiceRecord>(`${base}/services`, body),
  updateService: (slug: string, body: unknown) => put<ServiceRecord>(`${base}/services/${encodeURIComponent(slug)}`, body),
  deleteService: (slug: string) => del(`${base}/services/${encodeURIComponent(slug)}`),

  packages: () => get<PackageRecord[]>(`${base}/packages`),
  pack: (code: string, signal?: AbortSignal) => get<PackageRecord>(`${base}/packages/${encodeURIComponent(code)}`, { signal }),
  createPackage: (body: unknown) => post<PackageRecord>(`${base}/packages`, body),
  updatePackage: (code: string, body: unknown) => put<PackageRecord>(`${base}/packages/${encodeURIComponent(code)}`, body),
  deletePackage: (code: string) => del(`${base}/packages/${encodeURIComponent(code)}`),

  extras: () => get<ExtraRecord[]>(`${base}/extras`),
  extra: (code: string, signal?: AbortSignal) => get<ExtraRecord>(`${base}/extras/${encodeURIComponent(code)}`, { signal }),
  createExtra: (body: unknown) => post<ExtraRecord>(`${base}/extras`, body),
  updateExtra: (code: string, body: unknown) => put<ExtraRecord>(`${base}/extras/${encodeURIComponent(code)}`, body),
  deleteExtra: (code: string) => del(`${base}/extras/${encodeURIComponent(code)}`),

  faq: () => get<ContentRecord[]>(`${base}/content`, { query: { type: 'faq' } }),
  faqEntry: (slug: string, signal?: AbortSignal) => get<ContentRecord>(`${base}/content/faq/${encodeURIComponent(slug)}`, { signal }),
  createFaq: (body: unknown) => post<ContentRecord>(`${base}/content`, { ...(body as object), type: 'faq' }),
  updateFaq: (slug: string, body: unknown) => put<ContentRecord>(`${base}/content/faq/${encodeURIComponent(slug)}`, body),
  deleteFaq: (slug: string) => del(`${base}/content/faq/${encodeURIComponent(slug)}`),

  reorder: (kind: Orderable, keys: string[]) => put<undefined>(`${base}/order/${kind}`, { keys }),
}

export const translations = {
  overview: (query: { group?: TranslationGroup | ''; lang?: string; missing?: boolean }, signal?: AbortSignal) => get<TranslationOverview>(`${base}/translations`, { query, signal }),
  save: (group: TranslationGroup, key: string, language: string, fields: Record<string, string | string[]>) =>
    put<TranslationItem>(`${base}/translations/${group}/${encodeURIComponent(key)}/${language}`, { fields }),
}

export const notifications = {
  overview: (query: { status?: string; page?: number } = {}, signal?: AbortSignal) => get<NotificationsData>(`${base}/notifications`, { query, signal }),
  savePreferences: (preferences: NotificationPreferences) => put<NotificationPreferences>(`${base}/notifications/preferences`, preferences),
  retry: (id: string) => post<{ queued: boolean }>(`${base}/notifications/deliveries/${encodeURIComponent(id)}/retry`, {}),
  runChecks: () => post<{ checkedAt: string; checks: EmailCheck[] }>(`${base}/notifications/checks`, {}),
  sendTest: () => post<{ id: string }>(`${base}/notifications/test`, {}),
}

export const settings = {
  profile: (signal?: AbortSignal) => get<{ profile: Profile }>(`${base}/settings`, { signal }),
  savePreferences: (preferences: Partial<Preferences>) => put<Preferences>(`${base}/settings/preferences`, preferences),
  changePassword: (current: string, next: string) => post<{ otherSessionsClosed: number }>(`${base}/account/password`, { current, next }),
  sessions: (signal?: AbortSignal) => get<SessionView[]>(`${base}/sessions`, { signal }),
  endSession: (id: string) => del(`${base}/sessions/${encodeURIComponent(id)}`),
  endOtherSessions: () => post<{ closed: number }>(`${base}/sessions/revoke-others`, {}),
}

export const system = {
  get: (signal?: AbortSignal) => get<SystemData>(`${base}/system`, { signal }),
  maintenance: () => post<{ expiredSessions: number; inquiries: number; quoteRequests: number; deliveries: number }>(`${base}/system/maintenance`, {}),
  publish: () => post<{ published: boolean }>(`${base}/system/publish`, {}),
}

// ---- the portfolio (PROMPT 13.1): projects, pictures and the website's own wording ----

import type { Category, MediaItem, ProjectDetailData, ProjectList, TextKey } from './projectTypes'

export const projects = {
  list: (signal?: AbortSignal) => get<ProjectList>(`${base}/projects`, { signal }).then((answer) => answer.data),
  get: (id: number, signal?: AbortSignal) => get<ProjectDetailData>(`${base}/projects/${id}`, { signal }).then((answer) => answer.data),
  create: (body: unknown) => post<ProjectDetailData>(`${base}/projects`, body).then((answer) => answer.data),
  update: (id: number, body: unknown) => put<ProjectDetailData>(`${base}/projects/${id}`, body).then((answer) => answer.data),
  feature: (id: number, featured: boolean) => patch<ProjectDetailData>(`${base}/projects/${id}`, { featured }).then((answer) => answer.data),
  publish: (id: number) => post<ProjectDetailData>(`${base}/projects/${id}/publish`, {}).then((answer) => answer.data),
  unpublish: (id: number) => post<ProjectDetailData>(`${base}/projects/${id}/unpublish`, {}).then((answer) => answer.data),
  archive: (id: number) => post<ProjectDetailData>(`${base}/projects/${id}/archive`, {}).then((answer) => answer.data),
  restore: (id: number) => post<ProjectDetailData>(`${base}/projects/${id}/restore`, {}).then((answer) => answer.data),
  duplicate: (id: number) => post<ProjectDetailData>(`${base}/projects/${id}/duplicate`, {}).then((answer) => answer.data),
  remove: (id: number) => del(`${base}/projects/${id}`),
  reorder: (ids: number[]) => put<undefined>(`${base}/project-order`, { ids }),
  settings: (signal?: AbortSignal) => get<{ categories: Category[]; requireAllLanguages: boolean }>(`${base}/project-settings`, { signal }).then((answer) => answer.data),
  saveSettings: (body: { categories?: Category[]; requireAllLanguages?: boolean }) => put<{ categories: Category[]; requireAllLanguages: boolean }>(`${base}/project-settings`, body).then((answer) => answer.data),
}

export const media = {
  list: (signal?: AbortSignal) => get<MediaItem[]>(`${base}/media`, { signal }).then((answer) => answer.data),
  upload: (blob: Blob, name: string) => request<MediaItem>('POST', `${base}/media`, { rawBody: blob, query: { name } }).then((answer) => answer.data),
  remove: (id: number) => del(`${base}/media/${id}`),
}

export const texts = {
  list: (signal?: AbortSignal) => get<{ keys: TextKey[] }>(`${base}/texts`, { signal }).then((answer) => answer.data.keys),
  save: (key: string, values: Record<string, string>) => put<TextKey>(`${base}/texts/${encodeURIComponent(key)}`, { values }).then((answer) => answer.data),
}
