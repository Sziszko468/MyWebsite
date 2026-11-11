import { tri } from '../trilingual'

/**
 * The customer's private pages (PROMPT 17), in three languages: the quotation (`/quote/<secret>`) and the status of a request
 * (`/request/<secret>`). The offer's own text (scope, terms, prices) is the administrator's and arrives from the server; everything here is the
 * page around it. Nothing on these pages promises an answer time, takes or implies a payment, or treats opening a link as agreeing to anything.
 */
export const quoteText = {
  meta: {
    quote: { title: tri('Ajánlat', 'Quote', 'Offerte'), description: tri('Személyes, titkos linkkel elérhető ajánlat: itt nézheted át, fogadhatod el vagy utasíthatod el.', 'A personal quote behind a secret link: read it here, accept it or decline it.', 'Een persoonlijke offerte achter een geheime link: bekijk, accepteer of wijs hem hier af.') },
    request: { title: tri('A kérésed állapota', 'Your request', 'Je aanvraag'), description: tri('A kérésed személyes állapotoldala: mit osztottunk meg veled, és hol tart.', 'The private status page of your request: what we shared with you, and where it stands.', 'De persoonlijke statuspagina van je aanvraag: wat we met je deelden en hoe het ervoor staat.') },
  },

  common: {
    loading: tri('Betöltés…', 'Loading…', 'Laden…'),
    retry: tri('Újrapróbálom', 'Try again', 'Opnieuw proberen'),
    privateNote: tri('Ez az oldal személyes: a címe titkos linkből áll. Kérlek, ne oszd meg másokkal.', 'This page is private: its address is a secret link. Please do not share it.', 'Deze pagina is privé: het adres is een geheime link. Deel hem alsjeblieft niet.'),
    home: tri('Vissza a főoldalra', 'Back to the home page', 'Terug naar de startpagina'),
    contact: tri('Kapcsolat', 'Contact', 'Contact'),
    reference: tri('Hivatkozási szám', 'Reference', 'Referentie'),
    date: tri('Dátum', 'Date', 'Datum'),
  },

  problems: {
    notFound: {
      title: tri('Ez a link nem érvényes', 'This link is not valid', 'Deze link is niet geldig'),
      text: tri(
        'Nem találjuk az oldalt. Ellenőrizd, hogy a teljes linket másoltad-e be az e-mailből. Ha továbbra sem működik, válaszolj az e-mailre, és segítünk.',
        'We cannot find this page. Check that you copied the whole link from the email. If it still does not work, reply to the email and we will help.',
        'We kunnen deze pagina niet vinden. Controleer of je de hele link uit de e-mail hebt gekopieerd. Werkt het nog niet, antwoord dan op de e-mail en we helpen je.',
      ),
    },
    expired: {
      title: tri('Ez a link lejárt', 'This link has expired', 'Deze link is verlopen'),
      text: tri('A biztonsági linkek egy ideig érvényesek. Válaszolj az e-mailre, és újat küldünk.', 'Secure links work for a limited time. Reply to the email and we will send you a new one.', 'Beveiligde links zijn maar een beperkte tijd geldig. Antwoord op de e-mail en we sturen je een nieuwe.'),
    },
    replaced: {
      title: tri('Ez a link már nem használható', 'This link no longer works', 'Deze link werkt niet meer'),
      text: tri(
        'Az ajánlatot azóta módosítottuk vagy visszavontuk. Keresd a legutóbbi e-mailünket: abban van a friss link.',
        'The quote has been changed or withdrawn since. Look for our most recent email: it has the current link.',
        'De offerte is sindsdien gewijzigd of ingetrokken. Zoek onze meest recente e-mail: daarin staat de actuele link.',
      ),
    },
    rateLimited: {
      title: tri('Túl sok próbálkozás', 'Too many attempts', 'Te veel pogingen'),
      text: tri('Várj néhány percet, és próbáld újra.', 'Please wait a few minutes and try again.', 'Wacht een paar minuten en probeer het opnieuw.'),
    },
    network: {
      title: tri('Nem sikerült betölteni', 'Could not load this page', 'Laden is niet gelukt'),
      text: tri('Ellenőrizd a kapcsolatot, és próbáld újra. Nem történt változás.', 'Check your connection and try again. Nothing has changed.', 'Controleer je verbinding en probeer het opnieuw. Er is niets veranderd.'),
    },
    incomplete: {
      title: tri('Hiányos link', 'Incomplete link', 'Onvolledige link'),
      text: tri('Ehhez az oldalhoz a teljes, személyes linkre van szükség, amit e-mailben kaptál.', 'This page needs the full personal link you received by email.', 'Voor deze pagina heb je de volledige persoonlijke link uit je e-mail nodig.'),
    },
    notAvailable: tri('Az online felület most nem érhető el.', 'The online service is not available right now.', 'De online dienst is nu niet beschikbaar.'),
  },

  quote: {
    eyebrow: tri('Ajánlat', 'Quote', 'Offerte'),
    forCustomer: tri('Neki készült: {name}', 'Prepared for {name}', 'Opgesteld voor {name}'),
    version: tri('Verzió', 'Version', 'Versie'),
    sentOn: tri('Elküldve', 'Sent', 'Verstuurd'),
    validUntil: tri('Érvényes eddig', 'Valid until', 'Geldig tot'),
    timeline: tri('Becsült időkeret', 'Estimated timeline', 'Geschatte doorlooptijd'),
    sections: {
      understanding: tri('A projekt, ahogy értjük', 'Our understanding of the project', 'Ons begrip van het project'),
      scope: tri('A munka tartalma', 'Scope of work', 'Reikwijdte van het werk'),
      deliverables: tri('Amit átadunk', 'Deliverables', 'Op te leveren'),
      exclusions: tri('Ami nem része az ajánlatnak', 'Not included', 'Niet inbegrepen'),
      price: tri('Árak', 'Price breakdown', 'Prijsopbouw'),
      payment: tri('Fizetési feltételek', 'Payment terms', 'Betalingsvoorwaarden'),
      notes: tri('Megjegyzések', 'Notes', 'Opmerkingen'),
      terms: tri('Feltételek', 'Terms and conditions', 'Voorwaarden'),
    },
    price: {
      item: tri('Tétel', 'Item', 'Onderdeel'),
      quantity: tri('Menny.', 'Qty', 'Aantal'),
      unit: tri('Egységár', 'Unit price', 'Stukprijs'),
      amount: tri('Összeg', 'Amount', 'Bedrag'),
      subtotal: tri('Részösszeg', 'Subtotal', 'Subtotaal'),
      discount: tri('Kedvezmény', 'Discount', 'Korting'),
      discountReason: tri('Indoklás: {reason}', 'Reason: {reason}', 'Reden: {reason}'),
      total: tri('Összesen', 'Total', 'Totaal'),
      optionalTitle: tri('Választható kiegészítők', 'Optional add-ons', 'Optionele extra’s'),
      optionalNote: tri('Nem része az összegnek; ha érdekel, szólj.', 'Not part of the total; tell us if you are interested.', 'Niet in het totaal; laat het weten als je interesse hebt.'),
      fixed: tri('Átalányár', 'Fixed price', 'Vaste prijs'),
      custom: tri('Az ár leírása', 'How the price works', 'Hoe de prijs werkt'),
      tax: {
        excluded: tri('Az árak áfa nélkül értendők.', 'Prices exclude VAT.', 'Prijzen zijn exclusief btw.'),
        included: tri('Az árak áfát tartalmaznak.', 'Prices include VAT.', 'Prijzen zijn inclusief btw.'),
        exempt: tri('Áfamentes.', 'VAT exempt.', 'Vrijgesteld van btw.'),
        unspecified: tri('', '', ''),
        amount: tri('Áfa ({rate} %)', 'VAT ({rate} %)', 'Btw ({rate} %)'),
        amountIncluded: tri('Ebből áfa ({rate} %)', 'Of which VAT ({rate} %)', 'Waarvan btw ({rate} %)'),
      },
    },
    status: {
      accepted: tri('Ezt az ajánlatot elfogadtad ekkor: {date}. Köszönjük!', 'You accepted this quote on {date}. Thank you!', 'Je hebt deze offerte geaccepteerd op {date}. Bedankt!'),
      acceptedNote: tri('Hamarosan jelentkezünk a projekt indításáról. Az elfogadás nem számla, és ezen az oldalon nem történt fizetés.', 'We will be in touch soon about starting the project. Accepting is not an invoice, and no payment was made on this page.', 'We nemen binnenkort contact op over de start van het project. Acceptatie is geen factuur en op deze pagina is niet betaald.'),
      declined: tri('Ezt az ajánlatot elutasítottad ekkor: {date}. Köszönjük, hogy átnézted.', 'You declined this quote on {date}. Thank you for looking at it.', 'Je hebt deze offerte afgewezen op {date}. Bedankt voor het bekijken.'),
      expired: tri('Ez az ajánlat lejárt ({date}), már nem fogadható el. Kérhetsz újat.', 'This offer expired on {date} and can no longer be accepted. You can ask for a new one.', 'Dit voorstel is verlopen op {date} en kan niet meer worden geaccepteerd. Je kunt om een nieuw voorstel vragen.'),
    },
    actions: {
      heading: tri('Mit szeretnél tenni?', 'What would you like to do?', 'Wat wil je doen?'),
      intro: tri('Az oldal megnyitása vagy az e-mail elolvasása nem jelent elfogadást. Csak akkor döntünk, ha te megerősíted.', 'Opening this page or reading the email is not an acceptance. Nothing is decided until you confirm it.', 'Deze pagina openen of de e-mail lezen is geen acceptatie. Er wordt niets besloten tot jij het bevestigt.'),
      accept: tri('Elfogadom az ajánlatot', 'Accept the quote', 'Offerte accepteren'),
      decline: tri('Elutasítom', 'Decline', 'Afwijzen'),
      revise: tri('Kérdésem vagy módosítási kérésem van', 'I have a question or a change', 'Ik heb een vraag of wijziging'),
      cancel: tri('Mégsem', 'Cancel', 'Annuleren'),
      acceptTitle: tri('Az ajánlat elfogadása', 'Accept this quote', 'Deze offerte accepteren'),
      acceptText: tri(
        'Az elfogadással megerősíted, hogy elolvastad az ajánlatot és a feltételeket, és a leírtak szerint egyetértesz vele. Az elfogadás nem fizetés: ezen az oldalon nem történik fizetés.',
        'By accepting you confirm that you have read the quote and its terms and agree to it as described. Accepting is not a payment: no payment is taken on this page.',
        'Door te accepteren bevestig je dat je de offerte en de voorwaarden hebt gelezen en ermee akkoord gaat zoals beschreven. Accepteren is geen betaling: op deze pagina wordt niet betaald.',
      ),
      acceptConfirm: tri('Elolvastam az ajánlatot és a feltételeket, és elfogadom.', 'I have read the quote and its terms, and I accept it.', 'Ik heb de offerte en de voorwaarden gelezen en ik accepteer ze.'),
      acceptSubmit: tri('Elfogadás megerősítése', 'Confirm acceptance', 'Acceptatie bevestigen'),
      declineTitle: tri('Az ajánlat elutasítása', 'Decline this quote', 'Deze offerte afwijzen'),
      declineText: tri('Az elutasítást rögzítjük, és értesítjük az ajánlat készítőjét.', 'We will record this and let the author of the quote know.', 'We leggen dit vast en laten de opsteller van de offerte het weten.'),
      declineReason: tri('Elmondod, miért? (nem kötelező)', 'Would you tell us why? (optional)', 'Wil je zeggen waarom? (optioneel)'),
      declineConfirm: tri('Biztosan elutasítom ezt az ajánlatot.', 'I am sure I want to decline this quote.', 'Ik weet zeker dat ik deze offerte wil afwijzen.'),
      declineSubmit: tri('Elutasítás megerősítése', 'Confirm decline', 'Afwijzing bevestigen'),
      reviseTitle: tri('Pontosítás vagy módosítás kérése', 'Ask for clarification or a change', 'Om toelichting of een wijziging vragen'),
      reviseText: tri('Írd le, mit szeretnél tudni vagy módosítani. Az ajánlat nem változik magától: ha kell, új verziót küldünk.', 'Tell us what you would like to know or change. The quote does not change by itself: if needed we will send a new version.', 'Vertel wat je wilt weten of wijzigen. De offerte verandert niet vanzelf: indien nodig sturen we een nieuwe versie.'),
      reviseMessage: tri('Az üzeneted', 'Your message', 'Je bericht'),
      reviseSubmit: tri('Üzenet küldése', 'Send the message', 'Bericht versturen'),
      sending: tri('Küldés…', 'Sending…', 'Versturen…'),
    },
    done: {
      accepted: tri('Rögzítettük az elfogadást', 'Your acceptance is recorded', 'Je acceptatie is vastgelegd'),
      acceptedText: tri('Visszaigazoló e-mailt küldünk. A projekt indításáról külön egyeztetünk.', 'We are sending a confirmation email. We will agree on how the project starts separately.', 'We sturen een bevestigingsmail. Over de start van het project maken we apart afspraken.'),
      declined: tri('Rögzítettük az elutasítást', 'Your decision is recorded', 'Je beslissing is vastgelegd'),
      declinedText: tri('Köszönjük, hogy átnézted. Ha meggondolod magad, válaszolj az e-mailre.', 'Thank you for looking at it. If you change your mind, reply to the email.', 'Bedankt voor het bekijken. Bedenk je je, antwoord dan op de e-mail.'),
      revised: tri('Az üzeneted megérkezett', 'Your message has arrived', 'Je bericht is aangekomen'),
      revisedText: tri('Átnézzük, és ha kell, új verziót küldünk. Addig az eredeti ajánlat változatlan.', 'We will look at it and, if needed, send a new version. Until then the original quote stays as it is.', 'We bekijken het en sturen indien nodig een nieuwe versie. Tot dan blijft de oorspronkelijke offerte zoals ze is.'),
    },
    errors: {
      confirm: tri('A folytatáshoz jelöld be a négyzetet.', 'Tick the box to continue.', 'Vink het vakje aan om door te gaan.'),
      message: tri('Írj néhány szót (legalább 3 karakter).', 'Write a few words (at least 3 characters).', 'Schrijf een paar woorden (minstens 3 tekens).'),
      tooLong: tri('Ez túl hosszú.', 'This is too long.', 'Dit is te lang.'),
      alreadyUsed: tri('Ezt a műveletet már végrehajtottuk.', 'This action has already been carried out.', 'Deze actie is al uitgevoerd.'),
      alreadyDecided: tri('Erről az ajánlatról már döntés született.', 'This quote has already been decided.', 'Over deze offerte is al beslist.'),
      quoteExpired: tri('Ez az ajánlat lejárt, már nem fogadható el.', 'This offer has expired and can no longer be accepted.', 'Dit voorstel is verlopen en kan niet meer worden geaccepteerd.'),
      generic: tri('Nem sikerült. Nem történt változás: töltsd újra az oldalt, és próbáld újra.', 'That did not work. Nothing has changed: reload the page and try again.', 'Dat is niet gelukt. Er is niets veranderd: laad de pagina opnieuw en probeer het nog eens.'),
      needsReload: tri('Töltsd újra az oldalt, és próbáld újra.', 'Reload the page and try again.', 'Laad de pagina opnieuw en probeer het nog eens.'),
    },
  },

  request: {
    eyebrow: tri('Kérés', 'Request', 'Aanvraag'),
    title: tri('A kérésed állapota', 'The status of your request', 'De status van je aanvraag'),
    received: tri('Beérkezett', 'Received', 'Ontvangen'),
    statusLabel: tri('Jelenlegi állapot', 'Current status', 'Huidige status'),
    updates: tri('Frissítések', 'Updates', 'Updates'),
    noUpdates: tri('Még nincs frissítés.', 'No updates yet.', 'Nog geen updates.'),
    quotations: tri('Ajánlat', 'Quote', 'Offerte'),
    open: tri('Az ajánlat megnyitása', 'Open the quote', 'Offerte openen'),
    version: tri('{version}. verzió', 'Version {version}', 'Versie {version}'),
    states: {
      open: tri('Válaszra vár', 'Waiting for your decision', 'Wacht op jouw beslissing'),
      expired: tri('Lejárt', 'Expired', 'Verlopen'),
      accepted: tri('Elfogadva', 'Accepted', 'Geaccepteerd'),
      declined: tri('Elutasítva', 'Declined', 'Afgewezen'),
      superseded: tri('Újabb verzió váltotta', 'Replaced by a newer version', 'Vervangen door een nieuwere versie'),
      withdrawn: tri('Visszavonva', 'Withdrawn', 'Ingetrokken'),
    },
    statuses: {
      new: tri('Beérkezett', 'Received', 'Ontvangen'),
      under_review: tri('Áttekintés alatt', 'Being reviewed', 'In beoordeling'),
      waiting_customer: tri('Válaszodra várunk', 'Waiting for your reply', 'Wacht op jouw reactie'),
      quote_preparation: tri('Az ajánlat készül', 'Quote being prepared', 'Offerte wordt opgesteld'),
      quote_sent: tri('Ajánlat elküldve', 'Quote sent', 'Offerte verstuurd'),
      accepted: tri('Elfogadva', 'Accepted', 'Geaccepteerd'),
      declined: tri('Elutasítva', 'Declined', 'Afgewezen'),
      in_progress: tri('Folyamatban', 'In progress', 'In uitvoering'),
      completed: tri('Befejezve', 'Completed', 'Afgerond'),
      cancelled: tri('Lemondva', 'Cancelled', 'Geannuleerd'),
    },
    notice: tri(
      'Itt csak azt látod, amit megosztottunk veled. Nem ígérünk válaszidőt, és ezen az oldalon nem kérünk fizetést.',
      'You only see here what we shared with you. We do not promise an answer time, and no payment is asked for on this page.',
      'Hier zie je alleen wat we met je hebben gedeeld. We beloven geen reactietijd en op deze pagina wordt niet om betaling gevraagd.',
    ),
  },
}
