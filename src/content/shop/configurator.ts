import { tri } from '../trilingual'

/** The request builder (/services/configure): six steps from "what do you need" to "request the quote". */

export const configurator = {
  eyebrow: tri('Összeállító', 'Request builder', 'Aanvraagbouwer'),
  title: tri('Állítsd össze a kérésed', 'Build your request', 'Stel je aanvraag samen'),
  intro: tri(
    'Hat rövid lépés. Semmi nem kötelez: az ajánlatkérés nem megrendelés. A választásaid megmaradnak, ha visszalépsz, nyelvet váltasz vagy máshová kattintasz.',
    'Six short steps. Nothing commits you: asking for a quote is not placing an order. Your choices are kept if you go back, change language or click elsewhere.',
    'Zes korte stappen. Niets verplicht je: een offerte aanvragen is geen bestelling. Je keuzes blijven bewaard als je teruggaat, van taal wisselt of ergens anders klikt.',
  ),

  progressLabel: tri('A lépések', 'The steps', 'De stappen'),
  stepOf: tri('{current}. lépés / {total}', 'Step {current} of {total}', 'Stap {current} van {total}'),
  stepDone: tri('kész', 'done', 'klaar'),
  stepCurrent: tri('jelenlegi lépés', 'current step', 'huidige stap'),
  steps: {
    need: tri('Igény', 'Need', 'Behoefte'),
    plan: tri('Csomag', 'Package', 'Pakket'),
    extras: tri('Kiegészítők', 'Extras', 'Toevoegingen'),
    details: tri('Részletek', 'Details', 'Details'),
    review: tri('Áttekintés', 'Review', 'Overzicht'),
    send: tri('Ajánlatkérés', 'Request', 'Aanvraag'),
  },
  titles: {
    need: tri('Mire van szükséged?', 'What do you need?', 'Wat heb je nodig?'),
    plan: tri('Válassz csomagot', 'Choose a package', 'Kies een pakket'),
    extras: tri('Válassz kiegészítőket', 'Select additional services', 'Kies extra diensten'),
    details: tri('Mesélj a projektről', 'Tell me about the project', 'Vertel over het project'),
    review: tri('Nézd át a kérésed', 'Review your request', 'Bekijk je aanvraag'),
    send: tri('Kérd az ajánlatot', 'Request your quote', 'Vraag je offerte aan'),
  },
  help: {
    need: tri(
      'Jelölj be mindent, ami igaz. Később bármikor módosíthatod.',
      'Pick everything that applies. You can change it later.',
      'Kies alles wat van toepassing is. Je kunt het later altijd wijzigen.',
    ),
    plan: tri(
      'Nem biztos? Válaszd az Egyedi projektet: a megfelelő formát együtt találjuk meg.',
      'Not sure? Choose Custom project: we will find the right shape together.',
      'Niet zeker? Kies Maatwerkproject: we vinden samen de juiste vorm.',
    ),
    extras: tri(
      'Mind nem kötelező. Csak azok a kiegészítők jelennek meg, amelyek a választásodhoz illenek.',
      'All optional. Only the add-ons that fit your choices are shown.',
      'Allemaal optioneel. Alleen de toevoegingen die bij je keuzes passen worden getoond.',
    ),
    details: tri(
      'Csak az első kérdés kötelező. A többi segít, de üresen hagyhatod.',
      'Only the first question is required. The rest helps, but you can leave it empty.',
      'Alleen de eerste vraag is verplicht. De rest helpt, maar je kunt het leeg laten.',
    ),
    review: tri(
      'Ellenőrizd. Minden válasz módosítható: a „Módosítás” gomb a megfelelő lépésre visz.',
      'Check it over. Every answer can be changed: “Change” takes you to the right step.',
      'Controleer alles. Elk antwoord kan worden gewijzigd: “Wijzigen” brengt je naar de juiste stap.',
    ),
    send: tri(
      'Az utolsó lépés: hogyan érhetlek el? Erre az e-mail-címre válaszolok.',
      'The last step: how can I reach you? I will reply to this email address.',
      'De laatste stap: hoe kan ik je bereiken? Op dit e-mailadres antwoord ik.',
    ),
  },

  need: {
    selected: tri('{count} kiválasztva', '{count} selected', '{count} gekozen'),
    legend: tri('Mire van szükséged?', 'What do you need?', 'Wat heb je nodig?'),
    unsureNote: tri(
      'A „Még nem tudom” mellett más igényt is megadhatsz.',
      'You can pick other needs next to “Not sure yet”.',
      'Je kunt naast “Nog niet zeker” ook andere behoeften kiezen.',
    ),
  },
  plan: {
    forNeed: tri('Ehhez: {name}', 'For: {name}', 'Voor: {name}'),
    suggested: tri('Ajánlott', 'Suggested', 'Voorgesteld'),
    legend: tri('Csomag ehhez: {name}', 'Package for {name}', 'Pakket voor {name}'),
    noLines: tri('Előbb válassz igényt az első lépésben.', 'Choose a need in the first step first.', 'Kies eerst een behoefte in de eerste stap.'),
    backToNeed: tri('Vissza az igényekhez', 'Back to the needs', 'Terug naar de behoeften'),
  },
  extras: {
    forNeed: tri('Kiegészítők ehhez: {name}', 'Add-ons for {name}', 'Toevoegingen voor {name}'),
    none: tri('Ehhez nincs választható kiegészítő.', 'No add-ons are available for this one.', 'Hiervoor zijn geen toevoegingen beschikbaar.'),
    selected: tri('{count} kiválasztva', '{count} selected', '{count} gekozen'),
    skipHint: tri('Nem kell semmit választanod: léphetsz tovább.', 'You do not have to pick anything: just go on.', 'Je hoeft niets te kiezen: ga gewoon verder.'),
  },

  details: {
    description: {
      label: tri('Mi a projekt, röviden?', 'What is the project, briefly?', 'Wat is het project, kort?'),
      hint: tri(
        'Mit szeretnél létrehozni, kinek, és mi a cél? Néhány mondat elég.',
        'What do you want to create, for whom, and what is the goal? A few sentences are enough.',
        'Wat wil je maken, voor wie en wat is het doel? Een paar zinnen volstaan.',
      ),
      count: tri('{count} / {max}', '{count} / {max}', '{count} / {max}'),
    },
    objective: {
      label: tri('Mi a fő cél?', 'What is the main goal?', 'Wat is het hoofddoel?'),
      options: {
        present: tri('Bemutatkozás', 'Presenting a business or myself', 'Een bedrijf of mezelf presenteren'),
        leads: tri('Megkeresések szerzése', 'Getting enquiries', 'Aanvragen krijgen'),
        sell: tri('Foglalás vagy rendelés', 'Taking bookings or orders', 'Boekingen of bestellingen aannemen'),
        process: tri('Egy folyamat digitalizálása', 'Taking a process online', 'Een proces digitaliseren'),
        improve: tri('A meglévő javítása', 'Improving what exists', 'Verbeteren wat er al is'),
        other: tri('Más', 'Something else', 'Iets anders'),
      },
    },
    reference: {
      label: tri('Van meglévő weboldalad vagy példád?', 'Is there an existing website or a reference?', 'Is er een bestaande website of een voorbeeld?'),
      hint: tri('Egy hivatkozás, vagy néhány szó arról, ami tetszik.', 'A link, or a few words about something you like.', 'Een link, of een paar woorden over iets wat je mooi vindt.'),
    },
    timing: {
      label: tri('Mikorra szeretnéd?', 'When would you like it?', 'Wanneer wil je het?'),
      options: {
        unsure: tri('Még nem tudom', 'Not sure yet', 'Nog niet zeker'),
        asap: tri('Minél előbb', 'As soon as possible', 'Zo snel mogelijk'),
        weeks: tri('A következő hetekben', 'In the coming weeks', 'In de komende weken'),
        months: tri('A következő hónapokban', 'In the coming months', 'In de komende maanden'),
        flexible: tri('Nem sürgős', 'No rush', 'Geen haast'),
      },
    },
    requirements: {
      label: tri('Van még valami, amit tudnom kell?', 'Anything else I should know?', 'Is er nog iets wat ik moet weten?'),
      hint: tri(
        'További követelmények, korlátok vagy egy költségkeret-elképzelés, ha van. Nem kötelező.',
        'Further requirements, constraints or an idea of a budget, if you have one. Optional.',
        'Verdere eisen, beperkingen of een idee van een budget, als je dat hebt. Optioneel.',
      ),
    },
  },

  review: {
    lines: tri('A kiválasztott szolgáltatások', 'Your selected services', 'Je gekozen diensten'),
    details: tri('A projekt részletei', 'Project details', 'Projectdetails'),
    package: tri('Csomag', 'Package', 'Pakket'),
    addons: tri('Kiegészítők', 'Add-ons', 'Toevoegingen'),
    none: tri('nincs', 'none', 'geen'),
    notChosen: tri('nincs kiválasztva', 'not chosen', 'niet gekozen'),
    change: tri('Módosítás', 'Change', 'Wijzigen'),
    changeNeed: tri('Igények módosítása', 'Change needs', 'Behoeften wijzigen'),
    changePlan: tri('Csomag módosítása: {name}', 'Change the package: {name}', 'Pakket wijzigen: {name}'),
    changeExtras: tri('Kiegészítők módosítása: {name}', 'Change the add-ons: {name}', 'Toevoegingen wijzigen: {name}'),
    changeDetails: tri('Részletek módosítása', 'Change the details', 'Details wijzigen'),
    addAnother: tri('Másik szolgáltatás hozzáadása', 'Add another service', 'Nog een dienst toevoegen'),
    price: tri('Ár', 'Price', 'Prijs'),
    priceNote: tri(
      'Mindegyik tétel ára az ajánlatban szerepel.',
      'The price of every item comes with the quote.',
      'De prijs van elk onderdeel staat in de offerte.',
    ),
  },

  send: {
    contactTitle: tri('Elérhetőség', 'Contact', 'Contact'),
    name: { label: tri('A neved', 'Your name', 'Je naam'), hint: tri('A keresztnév is elég.', 'A first name is enough.', 'Een voornaam is genoeg.') },
    email: {
      label: tri('E-mail-cím', 'Email address', 'E-mailadres'),
      hint: tri('Erre a címre válaszolok.', 'This is where I will reply.', 'Hier antwoord ik op.'),
    },
    phone: {
      label: tri('Telefonszám', 'Phone number', 'Telefoonnummer'),
      hint: tri('Csak akkor, ha inkább telefonálnál.', 'Only if you would rather talk by phone.', 'Alleen als je liever belt.'),
    },
    consent: {
      label: tri(
        'Tudomásul veszem, hogy a megadott adatokat az ajánlatkérés megválaszolására használják fel.',
        'I understand that the details I give will be used to answer this quote request.',
        'Ik begrijp dat de opgegeven gegevens worden gebruikt om deze offerteaanvraag te beantwoorden.',
      ),
      privacy: tri('Adatkezelési tájékoztató', 'Privacy notice', 'Privacyverklaring'),
      pending: tri('Az adatkezelési tájékoztató elérési útja még nincs beállítva: src/config/site.ts', 'The privacy notice path is not set yet: src/config/site.ts', 'Het pad van de privacyverklaring is nog niet ingesteld: src/config/site.ts'),
    },
    memory: tri(
      'Amíg el nem küldöd, a válaszaid csak ezen az oldalon, a böngésződ memóriájában vannak: a személyes adataidat és a leírásodat sehol nem mentem el. Újratöltéskor törlődnek. A kiválasztott szolgáltatások a kosárban maradnak.',
      'Until you send it, your answers exist only on this page, in your browser’s memory: your personal details and your description are not saved anywhere. A reload clears them. The services you chose stay in the cart.',
      'Tot je het verstuurt, bestaan je antwoorden alleen op deze pagina, in het geheugen van je browser: je persoonlijke gegevens en je beschrijving worden nergens opgeslagen. Bij herladen verdwijnen ze. De gekozen diensten blijven in de winkelmand.',
    ),
  },

  errors: {
    required: {
      need: tri('Válassz legalább egy igényt.', 'Choose at least one need.', 'Kies minstens één behoefte.'),
      plan: tri('Válassz csomagot ehhez: {name}, vagy az Egyedi projektet.', 'Choose a package for {name}, or Custom project.', 'Kies een pakket voor {name}, of Maatwerkproject.'),
      description: tri('Írj néhány szót a projektről.', 'Write a few words about the project.', 'Schrijf een paar woorden over het project.'),
      timing: tri('Válassz a listából, vagy hagyd üresen.', 'Choose from the list, or leave it empty.', 'Kies uit de lijst of laat het leeg.'),
      name: tri('Add meg a neved.', 'Enter your name.', 'Vul je naam in.'),
      email: tri('Add meg az e-mail-címed, hogy válaszolhassak.', 'Enter your email address so I can reply.', 'Vul je e-mailadres in zodat ik kan antwoorden.'),
    },
    tooShort: tri('Legalább {min} karakter kell ide.', 'At least {min} characters are needed here.', 'Hier zijn minstens {min} tekens nodig.'),
    tooLong: tri('Legfeljebb {max} karakter lehet.', 'No more than {max} characters.', 'Maximaal {max} tekens.'),
    invalidEmail: tri(
      'Ez nem tűnik érvényes e-mail-címnek. Ellenőrizd, hogy van-e benne @ jel és utána tartomány.',
      'That does not look like a valid email address. Check that it has an @ sign followed by a domain.',
      'Dat lijkt geen geldig e-mailadres. Controleer of er een @-teken met daarna een domein in staat.',
    ),
    invalidPhone: tri(
      'Számjegyeket, szóközöket és a + ( ) - . / jeleket használj, legalább 6 számjeggyel.',
      'Use digits, spaces and the characters + ( ) - . /, with at least 6 digits.',
      'Gebruik cijfers, spaties en de tekens + ( ) - . /, met minstens 6 cijfers.',
    ),
    consentRequired: tri('A küldéshez ezt be kell jelölnöd.', 'You need to tick this to send the request.', 'Je moet dit aanvinken om de aanvraag te versturen.'),
    summary: tri('Javítsd, ami piros, mielőtt továbblépsz.', 'Fix what is marked before you go on.', 'Herstel wat is gemarkeerd voordat je verdergaat.'),
  },

  actions: {
    next: tri('Tovább', 'Next', 'Volgende'),
    back: tri('Vissza', 'Back', 'Terug'),
    send: tri('Ajánlatkérés elküldése', 'Send quote request', 'Offerteaanvraag versturen'),
    prepare: tri('Összegzés készítése', 'Prepare summary', 'Overzicht maken'),
    sending: tri('Küldés…', 'Sending…', 'Versturen…'),
    toCart: tri('Vissza a kosárhoz', 'Back to the cart', 'Terug naar de winkelmand'),
  },

  summary: {
    title: tri('Ajánlatkérés', 'Quote request', 'Offerteaanvraag'),
    heading: tri('Összefoglaló', 'Summary', 'Samenvatting'),
    empty: tri('—', '—', '—'),
    labels: {
      services: tri('Szolgáltatások', 'Services', 'Diensten'),
      description: tri('Leírás', 'Description', 'Beschrijving'),
      objective: tri('Fő cél', 'Main goal', 'Hoofddoel'),
      reference: tri('Meglévő oldal vagy példa', 'Existing site or reference', 'Bestaande site of voorbeeld'),
      timing: tri('Időzítés', 'Timing', 'Timing'),
      requirements: tri('További követelmények', 'Further requirements', 'Verdere eisen'),
      name: tri('Név', 'Name', 'Naam'),
      email: tri('E-mail', 'Email', 'E-mail'),
      phone: tri('Telefon', 'Phone', 'Telefoon'),
      language: tri('Nyelv', 'Language', 'Taal'),
      price: tri('Ár', 'Price', 'Prijs'),
    },
  },

  unavailable: {
    notice: tri(
      'Az online küldés még nincs bekötve. Végigmehetsz a kérdéseken, de a kérés most nem hagyhatja el az oldalt: a végén az összefoglalót másolhatod.',
      'Online sending is not connected yet. You can go through the questions, but the request cannot leave this page right now: at the end you can copy the summary.',
      'Online versturen is nog niet gekoppeld. Je kunt de vragen doorlopen, maar de aanvraag kan deze pagina nu niet verlaten: aan het eind kun je de samenvatting kopiëren.',
    ),
    title: tri('Az ajánlatkérés nem lett elküldve', 'The quote request was not sent', 'De offerteaanvraag is niet verstuurd'),
    text: tri(
      'Az online küldés még nincs beállítva, ezért semmi nem lett elküldve. A válaszaid megvannak: másold ki az összefoglalót, és küldd el más módon.',
      'Online sending is not set up yet, so nothing has been sent. Your answers are still here: copy the summary and send it another way.',
      'Online versturen is nog niet ingesteld, dus er is niets verstuurd. Je antwoorden staan er nog: kopieer de samenvatting en stuur die op een andere manier.',
    ),
    copy: tri('Összefoglaló másolása', 'Copy summary', 'Samenvatting kopiëren'),
    copied: tri('Az összefoglaló a vágólapon van.', 'The summary is on your clipboard.', 'De samenvatting staat op je klembord.'),
    copyFailed: tri(
      'A másolás nem sikerült. Jelöld ki az alábbi szöveget, és másold ki kézzel.',
      'Copying did not work. Select the text below and copy it by hand.',
      'Kopiëren is niet gelukt. Selecteer de tekst hieronder en kopieer die met de hand.',
    ),
    mail: tri('Megnyitás e-mail-piszkozatként', 'Open as an email draft', 'Openen als e-mailconcept'),
    mailNote: tri(
      'Az e-mail-programod megnyílik egy piszkozattal; csak akkor megy el, ha ott elküldöd.',
      'Your email app opens with a draft; it is only sent when you send it there.',
      'Je e-mailprogramma opent met een concept; het wordt pas verstuurd als je het daar verstuurt.',
    ),
    subject: tri('Ajánlatkérés', 'Quote request', 'Offerteaanvraag'),
  },
  failed: {
    title: tri('A küldés nem sikerült', 'Sending did not work', 'Versturen is niet gelukt'),
    network: tri(
      'Nem értem el a szolgáltatást. A válaszaid megvannak; ellenőrizd a kapcsolatot, és próbáld újra.',
      'I could not reach the service. Your answers are still here; check your connection and try again.',
      'Ik kon de dienst niet bereiken. Je antwoorden staan er nog; controleer je verbinding en probeer het opnieuw.',
    ),
    timeout: tri(
      'A küldés túl sokáig tartott, ezért nem tudom, megérkezett-e. A válaszaid megvannak; próbáld újra később.',
      'Sending took too long, so I cannot tell whether it arrived. Your answers are still here; try again later.',
      'Versturen duurde te lang, dus ik weet niet of het is aangekomen. Je antwoorden staan er nog; probeer het later opnieuw.',
    ),
    rejected: tri(
      'A szolgáltatás nem fogadta el a kérést. A válaszaid megvannak; próbáld újra később.',
      'The service did not accept the request. Your answers are still here; try again later.',
      'De dienst heeft de aanvraag niet geaccepteerd. Je antwoorden staan er nog; probeer het later opnieuw.',
    ),
  },
  sent: {
    title: tri('Elküldve', 'Sent', 'Verstuurd'),
    text: tri(
      'Az ajánlatkérésed elküldtem. A megadott e-mail-címen jelentkezem.',
      'Your quote request has been sent. I will get back to you at the email address you gave.',
      'Je offerteaanvraag is verstuurd. Ik neem contact met je op via het e-mailadres dat je hebt opgegeven.',
    ),
    next: tri('Mi történik most?', 'What happens now?', 'Wat gebeurt er nu?'),
    again: tri('Új ajánlatkérés', 'New quote request', 'Nieuwe offerteaanvraag'),
    browse: tri('Vissza a szolgáltatásokhoz', 'Back to the services', 'Terug naar de diensten'),
  },
}
