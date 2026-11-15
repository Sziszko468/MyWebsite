import type { Language } from '../../config.ts'
import { clientWords, compose, ctaOf } from './clientTemplates.ts'
import { oneLine, type Rendered, type Row } from './templates.ts'

/**
 * The e-mails of the feedback and approval work (PROMPT 27), in Hungarian, English and Dutch: a customer is told that a deliverable is ready, that a new version is available,
 * that their approval is asked for, and that the owner replied; the owner is told that a customer sent feedback, asked for changes or approved.
 *
 * They name the project, its reference, the deliverable and its version, and carry only words written FOR the customer (the owner's request or reply) or BY the customer (their
 * explanation) to the person the message is for; never a private note, never the deliverable's internal description. They promise nothing and never say a message arrived.
 */

export type DeliverableMailKind =
  | 'client_deliverable_ready'
  | 'client_deliverable_new_version'
  | 'client_deliverable_approval_requested'
  | 'client_deliverable_reply'
  | 'deliverable_feedback_admin'
  | 'deliverable_changes_requested_admin'
  | 'deliverable_approved_admin'

export const DELIVERABLE_MAIL_KINDS: readonly DeliverableMailKind[] = ['client_deliverable_ready', 'client_deliverable_new_version', 'client_deliverable_approval_requested', 'client_deliverable_reply', 'deliverable_feedback_admin', 'deliverable_changes_requested_admin', 'deliverable_approved_admin']

/** Sent to the owner, not to the customer. */
export const DELIVERABLE_MAIL_TO_OWNER: readonly DeliverableMailKind[] = ['deliverable_feedback_admin', 'deliverable_changes_requested_admin', 'deliverable_approved_admin']

interface Message {
  subject: (project: string) => string
  title: string
  intro: (name: string) => string
  button: string
}

interface Words {
  labels: { deliverable: string; version: string; note: string; reply: string; explanation: string; comments: string; customer: string }
  detailsCustomer: string
  detailsOwner: string
  messages: Record<DeliverableMailKind, Message>
}

const W: Record<Language, Words> = {
  hu: {
    labels: { deliverable: 'Anyag', version: 'Verzió', note: 'Üzenet', reply: 'Válasz', explanation: 'Indoklás', comments: 'Észrevételek száma', customer: 'Ügyfél' },
    detailsCustomer: 'AZ ANYAG RÉSZLETEI',
    detailsOwner: 'A VISSZAJELZÉS RÉSZLETEI',
    messages: {
      client_deliverable_ready: { subject: (project) => `Átnézésre vár egy anyag: ${project}`, title: 'Új anyag vár az átnézésedre', intro: (name) => `Szia ${name}! A projektedhez elkészült egy anyag, és megosztottuk veled. Az ügyfélportálban megnézheted, és visszajelzést adhatsz.`, button: 'Anyag megnyitása' },
      client_deliverable_new_version: { subject: (project) => `Új verzió érhető el: ${project}`, title: 'Új verzió érhető el', intro: (name) => `Szia ${name}! Az egyik anyagodból új verziót tettünk közzé. A korábbi verziók és a visszajelzéseid is megvannak a portálon.`, button: 'Anyag megnyitása' },
      client_deliverable_approval_requested: { subject: (project) => `Jóváhagyásra vár: ${project}`, title: 'Kérlek, hagyd jóvá', intro: (name) => `Szia ${name}! Kérlek, nézd át az anyag legújabb verzióját, és döntsd el, jóváhagyod-e, vagy módosítást kérsz. Jóváhagyás csak a te kifejezett megerősítésedre történik.`, button: 'Anyag megnyitása' },
      client_deliverable_reply: { subject: (project) => `Válaszoltunk a visszajelzésedre: ${project}`, title: 'Válaszoltunk a visszajelzésedre', intro: (name) => `Szia ${name}! Válaszoltunk az egyik észrevételedre. A válasz lent olvasható, a teljes beszélgetés a portálon található.`, button: 'Anyag megnyitása' },
      deliverable_feedback_admin: { subject: (project) => `Az ügyfél visszajelzést küldött: ${project}`, title: 'Új visszajelzés érkezett', intro: () => 'Egy ügyfél visszajelzést küldött egy anyagra. A visszajelzés átnézésre vár az adminisztrációban.', button: 'Megnyitás az adminisztrációban' },
      deliverable_changes_requested_admin: { subject: (project) => `Az ügyfél módosítást kért: ${project}`, title: 'Az ügyfél módosítást kért', intro: () => 'Egy ügyfél módosítást kért egy anyag verziójához. Az indoklása lent olvasható.', button: 'Megnyitás az adminisztrációban' },
      deliverable_approved_admin: { subject: (project) => `Az ügyfél jóváhagyott egy verziót: ${project}`, title: 'Jóváhagyás érkezett', intro: () => 'Egy ügyfél kifejezetten jóváhagyta egy anyag egy meghatározott verzióját.', button: 'Megnyitás az adminisztrációban' },
    },
  },
  en: {
    labels: { deliverable: 'Deliverable', version: 'Version', note: 'Message', reply: 'Reply', explanation: 'Explanation', comments: 'Comments', customer: 'Customer' },
    detailsCustomer: 'DELIVERABLE DETAILS',
    detailsOwner: 'FEEDBACK DETAILS',
    messages: {
      client_deliverable_ready: { subject: (project) => `A deliverable is ready for your review: ${project}`, title: 'A new deliverable is ready for review', intro: (name) => `Hello ${name}, a deliverable for your project has been shared with you. You can look at it in the client portal and give feedback.`, button: 'Open the deliverable' },
      client_deliverable_new_version: { subject: (project) => `A new version is available: ${project}`, title: 'A new version is available', intro: (name) => `Hello ${name}, we published a new version of one of your deliverables. The earlier versions and your feedback are still in the portal.`, button: 'Open the deliverable' },
      client_deliverable_approval_requested: { subject: (project) => `Your approval is requested: ${project}`, title: 'Your approval is requested', intro: (name) => `Hello ${name}, please look at the latest version of this deliverable and decide whether to approve it or ask for changes. Nothing is approved unless you explicitly confirm it.`, button: 'Open the deliverable' },
      client_deliverable_reply: { subject: (project) => `We replied to your feedback: ${project}`, title: 'We replied to your feedback', intro: (name) => `Hello ${name}, we replied to one of your comments. The reply is below; the whole conversation is in the portal.`, button: 'Open the deliverable' },
      deliverable_feedback_admin: { subject: (project) => `A customer sent feedback: ${project}`, title: 'New feedback has arrived', intro: () => 'A customer sent feedback on a deliverable. It is waiting for you in the administration.', button: 'Open in the administration' },
      deliverable_changes_requested_admin: { subject: (project) => `A customer asked for changes: ${project}`, title: 'A customer asked for changes', intro: () => 'A customer asked for changes to a version of a deliverable. Their explanation is below.', button: 'Open in the administration' },
      deliverable_approved_admin: { subject: (project) => `A customer approved a version: ${project}`, title: 'An approval has arrived', intro: () => 'A customer explicitly approved one exact version of a deliverable.', button: 'Open in the administration' },
    },
  },
  nl: {
    labels: { deliverable: 'Oplevering', version: 'Versie', note: 'Bericht', reply: 'Antwoord', explanation: 'Toelichting', comments: 'Opmerkingen', customer: 'Klant' },
    detailsCustomer: 'GEGEVENS VAN DE OPLEVERING',
    detailsOwner: 'GEGEVENS VAN DE FEEDBACK',
    messages: {
      client_deliverable_ready: { subject: (project) => `Er staat een oplevering klaar ter beoordeling: ${project}`, title: 'Een nieuwe oplevering staat klaar ter beoordeling', intro: (name) => `Hallo ${name}, er is een oplevering voor je project met je gedeeld. Je bekijkt haar in het klantportaal en geeft er feedback op.`, button: 'Oplevering openen' },
      client_deliverable_new_version: { subject: (project) => `Er is een nieuwe versie beschikbaar: ${project}`, title: 'Er is een nieuwe versie beschikbaar', intro: (name) => `Hallo ${name}, we hebben een nieuwe versie van een van je opleveringen gepubliceerd. De eerdere versies en je feedback staan nog in het portaal.`, button: 'Oplevering openen' },
      client_deliverable_approval_requested: { subject: (project) => `We vragen om je goedkeuring: ${project}`, title: 'We vragen om je goedkeuring', intro: (name) => `Hallo ${name}, bekijk de nieuwste versie van deze oplevering en beslis of je haar goedkeurt of om aanpassingen vraagt. Er wordt niets goedgekeurd zonder je uitdrukkelijke bevestiging.`, button: 'Oplevering openen' },
      client_deliverable_reply: { subject: (project) => `We hebben op je feedback gereageerd: ${project}`, title: 'We hebben op je feedback gereageerd', intro: (name) => `Hallo ${name}, we hebben gereageerd op een van je opmerkingen. Het antwoord staat hieronder; het hele gesprek staat in het portaal.`, button: 'Oplevering openen' },
      deliverable_feedback_admin: { subject: (project) => `Een klant heeft feedback gestuurd: ${project}`, title: 'Er is nieuwe feedback binnengekomen', intro: () => 'Een klant heeft feedback gestuurd op een oplevering. Ze wacht op je in het beheer.', button: 'Openen in het beheer' },
      deliverable_changes_requested_admin: { subject: (project) => `Een klant vraagt om aanpassingen: ${project}`, title: 'Een klant vraagt om aanpassingen', intro: () => 'Een klant vraagt om aanpassingen aan een versie van een oplevering. De toelichting staat hieronder.', button: 'Openen in het beheer' },
      deliverable_approved_admin: { subject: (project) => `Een klant heeft een versie goedgekeurd: ${project}`, title: 'Er is een goedkeuring binnengekomen', intro: () => 'Een klant heeft één bepaalde versie van een oplevering uitdrukkelijk goedgekeurd.', button: 'Openen in het beheer' },
    },
  },
}

export const deliverableWords = (lang: Language): Words => W[lang]

export interface DeliverableMailInput {
  project: { name: string; reference: string }
  /** The greeting (customer messages) or the customer the feedback is from (owner messages). */
  customerName: string | null
  customerEmail?: string | null
  deliverable: { reference: string; title: string }
  version: number | null
  /** Words written for the person the message goes to, or by the customer: the request, the reply, the explanation. */
  note: string | null
  /** How many comments the feedback holds. */
  comments?: number | null
}

export function renderDeliverableMail(kind: DeliverableMailKind, input: DeliverableMailInput, lang: Language, brand: string, url: string | null): Rendered {
  const w = W[lang]
  const c = clientWords(lang)
  const message = w.messages[kind]
  const owner = DELIVERABLE_MAIL_TO_OWNER.includes(kind)
  const rows: Row[] = [
    { label: c.labels.project, value: oneLine(input.project.name, 120) },
    { label: c.labels.reference, value: input.project.reference },
    { label: w.labels.deliverable, value: oneLine(input.deliverable.title, 160) },
  ]
  if (input.version !== null) rows.push({ label: w.labels.version, value: String(input.version) })
  if (owner) rows.push({ label: w.labels.customer, value: [input.customerName ? oneLine(input.customerName, 100) : null, input.customerEmail ?? null].filter(Boolean).join(' · ') || '–' })
  if (input.comments) rows.push({ label: w.labels.comments, value: String(input.comments) })
  if (input.note) rows.push({ label: kind === 'client_deliverable_reply' ? w.labels.reply : kind === 'deliverable_changes_requested_admin' ? w.labels.explanation : w.labels.note, value: input.note.slice(0, 1500) })
  const parts = {
    title: message.title,
    intro: message.intro(oneLine(input.customerName ?? '', 60)),
    rows,
    cta: ctaOf(lang, message.button, url),
    footer: owner ? c.ownerFooter : c.customerFooter,
    detailsLabel: owner ? w.detailsOwner : w.detailsCustomer,
  }
  return { subject: message.subject(oneLine(input.project.name, 80)), preview: message.title, ...compose(lang, brand, parts) }
}
