import type { Language } from '../i18n/config'

/**
 * The contact message: what the form collects and what it hands to the part that sends it. Kept
 * in memory while the form is open and nowhere else (see forms/useDraft.ts).
 */

/** What the visitor wants to talk about. */
export const CONTACT_KINDS = ['job', 'collaboration', 'project', 'other'] as const
export type ContactKind = (typeof CONTACT_KINDS)[number]

/** The two doors on the page: a visitor comes either to offer work or to ask for it. */
export type ContactPath = 'employers' | 'clients'

/** Which topic each door starts the form with. */
export const PATH_KIND: Record<ContactPath, ContactKind> = {
  employers: 'job',
  clients: 'project',
}

export function isContactPath(value: string | null | undefined): value is ContactPath {
  return value === 'employers' || value === 'clients'
}

export interface ContactDraft {
  name: string
  email: string
  kind: ContactKind | null
  subject: string
  message: string
  consent: boolean
}

export const EMPTY_CONTACT: ContactDraft = {
  name: '',
  email: '',
  kind: null,
  subject: '',
  message: '',
  consent: false,
}

export type ContactField = keyof ContactDraft

/** What the form sends. */
export interface ContactRequest {
  /** Which of the site's forms this is, so one handler can tell a contact message from a quote request. */
  form: 'contact'
  language: Language
  kind: ContactKind
  name: string
  email: string
  subject: string
  message: string
}
