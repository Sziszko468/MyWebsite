import type { Language } from '../i18n/config'

/** Fills `{name}`-style placeholders in a translated string. A placeholder with no value is left as written. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole))
}

/** A calendar date such as "2026-10-28" in the language's own long form. Read as UTC so no time zone shifts it a day. */
export function formatDate(iso: string, lang: Language): string {
  const date = new Date(`${iso}T00:00:00Z`)
  return new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}

/** Two-digit editorial number: 1 → "01". */
export function pad(position: number): string {
  return String(position).padStart(2, '0')
}
