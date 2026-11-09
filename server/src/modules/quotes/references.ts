import type { Database } from '../../db/database.ts'

/**
 * The public reference of a quote request: `CC-2026-000001` by default. The format is the operator's (QUOTE_REFERENCE_FORMAT): letters,
 * digits and hyphens around one sequence placeholder (`{NNNNNN}`: the number, padded to as many digits as there are Ns), and
 * optionally `{YYYY}` or `{YY}`, which also makes the sequence start again each year.
 *
 * The number comes from a counter row that is incremented inside the transaction that stores the request (the database has one writer),
 * so two requests cannot be given the same number, and `UNIQUE (reference)` is the last line of defence. A reference is a name for a
 * person to read out on the phone; it is sequential, so it is NEVER a secret and never lets anyone into anything: no public address
 * accepts one.
 */

const PLACEHOLDER = /\{(YYYY|YY|N{3,10})\}/g

export function formatReference(format: string, year: number, sequence: number): string {
  return format.replace(PLACEHOLDER, (_all, token: string) => {
    if (token === 'YYYY') return String(year).padStart(4, '0')
    if (token === 'YY') return String(year % 100).padStart(2, '0')
    return String(sequence).padStart(token.length, '0')
  })
}

const usesYear = (format: string): boolean => /\{(YYYY|YY)\}/.test(format)

/** Takes the next number. Call it inside the transaction that inserts the request. */
export function nextReference(db: Database, format: string, now: Date): string {
  const year = now.getUTCFullYear()
  const scope = usesYear(format) ? `request:${format}:${year}` : `request:${format}`
  const row = db.get<{ value: number }>('INSERT INTO reference_counters (scope, value) VALUES (?, 1) ON CONFLICT (scope) DO UPDATE SET value = value + 1 RETURNING value', [scope])
  if (!row) throw new Error('Could not take the next reference number.')
  return formatReference(format, year, row.value)
}

/** The reference of one version of a quotation: the request's reference and the version (`CC-2026-000001-Q2`). */
export const quoteReference = (requestReference: string, version: number): string => `${requestReference}-Q${version}`
