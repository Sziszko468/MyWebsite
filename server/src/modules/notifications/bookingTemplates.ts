import type { Language } from '../../config.ts'
import type { BookingStatus } from '../bookings/model.ts'
import { oneLine, layout, plain, type Cta, type Rendered, type Row } from './templates.ts'

/**
 * The e-mails of the consultation booking (PROMPT 24), in Hungarian, English and Dutch, each as a branded HTML part and a plain-text part. The layout
 * and the escaping are templates.ts's: every value goes through `html` or is printed as text, so a name or a project description can never become markup.
 *
 * What they say is deliberately plain:
 *
 *  - the time is the appointment's own instant, written in the zone the owner schedules in, and the zone is named in the message: never the reader's;
 *  - nothing is said about where or how the conversation takes place, what it costs, how long an answer takes or what a cancellation costs: none of that is
 *    configured anywhere, so none of it is promised;
 *  - a customer's e-mail never carries the owner's private notes (the notes are not even loaded for a message), and the owner's optional note to the
 *    customer is printed only where the message is about that decision.
 */

export type BookingMailKind =
  | 'booking_received'
  | 'booking_confirmed'
  | 'booking_new_admin'
  | 'booking_change_received'
  | 'booking_change_requested_admin'
  | 'booking_rescheduled'
  | 'booking_proposal'
  | 'booking_change_declined'
  | 'booking_cancelled'
  | 'booking_cancelled_admin'

export const BOOKING_MAIL_KINDS: readonly BookingMailKind[] = ['booking_received', 'booking_confirmed', 'booking_new_admin', 'booking_change_received', 'booking_change_requested_admin', 'booking_rescheduled', 'booking_proposal', 'booking_change_declined', 'booking_cancelled', 'booking_cancelled_admin']

/** What a booking e-mail is written from. */
export interface BookingMail {
  reference: string
  name: string
  email: string
  company: string | null
  website: string | null
  description: string | null
  typeName: string
  durationMinutes: number
  startAt: string
  endAt: string
  timeZone: string
  status: BookingStatus
  /** Whether the customer's page lets them ask for a change (the owner's settings), so the message says so only when it is true. */
  canRequestChange: boolean
}

export interface ChangeMail {
  kind: 'cancel' | 'reschedule'
  initiator: 'customer' | 'owner'
  status: 'open' | 'applied' | 'declined' | 'withdrawn' | 'expired'
  newStartAt: string | null
  newEndAt: string | null
  message: string | null
  expiresAt: string | null
}

const LOCALE: Record<Language, string> = { hu: 'hu-HU', en: 'en-GB', nl: 'nl-NL' }

/** An appointment in words: the date, the times and the zone, all read in the scheduling zone. */
export function whenText(startAt: string, endAt: string, zone: string, lang: Language): { date: string; time: string; zone: string } {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const date = new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'full', timeZone: zone }).format(start)
  const clock = new Intl.DateTimeFormat(LOCALE[lang], { timeStyle: 'short', timeZone: zone })
  const abbreviation = new Intl.DateTimeFormat(LOCALE[lang], { timeZone: zone, timeZoneName: 'short' }).formatToParts(start).find((part) => part.type === 'timeZoneName')?.value
  return { date, time: `${clock.format(start)}–${clock.format(end)}`, zone: abbreviation ? `${zone} (${abbreviation})` : zone }
}

/** One moment in words (a deadline): the date and the time, in the scheduling zone. */
export function instantText(at: string, zone: string, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'long', timeStyle: 'short', timeZone: zone }).format(new Date(at))
}

interface Words {
  labels: { reference: string; consultation: string; when: string; duration: string; timeZone: string; name: string; email: string; company: string; website: string; description: string; status: string; newTime: string; previousTime: string; currentTime: string; message: string; validUntil: string }
  minutes: (count: string) => string
  statuses: Record<BookingStatus, string>
  detailsLabel: string
  openBooking: string
  answerProposal: string
  openAdmin: string
  fallback: string
  noteTitle: string
  /** Added to a confirmation only when the customer may ask for a change. */
  changeHint: string
  customerFooter: string
  ownerFooter: string

  received: { subject: (reference: string) => string; title: string; intro: (name: string) => string; next: string }
  confirmed: { subject: (reference: string) => string; title: string; intro: (name: string) => string; next: string }
  newAdmin: { subject: (reference: string, name: string) => string; title: (reference: string) => string; introConfirmed: string; introPending: string }
  changeReceived: { cancelSubject: (reference: string) => string; cancelTitle: string; cancelIntro: (name: string) => string; moveSubject: (reference: string) => string; moveTitle: string; moveIntro: (name: string) => string; next: string }
  changeAdmin: {
    subject: (title: string, reference: string, name: string) => string
    customerCancelOpen: { title: string; intro: string }
    customerMoveOpen: { title: string; intro: string }
    customerMoveApplied: { title: string; intro: string }
    proposalAccepted: { title: string; intro: string }
    proposalDeclined: { title: string; intro: string }
  }
  rescheduled: { subject: (reference: string) => string; title: string; intro: (name: string) => string }
  proposal: { subject: (reference: string) => string; title: string; intro: (name: string) => string; next: string }
  declined: { subject: (reference: string) => string; cancelTitle: string; moveTitle: string; cancelIntro: (name: string) => string; moveIntro: (name: string) => string }
  cancelled: { subject: (reference: string) => string; title: string; introCustomer: (name: string) => string; introOwner: (name: string) => string }
  cancelledAdmin: { subject: (reference: string, name: string) => string; title: (reference: string) => string; introCustomer: string; introOwner: string }
}

const W: Record<Language, Words> = {
  hu: {
    labels: { reference: 'Azonosító', consultation: 'Konzultáció', when: 'Időpont', duration: 'Időtartam', timeZone: 'Időzóna', name: 'Név', email: 'E-mail', company: 'Cég', website: 'Weboldal', description: 'A projektről', status: 'Állapot', newTime: 'Új időpont', previousTime: 'Korábbi időpont', currentTime: 'Jelenlegi időpont', message: 'Üzenet', validUntil: 'Eddig válaszolhatsz' },
    minutes: (count) => `${count} perc`,
    statuses: { pending: 'Megerősítésre vár', confirmed: 'Megerősítve', reschedule_requested: 'Módosítás folyamatban', rescheduled: 'Áthelyezve', cancelled: 'Lemondva', completed: 'Lezajlott', no_show: 'Nem jelent meg' },
    detailsLabel: 'A FOGLALÁS RÉSZLETEI',
    openBooking: 'Foglalás megtekintése',
    answerProposal: 'Válasz a javaslatra',
    openAdmin: 'Megnyitás az adminisztrációban',
    fallback: 'Ha a gomb nem nyílik meg, másold be ezt a címet a böngészőbe:',
    noteTitle: 'Tudnivaló',
    changeHint: 'Ott lemondást vagy időpont-módosítást is kérhetsz.',
    customerFooter: 'Ez automatikus üzenet. Kérdés esetén válaszolj erre az e-mailre. Ha nem te foglaltál időpontot, jelezd válaszban.',
    ownerFooter: 'Ez az értesítés a weboldal időpontfoglaló rendszeréből érkezett.',
    received: {
      subject: (reference) => `Megkaptuk a foglalási kérésedet — ${reference}`,
      title: 'Megkaptuk a foglalási kérésedet',
      intro: (name) => `Szia ${name}! Köszönjük. A kért időpontot lefoglaltuk neked, de a foglalás még nincs megerősítve.`,
      next: 'Újabb e-mailt küldünk, amint megerősítjük a foglalást, vagy ha az mégsem jöhet létre. A személyes linken addig is megnézheted az állapotát.',
    },
    confirmed: {
      subject: (reference) => `Megerősítettük a konzultációdat — ${reference}`,
      title: 'A konzultációd megerősítve',
      intro: (name) => `Szia ${name}! A konzultációd le van foglalva. A részletek lent találhatók.`,
      next: 'A foglalásodat és annak állapotát bármikor megnézheted az alábbi személyes linken.',
    },
    newAdmin: {
      subject: (reference, name) => `Új konzultációfoglalás (${reference}): ${name}`,
      title: (reference) => `Új foglalás ${reference}`,
      introConfirmed: 'Új konzultációt foglaltak a weboldalon. A foglalás megerősítve.',
      introPending: 'Új foglalási kérés érkezett a weboldalon, amely a te megerősítésedre vár.',
    },
    changeReceived: {
      cancelSubject: (reference) => `Megkaptuk a lemondási kérésedet — ${reference}`,
      cancelTitle: 'Megkaptuk a lemondási kérésedet',
      cancelIntro: (name) => `Szia ${name}! Megkaptuk a kérésedet a konzultáció lemondására. A foglalás a kérés megválaszolásáig változatlan marad.`,
      moveSubject: (reference) => `Megkaptuk az időpont-módosítási kérésedet — ${reference}`,
      moveTitle: 'Megkaptuk az időpont-módosítási kérésedet',
      moveIntro: (name) => `Szia ${name}! Megkaptuk a kérésedet, hogy a konzultációt az alábbi új időpontra tegyük át. Amíg a kérés nyitott, az új időpont le van foglalva neked, a foglalás pedig a jelenlegi időponton marad.`,
      next: 'Értesítünk, amint válaszoltunk a kérésedre. A személyes linken addig is követheted az állapotát.',
    },
    changeAdmin: {
      subject: (title, reference, name) => `${title} (${reference}): ${name}`,
      customerCancelOpen: { title: 'Lemondási kérés', intro: 'Az ügyfél lemondaná ezt a foglalást. A kérést az adminisztrációban válaszolhatod meg.' },
      customerMoveOpen: { title: 'Időpont-módosítási kérés', intro: 'Az ügyfél áttenné ezt a foglalást az alábbi új időpontra. Az új időpont addig le van foglalva, amíg a kérést meg nem válaszolod.' },
      customerMoveApplied: { title: 'Az ügyfél áthelyezte a foglalást', intro: 'Az ügyfél a beállításaid szerint saját maga áthelyezte a foglalást az alábbi új időpontra.' },
      proposalAccepted: { title: 'Az ügyfél elfogadta az új időpontot', intro: 'Az ügyfél elfogadta az általad javasolt új időpontot, a foglalás áthelyezve.' },
      proposalDeclined: { title: 'Az ügyfél elutasította az új időpontot', intro: 'Az ügyfél nem fogadta el az általad javasolt időpontot. A foglalás a korábbi időponton maradt.' },
    },
    rescheduled: {
      subject: (reference) => `Új időpontot kapott a konzultációd — ${reference}`,
      title: 'A konzultációd új időpontot kapott',
      intro: (name) => `Szia ${name}! A konzultációdat áthelyeztük. Az új időpont lent található.`,
    },
    proposal: {
      subject: (reference) => `Új időpontot javasolunk a konzultációdhoz — ${reference}`,
      title: 'Új időpontot javasolunk',
      intro: (name) => `Szia ${name}! A konzultációdhoz egy új időpontot javasolunk. Nyisd meg a foglalásodat, és fogadd el vagy utasítsd el a javaslatot.`,
      next: 'A foglalásod addig a jelenlegi időponton marad, amíg el nem fogadod az újat. Ha a megadott ideig nem válaszolsz, a javaslat lejár, és minden marad a régiben.',
    },
    declined: {
      subject: (reference) => `A kérésedet nem tudtuk teljesíteni — ${reference}`,
      cancelTitle: 'A lemondási kérést nem fogadtuk el',
      moveTitle: 'Az időpont-módosítási kérést nem fogadtuk el',
      cancelIntro: (name) => `Szia ${name}! A konzultáció lemondására vonatkozó kérésedet nem tudtuk teljesíteni. A foglalásod változatlan.`,
      moveIntro: (name) => `Szia ${name}! A konzultáció áthelyezésére vonatkozó kérésedet nem tudtuk teljesíteni. A foglalásod a korábbi időponton marad.`,
    },
    cancelled: {
      subject: (reference) => `A konzultációd le van mondva — ${reference}`,
      title: 'A konzultációd le van mondva',
      introCustomer: (name) => `Szia ${name}! A kérésednek megfelelően lemondtuk a konzultációt.`,
      introOwner: (name) => `Szia ${name}! A konzultációd sajnos le lett mondva.`,
    },
    cancelledAdmin: {
      subject: (reference, name) => `Foglalás lemondva (${reference}): ${name}`,
      title: (reference) => `Lemondott foglalás ${reference}`,
      introCustomer: 'Az ügyfél lemondta ezt a foglalást.',
      introOwner: 'Ez a foglalás le lett mondva.',
    },
  },
  en: {
    labels: { reference: 'Reference', consultation: 'Consultation', when: 'Date and time', duration: 'Duration', timeZone: 'Time zone', name: 'Name', email: 'Email', company: 'Company', website: 'Website', description: 'About the project', status: 'Status', newTime: 'New time', previousTime: 'Previous time', currentTime: 'Current time', message: 'Message', validUntil: 'You can answer until' },
    minutes: (count) => `${count} minutes`,
    statuses: { pending: 'Waiting for confirmation', confirmed: 'Confirmed', reschedule_requested: 'Change pending', rescheduled: 'Rescheduled', cancelled: 'Cancelled', completed: 'Completed', no_show: 'No show' },
    detailsLabel: 'BOOKING DETAILS',
    openBooking: 'View your booking',
    answerProposal: 'Answer the proposal',
    openAdmin: 'Open in the administration',
    fallback: 'If the button does not open, copy this address into your browser:',
    noteTitle: 'Good to know',
    changeHint: 'There you can also ask to cancel or move it.',
    customerFooter: 'This is an automatic message. If you have a question, reply to this email. If you did not make this booking, please say so in your reply.',
    ownerFooter: 'This notification comes from the website’s booking system.',
    received: {
      subject: (reference) => `We received your booking request — ${reference}`,
      title: 'We received your booking request',
      intro: (name) => `Hello ${name}, thank you. The time you chose is reserved for you, but the booking is not confirmed yet.`,
      next: 'You will get another email as soon as the booking is confirmed, or if it cannot go ahead. Until then you can follow its status with your personal link.',
    },
    confirmed: {
      subject: (reference) => `Your consultation is confirmed — ${reference}`,
      title: 'Your consultation is confirmed',
      intro: (name) => `Hello ${name}, your consultation is booked. The details are below.`,
      next: 'You can see your booking and its status at any time with the personal link below.',
    },
    newAdmin: {
      subject: (reference, name) => `New consultation booking (${reference}): ${name}`,
      title: (reference) => `New booking ${reference}`,
      introConfirmed: 'A consultation was booked on the website. The booking is confirmed.',
      introPending: 'A new booking request arrived on the website. It is waiting for your confirmation.',
    },
    changeReceived: {
      cancelSubject: (reference) => `We received your cancellation request — ${reference}`,
      cancelTitle: 'We received your cancellation request',
      cancelIntro: (name) => `Hello ${name}, we received your request to cancel this consultation. The booking stays as it is until the request is answered.`,
      moveSubject: (reference) => `We received your request to change the time — ${reference}`,
      moveTitle: 'We received your request to change the time',
      moveIntro: (name) => `Hello ${name}, we received your request to move this consultation to the new time below. While the request is open the new time is held for you, and the booking stays at its current time.`,
      next: 'We will let you know as soon as the request is answered. Until then you can follow it with your personal link.',
    },
    changeAdmin: {
      subject: (title, reference, name) => `${title} (${reference}): ${name}`,
      customerCancelOpen: { title: 'Cancellation requested', intro: 'The customer asked to cancel this booking. You can answer the request in the administration.' },
      customerMoveOpen: { title: 'Reschedule requested', intro: 'The customer asked to move this booking to the new time below. The new time is held until you answer the request.' },
      customerMoveApplied: { title: 'Booking moved by the customer', intro: 'As your settings allow, the customer moved this booking to the new time below themselves.' },
      proposalAccepted: { title: 'The customer accepted the new time', intro: 'The customer accepted the time you proposed, and the booking has moved.' },
      proposalDeclined: { title: 'The customer declined the new time', intro: 'The customer did not accept the time you proposed. The booking stays at its previous time.' },
    },
    rescheduled: {
      subject: (reference) => `Your consultation has a new time — ${reference}`,
      title: 'Your consultation has a new time',
      intro: (name) => `Hello ${name}, your consultation has been moved. The new time is below.`,
    },
    proposal: {
      subject: (reference) => `A new time is proposed for your consultation — ${reference}`,
      title: 'A new time is proposed',
      intro: (name) => `Hello ${name}, a new time is proposed for your consultation. Please open your booking and accept or decline it.`,
      next: 'Your booking stays at its current time until you accept the new one. If you do not answer in time the proposal lapses and nothing changes.',
    },
    declined: {
      subject: (reference) => `Your request could not be accepted — ${reference}`,
      cancelTitle: 'Your cancellation request was not accepted',
      moveTitle: 'Your request to change the time was not accepted',
      cancelIntro: (name) => `Hello ${name}, your request to cancel this consultation could not be accepted. Your booking is unchanged.`,
      moveIntro: (name) => `Hello ${name}, your request to move this consultation could not be accepted. Your booking stays at its previous time.`,
    },
    cancelled: {
      subject: (reference) => `Your consultation is cancelled — ${reference}`,
      title: 'Your consultation is cancelled',
      introCustomer: (name) => `Hello ${name}, as you asked, this consultation is cancelled.`,
      introOwner: (name) => `Hello ${name}, we are sorry: this consultation has been cancelled.`,
    },
    cancelledAdmin: {
      subject: (reference, name) => `Booking cancelled (${reference}): ${name}`,
      title: (reference) => `Booking cancelled ${reference}`,
      introCustomer: 'The customer cancelled this booking.',
      introOwner: 'This booking has been cancelled.',
    },
  },
  nl: {
    labels: { reference: 'Referentie', consultation: 'Adviesgesprek', when: 'Datum en tijd', duration: 'Duur', timeZone: 'Tijdzone', name: 'Naam', email: 'E-mail', company: 'Bedrijf', website: 'Website', description: 'Over het project', status: 'Status', newTime: 'Nieuwe tijd', previousTime: 'Eerdere tijd', currentTime: 'Huidige tijd', message: 'Bericht', validUntil: 'Je kunt reageren tot' },
    minutes: (count) => `${count} minuten`,
    statuses: { pending: 'Wacht op bevestiging', confirmed: 'Bevestigd', reschedule_requested: 'Wijziging in behandeling', rescheduled: 'Verplaatst', cancelled: 'Geannuleerd', completed: 'Afgerond', no_show: 'Niet verschenen' },
    detailsLabel: 'GEGEVENS VAN DE AFSPRAAK',
    openBooking: 'Afspraak bekijken',
    answerProposal: 'Op het voorstel reageren',
    openAdmin: 'Openen in het beheer',
    fallback: 'Opent de knop niet? Kopieer dan dit adres naar je browser:',
    noteTitle: 'Goed om te weten',
    changeHint: 'Daar kun je ook vragen om te annuleren of de tijd te verplaatsen.',
    customerFooter: 'Dit is een automatisch bericht. Heb je een vraag, antwoord dan op deze e-mail. Heb je deze afspraak niet zelf gemaakt, laat het ons dan weten in je antwoord.',
    ownerFooter: 'Deze melding komt van het afsprakensysteem van de website.',
    received: {
      subject: (reference) => `We hebben je aanvraag voor een afspraak ontvangen — ${reference}`,
      title: 'We hebben je aanvraag voor een afspraak ontvangen',
      intro: (name) => `Hallo ${name}, bedankt. De tijd die je koos is voor je gereserveerd, maar de afspraak is nog niet bevestigd.`,
      next: 'Je krijgt nog een e-mail zodra de afspraak is bevestigd, of als hij toch niet door kan gaan. Tot die tijd volg je de status met je persoonlijke link.',
    },
    confirmed: {
      subject: (reference) => `Je adviesgesprek is bevestigd — ${reference}`,
      title: 'Je adviesgesprek is bevestigd',
      intro: (name) => `Hallo ${name}, je adviesgesprek is ingepland. Hieronder staan de gegevens.`,
      next: 'Met de persoonlijke link hieronder bekijk je je afspraak en de status op elk moment.',
    },
    newAdmin: {
      subject: (reference, name) => `Nieuwe afspraak voor een adviesgesprek (${reference}): ${name}`,
      title: (reference) => `Nieuwe afspraak ${reference}`,
      introConfirmed: 'Er is via de website een adviesgesprek ingepland. De afspraak is bevestigd.',
      introPending: 'Er is via de website een nieuwe afspraak aangevraagd. Die wacht op jouw bevestiging.',
    },
    changeReceived: {
      cancelSubject: (reference) => `We hebben je verzoek om te annuleren ontvangen — ${reference}`,
      cancelTitle: 'We hebben je verzoek om te annuleren ontvangen',
      cancelIntro: (name) => `Hallo ${name}, we hebben je verzoek ontvangen om dit adviesgesprek te annuleren. De afspraak blijft zoals hij is totdat het verzoek is beantwoord.`,
      moveSubject: (reference) => `We hebben je verzoek om de tijd te wijzigen ontvangen — ${reference}`,
      moveTitle: 'We hebben je verzoek om de tijd te wijzigen ontvangen',
      moveIntro: (name) => `Hallo ${name}, we hebben je verzoek ontvangen om dit adviesgesprek naar de nieuwe tijd hieronder te verplaatsen. Zolang het verzoek openstaat, is de nieuwe tijd voor je vastgehouden en blijft de afspraak op de huidige tijd staan.`,
      next: 'We laten het je weten zodra het verzoek is beantwoord. Tot die tijd volg je het met je persoonlijke link.',
    },
    changeAdmin: {
      subject: (title, reference, name) => `${title} (${reference}): ${name}`,
      customerCancelOpen: { title: 'Verzoek om te annuleren', intro: 'De klant wil deze afspraak annuleren. Je kunt het verzoek in het beheer beantwoorden.' },
      customerMoveOpen: { title: 'Verzoek om te verplaatsen', intro: 'De klant wil deze afspraak naar de nieuwe tijd hieronder verplaatsen. De nieuwe tijd wordt vastgehouden totdat je het verzoek beantwoordt.' },
      customerMoveApplied: { title: 'Afspraak verplaatst door de klant', intro: 'Zoals je instellingen toestaan, heeft de klant deze afspraak zelf naar de nieuwe tijd hieronder verplaatst.' },
      proposalAccepted: { title: 'De klant heeft de nieuwe tijd geaccepteerd', intro: 'De klant heeft de tijd geaccepteerd die je voorstelde, en de afspraak is verplaatst.' },
      proposalDeclined: { title: 'De klant heeft de nieuwe tijd afgewezen', intro: 'De klant heeft de tijd die je voorstelde niet geaccepteerd. De afspraak blijft op de eerdere tijd staan.' },
    },
    rescheduled: {
      subject: (reference) => `Je adviesgesprek heeft een nieuwe tijd — ${reference}`,
      title: 'Je adviesgesprek heeft een nieuwe tijd',
      intro: (name) => `Hallo ${name}, je adviesgesprek is verplaatst. De nieuwe tijd staat hieronder.`,
    },
    proposal: {
      subject: (reference) => `We stellen een nieuwe tijd voor je adviesgesprek voor — ${reference}`,
      title: 'We stellen een nieuwe tijd voor',
      intro: (name) => `Hallo ${name}, we stellen een nieuwe tijd voor je adviesgesprek voor. Open je afspraak en accepteer of weiger het voorstel.`,
      next: 'Je afspraak blijft op de huidige tijd staan totdat je de nieuwe accepteert. Reageer je niet op tijd, dan vervalt het voorstel en verandert er niets.',
    },
    declined: {
      subject: (reference) => `Je verzoek kon niet worden gehonoreerd — ${reference}`,
      cancelTitle: 'Je verzoek om te annuleren is niet gehonoreerd',
      moveTitle: 'Je verzoek om de tijd te wijzigen is niet gehonoreerd',
      cancelIntro: (name) => `Hallo ${name}, je verzoek om dit adviesgesprek te annuleren kon niet worden gehonoreerd. Je afspraak is ongewijzigd.`,
      moveIntro: (name) => `Hallo ${name}, je verzoek om dit adviesgesprek te verplaatsen kon niet worden gehonoreerd. Je afspraak blijft op de eerdere tijd staan.`,
    },
    cancelled: {
      subject: (reference) => `Je adviesgesprek is geannuleerd — ${reference}`,
      title: 'Je adviesgesprek is geannuleerd',
      introCustomer: (name) => `Hallo ${name}, zoals je vroeg is dit adviesgesprek geannuleerd.`,
      introOwner: (name) => `Hallo ${name}, helaas is dit adviesgesprek geannuleerd.`,
    },
    cancelledAdmin: {
      subject: (reference, name) => `Afspraak geannuleerd (${reference}): ${name}`,
      title: (reference) => `Afspraak geannuleerd ${reference}`,
      introCustomer: 'De klant heeft deze afspraak geannuleerd.',
      introOwner: 'Deze afspraak is geannuleerd.',
    },
  },
}

export const bookingWords = (lang: Language): Words => W[lang]

// ---- rendering --------------------------------------------------------------------------------------------------------------------------

const cut = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

/** The rows every booking message starts with: what, when, how long, in which zone. */
function bookingRows(b: BookingMail, lang: Language, options: { owner?: boolean; withStatus?: boolean } = {}): Row[] {
  const w = W[lang]
  const when = whenText(b.startAt, b.endAt, b.timeZone, lang)
  const rows: Row[] = [
    { label: w.labels.reference, value: b.reference },
    { label: w.labels.consultation, value: b.typeName },
    { label: w.labels.when, value: `${when.date}\n${when.time}` },
    { label: w.labels.timeZone, value: when.zone },
    { label: w.labels.duration, value: w.minutes(String(b.durationMinutes)) },
  ]
  if (options.withStatus) rows.push({ label: w.labels.status, value: w.statuses[b.status] })
  if (options.owner) {
    rows.push({ label: w.labels.name, value: oneLine(b.name, 100) }, { label: w.labels.email, value: b.email })
    if (b.company) rows.push({ label: w.labels.company, value: oneLine(b.company, 120) })
    if (b.website) rows.push({ label: w.labels.website, value: b.website })
    if (b.description) rows.push({ label: w.labels.description, value: cut(b.description, 1500) })
  }
  return rows
}

function compose(lang: Language, brand: string, parts: { title: string; intro: string; rows: Row[]; note?: { title: string; text: string }; cta?: Cta; footer: string }): { text: string; html: string } {
  const w = W[lang]
  return { text: plain({ brand, ...parts }), html: layout({ lang, brand, preview: parts.title, detailsLabel: w.detailsLabel, ...parts }) }
}

const ctaOf = (lang: Language, label: string, url: string | null): Cta | undefined => (url ? { label, url, fallback: W[lang].fallback } : undefined)

/** The note printed in a message: the owner's words for the customer, only where the message is about that decision. */
const noteOf = (lang: Language, text: string | null): { title: string; text: string } | undefined => (text ? { title: W[lang].labels.message, text } : undefined)

export function renderBookingReceived(b: BookingMail, lang: Language, brand: string, manageUrl: string | null): Rendered {
  const w = W[lang]
  const parts = { title: w.received.title, intro: w.received.intro(oneLine(b.name, 60)), rows: bookingRows(b, lang), note: { title: w.noteTitle, text: w.received.next }, cta: ctaOf(lang, w.openBooking, manageUrl), footer: w.customerFooter }
  return { subject: w.received.subject(b.reference), preview: w.received.title, ...compose(lang, brand, parts) }
}

export function renderBookingConfirmed(b: BookingMail, lang: Language, brand: string, manageUrl: string | null): Rendered {
  const w = W[lang]
  const next = b.canRequestChange && manageUrl ? `${w.confirmed.next} ${w.changeHint}` : w.confirmed.next
  const parts = { title: w.confirmed.title, intro: w.confirmed.intro(oneLine(b.name, 60)), rows: bookingRows(b, lang), note: manageUrl ? { title: w.noteTitle, text: next } : undefined, cta: ctaOf(lang, w.openBooking, manageUrl), footer: w.customerFooter }
  return { subject: w.confirmed.subject(b.reference), preview: w.confirmed.title, ...compose(lang, brand, parts) }
}

export function renderBookingNewAdmin(b: BookingMail, lang: Language, brand: string, adminUrl: string | null): Rendered {
  const w = W[lang]
  const parts = { title: w.newAdmin.title(b.reference), intro: b.status === 'pending' ? w.newAdmin.introPending : w.newAdmin.introConfirmed, rows: bookingRows(b, lang, { owner: true, withStatus: true }), cta: ctaOf(lang, w.openAdmin, adminUrl), footer: w.ownerFooter }
  return { subject: w.newAdmin.subject(b.reference, oneLine(b.name, 60)), preview: parts.title, ...compose(lang, brand, parts) }
}

/** The booking's rows with the time a change is about: while a change is open the booking is still at its current time and the new one is shown next to it. */
function timeRows(b: BookingMail, change: ChangeMail, lang: Language): Row[] {
  const w = W[lang]
  const rows = bookingRows(b, lang)
  if (change.kind === 'reschedule' && change.status !== 'applied' && change.newStartAt && change.newEndAt) {
    const next = whenText(change.newStartAt, change.newEndAt, b.timeZone, lang)
    rows[2] = { label: w.labels.currentTime, value: rows[2].value }
    rows.splice(3, 0, { label: w.labels.newTime, value: `${next.date}
${next.time}` })
  }
  return rows
}

/** The customer's receipt for a request to cancel or move a booking. */
export function renderChangeReceived(b: BookingMail, change: ChangeMail, lang: Language, brand: string, manageUrl: string | null): Rendered {
  const w = W[lang].changeReceived
  const base = W[lang]
  const cancel = change.kind === 'cancel'
  const rows = [...timeRows(b, change, lang)]
  if (change.message) rows.push({ label: base.labels.message, value: cut(change.message, 600) })
  const title = cancel ? w.cancelTitle : w.moveTitle
  const parts = { title, intro: (cancel ? w.cancelIntro : w.moveIntro)(oneLine(b.name, 60)), rows, note: { title: base.noteTitle, text: w.next }, cta: ctaOf(lang, base.openBooking, manageUrl), footer: base.customerFooter }
  return { subject: (cancel ? w.cancelSubject : w.moveSubject)(b.reference), preview: title, ...compose(lang, brand, parts) }
}

/** The owner's message about a change: a request, a move the customer made themselves, or the customer's answer to a proposal. */
export function renderChangeAdmin(b: BookingMail, change: ChangeMail, lang: Language, brand: string, adminUrl: string | null): Rendered {
  const w = W[lang]
  const variant =
    change.initiator === 'owner' ? (change.status === 'applied' ? w.changeAdmin.proposalAccepted : w.changeAdmin.proposalDeclined)
    : change.kind === 'cancel' ? w.changeAdmin.customerCancelOpen
    : change.status === 'applied' ? w.changeAdmin.customerMoveApplied
    : w.changeAdmin.customerMoveOpen
  const rows = [...timeRows(b, change, lang), { label: w.labels.name, value: oneLine(b.name, 100) }, { label: w.labels.email, value: b.email }]
  if (change.message) rows.push({ label: w.labels.message, value: cut(change.message, 600) })
  const parts = { title: variant.title, intro: variant.intro, rows, cta: ctaOf(lang, w.openAdmin, adminUrl), footer: w.ownerFooter }
  return { subject: w.changeAdmin.subject(variant.title, b.reference, oneLine(b.name, 60)), preview: variant.title, ...compose(lang, brand, parts) }
}

/** The customer's confirmation that the booking moved (a request approved, a proposal accepted, or the owner's own move). */
export function renderBookingRescheduled(b: BookingMail, previous: { startAt: string; endAt: string } | null, lang: Language, brand: string, manageUrl: string | null, ownerNote: string | null): Rendered {
  const w = W[lang]
  const rows = bookingRows(b, lang)
  if (previous) {
    const was = whenText(previous.startAt, previous.endAt, b.timeZone, lang)
    rows.splice(3, 0, { label: w.labels.previousTime, value: `${was.date}\n${was.time}` })
  }
  const parts = { title: w.rescheduled.title, intro: w.rescheduled.intro(oneLine(b.name, 60)), rows, note: noteOf(lang, ownerNote), cta: ctaOf(lang, w.openBooking, manageUrl), footer: w.customerFooter }
  return { subject: w.rescheduled.subject(b.reference), preview: w.rescheduled.title, ...compose(lang, brand, parts) }
}

/** The owner's proposal of a new time, to the customer: it needs the link, because the answer is given on the page. */
export function renderBookingProposal(b: BookingMail, change: ChangeMail, lang: Language, brand: string, manageUrl: string, ownerNote: string | null): Rendered {
  const w = W[lang]
  const rows = timeRows(b, change, lang)
  if (change.expiresAt) {
    rows.push({ label: w.labels.validUntil, value: instantText(change.expiresAt, b.timeZone, lang) })
  }
  const parts = { title: w.proposal.title, intro: w.proposal.intro(oneLine(b.name, 60)), rows, note: ownerNote ? { title: w.labels.message, text: `${ownerNote}\n\n${w.proposal.next}` } : { title: w.noteTitle, text: w.proposal.next }, cta: ctaOf(lang, w.answerProposal, manageUrl), footer: w.customerFooter }
  return { subject: w.proposal.subject(b.reference), preview: w.proposal.title, ...compose(lang, brand, parts) }
}

/** The owner declined a request the customer made. */
export function renderChangeDeclined(b: BookingMail, change: ChangeMail, lang: Language, brand: string, manageUrl: string | null, ownerNote: string | null): Rendered {
  const w = W[lang]
  const cancel = change.kind === 'cancel'
  const title = cancel ? w.declined.cancelTitle : w.declined.moveTitle
  const parts = { title, intro: (cancel ? w.declined.cancelIntro : w.declined.moveIntro)(oneLine(b.name, 60)), rows: bookingRows(b, lang, { withStatus: true }), note: noteOf(lang, ownerNote), cta: ctaOf(lang, w.openBooking, manageUrl), footer: w.customerFooter }
  return { subject: w.declined.subject(b.reference), preview: title, ...compose(lang, brand, parts) }
}

/** The customer's confirmation that the booking is cancelled (by them, or by the owner, who may add a note). */
export function renderBookingCancelled(b: BookingMail, cancelledBy: 'customer' | 'owner', lang: Language, brand: string, manageUrl: string | null, ownerNote: string | null): Rendered {
  const w = W[lang]
  const intro = cancelledBy === 'customer' ? w.cancelled.introCustomer(oneLine(b.name, 60)) : w.cancelled.introOwner(oneLine(b.name, 60))
  const parts = { title: w.cancelled.title, intro, rows: bookingRows(b, lang, { withStatus: true }), note: noteOf(lang, ownerNote), cta: ctaOf(lang, w.openBooking, manageUrl), footer: w.customerFooter }
  return { subject: w.cancelled.subject(b.reference), preview: w.cancelled.title, ...compose(lang, brand, parts) }
}

export function renderBookingCancelledAdmin(b: BookingMail, cancelledBy: 'customer' | 'owner', lang: Language, brand: string, adminUrl: string | null): Rendered {
  const w = W[lang]
  const parts = { title: w.cancelledAdmin.title(b.reference), intro: cancelledBy === 'customer' ? w.cancelledAdmin.introCustomer : w.cancelledAdmin.introOwner, rows: bookingRows(b, lang, { owner: true, withStatus: true }), cta: ctaOf(lang, w.openAdmin, adminUrl), footer: w.ownerFooter }
  return { subject: w.cancelledAdmin.subject(b.reference, oneLine(b.name, 60)), preview: parts.title, ...compose(lang, brand, parts) }
}
