import type { Language } from '../../config.ts'
import { oneLine, dateText, emailWords, layout, plain, type Cta, type Rendered, type Row } from './templates.ts'
import type { ItemView, QuoteRow } from '../quotes/repository.ts'
import type { Totals } from '../shop/pricing.ts'
import { briefRows } from '../shop/brief.ts'

/**
 * The e-mails of the quotation workflow, in Hungarian, English and Dutch, each as a branded HTML part and a plain-text part (the layout
 * and the escaping are templates.ts's: every value goes through `html` or is printed as text). What they say is deliberately plain:
 *
 *  - the confirmation promises no answer time (an administrator can add a sentence of their own);
 *  - a quotation e-mail names the offer and carries the secure link; the full offer is on the page behind it;
 *  - accepting is something the customer did on the page, not a payment: nothing here says money was paid or is due through this site.
 */

interface Words {
  types: Record<string, string>
  sources: Record<string, string>
  company: string
  website: string
  budget: string
  priority: string
  summary: string
  contact: string
  nextStep: string
  submitted: string
  quotation: string
  project: string
  version: string
  total: string
  validUntil: string
  timeline: string
  agreedAmount: string
  acceptedAt: string
  declinedAt: string
  reason: string
  message: string
  customer: string
  priceInQuote: string
  openQuote: string
  openStatus: string
  openAdmin: string
  fallback: string
  noteTitle: string

  confirmationSubject: (reference: string) => string
  confirmationTitle: string
  confirmationIntro: (name: string) => string
  confirmationNext: string
  confirmationFooter: string

  newRequestTitle: (reference: string) => string
  newRequestSubject: (reference: string, name: string) => string
  newRequestIntro: string
  ownerFooter: string

  sentSubject: (title: string, reference: string) => string
  revisedSubject: (title: string, reference: string) => string
  sentTitle: string
  revisedTitle: string
  sentIntro: (name: string) => string
  revisedIntro: (name: string) => string
  sentSteps: string
  sentFooter: string

  acceptedSubject: (reference: string) => string
  acceptedTitle: string
  acceptedIntro: (name: string) => string
  acceptedNext: string
  acceptedFooter: string
  acceptedAdminSubject: (reference: string) => string
  acceptedAdminTitle: string
  acceptedAdminIntro: string

  declinedSubject: (reference: string) => string
  declinedTitle: string
  declinedIntro: (name: string) => string
  declinedFooter: string
  declinedAdminSubject: (reference: string) => string
  declinedAdminTitle: string
  declinedAdminIntro: string

  revisionSubject: (reference: string) => string
  revisionTitle: string
  revisionIntro: string

  statusFooter: string
}

const W: Record<Language, Words> = {
  hu: {
    types: { standard_inquiry: 'Általános szolgáltatási megkeresés', package_quote: 'Csomag alapú ajánlatkérés', custom_service: 'Egyedi szolgáltatás', full_experience: 'FULL EXPERIENCE projekt', custom_application: 'Egyedi alkalmazásfejlesztés', custom_website: 'Egyedi weboldal', ai_project: 'AI-asszisztált projektmegkeresés', general_business: 'Általános üzleti megkeresés' },
    sources: { shop: 'Shop', control_room_ai: 'CONTROL ROOM AI', contact_form: 'Kapcsolatfelvételi űrlap', other: 'Egyéb' },
    company: 'Cég',
    website: 'Weboldal',
    budget: 'Költségkeret',
    priority: 'Prioritás',
    summary: 'A kérés összefoglalója',
    contact: 'Elérhetőség',
    nextStep: 'Következő lépés',
    submitted: 'Beküldve',
    quotation: 'Ajánlat',
    project: 'Projekt',
    version: 'Verzió',
    total: 'Összeg',
    validUntil: 'Érvényes eddig',
    timeline: 'Becsült időkeret',
    agreedAmount: 'Elfogadott összeg',
    acceptedAt: 'Elfogadva',
    declinedAt: 'Elutasítva',
    reason: 'Indoklás',
    message: 'Üzenet',
    customer: 'Ügyfél',
    priceInQuote: 'Az ár az ajánlatban szereplő leírás szerint',
    openQuote: 'Ajánlat megnyitása',
    openStatus: 'Kérésem állapota',
    openAdmin: 'Megnyitás az adminisztrációban',
    fallback: 'Ha a gomb nem nyílik meg, másold be ezt a címet a böngészőbe:',
    noteTitle: 'Tájékoztatás',

    confirmationSubject: (reference) => `Hamarosan áttekintjük a megkeresésedet — ${reference}`,
    confirmationTitle: 'A megkeresésed megérkezett',
    confirmationIntro: (name) => `Szia ${name}! Köszönjük, hogy megkerestél minket. A kérésed sikeresen megérkezett, hamarosan áttekintjük.`,
    confirmationNext: 'Átnézzük a kérésedet, és ha kell, rákérdezünk a részletekre. Ha ajánlatot készítünk, azt e-mailben küldjük el egy biztonságos linkkel, ahol átnézheted, elfogadhatod vagy elutasíthatod. Ebben a szakaszban nem kérünk fizetést.',
    confirmationFooter: 'Ez automatikus visszaigazolás. Ha ki szeretnél egészíteni valamit, válaszolj erre az e-mailre. Ha nem te küldted a kérést, nyugodtan figyelmen kívül hagyhatod.',

    newRequestTitle: (reference) => `Új ajánlatkérés ${reference}`,
    newRequestSubject: (reference, name) => `Új ajánlatkérés (${reference}): ${name}`,
    newRequestIntro: 'Új ajánlatkérés érkezett. A válaszod közvetlenül a feladónak megy.',
    ownerFooter: 'Ez az értesítés a weboldal ajánlatkezelő rendszeréből érkezett.',

    sentSubject: (title, reference) => `Ajánlatod: ${title} — ${reference}`,
    revisedSubject: (title, reference) => `Módosított ajánlat: ${title} — ${reference}`,
    sentTitle: 'Elkészült az ajánlatod',
    revisedTitle: 'Módosított ajánlatot küldtünk',
    sentIntro: (name) => `Szia ${name}! Elkészítettük az ajánlatot a kérésedre. A teljes ajánlat az alábbi biztonságos linken olvasható.`,
    revisedIntro: (name) => `Szia ${name}! A korábbi ajánlatot módosítottuk, és az új verziót küldjük. A korábbi verzió linkje már nem használható; kérjük, ezt a legfrissebbet nézd át.`,
    sentSteps: 'A linken végignézheted a teljes ajánlatot és a feltételeket. Ott elfogadhatod, elutasíthatod, vagy kérhetsz pontosítást, illetve módosítást. A link megnyitása vagy az e-mail elolvasása önmagában nem jelent elfogadást.',
    sentFooter: 'Ez az e-mail egy biztonságos, személyes linket tartalmaz: ne oszd meg másokkal. Kérdés esetén válaszolj erre az e-mailre.',

    acceptedSubject: (reference) => `Elfogadtad az ajánlatot — ${reference}`,
    acceptedTitle: 'Az elfogadásodat rögzítettük',
    acceptedIntro: (name) => `Szia ${name}! Rögzítettük, hogy elfogadtad az alábbi ajánlatot.`,
    acceptedNext: 'Hamarosan felvesszük veled a kapcsolatot a projekt indításának részleteivel. Az elfogadás nem számla, és ezen az oldalon keresztül nem kértünk, és nem is kaptunk fizetést.',
    acceptedFooter: 'Ezt az e-mailt azért kaptad, mert elfogadtál egy ajánlatot. Ha nem te voltál, válaszolj erre az e-mailre.',
    acceptedAdminSubject: (reference) => `Ajánlat elfogadva: ${reference}`,
    acceptedAdminTitle: 'Az ügyfél elfogadta az ajánlatot',
    acceptedAdminIntro: 'Az ügyfél a biztonságos oldalon elfogadta az ajánlatot. A kérés állapota Elfogadva; a projekt indítása külön lépés.',

    declinedSubject: (reference) => `Visszaigazolás: elutasítottad az ajánlatot — ${reference}`,
    declinedTitle: 'Az elutasítást rögzítettük',
    declinedIntro: (name) => `Szia ${name}! Rögzítettük, hogy elutasítottad az alábbi ajánlatot. Köszönjük, hogy átnézted.`,
    declinedFooter: 'Ha meggondolod magad, vagy más ajánlatra van szükséged, válaszolj erre az e-mailre.',
    declinedAdminSubject: (reference) => `Ajánlat elutasítva: ${reference}`,
    declinedAdminTitle: 'Az ügyfél elutasította az ajánlatot',
    declinedAdminIntro: 'Az ügyfél a biztonságos oldalon elutasította az ajánlatot.',

    revisionSubject: (reference) => `Pontosítást vagy módosítást kért az ügyfél: ${reference}`,
    revisionTitle: 'Az ügyfél pontosítást vagy módosítást kért',
    revisionIntro: 'Az ügyfél az ajánlat oldalán üzenetet küldött. Az ajánlat nem változott magától; új verziót te készíthetsz.',

    statusFooter: 'Ha kérdésed van, válaszolj erre az e-mailre.',
  },
  en: {
    types: { standard_inquiry: 'Standard service inquiry', package_quote: 'Package-based quote request', custom_service: 'Custom service request', full_experience: 'FULL EXPERIENCE project', custom_application: 'Custom application development', custom_website: 'Custom website development', ai_project: 'AI-assisted project inquiry', general_business: 'General business inquiry' },
    sources: { shop: 'Shop', control_room_ai: 'CONTROL ROOM AI', contact_form: 'Contact form', other: 'Other' },
    company: 'Company',
    website: 'Website',
    budget: 'Budget',
    priority: 'Priority',
    summary: 'Request summary',
    contact: 'Contact',
    nextStep: 'What happens next',
    submitted: 'Submitted',
    quotation: 'Quote',
    project: 'Project',
    version: 'Version',
    total: 'Total',
    validUntil: 'Valid until',
    timeline: 'Estimated timeline',
    agreedAmount: 'Agreed amount',
    acceptedAt: 'Accepted',
    declinedAt: 'Declined',
    reason: 'Reason',
    message: 'Message',
    customer: 'Customer',
    priceInQuote: 'Price as described in the quote',
    openQuote: 'Open the quote',
    openStatus: 'See my request',
    openAdmin: 'Open in the administration',
    fallback: 'If the button does not open, copy this address into your browser:',
    noteTitle: 'Information',

    confirmationSubject: (reference) => `We will review your enquiry soon — ${reference}`,
    confirmationTitle: 'Your request has arrived',
    confirmationIntro: (name) => `Hello ${name}, thank you for getting in touch. Your request has been received and we will review it soon.`,
    confirmationNext: 'We will look through your request and, if needed, ask for details. If we prepare a quote, we will email it with a secure link where you can review, accept or decline it. No payment is requested at this stage.',
    confirmationFooter: 'This is an automatic confirmation. If you want to add something, reply to this email. If you did not send this request, you can safely ignore it.',

    newRequestTitle: (reference) => `New quote request ${reference}`,
    newRequestSubject: (reference, name) => `New quote request (${reference}): ${name}`,
    newRequestIntro: 'A new quote request has arrived. Reply to this email to answer the sender directly.',
    ownerFooter: 'This notification comes from the website’s quote system.',

    sentSubject: (title, reference) => `Your quote: ${title} — ${reference}`,
    revisedSubject: (title, reference) => `Revised quote: ${title} — ${reference}`,
    sentTitle: 'Your quote is ready',
    revisedTitle: 'We sent a revised quote',
    sentIntro: (name) => `Hello ${name}, we have prepared a quote for your request. The full offer is on the secure page behind the button below.`,
    revisedIntro: (name) => `Hello ${name}, we changed the earlier offer and are sending the new version. The link of the earlier version no longer works; please review this latest one.`,
    sentSteps: 'On that page you can read the whole offer and its terms, then accept it, decline it, or ask for clarification or a change. Opening the link or reading this email is not an acceptance.',
    sentFooter: 'This email contains a personal, secure link: please do not share it. If you have a question, reply to this email.',

    acceptedSubject: (reference) => `You accepted the quote — ${reference}`,
    acceptedTitle: 'We have recorded your acceptance',
    acceptedIntro: (name) => `Hello ${name}, we have recorded that you accepted the quote below.`,
    acceptedNext: 'We will contact you soon about how the project starts. Accepting is not an invoice, and no payment has been requested or received through this website.',
    acceptedFooter: 'You are receiving this because you accepted a quote. If that was not you, reply to this email.',
    acceptedAdminSubject: (reference) => `Quote accepted: ${reference}`,
    acceptedAdminTitle: 'The customer accepted the quote',
    acceptedAdminIntro: 'The customer accepted the offer on the secure page. The request is now Accepted; starting the project is a separate step.',

    declinedSubject: (reference) => `Confirmation: you declined the quote — ${reference}`,
    declinedTitle: 'We have recorded your decision',
    declinedIntro: (name) => `Hello ${name}, we have recorded that you declined the quote below. Thank you for looking at it.`,
    declinedFooter: 'If you change your mind, or need a different offer, reply to this email.',
    declinedAdminSubject: (reference) => `Quote declined: ${reference}`,
    declinedAdminTitle: 'The customer declined the quote',
    declinedAdminIntro: 'The customer declined the offer on the secure page.',

    revisionSubject: (reference) => `The customer asked for clarification or a change: ${reference}`,
    revisionTitle: 'The customer asked for clarification or a change',
    revisionIntro: 'The customer sent a message from the quote page. The offer did not change by itself; you can prepare a new version.',

    statusFooter: 'If you have any questions, reply to this email.',
  },
  nl: {
    types: { standard_inquiry: 'Standaard dienstaanvraag', package_quote: 'Offerteaanvraag op basis van een pakket', custom_service: 'Dienst op maat', full_experience: 'FULL EXPERIENCE-project', custom_application: 'Applicatie op maat', custom_website: 'Website op maat', ai_project: 'Projectaanvraag via AI-assistent', general_business: 'Algemene zakelijke aanvraag' },
    sources: { shop: 'Shop', control_room_ai: 'CONTROL ROOM AI', contact_form: 'Contactformulier', other: 'Overig' },
    company: 'Bedrijf',
    website: 'Website',
    budget: 'Budget',
    priority: 'Prioriteit',
    summary: 'Samenvatting van de aanvraag',
    contact: 'Contact',
    nextStep: 'Wat er daarna gebeurt',
    submitted: 'Ingediend',
    quotation: 'Offerte',
    project: 'Project',
    version: 'Versie',
    total: 'Totaal',
    validUntil: 'Geldig tot',
    timeline: 'Geschatte doorlooptijd',
    agreedAmount: 'Overeengekomen bedrag',
    acceptedAt: 'Geaccepteerd',
    declinedAt: 'Afgewezen',
    reason: 'Reden',
    message: 'Bericht',
    customer: 'Klant',
    priceInQuote: 'Prijs zoals beschreven in de offerte',
    openQuote: 'Offerte openen',
    openStatus: 'Mijn aanvraag bekijken',
    openAdmin: 'Openen in het beheer',
    fallback: 'Werkt de knop niet, kopieer dan dit adres naar je browser:',
    noteTitle: 'Informatie',

    confirmationSubject: (reference) => `We bekijken je aanvraag binnenkort — ${reference}`,
    confirmationTitle: 'Je aanvraag is aangekomen',
    confirmationIntro: (name) => `Hallo ${name}, bedankt dat je contact met ons opneemt. Je aanvraag is goed aangekomen en we bekijken hem binnenkort.`,
    confirmationNext: 'We kijken je aanvraag door en vragen indien nodig om details. Maken we een offerte, dan mailen we die met een beveiligde link waar je hem kunt bekijken, accepteren of afwijzen. In deze fase vragen we geen betaling.',
    confirmationFooter: 'Dit is een automatische bevestiging. Wil je iets toevoegen, antwoord dan op deze e-mail. Heb je deze aanvraag niet zelf verstuurd, dan kun je dit bericht gerust negeren.',

    newRequestTitle: (reference) => `Nieuwe offerteaanvraag ${reference}`,
    newRequestSubject: (reference, name) => `Nieuwe offerteaanvraag (${reference}): ${name}`,
    newRequestIntro: 'Er is een nieuwe offerteaanvraag binnengekomen. Antwoord op deze e-mail om de afzender rechtstreeks te antwoorden.',
    ownerFooter: 'Deze melding komt uit het offertesysteem van de website.',

    sentSubject: (title, reference) => `Je offerte: ${title} — ${reference}`,
    revisedSubject: (title, reference) => `Herziene offerte: ${title} — ${reference}`,
    sentTitle: 'Je offerte staat klaar',
    revisedTitle: 'We sturen een herziene offerte',
    sentIntro: (name) => `Hallo ${name}, we hebben een offerte voor je aanvraag opgesteld. Het volledige voorstel staat op de beveiligde pagina achter de knop hieronder.`,
    revisedIntro: (name) => `Hallo ${name}, we hebben het eerdere voorstel aangepast en sturen de nieuwe versie. De link van de vorige versie werkt niet meer; bekijk dus deze laatste.`,
    sentSteps: 'Op die pagina lees je het hele voorstel met de voorwaarden. Je kunt het accepteren, afwijzen, of om toelichting of een wijziging vragen. Het openen van de link of het lezen van deze e-mail is geen acceptatie.',
    sentFooter: 'Deze e-mail bevat een persoonlijke, beveiligde link: deel hem niet met anderen. Heb je een vraag, antwoord dan op deze e-mail.',

    acceptedSubject: (reference) => `Je hebt de offerte geaccepteerd — ${reference}`,
    acceptedTitle: 'We hebben je acceptatie vastgelegd',
    acceptedIntro: (name) => `Hallo ${name}, we hebben vastgelegd dat je de onderstaande offerte hebt geaccepteerd.`,
    acceptedNext: 'We nemen binnenkort contact met je op over de start van het project. Acceptatie is geen factuur, en via deze website is geen betaling gevraagd of ontvangen.',
    acceptedFooter: 'Je ontvangt dit omdat je een offerte hebt geaccepteerd. Was jij dat niet, antwoord dan op deze e-mail.',
    acceptedAdminSubject: (reference) => `Offerte geaccepteerd: ${reference}`,
    acceptedAdminTitle: 'De klant heeft de offerte geaccepteerd',
    acceptedAdminIntro: 'De klant heeft het voorstel op de beveiligde pagina geaccepteerd. De aanvraag staat nu op Geaccepteerd; het starten van het project is een aparte stap.',

    declinedSubject: (reference) => `Bevestiging: je hebt de offerte afgewezen — ${reference}`,
    declinedTitle: 'We hebben je beslissing vastgelegd',
    declinedIntro: (name) => `Hallo ${name}, we hebben vastgelegd dat je de onderstaande offerte hebt afgewezen. Bedankt voor het bekijken.`,
    declinedFooter: 'Bedenk je je, of heb je een ander voorstel nodig, antwoord dan op deze e-mail.',
    declinedAdminSubject: (reference) => `Offerte afgewezen: ${reference}`,
    declinedAdminTitle: 'De klant heeft de offerte afgewezen',
    declinedAdminIntro: 'De klant heeft het voorstel op de beveiligde pagina afgewezen.',

    revisionSubject: (reference) => `De klant vraagt om toelichting of een wijziging: ${reference}`,
    revisionTitle: 'De klant vraagt om toelichting of een wijziging',
    revisionIntro: 'De klant heeft een bericht gestuurd vanaf de offertepagina. Het voorstel is niet vanzelf veranderd; je kunt een nieuwe versie maken.',

    statusFooter: 'Heb je vragen, antwoord dan op deze e-mail.',
  },
}

export const quoteWords = (lang: Language): Words => W[lang]

const longDay = (day: string, lang: Language): string => {
  const locale = lang === 'hu' ? 'hu-HU' : lang === 'nl' ? 'nl-NL' : 'en-GB'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00.000Z`))
}

const cut = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value)

/** The line of a cart in words, with the names the request saved (so a package renamed since still reads as the customer saw it). */
function itemLine(item: ItemView, lang: Language, needs: Record<string, string>, packageLabel: string, customLabel: string, packageName: (code: string) => string): string {
  const names = (item.names ?? {}) as { package?: Record<string, string> | null; extras?: Array<{ code: string; names: Record<string, string> }> }
  const need = needs[item.need] ?? item.need
  const plan = item.package ? (names.package?.[lang] ?? packageName(item.package)) : customLabel
  const extras = item.extras.map((code) => names.extras?.find((extra) => extra.code === code)?.names?.[lang] ?? code)
  return `${need} — ${packageLabel}: ${plan}${extras.length > 0 ? ` + ${extras.join(', ')}` : ''}`
}

export interface RequestMail {
  request: QuoteRow
  items: readonly ItemView[]
  totals: Totals
  packageName: (code: string) => string
}

/** What the published prices of a cart come to, in words; and nothing at all about a price the catalogue does not publish. */
function pricingText(totals: Totals, lang: Language): string {
  const w = emailWords(lang)
  if (totals.fixed.length === 0) return w.noPublishedPrices
  const sums = `${w.fixedPrefix}: ${totals.fixed.map((sum) => `${sum.amount} ${sum.currency} (${w.vat[sum.vat] ?? sum.vat})`).join(', ')}.`
  return totals.quotedParts > 0 ? `${sums} ${w.quotedParts(totals.quotedParts)}` : sums
}

function requestRows(data: RequestMail, lang: Language, withContact: boolean): Row[] {
  const w = emailWords(lang)
  const q = W[lang]
  const { request } = data
  const service = request.kind === 'full_experience' ? (request.source === 'control_room_ai' ? w.aiPlan : 'FULL EXPERIENCE') : data.items.map((item) => itemLine(item, lang, w.needs, w.package, w.customPlan, data.packageName)).join('\n')
  const rows: Row[] = [
    { label: w.reference, value: request.reference },
    { label: q.submitted, value: dateText(request.created_at, lang) },
    { label: w.topic, value: q.types[request.request_type] ?? request.request_type },
    { label: w.services, value: service || w.customPlan },
  ]
  if (withContact) {
    rows.push({ label: w.name, value: request.name }, { label: w.email, value: request.email })
    if (request.phone) rows.push({ label: w.phone, value: request.phone })
    if (request.company) rows.push({ label: q.company, value: request.company })
    if (request.website) rows.push({ label: q.website, value: request.website })
  }
  return rows
}

/** The owner's notification of a new request: everything the quotation needs, and a link to the request in the administration. */
export function renderRequestNotification(data: RequestMail, lang: Language, brand: string, adminUrl: string | null): Rendered {
  const w = emailWords(lang)
  const q = W[lang]
  const { request } = data
  const rows: Row[] = [
    ...requestRows(data, lang, true),
    { label: 'Source', value: q.sources[request.source] ?? request.source },
    { label: w.language, value: w.languages[request.language] },
    ...(request.kind === 'full_experience' ? briefRows(request, lang) : [{ label: w.pricing, value: pricingText(data.totals, lang) }]),
    ...(request.budget_range ? [{ label: q.budget, value: request.budget_range }] : []),
    ...(request.timing ? [{ label: w.timing, value: w.timings[request.timing] ?? request.timing }] : []),
    { label: w.description, value: request.description },
    ...(request.objective ? [{ label: w.objective, value: w.objectives[request.objective] ?? request.objective }] : []),
    ...(request.requirements ? [{ label: w.requirements, value: request.requirements }] : []),
    ...(request.reference_notes ? [{ label: w.references, value: request.reference_notes }] : []),
  ]
  const cta: Cta | undefined = adminUrl ? { label: q.openAdmin, url: adminUrl, fallback: q.fallback } : undefined
  const parts = { brand, title: q.newRequestTitle(request.reference), intro: q.newRequestIntro, rows, cta, footer: q.ownerFooter }
  const preview = `${oneLine(request.name, 40)}: ${oneLine(request.description, 100)}`
  return { subject: q.newRequestSubject(request.reference, oneLine(request.name, 40)), preview, text: plain(parts), html: layout({ lang, preview, ...parts }) }
}

/** What the customer gets when their request is saved: the thank-you, what they sent, and what happens next; no deadline unless the administrator wrote one. */
export function renderRequestConfirmation(data: RequestMail, lang: Language, brand: string, statusUrl: string | null, responseNote: string | null): Rendered {
  const q = W[lang]
  const { request } = data
  const rows: Row[] = [...requestRows(data, lang, true), { label: q.summary, value: cut(request.description, 400) }]
  const cta: Cta | undefined = statusUrl ? { label: q.openStatus, url: statusUrl, fallback: q.fallback } : undefined
  const note = { title: q.nextStep, text: responseNote ? `${q.confirmationNext}

${responseNote}` : q.confirmationNext }
  const parts = { brand, title: q.confirmationTitle, intro: q.confirmationIntro(oneLine(request.name, 60)), rows, note, cta, footer: q.confirmationFooter }
  return { subject: q.confirmationSubject(request.reference), preview: q.confirmationTitle, text: plain(parts), html: layout({ lang, preview: q.confirmationTitle, ...parts }) }
}

/** What a quotation e-mail says about the offer (the details are on the page). */
export interface QuoteMail {
  reference: string
  requestReference: string
  version: number
  title: string
  language: Language
  customerName: string
  /** The price as a person reads it: an amount with its currency, or the description of a custom price. */
  priceText: string
  validUntil: string | null
  timeline: string
}

function quoteRows(quote: QuoteMail, lang: Language): Row[] {
  const q = W[lang]
  const w = emailWords(lang)
  return [
    { label: q.quotation, value: quote.reference },
    { label: w.reference, value: quote.requestReference },
    { label: q.project, value: quote.title },
    { label: q.version, value: String(quote.version) },
    { label: q.total, value: quote.priceText },
    ...(quote.validUntil ? [{ label: q.validUntil, value: longDay(quote.validUntil, lang) }] : []),
    ...(quote.timeline ? [{ label: q.timeline, value: cut(quote.timeline, 200) }] : []),
  ]
}

export function renderQuoteSent(quote: QuoteMail, lang: Language, brand: string, url: string, revised: boolean, note: string | null): Rendered {
  const q = W[lang]
  const name = oneLine(quote.customerName, 60)
  const intro = revised ? q.revisedIntro(name) : q.sentIntro(name)
  const title = revised ? q.revisedTitle : q.sentTitle
  const parts = { brand, title, intro, rows: quoteRows(quote, lang), note: { title: q.nextStep, text: note ? `${q.sentSteps}\n\n${note}` : q.sentSteps }, cta: { label: q.openQuote, url, fallback: q.fallback }, footer: q.sentFooter }
  const subject = (revised ? q.revisedSubject : q.sentSubject)(oneLine(quote.title, 70), quote.reference)
  return { subject, preview: `${oneLine(quote.title, 60)} · ${quote.priceText}`, text: plain(parts), html: layout({ lang, preview: `${oneLine(quote.title, 60)} · ${quote.priceText}`, ...parts }) }
}

export function renderQuoteAccepted(quote: QuoteMail, acceptedAt: string, lang: Language, brand: string, url: string | null): Rendered {
  const q = W[lang]
  const rows: Row[] = [...quoteRows(quote, lang).filter((row) => row.label !== q.total), { label: q.agreedAmount, value: quote.priceText }, { label: q.acceptedAt, value: dateText(acceptedAt, lang) }]
  const parts = { brand, title: q.acceptedTitle, intro: q.acceptedIntro(oneLine(quote.customerName, 60)), rows, note: { title: q.nextStep, text: q.acceptedNext }, cta: url ? { label: q.openQuote, url, fallback: q.fallback } : undefined, footer: q.acceptedFooter }
  return { subject: q.acceptedSubject(quote.requestReference), preview: q.acceptedTitle, text: plain(parts), html: layout({ lang, preview: q.acceptedTitle, ...parts }) }
}

export function renderQuoteAcceptedAdmin(quote: QuoteMail, acceptedAt: string, lang: Language, brand: string, adminUrl: string | null): Rendered {
  const q = W[lang]
  const rows: Row[] = [...quoteRows(quote, lang).filter((row) => row.label !== q.total), { label: q.agreedAmount, value: quote.priceText }, { label: q.acceptedAt, value: dateText(acceptedAt, lang) }, { label: q.customer, value: quote.customerName }]
  const parts = { brand, title: q.acceptedAdminTitle, intro: q.acceptedAdminIntro, rows, cta: adminUrl ? { label: q.openAdmin, url: adminUrl, fallback: q.fallback } : undefined, footer: q.ownerFooter }
  return { subject: q.acceptedAdminSubject(quote.requestReference), preview: q.acceptedAdminTitle, text: plain(parts), html: layout({ lang, preview: q.acceptedAdminTitle, ...parts }) }
}

export function renderQuoteDeclined(quote: QuoteMail, declinedAt: string, lang: Language, brand: string): Rendered {
  const q = W[lang]
  const rows: Row[] = [...quoteRows(quote, lang), { label: q.declinedAt, value: dateText(declinedAt, lang) }]
  const parts = { brand, title: q.declinedTitle, intro: q.declinedIntro(oneLine(quote.customerName, 60)), rows, footer: q.declinedFooter }
  return { subject: q.declinedSubject(quote.requestReference), preview: q.declinedTitle, text: plain(parts), html: layout({ lang, preview: q.declinedTitle, ...parts }) }
}

export function renderQuoteDeclinedAdmin(quote: QuoteMail, declinedAt: string, reason: string | null, lang: Language, brand: string, adminUrl: string | null): Rendered {
  const q = W[lang]
  const rows: Row[] = [...quoteRows(quote, lang), { label: q.declinedAt, value: dateText(declinedAt, lang) }, { label: q.customer, value: quote.customerName }, ...(reason ? [{ label: q.reason, value: reason }] : [])]
  const parts = { brand, title: q.declinedAdminTitle, intro: q.declinedAdminIntro, rows, cta: adminUrl ? { label: q.openAdmin, url: adminUrl, fallback: q.fallback } : undefined, footer: q.ownerFooter }
  return { subject: q.declinedAdminSubject(quote.requestReference), preview: q.declinedAdminTitle, text: plain(parts), html: layout({ lang, preview: q.declinedAdminTitle, ...parts }) }
}

export function renderRevisionRequested(quote: QuoteMail, message: string, at: string, lang: Language, brand: string, adminUrl: string | null): Rendered {
  const q = W[lang]
  const rows: Row[] = [...quoteRows(quote, lang), { label: q.customer, value: quote.customerName }, { label: q.submitted, value: dateText(at, lang) }, { label: q.message, value: message }]
  const parts = { brand, title: q.revisionTitle, intro: q.revisionIntro, rows, cta: adminUrl ? { label: q.openAdmin, url: adminUrl, fallback: q.fallback } : undefined, footer: q.ownerFooter }
  return { subject: q.revisionSubject(quote.requestReference), preview: oneLine(message, 100), text: plain(parts), html: layout({ lang, preview: oneLine(message, 100), ...parts }) }
}
