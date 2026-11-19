import type { AnalyticsLanguage, Currency } from '../api/analytics'
import { ANALYTICS_LOCALE } from '../i18n/analytics'

/**
 * How the analytics screen writes numbers, money and dates (PROMPT 32): in the language of the screen (hu-HU, en-GB, nl-NL), never by hand-made string pasting, and WITHOUT arithmetic on
 * money. An amount arrives as whole minor units of ONE currency; the only thing done to it here is to place the decimal point for that currency (euro cents, whole forints) and format
 * it. Totals, rates and comparisons are computed by the server.
 */

/** The decimals of each currency's minor unit (a euro has 2, the forint is kept whole), as the server stores them. */
export const MINOR_EXPONENT: Record<Currency, number> = { EUR: 2, HUF: 0 }

const locale = (language: AnalyticsLanguage): string => ANALYTICS_LOCALE[language]

export function formatCount(value: number, language: AnalyticsLanguage): string {
  return new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(value)
}

/** An amount of one currency, from whole minor units. */
export function formatMoney(minor: number, currency: Currency, language: AnalyticsLanguage): string {
  const exponent = MINOR_EXPONENT[currency]
  return new Intl.NumberFormat(locale(language), { style: 'currency', currency, minimumFractionDigits: exponent, maximumFractionDigits: exponent }).format(minor / 10 ** exponent)
}

/** An estimated cost in US dollars: cents above a dollar, more decimals below it (the costs of single requests are fractions of a cent). */
export function formatUsd(value: number, language: AnalyticsLanguage): string {
  return new Intl.NumberFormat(locale(language), { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2 }).format(value)
}

/** A percentage given as a number of percent (12.5 means 12.5 %). */
export function formatPercent(percent: number, language: AnalyticsLanguage): string {
  return new Intl.NumberFormat(locale(language), { style: 'percent', maximumFractionDigits: 1 }).format(percent / 100)
}

const unit = (value: number, language: AnalyticsLanguage, name: 'minute' | 'hour' | 'day' | 'second' | 'millisecond'): string =>
  new Intl.NumberFormat(locale(language), { style: 'unit', unit: name, unitDisplay: 'long', maximumFractionDigits: 1 }).format(value)

/** A time given in hours, written in the unit that reads best (minutes below an hour, days from two days). */
export function formatHours(hours: number, language: AnalyticsLanguage): string {
  if (hours < 1) return unit(Math.round(hours * 60), language, 'minute')
  if (hours < 48) return unit(hours, language, 'hour')
  return unit(hours / 24, language, 'day')
}

export const formatDays = (days: number, language: AnalyticsLanguage): string => unit(days, language, 'day')

export function formatMilliseconds(ms: number, language: AnalyticsLanguage): string {
  return ms < 1000 ? unit(ms, language, 'millisecond') : unit(ms / 1000, language, 'second')
}

/** A calendar day (`2026-11-03`) or a month (`2026-11`) as the screen's language writes it. Read as UTC so that no zone moves it by a day. */
export function formatDayKey(key: string, language: AnalyticsLanguage, style: 'short' | 'long' = 'short'): string {
  const parts = key.split('-').map(Number)
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return key
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] ?? 1))
  const options: Intl.DateTimeFormatOptions = parts.length === 2 ? { month: style === 'long' ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' } : { dateStyle: style === 'long' ? 'long' : 'medium', timeZone: 'UTC' }
  return new Intl.DateTimeFormat(locale(language), options).format(date)
}

/** An instant, date and time, in the business time zone (the zone the analytics count days in). */
export function formatMoment(iso: string, language: AnalyticsLanguage, zone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(date)
  } catch {
    return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)
  }
}

/** A stored instant or a stored day, as a day. */
export function formatDateOnly(value: string, language: AnalyticsLanguage, zone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDayKey(value, language)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  try {
    return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeZone: zone }).format(date)
  } catch {
    return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
  }
}

/** A code the dictionary does not know, made readable instead of being dropped: `waiting_for_x` → `Waiting for x`. */
export function humanize(code: string): string {
  const spaced = code.replace(/[_-]+/g, ' ').trim()
  return spaced.length === 0 ? code : spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** A word of the dictionary, or the humanised code when the dictionary has none. */
export const word = (dictionary: Record<string, string>, code: string): string => dictionary[code] ?? humanize(code)
