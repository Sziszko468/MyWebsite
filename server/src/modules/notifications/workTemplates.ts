import type { Language } from '../../config.ts'
import type { ProjectStatus } from '../customers/model.ts'
import { clientWords, compose, ctaOf } from './clientTemplates.ts'
import { oneLine, type Row, type Rendered } from './templates.ts'

/**
 * The e-mails of the project work (PROMPT 26), in Hungarian, English and Dutch: a customer is told that an action was given to them, that its date is near or has
 * passed, that their response was accepted or needs changes, and that a milestone they can see was completed; the owner is told that a customer responded.
 *
 * What they say is deliberately plain. They name the project, its reference, the task's title and (when there is one) its date, and carry the words the owner wrote FOR
 * the customer; they never carry a private note, the task's internal description or anyone else's work, and they promise nothing (no time for an answer, no outcome).
 */

export type WorkMailKind = 'client_action_assigned' | 'client_action_due_soon' | 'client_action_overdue' | 'client_action_submitted_admin' | 'client_action_reviewed' | 'client_action_changes_requested' | 'client_milestone_completed'

export const WORK_MAIL_KINDS: readonly WorkMailKind[] = ['client_action_assigned', 'client_action_due_soon', 'client_action_overdue', 'client_action_submitted_admin', 'client_action_reviewed', 'client_action_changes_requested', 'client_milestone_completed']

/** Sent to the owner, not to the customer. */
export const WORK_MAIL_TO_OWNER: readonly WorkMailKind[] = ['client_action_submitted_admin']

interface Message {
  subject: (project: string) => string
  title: string
  intro: (name: string) => string
  button: string
}

interface Words {
  labels: { task: string; due: string; milestone: string; request: string; customer: string }
  detailsWork: string
  detailsOwner: string
  messages: Record<WorkMailKind, Message>
}

const W: Record<Language, Words> = {
  hu: {
    labels: { task: 'Teendő', due: 'Határidő', milestone: 'Mérföldkő', request: 'Amit kérünk', customer: 'Ügyfél' },
    detailsWork: 'A TEENDŐ RÉSZLETEI',
    detailsOwner: 'A VÁLASZ RÉSZLETEI',
    messages: {
      client_action_assigned: { subject: (project) => `Teendőd van a projektedben: ${project}`, title: 'Új teendő vár rád', intro: (name) => `Szia ${name}! A projektedben van egy feladat, amelyhez a te válaszod kell. A részletek lent találhatók, a választ az ügyfélportálban tudod megadni.`, button: 'Teendő megnyitása' },
      client_action_due_soon: { subject: (project) => `Közeledik egy határidő: ${project}`, title: 'Közeledik egy határidő', intro: (name) => `Szia ${name}! A projektedben egy teendő hamarosan esedékes, és még a te válaszodra vár.`, button: 'Teendő megnyitása' },
      client_action_overdue: { subject: (project) => `Elmúlt egy határidő: ${project}`, title: 'Elmúlt egy határidő', intro: (name) => `Szia ${name}! A projektedben egy teendő a kitűzött napig nem kapott választ. Amint tudsz, nyisd meg és add meg a választ; ha több időre van szükséged, írj nekünk.`, button: 'Teendő megnyitása' },
      client_action_submitted_admin: { subject: (project) => `Az ügyfél válaszolt: ${project}`, title: 'Új válasz vár átnézésre', intro: () => 'Egy ügyfél válaszolt egy teendőre. A válasz átnézésre vár az adminisztrációban.', button: 'Megnyitás az adminisztrációban' },
      client_action_reviewed: { subject: (project) => `Elfogadtuk a válaszodat: ${project}`, title: 'Elfogadtuk a válaszodat', intro: (name) => `Szia ${name}! Köszönjük, a válaszodat elfogadtuk. Ebben a teendőben nincs több dolgod.`, button: 'Projekt megnyitása' },
      client_action_changes_requested: { subject: (project) => `Módosítást kérünk a válaszodban: ${project}`, title: 'Módosítást kérünk', intro: (name) => `Szia ${name}! Átnéztük a válaszodat, és kérünk néhány módosítást. A kérésünk lent olvasható; az új választ az ügyfélportálban tudod megadni.`, button: 'Teendő megnyitása' },
      client_milestone_completed: { subject: (project) => `Elkészült egy mérföldkő: ${project}`, title: 'Elkészült egy mérföldkő', intro: (name) => `Szia ${name}! A projekted egyik mérföldköve elkészült. A részletek az ügyfélportálban láthatók.`, button: 'Projekt megnyitása' },
    },
  },
  en: {
    labels: { task: 'Task', due: 'Due date', milestone: 'Milestone', request: 'What we ask', customer: 'Customer' },
    detailsWork: 'TASK DETAILS',
    detailsOwner: 'RESPONSE DETAILS',
    messages: {
      client_action_assigned: { subject: (project) => `An action is waiting for you: ${project}`, title: 'A new action needs your response', intro: (name) => `Hello ${name}, there is a task in your project that needs your response. The details are below; you can answer in the client portal.`, button: 'Open the action' },
      client_action_due_soon: { subject: (project) => `A due date is coming up: ${project}`, title: 'A due date is coming up', intro: (name) => `Hello ${name}, an action in your project is due soon and is still waiting for your response.`, button: 'Open the action' },
      client_action_overdue: { subject: (project) => `A due date has passed: ${project}`, title: 'A due date has passed', intro: (name) => `Hello ${name}, an action in your project has passed its due date and still waits for your response. Please open it when you can; if you need more time, write to us.`, button: 'Open the action' },
      client_action_submitted_admin: { subject: (project) => `A customer responded: ${project}`, title: 'A response is waiting for review', intro: () => 'A customer responded to an action. The response is waiting for your review in the administration.', button: 'Open in the administration' },
      client_action_reviewed: { subject: (project) => `Your response was accepted: ${project}`, title: 'Your response was accepted', intro: (name) => `Hello ${name}, thank you: your response was accepted. There is nothing more to do for this action.`, button: 'Open the project' },
      client_action_changes_requested: { subject: (project) => `We ask for changes to your response: ${project}`, title: 'We ask for some changes', intro: (name) => `Hello ${name}, we reviewed your response and ask for some changes. Our request is below; you can send a new response in the client portal.`, button: 'Open the action' },
      client_milestone_completed: { subject: (project) => `A milestone was completed: ${project}`, title: 'A milestone was completed', intro: (name) => `Hello ${name}, a milestone of your project was completed. You can see the details in the client portal.`, button: 'Open the project' },
    },
  },
  nl: {
    labels: { task: 'Taak', due: 'Datum', milestone: 'Mijlpaal', request: 'Wat we vragen', customer: 'Klant' },
    detailsWork: 'GEGEVENS VAN DE TAAK',
    detailsOwner: 'GEGEVENS VAN DE REACTIE',
    messages: {
      client_action_assigned: { subject: (project) => `Er wacht een actie op je: ${project}`, title: 'Er is een nieuwe actie voor je', intro: (name) => `Hallo ${name}, er is een taak in je project waarvoor we jouw reactie nodig hebben. De details staan hieronder; je reageert in het klantportaal.`, button: 'Actie openen' },
      client_action_due_soon: { subject: (project) => `Een datum komt dichterbij: ${project}`, title: 'Een datum komt dichterbij', intro: (name) => `Hallo ${name}, een actie in je project is binnenkort aan de beurt en wacht nog op jouw reactie.`, button: 'Actie openen' },
      client_action_overdue: { subject: (project) => `Een datum is verstreken: ${project}`, title: 'Een datum is verstreken', intro: (name) => `Hallo ${name}, een actie in je project is voorbij de gestelde datum en wacht nog op jouw reactie. Open haar zodra je kunt; heb je meer tijd nodig, schrijf ons dan.`, button: 'Actie openen' },
      client_action_submitted_admin: { subject: (project) => `Een klant heeft gereageerd: ${project}`, title: 'Een reactie wacht op beoordeling', intro: () => 'Een klant heeft gereageerd op een actie. De reactie wacht op jouw beoordeling in het beheer.', button: 'Openen in het beheer' },
      client_action_reviewed: { subject: (project) => `Je reactie is geaccepteerd: ${project}`, title: 'Je reactie is geaccepteerd', intro: (name) => `Hallo ${name}, bedankt: je reactie is geaccepteerd. Voor deze actie hoef je verder niets te doen.`, button: 'Project openen' },
      client_action_changes_requested: { subject: (project) => `We vragen om aanpassingen in je reactie: ${project}`, title: 'We vragen om aanpassingen', intro: (name) => `Hallo ${name}, we hebben je reactie bekeken en vragen om enkele aanpassingen. Ons verzoek staat hieronder; een nieuwe reactie stuur je via het klantportaal.`, button: 'Actie openen' },
      client_milestone_completed: { subject: (project) => `Een mijlpaal is afgerond: ${project}`, title: 'Een mijlpaal is afgerond', intro: (name) => `Hallo ${name}, een mijlpaal van je project is afgerond. De details zie je in het klantportaal.`, button: 'Project openen' },
    },
  },
}

export const workWords = (lang: Language): Words => W[lang]

/** A calendar day (`2026-09-14`) as a person reads it. A day has no zone, so the text is made in UTC, which cannot shift it. */
export function dayText(day: string, lang: Language): string {
  const locale = lang === 'hu' ? 'hu-HU' : lang === 'nl' ? 'nl-NL' : 'en-GB'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

export interface WorkMailInput {
  project: { name: string; reference: string; status: ProjectStatus }
  /** The customer's name (the greeting); in the owner's message, the customer the response is from. */
  customerName: string | null
  customerEmail?: string | null
  /** The title of the task, as the customer sees it. */
  task: string | null
  dueOn: string | null
  /** The milestone's title (the milestone message). */
  milestone?: string | null
  /** The words the owner wrote FOR the customer (the request for changes). Never a private note. */
  note: string | null
}

export function renderWorkMail(kind: WorkMailKind, input: WorkMailInput, lang: Language, brand: string, url: string | null): Rendered {
  const w = W[lang]
  const c = clientWords(lang)
  const message = w.messages[kind]
  const owner = WORK_MAIL_TO_OWNER.includes(kind)
  const rows: Row[] = [
    { label: c.labels.project, value: oneLine(input.project.name, 120) },
    { label: c.labels.reference, value: input.project.reference },
  ]
  if (input.task) rows.push({ label: w.labels.task, value: oneLine(input.task, 160) })
  if (input.milestone) rows.push({ label: w.labels.milestone, value: oneLine(input.milestone, 160) })
  if (input.dueOn) rows.push({ label: w.labels.due, value: dayText(input.dueOn, lang) })
  if (owner) {
    rows.push({ label: w.labels.customer, value: [input.customerName ? oneLine(input.customerName, 100) : null, input.customerEmail ?? null].filter(Boolean).join(' · ') || '–' })
  }
  if (input.note) rows.push({ label: kind === 'client_action_changes_requested' ? w.labels.request : c.labels.message, value: input.note.slice(0, 1500) })
  const parts = {
    title: message.title,
    intro: message.intro(oneLine(input.customerName ?? '', 60)),
    rows,
    cta: ctaOf(lang, message.button, url),
    footer: owner ? c.ownerFooter : c.customerFooter,
    detailsLabel: owner ? w.detailsOwner : w.detailsWork,
  }
  return { subject: message.subject(oneLine(input.project.name, 80)), preview: message.title, ...compose(lang, brand, parts) }
}
