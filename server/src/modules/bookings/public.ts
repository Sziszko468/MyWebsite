import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { closedReasons, loadSettings } from './model.ts'
import { loadTypes } from './repository.ts'

/** Whether a type has any hours to be offered at: its own, the general ones, or a one-off opening. */
function hasHours(app: AppContext, typeId: string): boolean {
  const n = app.db.get<{ n: number }>("SELECT (SELECT COUNT(*) FROM availability_rules WHERE consultation_type_id IS NULL OR consultation_type_id = ?) + (SELECT COUNT(*) FROM availability_exceptions WHERE kind = 'open') AS n", [typeId])?.n ?? 0
  return n > 0
}

/**
 * Whether the public consultation page may be indexed and listed in the sitemap: only while booking really is open (a zone, hours, the switch, and at least one
 * type with its words and a length) in EVERY language. The three versions of the page point at one another with `hreflang`, so they are listed together or not at all;
 * a page that says "booking is not available" is not worth a search result, and a route that merely exists is not a reason to index it. The page's `X-Robots-Tag`
 * and the sitemap both ask this one question, so they can never disagree.
 */
export function consultationIndexable(app: AppContext): boolean {
  return LANGUAGES.every((language) => publicConfig(app, language).open)
}

/** What the public booking page needs to start: whether booking is open, the zone, the types in this language and the rules a customer will meet. */
export function publicConfig(app: AppContext, lang: Language) {
  const settings = loadSettings(app.db)
  const open = closedReasons(app.db, settings).length === 0
  const types = open
    ? loadTypes(app.db)
        // A type is offered in a language only when it has its words in that language: nothing falls back to another one.
        .filter((type) => type.enabled && type.durationMinutes !== null && type.translations[lang].name.trim() !== '' && type.translations[lang].description.trim() !== '' && hasHours(app, type.id))
        .map((type) => ({ code: type.code, name: type.translations[lang].name, description: type.translations[lang].description, durationMinutes: type.durationMinutes! }))
    : []
  return {
    open: open && types.length > 0,
    timeZone: open ? settings.timeZone : null,
    horizonDays: settings.horizonDays,
    // `automatic`: the booking is confirmed when it is made; `manual`: it waits for the owner. The page words its button and its result by this.
    confirmation: settings.confirmation,
    policy: { cancel: settings.allowCancelRequests, reschedule: settings.allowRescheduleRequests, approvalRequired: settings.approvalRequired },
    types,
  }
}
