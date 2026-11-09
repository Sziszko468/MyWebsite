import type { Language } from '../../config.ts'

/**
 * Money for the quotations. An amount is a whole number of MINOR units (cents for EUR, forints for HUF) from the moment it is typed:
 * text is read digit by digit, never through a floating-point number, and every sum, discount and tax is integer arithmetic, so a
 * total is exactly what the parts add up to. A float is used nowhere except by the browser's own number formatter, on text.
 */

export const CURRENCIES = ['EUR', 'HUF'] as const
export type Currency = (typeof CURRENCIES)[number]

/** Digits after the decimal point that the currency has in everyday use. */
export const EXPONENT: Record<Currency, number> = { EUR: 2, HUF: 0 }

/** Larger than any real offer, and far below 2^53, so no sum of lines can leave the range of an exact integer. */
export const MAX_MAJOR = 1_000_000_000

/**
 * Reads what a person typed ("1500", "1 500,50", "1,500.50") as minor units. `null` when it is not an amount of this currency:
 * negative, empty, too many decimals, a letter, too large. Spaces and a thousands separator are accepted; the LAST separator is the
 * decimal one when it is followed by one or two digits (and the currency has decimals).
 */
export function parseMoney(input: string, currency: Currency): number | null {
  const text = input.replace(/[\s  ]/g, '')
  if (!/^\d[\d.,']*$/.test(text)) return null
  const exponent = EXPONENT[currency]
  let major = text
  let minor = ''
  const last = Math.max(text.lastIndexOf(','), text.lastIndexOf('.'))
  if (last >= 0) {
    const tail = text.slice(last + 1)
    // "1.50" and "1,5" end in a decimal part; "1.500" (exactly three digits) ends in a thousands group.
    if (tail.length === 1 || tail.length === 2) {
      major = text.slice(0, last)
      minor = tail
    } else if (tail.length !== 3) {
      return null
    }
  }
  // What is left before the decimal part is whole digits, or digits in groups of three ("1.500.000").
  if (!/^(\d+|\d{1,3}([.,']\d{3})+)$/.test(major)) return null
  major = major.replace(/[.,']/g, '')
  if (major.length > 10) return null
  if (minor.length > exponent) return null
  const whole = Number(major)
  if (!Number.isSafeInteger(whole) || whole > MAX_MAJOR) return null
  const fraction = exponent === 0 ? 0 : Number(minor.padEnd(exponent, '0') || '0')
  return whole * 10 ** exponent + fraction
}

/** Minor units as a plain decimal string ("1500.50", "1500"): exact, for a form field or for the formatter. */
export function toDecimal(minor: number, currency: Currency): string {
  const exponent = EXPONENT[currency]
  if (exponent === 0) return String(minor)
  const sign = minor < 0 ? '-' : ''
  const digits = String(Math.abs(minor)).padStart(exponent + 1, '0')
  return `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`
}

const LOCALES: Record<Language, string> = { hu: 'hu-HU', en: 'en-GB', nl: 'nl-NL' }

/** An amount for a person to read, in the customer's language ("1 500,50 €", "€1,500.50", "€ 1.500,50"). The formatter gets the exact decimal text. */
export function formatMoney(minor: number, currency: Currency, language: Language): string {
  const exponent = EXPONENT[currency]
  return new Intl.NumberFormat(LOCALES[language], { style: 'currency', currency, minimumFractionDigits: exponent, maximumFractionDigits: exponent }).format(toDecimal(minor, currency) as unknown as number)
}

export type LineKind = 'item' | 'optional' | 'discount'

export interface PriceLine {
  kind: LineKind
  quantity: number
  unitMinor: number
}

export type TaxMode = 'unspecified' | 'excluded' | 'included' | 'exempt'

export interface TaxSetting {
  mode: TaxMode
  /** Basis points: 2700 is 27 %. */
  rateBp: number | null
  /** The administrator confirmed the rate is the right one for this offer. Without it, no tax figure is calculated. */
  verified: boolean
}

export interface Totals {
  /** The items, before any discount. */
  subtotalMinor: number
  discountMinor: number
  /** Items less discounts. */
  netMinor: number
  /** Tax as an amount: only when the mode is `excluded` or `included` with a verified rate. `null` otherwise (the treatment is stated in words). */
  taxMinor: number | null
  /** What the customer pays for the main scope: net plus tax when tax is added on top, otherwise the net amount. */
  totalMinor: number
  /** Optional lines added up, for information; they are not part of the total. */
  optionalMinor: number
}

export class MoneyError extends Error {
  readonly code: 'negative_total' | 'too_large'
  constructor(code: MoneyError['code']) {
    super(code)
    this.name = 'MoneyError'
    this.code = code
  }
}

/** Half-up integer division of a non-negative numerator. */
const divideRounded = (numerator: number, denominator: number): number => Math.floor((numerator + Math.floor(denominator / 2)) / denominator)

export function computeTotals(lines: readonly PriceLine[], tax: TaxSetting): Totals {
  let subtotal = 0
  let discount = 0
  let optional = 0
  for (const line of lines) {
    const amount = line.quantity * line.unitMinor
    if (!Number.isSafeInteger(amount)) throw new MoneyError('too_large')
    if (line.kind === 'item') subtotal += amount
    else if (line.kind === 'discount') discount += amount
    else optional += amount
  }
  if (![subtotal, discount, optional].every(Number.isSafeInteger)) throw new MoneyError('too_large')
  return withTax(subtotal, discount, optional, tax)
}

/** The same arithmetic for a single agreed amount (a fixed price). */
export function fixedTotals(amountMinor: number, tax: TaxSetting): Totals {
  return withTax(amountMinor, 0, 0, tax)
}

function withTax(subtotal: number, discount: number, optional: number, tax: TaxSetting): Totals {
  const net = subtotal - discount
  if (net < 0) throw new MoneyError('negative_total')
  let taxMinor: number | null = null
  let total = net
  if (tax.verified && tax.rateBp !== null && (tax.mode === 'excluded' || tax.mode === 'included')) {
    if (tax.mode === 'excluded') {
      taxMinor = divideRounded(net * tax.rateBp, 10_000)
      total = net + taxMinor
    } else {
      // The net amount already contains the tax: report the share, leave the total.
      taxMinor = divideRounded(net * tax.rateBp, 10_000 + tax.rateBp)
    }
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(taxMinor)) throw new MoneyError('too_large')
  }
  return { subtotalMinor: subtotal, discountMinor: discount, netMinor: net, taxMinor, totalMinor: total, optionalMinor: optional }
}
