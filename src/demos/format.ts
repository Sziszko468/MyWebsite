import { LOCALE_TAGS, type Language } from '../i18n/config'

/** Whole cents as an amount in the language's own way of writing it ("€1,234.50", "1 234,50 €"). */
export function formatCents(cents: number, currency: string, lang: Language): string {
  return new Intl.NumberFormat(LOCALE_TAGS[lang], { style: 'currency', currency }).format(cents / 100)
}

/** A calendar day (`YYYY-MM-DD`, read as UTC so no time zone moves it) in a short form: "28 Oct 2026". */
export function formatShortDay(day: string, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

/** A weekday and day ("Tue 3 Nov"). */
export function formatWeekdayDay(day: string, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}
