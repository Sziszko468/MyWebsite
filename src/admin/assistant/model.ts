import type { UIMessage } from 'ai'
import type { ContextType } from '../api/assistant'

/**
 * What the assistant's screen reads out of the stored messages (PROMPT 31): the records a tool pointed at, the tool calls and their state, and the three results that have a
 * shape of their own (a report, a draft, a quotation outline). Everything here is a pure function of the messages, so it is the same for a live answer and a stored one. The
 * server decides what a tool returns; this only reads it, and never trusts a path or a reference it was not given by a tool (a path must be one of the administration's own
 * record pages).
 */

export type LinkKind = 'quote' | 'project' | 'customer' | 'conversation' | 'consultation' | 'task'
const LINK_KINDS: readonly string[] = ['quote', 'project', 'customer', 'conversation', 'consultation', 'task']

export interface RecordLink {
  type: LinkKind
  reference: string
  /** A page of the administration, relative to `/admin`. */
  path: string
}

const SAFE_PATH = /^\/(?:quotes|client-projects|clients|communications|bookings)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/
export const isSafePath = (path: unknown): path is string => typeof path === 'string' && SAFE_PATH.test(path) && !path.includes('..')

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Every `{ type, reference, path }` a tool returned, once each. A path that is not one of the administration's record pages is dropped. */
export function linksIn(value: unknown, into: Map<string, RecordLink> = new Map(), depth = 0): Map<string, RecordLink> {
  if (depth > 9 || typeof value !== 'object' || value === null) return into
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 300)) linksIn(item, into, depth + 1)
    return into
  }
  const record = value as Record<string, unknown>
  if (typeof record.type === 'string' && LINK_KINDS.includes(record.type) && typeof record.reference === 'string' && isSafePath(record.path)) {
    const key = `${record.type}:${record.reference}`
    if (!into.has(key)) into.set(key, { type: record.type as LinkKind, reference: record.reference, path: record.path })
  }
  for (const child of Object.values(record)) linksIn(child, into, depth + 1)
  return into
}

export type ToolState = 'running' | 'done' | 'failed'

export interface ToolCall {
  id: string
  name: string
  state: ToolState
  output: unknown
}

interface ToolLikePart {
  type: string
  toolCallId?: string
  state?: string
  output?: unknown
}

/** The tool parts of a message (the SDK names them `tool-<name>`); the SDK's own union is wider than what this screen reads, so they are read as the small shape above. */
const toolPartsOf = (message: UIMessage): ToolLikePart[] => message.parts.flatMap((part) => (part.type.startsWith('tool-') ? [part as unknown as ToolLikePart] : []))

/** The tool calls of a message, in order, each with its state (a result that says it could not be read counts as failed). */
export function toolCallsOf(message: UIMessage): ToolCall[] {
  return toolPartsOf(message).map((part, index) => {
    const output = part.state === 'output-available' ? part.output : undefined
    const refused = isRecord(output) && typeof output.error === 'string'
    const state: ToolState = part.state === 'output-error' || refused ? 'failed' : part.state === 'output-available' ? 'done' : 'running'
    return { id: part.toolCallId ?? `${message.id}-${index}`, name: part.type.slice(5), state, output }
  })
}

export const textOf = (message: UIMessage): string => message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')

/** All the records the tools of these messages pointed at. */
export function sourcesOf(messages: readonly UIMessage[]): RecordLink[] {
  const found = new Map<string, RecordLink>()
  for (const message of messages) for (const call of toolCallsOf(message)) linksIn(call.output, found)
  return [...found.values()]
}

// ---- the three shapes -------------------------------------------------------------------------------------------------------------

export interface Report {
  kind: string
  generatedAt: string
  subject: { type: string; reference: string; path: string } | null
  period: { description: string; from?: string; to?: string } | null
  dataSources: string[]
  confirmedFacts: unknown
  aiObservations: string[]
  recommendations: string[]
  missingInformation: string[]
  limitations: string[]
  notAvailableToYou: string[]
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

export function reportOf(call: ToolCall): Report | null {
  const output = call.output
  if (!isRecord(output) || output.status !== 'report_generated' || !isRecord(output.report)) return null
  const report = output.report
  if (typeof report.kind !== 'string' || typeof report.generatedAt !== 'string') return null
  const subject = isRecord(report.subject) && typeof report.subject.type === 'string' && typeof report.subject.reference === 'string' && isSafePath(report.subject.path) ? { type: report.subject.type, reference: report.subject.reference, path: report.subject.path } : null
  const period = isRecord(report.period) && typeof report.period.description === 'string' ? { description: report.period.description, from: typeof report.period.from === 'string' ? report.period.from : undefined, to: typeof report.period.to === 'string' ? report.period.to : undefined } : null
  return {
    kind: report.kind,
    generatedAt: report.generatedAt,
    subject,
    period,
    dataSources: strings(report.dataSources),
    confirmedFacts: report.confirmedFacts,
    aiObservations: strings(report.aiObservations),
    recommendations: strings(report.recommendations),
    missingInformation: strings(report.missingInformation),
    limitations: strings(report.limitations),
    notAvailableToYou: strings(report.notAvailableToYou),
  }
}

export interface Draft {
  kind: 'reply' | 'translation'
  body: string
  language: string
  customerPreferredLanguage: string | null
  conversationReference: string | null
  path: string | null
  original: string | null
}

export function draftOf(call: ToolCall): Draft | null {
  const output = call.output
  if (!isRecord(output) || output.status !== 'draft_not_sent' || typeof output.body !== 'string') return null
  const link = isRecord(output.link) && isSafePath(output.link.path) ? output.link.path : null
  return {
    kind: call.name === 'translateCustomerReply' ? 'translation' : 'reply',
    body: output.body,
    language: typeof output.language === 'string' ? output.language : '',
    customerPreferredLanguage: typeof output.customerPreferredLanguage === 'string' ? output.customerPreferredLanguage : null,
    conversationReference: typeof output.conversationReference === 'string' ? output.conversationReference : null,
    path: link,
    original: typeof output.original === 'string' ? output.original : null,
  }
}

/** A proposal the assistant made (PROMPT 33): nothing was done, an administrator decides it on its own page. Only a result the server marked as a proposal, with a path that is exactly the page of an action. */
export interface Proposal {
  reference: string
  type: string
  expiresAt: string | null
  requiresSecondConfirmation: boolean
  duplicate: boolean
  path: string
}

const ACTION_PATH = /^\/automation\/ACT-[A-Z0-9]{8}$/

export function proposalOf(call: ToolCall): Proposal | null {
  const output = call.output
  if (!isRecord(output) || output.status !== 'awaiting_approval' || output.approvalRequired !== true || !isRecord(output.proposal) || !isRecord(output.link)) return null
  const proposal = output.proposal
  const path = output.link.path
  if (typeof proposal.reference !== 'string' || typeof proposal.type !== 'string' || typeof path !== 'string' || !ACTION_PATH.test(path) || path !== `/automation/${proposal.reference}`) return null
  return { reference: proposal.reference, type: proposal.type, expiresAt: typeof proposal.expiresAt === 'string' ? proposal.expiresAt : null, requiresSecondConfirmation: proposal.requiresSecondConfirmation === true, duplicate: output.duplicate === true, path }
}

export const OUTLINE_SECTIONS = ['introduction', 'understanding', 'scope', 'deliverables', 'exclusions', 'assumptions', 'openQuestions'] as const
export type OutlineSection = (typeof OUTLINE_SECTIONS)[number]

export interface Outline {
  quoteReference: string
  path: string | null
  sections: Record<OutlineSection, string[]>
}

export function outlineOf(call: ToolCall): Outline | null {
  const output = call.output
  if (!isRecord(output) || output.stage !== 'outline' || !isRecord(output.outline)) return null
  const outline = output.outline
  const section = (key: OutlineSection): string[] => (typeof outline[key] === 'string' ? [outline[key] as string] : strings(outline[key]))
  return {
    quoteReference: typeof output.quoteReference === 'string' ? output.quoteReference : '',
    path: isRecord(output.link) && isSafePath(output.link.path) ? output.link.path : null,
    sections: Object.fromEntries(OUTLINE_SECTIONS.map((key) => [key, section(key)])) as Record<OutlineSection, string[]>,
  }
}

// ---- context ------------------------------------------------------------------------------------------------------------------------

export interface ContextChoice {
  type: ContextType
  ref: string | null
  /** What the administrator picked it by (a reference and a name), for the label. */
  label: string | null
}

export const GENERAL_CONTEXT: ContextChoice = { type: 'general', ref: null, label: null }

/** The page of the administration for the record a context is about, if a tool has already pointed at it. */
export function contextPath(context: Pick<ContextChoice, 'type' | 'ref'>, sources: readonly RecordLink[]): string | null {
  if (context.type === 'general' || !context.ref) return null
  const kind: LinkKind = context.type
  return sources.find((source) => source.type === kind && source.reference === context.ref)?.path ?? null
}

/** The references a context may be started with from an address (`?context=project&ref=PRJ-…`): the same shape the server accepts, nothing else. */
export function contextFromParams(type: string | null, ref: string | null): ContextChoice | null {
  if (!type || !ref) return null
  if (!['project', 'quote', 'customer', 'conversation', 'consultation'].includes(type)) return null
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(ref)) return null
  return { type: type as ContextType, ref, label: ref }
}
