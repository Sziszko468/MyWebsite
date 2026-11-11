import type { Language } from '../../config.ts'
import { html, joinHtml, raw } from '../../lib/html.ts'
import type { InquiryRow } from '../inquiries/repository.ts'

/**
 * The e-mails, in Hungarian, English and Dutch, as a branded HTML part and a plain-text part. Every value that
 * came from a visitor goes through `escapeHtml` (the HTML part) or is printed as text (the plain part): a name
 * or a message can never become markup. The layout is table-based with inline styles, because mail clients ignore
 * the rest; the colours are the site's (carbon, racing red, paper). Nothing here says a message was "delivered".
 */

export type EmailKind =
  | 'inquiry_received'
  | 'quote_received'
  | 'inquiry_status'
  | 'quote_status'
  | 'inquiry_confirmation'
  | 'quote_confirmation'
  | 'test'
  // PROMPT 17: the quotation's life (quoteTemplates.ts)
  | 'quote_sent'
  | 'quote_revised'
  | 'quote_accepted'
  | 'quote_accepted_admin'
  | 'quote_declined'
  | 'quote_declined_admin'
  | 'revision_requested_admin'

export interface Rendered {
  subject: string
  /** The line a mail program shows beside the subject in the list (hidden at the top of the HTML part). */
  preview: string
  text: string
  html: string
}

interface Words {
  newMessage: string
  newQuote: string
  newMessageIntro: string
  newQuoteIntro: string
  /** What a request written by the assistant is called where a catalogue request lists its items. */
  aiPlan: string
  replyHint: string
  reference: string
  status: string
  received: string
  topic: string
  name: string
  email: string
  phone: string
  language: string
  subject: string
  message: string
  services: string
  package: string
  extras: string
  customPlan: string
  description: string
  objective: string
  timing: string
  requirements: string
  references: string
  pricing: string
  noPublishedPrices: string
  fixedPrefix: string
  quotedParts: (n: number) => string
  hello: (name: string) => string
  statusMessage: (kind: 'inquiry' | 'quote', reference: string, status: string) => string
  statusSubject: (kind: 'inquiry' | 'quote', reference: string) => string
  noteTitle: string
  statusFooter: string
  ownerFooter: string
  kinds: Record<string, string>
  inquiryStatus: Record<string, string>
  quoteStatus: Record<string, string>
  objectives: Record<string, string>
  timings: Record<string, string>
  needs: Record<string, string>
  languages: Record<Language, string>
  vat: Record<string, string>
}

const WORDS: Record<Language, Words> = {
  hu: {
    newMessage: 'Új üzenet',
    newQuote: 'Új ajánlatkérés',
    newMessageIntro: 'Egy látogató üzenetet küldött a kapcsolatfelvételi űrlapon.',
    newQuoteIntro: 'Egy látogató ajánlatot kért az ajánlatkérő összeállítón.',
    aiPlan: 'Control Room AI: projektterv',
    replyHint: 'Erre az e-mailre válaszolva közvetlenül a feladónak írsz.',
    reference: 'Azonosító',
    status: 'Állapot',
    received: 'Beérkezett',
    topic: 'Téma',
    name: 'Név',
    email: 'E-mail',
    phone: 'Telefon',
    language: 'Nyelv',
    subject: 'Tárgy',
    message: 'Üzenet',
    services: 'Szolgáltatások',
    package: 'Csomag',
    extras: 'Kiegészítők',
    customPlan: 'Egyedi projekt',
    description: 'Projektleírás',
    objective: 'Cél',
    timing: 'Időzítés',
    requirements: 'További követelmények',
    references: 'Referenciák',
    pricing: 'Ár',
    noPublishedPrices: 'Egyik elemhez sincs közzétett ár: minden egyedi ajánlat tárgya.',
    fixedPrefix: 'Közzétett árak összege',
    quotedParts: (n) => `${n} elem ára az ajánlatban derül ki.`,
    hello: (name) => `Szia ${name}!`,
    statusMessage: (kind, reference, status) =>
      kind === 'inquiry'
        ? `A(z) ${reference} azonosítójú üzeneted állapota: ${status}.`
        : `A(z) ${reference} azonosítójú ajánlatkérésed állapota: ${status}.`,
    statusSubject: (kind, reference) => (kind === 'inquiry' ? `Az üzeneted állapota változott (${reference})` : `Az ajánlatkérésed állapota változott (${reference})`),
    noteTitle: 'Megjegyzés',
    statusFooter: 'Ha kérdésed van, válaszolj erre az e-mailre.',
    ownerFooter: 'Ez az értesítés a weboldal kapcsolatfelvételi rendszeréből érkezett.',
    kinds: { job: 'Állásajánlat', collaboration: 'Együttműködés', project: 'Webfejlesztési projekt', other: 'Egyéb' },
    inquiryStatus: { new: 'Beérkezett', in_progress: 'Feldolgozás alatt', waiting_client: 'Válaszodra várunk', completed: 'Lezárva' },
    quoteStatus: { new: 'Beérkezett', under_review: 'Áttekintés alatt', waiting_customer: 'Válaszodra várunk', quote_preparation: 'Az ajánlat készül', quote_sent: 'Ajánlat elküldve', accepted: 'Elfogadva', declined: 'Elutasítva', in_progress: 'Folyamatban', completed: 'Befejezve', cancelled: 'Lemondva' },
    objectives: { present: 'Bemutatkozás', leads: 'Megkeresések gyűjtése', sell: 'Értékesítés', process: 'Folyamat támogatása', improve: 'Meglévő fejlesztése', other: 'Egyéb' },
    timings: { unsure: 'Még nem tudom', asap: 'Minél hamarabb', weeks: 'Néhány héten belül', months: 'Néhány hónapon belül', flexible: 'Rugalmas' },
    needs: { website: 'Weboldal', webapp: 'Webalkalmazás', improve: 'Meglévő weboldal fejlesztése', ui: 'UI-megvalósítás', integrations: 'API és integrációk', unsure: 'Még nem tudom' },
    languages: { hu: 'magyar', en: 'angol', nl: 'holland' },
    vat: { unspecified: 'ÁFA nincs megadva', excluded: 'ÁFA nélkül', included: 'ÁFÁ-val', exempt: 'ÁFA-mentes', mixed: 'vegyes ÁFA' },
  },
  en: {
    newMessage: 'New message',
    newQuote: 'New quote request',
    newMessageIntro: 'A visitor sent a message through the contact form.',
    newQuoteIntro: 'A visitor asked for a quote through the request builder.',
    aiPlan: 'Control Room AI: project plan',
    replyHint: 'Reply to this email to answer the sender directly.',
    reference: 'Reference',
    status: 'Status',
    received: 'Received',
    topic: 'Topic',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    language: 'Language',
    subject: 'Subject',
    message: 'Message',
    services: 'Services',
    package: 'Package',
    extras: 'Add-ons',
    customPlan: 'Custom project',
    description: 'Project description',
    objective: 'Objective',
    timing: 'Timing',
    requirements: 'Further requirements',
    references: 'References',
    pricing: 'Price',
    noPublishedPrices: 'No part has a published price: everything is for a custom quote.',
    fixedPrefix: 'Published prices add up to',
    quotedParts: (n) => `${n} part${n === 1 ? ' is' : 's are'} priced in the quote.`,
    hello: (name) => `Hello ${name},`,
    statusMessage: (kind, reference, status) =>
      kind === 'inquiry' ? `The status of your message (reference ${reference}) is now: ${status}.` : `The status of your quote request (reference ${reference}) is now: ${status}.`,
    statusSubject: (kind, reference) => (kind === 'inquiry' ? `Update on your message (${reference})` : `Update on your quote request (${reference})`),
    noteTitle: 'Note',
    statusFooter: 'If you have any questions, reply to this email.',
    ownerFooter: 'This notification comes from the website’s contact system.',
    kinds: { job: 'A job opportunity', collaboration: 'Collaboration', project: 'A web development project', other: 'Something else' },
    inquiryStatus: { new: 'Received', in_progress: 'Being handled', waiting_client: 'Waiting for your reply', completed: 'Completed' },
    quoteStatus: { new: 'Received', under_review: 'Being reviewed', waiting_customer: 'Waiting for your reply', quote_preparation: 'Quote being prepared', quote_sent: 'Quote sent', accepted: 'Accepted', declined: 'Declined', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' },
    objectives: { present: 'Present myself or my business', leads: 'Get enquiries', sell: 'Sell', process: 'Support a process', improve: 'Improve what exists', other: 'Something else' },
    timings: { unsure: 'Not sure yet', asap: 'As soon as possible', weeks: 'Within a few weeks', months: 'Within a few months', flexible: 'Flexible' },
    needs: { website: 'Website', webapp: 'Web application', improve: 'Improve an existing website', ui: 'UI implementation', integrations: 'API and integrations', unsure: 'Not sure yet' },
    languages: { hu: 'Hungarian', en: 'English', nl: 'Dutch' },
    vat: { unspecified: 'VAT not specified', excluded: 'excluding VAT', included: 'including VAT', exempt: 'VAT exempt', mixed: 'mixed VAT' },
  },
  nl: {
    newMessage: 'Nieuw bericht',
    newQuote: 'Nieuwe offerteaanvraag',
    newMessageIntro: 'Een bezoeker heeft een bericht gestuurd via het contactformulier.',
    newQuoteIntro: 'Een bezoeker heeft een offerte aangevraagd via de aanvraagbouwer.',
    aiPlan: 'Control Room AI: projectplan',
    replyHint: 'Antwoord op deze e-mail om de afzender rechtstreeks te antwoorden.',
    reference: 'Referentie',
    status: 'Status',
    received: 'Ontvangen',
    topic: 'Onderwerp',
    name: 'Naam',
    email: 'E-mail',
    phone: 'Telefoon',
    language: 'Taal',
    subject: 'Betreft',
    message: 'Bericht',
    services: 'Diensten',
    package: 'Pakket',
    extras: 'Extra’s',
    customPlan: 'Project op maat',
    description: 'Projectomschrijving',
    objective: 'Doel',
    timing: 'Timing',
    requirements: 'Verdere eisen',
    references: 'Referenties',
    pricing: 'Prijs',
    noPublishedPrices: 'Voor geen enkel onderdeel is een prijs gepubliceerd: alles gaat in een offerte op maat.',
    fixedPrefix: 'Gepubliceerde prijzen samen',
    quotedParts: (n) => `${n} ${n === 1 ? 'onderdeel wordt' : 'onderdelen worden'} in de offerte geprijsd.`,
    hello: (name) => `Hallo ${name},`,
    statusMessage: (kind, reference, status) =>
      kind === 'inquiry' ? `De status van je bericht (referentie ${reference}) is nu: ${status}.` : `De status van je offerteaanvraag (referentie ${reference}) is nu: ${status}.`,
    statusSubject: (kind, reference) => (kind === 'inquiry' ? `Update over je bericht (${reference})` : `Update over je offerteaanvraag (${reference})`),
    noteTitle: 'Opmerking',
    statusFooter: 'Heb je vragen, antwoord dan op deze e-mail.',
    ownerFooter: 'Deze melding komt uit het contactsysteem van de website.',
    kinds: { job: 'Een baan', collaboration: 'Samenwerking', project: 'Een project voor webontwikkeling', other: 'Iets anders' },
    inquiryStatus: { new: 'Ontvangen', in_progress: 'In behandeling', waiting_client: 'Wacht op jouw reactie', completed: 'Afgerond' },
    quoteStatus: { new: 'Ontvangen', under_review: 'In beoordeling', waiting_customer: 'Wacht op jouw reactie', quote_preparation: 'Offerte wordt opgesteld', quote_sent: 'Offerte verstuurd', accepted: 'Geaccepteerd', declined: 'Afgewezen', in_progress: 'In uitvoering', completed: 'Afgerond', cancelled: 'Geannuleerd' },
    objectives: { present: 'Mezelf of mijn bedrijf presenteren', leads: 'Aanvragen krijgen', sell: 'Verkopen', process: 'Een proces ondersteunen', improve: 'Verbeteren wat er is', other: 'Iets anders' },
    timings: { unsure: 'Nog niet zeker', asap: 'Zo snel mogelijk', weeks: 'Binnen enkele weken', months: 'Binnen enkele maanden', flexible: 'Flexibel' },
    needs: { website: 'Website', webapp: 'Webapplicatie', improve: 'Een bestaande website verbeteren', ui: 'UI-implementatie', integrations: 'API en integraties', unsure: 'Nog niet zeker' },
    languages: { hu: 'Hongaars', en: 'Engels', nl: 'Nederlands' },
    vat: { unspecified: 'btw niet gespecificeerd', excluded: 'excl. btw', included: 'incl. btw', exempt: 'btw-vrijgesteld', mixed: 'gemengde btw' },
  },
}

export const emailWords = (lang: Language): Words => WORDS[lang]

// ---- layout ------------------------------------------------------------------------------------------------------

const INK = '#0b0b0d'
const RED = '#ff161f'
const PAPER = '#f4f0e8'
const MUTED = '#5c5a55'

export interface Row {
  label: string
  value: string
}

/** A button that works in a mail client: a table cell with a background and a link inside; the address is also printed below it, for a client that blocks links. */
export interface Cta {
  label: string
  url: string
  /** The sentence above the printed address. */
  fallback: string
}

export function layout(options: { lang: Language; brand: string; title: string; preview: string; intro: string; rows: Row[]; note?: { title: string; text: string }; cta?: Cta; footer: string }): string {
  const { lang, brand, title, preview, intro, rows, note, cta, footer } = options
  const rowHtml = rows.map(
    (row) => html`<tr>
      <td style="padding:10px 16px 10px 0;vertical-align:top;color:${MUTED};font:600 12px/1.4 Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">${row.label}</td>
      <td style="padding:10px 0;vertical-align:top;color:${INK};font:15px/1.5 Arial,Helvetica,sans-serif;white-space:pre-wrap;word-break:break-word">${row.value}</td>
    </tr>`,
  )
  const noteHtml = note
    ? html`<div style="margin:24px 0 0;padding:16px;border-left:4px solid ${RED};background:#ffffff;color:${INK};font:15px/1.5 Arial,Helvetica,sans-serif;white-space:pre-wrap"><strong>${note.title}</strong><br>${note.text}</div>`
    : ''
  const ctaHtml = cta
    ? html`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:${RED};border-radius:2px"><a href="${cta.url}" style="display:inline-block;padding:14px 24px;color:#ffffff;font:700 15px/1.2 Arial,Helvetica,sans-serif;text-decoration:none">${cta.label}</a></td></tr></table>
      <p style="margin:8px 0 0;color:${MUTED};font:12px/1.5 Arial,Helvetica,sans-serif;word-break:break-all">${cta.fallback}<br><a href="${cta.url}" style="color:${MUTED}">${cta.url}</a></p>`
    : ''
  return html`<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${PAPER}">${preview}${raw('&#847;&zwnj;&nbsp;'.repeat(40))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #ddd8cc">
    <tr><td style="background:${INK};padding:20px 24px;border-bottom:4px solid ${RED}">
      <span style="color:${PAPER};font:700 14px/1 Arial,Helvetica,sans-serif;letter-spacing:.14em;text-transform:uppercase">${brand}</span><span style="color:${RED};font:700 14px/1 Arial,Helvetica,sans-serif">.</span>
    </td></tr>
    <tr><td style="padding:28px 24px 8px">
      <h1 style="margin:0 0 12px;color:${INK};font:700 22px/1.25 Arial,Helvetica,sans-serif">${title}</h1>
      <p style="margin:0 0 16px;color:${MUTED};font:15px/1.5 Arial,Helvetica,sans-serif">${intro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ddd8cc">${joinHtml(rowHtml)}</table>
      ${noteHtml}
      ${ctaHtml}
    </td></tr>
    <tr><td style="padding:16px 24px 24px;color:${MUTED};font:12px/1.5 Arial,Helvetica,sans-serif;border-top:1px solid #ddd8cc">${footer}</td></tr>
  </table>
</td></tr></table>
</body></html>`.value
}

export function plain(options: { brand: string; title: string; intro: string; rows: Row[]; note?: { title: string; text: string }; cta?: Cta; footer: string }): string {
  const lines = [options.brand.toUpperCase(), '', options.title, options.intro, '']
  for (const row of options.rows) lines.push(`${row.label}: ${row.value.includes('\n') ? `\n${row.value}` : row.value}`)
  if (options.note) lines.push('', `${options.note.title}: ${options.note.text}`)
  if (options.cta) lines.push('', `${options.cta.label}:`, options.cta.url)
  lines.push('', '--', options.footer)
  return lines.join('\n')
}

/** A person's one-line text made safe for a subject line (no line breaks, a sensible length). */
export const oneLine = (value: string, max = 90): string => (value.replace(/\s+/g, ' ').trim().slice(0, max))

export function dateText(iso: string, lang: Language): string {
  const date = new Date(iso)
  const locale = lang === 'hu' ? 'hu-HU' : lang === 'nl' ? 'nl-NL' : 'en-GB'
  return `${new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(date)} UTC`
}

// ---- the four e-mails --------------------------------------------------------------------------------------------

export function renderInquiryReceived(inquiry: InquiryRow, lang: Language, brand: string): Rendered {
  const w = WORDS[lang]
  const rows: Row[] = [
    { label: w.reference, value: inquiry.reference },
    { label: w.received, value: dateText(inquiry.created_at, lang) },
    { label: w.topic, value: w.kinds[inquiry.kind] ?? inquiry.kind },
    { label: w.name, value: inquiry.name },
    { label: w.email, value: inquiry.email },
    { label: w.language, value: w.languages[inquiry.language] },
    { label: w.subject, value: inquiry.subject },
    { label: w.message, value: inquiry.message },
  ]
  const parts = { brand, title: `${w.newMessage}: ${oneLine(inquiry.subject, 60)}`, intro: `${w.newMessageIntro} ${w.replyHint}`, rows, footer: w.ownerFooter }
  const preview = `${oneLine(inquiry.name, 40)}: ${oneLine(inquiry.message, 100)}`
  return { subject: `${w.newMessage} (${inquiry.reference}): ${oneLine(inquiry.subject)}`, preview, text: plain(parts), html: layout({ lang, preview, ...parts }) }
}

export function renderStatusChange(kind: 'inquiry' | 'quote', row: { reference: string; name: string; status: string; language: Language }, note: string | null, lang: Language, brand: string, link: { label: string; url: string; fallback: string } | null = null): Rendered {
  const w = WORDS[lang]
  const statusLabel = (kind === 'inquiry' ? w.inquiryStatus : w.quoteStatus)[row.status] ?? row.status
  const title = w.statusSubject(kind, row.reference)
  const rows: Row[] = [
    { label: w.reference, value: row.reference },
    { label: w.status, value: statusLabel },
  ]
  const intro = `${w.hello(oneLine(row.name, 60))} ${w.statusMessage(kind, row.reference, statusLabel)}`
  const parts = { brand, title, intro, rows, note: note ? { title: w.noteTitle, text: note } : undefined, cta: link ?? undefined, footer: w.statusFooter }
  const preview = w.statusMessage(kind, row.reference, statusLabel)
  return { subject: title, preview, text: plain(parts), html: layout({ lang, preview, ...parts }) }
}

// ---- the confirmations to the person who wrote, and the test message --------------------------------------------------

/**
 * What a visitor is told when what they sent has arrived. It says that, and nothing more: no time to expect an answer
 * (unless the administrator wrote one in the administration), no promise of a reply, of a price, of an appointment or of
 * taking the project. Only what the visitor themself sent is repeated (the reference, when, the subject or the chosen
 * parts): never a price, never anything the site worked out. Sent only when an administrator switched it on.
 */
interface ConfirmWords {
  inquirySubject: (reference: string) => string
  inquiryTitle: string
  inquiryBody: string
  noteTitle: string
  ignore: string
  footer: string
  testSubject: string
  testTitle: string
  testBody: string
  testFooter: string
  provider: string
  sentAt: string
}

/** Exported so the language checks (src/i18n/quality/) can read the confirmation e-mails like every other text. */
export const CONFIRM: Record<Language, ConfirmWords> = {
  hu: {
    inquirySubject: (reference) => `Megkaptuk az üzeneted (${reference})`,
    inquiryTitle: 'Üzeneted megérkezett',
    inquiryBody: 'Köszönjük, hogy felvetted velünk a kapcsolatot! Üzeneted sikeresen megérkezett. Hamarosan áttekintjük a megkeresésedet.',
    noteTitle: 'Tájékoztatás',
    ignore: 'Ha nem te küldted ezt az üzenetet, nyugodtan figyelmen kívül hagyhatod ezt az e-mailt.',
    footer: 'Ez automatikus visszaigazolás. Ha ki szeretnél egészíteni valamit, válaszolj erre az e-mailre.',
    testSubject: 'Teszt e-mail az adminisztrációból',
    testTitle: 'Teszt e-mail',
    testBody: 'Ezt a próbaüzenetet az adminisztrációból indították. Ha ezt olvasod, a szolgáltató elfogadta az üzenetet; hogy meg is érkezett, azt csak a szolgáltató értesítése (webhook) tudja igazolni.',
    testFooter: 'Nem kell válaszolnod erre az e-mailre.',
    provider: 'Szolgáltató',
    sentAt: 'Elküldve',
  },
  en: {
    inquirySubject: (reference) => `We received your message (${reference})`,
    inquiryTitle: 'Your message has arrived',
    inquiryBody: 'Thank you for getting in touch! Your message has been received. We will review your enquiry soon.',
    noteTitle: 'Information',
    ignore: 'If you did not send this message, you can safely ignore this email.',
    footer: 'This is an automatic confirmation. If you want to add something, reply to this email.',
    testSubject: 'Test email from the administration',
    testTitle: 'Test email',
    testBody: 'This test message was started from the administration. If you can read it, the provider accepted it; whether it was delivered can only be confirmed by the provider’s notification (webhook).',
    testFooter: 'You do not need to reply to this email.',
    provider: 'Provider',
    sentAt: 'Sent',
  },
  nl: {
    inquirySubject: (reference) => `We hebben je bericht ontvangen (${reference})`,
    inquiryTitle: 'Je bericht is aangekomen',
    inquiryBody: 'Bedankt voor je bericht! Je bericht is goed aangekomen. We bekijken je vraag binnenkort.',
    noteTitle: 'Informatie',
    ignore: 'Heb je dit bericht niet zelf verstuurd, dan kun je deze e-mail gerust negeren.',
    footer: 'Dit is een automatische bevestiging. Wil je iets toevoegen, antwoord dan op deze e-mail.',
    testSubject: 'Test-e-mail vanuit het beheer',
    testTitle: 'Test-e-mail',
    testBody: 'Dit testbericht is gestart vanuit het beheer. Als je dit leest, heeft de provider het bericht geaccepteerd; of het ook is afgeleverd, kan alleen de melding van de provider (webhook) bevestigen.',
    testFooter: 'Je hoeft niet op deze e-mail te antwoorden.',
    provider: 'Provider',
    sentAt: 'Verstuurd',
  },
}

export function renderInquiryConfirmation(inquiry: InquiryRow, lang: Language, brand: string, responseNote: string | null): Rendered {
  const w = WORDS[lang]
  const c = CONFIRM[lang]
  const rows: Row[] = [
    { label: w.reference, value: inquiry.reference },
    { label: w.received, value: dateText(inquiry.created_at, lang) },
    { label: w.subject, value: oneLine(inquiry.subject, 120) },
  ]
  const parts = { brand, title: c.inquiryTitle, intro: `${w.hello(oneLine(inquiry.name, 60))} ${c.inquiryBody}`, rows, note: responseNote ? { title: c.noteTitle, text: responseNote } : undefined, footer: `${c.ignore} ${c.footer}` }
  return { subject: c.inquirySubject(inquiry.reference), preview: c.inquiryBody, text: plain(parts), html: layout({ lang, preview: c.inquiryBody, ...parts }) }
}

/** The administrator's test message: what the provider accepted, in the owner's language. */
export function renderTestEmail(lang: Language, brand: string, providerName: string, at: Date): Rendered {
  const c = CONFIRM[lang]
  const rows: Row[] = [
    { label: c.provider, value: providerName },
    { label: c.sentAt, value: dateText(at.toISOString(), lang) },
  ]
  const preview = c.testBody.slice(0, 120)
  const parts = { brand, title: c.testTitle, intro: c.testBody, rows, footer: c.testFooter }
  return { subject: c.testSubject, preview, text: plain(parts), html: layout({ lang, preview, ...parts }) }
}

