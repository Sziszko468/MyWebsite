import { tri } from './trilingual'
import type { ProjectDetail } from './types'

/*
 * BookingHub. Source: the code of Bookingsite/booking-app (src/, package.json) and its git history,
 * read on 2026-10-28; the README was used only where the code agrees with it. Where they differ the
 * code wins. Known differences: the README says "Next.js 15" (package.json has 16), says the theme
 * follows the system setting (the code only remembers a toggle) and lists an /api/test route (it does
 * not exist); the sign-in is described as secure, but it is a fixed demo account checked in the browser.
 *
 * The screenshots were taken from a copy of the running app with its own sample data. The landing
 * page is deliberately not shown: its "10K+ users", "99.9% uptime" and rating figures are placeholder
 * marketing text, not measurements.
 */
export const bookinghub: ProjectDetail = {
  id: 'bookinghub',
  repoName: null,
  accent: 'blue',
  hero: 'stack',
  reviewed: '2026-10-28',
  sourceUrl: null,

  summary: tri(
    'Egy Next.js időpontfoglaló prototípus: nyilvános foglalási űrlap e-mail-visszaigazolással, és admin felület vezérlőpulttal, időpontlistával, naptárral és ügyfélnézettel. Az adatok ma a böngészőben élnek; a tárolóréteg arra készült, hogy később háttérrendszerre váltson.',
    'A Next.js appointment-booking prototype: a public booking form with e-mail confirmation, and an admin area with a dashboard, an appointment list, a calendar and a client view. The data lives in the browser today; the storage layer is built to move to a backend later.',
    'Een Next.js-prototype voor afsprakenboeking: een openbaar boekingsformulier met e-mailbevestiging en een beheeromgeving met dashboard, afsprakenlijst, kalender en klantoverzicht. De data leeft nu in de browser; de opslaglaag is gebouwd om later naar een backend te verhuizen.',
  ),

  role: tri(
    'Egyszemélyes projekt: a tároló minden commitját én készítettem.',
    'A single-author project: every commit in the repository is mine.',
    'Een project van één auteur: elke commit in de repository is van mij.',
  ),

  stack: [
    { group: 'frontend', items: ['Next.js 16', 'React 19', 'TypeScript', 'Tailwind CSS', 'Lucide'] },
    { group: 'services', items: ['Resend (e-mail)'] },
  ],

  overview: {
    what: tri(
      'Az időpontfoglalás ügyféloldali folyamatának és az adminisztrációs felületnek működő prototípusa: az ügyfelek nyilvános űrlapon foglalnak, az admin pedig időpontokat, havi naptárat és automatikusan épülő ügyféllistát kezel.',
      'A working prototype of the client-side booking flow and the admin screens: clients book through a public form, and an admin manages appointments, a monthly calendar and an automatically built client list.',
      'Een werkend prototype van de boekingsstroom voor klanten en de beheerschermen: klanten boeken via een openbaar formulier en een beheerder beheert afspraken, een maandkalender en een automatisch opgebouwde klantenlijst.',
    ),
    audience: tri(
      'Egy időpontot adó szolgáltatónak és azoknak, akik időpontot foglalnak nála. A mintaszolgáltatások (konzultáció, kezelés, ellenőrzés…) helyőrzők.',
      'A service provider who takes appointments, and the people who book them. The sample services (consultation, treatment, check-up…) are placeholders.',
      'Een dienstverlener die afspraken aanneemt en de mensen die erbij boeken. De voorbeelddiensten (consult, behandeling, controle…) zijn placeholders.',
    ),
    problem: tri(
      'Az időpontok fogadása és követése egy helyen: ki mikorra foglalt mit, és mi lett az időponttal.',
      'Taking bookings and keeping track of them in one place: who booked what and when, and what happened to the appointment.',
      'Boekingen aannemen en bijhouden op één plek: wie wat wanneer boekte en wat er met de afspraak gebeurde.',
    ),
    goal: tri(
      'A teljes foglalási folyamat és az admin képernyők felépítése működő prototípusként, úgy, hogy az adatréteg különálló maradjon, és a böngészőtárolót később egy valódi háttérrendszer válthassa fel.',
      'To build the whole booking flow and the admin screens as a working prototype, with the data layer kept separate so that the browser storage can later be replaced by a real backend.',
      'De hele boekingsstroom en de beheerschermen bouwen als werkend prototype, met een aparte datalaag zodat de browseropslag later door een echte backend kan worden vervangen.',
    ),
  },

  challenges: [
    {
      title: tri(
        'Tárolás, amely a képernyők érintése nélkül cserélhető',
        'Storage that can change without touching the screens',
        'Opslag die kan veranderen zonder de schermen aan te raken',
      ),
      problem: tri(
        'A prototípusnak adatra volt szüksége háttérrendszer nélkül, de a képernyőknek nem szabadott változniuk, amikor egy háttérrendszer megérkezik.',
        'The prototype needed data without a backend, but the screens should not have to change when a backend arrives.',
        'Het prototype had data nodig zonder backend, maar de schermen mogen niet hoeven te veranderen zodra er een backend komt.',
      ),
      solution: tri(
        'Egyetlen időpont-szolgáltatás választ egy localStorage-szolgáltató és egy API-szolgáltató (időtúllépéses fetch-burkoló típusos hibákkal) között egyetlen konfigurációs kapcsoló alapján; a képernyők csak a szolgáltatást és egy hookot hívnak. Az API-szolgáltató megírt, de háttérrendszer híján még nem futott ellene, mert a tárolóban nincs ilyen.',
        'A single appointment service chooses between a localStorage provider and an API provider (a fetch wrapper with a timeout and typed errors) from one configuration switch; the screens only call the service and a hook. The API provider is written, but it has not been run against a backend, because the repository has none.',
        'Eén afsprakenservice kiest tussen een localStorage-provider en een API-provider (een fetch-wrapper met timeout en getypeerde fouten) op basis van één configuratieschakelaar; de schermen roepen alleen de service en een hook aan. De API-provider is geschreven, maar nog niet tegen een backend gedraaid, omdat de repository er geen heeft.',
      ),
      source: 'src/services/appointmentApi.ts · apiClient.ts',
    },
    {
      title: tri(
        'A foglalás nem bukhat el egy e-mail miatt',
        'A booking must not fail because an e-mail did',
        'Een boeking mag niet mislukken door een e-mail',
      ),
      problem: tri(
        'A visszaigazoló e-mail egy külső szolgáltatástól és egy API-kulcstól függ, amely hiányozhat.',
        'The confirmation e-mail depends on an external service and an API key that may be missing.',
        'De bevestigingsmail hangt af van een externe dienst en een API-sleutel die kan ontbreken.',
      ),
      solution: tri(
        'A foglalás előbb mentődik; az e-mailt egy szerveroldali útvonal küldi utána, és a hibája elkapva naplózódik, a foglalást nem blokkolja. Kulcs nélkül az útvonal egyértelműen jelzett teszt módban fut, amely csak szimulálja a küldést.',
        'The booking is saved first; the e-mail is sent through a server-side route afterwards, and its failure is caught and logged without blocking the booking. Without a key the route runs in a clearly reported test mode that only simulates sending.',
        'De boeking wordt eerst opgeslagen; de e-mail wordt daarna via een serverroute verstuurd en een fout daarin wordt opgevangen en gelogd zonder de boeking te blokkeren. Zonder sleutel draait de route in een duidelijk gemelde testmodus die het versturen alleen simuleert.',
      ),
      source: 'src/app/book/page.tsx · src/services/emailService.ts',
    },
    {
      title: tri(
        'Az admin felület védelme (prototípus-szinten)',
        'Protecting the admin area (at prototype level)',
        'De beheeromgeving beschermen (op prototypeniveau)',
      ),
      problem: tri(
        'Az admin képernyők bejelentkezés nélkül ne nyíljanak meg. A commit-előzmények több kört mutatnak a hitelesítés és az útvonalvédelem körül (hitelesítési javítások, védett útvonalak, hibakeresési naplózás).',
        'The admin screens should not open without signing in. The commit history shows several rounds around authentication and route protection (auth fixes, protected routes, debug logging).',
        'De beheerschermen mogen niet zonder inloggen openen. De commitgeschiedenis toont meerdere rondes rond authenticatie en routebescherming (auth-fixes, beschermde routes, debuglogging).',
      ),
      solution: tri(
        'Egy útvonalcsoport egy ProtectedRoute-ba csomagolja az admin oldalakat, amely a böngészőtárolóban lévő jelzőt ellenőrzi. Ez demóbejelentkezés egy fix fiókkal, nem valódi hitelesítés: a jelzőt bárki beállíthatja, és szerveroldalon semmi nem ellenőrzi.',
        'A route group wraps the admin pages in a ProtectedRoute that checks a flag in browser storage. This is a demo sign-in with a fixed account, not real authentication: anyone can set the flag, and nothing on the server checks it.',
        'Een routegroep verpakt de beheerpagina’s in een ProtectedRoute die een vlag in de browseropslag controleert. Dit is een demo-aanmelding met een vast account, geen echte authenticatie: iedereen kan de vlag zetten en niets op de server controleert hem.',
      ),
      source: 'src/services/auth.ts · src/components/auth/ProtectedRoute.tsx · git history',
    },
  ],

  approach: [
    {
      title: tri('Foglalás → mentés → visszaigazolás', 'Book, save, confirm', 'Boeken, opslaan, bevestigen'),
      text: tri(
        'A nyilvános űrlap ellenőrzi a kötelező mezőket, az e-mail formátumát és hogy a dátum ne legyen múltbeli; az időpont-szolgáltatáson át ment, majd megkéri a szerveroldali útvonalat a visszaigazolás elküldésére. A látogató összefoglalót kap az időpontról.',
        'The public form checks the required fields, the e-mail format and that the date is not in the past; it saves through the appointment service, then asks the server route to send the confirmation. The visitor gets a summary of the appointment.',
        'Het openbare formulier controleert de verplichte velden, het e-mailformaat en dat de datum niet in het verleden ligt; het slaat op via de afsprakenservice en vraagt dan de serverroute de bevestiging te versturen. De bezoeker krijgt een samenvatting van de afspraak.',
      ),
    },
    {
      title: tri('Egyetlen adatszolgáltatás', 'One data service', 'Eén dataservice'),
      text: tri(
        'Az összes képernyő ugyanazon a szolgáltatáson és egy hookon át olvas és ír; a szolgáltató cseréje egy kapcsoló, nem képernyőnkénti átírás.',
        'Every screen reads and writes through the same service and one hook; swapping the provider is a switch, not a rewrite of each screen.',
        'Elk scherm leest en schrijft via dezelfde service en één hook; het wisselen van provider is een schakelaar, geen herschrijving van elk scherm.',
      ),
    },
    {
      title: tri('Az admin felület útvonalcsoportként', 'The admin area as a route group', 'De beheeromgeving als routegroep'),
      text: tri(
        'A Next.js App Routerben egy (protected) csoport: vezérlőpult, időpontok (keresés, állapotszűrő, szerkesztés jegyzettel, törlés), naptár, ügyfelek és e-mail-beállítások. Az elrendezésben asztalon oldalsáv, telefonon alsó sáv van.',
        'In the Next.js App Router, a (protected) group: dashboard, appointments (search, status filter, edit with notes, delete), calendar, clients and e-mail settings. The layout has a sidebar on desktop and a bottom bar on phones.',
        'In de Next.js App Router een (protected)-groep: dashboard, afspraken (zoeken, statusfilter, bewerken met notities, verwijderen), kalender, klanten en e-mailinstellingen. De layout heeft een zijbalk op desktop en een onderbalk op telefoons.',
      ),
    },
    {
      title: tri('Származtatott adat, nem kétszer tárolt', 'Derived data, not stored twice', 'Afgeleide data, niet dubbel opgeslagen'),
      text: tri(
        'Az ügyfeleket az időpontokból összesíti a kód (név, e-mail, foglalások száma, utolsó látogatás), a vezérlőpult statisztikái ugyanabból a listából számolódnak.',
        'Clients are aggregated from the appointments (name, e-mail, number of bookings, last visit), and the dashboard statistics are computed from the same list.',
        'Klanten worden uit de afspraken samengesteld (naam, e-mail, aantal boekingen, laatste bezoek) en de dashboardstatistieken worden uit dezelfde lijst berekend.',
      ),
    },
  ],

  architecture: {
    tiers: [
      {
        id: 'browser',
        label: tri('Böngésző', 'Browser', 'Browser'),
        nodes: [
          {
            id: 'ui',
            label: 'Next.js client components',
            detail: tri('React 19 · App Router oldalak', 'React 19 · App Router pages', 'React 19 · App Router-pagina’s'),
            status: 'built',
          },
          {
            id: 'storage',
            label: 'localStorage',
            detail: tri(
              'időpontok, bejelentkezési jelző, e-mail-beállítások',
              'appointments, sign-in flag, e-mail settings',
              'afspraken, aanmeldvlag, e-mailinstellingen',
            ),
            status: 'built',
          },
        ],
      },
      {
        id: 'server',
        label: tri('Szerver', 'Server', 'Server'),
        nodes: [
          {
            id: 'routes',
            label: 'Next.js API routes',
            detail: tri('/api/send-email · /api/email-status', '/api/send-email · /api/email-status', '/api/send-email · /api/email-status'),
            status: 'built',
          },
          {
            id: 'backend',
            label: 'Backend REST API',
            detail: tri(
              'a szolgáltató /appointments, /auth, /users végpontokat vár; háttérrendszer nincs a tárolóban',
              'the provider expects /appointments, /auth and /users; there is no backend in the repository',
              'de provider verwacht /appointments, /auth en /users; er is geen backend in de repository',
            ),
            status: 'planned',
          },
        ],
      },
      {
        id: 'external',
        label: tri('Külső szolgáltatás', 'External service', 'Externe dienst'),
        nodes: [
          {
            id: 'resend',
            label: 'Resend',
            detail: tri('tranzakciós e-mail; kulcs nélkül teszt mód', 'transactional e-mail; test mode without a key', 'transactionele e-mail; testmodus zonder sleutel'),
            status: 'built',
          },
        ],
      },
    ],
    links: [
      { from: 'ui', to: 'storage', label: tri('olvassa és írja az időpontokat (alapértelmezett szolgáltató)', 'reads and writes appointments (default provider)', 'leest en schrijft afspraken (standaardprovider)') },
      { from: 'ui', to: 'routes', label: tri('POST /api/send-email (visszaigazolás)', 'POST /api/send-email (confirmation)', 'POST /api/send-email (bevestiging)') },
      { from: 'routes', to: 'resend', label: tri('HTTPS, csak ha van kulcs', 'HTTPS, only when a key is set', 'HTTPS, alleen als er een sleutel is') },
      { from: 'ui', to: 'backend', label: tri('REST, egyetlen kapcsolóval bekapcsolható; még nem futott ellene', 'REST, switched on by one flag; never run against a backend yet', 'REST, aan te zetten met één schakelaar; nog nooit tegen een backend gedraaid'), status: 'planned' },
    ],
    note: tri(
      'A szaggatott elemek tervek: a kód előkészíti, de nem tartalmazza őket.',
      'Dashed items are plans: the code prepares for them but does not contain them.',
      'Onderbroken items zijn plannen: de code bereidt ze voor maar bevat ze niet.',
    ),
  },

  features: [
    {
      status: 'done',
      title: tri('Nyilvános foglalási űrlap', 'Public booking form', 'Openbaar boekingsformulier'),
      text: tri(
        'Név, e-mail, szolgáltatás (hat mintaszolgáltatás időtartammal és árral), dátum mától és időpont. Kötelező mezők és e-mail-formátum ellenőrzése, hibaüzenet, majd összefoglaló képernyő a foglalás adataival.',
        'Name, e-mail, service (six sample services with a duration and a price), a date from today and a time. Required-field and e-mail-format checks, an error message, then a summary screen with the booking details.',
        'Naam, e-mail, dienst (zes voorbeelddiensten met duur en prijs), een datum vanaf vandaag en een tijd. Controle op verplichte velden en e-mailformaat, een foutmelding en daarna een samenvattingsscherm met de boekingsgegevens.',
      ),
      image: 'booking-form',
    },
    {
      status: 'done',
      title: tri('Visszaigazoló e-mail', 'Confirmation e-mail', 'Bevestigingsmail'),
      text: tri(
        'A foglalás után egy szerveroldali útvonal elküldi a visszaigazolást a Resend szolgáltatáson át. API-kulcs nélkül teszt módban fut, amely csak szimulál, és ezt az admin felület ki is írja.',
        'After a booking, a server route sends the confirmation through Resend. Without an API key it runs in a test mode that only simulates, and the admin area says so.',
        'Na een boeking verstuurt een serverroute de bevestiging via Resend. Zonder API-sleutel draait het in een testmodus die alleen simuleert, en de beheeromgeving meldt dat.',
      ),
      image: 'email-settings',
    },
    {
      status: 'done',
      title: tri('Időpontkezelés', 'Appointment management', 'Afsprakenbeheer'),
      text: tri(
        'Lista kereséssel és állapotszűrővel (ütemezett, teljesült, lemondott), szerkesztő ablak jegyzetekkel, állapotváltás és törlés. Új időpont az admin felületről is felvehető.',
        'A list with search and a status filter (scheduled, completed, cancelled), an edit dialog with notes, status changes and deletion. New appointments can also be created from the admin area.',
        'Een lijst met zoeken en een statusfilter (gepland, voltooid, geannuleerd), een bewerkvenster met notities, statuswijzigingen en verwijderen. Nieuwe afspraken kunnen ook vanuit de beheeromgeving worden aangemaakt.',
      ),
    },
    {
      status: 'done',
      title: tri('Havi naptár', 'Monthly calendar', 'Maandkalender'),
      text: tri(
        'Hónapok közti lapozás, „Ma” gomb, a szomszédos hónapok napjai halványan, minden naphoz az időpontok állapot szerint színezett bejegyzései és jelmagyarázat.',
        'Navigation between months, a "Today" button, neighbouring months’ days shown dimmed, and for each day its appointments coloured by status, with a legend.',
        'Navigatie tussen maanden, een "Vandaag"-knop, dagen van aangrenzende maanden gedimd weergegeven en per dag de afspraken gekleurd naar status, met een legenda.',
      ),
      image: 'calendar',
    },
    {
      status: 'done',
      title: tri('Ügyfelek és vezérlőpult', 'Clients and dashboard', 'Klanten en dashboard'),
      text: tri(
        'Az ügyféllista az időpontokból épül: foglalások száma, utolsó látogatás, előzmények, keresés. A vezérlőpult összes foglalást, a mai és heti időpontokat, az egyedi ügyfeleket és a szolgáltatások megoszlását mutatja.',
        'The client list is built from the appointments: number of bookings, last visit, history, search. The dashboard shows total bookings, today’s and this week’s appointments, unique clients and the service breakdown.',
        'De klantenlijst wordt uit de afspraken opgebouwd: aantal boekingen, laatste bezoek, geschiedenis, zoeken. Het dashboard toont totaal boekingen, afspraken van vandaag en deze week, unieke klanten en de verdeling per dienst.',
      ),
      image: 'clients',
    },
    {
      status: 'done',
      title: tri('Sötét és világos téma', 'Dark and light theme', 'Donker en licht thema'),
      text: tri(
        'Egy CSS-változókészlet két témához; alapból sötét, a fejlécben kapcsoló, a választás a böngészőben megmarad. A téma nem követi a rendszerbeállítást.',
        'One set of CSS variables for two themes; dark by default, a toggle in the header, and the choice is remembered in the browser. The theme does not follow the system setting.',
        'Eén set CSS-variabelen voor twee thema’s; standaard donker, een schakelaar in de koptekst en de keuze wordt in de browser onthouden. Het thema volgt de systeeminstelling niet.',
      ),
      image: 'calendar-light',
    },
    {
      status: 'partial',
      title: tri('Bejelentkezés', 'Sign-in', 'Aanmelden'),
      text: tri(
        'Egy fix demófiókkal működik, a böngészőtárolóban lévő jelzővel. Az admin oldalak elrejtésére jó a bemutatóhoz, de nem valódi hitelesítés.',
        'It works with one fixed demo account and a flag in browser storage. Good enough to hide the admin pages in a demo, but not real authentication.',
        'Het werkt met één vast demoaccount en een vlag in de browseropslag. Goed genoeg om de beheerpagina’s in een demo te verbergen, maar geen echte authenticatie.',
      ),
    },
    {
      status: 'partial',
      title: tri('E-mail-beállítások', 'E-mail settings', 'E-mailinstellingen'),
      text: tri(
        'A kapcsolók (visszaigazolás, emlékeztető és időzítése, lemondás) csak a böngészőben mentődnek, és nem vezérlik a küldést. Az emlékeztető és a lemondás sablonja megvan, de semmi nem küldi el őket.',
        'The toggles (confirmation, reminder and its timing, cancellation) are saved in the browser only and do not control sending. Templates for the reminder and the cancellation exist, but nothing sends them.',
        'De schakelaars (bevestiging, herinnering en timing, annulering) worden alleen in de browser opgeslagen en sturen het versturen niet aan. Sjablonen voor de herinnering en de annulering bestaan, maar niets verstuurt ze.',
      ),
      image: 'email-settings',
    },
    {
      status: 'partial',
      title: tri('API-mód háttérrendszerrel', 'API mode with a backend', 'API-modus met een backend'),
      text: tri(
        'Az API-szolgáltató és a hibakezelő fetch-burkoló megvan, de alapból ki van kapcsolva, és háttérrendszer híján még sosem futott valóssal szemben.',
        'The API provider and its error-handling fetch wrapper exist, but it is switched off by default and, with no backend to run against, has never been run against a real one.',
        'De API-provider en de foutafhandelende fetch-wrapper bestaan, maar staan standaard uit en zijn, bij gebrek aan een backend, nog nooit tegen een echte gedraaid.',
      ),
    },
    {
      status: 'planned',
      title: tri('Valódi háttérrendszer és hitelesítés', 'A real backend and authentication', 'Een echte backend en authenticatie'),
      text: tri(
        'A README szerint a következő lépés egy háttérrendszer építése és az API-mód bekapcsolása; a szolgáltatásréteg erre van előkészítve.',
        'According to the README, the next step is to build a backend and switch API mode on; the service layer is prepared for it.',
        'Volgens de README is de volgende stap een backend bouwen en de API-modus aanzetten; de servicelaag is daarop voorbereid.',
      ),
    },
  ],

  limits: [
    tri(
      'Nincs szabadidőpont- vagy ütközésellenőrzés: bármely dátum és időpont kérhető, kétszeres foglalás megelőzése nincs.',
      'There is no availability or conflict check: any date and time can be requested, and double bookings are not prevented.',
      'Er is geen beschikbaarheids- of conflictcontrole: elke datum en tijd kan worden aangevraagd en dubbele boekingen worden niet voorkomen.',
    ),
    tri(
      'A tárolóban nincsenek automatizált tesztek.',
      'The repository has no automated tests.',
      'De repository heeft geen geautomatiseerde tests.',
    ),
    tri(
      'A nyitóoldal számai (felhasználók, üzemidő, értékelés) és a vezérlőpult trendjelvényei mintatartalom, nem mérések.',
      'The figures on the landing page (users, uptime, rating) and the trend badges on the dashboard are sample content, not measurements.',
      'De cijfers op de landingspagina (gebruikers, uptime, beoordeling) en de trendbadges op het dashboard zijn voorbeeldinhoud, geen metingen.',
    ),
    tri(
      'Az adatok a böngészőben élnek: egy másik eszközön vagy böngészőben nem látszanak.',
      'The data lives in the browser: it is not visible from another device or browser.',
      'De data leeft in de browser: ze is niet zichtbaar vanaf een ander apparaat of een andere browser.',
    ),
  ],

  decisions: [
    {
      title: tri('Két téma egy változókészletből', 'Two themes from one set of variables', 'Twee thema’s uit één set variabelen'),
      text: tri(
        'A színek CSS-változók, a sötét téma az alapértelmezett, a világos a változók felülírása. A választás a böngészőben marad, így a következő látogatás ugyanúgy néz ki.',
        'Colours are CSS variables; dark is the default and light overrides the variables. The choice stays in the browser, so the next visit looks the same.',
        'Kleuren zijn CSS-variabelen; donker is de standaard en licht overschrijft de variabelen. De keuze blijft in de browser, zodat het volgende bezoek er hetzelfde uitziet.',
      ),
    },
    {
      title: tri('A foglalás előtt látszik, mit választottál', 'You see what you chose before you book', 'Je ziet wat je koos voordat je boekt'),
      text: tri(
        'Az űrlap a kiválasztott szolgáltatás időtartamát és árát az űrlapon belül mutatja, és a foglalás után egy összefoglaló képernyő ismétli meg az adatokat és azt az e-mail-címet, ahová a visszaigazolás ment.',
        'The form shows the chosen service’s duration and price in place, and after booking a summary screen repeats the details and the e-mail address the confirmation was sent to.',
        'Het formulier toont de duur en prijs van de gekozen dienst ter plekke en na het boeken herhaalt een samenvattingsscherm de gegevens en het e-mailadres waarheen de bevestiging ging.',
      ),
    },
    {
      title: tri('Az állapotot szín és szöveg is mondja', 'Status is told by colour and by text', 'Status wordt door kleur en tekst verteld'),
      text: tri(
        'A naptárban az ütemezett kék, a teljesült zöld, a lemondott piros, jelmagyarázattal; a listában ugyanezek az állapotok szóval is szerepelnek.',
        'In the calendar, scheduled is blue, completed green and cancelled red, with a legend; in the list the same statuses are also written out.',
        'In de kalender is gepland blauw, voltooid groen en geannuleerd rood, met een legenda; in de lijst staan dezelfde statussen ook uitgeschreven.',
      ),
    },
    {
      title: tri('Telefonon alsó navigáció', 'Bottom navigation on phones', 'Onderste navigatie op telefoons'),
      text: tri(
        'A telefonos elrendezés alsó sávot használ kiemelt hozzáadás gombbal, hogy a fő műveletek a hüvelykujj közelében legyenek; asztalon oldalsáv van.',
        'The phone layout uses a bottom bar with a raised add button so the main actions are near the thumb; on desktop there is a sidebar.',
        'De telefoonlayout gebruikt een onderbalk met een verhoogde toevoegknop zodat de hoofdacties dicht bij de duim liggen; op desktop is er een zijbalk.',
      ),
    },
  ],

  learned: [],

  next: [
    tri(
      'Az előkészített API-szolgáltató összekötése egy valódi háttérrendszerrel, és a demóbejelentkezés cseréje valódi hitelesítésre.',
      'Connect the prepared API provider to a real backend and replace the demo sign-in with real authentication.',
      'De voorbereide API-provider koppelen aan een echte backend en de demo-aanmelding vervangen door echte authenticatie.',
    ),
    tri(
      'Szabadidőpont- és ütközésellenőrzés a foglalási folyamatban.',
      'Availability and conflict checks in the booking flow.',
      'Beschikbaarheids- en conflictcontroles in de boekingsstroom.',
    ),
    tri(
      'Automatizált tesztek a foglalási folyamatra és az adatszolgáltatásra.',
      'Automated tests for the booking flow and the data service.',
      'Geautomatiseerde tests voor de boekingsstroom en de dataservice.',
    ),
  ],

  gallery: [
    {
      id: 'calendar',
      src: '/projects/bookinghub/calendar.webp',
      width: 1440,
      height: 900,
      device: 'desktop',
      hero: true,
      alt: tri(
        'A havi naptár 2026 februárjával: három időpont a hónap 18., 20. és 21. napján, állapot szerint színezve, jelmagyarázattal.',
        'The monthly calendar showing February 2026: three appointments on the 18th, 20th and 21st, coloured by status, with a legend.',
        'De maandkalender met februari 2026: drie afspraken op de 18e, 20e en 21e, gekleurd naar status, met een legenda.',
      ),
      caption: tri('Havi naptár, sötét téma', 'Monthly calendar, dark theme', 'Maandkalender, donker thema'),
    },
    {
      id: 'booking-form',
      src: '/projects/bookinghub/booking-form.webp',
      width: 720,
      height: 618,
      device: 'desktop',
      alt: tri(
        'A nyilvános foglalási űrlap: név, e-mail, szolgáltatás időtartammal és árral, dátum és időpont.',
        'The public booking form: name, e-mail, a service with duration and price, date and time.',
        'Het openbare boekingsformulier: naam, e-mail, een dienst met duur en prijs, datum en tijd.',
      ),
      caption: tri('Nyilvános foglalási űrlap', 'Public booking form', 'Openbaar boekingsformulier'),
    },
    {
      id: 'calendar-light',
      src: '/projects/bookinghub/calendar-light.webp',
      width: 1440,
      height: 900,
      device: 'desktop',
      alt: tri('Ugyanaz a naptár világos témában.', 'The same calendar in the light theme.', 'Dezelfde kalender in het lichte thema.'),
      caption: tri('Világos téma', 'Light theme', 'Licht thema'),
    },
    {
      id: 'clients',
      src: '/projects/bookinghub/clients.webp',
      width: 1440,
      height: 900,
      device: 'desktop',
      alt: tri(
        'Az ügyfélnézet: két ügyfél foglalásszámmal és utolsó látogatás dátumával, összesítő kártyákkal.',
        'The client view: two clients with their number of bookings and last visit, with summary cards.',
        'Het klantenoverzicht: twee klanten met hun aantal boekingen en laatste bezoek, met samenvattingskaarten.',
      ),
      caption: tri('Ügyfelek az időpontokból összesítve', 'Clients aggregated from appointments', 'Klanten samengesteld uit afspraken'),
    },
    {
      id: 'email-settings',
      src: '/projects/bookinghub/email-settings.webp',
      width: 1440,
      height: 900,
      device: 'desktop',
      alt: tri(
        'Az e-mail-beállítások oldal: „TEST MODE” jelzés, három kapcsoló és egy beállítási útmutató.',
        'The e-mail settings page: a "TEST MODE" notice, three toggles and a setup guide.',
        'De pagina met e-mailinstellingen: een "TEST MODE"-melding, drie schakelaars en een installatiehandleiding.',
      ),
      caption: tri('E-mail-beállítások teszt módban', 'E-mail settings in test mode', 'E-mailinstellingen in testmodus'),
    },
    {
      id: 'mobile-booking-form',
      src: '/projects/bookinghub/mobile-booking-form.webp',
      width: 520,
      height: 887,
      device: 'mobile',
      alt: tri('A foglalási űrlap telefonméretben, egy oszlopban.', 'The booking form at phone size, in one column.', 'Het boekingsformulier op telefoonformaat, in één kolom.'),
      caption: tri('Foglalási űrlap telefonon', 'Booking form on a phone', 'Boekingsformulier op een telefoon'),
    },
  ],

  galleryNote: tri(
    'A képernyőképek az alkalmazás futó példányáról készültek, a saját mintaadataival. A nyitóoldalt szándékosan nem mutatom: a számai helyőrző marketingszöveg.',
    'The screenshots come from a running copy of the app with its own sample data. The landing page is left out on purpose: its figures are placeholder marketing text.',
    'De schermafbeeldingen komen van een draaiende kopie van de app met zijn eigen voorbeelddata. De landingspagina is bewust weggelaten: de cijfers daarop zijn placeholder-marketingtekst.',
  ),
}
