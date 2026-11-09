import type { Language } from '../../config.ts'
import { formatMoney, type Currency, type LineKind, type TaxMode } from './money.ts'
import { recomputed, type LineRow, type PricingMode, type QuotationRow, type QuotationStatus } from './quotations.ts'
import type { QuoteRow } from './repository.ts'

/**
 * A quotation as a person reads it: the same document for the customer's page, the administrator's preview and the e-mails. Money is
 * already written out in the quotation's language (`text`) next to the exact minor-unit amount, so no screen does arithmetic of its own, and
 * nothing here carries an internal identifier, an internal note or a hash.
 */

export interface Money {
  minor: number
  text: string
}

export interface ViewLine {
  kind: LineKind
  description: string
  detail: string
  quantity: number
  unit: Money
  total: Money
  justification: string
}

export interface QuoteView {
  reference: string
  requestReference: string
  version: number
  language: Language
  status: QuotationStatus
  /** Sent, but its last day has passed: it can no longer be accepted. */
  expired: boolean
  title: string
  introduction: string
  understanding: string
  scope: string
  deliverables: string
  exclusions: string
  paymentTerms: string
  terms: string
  notes: string
  estimatedTimeline: string
  validUntil: string | null
  customer: { name: string; company: string | null }
  pricing: {
    mode: PricingMode
    note: string
    currency: Currency | null
    lines: ViewLine[]
    fixed: Money | null
    subtotal: Money | null
    discount: Money | null
    optional: Money | null
    tax: { mode: TaxMode; ratePercent: string | null; amount: Money | null; verified: boolean; note: string }
    total: Money | null
  }
  sentAt: string | null
  acceptedAt: string | null
  declinedAt: string | null
}

/** 2700 -> "27", 725 -> "7.25": digit arithmetic, no floating point. */
export const percentText = (basisPoints: number): string => {
  const fraction = basisPoints % 100
  return `${Math.floor(basisPoints / 100)}${fraction === 0 ? '' : `.${String(fraction).padStart(2, '0').replace(/0$/, '')}`}`
}

export function isExpired(quote: Pick<QuotationRow, 'status' | 'valid_until'>, now: Date): boolean {
  return quote.status === 'sent' && quote.valid_until !== null && quote.valid_until < now.toISOString().slice(0, 10)
}

export function buildQuoteView(quote: QuotationRow, lines: readonly LineRow[], request: Pick<QuoteRow, 'reference' | 'name' | 'company'>, now: Date): QuoteView {
  const language = quote.language
  const currency = quote.currency
  const money = (minor: number | null): Money | null => (minor === null || currency === null ? null : { minor, text: formatMoney(minor, currency, language) })
  // The numbers shown are recomputed from the lines, never read back from a column: what the customer sees is what the arithmetic says.
  const totals = quote.pricing_mode === 'custom' || currency === null ? null : recomputed(quote, lines)
  const viewLines: ViewLine[] =
    quote.pricing_mode === 'itemized' && currency
      ? lines.map((line) => ({
          kind: line.kind,
          description: line.description,
          detail: line.detail,
          quantity: line.quantity,
          unit: { minor: line.unit_minor, text: formatMoney(line.unit_minor, currency, language) },
          total: { minor: line.quantity * line.unit_minor, text: formatMoney(line.quantity * line.unit_minor, currency, language) },
          justification: line.justification,
        }))
      : []
  return {
    reference: quote.reference,
    requestReference: request.reference,
    version: quote.version,
    language,
    status: quote.status,
    expired: isExpired(quote, now),
    title: quote.title,
    introduction: quote.introduction,
    understanding: quote.understanding,
    scope: quote.scope,
    deliverables: quote.deliverables,
    exclusions: quote.exclusions,
    paymentTerms: quote.payment_terms,
    terms: quote.terms,
    notes: quote.notes,
    estimatedTimeline: quote.estimated_timeline,
    validUntil: quote.valid_until,
    customer: { name: request.name, company: request.company },
    pricing: {
      mode: quote.pricing_mode,
      note: quote.pricing_note,
      currency,
      lines: viewLines,
      fixed: quote.pricing_mode === 'fixed' ? money(quote.fixed_minor) : null,
      subtotal: totals ? money(totals.subtotalMinor) : null,
      discount: totals && totals.discountMinor > 0 ? money(totals.discountMinor) : null,
      optional: totals && totals.optionalMinor > 0 ? money(totals.optionalMinor) : null,
      tax: {
        mode: quote.tax_mode,
        ratePercent: quote.tax_verified === 1 && quote.tax_rate_bp !== null ? percentText(quote.tax_rate_bp) : null,
        amount: totals ? money(totals.taxMinor) : null,
        verified: quote.tax_verified === 1,
        note: quote.tax_note,
      },
      total: totals ? money(totals.totalMinor) : null,
    },
    sentAt: quote.sent_at,
    acceptedAt: quote.accepted_at,
    declinedAt: quote.declined_at,
  }
}

/** The price in one phrase, for an e-mail's subject area: an amount, or (for a custom quotation) its description. */
export function priceSummary(view: QuoteView, fallback: string): string {
  if (view.pricing.total) return view.pricing.total.text
  return view.pricing.note.trim() ? view.pricing.note.trim().split('\n')[0].slice(0, 140) : fallback
}
