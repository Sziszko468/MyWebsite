import type { Language } from '../../config.ts'
import type { ProjectStatus } from '../customers/model.ts'
import { dateText, layout, oneLine, plain, type Cta, type Rendered, type Row } from './templates.ts'
import type { CommunicationMailKind } from './communicationTemplates.ts'
import type { DeliverableMailKind } from './deliverableTemplates.ts'
import type { WorkMailKind } from './workTemplates.ts'

/**
 * The e-mails of the client portal (PROMPT 25), in Hungarian, English and Dutch, each as a branded HTML part and a plain-text part. The layout and the
 * escaping are templates.ts's: every value goes through `html` or is printed as text, so a name or a project's title can never become markup.
 *
 * What they say is deliberately plain:
 *  - a sign-in message says what the link does, that it works once and for how long, and that it can be ignored; it never says the message was delivered;
 *  - a security notice carries no link and no secret: it says what happened to the account and to write if it was not the customer;
 *  - a project message carries the project's name, its reference, its status and the words the owner wrote FOR the customer, never a private note;
 *  - nothing here promises a time for an answer, a price or a service level: none of that is configured anywhere.
 */

export type ClientMailKind =
  | 'client_sign_in'
  | 'client_activate'
  | 'client_register'
  | 'client_email_change'
  | 'client_security_notice'
  | 'client_project_created'
  | 'client_project_status'
  | 'client_document_published'
  | 'client_deletion_requested_admin'
  | WorkMailKind
  | DeliverableMailKind
  | CommunicationMailKind

export const CLIENT_MAIL_KINDS: readonly ClientMailKind[] = ['client_sign_in', 'client_activate', 'client_register', 'client_email_change', 'client_security_notice', 'client_project_created', 'client_project_status', 'client_document_published', 'client_deletion_requested_admin', 'client_action_assigned', 'client_action_due_soon', 'client_action_overdue', 'client_action_submitted_admin', 'client_action_reviewed', 'client_action_changes_requested', 'client_milestone_completed', 'client_deliverable_ready', 'client_deliverable_new_version', 'client_deliverable_approval_requested', 'client_deliverable_reply', 'deliverable_feedback_admin', 'deliverable_changes_requested_admin', 'deliverable_approved_admin', 'client_message_reply', 'client_message_announcement', 'client_message_important', 'client_conversation_resolved', 'message_received_admin', 'resolution_requested_admin']

/** The security notice's four reasons: the types of an account's history that tell the customer something. */
export type NoticeKind = 'email_change_requested' | 'email_changed' | 'deletion_requested' | 'sessions_revoked'

interface Words {
  labels: { project: string; reference: string; status: string; validFor: string; when: string; message: string; document: string; name: string; email: string; company: string }
  statuses: Record<ProjectStatus, string>
  detailsAuth: string
  detailsNotice: string
  detailsProject: string
  detailsAccount: string
  fallback: string
  minutes: (count: string) => string
  hours: (count: string) => string
  ignore: string
  noteTitle: string
  customerFooter: string
  ownerFooter: string
  signIn: { subject: string; title: string; intro: (name: string) => string; button: string }
  activate: { subject: string; title: string; intro: (name: string) => string; button: string }
  register: { subject: string; title: string; intro: string; button: string }
  emailChange: { subject: string; title: string; intro: (name: string) => string; button: string }
  notice: {
    subject: string
    requested: { title: string; intro: (name: string, masked: string) => string }
    changed: { title: string; intro: (name: string) => string }
    deletion: { title: string; intro: (name: string) => string }
    revoked: { title: string; intro: (name: string) => string }
  }
  projectCreated: { subject: (project: string) => string; title: string; intro: (name: string) => string; button: string }
  projectUpdate: { subject: (project: string) => string; titleStatus: string; titleFeedback: string; titleUpdate: string; intro: (name: string) => string; button: string }
  document: { subject: (project: string) => string; title: string; intro: (name: string) => string; button: string }
  deletionAdmin: { subject: string; title: string; intro: string; button: string }
}

const W: Record<Language, Words> = {
  hu: {
    labels: { project: 'Projekt', reference: 'Azonosító', status: 'Állapot', validFor: 'Érvényesség', when: 'Időpont', message: 'Üzenet', document: 'Dokumentum', name: 'Név', email: 'E-mail-cím', company: 'Cég' },
    statuses: { awaiting_start: 'Indulásra vár', discovery: 'Feltárás', planning: 'Tervezés', design: 'Dizájn', development: 'Fejlesztés', review: 'Átnézés', waiting_customer: 'Rád vár', finalization: 'Véglegesítés', completed: 'Befejezve', on_hold: 'Szünetel', cancelled: 'Lemondva' },
    detailsAuth: 'A LINK',
    detailsNotice: 'A TÖRTÉNTEK',
    detailsProject: 'A PROJEKT RÉSZLETEI',
    detailsAccount: 'AZ ÜGYFÉL ADATAI',
    fallback: 'Ha a gomb nem nyílik meg, másold be ezt a címet a böngészőbe:',
    minutes: (count) => `${count} perc`,
    hours: (count) => `${count} óra`,
    ignore: 'Ha nem te kérted ezt az üzenetet, hagyd figyelmen kívül. A link megnyitásáig semmi sem változik.',
    noteTitle: 'Tudnivaló',
    customerFooter: 'Ez automatikus üzenet. Kérdés esetén válaszolj erre az e-mailre.',
    ownerFooter: 'Ez az értesítés a weboldal ügyfélportáljából érkezett.',
    signIn: { subject: 'A belépési linked az ügyfélportálhoz', title: 'Lépj be az ügyfélportálba', intro: (name) => (name ? `Szia ${name}! A lenti gombbal tudsz belépni. A link csak egyszer használható.` : 'Szia! A lenti gombbal tudsz belépni. A link csak egyszer használható.'), button: 'Belépés' },
    activate: { subject: 'Elkészült az ügyfélportál-fiókod', title: 'Elkészült az ügyfélportál-fiókod', intro: (name) => (name ? `Szia ${name}! Létrehoztunk neked egy fiókot az ügyfélportálban. A lenti gombbal megerősítheted az e-mail-címedet, és megnyithatod a portált.` : 'Szia! Létrehoztunk neked egy fiókot az ügyfélportálban. A lenti gombbal megerősítheted az e-mail-címedet, és megnyithatod a portált.'), button: 'Portál megnyitása' },
    register: { subject: 'Erősítsd meg az e-mail-címedet', title: 'Erősítsd meg az e-mail-címedet', intro: 'Szia! A lenti gombbal erősítheted meg ezt az e-mail-címet, és hozhatod létre az ügyfélportál-fiókodat.', button: 'Megerősítés és tovább' },
    emailChange: { subject: 'Erősítsd meg az új e-mail-címedet', title: 'Erősítsd meg az új e-mail-címedet', intro: (name) => (name ? `Szia ${name}! Azt kérted, hogy ezt a címet használjuk az ügyfélportál-fiókodhoz. A lenti gombbal erősítheted meg. Utána minden más eszközön kijelentkeztetünk.` : 'Szia! Azt kérted, hogy ezt a címet használjuk az ügyfélportál-fiókodhoz. A lenti gombbal erősítheted meg. Utána minden más eszközön kijelentkeztetünk.'), button: 'Cím megerősítése' },
    notice: {
      subject: 'Biztonsági értesítés az ügyfélportál-fiókodról',
      requested: { title: 'E-mail-cím módosítását kérték', intro: (name, masked) => `Szia ${name}! Valaki belépett az ügyfélportál-fiókodba, és az e-mail-címét erre szeretné cserélni: ${masked}. A cím addig nem változik, amíg az oda küldött linket meg nem nyitják. Ha nem te voltál, írj nekünk, és segítünk.` },
      changed: { title: 'Megváltozott az e-mail-címed', intro: (name) => `Szia ${name}! Az ügyfélportál-fiókod e-mail-címe megváltozott, ezért erre a címre többé nem lehet belépni. Ha nem te csináltad, írj nekünk minél hamarabb.` },
      deletion: { title: 'Megkaptuk a fiókod törlésére vonatkozó kérésedet', intro: (name) => `Szia ${name}! Megkaptuk a kérésedet az ügyfélportál-fiókod és a rólad tárolt adatok törléséről. Foglalkozunk vele, és jelentkezünk.` },
      revoked: { title: 'Kijelentkeztettünk mindenhol', intro: (name) => `Szia ${name}! Az ügyfélportál-fiókodba belépett összes eszközt kijelentkeztettük. Új linkkel bármikor újra beléphetsz.` },
    },
    projectCreated: { subject: (project) => `Új projekt készült neked: ${project}`, title: 'Új projekt az ügyfélportálodban', intro: (name) => `Szia ${name}! Létrehoztunk egy projektet neked az ügyfélportálban. Ott követheted a haladását.`, button: 'Portál megnyitása' },
    projectUpdate: { subject: (project) => `Hír a projektedről: ${project}`, titleStatus: 'Megváltozott a projekted állapota', titleFeedback: 'Szükségünk van a véleményedre', titleUpdate: 'Hír a projektedről', intro: (name) => `Szia ${name}! Új információ van a projektedről. A részletek lent találhatók.`, button: 'Portál megnyitása' },
    document: { subject: (project) => `Új dokumentum a projektedhez: ${project}`, title: 'Új dokumentum érhető el', intro: (name) => `Szia ${name}! A projektedhez új dokumentumot osztottunk meg veled. Az ügyfélportálban megtalálod.`, button: 'Dokumentumok megnyitása' },
    deletionAdmin: { subject: 'Egy ügyfél a fiókja törlését kérte', title: 'Fióktörlési kérés', intro: 'Egy ügyfél kérte az ügyfélportál-fiókja és az adatai törlését. A kérés rögzítve van; még semmi sincs törölve.', button: 'Megnyitás az adminisztrációban' },
  },
  en: {
    labels: { project: 'Project', reference: 'Reference', status: 'Status', validFor: 'Valid for', when: 'Time', message: 'Message', document: 'Document', name: 'Name', email: 'Email address', company: 'Company' },
    statuses: { awaiting_start: 'Awaiting start', discovery: 'Discovery', planning: 'Planning', design: 'Design', development: 'Development', review: 'Review', waiting_customer: 'Waiting for you', finalization: 'Finalisation', completed: 'Completed', on_hold: 'On hold', cancelled: 'Cancelled' },
    detailsAuth: 'THE LINK',
    detailsNotice: 'WHAT HAPPENED',
    detailsProject: 'PROJECT DETAILS',
    detailsAccount: 'CUSTOMER DETAILS',
    fallback: 'If the button does not open, copy this address into your browser:',
    minutes: (count) => `${count} minutes`,
    hours: (count) => `${count} hours`,
    ignore: 'If you did not ask for this message, you can ignore it. Nothing changes until someone opens the link.',
    noteTitle: 'Good to know',
    customerFooter: 'This is an automatic message. If you have a question, reply to this email.',
    ownerFooter: 'This notice comes from the client portal of the website.',
    signIn: { subject: 'Your link to sign in to the client portal', title: 'Sign in to your client portal', intro: (name) => (name ? `Hello ${name}, use the button below to sign in. The link works once.` : 'Hello, use the button below to sign in. The link works once.'), button: 'Sign in' },
    activate: { subject: 'Your client portal account is ready', title: 'Your client portal account is ready', intro: (name) => (name ? `Hello ${name}, an account has been set up for you in the client portal. Use the button below to confirm your email address and open the portal.` : 'Hello, an account has been set up for you in the client portal. Use the button below to confirm your email address and open the portal.'), button: 'Open the portal' },
    register: { subject: 'Confirm your email address', title: 'Confirm your email address', intro: 'Hello, use the button below to confirm this email address and create your client portal account.', button: 'Confirm and continue' },
    emailChange: { subject: 'Confirm your new email address', title: 'Confirm your new email address', intro: (name) => (name ? `Hello ${name}, you asked to use this address for your client portal account. Use the button below to confirm it. Once you do, you are signed out everywhere else.` : 'Hello, you asked to use this address for your client portal account. Use the button below to confirm it. Once you do, you are signed out everywhere else.'), button: 'Confirm this address' },
    notice: {
      subject: 'A security notice about your client portal account',
      requested: { title: 'A change of email address was requested', intro: (name, masked) => `Hello ${name}, someone signed in to your client portal account and asked to change its email address to ${masked}. Nothing changes until the link sent to that address is opened. If this was not you, write to us and we will help.` },
      changed: { title: 'Your email address was changed', intro: (name) => `Hello ${name}, the email address of your client portal account was changed, so this address can no longer sign in to it. If you did not do this, write to us as soon as you can.` },
      deletion: { title: 'We received your request to delete your account', intro: (name) => `Hello ${name}, we received your request to delete your client portal account and the data we hold about you. We will deal with it and get back to you.` },
      revoked: { title: 'You were signed out everywhere', intro: (name) => `Hello ${name}, every device that was signed in to your client portal account has been signed out. You can sign in again with a new link at any time.` },
    },
    projectCreated: { subject: (project) => `A project was set up for you: ${project}`, title: 'A new project in your portal', intro: (name) => `Hello ${name}, we have set up a project for you in the client portal. You can follow its progress there.`, button: 'Open your portal' },
    projectUpdate: { subject: (project) => `News about your project: ${project}`, titleStatus: 'Your project status changed', titleFeedback: 'We need your feedback', titleUpdate: 'News about your project', intro: (name) => `Hello ${name}, there is news about your project. The details are below.`, button: 'Open your portal' },
    document: { subject: (project) => `A new document for your project: ${project}`, title: 'A new document is available', intro: (name) => `Hello ${name}, we have shared a new document with you for your project. You can find it in the client portal.`, button: 'Open your documents' },
    deletionAdmin: { subject: 'A customer asked to delete their account', title: 'Account deletion requested', intro: 'A customer asked for their client portal account and their data to be deleted. The request is recorded; nothing has been deleted yet.', button: 'Open in the administration' },
  },
  nl: {
    labels: { project: 'Project', reference: 'Referentie', status: 'Status', validFor: 'Geldig', when: 'Tijdstip', message: 'Bericht', document: 'Document', name: 'Naam', email: 'E-mailadres', company: 'Bedrijf' },
    statuses: { awaiting_start: 'Wacht op start', discovery: 'Verkenning', planning: 'Planning', design: 'Ontwerp', development: 'Ontwikkeling', review: 'Beoordeling', waiting_customer: 'Wacht op jou', finalization: 'Afronding', completed: 'Afgerond', on_hold: 'Gepauzeerd', cancelled: 'Geannuleerd' },
    detailsAuth: 'DE LINK',
    detailsNotice: 'WAT ER GEBEURDE',
    detailsProject: 'GEGEVENS VAN HET PROJECT',
    detailsAccount: 'GEGEVENS VAN DE KLANT',
    fallback: 'Opent de knop niet? Kopieer dan dit adres naar je browser:',
    minutes: (count) => `${count} minuten`,
    hours: (count) => `${count} uur`,
    ignore: 'Heb je dit bericht niet zelf aangevraagd? Dan kun je het negeren. Er verandert niets zolang niemand de link opent.',
    noteTitle: 'Goed om te weten',
    customerFooter: 'Dit is een automatisch bericht. Heb je een vraag, antwoord dan op deze e-mail.',
    ownerFooter: 'Deze melding komt van het klantportaal van de website.',
    signIn: { subject: 'Je link om in te loggen bij het klantportaal', title: 'Log in bij je klantportaal', intro: (name) => (name ? `Hallo ${name}, log in met de knop hieronder. De link werkt maar één keer.` : 'Hallo, log in met de knop hieronder. De link werkt maar één keer.'), button: 'Inloggen' },
    activate: { subject: 'Je account voor het klantportaal staat klaar', title: 'Je account voor het klantportaal staat klaar', intro: (name) => (name ? `Hallo ${name}, er is een account voor je aangemaakt in het klantportaal. Bevestig met de knop hieronder je e-mailadres en open het portaal.` : 'Hallo, er is een account voor je aangemaakt in het klantportaal. Bevestig met de knop hieronder je e-mailadres en open het portaal.'), button: 'Portaal openen' },
    register: { subject: 'Bevestig je e-mailadres', title: 'Bevestig je e-mailadres', intro: 'Hallo, bevestig met de knop hieronder dit e-mailadres en maak je account voor het klantportaal aan.', button: 'Bevestigen en doorgaan' },
    emailChange: { subject: 'Bevestig je nieuwe e-mailadres', title: 'Bevestig je nieuwe e-mailadres', intro: (name) => (name ? `Hallo ${name}, je wilt dit adres gebruiken voor je account in het klantportaal. Bevestig het met de knop hieronder. Daarna word je op alle andere apparaten uitgelogd.` : 'Hallo, je wilt dit adres gebruiken voor je account in het klantportaal. Bevestig het met de knop hieronder. Daarna word je op alle andere apparaten uitgelogd.'), button: 'Dit adres bevestigen' },
    notice: {
      subject: 'Een beveiligingsmelding over je account voor het klantportaal',
      requested: { title: 'Er is gevraagd om je e-mailadres te wijzigen', intro: (name, masked) => `Hallo ${name}, iemand is ingelogd op je account voor het klantportaal en vroeg om het e-mailadres te wijzigen in ${masked}. Er verandert niets zolang de link die naar dat adres is gestuurd niet is geopend. Was jij het niet, schrijf ons dan en we helpen je.` },
      changed: { title: 'Je e-mailadres is gewijzigd', intro: (name) => `Hallo ${name}, het e-mailadres van je account voor het klantportaal is gewijzigd, dus met dit adres kun je niet meer inloggen. Heb je dit niet zelf gedaan, schrijf ons dan zo snel mogelijk.` },
      deletion: { title: 'We hebben je verzoek om je account te verwijderen ontvangen', intro: (name) => `Hallo ${name}, we hebben je verzoek ontvangen om je account voor het klantportaal en de gegevens die we over je bewaren te verwijderen. We nemen het in behandeling en laten van ons horen.` },
      revoked: { title: 'Je bent overal uitgelogd', intro: (name) => `Hallo ${name}, alle apparaten die waren ingelogd op je account voor het klantportaal zijn uitgelogd. Met een nieuwe link kun je op elk moment weer inloggen.` },
    },
    projectCreated: { subject: (project) => `Er is een project voor je aangemaakt: ${project}`, title: 'Een nieuw project in je portaal', intro: (name) => `Hallo ${name}, we hebben een project voor je aangemaakt in het klantportaal. Daar volg je de voortgang.`, button: 'Portaal openen' },
    projectUpdate: { subject: (project) => `Nieuws over je project: ${project}`, titleStatus: 'De status van je project is gewijzigd', titleFeedback: 'We hebben je reactie nodig', titleUpdate: 'Nieuws over je project', intro: (name) => `Hallo ${name}, er is nieuws over je project. De details staan hieronder.`, button: 'Portaal openen' },
    document: { subject: (project) => `Een nieuw document voor je project: ${project}`, title: 'Er is een nieuw document beschikbaar', intro: (name) => `Hallo ${name}, we hebben een nieuw document met je gedeeld voor je project. Je vindt het in het klantportaal.`, button: 'Documenten openen' },
    deletionAdmin: { subject: 'Een klant vraagt om verwijdering van het account', title: 'Verzoek om account te verwijderen', intro: 'Een klant vraagt om verwijdering van het account voor het klantportaal en de gegevens. Het verzoek is vastgelegd; er is nog niets verwijderd.', button: 'Openen in het beheer' },
  },
}

export const clientWords = (lang: Language): Words => W[lang]

// ---- rendering --------------------------------------------------------------------------------------------------------------------------

/** `j*****@example.com`: enough for the person to recognise their own address, not enough to read someone else's. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@')
  if (at < 1) return '***'
  return `${address.slice(0, 1)}${'*'.repeat(Math.min(5, Math.max(1, at - 1)))}${address.slice(at)}`
}

export function compose(lang: Language, brand: string, parts: { title: string; intro: string; rows: Row[]; note?: { title: string; text: string }; cta?: Cta; footer: string; detailsLabel: string }): { text: string; html: string } {
  const { detailsLabel, ...rest } = parts
  return { text: plain({ brand, ...rest }), html: layout({ lang, brand, preview: parts.title, detailsLabel, ...rest }) }
}

export const ctaOf = (lang: Language, label: string, url: string | null): Cta | undefined => (url ? { label, url, fallback: W[lang].fallback } : undefined)

/** The four messages that carry a link which signs someone in or confirms an address. `url` is the link with its secret: it is printed in this message and kept nowhere else. */
export function renderClientLink(kind: 'client_sign_in' | 'client_activate' | 'client_register' | 'client_email_change', input: { name: string | null; url: string; validFor: { unit: 'minutes' | 'hours'; count: number } }, lang: Language, brand: string): Rendered {
  const w = W[lang]
  const name = input.name ? oneLine(input.name, 60) : ''
  const words = kind === 'client_sign_in' ? w.signIn : kind === 'client_activate' ? w.activate : kind === 'client_register' ? w.register : w.emailChange
  const intro = typeof words.intro === 'function' ? words.intro(name) : words.intro
  const valid = input.validFor.unit === 'hours' ? w.hours(String(input.validFor.count)) : w.minutes(String(input.validFor.count))
  const parts = { title: words.title, intro, rows: [{ label: w.labels.validFor, value: valid }], note: { title: w.noteTitle, text: w.ignore }, cta: ctaOf(lang, words.button, input.url), footer: w.customerFooter, detailsLabel: w.detailsAuth }
  return { subject: words.subject, preview: words.title, ...compose(lang, brand, parts) }
}

/** A notice about the account: what happened, when, and to write if it was not the customer. It carries no link and no secret. */
export function renderSecurityNotice(kind: NoticeKind, input: { name: string | null; at: string; maskedNewAddress: string | null }, lang: Language, brand: string): Rendered {
  const w = W[lang]
  const name = input.name ? oneLine(input.name, 60) : ''
  const masked = input.maskedNewAddress ?? '***'
  const body = kind === 'email_change_requested' ? { title: w.notice.requested.title, intro: w.notice.requested.intro(name || '', masked) } : kind === 'email_changed' ? { title: w.notice.changed.title, intro: w.notice.changed.intro(name || '') } : kind === 'deletion_requested' ? { title: w.notice.deletion.title, intro: w.notice.deletion.intro(name || '') } : { title: w.notice.revoked.title, intro: w.notice.revoked.intro(name || '') }
  const parts = { title: body.title, intro: body.intro, rows: [{ label: w.labels.when, value: dateText(input.at, lang) }], footer: w.customerFooter, detailsLabel: w.detailsNotice }
  return { subject: w.notice.subject, preview: body.title, ...compose(lang, brand, parts) }
}

export interface ProjectMail {
  name: string
  reference: string
  status: ProjectStatus
  customerName: string | null
}

const projectRows = (p: ProjectMail, lang: Language): Row[] => [
  { label: W[lang].labels.project, value: oneLine(p.name, 120) },
  { label: W[lang].labels.reference, value: p.reference },
  { label: W[lang].labels.status, value: W[lang].statuses[p.status] },
]

export function renderProjectCreated(p: ProjectMail, lang: Language, brand: string, portalUrl: string | null): Rendered {
  const w = W[lang]
  const parts = { title: w.projectCreated.title, intro: w.projectCreated.intro(oneLine(p.customerName ?? '', 60)), rows: projectRows(p, lang), cta: ctaOf(lang, w.projectCreated.button, portalUrl), footer: w.customerFooter, detailsLabel: w.detailsProject }
  return { subject: w.projectCreated.subject(oneLine(p.name, 80)), preview: w.projectCreated.title, ...compose(lang, brand, parts) }
}

export function renderProjectUpdate(kind: 'status_changed' | 'feedback_requested' | 'update_posted', p: ProjectMail, note: string | null, lang: Language, brand: string, portalUrl: string | null): Rendered {
  const w = W[lang]
  const title = kind === 'status_changed' ? w.projectUpdate.titleStatus : kind === 'feedback_requested' ? w.projectUpdate.titleFeedback : w.projectUpdate.titleUpdate
  const rows = projectRows(p, lang)
  if (note) rows.push({ label: w.labels.message, value: note.slice(0, 1500) })
  const parts = { title, intro: w.projectUpdate.intro(oneLine(p.customerName ?? '', 60)), rows, cta: ctaOf(lang, w.projectUpdate.button, portalUrl), footer: w.customerFooter, detailsLabel: w.detailsProject }
  return { subject: w.projectUpdate.subject(oneLine(p.name, 80)), preview: title, ...compose(lang, brand, parts) }
}

export function renderDocumentPublished(p: ProjectMail, documentTitle: string, lang: Language, brand: string, portalUrl: string | null): Rendered {
  const w = W[lang]
  const rows = projectRows(p, lang)
  rows.push({ label: w.labels.document, value: oneLine(documentTitle, 160) })
  const parts = { title: w.document.title, intro: w.document.intro(oneLine(p.customerName ?? '', 60)), rows, cta: ctaOf(lang, w.document.button, portalUrl), footer: w.customerFooter, detailsLabel: w.detailsProject }
  return { subject: w.document.subject(oneLine(p.name, 80)), preview: w.document.title, ...compose(lang, brand, parts) }
}

/** The owner's message that a customer asked for their account to be deleted. It names the customer (the owner has to act on it) and carries no link to the customer's data except the administration's own page. */
export function renderDeletionRequested(input: { name: string | null; email: string; company: string | null }, lang: Language, brand: string, adminUrl: string | null): Rendered {
  const w = W[lang]
  const rows: Row[] = [{ label: w.labels.name, value: input.name ? oneLine(input.name, 100) : '–' }, { label: w.labels.email, value: input.email }]
  if (input.company) rows.push({ label: w.labels.company, value: oneLine(input.company, 120) })
  const parts = { title: w.deletionAdmin.title, intro: w.deletionAdmin.intro, rows, cta: ctaOf(lang, w.deletionAdmin.button, adminUrl), footer: w.ownerFooter, detailsLabel: w.detailsAccount }
  return { subject: w.deletionAdmin.subject, preview: w.deletionAdmin.title, ...compose(lang, brand, parts) }
}
