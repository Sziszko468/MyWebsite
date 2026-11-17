import type { Language } from '../config'

/**
 * The words the site uses for its own concepts, one per language. A concept written two ways ("add-on" and "extra", "offerte" and
 * "prijsopgave") makes a page feel unsure of itself and, in a shop, makes a customer wonder whether the two are different
 * things. Each entry says which words are WRONG (`forbidden`, tested on every text) and which one to use (`use`).
 *
 * Keep the patterns narrow: they are tested on whole customer-facing sentences, so a word that is right in another meaning
 * must not match. Add a concept here when a review finds the same thing named two ways.
 *
 * Three more fields keep the glossary honest (PROMPT 23):
 *   - `sources` limits an entry to the files where the concept means ONE thing. "Offer" is the right English word for the shop's
 *     "flagship offer", and the wrong one for the document a customer is asked to accept: there the document is a "quote".
 *   - `appears` says where the approved word must be seen in the site's own texts. An approved word that no text uses is a glossary
 *     that describes a site that does not exist; `quality.test.ts` fails on it.
 *   - `note` records a decision (why this word, what was left alone), for `docs/i18n/README.md`.
 */

export interface GlossaryTerm {
  concept: string
  /** The word to use, shown in the message. */
  use: Record<Language, string>
  /** Patterns that must not appear in that language. */
  forbidden: Partial<Record<Language, RegExp[]>>
  /** Only texts from files whose path (relative to `src/`, or `server/…`) matches are tested against `forbidden`. Absent: every text. */
  sources?: RegExp
  /** Patterns the approved word must match in at least one text of that language (the glossary is about words the site really uses). */
  appears?: Partial<Record<Language, RegExp>>
  note?: string
}

/** The files that write the quotation a customer reads and decides on: the customer pages and the e-mails about it. */
export const QUOTATION_DOCUMENTS = /^(content\/quotes\/|server\/src\/modules\/notifications\/quoteTemplates\.ts$)/

/** The files that write the consultation booking's words: the booking pages, the privacy notice, the e-mails and the suggested types. */
export const BOOKING_DOCUMENTS = /^(content\/consultation\/|content\/privacy\.ts$|server\/src\/modules\/notifications\/bookingTemplates\.ts$|server\/src\/modules\/bookings\/suggested\.ts$)/

/** The files that write the client portal's words: its pages and its e-mails. */
export const PORTAL_DOCUMENTS = /^(content\/portal\/|server\/src\/modules\/notifications\/(clientTemplates|workTemplates|deliverableTemplates|communicationTemplates)\.ts$)/

export const glossary: GlossaryTerm[] = [
  {
    concept: 'add-on (an optional extra on a package or service)',
    use: { hu: 'kiegészítő', en: 'add-on', nl: 'extra (extra’s)' },
    // Dutch said "toevoeging", "optie" and "extra" for the same thing; English also said "extras" and "additional services".
    forbidden: { en: [/\b(?:optional|available|which|selected) extras\b/i, /\badditional services\b/i], nl: [/\btoevoeging(?:en)?\b/i] },
    appears: { hu: /kiegészítő/i, en: /add-ons?\b/i, nl: /\bextra/i },
  },
  {
    concept: 'quote (what the customer asks for and receives)',
    use: { hu: 'ajánlat', en: 'quote', nl: 'offerte' },
    // The request and the document are one thing for the customer: a "quote request" gets a "quote", not a "quotation" (EN) or an "árajánlat" (HU).
    forbidden: { en: [/\bquotations?\b/i], hu: [/árajánlat/i], nl: [/\bprijsopgave\b/i] },
    appears: { hu: /ajánlat/i, en: /\bquote/i, nl: /offerte/i },
  },
  {
    concept: 'the quote document a customer reads, accepts or declines',
    use: { hu: 'ajánlat', en: 'quote', nl: 'offerte' },
    // On the quotation page and in the e-mails about it the document was "the quote" in one sentence and "the offer" (EN) or "het voorstel" (NL)
    // in the next, which reads as two documents. Elsewhere "offer" (a package is not a final offer) and "voorstel" (a suggestion) are right.
    forbidden: { en: [/\boffers?\b/i], nl: [/\bvoorstel(?:len)?\b/i] },
    sources: QUOTATION_DOCUMENTS,
    note: 'Only in the customer pages and the e-mails about a quotation; "offer" stays where it means something else (the shop’s flagship offer, “not final offers”).',
  },
  {
    concept: 'quote request (what the customer sends)',
    use: { hu: 'ajánlatkérés', en: 'quote request', nl: 'offerteaanvraag' },
    forbidden: { en: [/\bquotation request\b/i, /\brequest for quotation\b/i] },
    appears: { hu: /ajánlatkérés/i, en: /quote request/i, nl: /offerteaanvraag/i },
  },
  {
    concept: 'inquiry (a general question or message sent to the owner)',
    use: { hu: 'megkeresés', en: 'inquiry', nl: 'aanvraag' },
    // "inquiry" and "enquiry" were both written, five and four times: the owner's own word is "inquiry" ("Project inquiry", "Proceed to inquiry").
    forbidden: { en: [/\benquir(?:y|ies)\b/i] },
    appears: { hu: /megkeres/i, en: /\binquir/i },
  },
  {
    concept: 'email',
    use: { hu: 'e-mail', en: 'email', nl: 'e-mail' },
    forbidden: { en: [/\be-mail\b/i] },
    appears: { hu: /e-mail/i, en: /\bemail/i, nl: /e-mail/i },
  },
  {
    concept: 'website',
    use: { hu: 'weboldal', en: 'website', nl: 'website' },
    forbidden: { en: [/\bweb site\b/i], hu: [/honlap/i], nl: [/\bwebstek\b/i] },
    appears: { hu: /weboldal/i, en: /\bwebsite/i, nl: /\bwebsite/i },
  },
  {
    concept: 'package (Launch, Grow, Build, Care)',
    use: { hu: 'csomag', en: 'package', nl: 'pakket' },
    forbidden: { nl: [/\bbundel\b/i], hu: [/\bpakk?et\b/i] },
    appears: { hu: /csomag/i, en: /\bpackages?\b/i, nl: /pakket/i },
  },
  {
    concept: 'service (what the site offers: websites, web applications, UI design, integrations)',
    use: { hu: 'szolgáltatás', en: 'service', nl: 'dienst' },
    // The case studies use the English code term in Dutch sentences ("een service", "afsprakenservice"), so the Dutch word is not forbidden.
    forbidden: {},
    appears: { hu: /szolgáltatás/i, en: /\bservices?\b/i, nl: /\bdiensten?\b/i },
    note: 'Dutch “dienstverlener” and “dienstpagina” are compounds of the same word; Dutch “service” would be the English word.',
  },
  {
    concept: 'consultation (a booked conversation) and its booking',
    use: { hu: 'konzultáció, foglalás', en: 'consultation, booking', nl: 'adviesgesprek, afspraak' },
    // The thing is a "consultation" and reserving a time for it is a "booking" (English), a "foglalás" (Hungarian) and an "afspraak" (Dutch): not an
    // "appointment" or a "reservation" in one sentence and a "booking" in the next, and not the medical-sounding Dutch "consult" or a hotel's "boeking".
    forbidden: { en: [/\bappointments?\b/i, /\breservations?\b/i], nl: [/\bboeking(?:en)?\b/i, /\breservering(?:en)?\b/i, /\bconsult(?:en)?\b/i], hu: [/\breszerv/i, /\bbookol/i] },
    sources: BOOKING_DOCUMENTS,
    appears: { hu: /konzultáció/i, en: /\bconsultation/i, nl: /adviesgesprek/i },
    note: 'Only in the booking pages, the privacy notice, the booking e-mails and the suggested consultation types: "appointment" is not banned elsewhere.',
  },
  {
    concept: 'client portal (the customer’s private workspace)',
    use: { hu: 'ügyfélportál', en: 'client portal', nl: 'klantportaal' },
    // One name for it: not a "customer area" in one sentence and a "dashboard" in the next.
    forbidden: { en: [/\bcustomer portal\b/i, /\bcustomer area\b/i, /\bclient area\b/i, /\bdashboard\b/i], hu: [/ügyfélfelület/i, /ügyféloldal/i, /\bdashboard\b/i], nl: [/\bklantenportaal\b/i, /\bklantomgeving\b/i, /\bdashboard\b/i] },
    sources: PORTAL_DOCUMENTS,
    appears: { hu: /ügyfélportál/i, en: /client portal/i, nl: /klantportaal/i },
    note: 'Only in the portal’s own pages and e-mails: the rest of the site never mentions it.',
  },
  {
    concept: 'custom project (work that is not one of the four packages)',
    use: { hu: 'egyedi', en: 'custom', nl: 'maatwerk' },
    forbidden: {},
    appears: { hu: /egyedi/i, en: /\bcustom\b/i, nl: /maatwerk/i },
  },
]
