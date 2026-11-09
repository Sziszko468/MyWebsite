import { tri } from '../trilingual'

/**
 * What the screen says after a request was stored (PROMPT 17): the reference, when it arrived, what was sent, whether a confirmation
 * e-mail is on its way, and the private link to the request's status page. It claims only what the server's answer says: a request that is
 * saved is never described as lost because a mail could not be queued, and a mail that is queued is never described as delivered.
 */
export const receipt = {
  reference: tri('Hivatkozási szám', 'Reference number', 'Referentienummer'),
  referenceHint: tri('Ezt add meg, ha rákérdezel a kérésedre.', 'Quote this if you ask about your request.', 'Noem dit nummer als je naar je aanvraag vraagt.'),
  submitted: tri('Beküldve', 'Submitted', 'Ingediend'),
  summary: tri('A beküldött kérés', 'What you submitted', 'Wat je hebt ingediend'),
  emailQueued: tri(
    'Visszaigazoló e-mailt küldünk a megadott címre. Ha nem érkezik meg, nézd meg a levélszemét mappát is.',
    'We are sending a confirmation e-mail to the address you gave. If it does not arrive, check your spam folder too.',
    'We sturen een bevestigingsmail naar het opgegeven adres. Komt die niet aan, kijk dan ook in je spammap.',
  ),
  emailNotSent: tri(
    'A kérésed el van mentve, de visszaigazoló e-mailt most nem tudtunk küldeni. Őrizd meg a hivatkozási számot.',
    'Your request is saved, but a confirmation e-mail could not be sent right now. Keep your reference number.',
    'Je aanvraag is opgeslagen, maar een bevestigingsmail kon nu niet worden verstuurd. Bewaar je referentienummer.',
  ),
  statusLink: tri('A kérésem állapota', 'See the status of my request', 'De status van mijn aanvraag bekijken'),
  statusHint: tri(
    'Ez egy személyes, titkos link: csak te férsz hozzá vele. Ne oszd meg másokkal.',
    'This is a private link that only you have. Please do not share it.',
    'Dit is een persoonlijke, geheime link die alleen jij hebt. Deel hem niet met anderen.',
  ),
  noPayment: tri(
    'Ebben a szakaszban nem kérünk fizetést.',
    'No payment is asked for at this stage.',
    'In deze fase vragen we geen betaling.',
  ),
}
