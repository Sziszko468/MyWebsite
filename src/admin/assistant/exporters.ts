import type { UIMessage } from 'ai'
import type { AssistantLanguage } from '../api/assistant'
import type { AssistantText } from '../i18n/assistant'
import { fill } from '../../utils/format'
import { textOf, type Draft, type Report, type RecordLink } from './model'

/**
 * Getting a summary or a report OUT of the screen (PROMPT 31): copy it, download it as a text file, print it. All of it is made in the browser from what is already on the
 * screen; nothing is sent anywhere and no file is fetched. The words around the content are the interface's (in the assistant's language), and every export says it was
 * prepared by an AI assistant and has to be checked.
 */

const LOCALE: Record<AssistantLanguage, string> = { hu: 'hu-HU', en: 'en-GB', nl: 'nl-NL' }

export function formatMoment(value: string, language: AssistantLanguage): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(LOCALE[language], { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** `overdueTasksNow` → `overdue tasks now`: a field of the data, shown as the stored name it is. */
export const humanKey = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()

const scalar = (value: unknown): string => (value === null || value === undefined ? '—' : typeof value === 'string' ? value : String(value))

/** A nested value as indented lines (a list is cut after `limit` items; the screen says how many were left out). */
export function factLines(value: unknown, depth = 0, limit = 25, lines: string[] = []): string[] {
  const pad = '  '.repeat(depth)
  if (depth > 6) return lines
  if (Array.isArray(value)) {
    value.slice(0, limit).forEach((item) => {
      if (typeof item === 'object' && item !== null) {
        lines.push(`${pad}-`)
        factLines(item, depth + 1, limit, lines)
      } else lines.push(`${pad}- ${scalar(item)}`)
    })
    if (value.length > limit) lines.push(`${pad}- … ${value.length - limit}`)
    return lines
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === 'object' && child !== null) {
        lines.push(`${pad}${humanKey(key)}:`)
        factLines(child, depth + 1, limit, lines)
      } else lines.push(`${pad}${humanKey(key)}: ${scalar(child)}`)
    }
    return lines
  }
  lines.push(`${pad}${scalar(value)}`)
  return lines
}

const list = (items: readonly string[], none: string): string => (items.length === 0 ? `- ${none}` : items.map((item) => `- ${item}`).join('\n'))

/** A report as plain text (Markdown-friendly): the facts and the assistant's own words under their own headings. */
export function reportToText(report: Report, t: AssistantText, language: AssistantLanguage): string {
  const titles = t.report.titles as Record<string, string>
  const limitations = t.report.limitationTexts as Record<string, string>
  const missing = t.report.missingTexts as Record<string, string>
  const parts = [
    `# ${titles[report.kind] ?? report.kind}`,
    `${t.report.generatedAt}: ${formatMoment(report.generatedAt, language)}`,
    report.subject ? `${t.report.subject}: ${report.subject.reference}` : '',
    report.period ? `${t.report.period}: ${report.period.description}` : '',
    `${t.report.sources}: ${report.dataSources.join(', ')}`,
    '',
    `## ${t.report.facts}`,
    factLines(report.confirmedFacts).join('\n'),
    '',
    `## ${t.report.observations}`,
    list(report.aiObservations, t.report.none),
    '',
    `## ${t.report.recommendations}`,
    list(report.recommendations, t.report.none),
    '',
    `## ${t.report.missing}`,
    list(report.missingInformation.map((code) => missing[code] ?? code), t.report.none),
    '',
    `## ${t.report.limitations}`,
    list(report.limitations.map((code) => limitations[code] ?? code), t.report.none),
    report.notAvailableToYou.length > 0 ? `\n## ${t.report.notAvailable}\n${list(report.notAvailableToYou.map((area) => (t.report.unavailableAreas as Record<string, string>)[area] ?? area), t.report.none)}` : '',
    '',
    t.report.humanReview,
  ]
  return parts.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')
}

export function draftToText(draft: Draft, t: AssistantText): string {
  return `${draft.kind === 'translation' ? t.draft.translationTitle : t.draft.replyTitle}\n${t.draft.notSent}\n\n${draft.body}\n`
}

export interface SummaryInput {
  messages: readonly UIMessage[]
  contextLabel: string
  sources: readonly RecordLink[]
  title: string | null
  now: Date
}

/** The conversation as a text summary: who asked what, what the assistant answered, the records used, and the notice. */
export function conversationSummary(input: SummaryInput, t: AssistantText, language: AssistantLanguage): string {
  const lines = [`# ${t.summary.heading}${input.title ? `: ${input.title}` : ''}`, `${t.summary.context}: ${input.contextLabel}`, `${t.summary.generated}: ${formatMoment(input.now.toISOString(), language)}`, '']
  for (const message of input.messages) {
    const body = textOf(message).trim()
    if (!body) continue
    lines.push(message.role === 'user' ? `## ${t.summary.question}` : `## ${t.summary.answer}`, body, '')
  }
  if (input.sources.length > 0) lines.push(`## ${t.summary.sources}`, ...input.sources.map((source) => `- ${(t.insights.kinds as Record<string, string>)[source.type] ?? source.type}: ${source.reference}`), '')
  lines.push(t.summary.notice)
  return lines.join('\n')
}

/** The file name of an export: the words of the interface, a day, and nothing from the conversation. */
export const exportFileName = (t: AssistantText, now: Date, extension = 'txt'): string => `${t.summary.file}-${now.toISOString().slice(0, 10)}.${extension}`

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Saves a text as a file in the browser (a Blob and a link that is never added to the page: nothing is fetched and nothing leaves the machine). */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Prints one element of the page: it is marked, the page's print style shows only it, and the marks are taken off when the print dialog closes. (The print style is in
 * `styles/admin.css`; without it a print is simply the page.)
 */
export function printElement(element: HTMLElement): void {
  const body = document.body
  const clean = () => {
    delete body.dataset.printing
    delete element.dataset.printable
    window.removeEventListener('afterprint', clean)
  }
  window.addEventListener('afterprint', clean)
  body.dataset.printing = 'assistant'
  element.dataset.printable = 'true'
  window.print()
}

export const moreText = (t: AssistantText, count: number): string => fill(t.report.more, { count })
