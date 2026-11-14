import { LOCALE_TAGS, type Language } from '../i18n/config'

/** Fills `{name}`-style placeholders in a translated string. A placeholder with no value is left as written. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole))
}

/** A calendar date such as "2026-10-28" in the language's own long form. Read as UTC so no time zone shifts it a day. */
export function formatDate(iso: string, lang: Language): string {
  const date = new Date(`${iso}T00:00:00Z`)
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}

/** A whole-currency amount ("€1,500", "1 500 €", "€ 1.500") the way the language writes it. */
export function formatPrice(amount: number, currency: string, lang: Language): string {
  return new Intl.NumberFormat(LOCALE_TAGS[lang], { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

/** A short date and time ("14/11/2026, 17:41") in the visitor's language and time zone: what names a kept work, and the list of conversations. */
export function formatStamp(lang: Language, at: Date | string | number = new Date()): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: 'short', timeStyle: 'short' }).format(new Date(at))
}

/** A date in the medium form ("14 Nov 2026"), in the visitor's language. */
export function formatMediumDate(lang: Language, at: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: 'medium' }).format(new Date(at))
}

/** A moment (an ISO timestamp) in the visitor's language and own time zone, date and time. */
export function formatMoment(iso: string, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))
}

/** A calendar day such as "2026-12-31" (read as UTC) in the language's long form. */
export function formatDay(day: string, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00.000Z`))
}

/** Two-digit editorial number: 1 → "01". */
export function pad(position: number): string {
  return String(position).padStart(2, '0')
}
