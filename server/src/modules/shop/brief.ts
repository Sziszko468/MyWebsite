import type { Language } from '../../config.ts'
import { isRecord } from '../../lib/text.ts'
import { isProjectSize, type ProjectSize } from './estimate.ts'

/**
 * The brief of a FULL EXPERIENCE quote request: the visitor's answers to the configurator, each stored with the question and the
 * option labels in every language as they were when the request was sent (so it reads completely even after the questions were
 * edited). It is stored in `quote_requests.brief_json`; this module is where it is built and read, shared by the intake
 * (fullExperience.ts), the administration and the e-mails.
 */

export type Tri = Record<Language, string>

export interface BriefAnswer {
  id: string
  label: Tri
}
export interface BriefQuestion {
  id: string
  kind: 'single' | 'multi'
  title: Tri
  answers: BriefAnswer[]
}
export interface Brief {
  version: 1
  /** The language the visitor asked to be answered in (the site's language is the request's own `language`). */
  preferredLanguage: Language
  questions: BriefQuestion[]
  /** The project size guide, worked out by the server from the validated answers (a planning aid, never a price). Absent on older requests. */
  estimate?: ProjectSize
}

const isTri = (value: unknown): value is Tri => isRecord(value) && ['hu', 'en', 'nl'].every((lang) => typeof value[lang] === 'string')

/** The brief stored with a request, or `null` when there is none or it cannot be read (a damaged row never breaks a screen or an e-mail). */
export function readBrief(json: string | null): Brief | null {
  if (!json) return null
  try {
    const raw: unknown = JSON.parse(json)
    if (!isRecord(raw) || !Array.isArray(raw.questions)) return null
    const questions: BriefQuestion[] = []
    for (const item of raw.questions) {
      if (!isRecord(item) || typeof item.id !== 'string' || !isTri(item.title) || !Array.isArray(item.answers)) return null
      const answers = item.answers.filter((answer): answer is Record<string, unknown> => isRecord(answer) && typeof answer.id === 'string' && isTri(answer.label)).map((answer) => ({ id: String(answer.id), label: answer.label as Tri }))
      questions.push({ id: item.id, kind: item.kind === 'multi' ? 'multi' : 'single', title: item.title, answers })
    }
    const preferred = raw.preferredLanguage
    return { version: 1, preferredLanguage: preferred === 'hu' || preferred === 'nl' ? preferred : 'en', questions, ...(isProjectSize(raw.estimate) ? { estimate: { level: raw.estimate.level, points: raw.estimate.points } } : {}) }
  } catch {
    return null
  }
}

interface BriefLabels {
  company: string
  preferred: string
  skipped: string
  brief: string
  languages: Record<Language, string>
  /** The project size guide: the row's label (it is a planning aid, not a quote) and the four levels. */
  size: string
  levels: Record<ProjectSize['level'], string>
}

const LABELS: Record<Language, BriefLabels> = {
  hu: {
    company: 'Cég',
    preferred: 'Kért válaszolási nyelv',
    skipped: '(kihagyva)',
    brief: 'FULL EXPERIENCE',
    languages: { hu: 'magyar', en: 'angol', nl: 'holland' },
    size: 'A projekt mérete (tervezési segéd, nem ajánlat)',
    levels: { basic: 'Alap', moderate: 'Közepes', advanced: 'Összetett', custom: 'Egyedi' },
  },
  en: {
    company: 'Company',
    preferred: 'Preferred reply language',
    skipped: '(skipped)',
    brief: 'FULL EXPERIENCE',
    languages: { hu: 'Hungarian', en: 'English', nl: 'Dutch' },
    size: 'Project size (a planning guide, not a quote)',
    levels: { basic: 'Basic', moderate: 'Moderate', advanced: 'Advanced', custom: 'Custom' },
  },
  nl: {
    company: 'Bedrijf',
    preferred: 'Gewenste taal van het antwoord',
    skipped: '(overgeslagen)',
    brief: 'FULL EXPERIENCE',
    languages: { hu: 'Hongaars', en: 'Engels', nl: 'Nederlands' },
    size: 'Omvang van het project (een planningshulp, geen offerte)',
    levels: { basic: 'Basis', moderate: 'Gemiddeld', advanced: 'Uitgebreid', custom: 'Maatwerk' },
  },
}

export const briefLabel = (lang: Language) => LABELS[lang]

/** The rows an e-mail shows for a FULL EXPERIENCE request: the company, the language asked for and every question with its answers. */
export function briefRows(quote: { company: string | null; brief_json: string | null }, lang: Language): { label: string; value: string }[] {
  const labels = LABELS[lang]
  const brief = readBrief(quote.brief_json)
  const rows: { label: string; value: string }[] = []
  if (quote.company) rows.push({ label: labels.company, value: quote.company })
  if (!brief) return rows
  rows.push({ label: labels.preferred, value: labels.languages[brief.preferredLanguage] })
  for (const question of brief.questions) {
    rows.push({ label: question.title[lang], value: question.answers.length > 0 ? question.answers.map((answer) => answer.label[lang]).join(', ') : labels.skipped })
  }
  if (brief.estimate) rows.push({ label: labels.size, value: labels.levels[brief.estimate.level] })
  return rows
}
