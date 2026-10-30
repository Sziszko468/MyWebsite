import { LANGUAGE_META, type Language } from '../i18n/config'
import type { ContactText } from './messages'
import type { ContactDraft } from './types'

/** Plain text of the message, for the clipboard or an e-mail draft when nothing can be sent. */
export function buildContactSummary(draft: ContactDraft, language: Language, c: ContactText): string {
  const { labels, empty, title } = c.summary
  const kind = draft.kind ? c.fields.kind.options[draft.kind] : empty
  const lines = [
    title,
    '',
    `${labels.kind}: ${kind}`,
    `${labels.subject}: ${draft.subject.trim() || empty}`,
    `${labels.message}:`,
    draft.message.trim() || empty,
    '',
    `${labels.name}: ${draft.name.trim() || empty}`,
    `${labels.email}: ${draft.email.trim() || empty}`,
    `${labels.language}: ${LANGUAGE_META[language].name}`,
  ]
  return lines.join('\n')
}
