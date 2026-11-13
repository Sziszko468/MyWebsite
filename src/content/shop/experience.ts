import { tri } from '../trilingual'

/**
 * The words around FULL EXPERIENCE: its page, its configurator's frame (steps, buttons, the description and contact steps, the
 * result) and the flagship band on the services page. What the offer SAYS (headline, stages, components, the configurator's
 * questions and options, the FAQ) is data the administrator edits (content/shop/fullExperience.ts); this is the interface's own
 * wording. Starting copy for the owner to confirm; read through `useShopText().experience`.
 */

export const experience = {
  /** The flagship band on the services page. */
  band: {
    kicker: tri('Zászlóshajó ajánlat', 'The flagship offer', 'Het vlaggenschip'),
    note: tri('Nem csomag és nincs ára: egyedi ajánlat.', 'Not a package and it has no price: a custom quote.', 'Geen pakket en het heeft geen prijs: een offerte op maat.'),
    stagesLabel: tri('Fejlesztési szakaszok', 'Development stages', 'Ontwikkelfasen'),
    moreStages: tri('+{count} további szakasz', '+{count} more stages', '+{count} andere fasen'),
  },
  page: {
    includedTitle: tri('Amit a FULL EXPERIENCE tartalmazhat', 'What FULL EXPERIENCE can include', 'Wat FULL EXPERIENCE kan omvatten'),
    includedIntro: tri(
      'Egy projekt teljes életútja a feltárástól az éles indulásig. Nem minden projekthez kell minden szakasz: a terjedelem a te követelményeidhez igazodik.',
      'The whole life of a project, from discovery to launch. Not every project needs every stage: the scope follows your requirements.',
      'De hele levensloop van een project, van verkenning tot livegang. Niet elk project heeft elke fase nodig: de omvang volgt jouw wensen.',
    ),
    stage: tri('{n}. szakasz', 'Stage {n}', 'Fase {n}'),
    componentsTitle: tri('Választható összetevők', 'Optional components', 'Optionele onderdelen'),
    componentsIntro: tri('Azt építjük meg, amire a projektnek szüksége van, nem többet.', 'We build what the project needs, and no more.', 'We bouwen wat het project nodig heeft, niet meer.'),
    customTitle: tri('Egyedi ajánlat, nem árlista', 'A custom quote, not a price list', 'Een offerte op maat, geen prijslijst'),
    customText: tri(
      'A FULL EXPERIENCE-nek nincs feltüntetett ára, mert az ajánlat a követelményeid ismeretében készül. Töltsd ki a rövid kérdőívet, és személyre szabott javaslatot kapsz.',
      'FULL EXPERIENCE has no price shown, because the quote is written once your requirements are known. Answer a few short questions and you get a tailored proposal.',
      'FULL EXPERIENCE heeft geen getoonde prijs, omdat de offerte wordt opgesteld als jouw wensen bekend zijn. Beantwoord een paar korte vragen en je krijgt een voorstel op maat.',
    ),
    howTitle: tri('Hogyan működik', 'How it works', 'Hoe het werkt'),
    how: [
      tri('Válaszolsz néhány rövid kérdésre, a nem kötelezőket kihagyhatod.', 'You answer a few short questions; the optional ones can be skipped.', 'Je beantwoordt een paar korte vragen; de optionele kun je overslaan.'),
      tri('Leírod az ötletet a saját szavaiddal, és megadod az elérhetőségedet.', 'You describe the idea in your own words and leave your contact details.', 'Je beschrijft het idee in je eigen woorden en laat je contactgegevens achter.'),
      tri('Áttekintjük a válaszaidat, és személyre szabott javaslattal jelentkezünk. Az ajánlatkérés semmire nem köt.', 'We go through your answers and come back with a tailored proposal. Asking commits you to nothing.', 'We bekijken je antwoorden en komen terug met een voorstel op maat. Een aanvraag verplicht tot niets.'),
    ],
    faqTitle: tri('Kérdések a FULL EXPERIENCE-ről', 'Questions about FULL EXPERIENCE', 'Vragen over FULL EXPERIENCE'),
    finalTitle: tri('Van egy ötleted? Építsük meg nulláról.', 'Have an idea? Let’s build it from zero.', 'Heb je een idee? Laten we het vanaf nul bouwen.'),
    finalText: tri('Néhány rövid kérdés, és tudjuk, hol kezdjük. Semmire nem kötelez.', 'A few short questions and we know where to start. It commits you to nothing.', 'Een paar korte vragen en we weten waar we beginnen. Het verplicht tot niets.'),
    alsoPackages: tri('Inkább egy kész csomagból indulnál?', 'Would you rather start from a ready-made package?', 'Begin je liever met een kant-en-klaar pakket?'),
    seePackages: tri('Csomagok megtekintése', 'See the packages', 'Bekijk de pakketten'),
  },
  /** The configurator. */
  start: {
    title: tri('A projekted összeállítása', 'Set up your project', 'Stel je project samen'),
    progress: tri('{n}. lépés / {total}', 'Step {n} of {total}', 'Stap {n} van {total}'),
    progressLabel: tri('Haladás', 'Progress', 'Voortgang'),
    optional: tri('nem kötelező', 'optional', 'optioneel'),
    required: tri('Válassz egy lehetőséget a folytatáshoz.', 'Choose an option to continue.', 'Kies een optie om verder te gaan.'),
    chooseOne: tri('Válassz egyet', 'Choose one', 'Kies er één'),
    chooseAny: tri('Több is választható', 'Choose any that apply', 'Kies wat van toepassing is'),
    selectedCount: tri('{count} kiválasztva', '{count} selected', '{count} gekozen'),
    skip: tri('Kihagyás', 'Skip', 'Overslaan'),
    next: tri('Tovább', 'Next', 'Volgende'),
    back: tri('Vissza', 'Back', 'Terug'),
    descriptionTitle: tri('Meséld el az ötletet', 'Tell us about the idea', 'Vertel over het idee'),
    descriptionLabel: tri('A projekt leírása', 'Project description', 'Projectbeschrijving'),
    descriptionHint: tri('Saját szavaiddal: mit szeretnél létrehozni, kinek, és mi a legfontosabb benne?', 'In your own words: what do you want to create, for whom, and what matters most?', 'In je eigen woorden: wat wil je maken, voor wie en wat is het belangrijkst?'),
    descriptionCount: tri('{count} / {max} karakter', '{count} / {max} characters', '{count} / {max} tekens'),
    contactTitle: tri('Hogyan érünk el?', 'How can we reach you?', 'Hoe bereiken we je?'),
    name: tri('Neved', 'Your name', 'Je naam'),
    email: tri('E-mail-címed', 'Your email address', 'Je e-mailadres'),
    emailHint: tri('Erre a címre válaszolunk.', 'This is where we reply.', 'Hier antwoorden we.'),
    company: tri('Cég neve', 'Company name', 'Bedrijfsnaam'),
    website: tri('A cég weboldala', 'Company website', 'Website van het bedrijf'),
    websiteHint: tri('Például: pelda.hu', 'For example: example.com', 'Bijvoorbeeld: voorbeeld.nl'),
    marketing: tri(
      'Szívesen hallanék rólatok más újdonságokról is. (Nem kötelező; az ajánlatkéréstől független.)',
      'I would also like to hear from you about other news. (Optional; separate from the quote request.)',
      'Ik hoor graag ook van jullie over ander nieuws. (Optioneel; los van de offerteaanvraag.)',
    ),
    preferredLanguage: tri('Milyen nyelven válaszoljunk?', 'Which language should we reply in?', 'In welke taal antwoorden we?'),
    languages: { hu: tri('Magyar', 'Hungarian', 'Hongaars'), en: tri('Angol', 'English', 'Engels'), nl: tri('Holland', 'Dutch', 'Nederlands') },
    consent: tri('Tudomásul veszem, hogy a megadott adataimat az ajánlat elkészítéséhez használják fel.', 'I understand that my details are used to prepare the quote.', 'Ik begrijp dat mijn gegevens worden gebruikt om de offerte op te stellen.'),
    privacy: tri('Adatkezelési tájékoztató', 'Privacy notice', 'Privacyverklaring'),
    memory: tri('A válaszaid csak ebben a lapban maradnak meg, amíg el nem küldöd őket.', 'Your answers stay on this page only, until you send them.', 'Je antwoorden blijven alleen op deze pagina staan, tot je ze verstuurt.'),
    reviewTitle: tri('A válaszaid', 'Your answers', 'Je antwoorden'),
    // PROMPT 20: the project size guide, a planning aid (shop/fullExperience/estimate.ts).
    size: {
      title: tri('Mekkorának látszik a projekt?', 'How big the project looks', 'Hoe groot het project lijkt'),
      levels: {
        basic: {
          name: tri('Alap', 'Basic', 'Basis'),
          text: tri('Egy kicsi, áttekinthető projekt.', 'A small, clear project.', 'Een klein, overzichtelijk project.'),
        },
        moderate: {
          name: tri('Közepes', 'Moderate', 'Gemiddeld'),
          text: tri('Egy projekt néhány kiegészítő résszel.', 'A project with a few extra parts.', 'Een project met een paar extra onderdelen.'),
        },
        advanced: {
          name: tri('Összetett', 'Advanced', 'Uitgebreid'),
          text: tri('Nagyobb projekt, több egymással összefüggő résszel.', 'A larger project with several parts that work together.', 'Een groter project met meerdere onderdelen die samenwerken.'),
        },
        custom: {
          name: tri('Egyedi', 'Custom', 'Maatwerk'),
          text: tri('Nagy vagy szokatlan projekt. Közösen tervezzük meg veled.', 'A large or unusual project. We will plan it together with you.', 'Een groot of ongewoon project. We plannen het samen met je.'),
        },
      },
      note: tri(
        'Ez egy durva segédlet a tervezéshez a válaszaid alapján. Nem ajánlat. A végleges terjedelmet és az árat azután döntjük el, hogy átnéztük a projektedet.',
        'This is a rough guide for our planning, based on your answers. It is not a quote. We decide the final scope and the price after we have looked at your project.',
        'Dit is een grove richtlijn voor onze planning, op basis van je antwoorden. Het is geen offerte. De uiteindelijke omvang en de prijs bepalen we nadat we je project hebben bekeken.',
      ),
    },
    reviewSkipped: tri('kihagyva', 'skipped', 'overgeslagen'),
    change: tri('Módosítás', 'Change', 'Wijzigen'),
    changeAnswer: tri('{title}: módosítás', 'Change: {title}', 'Wijzigen: {title}'),
    notPurchase: tri(
      'A kérés elküldése nem jelenti azt, hogy megvásároltál egy szolgáltatást. Átnézzük, mire van szükséged, és személyre szabott ajánlatot készítünk.',
      'Sending this request does not mean you have bought a service. We will look at what you need and prepare a quote made for you.',
      'Het versturen van deze aanvraag betekent niet dat je een dienst hebt gekocht. We bekijken wat je nodig hebt en maken een offerte op maat.',
    ),
    send: tri('Ajánlatkérés küldése', 'Send the request', 'Aanvraag versturen'),
    sending: tri('Küldés…', 'Sending…', 'Versturen…'),
    prepare: tri('Összefoglaló elkészítése', 'Prepare the summary', 'Samenvatting voorbereiden'),
    errors: {
      required: tri('Ez a mező kötelező.', 'This field is required.', 'Dit veld is verplicht.'),
      tooShort: tri('Ez túl rövid: legalább {min} karakter kell.', 'This is too short: at least {min} characters.', 'Dit is te kort: minstens {min} tekens.'),
      tooLong: tri('Ez túl hosszú: legfeljebb {max} karakter lehet.', 'This is too long: at most {max} characters.', 'Dit is te lang: hoogstens {max} tekens.'),
      invalidEmail: tri('Ez nem tűnik érvényes e-mail-címnek.', 'This does not look like a valid email address.', 'Dit lijkt geen geldig e-mailadres.'),
      invalidUrl: tri('Ez nem tűnik weboldal-címnek. Például: pelda.hu', 'This does not look like a website address. For example: example.com', 'Dit lijkt geen websiteadres. Bijvoorbeeld: voorbeeld.nl'),
      consentRequired: tri('A küldéshez el kell fogadnod.', 'Please tick this to send.', 'Vink dit aan om te versturen.'),
    },
    sent: {
      title: tri('Megkaptuk a kérésedet', 'We have your request', 'We hebben je aanvraag'),
      text: tri('Köszönjük! A kérésed megérkezett és el van mentve. Átnézzük a válaszaidat, és a megadott e-mail-címen jelentkezünk.', 'Thank you! Your request has arrived and is saved. We will go through your answers and get back to you at the email address you gave.', 'Bedankt! Je aanvraag is aangekomen en opgeslagen. We bekijken je antwoorden en nemen contact met je op via het e-mailadres dat je opgaf.'),
      again: tri('Új kérés indítása', 'Start another request', 'Nog een aanvraag starten'),
      home: tri('Vissza a szolgáltatásokhoz', 'Back to the services', 'Terug naar de diensten'),
    },
    failed: {
      title: tri('A kérés nem ment el', 'The request was not sent', 'De aanvraag is niet verstuurd'),
      network: tri('Nem sikerült kapcsolódni. A válaszaid megvannak: próbáld újra.', 'We could not connect. Your answers are still here: try again.', 'Verbinden is niet gelukt. Je antwoorden staan er nog: probeer het opnieuw.'),
      timeout: tri('A küldés túl sokáig tartott. A válaszaid megvannak: próbáld újra.', 'Sending took too long. Your answers are still here: try again.', 'Het versturen duurde te lang. Je antwoorden staan er nog: probeer het opnieuw.'),
      rejected: tri('A kérést nem fogadtuk el. Nézd át a válaszaidat, és próbáld újra.', 'The request was not accepted. Check your answers and try again.', 'De aanvraag is niet geaccepteerd. Controleer je antwoorden en probeer het opnieuw.'),
    },
    unavailable: {
      title: tri('Az online küldés még nincs bekötve', 'Online sending is not connected yet', 'Online versturen is nog niet gekoppeld'),
      text: tri('A kérdőívet kitöltheted, de a kérés most nem tud elmenni erről az oldalról. Az összefoglalót kimásolhatod.', 'You can go through the questions, but the request cannot leave this page right now. You can copy the summary.', 'Je kunt de vragen doorlopen, maar de aanvraag kan deze pagina nu niet verlaten. Je kunt de samenvatting kopiëren.'),
      copy: tri('Összefoglaló másolása', 'Copy the summary', 'Samenvatting kopiëren'),
      copied: tri('Kimásolva.', 'Copied.', 'Gekopieerd.'),
      copyFailed: tri('A másolás nem sikerült: jelöld ki a szöveget, és másold kézzel.', 'Copying failed: select the text and copy it yourself.', 'Kopiëren is mislukt: selecteer de tekst en kopieer die zelf.'),
      mail: tri('E-mail megnyitása', 'Open an email', 'E-mail openen'),
      mailNote: tri('Az e-mail csak akkor megy el, ha te elküldöd.', 'The email only leaves when you send it.', 'De e-mail vertrekt pas als jij hem verstuurt.'),
      subject: tri('FULL EXPERIENCE ajánlatkérés', 'FULL EXPERIENCE quote request', 'FULL EXPERIENCE offerteaanvraag'),
    },
    summaryHeading: tri('A kérésed összefoglalója', 'Your request summary', 'Samenvatting van je aanvraag'),
    summaryDescription: tri('Leírás', 'Description', 'Beschrijving'),
    summaryContact: tri('Elérhetőség', 'Contact', 'Contact'),
  },
}
