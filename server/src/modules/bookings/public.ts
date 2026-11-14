import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { closedReasons, loadSettings } from './model.ts'
import { loadTypes } from './repository.ts'

/** Whether a type has any hours to be offered at: its own, the general ones, or a one-off opening. */
function hasHours(app: AppContext, typeId: string): boolean {
  const n = app.db.get<{ n: number }>("SELECT (SELECT COUNT(*) FROM availability_rules WHERE consultation_type_id IS NULL OR consultation_type_id = ?) + (SELECT COUNT(*) FROM availability_exceptions WHERE kind = 'open') AS n", [typeId])?.n ?? 0
  return n > 0
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
