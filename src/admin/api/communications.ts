import { get, patch, post, put, request } from './client'

/**
 * The communication system's side of the administration (server/src/modules/communications/routes.ts): the conversations between the owner and each customer, the owner's private
 * notes, announcements, the status of a conversation and the owner's choices. The server decides every rule (who is expected to answer, what a customer may see, what a status move
 * does); the screens here only ask and say what came back.
 */

export const CONVERSATION_STATUSES = ['open', 'waiting_owner', 'waiting_customer', 'resolved', 'archived'] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]
export const ADMIN_FILTERS = ['all', 'unread', 'open', 'waiting_owner', 'waiting_customer', 'resolved', 'archived'] as const
export type AdminFilter = (typeof ADMIN_FILTERS)[number]
export const CONTEXT_TYPES = ['project', 'deliverable', 'task', 'booking', 'quote'] as const
export type ContextType = (typeof CONTEXT_TYPES)[number]

export interface ConversationRow {
  reference: string
  subject: string
  status: ConversationStatus
  startedBy: 'customer' | 'admin'
  customer: { id: string; name: string | null; email: string; company: string | null; language: string; status: string }
  project: { id: string; reference: string; name: string } | null
  context: { type: ContextType; reference: string; title: string | null } | null
  lastMessageAt: string | null
  lastActivityAt: string
  lastSender: 'customer' | 'owner' | null
  preview: string | null
  unread: number
  notes: number
  resolutionRequested: boolean
  snippet?: string | null
  inNote?: boolean
}

export interface Message {
  id: string
  seq: number
  type: 'text' | 'announcement' | 'system_event'
  visibility: 'customer' | 'internal'
  from: 'customer' | 'owner' | 'system'
  adminEmail: string | null
  mine: boolean
  body: string | null
  removed: boolean
  edited: boolean
  important: boolean
  event: { key: string; params: Record<string, string | number | boolean | null> } | null
  createdAt: string
  feed: boolean
}

export interface Conversation extends ConversationRow {
  createdAt: string
  revision: number
  messages: Message[]
  page: { hasOlder: boolean; oldestSeq: number | null; newestSeq: number | null }
  marker: number
  messageCountTotal: number
}

export interface CommunicationSettings {
  customerCanStart: boolean
  replies: boolean
  announcements: boolean
  important: boolean
  resolution: boolean
  messageToOwner: boolean
  resolutionRequested: boolean
}

export interface Overview {
  open: number
  waitingOwner: number
  waitingCustomer: number
  resolved: number
  archived: number
  unreadThreads: number
  unreadMessages: number
  recent: ConversationRow[]
  settings: CommunicationSettings
}

export interface ContextOption {
  type: ContextType
  reference: string
  label: string
  project: string | null
}

export interface InboxQuery {
  filter: AdminFilter
  customerId?: string
  projectId?: string
  context?: ContextType | ''
  from?: string
  to?: string
  cursor?: string | null
}

const base = '/api/admin/communications'
const enc = encodeURIComponent
const data = async <T>(promise: Promise<{ data: T }>): Promise<T> => (await promise).data

function queryOf(query: InboxQuery): string {
  const parts = [`filter=${query.filter}`]
  if (query.customerId) parts.push(`customerId=${enc(query.customerId)}`)
  if (query.projectId) parts.push(`projectId=${enc(query.projectId)}`)
  if (query.context) parts.push(`context=${query.context}`)
  if (query.from) parts.push(`from=${enc(query.from)}`)
  if (query.to) parts.push(`to=${enc(query.to)}`)
  if (query.cursor) parts.push(`cursor=${enc(query.cursor)}`)
  return `?${parts.join('&')}`
}

export const communications = {
  overview: (signal?: AbortSignal) => data(get<Overview>(`${base}/overview`, { signal })),
  list: async (query: InboxQuery, signal?: AbortSignal) => data(get<{ items: ConversationRow[]; next: string | null }>(`${base}${queryOf(query)}`, { signal })),
  search: (q: string, signal?: AbortSignal) => data(get<{ items: ConversationRow[] }>(`${base}/search?q=${enc(q)}`, { signal })),
  contexts: (customerId: string, signal?: AbortSignal) => data(get<{ items: ContextOption[] }>(`${base}/contexts?customerId=${enc(customerId)}`, { signal })),
  start: (body: { customerId: string; subject: string; body: string; kind: 'reply' | 'announcement'; important?: boolean; confirm?: boolean; context?: { type: ContextType; reference: string } | null; clientToken: string }) => data(post<Conversation>(base, body)),
  get: (reference: string, before?: number | null, signal?: AbortSignal) => data(get<Conversation>(`${base}/${enc(reference)}${before ? `?before=${before}` : ''}`, { signal })),
  within: (reference: string, q: string, signal?: AbortSignal) => data(get<{ items: Message[] }>(`${base}/${enc(reference)}/search?q=${enc(q)}`, { signal })),
  post: (reference: string, body: { kind: 'reply' | 'announcement' | 'note'; body: string; important?: boolean; confirm?: boolean; clientToken: string }) => data(post<Conversation>(`${base}/${enc(reference)}/messages`, body)),
  editNote: (reference: string, id: string, body: string) => data(patch<Conversation>(`${base}/${enc(reference)}/messages/${enc(id)}`, { body })),
  remove: (reference: string, id: string) => data(request<Conversation>('DELETE', `${base}/${enc(reference)}/messages/${enc(id)}`)),
  status: (reference: string, status: ConversationStatus, revision: number) => data(post<Conversation>(`${base}/${enc(reference)}/status`, { status, revision })),
  read: (reference: string, upTo: number) => data(post<{ marker: number }>(`${base}/${enc(reference)}/read`, { upTo })),
  settings: (signal?: AbortSignal) => data(get<CommunicationSettings>('/api/admin/communication-settings', { signal })),
  saveSettings: (body: Partial<CommunicationSettings>) => data(put<CommunicationSettings>('/api/admin/communication-settings', body)),
}
