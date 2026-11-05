import type { AppContext } from '../../context.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import { HttpError } from '../../http/errors.ts'
import { hmacHex, newId, newReference } from '../../lib/crypto.ts'
import { addMs, iso, MINUTE } from '../../lib/time.ts'
import { countLinks } from '../../lib/text.ts'
import { isRecord } from '../../lib/text.ts'
import { Fields, isEmail } from '../../lib/validate.ts'
import { ConstraintError } from '../../http/errors.ts'
import { findRecentDuplicate, insertInquiry, INQUIRY_KINDS, type InquiryKind, type InquiryRow } from '../inquiries/repository.ts'

/**
 * The contact message: what the website's form sends (src/contact/types.ts `ContactRequest`), checked again
 * here with the same rules, stored, and queued for the owner's notification. Nothing in the answer is about
 * the sender: the visitor gets a reference and a timestamp, never what they wrote.
 */

/** The same numbers as src/contact/validation.ts (src/contact/contractWithServer.test.ts compares them). */
export const CONTACT_LIMITS = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  subject: { min: 3, max: 150 },
  message: { min: 10, max: 3000 },
} as const

/** Sending the same message again within this time is treated as the same submission (a double click, a retry). */
export const DUPLICATE_WINDOW_MS = 10 * MINUTE

export interface ContactInput {
  language: Language
  kind: InquiryKind
  name: string
  email: string
  subject: string
  message: string
  consent: boolean
}

export function parseContact(body: Record<string, unknown>, requireConsent: boolean): ContactInput {
  const fields = new Fields(body)
  const form = body.form
  if (form !== undefined && form !== 'contact') fields.fail('form', 'invalid')

  const language = fields.oneOf('language', LANGUAGES, { required: true })
  const kind = fields.oneOf('kind', INQUIRY_KINDS, { required: true })
  const name = fields.text('name', { ...CONTACT_LIMITS.name, required: true })
  const email = fields.text('email', { max: CONTACT_LIMITS.email.max, required: true }, (value) => (isEmail(value) ? undefined : 'invalidEmail'))
  const subject = fields.text('subject', { ...CONTACT_LIMITS.subject, required: true })
  const message = fields.text('message', { ...CONTACT_LIMITS.message, required: true, multiline: true })
  const consent = fields.consent('consent', requireConsent)
  fields.done()

  // A field a person never sees: filled in, it is a script. (The website's forms do not send it; see README.)
  const trap = body.website
  if (typeof trap === 'string' && trap.trim() !== '') throw new HttpError(422, 'spam_suspected', 'The message was not accepted.')
  if (countLinks(message ?? '') > 3) throw new HttpError(422, 'spam_suspected', 'The message was not accepted.')

  return { language: language!, kind: kind!, name: name!, email: email!, subject: subject!, message: message!, consent }
}

/** A keyed fingerprint of what was said (not reversible without the server's secret), only to recognise the same submission sent twice. */
export const contentHashOf = (secret: string, ...parts: string[]): string => hmacHex(secret, parts.map((part) => part.toLowerCase().replace(/\s+/g, ' ').trim()).join('\n'))

export interface ContactResult {
  reference: string
  createdAt: string
  duplicate: boolean
}

export function submitContact(app: AppContext, input: ContactInput, ipHash: string): ContactResult {
  const now = app.clock.now()
  const hash = contentHashOf(app.config.appSecret, input.email, input.subject, input.message)

  const saved = app.db.transaction((): { row: InquiryRow; duplicate: boolean } => {
    const existing = findRecentDuplicate(app.db, hash, iso(addMs(now, -DUPLICATE_WINDOW_MS)))
    if (existing) return { row: existing, duplicate: true }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row: InquiryRow = {
        id: newId(),
        reference: newReference('C'),
        language: input.language,
        kind: input.kind,
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
        status: 'new',
        archived_at: null,
        consent_at: input.consent ? iso(now) : null,
        ip_hash: ipHash,
        content_hash: hash,
        created_at: iso(now),
        updated_at: iso(now),
      }
      try {
        insertInquiry(app.db, row)
        return { row, duplicate: false }
      } catch (error) {
        // A reference that already exists is a one-in-a-trillion draw; try another.
        if (!(error instanceof ConstraintError && error.kind === 'unique')) throw error
      }
    }
    throw new Error('Could not allocate a unique inquiry reference.')
  })

  if (!saved.duplicate) {
    app.notifier.notifyOwner('inquiry_received', saved.row.id)
    app.notifier.confirmSubmitter('inquiry', saved.row.id)
  }
  return { reference: saved.row.reference, createdAt: saved.row.created_at, duplicate: saved.duplicate }
}

export { isRecord }
