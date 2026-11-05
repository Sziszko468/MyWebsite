import type { Language } from '../../config.ts'
import { html, joinHtml, raw } from '../../lib/html.ts'
import type { InquiryRow } from '../inquiries/repository.ts'
import type { ItemView, QuoteRow } from '../quotes/repository.ts'
import type { Totals } from '../shop/pricing.ts'

/**
 * The e-mails, in Hungarian, English and Dutch, as a branded HTML part and a plain-text part. Every value that
 * came from a visitor goes through `escapeHtml` (the HTML part) or is printed as text (the plain part): a name
 * or a message can never become markup. The layout is table-based with inline styles, because mail clients ignore
 * the rest; the colours are the site's (carbon, racing red, paper). Nothing here says a message was "delivered".
 */

export type EmailKind = 'inquiry_received' | 'quote_received' | 'inquiry_status' | 'quote_status' | 'inquiry_confirmation' | 'quote_confirmation' | 'test'

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
    quoteStatus: { new: 'Beérkezett', in_review: 'Áttekintés alatt', quoted: 'Ajánlat elküldve', accepted: 'Elfogadva', declined: 'Elutasítva', closed: 'Lezárva' },
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
    replyHint: 'Reply to this e-mail to answer the sender directly.',
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
    statusFooter: 'If you have any questions, reply to this e-mail.',
    ownerFooter: 'This notification comes from the website’s contact system.',
    kinds: { job: 'A job opportunity', collaboration: 'Collaboration', project: 'A web development project', other: 'Something else' },
    inquiryStatus: { new: 'Received', in_progress: 'Being handled', waiting_client: 'Waiting for your reply', completed: 'Completed' },
    quoteStatus: { new: 'Received', in_review: 'Being reviewed', quoted: 'Quote sent', accepted: 'Accepted', declined: 'Declined', closed: 'Closed' },
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
    kinds: { job: 'Een baan', collaboration: 'Samenwerking', project: 'Een webontwikkelingsproject', other: 'Iets anders' },
    inquiryStatus: { new: 'Ontvangen', in_progress: 'In behandeling', waiting_client: 'Wacht op jouw reactie', completed: 'Afgerond' },
    quoteStatus: { new: 'Ontvangen', in_review: 'In beoordeling', quoted: 'Offerte verstuurd', accepted: 'Geaccepteerd', declined: 'Afgewezen', closed: 'Gesloten' },
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

interface Row {
  label: string
  value: string
}

function layout(options: { lang: Language; brand: string; title: string; preview: string; intro: string; rows: Row[]; note?: { title: string; text: string }; footer: string }): string {
  const { lang, brand, title, preview, intro, rows, note, footer } = options
  const rowHtml = rows.map(
    (row) => html`<tr>
      <td style="padding:10px 16px 10px 0;vertical-align:top;color:${MUTED};font:600 12px/1.4 Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">${row.label}</td>
      <td style="padding:10px 0;vertical-align:top;color:${INK};font:15px/1.5 Arial,Helvetica,sans-serif;white-space:pre-wrap;word-break:break-word">${row.value}</td>
    </tr>`,
  )
  const noteHtml = note
    ? html`<div style="margin:24px 0 0;padding:16px;border-left:4px solid ${RED};background:#ffffff;color:${INK};font:15px/1.5 Arial,Helvetica,sans-serif;white-space:pre-wrap"><strong>${note.title}</strong><br>${note.text}</div>`
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
    </td></tr>
    <tr><td style="padding:16px 24px 24px;color:${MUTED};font:12px/1.5 Arial,Helvetica,sans-serif;border-top:1px solid #ddd8cc">${footer}</td></tr>
  </table>
</td></tr></table>
</body></html>`.value
}

function plain(options: { brand: string; title: string; intro: string; rows: Row[]; note?: { title: string; text: string }; footer: string }): string {
  const lines = [options.brand.toUpperCase(), '', options.title, options.intro, '']
  for (const row of options.rows) lines.push(`${row.label}: ${row.value.includes('\n') ? `\n${row.value}` : row.value}`)
  if (options.note) lines.push('', `${options.note.title}: ${options.note.text}`)
  lines.push('', '--', options.footer)
  return lines.join('\n')
}

/** A person's one-line text made safe for a subject line (no line breaks, a sensible length). */
const oneLine = (value: string, max = 90): string => (value.replace(/\s+/g, ' ').trim().slice(0, max))

function dateText(iso: string, lang: Language): string {
  const date = new Date(iso)
  const locale = lang === 'hu' ? 'hu-HU' : lang === 'nl' ? 'nl-NL' : 'en-GB'
  return `${new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(date)} UTC`
}

function totalsText(totals: Totals, words: Words): string {
  const parts: string[] = []
  if (totals.fixed.length === 0) parts.push(words.noPublishedPrices)
  else {
    parts.push(`${words.fixedPrefix}: ${totals.fixed.map((sum) => `${sum.amount} ${sum.currency} (${words.vat[sum.vat] ?? sum.vat})`).join(', ')}.`)
    if (totals.quotedParts > 0) parts.push(words.quotedParts(totals.quotedParts))
  }
  return parts.join(' ')
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

function itemText(item: ItemView, words: Words, packageName: (code: string) => string): string {
  const need = words.needs[item.need] ?? item.need
  const plan = item.package ? packageName(item.package) : words.customPlan
  const extras = item.extras.length > 0 ? ` + ${item.extras.join(', ')}` : ''
  return `${need} — ${words.package}: ${plan}${extras}`
}

export function renderQuoteReceived(quote: QuoteRow, items: readonly ItemView[], totals: Totals, lang: Language, brand: string, packageName: (code: string) => string): Rendered {
  const w = WORDS[lang]
  const rows: Row[] = [
    { label: w.reference, value: quote.reference },
    { label: w.received, value: dateText(quote.created_at, lang) },
    { label: w.name, value: quote.name },
    { label: w.email, value: quote.email },
    ...(quote.phone ? [{ label: w.phone, value: quote.phone }] : []),
    { label: w.language, value: w.languages[quote.language] },
    { label: w.services, value: items.map((item) => itemText(item, w, packageName)).join('\n') },
    { label: w.pricing, value: totalsText(totals, w) },
    { label: w.description, value: quote.description },
    ...(quote.objective ? [{ label: w.objective, value: w.objectives[quote.objective] ?? quote.objective }] : []),
    ...(quote.timing ? [{ label: w.timing, value: w.timings[quote.timing] ?? quote.timing }] : []),
    ...(quote.requirements ? [{ label: w.requirements, value: quote.requirements }] : []),
    ...(quote.reference_notes ? [{ label: w.references, value: quote.reference_notes }] : []),
  ]
  const parts = { brand, title: `${w.newQuote} ${quote.reference}`, intro: `${w.newQuoteIntro} ${w.replyHint}`, rows, footer: w.ownerFooter }
  const preview = `${oneLine(quote.name, 40)}: ${oneLine(items.map((item) => itemText(item, w, packageName)).join('; '), 100)}`
  return { subject: `${w.newQuote} (${quote.reference}): ${oneLine(quote.name, 40)}`, preview, text: plain(parts), html: layout({ lang, preview, ...parts }) }
}

export function renderStatusChange(kind: 'inquiry' | 'quote', row: { reference: string; name: string; status: string; language: Language }, note: string | null, lang: Language, brand: string): Rendered {
  const w = WORDS[lang]
  const statusLabel = (kind === 'inquiry' ? w.inquiryStatus : w.quoteStatus)[row.status] ?? row.status
  const title = w.statusSubject(kind, row.reference)
  const rows: Row[] = [
    { label: w.reference, value: row.reference },
    { label: w.status, value: statusLabel },
  ]
  const intro = `${w.hello(oneLine(row.name, 60))} ${w.statusMessage(kind, row.reference, statusLabel)}`
  const parts = { brand, title, intro, rows, note: note ? { title: w.noteTitle, text: note } : undefined, footer: w.statusFooter }
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
  quoteSubject: (reference: string) => string
  inquiryTitle: string
  quoteTitle: string
  inquiryBody: string
  quoteBody: string
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

const CONFIRM: Record<Language, ConfirmWords> = {
  hu: {
    inquirySubject: (reference) => `Megkaptuk az üzeneted (${reference})`,
    quoteSubject: (reference) => `Megkaptuk az ajánlatkérésed (${reference})`,
    inquiryTitle: 'Üzeneted megérkezett',
    quoteTitle: 'Ajánlatkérésed megérkezett',
    inquiryBody: 'Köszönjük, hogy felvetted velünk a kapcsolatot! Üzeneted sikeresen megérkezett. Hamarosan áttekintjük a megkeresésedet.',
    quoteBody: 'Köszönjük az ajánlatkérésedet! A kérésed sikeresen megérkezett. Hamarosan áttekintjük a megkeresésedet.',
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
    quoteSubject: (reference) => `We received your quote request (${reference})`,
    inquiryTitle: 'Your message has arrived',
    quoteTitle: 'Your quote request has arrived',
    inquiryBody: 'Thank you for getting in touch! Your message has been received. We will review your enquiry soon.',
    quoteBody: 'Thank you for your quote request! It has been received. We will review your enquiry soon.',
    noteTitle: 'Information',
    ignore: 'If you did not send this message, you can safely ignore this e-mail.',
    footer: 'This is an automatic confirmation. If you want to add something, reply to this e-mail.',
    testSubject: 'Test e-mail from the administration',
    testTitle: 'Test e-mail',
    testBody: 'This test message was started from the administration. If you can read it, the provider accepted it; whether it was delivered can only be confirmed by the provider’s notification (webhook).',
    testFooter: 'You do not need to reply to this e-mail.',
    provider: 'Provider',
    sentAt: 'Sent',
  },
  nl: {
    inquirySubject: (reference) => `We hebben je bericht ontvangen (${reference})`,
    quoteSubject: (reference) => `We hebben je offerteaanvraag ontvangen (${reference})`,
    inquiryTitle: 'Je bericht is aangekomen',
    quoteTitle: 'Je offerteaanvraag is aangekomen',
    inquiryBody: 'Bedankt voor je bericht! Je bericht is goed aangekomen. We bekijken je vraag binnenkort.',
    quoteBody: 'Bedankt voor je offerteaanvraag! Je aanvraag is goed aangekomen. We bekijken je vraag binnenkort.',
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

export function renderQuoteConfirmation(quote: QuoteRow, items: readonly ItemView[], lang: Language, brand: string, packageName: (code: string) => string, responseNote: string | null): Rendered {
  const w = WORDS[lang]
  const c = CONFIRM[lang]
  const rows: Row[] = [
    { label: w.reference, value: quote.reference },
    { label: w.received, value: dateText(quote.created_at, lang) },
    { label: w.services, value: items.map((item) => itemText(item, w, packageName)).join('\n') },
  ]
  const parts = { brand, title: c.quoteTitle, intro: `${w.hello(oneLine(quote.name, 60))} ${c.quoteBody}`, rows, note: responseNote ? { title: c.noteTitle, text: responseNote } : undefined, footer: `${c.ignore} ${c.footer}` }
  return { subject: c.quoteSubject(quote.reference), preview: c.quoteBody, text: plain(parts), html: layout({ lang, preview: c.quoteBody, ...parts }) }
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

