import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { newId } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'

/**
 * The consultation types the system starts with (PROMPT 24): four SUGGESTIONS, written in the three languages so the owner has something to edit
 * rather than a blank page. They are not services the site sells and they are not offered to anyone: each starts switched off, with no duration (a
 * type without one cannot be switched on) and no hours. The owner reads them, changes them, sets a length and decides which, if any, to open.
 * Nothing here says what a consultation costs, whether it is free, or how it takes place.
 */

export const SUGGESTED_TYPES = ['discovery', 'project', 'technical', 'follow-up'] as const
export type SuggestedCode = (typeof SUGGESTED_TYPES)[number]

interface Suggested {
  name: string
  description: string
}

const WORDS: Record<Language, Record<SuggestedCode, Suggested>> = {
  hu: {
    discovery: { name: 'Ismerkedő beszélgetés', description: 'Egy első beszélgetés, amelyen megértjük az ötletedet, a céljaidat és azt, amire szükséged van.' },
    project: { name: 'Projektkonzultáció', description: 'Részletesebb beszélgetés egy weboldalról, alkalmazásról, újratervezésről vagy digitális termékről.' },
    technical: { name: 'Technikai konzultáció', description: 'Fókuszált beszélgetés műszaki követelményekről, architektúráról, integrációkról vagy megvalósítási lehetőségekről.' },
    'follow-up': { name: 'Követő konzultáció', description: 'Egy újabb beszélgetés egy meglévő megkeresésről vagy projektről.' },
  },
  en: {
    discovery: { name: 'Discovery call', description: 'A first conversation to understand your idea, your goals and what you need.' },
    project: { name: 'Project consultation', description: 'A more detailed discussion about a website, an application, a redesign or a digital product.' },
    technical: { name: 'Technical consultation', description: 'A focused conversation about technical requirements, architecture, integrations or ways to implement something.' },
    'follow-up': { name: 'Follow-up consultation', description: 'A further conversation about an existing inquiry or project.' },
  },
  nl: {
    discovery: { name: 'Kennismakingsgesprek', description: 'Een eerste gesprek om je idee, je doelen en wat je nodig hebt te begrijpen.' },
    project: { name: 'Projectgesprek', description: 'Een uitgebreider gesprek over een website, een applicatie, een herontwerp of een digitaal product.' },
    technical: { name: 'Technisch adviesgesprek', description: 'Een gericht gesprek over technische eisen, architectuur, koppelingen of manieren om iets te realiseren.' },
    'follow-up': { name: 'Vervolggesprek', description: 'Een vervolggesprek over een bestaande aanvraag of een bestaand project.' },
  },
}

/** The suggested words in one language; read by the language checks like every other customer-facing text. */
export const suggestedWords = (lang: Language): Record<SuggestedCode, Suggested> => WORDS[lang]

/** Writes the suggestions into an EMPTY table, once. It never overwrites and never switches anything on. */
export function seedConsultationTypes(app: AppContext): { seeded: boolean; types: number } {
  const { db, clock } = app
  const existing = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM consultation_types')?.n ?? 0
  if (existing > 0) return { seeded: false, types: 0 }
  const stamp = iso(clock.now())
  db.transaction(() => {
    SUGGESTED_TYPES.forEach((code, index) => {
      const id = newId()
      db.run('INSERT INTO consultation_types (id, code, duration_minutes, enabled, sort_order, created_at, updated_at) VALUES (?, ?, NULL, 0, ?, ?, ?)', [id, code, (index + 1) * 10, stamp, stamp])
      for (const lang of ['hu', 'en', 'nl'] as const) db.run('INSERT INTO consultation_type_translations (type_id, language, name, description) VALUES (?, ?, ?, ?)', [id, lang, WORDS[lang][code].name, WORDS[lang][code].description])
    })
  })
  return { seeded: true, types: SUGGESTED_TYPES.length }
}
