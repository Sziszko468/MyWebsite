import { getPackage } from '../content/packages'
import { LANGUAGE_META, type Language } from '../i18n/config'
import type { Dictionary } from '../i18n/locales/hu'
import type { PackageChoice, QuoteDraft } from './types'

/** The quote form's words in the visitor's language. */
export type QuoteText = Dictionary['servicesPage']['quote']

export function packageLabel(choice: PackageChoice, text: QuoteText): string {
  return choice === 'unsure' ? text.fields.package.unsure : getPackage(choice).name
}

/**
 * The answers as label and value pairs, in the order they were asked: what the visitor sees under
 * "Summary" before sending, and what the copied text is made of. An unanswered question reads as
 * the dash from the dictionary, so no row silently disappears.
 */
export function summaryRows(
  draft: QuoteDraft,
  text: QuoteText,
  { contact }: { contact: boolean },
): Array<[label: string, value: string]> {
  const { labels, empty } = text.summary
  const answer = (value: string) => value.trim() || empty

  const rows: Array<[string, string]> = [
    [labels.projectType, draft.projectType ? text.fields.projectType.options[draft.projectType] : empty],
    [labels.package, draft.package ? packageLabel(draft.package, text) : empty],
    [labels.description, answer(draft.description)],
    [labels.reference, answer(draft.reference)],
    [labels.budget, answer(draft.budget)],
    [labels.timing, draft.timing ? text.fields.timing.options[draft.timing] : empty],
  ]
  if (contact) {
    rows.push([labels.name, answer(draft.name)], [labels.email, answer(draft.email)], [labels.phone, answer(draft.phone)])
  }
  return rows
}

/** Plain text of the whole request, for the clipboard or an e-mail draft. */
export function buildSummary(draft: QuoteDraft, language: Language, text: QuoteText): string {
  const lines = [text.summary.title, '']
  for (const [label, value] of summaryRows(draft, text, { contact: true })) {
    // A long answer goes under its label, so line breaks the visitor typed are kept.
    lines.push(value.includes('\n') ? `${label}:\n${value}` : `${label}: ${value}`)
  }
  lines.push(`${text.summary.labels.language}: ${LANGUAGE_META[language].name}`)
  return lines.join('\n')
}

/** A mailto: link that opens the visitor's own e-mail program with the text ready. Nothing is sent by it. */
export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
