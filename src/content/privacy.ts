import { tri, type Trilingual } from './trilingual'

/**
 * The privacy and cookie notice, in three languages. Everything it says is something the site's code does
 * (src/content/privacy.test.ts reads the sources to keep the list of stored items in step with them), and
 * nothing it says is a promise about what the owner does with a message after it has arrived: that, and the
 * owner's own details, are theirs to add (README, "Before launch"). It is not legal advice.
 *
 * The booking section (PROMPT 24.1) says what the booking code stores, shows and deletes, and says nothing the code does not do: it gives no retention
 * period (the owner sets `RETENTION_DAYS`, and unset means nothing is deleted by age), names no legal basis, no processor agreement and no guarantee, and
 * does not say a message arrived because it was queued or accepted. `privacy.test.ts` reads the booking code to keep each of those sentences true;
 * `docs/booking/LAUNCH_CHECKLIST.md` lists what only the owner or a lawyer can supply.
 */

export interface StoredItem {
  /** The name the browser stores it under: a proper noun, shown as is. */
  name: string
  where: 'localStorage' | 'sessionStorage' | 'IndexedDB' | 'cookie'
  /** What it is for, and what it holds. */
  purpose: Trilingual
  /** Listed only when the site measures visits, because only then does it exist. */
  onlyWithMeasurement?: boolean
}

/**
 * Every item the site keeps in the visitor's browser. The sources that use browser storage are listed in
 * `STORAGE_USERS` (privacy.test.ts fails when a new one appears without a line here).
 */
export const storedItems: readonly StoredItem[] = [
  {
    name: 'cc_lang',
    where: 'cookie',
    purpose: tri(
      'A nyelv kódja (hu, en vagy nl), ha a nyelvválasztóval magad választottál nyelvet. Ez az oldalak egyetlen sütije; az ügyfélportál belépési sütijét a szerver állítja be, lásd a Sütik részt.',
      'The language code (hu, en or nl), when you chose a language yourself with the language switcher. It is the only cookie the site’s pages set; the client portal’s sign-in cookie is set by the server, see Cookies.',
      'De taalcode (hu, en of nl), als je zelf een taal hebt gekozen met de taalkeuze. Het is het enige cookie dat de pagina’s van de site plaatsen; het cookie waarmee je in het klantportaal ingelogd blijft, wordt door de server geplaatst, zie Cookies.',
    ),
  },
  {
    name: 'theme',
    where: 'localStorage',
    purpose: tri(
      'A világos vagy sötét téma, amelyet választottál.',
      'The light or dark theme you chose.',
      'Het lichte of donkere thema dat je hebt gekozen.',
    ),
  },
  {
    name: 'cc-shop-cart-v1',
    where: 'localStorage',
    purpose: tri(
      'Az ajánlatkéréshez kiválasztott szolgáltatások, csomagok és kiegészítők. Név, e-mail-cím és üzenet nincs benne.',
      'The services, packages and add-ons you picked for a quote request. It holds no name, email address or message.',
      'De diensten, pakketten en extra’s die je voor een offerteaanvraag hebt gekozen. Er staan geen naam, e-mailadres of bericht in.',
    ),
  },
  {
    name: 'intro:seen, intro:skip',
    where: 'localStorage',
    purpose: tri(
      'Hogy láttad-e már a nyitóképernyőt, és kérted-e, hogy ne jelenjen meg újra.',
      'Whether you have seen the opening screen, and whether you asked not to see it again.',
      'Of je het openingsscherm al hebt gezien en of je hebt gevraagd het niet opnieuw te tonen.',
    ),
  },
  {
    name: 'lab:quality',
    where: 'localStorage',
    purpose: tri(
      'A Lab megjelenítési minősége, ha kézzel állítottad.',
      'The Lab’s display quality, if you set it by hand.',
      'De weergavekwaliteit van het Lab, als je die met de hand hebt ingesteld.',
    ),
  },
  {
    name: 'lab:view',
    where: 'sessionStorage',
    purpose: tri(
      'Hogy a Labban az élő vagy az állóképes nézetet választottad-e. A lap bezárásáig marad meg.',
      'Whether you chose the live or the still view in the Lab. It lasts until the tab is closed.',
      'Of je in het Lab de live- of de stilstaande weergave hebt gekozen. Het blijft tot je het tabblad sluit.',
    ),
  },
  {
    name: 'cc:scroll-positions',
    where: 'sessionStorage',
    purpose: tri(
      'Az oldalak görgetési helye, hogy a „Vissza” gomb oda vigyen, ahol jártál. A lap bezárásáig marad meg.',
      'Where you had scrolled on each page, so “Back” returns you to the same place. It lasts until the tab is closed.',
      'Waar je op elke pagina had gescrold, zodat ‘Terug’ je op dezelfde plek brengt. Het blijft tot je het tabblad sluit.',
    ),
  },
  {
    name: 'lab-artifacts',
    where: 'IndexedDB',
    purpose: tri(
      'A Labban elmentett munkáid. Csak ezen az eszközön vannak, nem kerülnek szerverre.',
      'The works you saved in the Lab. They exist on this device only and are never uploaded.',
      'De werken die je in het Lab hebt bewaard. Ze staan alleen op dit apparaat en worden nooit geüpload.',
    ),
  },
  {
    name: 'cc-ai',
    where: 'sessionStorage',
    purpose: tri(
      'Az AI-asszisztens munkamenet-kódja és annak a beszélgetésnek az azonosítója, amelyben éppen vagy. Név, e-mail-cím és üzenet nincs benne. A kódot az oldal saját szervere kapja meg, amikor az asszisztenst használod. A lap bezárásáig marad meg.',
      'The AI assistant’s session code and the id of the conversation you are in. It holds no name, email address or message. The code is sent to this site’s own server when you use the assistant. It lasts until the tab is closed.',
      'De sessiecode van de AI-assistent en het id van het gesprek waarin je zit. Er staan geen naam, e-mailadres of bericht in. De code gaat naar de eigen server van deze site als je de assistent gebruikt. Hij blijft tot je het tabblad sluit.',
    ),
  },
  {
    name: 'cc-consent-v1',
    where: 'localStorage',
    onlyWithMeasurement: true,
    purpose: tri(
      'A mérésre adott válaszod (igen vagy nem).',
      'Your answer about measurement (yes or no).',
      'Je antwoord over meten (ja of nee).',
    ),
  },
]

export const privacyText = {
  title: tri('Adatvédelem és sütik', 'Privacy and cookies', 'Privacy en cookies'),
  lead: tri(
    'Rövid és érthető összefoglaló arról, mit csinál ez az oldal a böngésződben és az adataiddal.',
    'A short, plain summary of what this site does in your browser and with your data.',
    'Een korte, duidelijke samenvatting van wat deze site in je browser en met je gegevens doet.',
  ),
  cookies: {
    title: tri('Sütik', 'Cookies', 'Cookies'),
    text: tri(
      'Az oldal egyetlen apró sütit használ, és csak akkor, ha te magad választasz nyelvet a nyelvválasztóval. A süti neve cc_lang, csak a nyelv kódját tartalmazza (hu, en vagy nl), egy évig érvényes, és arra való, hogy az oldal legközelebb is a választott nyelven nyíljon meg. Személyes adat nincs benne. Más célra az oldal nem használ sütit.',
      'This site uses one small cookie, and only when you choose a language yourself with the language switcher. The cookie is called cc_lang, holds only the language code (hu, en or nl), lasts for a year, and exists so that the site opens in your chosen language next time. It contains no personal data. The site uses no cookies for anything else.',
      'Deze site gebruikt één klein cookie, en alleen als je zelf een taal kiest met de taalkeuze. Het cookie heet cc_lang, bevat alleen de taalcode (hu, en of nl), blijft een jaar bewaard en zorgt ervoor dat de site de volgende keer in de gekozen taal opent. Er staan geen persoonsgegevens in. De site gebruikt geen cookies voor iets anders.',
    ),
  },
  cookiesPortal: tri(
    'Ha belépsz az ügyfélportálba, a szerver egy második sütit állít be, cc_client néven. Egy véletlen értéket tartalmaz, amely a belépésedet azonosítja; csak a portál működéséhez kell, a belépés lejártával vagy kijelentkezéskor megszűnik, és semmi másra nem szolgál. Az érték nem olvasható a weboldal programkódjából.',
    'If you sign in to the client portal, the server sets a second cookie, called cc_client. It holds a random value that identifies your sign-in; it is needed only for the portal to work, it ends when the sign-in ends or when you sign out, and it is used for nothing else. The website’s own code cannot read the value.',
    'Als je inlogt op het klantportaal, plaatst de server een tweede cookie, cc_client genaamd. Het bevat een willekeurige waarde die je sessie aanduidt; het is alleen nodig om het portaal te laten werken, het verdwijnt als de sessie eindigt of als je uitlogt, en het wordt voor niets anders gebruikt. De code van de website zelf kan de waarde niet lezen.',
  ),
  language: {
    title: tri('Nyelv és ország', 'Language and country', 'Taal en land'),
    items: [
      tri(
        'Ha nyelv nélküli címet nyitsz meg (például csak az oldal nevét írod be), az oldal a kapcsolatod országa alapján választ nyelvet: Magyarországról magyart, Hollandiából hollandot, minden más vagy ismeretlen országból angolt. Az országot az oldalt kiszolgáló hálózat (Cloudflare) adja át kétbetűs kódként. Az oldal saját kódja nem olvassa, nem tárolja és nem naplózza az IP-címedet, az országot sem őrzi meg, és nem is küldi tovább.',
        'When you open an address without a language (for example, you just type the site’s name), the site picks a language from the country of your connection: Hungarian from Hungary, Dutch from the Netherlands, and English from every other or unknown country. The country is passed on as a two-letter code by the network that serves the site (Cloudflare). The site’s own code does not read, store or log your IP address, does not keep the country, and does not pass it on.',
        'Open je een adres zonder taal (bijvoorbeeld door alleen de naam van de site te typen), dan kiest de site een taal op basis van het land van je verbinding: Hongaars vanuit Hongarije, Nederlands vanuit Nederland en Engels vanuit elk ander of onbekend land. Het land wordt als tweeletterige code doorgegeven door het netwerk dat de site aanbiedt (Cloudflare). De eigen code van de site leest, bewaart of logt je IP-adres niet, onthoudt het land niet en geeft het niet door.',
      ),
      tri(
        'Pontos helyadatot nem használ az oldal, és a böngésződtől sem kér helymeghatározást. Az ország csak a kezdő nyelvet dönti el. A nyelvet bármikor átállíthatod, és amit egyszer választottál, azt az oldal nem írja felül.',
        'The site does not use your precise location and never asks your browser for it. The country only decides the starting language. You can change the language at any time, and once you have chosen one, the site does not override it.',
        'De site gebruikt je exacte locatie niet en vraagt er ook nooit naar in je browser. Het land bepaalt alleen de taal waarmee je begint. Je kunt de taal op elk moment wijzigen en wat je eenmaal hebt gekozen, overschrijft de site niet.',
      ),
    ],
  },
  stored: {
    title: tri('Mit tárol az oldal a böngésződben', 'What the site keeps in your browser', 'Wat de site in je browser bewaart'),
    text: tri(
      'Az alábbi beállítások csak ezen az eszközön vannak, és csak az oldal működéséhez kellenek. Nem kerülnek elküldésre sehová, kivéve az AI-asszisztens munkamenet-kódját, amelyet az oldal saját szervere kap meg, amikor az asszisztenst használod.',
      'The items below stay on this device and are only there to make the site work. They are not sent anywhere, except the AI assistant’s session code, which goes to this site’s own server when you use the assistant.',
      'De onderstaande gegevens blijven op dit apparaat en dienen alleen om de site te laten werken. Ze worden nergens naartoe gestuurd, behalve de sessiecode van de AI-assistent, die naar de eigen server van deze site gaat als je de assistent gebruikt.',
    ),
    where: tri('Hol', 'Where', 'Waar'),
  },
  leaving: {
    title: tri('Mi hagyja el az eszközödet', 'What leaves your device', 'Wat je apparaat verlaat'),
    items: [
      tri(
        'Az oldal a betűtípusait és a képeit önmagától tölti be. Nem használ külső betűtípus-, térkép-, videó- vagy közösségimédia-szolgáltatást.',
        'The site loads its own fonts and images. It uses no external font, map, video or social-media service.',
        'De site laadt zijn eigen lettertypen en afbeeldingen. Hij gebruikt geen externe diensten voor lettertypen, kaarten, video of sociale media.',
      ),
      tri(
        'A kapcsolatfelvételi űrlap és az ajánlatkérő csak akkor küld el adatot, ha megnyomod az elküldés gombot, és csak az oldal tulajdonosa által beállított címre. Az elküldésig amit beírsz, csak a memóriában van, a böngésző tárolójába nem kerül.',
        'The contact form and the request builder send data only when you press send, and only to the address the site’s owner has set up. What you type stays in memory until then and is never written to your browser’s storage.',
        'Het contactformulier en de aanvraagbouwer versturen alleen gegevens als je op verzenden drukt, en alleen naar het adres dat de eigenaar van de site heeft ingesteld. Wat je typt blijft tot dat moment in het geheugen en wordt nooit in de opslag van je browser geschreven.',
      ),
      tri(
        'A foglalási űrlap csak akkor küld adatot az oldal saját szerverének, amikor megerősíted a foglalást; addig amit beírsz, csak a memóriában van, a böngésző tárolójába nem kerül. A naptár böngészése közben az oldal csak a konzultáció típusát és egy dátumtartományt kéri le a szabad időpontokhoz, rólad semmit nem küld.',
        'The booking form sends data to this site’s own server only when you confirm the booking; until then what you type stays in memory and is never written to your browser’s storage. While you browse the calendar, the page asks only for the consultation type and a range of dates to find the free times, and sends nothing about you.',
        'Het formulier om in te plannen verstuurt alleen gegevens naar de eigen server van deze site als je de afspraak bevestigt; tot dat moment blijft wat je typt in het geheugen en wordt het nooit in de opslag van je browser geschreven. Terwijl je door de agenda bladert, vraagt de pagina alleen om het soort adviesgesprek en een datumbereik om de vrije tijden te vinden en stuurt ze niets over jou.',
      ),
      tri(
        'Ha még nincs fogadó cím beállítva, az űrlap ezt kimondja, és semmit nem küld el.',
        'If no receiving address has been set up yet, the form says so and sends nothing.',
        'Is er nog geen ontvangstadres ingesteld, dan zegt het formulier dat en verstuurt het niets.',
      ),
      tri(
        'Hogy mi történik egy üzenettel, miután megérkezett, az oldal tulajdonosának dolga. Kérdezd tőle a Kapcsolat oldalon keresztül.',
        'What happens to a message once it has arrived is up to the site’s owner. Ask them through the Contact page.',
        'Wat er met een bericht gebeurt zodra het is aangekomen, is aan de eigenaar van de site. Vraag het via de contactpagina.',
      ),
    ],
  },
  quotations: {
    title: tri('Ajánlatkérés és ajánlat', 'Quote requests and quotes', 'Offerteaanvragen en offertes'),
    items: [
      tri(
        'Amikor ajánlatot kérsz, az oldal eltárolja, amit beírtál (a neved, az e-mail-címed, a leírást, és ha megadtad, a cég nevét, weboldalát, a költségkeretet és a telefonszámod), a kiválasztott szolgáltatásokat, valamint hogy mikor érkezett, és a hálózati címed egyirányú ujjlenyomatát (magát a címet nem). Ha ajánlat készül neked, az ajánlat és a rá adott válaszod (elfogadás, elutasítás vagy kérdés) is tárolódik.',
        'When you ask for a quote, the site stores what you typed (your name, email address, the description and, if you gave them, the company, its website, a budget and your phone number), the services you chose, when it arrived and a one-way fingerprint of your network address (not the address itself). If a quote is prepared for you, the quote and your answer to it (accepted, declined or a question) are stored too.',
        'Als je een offerte aanvraagt, bewaart de site wat je typte (je naam, e-mailadres, de omschrijving en, als je ze opgaf, het bedrijf, de website, een budget en je telefoonnummer), de gekozen diensten, wanneer het aankwam en een eenrichtingsvingerafdruk van je netwerkadres (niet het adres zelf). Wordt er een offerte voor je opgesteld, dan worden ook de offerte en je reactie erop (geaccepteerd, afgewezen of een vraag) bewaard.',
      ),
      tri(
        'Az e-mailjeidben lévő linkek személyesek: mindegyiknek csak az egyirányú ujjlenyomata van eltárolva, korlátozott ideig működnek, és aki ismeri a linket, megnyithatja az oldalt, ezért ne oszd meg másokkal.',
        'The links in your e-mails are private: only a one-way fingerprint of each is stored, a link works for a limited time, and anyone who has the link can open that page, so please do not share it.',
        'De links in je e-mails zijn persoonlijk: van elke link wordt alleen een eenrichtingsvingerafdruk bewaard, een link werkt beperkte tijd en wie de link heeft kan die pagina openen, deel hem dus niet met anderen.',
      ),
      tri(
        'A visszaigazolást, az ajánlatot és a döntésed visszaigazolását egy tranzakciós e-mail-szolgáltatáson keresztül kapod. Az üzenetekről naplót vezetünk (kinek, mikor, és hogy a szolgáltató elfogadta-e), az üzenetek szövege nélkül.',
        'You receive the confirmation, the quote and the confirmation of your decision through a transactional email service. The messages are logged (to whom, when and whether the provider accepted them), without their text.',
        'Je ontvangt de bevestiging, de offerte en de bevestiging van je beslissing via een transactionele e-maildienst. De berichten worden gelogd (aan wie, wanneer en of de aanbieder ze accepteerde), zonder de tekst.',
      ),
      tri(
        'A kérésedtől független, nem kötelező jelölőnégyzet (más hírekről) külön választás. Ez az oldal nem küld marketing-e-mailt, és nem kér, nem fogad és nem tárol fizetési adatot.',
        'The optional tick-box about hearing about other news is a separate choice from your request. This site sends no marketing email, and asks for, takes and stores no payment details.',
        'Het optionele vakje over ander nieuws is een aparte keuze, los van je aanvraag. Deze site verstuurt geen marketing-e-mail en vraagt, ontvangt en bewaart geen betaalgegevens.',
      ),
      tri(
        'Hogy meddig őrizzük a kéréseket, az oldal tulajdonosának döntése. Ha látni, javíttatni vagy törölni szeretnéd a rólad tárolt adatokat, kérd tőle a Kapcsolat oldalon keresztül.',
        'How long requests are kept is the site owner’s decision. If you want to see, correct or delete what is stored about you, ask them through the Contact page.',
        'Hoe lang aanvragen worden bewaard is de beslissing van de eigenaar van de site. Wil je zien, laten corrigeren of laten verwijderen wat over je is opgeslagen, vraag het dan via de contactpagina.',
      ),
    ],
  },
  booking: {
    title: tri('Konzultáció foglalása', 'Booking a consultation', 'Een adviesgesprek inplannen'),
    items: [
      tri(
        'Amikor konzultációt foglalsz, az oldal eltárolja, amit megadtál: a neved és az e-mail-címed (kötelező), valamint ha megadtad, a cég nevét, a weboldalad címét, a projektleírásodat és egy kapcsolódó ajánlatkérés vagy megkeresés azonosítóját. Ha az azonosító egy ugyanezzel az e-mail-címmel küldött ajánlatkéréshez tartozik, az oldal összekapcsolja a kettőt a tulajdonos számára. Ne írj be érzékeny személyes adatot a leírásba.',
        'When you book a consultation, the site stores what you entered: your name and email address (required) and, if you gave them, your company, your website address, a description of your project and the reference of a related quote request or inquiry. If the reference belongs to a quote request sent with the same email address, the site links the two for the owner. Do not put sensitive personal data in the description.',
        'Als je een adviesgesprek inplant, bewaart de site wat je hebt ingevuld: je naam en e-mailadres (verplicht) en, als je ze opgaf, je bedrijf, het adres van je website, een omschrijving van je project en de referentie van een bijbehorende offerteaanvraag of aanvraag. Hoort de referentie bij een offerteaanvraag die met hetzelfde e-mailadres is verstuurd, dan koppelt de site de twee voor de eigenaar. Voer geen gevoelige persoonsgegevens in bij de omschrijving.',
      ),
      tri(
        'A foglalásról ezt is tárolja: a konzultáció típusát, a dátumot, a kezdő és a befejező időpontot, azt az időzónát, amelyben a tulajdonos az időpontokat kínálja, a foglalás nyelvét és állapotát (például megerősített vagy lemondott), valamint az előzményeit: mikor jött létre, és mikor változott. Ha lemondást vagy időpont-módosítást kérsz, az indoklásod is eltárolódik.',
        'It also stores the booking itself: the type of consultation, the date, the start and end time, the time zone the owner offers the times in, the booking’s language and status (for example confirmed or cancelled) and its history: when it was made and when it changed. If you ask to cancel or to change the time, the reason you write is stored too.',
        'Ook de afspraak zelf wordt bewaard: het soort adviesgesprek, de datum, de begin- en eindtijd, de tijdzone waarin de eigenaar de tijden aanbiedt, de taal en de status van de afspraak (bijvoorbeeld bevestigd of geannuleerd) en de geschiedenis: wanneer hij is gemaakt en wanneer hij is gewijzigd. Vraag je om te annuleren of de tijd te wijzigen, dan wordt ook de reden die je schrijft bewaard.',
      ),
      tri(
        'Eltárolja azt is, hogy mikor jelölted be a hozzájáruló mondatot, és a hálózati címed egyirányú ujjlenyomatát, amelyet a szerver titkos kulcsával képez (magát a címet nem). Ez arra való, hogy a visszaélést, például sok foglalást egy helyről, utólag fel lehessen ismerni. A hálózati címedet az oldal csak a memóriájában használja arra, hogy egy helyről ne jöhessen túl sok kérés; az adatbázisba és a naplóba nem írja. Technikai adat az is, hogy a böngésződ minden elküldéshez készít egy kulcsot, és az oldal eltárol egy ujjlenyomatot a típusról, az időpontról és az e-mail-címről, hogy egy dupla kattintás ne hozzon létre két foglalást.',
        'It also stores when you ticked the sentence saying you understand how your details are used, and a one-way fingerprint of your network address, made with the server’s secret key (not the address itself). It exists so that abuse, such as many bookings from one place, can be recognised afterwards. The site uses your network address only in memory, to stop too many requests coming from one place; it does not write it to the database or the logs. Two technical items are stored as well so that a double click cannot make two bookings: a key your browser makes for each submission, and a fingerprint of the type, the time and the email address.',
        'Ook wordt bewaard wanneer je de zin hebt aangevinkt waarmee je begrijpt hoe je gegevens worden gebruikt, en een eenrichtingsvingerafdruk van je netwerkadres, gemaakt met de geheime sleutel van de server (niet het adres zelf). Die is er om misbruik, bijvoorbeeld veel afspraken vanaf één plek, achteraf te kunnen herkennen. De site gebruikt je netwerkadres alleen in het geheugen, om te voorkomen dat er te veel verzoeken vanaf één plek komen; hij schrijft het niet naar de database of de logs. Om te voorkomen dat een dubbele klik twee afspraken maakt, worden ook twee technische gegevens bewaard: een sleutel die je browser voor elke verzending maakt en een vingerafdruk van het soort, de tijd en het e-mailadres.',
      ),
      tri(
        'Ezekre azért van szükség, hogy a konzultációt egyeztetni és lebonyolítani lehessen, kapcsolatba lehessen lépni veled róla, ugyanazt az időpontot ne lehessen kétszer lefoglalni, és hogy az űrlap védve legyen a visszaéléstől. A foglalás nem kér marketing-hozzájárulást, és nem is függ attól.',
        'All of this is needed to arrange and carry out the consultation, to contact you about it, to make sure one time cannot be booked twice, and to protect the form from abuse. Booking asks for no marketing consent and does not depend on one.',
        'Dit alles is nodig om het adviesgesprek te regelen en uit te voeren, om contact met je op te nemen, om te zorgen dat dezelfde tijd niet twee keer wordt ingepland en om het formulier tegen misbruik te beschermen. Voor het inplannen wordt geen toestemming voor marketing gevraagd en het hangt er ook niet van af.',
      ),
      tri(
        'A visszaigazolásban és a későbbi e-mailekben személyes link van a foglalásod oldalára. Ott láthatod az adataidat és az előzményeket, és lemondást vagy időpont-módosítást kérhetsz. A linkből csak egyirányú ujjlenyomat van eltárolva, maga a titkos rész nincs; a link korlátozott ideig működik, és a tulajdonos bármikor visszavonhatja. Aki ismeri a linket, megnyithatja az oldalt, ezért ne oszd meg másokkal. Mint minden webcím, a link is megjelenhet a tárhely- és a hálózati szolgáltató technikai naplóiban.',
        'The confirmation and the later emails contain a personal link to your booking page. There you can see your details and the history and ask to cancel or to change the time. Only a one-way fingerprint of the link’s secret part is stored, never the secret itself; the link works for a limited time and the owner can withdraw it at any time. Anyone who has the link can open the page, so please do not share it. Like any web address, the link can appear in the technical logs of the hosting and network providers.',
        'De bevestiging en de latere e-mails bevatten een persoonlijke link naar de pagina van je afspraak. Daar zie je je gegevens en de geschiedenis en kun je vragen om te annuleren of de tijd te wijzigen. Van het geheime deel van de link wordt alleen een eenrichtingsvingerafdruk bewaard, nooit het geheim zelf; de link werkt beperkte tijd en de eigenaar kan hem altijd intrekken. Wie de link heeft, kan de pagina openen, deel hem dus niet met anderen. Zoals elk webadres kan de link voorkomen in de technische logs van de hosting- en netwerkaanbieders.',
      ),
      tri(
        'A tulajdonos privát jegyzeteket fűzhet a foglaláshoz. Ezeket csak az oldalt kezelők látják az adminisztrációs felületen; nem jelennek meg a foglalásod oldalán, és nem kerülnek bele az e-mailekbe. A foglalással együtt törlődnek.',
        'The owner can add private notes to a booking. Only the people who manage the site see them, in its administration; they are not shown on your booking page and are not put in the emails. They are deleted together with the booking.',
        'De eigenaar kan privénotities bij een afspraak zetten. Alleen de beheerders van de site zien ze, in het beheergedeelte; ze staan niet op de pagina van je afspraak en komen niet in de e-mails. Ze worden samen met de afspraak verwijderd.',
      ),
      tri(
        'A visszaigazolást és a későbbi értesítéseket (megerősítés, lemondás, időpont-módosítás) tranzakciós e-mail-szolgáltatáson keresztül kapod. A tulajdonos is kap egy értesítő e-mailt a foglalásod adataival. Az üzenetekről napló készül: kinek, mikor, milyen nyelven és milyen típusú üzenet ment, és hogy a szolgáltató elfogadta-e. A napló nem tartalmazza az üzenet szövegét, kivéve azt a rövid megjegyzést, amelyet a tulajdonos egy lemondáshoz, döntéshez vagy időpont-javaslathoz esetleg hozzáír. A napló azt rögzíti, hogy a szolgáltató elfogadta az üzenetet, nem azt, hogy a postaládádba meg is érkezett; ha nem kapsz levelet, nézd meg a levélszemetet, vagy írj a Kapcsolat oldalon.',
        'You receive the confirmation and the later notices (confirmed, cancelled, time changed) through a transactional email service. The owner also gets a notification email with the details of your booking. The messages are logged: to whom, when, in which language, of which kind, and whether the provider accepted them. The log does not hold the message text, except the short note the owner may add to a cancellation, a decision or a proposed time. It records that the provider accepted a message, not that it reached your mailbox; if you get no email, check your spam folder or write on the Contact page.',
        'Je ontvangt de bevestiging en de latere berichten (bevestigd, geannuleerd, tijd gewijzigd) via een transactionele e-maildienst. Ook de eigenaar krijgt een e-mail met de gegevens van je afspraak. De berichten worden gelogd: aan wie, wanneer, in welke taal, van welk soort en of de aanbieder ze accepteerde. In het logboek staat de tekst van het bericht niet, behalve de korte opmerking die de eigenaar bij een annulering, een beslissing of een voorgestelde tijd kan toevoegen. Er staat vastgelegd dat de aanbieder een bericht accepteerde, niet dat het in je mailbox is aangekomen; krijg je geen e-mail, kijk dan in je spammap of schrijf via de contactpagina.',
      ),
      tri(
        'Hogy meddig őrizzük a foglalásokat, az oldal tulajdonosának beállítása, ezért itt nem írunk időtartamot. Ha a tulajdonos megőrzési időt állított be, az oldal rendszeres karbantartása törli azokat a foglalásokat, amelyek már lezárultak (lezajlottak, lemondták őket, vagy nem jelentek meg), ha az utolsó változásuk óta eltelt ennyi idő; ugyanígy törli az e-mail-napló régi sorait. Egy még élő foglalást az idő önmagában nem töröl. Ha nincs megőrzési idő beállítva, az oldal semmit nem töröl az életkora alapján: a foglalás addig marad meg, amíg a tulajdonos nem törli, vagy te nem kéred a törlését. A lejárt linkek nyoma a lejárat után körülbelül egy hónappal törlődik.',
        'How long bookings are kept is the site owner’s setting, so this notice gives no number. If the owner has set a retention period, the site’s regular housekeeping deletes bookings that are over (completed, cancelled or missed) once that much time has passed since their last change, and in the same way the old lines of the email log. A booking that is still active is never deleted just because time has passed. If no retention period is set, nothing is deleted because of its age: a booking stays until the owner deletes it or you ask for it to be deleted. The records of expired links are removed about a month after they expire.',
        'Hoe lang afspraken worden bewaard is de instelling van de eigenaar van de site, daarom noemt deze tekst geen aantal. Heeft de eigenaar een bewaartermijn ingesteld, dan verwijdert het regelmatige onderhoud van de site afspraken die voorbij zijn (gehouden, geannuleerd of niet verschenen) zodra die tijd sinds hun laatste wijziging is verstreken, en op dezelfde manier de oude regels in het logboek van de e-mails. Een afspraak die nog loopt wordt nooit verwijderd alleen omdat er tijd is verstreken. Is er geen bewaartermijn ingesteld, dan wordt niets verwijderd vanwege de leeftijd: een afspraak blijft staan tot de eigenaar hem verwijdert of jij om verwijdering vraagt. De gegevens van verlopen links worden ongeveer een maand na het verlopen verwijderd.',
      ),
      tri(
        'Ha tudni szeretnéd, mit tárolunk a foglalásodról, vagy törölni szeretnéd, kérd ezt a tulajdonostól a Kapcsolat oldalon, és add meg a foglaláskor használt e-mail-címet. A törlést a tulajdonos kézzel, egy erre szolgáló eszközzel végzi, tehát nem azonnal és nem automatikusan. Ez az adott e-mail-címmel tett foglalásokat törli a jegyzeteikkel, linkjeikkel és e-mail-naplójukkal együtt, és ugyanehhez a címhez tartozó ajánlatkéréseket és megkereséseket is. Megmarad egy rövid esemény-nyilvántartás, amelyben csak a foglalás azonosítója, állapota és időpontja áll, név, e-mail-cím és szöveg nélkül. Ha az oldal automatikus adatbázis-mentést használ, a már elkészült mentések a saját lejáratukig még tartalmazhatják a törölt adatokat.',
        'If you want to know what is stored about your booking, or want it deleted, ask the owner on the Contact page and give the email address you used. The owner deletes by hand, with a tool made for it, so it is not immediate and not automatic. It deletes the bookings made with that email address together with their notes, links and email log, and also the quote requests and inquiries from the same address. A short event record stays, holding only the booking’s reference, status and time, with no name, email address or text. If the site uses automatic database backups, copies that were already made can still hold the deleted data until they expire.',
        'Wil je weten wat er over je afspraak is opgeslagen, of wil je dat het wordt verwijderd, vraag het dan aan de eigenaar via de contactpagina en geef het e-mailadres op dat je hebt gebruikt. De eigenaar verwijdert dit met de hand, met een daarvoor bedoeld hulpmiddel; het gaat dus niet meteen en niet automatisch. Daarbij worden de afspraken met dat e-mailadres verwijderd, samen met de notities, de links en het logboek van de e-mails ervan, en ook de offerteaanvragen en aanvragen van hetzelfde adres. Er blijft een korte gebeurtenisregistratie over met alleen de referentie, de status en het tijdstip van de afspraak, zonder naam, e-mailadres of tekst. Gebruikt de site automatische back-ups van de database, dan kunnen reeds gemaakte kopieën de verwijderde gegevens tot hun verval nog bevatten.',
      ),
    ],
  },
  portal: {
    title: tri('Az ügyfélportál', 'The client portal', 'Het klantportaal'),
    items: [
      tri(
        'Az ügyfélportál azoknak szól, akiket a tulajdonos meghívott (vagy, ha a tulajdonos bekapcsolta, akik igazolják az e-mail-címüket). A fiókhoz az e-mail-címedet, a nevedet és a cégedet (a kettő nem kötelező), az e-mailek nyelvét, valamint a fiók létrehozásának, a cím megerősítésének és az utolsó belépésnek az idejét tárolja az oldal. A portál nem használ jelszót, és nem is tárol.',
        'The client portal is for people the owner has invited (or, if the owner has switched it on, people who prove their email address). For the account the site stores your email address, your name and company (both optional), the language of the emails, and when the account was made, when the address was verified and when you last signed in. The portal uses no password and stores none.',
        'Het klantportaal is voor mensen die de eigenaar heeft uitgenodigd (of, als de eigenaar dat heeft aangezet, die hun e-mailadres bevestigen). Voor het account bewaart de site je e-mailadres, je naam en bedrijf (beide optioneel), de taal van de e-mails en wanneer het account is gemaakt, het adres is bevestigd en je voor het laatst bent ingelogd. Het portaal gebruikt geen wachtwoord en bewaart er geen.',
      ),
      tri(
        'Belépni egy linkkel lehet, amelyet a megadott e-mail-címre küldünk. A link titka csak az e-mailben szerepel, az adatbázisban csak egy egyirányú ujjlenyomata van. A link egyszer használható, és rövid ideig érvényes. A belépés egy sütit állít be (lásd a Sütik részt). Minden belépésről az oldal eltárolja, mikor kezdődött és mikor használtad utoljára, a böngésződ saját leírásának első részét és a hálózati címed egyirányú ujjlenyomatát.',
        'You sign in with a link sent to your email address. The link’s secret appears only in the email; the database keeps only a one-way fingerprint of it. A link works once and only for a short time. Signing in sets a cookie (see Cookies). For each sign-in the site stores when it began and when you last used it, the first part of your browser’s own description and a one-way fingerprint of your network address.',
        'Je logt in met een link die naar je e-mailadres wordt gestuurd. Het geheim van de link staat alleen in de e-mail; in de database staat alleen een eenrichtingsvingerafdruk ervan. Een link werkt één keer en maar kort. Inloggen plaatst een cookie (zie Cookies). Van elke sessie bewaart de site wanneer die begon en wanneer je hem voor het laatst gebruikte, het eerste deel van de eigen beschrijving van je browser en een eenrichtingsvingerafdruk van je netwerkadres.',
      ),
      tri(
        'A portálban csak az látszik, amit a tulajdonos (vagy, ha be van kapcsolva, te magad a megerősített e-mail-címeddel) a fiókodhoz kapcsolt: ajánlatkéréseket, foglalásokat és projekteket. A projektről a tulajdonos rögzíti a nevét, a területét, az állapotát, a dátumokat, a mérföldköveket és a neked szánt üzeneteket, és minden változásról egy sort ír a projekt történetébe. A tulajdonos privát jegyzeteit te nem látod.',
        'The portal shows only what the owner (or, if it is switched on, you yourself with your verified email address) has linked to your account: quote requests, bookings and projects. For a project the owner records its name, its category, its status, the dates, the milestones and the messages meant for you, and writes one line to the project’s history for every change. You do not see the owner’s private notes.',
        'Het portaal toont alleen wat de eigenaar (of, als dat aan staat, jij zelf met je bevestigde e-mailadres) aan je account heeft gekoppeld: offerteaanvragen, afspraken en projecten. Van een project legt de eigenaar de naam, de categorie, de status, de data, de mijlpalen en de berichten voor jou vast, en schrijft bij elke wijziging een regel in de geschiedenis van het project. De privénotities van de eigenaar zie je niet.',
      ),
      tri(
        'A portál levelei (belépési link, meghívó, a címed módosítása, biztonsági értesítés, új projekt, egy projekt állapotának fontos változása) ugyanazon a tranzakciós e-mail-szolgáltatáson mennek át, mint az oldal többi levele, és ugyanúgy naplózódnak: kinek, mikor, milyen nyelven, milyen fajta, és hogy a szolgáltató elfogadta-e. A napló nem tartalmazza az üzenet szövegét. Az elfogadás nem azt jelenti, hogy a levél megérkezett a postafiókodba.',
        'The portal’s emails (a sign-in link, an invitation, a change of your address, a security notice, a new project, an important change in a project’s status) go through the same transactional email service as the site’s other emails and are logged in the same way: to whom, when, in which language, of which kind, and whether the provider accepted them. The log does not hold the message text. Acceptance does not mean the email reached your mailbox.',
        'De e-mails van het portaal (een link om in te loggen, een uitnodiging, een wijziging van je adres, een beveiligingsmelding, een nieuw project, een belangrijke wijziging in de status van een project) gaan via dezelfde transactionele e-maildienst als de andere e-mails van de site en worden op dezelfde manier vastgelegd: aan wie, wanneer, in welke taal, van welke soort en of de aanbieder ze heeft geaccepteerd. In het logboek staat de tekst van het bericht niet. Geaccepteerd betekent niet dat de e-mail in je mailbox is aangekomen.',
      ),
      tri(
        'A fiók történetét (létrehozás, belépés, kilépés, címváltás, összekapcsolás, törlési kérés) egy külön napló őrzi, amely csak az esemény fajtáját, azt, hogy ki tette (te, a tulajdonos vagy a rendszer), és egy rövid kódot tartalmaz, nevet, címet és hálózati címet nem. Ezt a naplót a törlés sem távolítja el, de utána már nem köthető személyhez.',
        'The history of the account (made, signed in, signed out, address changed, a record linked, a deletion requested) is kept in a separate log that holds only the kind of event, who did it (you, the owner or the system) and a short code, no name, no address and no network address. A deletion does not remove this log, but afterwards it can no longer be tied to a person.',
        'De geschiedenis van het account (aangemaakt, ingelogd, uitgelogd, adres gewijzigd, een gegeven gekoppeld, een verwijdering aangevraagd) staat in een apart logboek met alleen de soort gebeurtenis, wie het deed (jij, de eigenaar of het systeem) en een korte code, geen naam, geen adres en geen netwerkadres. Een verwijdering haalt dit logboek niet weg, maar daarna is het niet meer aan een persoon te koppelen.',
      ),
      tri(
        'Fájlok megosztása a portálban még nem érhető el, ezért az oldal jelenleg nem tárol számodra megosztott fájlt. A portálon semmit nem mérünk: a portál oldalairól a mérés nem küld eseményt.',
        'Sharing files through the portal is not available yet, so the site currently stores no file shared with you. Nothing on the portal is measured: the measurement sends no event from the portal’s pages.',
        'Bestanden delen via het portaal kan nog niet, dus de site bewaart nu geen bestand dat met je is gedeeld. Op het portaal wordt niets gemeten: de meting stuurt geen gebeurtenis vanaf de pagina’s van het portaal.',
      ),
      tri(
        'A fiókot és a hozzá tartozó projekteket nem az idő múlása törli: a megőrzési időszak (ha a tulajdonos beállított egyet) a fiókokat nem érinti. A portálban kérheted a fiókod és a rólad tárolt adatok törlését; a kérést rögzítjük, és szólunk a tulajdonosnak, de a törlést ő végzi el kézzel, ezért az nem azonnali. Egy e-mail-cím törlésekor a fiók, a belépései, a hozzá tartozó projektek és az ezzel a címmel beküldött ajánlatkérések és foglalások is törlődnek. A lejárt linkek és munkamenetek nyilvántartását a lejárat után nagyjából egy hónappal töröljük.',
        'Time does not delete an account or its projects: a retention period (if the owner has set one) does not touch accounts. In the portal you can ask for your account and the data held about you to be deleted; the request is recorded and the owner is told, but the owner does the deleting by hand, so it is not immediate. When an email address is erased, the account, its sign-ins, its projects and the quote requests and bookings sent with that address are deleted too. The records of expired links and sessions are removed about a month after they expire.',
        'De tijd verwijdert een account of de projecten daarin niet: een bewaartermijn (als de eigenaar er een heeft ingesteld) raakt accounts niet. In het portaal kun je vragen om je account en de gegevens die over je bewaard worden te verwijderen; het verzoek wordt vastgelegd en de eigenaar wordt op de hoogte gebracht, maar de eigenaar verwijdert met de hand, dus het gebeurt niet meteen. Bij het wissen van een e-mailadres worden het account, de sessies, de projecten en de met dat adres verstuurde offerteaanvragen en afspraken ook verwijderd. De gegevens van verlopen links en sessies worden ongeveer een maand na het verlopen verwijderd.',
      ),
    ],
  },
  assistant: {
    title: tri('A Control Room AI', 'Control Room AI', 'Control Room AI'),
    items: [
      tri(
        'Ha a Control Room AI-t használod, az üzeneteid és a válaszai ennek az oldalnak a szerverén keresztül eljutnak az AI-szolgáltatóhoz (Anthropic, Claude), hogy megírhassa a választ. Ez csak akkor történik, ha az asszisztenst megnyitod és üzenetet küldesz.',
        'When you use Control Room AI, your messages and its answers pass through this site’s server to the AI provider (Anthropic, Claude) so that it can write the answer. That happens only when you open the assistant and send a message.',
        'Als je Control Room AI gebruikt, gaan je berichten en de antwoorden via de server van deze site naar de AI-aanbieder (Anthropic, Claude), zodat die het antwoord kan schrijven. Dat gebeurt alleen als je de assistent opent en een bericht verstuurt.',
      ),
      tri(
        'A szerver a beszélgetés szövegét a folytatáshoz tárolja, korlátozott ideig (az oldal tulajdonosa állítja be; a beszélgetés ablakában látod, hány napig). Egy beszélgetést bármikor törölhetsz, ilyenkor a szövege azonnal törlődik. A szám jellegű adatok (hány kérés, hány token) szöveg nélkül tovább megmaradnak, hogy az oldal költségei kézben maradjanak.',
        'The server keeps the conversation text so the conversation can continue, for a limited time (the site’s owner sets it; the conversation window shows how many days). You can delete a conversation at any time, and its text is removed at once. Counts and numbers (how many requests, how many tokens) are kept without the text, so the site’s costs stay under control.',
        'De server bewaart de tekst van het gesprek om het te kunnen voortzetten, gedurende beperkte tijd (de eigenaar van de site stelt die in; het gespreksvenster toont hoeveel dagen). Je kunt een gesprek op elk moment verwijderen, waarna de tekst direct wordt gewist. Aantallen en cijfers (hoeveel verzoeken, hoeveel tokens) blijven zonder tekst bewaard, zodat de kosten van de site beheersbaar blijven.',
      ),
      tri(
        'Ne írj be érzékeny személyes adatot. Az asszisztens csak abból válaszol, ami az oldalon közzé van téve.',
        'Do not enter sensitive personal data. The assistant answers only from what is published on the site.',
        'Voer geen gevoelige persoonsgegevens in. De assistent antwoordt alleen op basis van wat op de site is gepubliceerd.',
      ),
      tri(
        'Ha az asszisztensen át ajánlatot kérsz, a nevedet és az e-mail-címedet a terv melletti panelen adod meg, és csak az ajánlatkéréshez kerülnek: az AI-modell nem látja őket. Semmi nem megy el a jóváhagyásod nélkül.',
        'If you ask for a quote through the assistant, you enter your name and email address in the panel next to the plan, and they go only into the quote request: the AI model does not see them. Nothing is sent without your approval.',
        'Vraag je via de assistent een offerte aan, dan vul je je naam en e-mailadres in het paneel naast het plan in; ze komen alleen in de offerteaanvraag terecht: het AI-model ziet ze niet. Er wordt niets verstuurd zonder jouw goedkeuring.',
      ),
      tri(
        'Hogy az AI-szolgáltató a hozzá küldött szöveggel mit tesz, a szolgáltató saját feltételei szabják meg. Ezt az oldal tulajdonosának kell átnéznie és itt megadnia az indulás előtt.',
        'What the AI provider does with the text sent to it is governed by the provider’s own terms. The site’s owner has to review those and state them here before launch.',
        'Wat de AI-aanbieder met de aan hem gestuurde tekst doet, wordt bepaald door de eigen voorwaarden van de aanbieder. De eigenaar van de site moet die voor de lancering nalezen en hier vermelden.',
      ),
    ],
  },
  recipients: {
    title: tri('Kik kezelik az adataidat', 'Who handles your data', 'Wie je gegevens verwerkt'),
    items: [
      tri(
        'Az oldal a Render tárhelyén fut, és a forgalma a Cloudflare hálózatán megy át. Az adatbázis, benne a foglalásaiddal, azon a szerveren van, ahol az oldal fut. A tárhely és a hálózat szolgáltatója, mint minden ilyen szolgáltató, látja a kéréseidet, és a saját feltételei szerint saját technikai naplót vezethet.',
        'The site runs on Render’s hosting, and its traffic passes through the Cloudflare network. The database, with your bookings in it, is on the server where the site runs. The hosting and network providers, like any such provider, can see your requests and may keep their own technical logs under their own terms.',
        'De site draait bij de hosting van Render en het verkeer loopt via het netwerk van Cloudflare. De database, met je afspraken erin, staat op de server waar de site draait. De hosting- en netwerkaanbieders kunnen, zoals elke aanbieder, je verzoeken zien en kunnen volgens hun eigen voorwaarden eigen technische logs bijhouden.',
      ),
      tri(
        'A tranzakciós e-maileket az oldal tulajdonosa által beállított e-mail-szolgáltatás küldi ki az oldal nevében. Megkapja a címzett e-mail-címét és az üzenet tartalmát, hogy továbbíthassa.',
        'The transactional emails are sent in the site’s name by the email service the site’s owner has set up. It receives the recipient’s email address and the content of the message so that it can send it on.',
        'De transactionele e-mails worden namens de site verstuurd door de e-maildienst die de eigenaar van de site heeft ingesteld. Die ontvangt het e-mailadres van de ontvanger en de inhoud van het bericht om het te kunnen versturen.',
      ),
      tri(
        'Ha az oldal tulajdonosa bekapcsolta az automatikus mentést, az adatbázisról naponta másolat készül, amely a tulajdonos Google Drive tárhelyére kerül; ebben a foglalások is benne vannak. A mentéseket az oldal korlátozott ideig őrzi, utána törli.',
        'If the site’s owner has switched on automatic backups, a copy of the database is made every day and stored in the owner’s Google Drive account; the bookings are in it too. The site keeps the backups for a limited time and then deletes them.',
        'Heeft de eigenaar van de site automatische back-ups ingeschakeld, dan wordt elke dag een kopie van de database gemaakt en opgeslagen in het Google Drive-account van de eigenaar; de afspraken staan daar ook in. De site bewaart de back-ups beperkte tijd en verwijdert ze daarna.',
      ),
      tri(
        'A Control Room AI nem fér hozzá a foglalásokhoz.',
        'Control Room AI has no access to bookings.',
        'Control Room AI heeft geen toegang tot afspraken.',
      ),
    ],
  },
  measurement: {
    title: tri('Mérés', 'Measurement', 'Meten'),
    off: tri(
      'Ez az oldal nem méri a látogatottságot, és nem használ nyomkövetést.',
      'This site does not measure visits and uses no tracking.',
      'Deze site meet geen bezoeken en gebruikt geen tracking.',
    ),
    on: [
      tri(
        'Ez az oldal névtelen eseményeket küldhet arról, hogy mit nyitottak meg (egy szolgáltatás, egy csomag, egy projekt, egy Lab-élmény), hogy egy ajánlatkérés vagy üzenet elment-e, és hogy egy konzultációtípust kiválasztottak-e, elkészült-e egy foglalás, kértek-e lemondást vagy időpont-módosítást. Csak azonosítót és számot tartalmaznak.',
        'This site can send anonymous events about what was opened (a service, a package, a project, a Lab experience), whether a request or message was sent, and whether a consultation type was chosen, a booking was made, or a cancellation or a change of time was asked for. They contain only ids and numbers.',
        'Deze site kan anonieme gebeurtenissen sturen over wat is geopend (een dienst, een pakket, een project, een Lab-ervaring), of een aanvraag of bericht is verzonden en of een soort adviesgesprek is gekozen, een afspraak is gemaakt of om annulering of een tijdwijziging is gevraagd. Ze bevatten alleen id’s en getallen.',
      ),
      tri(
        'Soha nem kerül bele az, amit beírsz egy űrlapba, egy projektleírás, hangfelvétel, a foglalásod linkjének titkos része vagy bármilyen azonosító. A fogadó szerver, mint minden kérésnél, látja a kérés IP-címét; az oldal ezt nem teszi az eseménybe.',
        'What you type into a form, a project description, a recording, the secret part of your booking link or any identifier is never included. The receiving server sees the request’s IP address, as with any request; the site does not put it in the event.',
        'Wat je in een formulier typt, een projectomschrijving, een opname, het geheime deel van de link naar je afspraak of een identificatie wordt nooit meegestuurd. De ontvangende server ziet, zoals bij elk verzoek, het IP-adres; de site zet dat niet in de gebeurtenis.',
      ),
      tri(
        'Csak a hozzájárulásoddal mér. Ha a böngésződ Global Privacy Control vagy Do Not Track jelzést küld, az oldal nem is kérdez, és nem mér. A választásodat a lap alján, a „Mérési beállítások” gombbal bármikor megváltoztathatod.',
        'It measures only with your consent. If your browser sends a Global Privacy Control or Do Not Track signal, the site does not even ask and does not measure. You can change your choice at any time with the “Measurement settings” button at the bottom of the page.',
        'Het meet alleen met je toestemming. Stuurt je browser een Global Privacy Control- of Do Not Track-signaal, dan vraagt de site het niet eens en meet hij niet. Je kunt je keuze altijd wijzigen met de knop ‘Meetinstellingen’ onderaan de pagina.',
      ),
    ],
  },
  choices: {
    title: tri('Amit te irányítasz', 'What you control', 'Wat je zelf bepaalt'),
    items: [
      tri(
        'A fent felsorolt adatokat a böngésződ beállításaiban törölheted (webhelyadatok törlése).',
        'You can delete the items listed above in your browser’s settings (clear site data).',
        'Je kunt de hierboven genoemde gegevens verwijderen in de instellingen van je browser (sitegegevens wissen).',
      ),
      tri(
        'A kosarat a kosár oldalon ürítheted, a Labban mentett munkáidat a mentett munkák panelen törölheted.',
        'You can empty the cart on the cart page, and delete the works you saved in the Lab from the saved-works panel.',
        'Je kunt de winkelmand op de winkelmandpagina legen en de in het Lab bewaarde werken verwijderen in het paneel met bewaarde werken.',
      ),
    ],
  },
  contact: {
    title: tri('Kérdés', 'Questions', 'Vragen'),
    text: tri(
      'Ha kérdésed van az adataidról, írj a Kapcsolat oldalon.',
      'If you have a question about your data, write to me on the Contact page.',
      'Heb je een vraag over je gegevens, schrijf me dan via de contactpagina.',
    ),
    link: tri('Kapcsolat oldal', 'Contact page', 'Contactpagina'),
  },
} as const
