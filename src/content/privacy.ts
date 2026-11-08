import { tri, type Trilingual } from './trilingual'

/**
 * The privacy and cookie notice, in three languages. Everything it says is something the site's code does
 * (src/content/privacy.test.ts reads the sources to keep the list of stored items in step with them), and
 * nothing it says is a promise about what the owner does with a message after it has arrived: that, and the
 * owner's own details, are theirs to add (README, "Before launch"). It is not legal advice.
 */

export interface StoredItem {
  /** The name the browser stores it under: a proper noun, shown as is. */
  name: string
  where: 'localStorage' | 'sessionStorage' | 'IndexedDB'
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
      'The services, packages and add-ons you picked for a quote request. It holds no name, e-mail address or message.',
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
      'The AI assistant’s session code and the id of the conversation you are in. It holds no name, e-mail address or message. The code is sent to this site’s own server when you use the assistant. It lasts until the tab is closed.',
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
      'Ez az oldal nem állít be sütiket.',
      'This site does not set any cookies.',
      'Deze site plaatst geen cookies.',
    ),
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
        'De site laadt zijn eigen lettertypen en afbeeldingen. Hij gebruikt geen externe lettertype-, kaart-, video- of socialemediadiensten.',
      ),
      tri(
        'A kapcsolatfelvételi űrlap és az ajánlatkérő csak akkor küld el adatot, ha megnyomod az elküldés gombot, és csak az oldal tulajdonosa által beállított címre. Az elküldésig amit beírsz, csak a memóriában van, a böngésző tárolójába nem kerül.',
        'The contact form and the request builder send data only when you press send, and only to the address the site’s owner has set up. What you type stays in memory until then and is never written to your browser’s storage.',
        'Het contactformulier en de aanvraagbouwer versturen alleen gegevens als je op verzenden drukt, en alleen naar het adres dat de eigenaar van de site heeft ingesteld. Wat je typt blijft tot dat moment in het geheugen en wordt nooit in de opslag van je browser geschreven.',
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
        'If you ask for a quote through the assistant, you enter your name and e-mail address in the panel next to the plan, and they go only into the quote request: the AI model does not see them. Nothing is sent without your approval.',
        'Vraag je via de assistent een offerte aan, dan vul je je naam en e-mailadres in het paneel naast het plan in; ze komen alleen in de offerteaanvraag terecht: het AI-model ziet ze niet. Er wordt niets verstuurd zonder jouw goedkeuring.',
      ),
      tri(
        'Hogy az AI-szolgáltató a hozzá küldött szöveggel mit tesz, a szolgáltató saját feltételei szabják meg. Ezt az oldal tulajdonosának kell átnéznie és itt megadnia az indulás előtt.',
        'What the AI provider does with the text sent to it is governed by the provider’s own terms. The site’s owner has to review those and state them here before launch.',
        'Wat de AI-aanbieder met de aan hem gestuurde tekst doet, wordt bepaald door de eigen voorwaarden van de aanbieder. De eigenaar van de site moet die voor de lancering nalezen en hier vermelden.',
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
        'Ez az oldal névtelen eseményeket küldhet arról, hogy mit nyitottak meg (egy szolgáltatás, egy csomag, egy projekt, egy Lab-élmény), és hogy egy ajánlatkérés vagy üzenet elment-e. Csak azonosítót és számot tartalmaznak.',
        'This site can send anonymous events about what was opened (a service, a package, a project, a Lab experience) and whether a request or message was sent. They contain only ids and numbers.',
        'Deze site kan anonieme gebeurtenissen sturen over wat is geopend (een dienst, een pakket, een project, een Lab-ervaring) en of een aanvraag of bericht is verzonden. Ze bevatten alleen id’s en getallen.',
      ),
      tri(
        'Soha nem kerül bele az, amit beírsz egy űrlapba, egy projektleírás, hangfelvétel vagy bármilyen azonosító. A fogadó szerver, mint minden kérésnél, látja a kérés IP-címét; az oldal ezt nem teszi az eseménybe.',
        'What you type into a form, a project description, a recording or any identifier is never included. The receiving server sees the request’s IP address, as with any request; the site does not put it in the event.',
        'Wat je in een formulier typt, een projectomschrijving, een opname of een identificatie wordt nooit meegestuurd. De ontvangende server ziet, zoals bij elk verzoek, het IP-adres; de site zet dat niet in de gebeurtenis.',
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
