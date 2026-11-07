import type { Language } from '../../i18n/config'

/** The brief of a FULL EXPERIENCE request, as the server stores it (server/src/modules/shop/brief.ts): each question and the answers with their labels in every language as they were when it was sent. */
export interface Brief {
  preferredLanguage: Language
  questions: { id: string; kind: 'single' | 'multi'; title: Record<Language, string>; answers: { id: string; label: Record<Language, string> }[] }[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isTri = (value: unknown): value is Record<Language, string> => isRecord(value) && ['hu', 'en', 'nl'].every((code) => typeof value[code] === 'string')

/** The brief stored with a request, or `null` when there is none or it cannot be read: a damaged row shows a sentence, never breaks the screen. */
export function readBrief(json: string | null): Brief | null {
  if (!json) return null
  try {
    const raw: unknown = JSON.parse(json)
    if (!isRecord(raw) || !Array.isArray(raw.questions)) return null
    const questions: Brief['questions'] = []
    for (const item of raw.questions) {
      if (!isRecord(item) || typeof item.id !== 'string' || !isTri(item.title) || !Array.isArray(item.answers)) return null
      const answers = item.answers.filter((answer): answer is Record<string, unknown> => isRecord(answer) && typeof answer.id === 'string' && isTri(answer.label)).map((answer) => ({ id: String(answer.id), label: answer.label as Record<Language, string> }))
      questions.push({ id: item.id, kind: item.kind === 'multi' ? 'multi' : 'single', title: item.title, answers })
    }
    return { preferredLanguage: raw.preferredLanguage === 'hu' || raw.preferredLanguage === 'nl' ? raw.preferredLanguage : 'en', questions }
  } catch {
    return null
  }
}
