import type { Language } from '../../config.ts'
import { clientWords, compose, ctaOf } from './clientTemplates.ts'
import { oneLine, type Rendered, type Row } from './templates.ts'

/**
 * The e-mails of the client communication system (PROMPT 28), in Hungarian, English and Dutch: a customer is told that the owner wrote to them, posted an announcement or an
 * important message, or resolved a conversation; the owner is told that a customer wrote or asked for a conversation to be resolved.
 *
 * They say THAT there is something new and WHERE to read it, and nothing of it: never the words of a message, never the subject of a conversation, never a private note. A private
 * conversation stays behind the sign-in; an e-mail travels through other people's servers. They name the project (as every portal message does), the conversation's reference, and
 * (to the owner) the customer, so the owner can open it; they promise nothing and never say that the other side has read anything.
 */

export type CommunicationMailKind =
  | 'client_message_reply'
  | 'client_message_announcement'
  | 'client_message_important'
  | 'client_conversation_resolved'
  | 'message_received_admin'
  | 'resolution_requested_admin'

export const COMMUNICATION_MAIL_KINDS: readonly CommunicationMailKind[] = [
  'client_message_reply',
  'client_message_announcement',
  'client_message_important',
  'client_conversation_resolved',
  'message_received_admin',
  'resolution_requested_admin',
]

/** Sent to the owner, not to the customer. */
export const COMMUNICATION_MAIL_TO_OWNER: readonly CommunicationMailKind[] = ['message_received_admin', 'resolution_requested_admin']

interface Message {
  subject: (project: string | null) => string
  title: string
  intro: (name: string) => string
  button: string
}

interface Words {
  labels: { conversation: string; customer: string }
  detailsCustomer: string
  detailsOwner: string
  messages: Record<CommunicationMailKind, Message>
}

const W: Record<Language, Words> = {
  hu: {
    labels: { conversation: 'Beszélgetés', customer: 'Ügyfél' },
    detailsCustomer: 'A BESZÉLGETÉS RÉSZLETEI',
    detailsOwner: 'A BESZÉLGETÉS RÉSZLETEI',
    messages: {
      client_message_reply: {
        subject: (project) => (project ? `Üzenetünk van számodra: ${project}` : 'Üzenetünk van számodra'),
        title: 'Üzenetet írtunk neked',
        intro: (name) => `Szia ${name}! Üzenetet írtunk neked a portálon. A szövegét nem küldjük e-mailben: belépés után a portálon olvashatod, és ott válaszolhatsz is.`,
        button: 'Üzenet megnyitása',
      },
      client_message_announcement: {
        subject: (project) => (project ? `Közlemény: ${project}` : 'Közlemény a portálon'),
        title: 'Közleményt tettünk közzé neked',
        intro: (name) => `Szia ${name}! Közleményt írtunk neked a portálon. A szövegét nem küldjük e-mailben: belépés után a portálon olvashatod.`,
        button: 'Közlemény megnyitása',
      },
      client_message_important: {
        subject: (project) => (project ? `Fontos üzenet: ${project}` : 'Fontos üzenet a portálon'),
        title: 'Fontos üzenetet írtunk neked',
        intro: (name) => `Szia ${name}! Fontosnak jelölt üzenetet írtunk neked a portálon. A szövegét nem küldjük e-mailben: belépés után a portálon olvashatod, és ott válaszolhatsz is.`,
        button: 'Üzenet megnyitása',
      },
      client_conversation_resolved: {
        subject: (project) => (project ? `Lezártunk egy beszélgetést: ${project}` : 'Lezártunk egy beszélgetést'),
        title: 'Lezártunk egy beszélgetést',
        intro: (name) => `Szia ${name}! Egy beszélgetést lezártunk. Ha még van kérdésed, a portálon bármikor újra írhatsz, és a beszélgetés újra megnyílik.`,
        button: 'Beszélgetés megnyitása',
      },
      message_received_admin: {
        subject: (project) => (project ? `Az ügyfél üzenetet írt: ${project}` : 'Az ügyfél üzenetet írt'),
        title: 'Új ügyfélüzenet',
        intro: () => 'Egy ügyfél üzenetet írt a portálon. A szövege itt nem szerepel: az adminisztrációban olvashatod és válaszolhatsz rá.',
        button: 'Beszélgetés megnyitása',
      },
      resolution_requested_admin: {
        subject: (project) => (project ? `Az ügyfél lezárást kér: ${project}` : 'Az ügyfél lezárást kér'),
        title: 'Egy ügyfél a beszélgetés lezárását kéri',
        intro: () => 'Egy ügyfél azt kéri, hogy zárjátok le a beszélgetést. Te döntesz róla az adminisztrációban.',
        button: 'Beszélgetés megnyitása',
      },
    },
  },
  en: {
    labels: { conversation: 'Conversation', customer: 'Customer' },
    detailsCustomer: 'CONVERSATION DETAILS',
    detailsOwner: 'CONVERSATION DETAILS',
    messages: {
      client_message_reply: {
        subject: (project) => (project ? `We have a message for you: ${project}` : 'We have a message for you'),
        title: 'We wrote to you',
        intro: (name) => `Hello ${name}, we wrote you a message in the portal. We do not put its text in an email: sign in to read it, and to reply.`,
        button: 'Open the message',
      },
      client_message_announcement: {
        subject: (project) => (project ? `An announcement: ${project}` : 'An announcement in the portal'),
        title: 'We posted an announcement for you',
        intro: (name) => `Hello ${name}, we posted an announcement for you in the portal. We do not put its text in an email: sign in to read it.`,
        button: 'Open the announcement',
      },
      client_message_important: {
        subject: (project) => (project ? `An important message: ${project}` : 'An important message in the portal'),
        title: 'We wrote you an important message',
        intro: (name) => `Hello ${name}, we wrote you a message in the portal and marked it as important. We do not put its text in an email: sign in to read it, and to reply.`,
        button: 'Open the message',
      },
      client_conversation_resolved: {
        subject: (project) => (project ? `We resolved a conversation: ${project}` : 'We resolved a conversation'),
        title: 'We resolved a conversation',
        intro: (name) => `Hello ${name}, we resolved a conversation. If you still have a question, write again in the portal at any time and the conversation opens again.`,
        button: 'Open the conversation',
      },
      message_received_admin: {
        subject: (project) => (project ? `A customer wrote: ${project}` : 'A customer wrote'),
        title: 'A new customer message',
        intro: () => 'A customer wrote a message in the portal. Its text is not in this email: read it and reply in the administration.',
        button: 'Open the conversation',
      },
      resolution_requested_admin: {
        subject: (project) => (project ? `A customer asked to resolve: ${project}` : 'A customer asked to resolve a conversation'),
        title: 'A customer asks for a conversation to be resolved',
        intro: () => 'A customer asked for a conversation to be resolved. It is your decision, in the administration.',
        button: 'Open the conversation',
      },
    },
  },
  nl: {
    labels: { conversation: 'Gesprek', customer: 'Klant' },
    detailsCustomer: 'DETAILS VAN HET GESPREK',
    detailsOwner: 'DETAILS VAN HET GESPREK',
    messages: {
      client_message_reply: {
        subject: (project) => (project ? `We hebben een bericht voor je: ${project}` : 'We hebben een bericht voor je'),
        title: 'We hebben je geschreven',
        intro: (name) => `Hallo ${name}, we hebben je een bericht gestuurd in het portaal. De tekst zetten we niet in een e-mail: log in om het te lezen en om te antwoorden.`,
        button: 'Bericht openen',
      },
      client_message_announcement: {
        subject: (project) => (project ? `Een mededeling: ${project}` : 'Een mededeling in het portaal'),
        title: 'We hebben een mededeling voor je geplaatst',
        intro: (name) => `Hallo ${name}, we hebben een mededeling voor je geplaatst in het portaal. De tekst zetten we niet in een e-mail: log in om hem te lezen.`,
        button: 'Mededeling openen',
      },
      client_message_important: {
        subject: (project) => (project ? `Een belangrijk bericht: ${project}` : 'Een belangrijk bericht in het portaal'),
        title: 'We hebben je een belangrijk bericht gestuurd',
        intro: (name) => `Hallo ${name}, we hebben je een bericht gestuurd in het portaal en het als belangrijk gemarkeerd. De tekst zetten we niet in een e-mail: log in om het te lezen en om te antwoorden.`,
        button: 'Bericht openen',
      },
      client_conversation_resolved: {
        subject: (project) => (project ? `We hebben een gesprek afgesloten: ${project}` : 'We hebben een gesprek afgesloten'),
        title: 'We hebben een gesprek afgesloten',
        intro: (name) => `Hallo ${name}, we hebben een gesprek afgesloten. Heb je nog een vraag, schrijf dan op elk moment opnieuw in het portaal: het gesprek gaat dan weer open.`,
        button: 'Gesprek openen',
      },
      message_received_admin: {
        subject: (project) => (project ? `Een klant schreef: ${project}` : 'Een klant schreef'),
        title: 'Een nieuw bericht van een klant',
        intro: () => 'Een klant heeft een bericht geschreven in het portaal. De tekst staat niet in deze e-mail: lees en beantwoord het in de administratie.',
        button: 'Gesprek openen',
      },
      resolution_requested_admin: {
        subject: (project) => (project ? `Een klant vraagt om afsluiting: ${project}` : 'Een klant vraagt om een gesprek af te sluiten'),
        title: 'Een klant vraagt om een gesprek af te sluiten',
        intro: () => 'Een klant vraagt om een gesprek af te sluiten. Jij beslist daarover in de administratie.',
        button: 'Gesprek openen',
      },
    },
  },
}

export const communicationWords = (lang: Language): Words => W[lang]

export interface CommunicationMailInput {
  project: { name: string; reference: string } | null
  /** The greeting (customer messages) or the customer the message is from (owner messages). */
  customerName: string | null
  customerEmail?: string | null
  conversationReference: string
}

export function renderCommunicationMail(kind: CommunicationMailKind, input: CommunicationMailInput, lang: Language, brand: string, url: string | null): Rendered {
  const w = W[lang]
  const c = clientWords(lang)
  const message = w.messages[kind]
  const owner = COMMUNICATION_MAIL_TO_OWNER.includes(kind)
  const rows: Row[] = []
  if (input.project) {
    rows.push({ label: c.labels.project, value: oneLine(input.project.name, 120) })
    rows.push({ label: c.labels.reference, value: input.project.reference })
  }
  rows.push({ label: w.labels.conversation, value: input.conversationReference })
  if (owner) rows.push({ label: w.labels.customer, value: [input.customerName ? oneLine(input.customerName, 100) : null, input.customerEmail ?? null].filter(Boolean).join(' · ') || '–' })
  const parts = {
    title: message.title,
    intro: message.intro(oneLine(input.customerName ?? '', 60)),
    rows,
    cta: ctaOf(lang, message.button, url),
    footer: owner ? c.ownerFooter : c.customerFooter,
    detailsLabel: owner ? w.detailsOwner : w.detailsCustomer,
  }
  return { subject: message.subject(input.project ? oneLine(input.project.name, 80) : null), preview: message.title, ...compose(lang, brand, parts) }
}
