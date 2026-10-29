import { tri } from '../trilingual'
import type { ProjectDetail } from './types'

/*
 * Spendly. Source: the project's repository (Spendly/README.md, docs/code-review.md, docs/design-system.md),
 * read on 2026-10-28, and a check that the code for each documented feature exists. The test suites
 * were not re-run for this page. In the repository the product is called WALLEX; Spendly was its
 * earlier name (docs/code-review.md, "rename to WALLEX").
 *
 * Everything below is taken from those documents. Numbers that change (test counts, operation
 * counts) are left out on purpose.
 */
export const spendly: ProjectDetail = {
  id: 'spendly',
  repoName: 'WALLEX',
  accent: 'red',
  hero: 'split',
  reviewed: '2026-10-28',
  sourceUrl: null,

  summary: tri(
    'Személyes pénzügyi platform: kiadások rögzítése (vagy a blokk beolvasása), havi költségkeretek, és egy vezérlőpult, amely érthetően elmondja, mi változott. Egyetlen API szolgálja ki a webes és a mobil klienst.',
    'A personal finance platform: record spending (or scan the receipt), set monthly budgets, and read a dashboard that says in plain language what changed. One API serves the web and the mobile client.',
    'Een persoonlijk financieel platform: uitgaven vastleggen (of de bon scannen), maandbudgetten instellen en een dashboard lezen dat in gewone taal zegt wat er veranderd is. Eén API bedient de web- en de mobiele client.',
  ),

  role: tri(
    'Egyszemélyes projekt: a tároló minden commitját én készítettem.',
    'A single-author project: every commit in the repository is mine.',
    'Een project van één auteur: elke commit in de repository is van mij.',
  ),

  stack: [
    {
      group: 'frontend',
      items: ['React 19', 'TypeScript', 'Vite', 'React Router', 'Recharts', 'SCSS modules', 'i18next', 'React Native', 'Expo'],
    },
    {
      group: 'backend',
      items: ['Python 3.13', 'Django 5.2', 'Django REST Framework', 'SimpleJWT', 'drf-spectacular (OpenAPI)', 'Tesseract OCR', 'gunicorn'],
    },
    { group: 'data', items: ['PostgreSQL 16'] },
    { group: 'infrastructure', items: ['Docker Compose', 'nginx', 'EAS Build'] },
    { group: 'testing', items: ['pytest', 'Vitest', 'Jest', 'Testing Library', 'Playwright', 'ruff', 'oxlint'] },
  ],

  overview: {
    what: tri(
      'Teljes értékű személyes pénzügyi alkalmazás: webes felület, iOS- és Androidalkalmazás, mögötte egyetlen Django REST API és PostgreSQL adatbázis. A tárolóban és a felületen ma WALLEX néven fut.',
      'A full personal finance application: a web app, an iOS and Android app, and behind them one Django REST API and a PostgreSQL database. In the repository and in the interface it now runs as WALLEX.',
      'Een volwaardige persoonlijke financiële applicatie: een webapp, een iOS- en Android-app en daarachter één Django REST API en een PostgreSQL-database. In de repository en in de interface heet het nu WALLEX.',
    ),
    audience: tri(
      'Magánszemélyeknek, akik követni akarják a mindennapi kiadásaikat, a költségkereteiket és a megtakarítási céljaikat.',
      'Individuals who want to follow their everyday spending, their budgets and their savings goals.',
      'Particulieren die hun dagelijkse uitgaven, hun budgetten en hun spaardoelen willen volgen.',
    ),
    problem: tri(
      'A mindennapi költések szétszóródnak a kártyás fizetések, a készpénz és az előfizetések között, ezért a túlköltést későn veszi észre az ember.',
      'Everyday spending is scattered across card payments, cash and subscriptions, so overspending is noticed too late.',
      'Dagelijkse uitgaven zijn verspreid over kaartbetalingen, contant geld en abonnementen, waardoor te hoge uitgaven te laat opvallen.',
    ),
    goal: tri(
      'Pontosság a pénz körül (tizedes törtek végig, soha nem lebegőpontos szám), a felhasználók adatainak szigorú elválasztása, a fontos kockázatokra írt tesztek, és egy környezet, amely egyetlen docker compose paranccsal indul.',
      'Correctness around money (exact decimals end to end, never floats), strict per-user data isolation, tests for the risks that matter, and a setup that starts with one docker compose command.',
      'Correctheid rond geld (overal exacte decimalen, nooit floats), strikte scheiding van gebruikersdata, tests voor de risico’s die ertoe doen en een opzet die met één docker compose-opdracht start.',
    ),
  },

  challenges: [
    {
      title: tri(
        'Lapozás, amely ismételt és kihagyott sorokat adott',
        'Pagination that repeated and skipped rows',
        'Paginering die rijen herhaalde en oversloeg',
      ),
      problem: tri(
        'Mindkét kliens dátum szerint rendezi a tranzakciólistát. Az azonos napi tranzakciók lekérdezésenként más sorrendben jöttek, így a limit/offset oldalak egyes sorokat megismételtek, másokat kihagytak: 95 tesztadattal 10-ből 10 futásban volt duplikáció, és egy tranzakció soha nem jelent meg.',
        'Both clients sort the transaction list by date. Transactions on the same date came back in a different order on each query, so limit/offset pages repeated some rows and skipped others: with 95 seeded transactions, duplicates showed up in 10 of 10 runs and one transaction was never shown.',
        'Beide clients sorteren de transactielijst op datum. Transacties met dezelfde datum kwamen bij elke query in een andere volgorde terug, waardoor pagina’s met limit/offset rijen herhaalden en andere oversloegen: met 95 testtransacties kwamen er in 10 van 10 runs dubbelen voor en werd één transactie nooit getoond.',
      ),
      solution: tri(
        'Egy stabil rendezést adó szűrő mindig hozzáfűzi az elsődleges kulcsot döntetlen esetére, így minden sorrend teljes. A regressziós teszt öt rendezést futtat, minden rendezési mezőn döntetlenekkel.',
        'A stable-ordering filter always appends the primary key as a tie-breaker, so every ordering is total. The regression test runs five orderings with ties on every sort field.',
        'Een filter voor stabiele sortering voegt altijd de primaire sleutel toe als tiebreaker, zodat elke volgorde totaal is. De regressietest draait vijf sorteringen met gelijke waarden op elk sorteerveld.',
      ),
      source: 'docs/code-review.md · H1',
    },
    {
      title: tri(
        'Egy üzleti szabály, amely háromszor létezett',
        'A business rule that existed three times',
        'Een bedrijfsregel die drie keer bestond',
      ),
      problem: tri(
        'A költségkeret-API, az analitika és a felhasználási százalék külön-külön számolta ki az elköltött összeget: költségkeretenként egy lekérdezést (a lista a történettel együtt lassult), és két képletet, amely eltérhetett egymástól.',
        'The budget API, the analytics and the usage percentage each worked out the spent amount on their own: one query per budget (the list got slower as history grew) and two formulas that could drift apart.',
        'De budget-API, de analyse en het gebruikspercentage berekenden elk zelf het uitgegeven bedrag: één query per budget (de lijst werd trager naarmate de geschiedenis groeide) en twee formules die uit elkaar konden lopen.',
      ),
      solution: tri(
        'Egyetlen kiegészített queryset számolja ki a listához az elköltött összeget egy lekérdezésben, és egyetlen függvény tartalmazza a maradék és a felhasználás képletét. Az API, a vezérlőpult, az észrevételek és a push-ellenőrzések mind ezt használják; egy teszt rögzíti, hogy a lekérdezések száma nem nő a költségkeretek számával.',
        'One annotated queryset works out the spent amount for the whole list in a single query, and one function holds the formula for remaining amount and usage. The API, the dashboard, the insights and the push checks all use them; a test pins that the query count does not grow with the number of budgets.',
        'Eén geannoteerde queryset berekent het uitgegeven bedrag voor de hele lijst in één query en één functie bevat de formule voor het restbedrag en het gebruik. De API, het dashboard, de inzichten en de pushcontroles gebruiken ze allemaal; een test legt vast dat het aantal queries niet groeit met het aantal budgetten.',
      ),
      source: 'docs/code-review.md · H2',
    },
    {
      title: tri(
        'Telefonon beírt összegek: tizedesvesszős billentyűzet',
        'Money typed on phones: the decimal-comma keypad',
        'Bedragen op telefoons: het toetsenbord met decimale komma',
      ),
      problem: tri(
        'A tizedesvesszős billentyűzetű telefonokon nem lehetett fillért beírni: az űrlapok az „1250,50”-et Number()-rel olvasták, ami NaN, és úgy küldték volna el, ahogy beírták.',
        'On phones with a decimal-comma keypad cents could not be entered: the forms read "1250,50" with Number(), which gives NaN, and would have sent it as typed.',
        'Op telefoons met een toetsenbord met decimale komma konden centen niet worden ingevoerd: de formulieren lazen "1250,50" met Number(), wat NaN geeft, en zouden het verstuurd hebben zoals het getypt was.',
      ),
      solution: tri(
        'Egyetlen normalizáló függvény az „1 250,50”-et „1250.50”-re alakítja küldés előtt; a teszteket előbb úgy írtam meg, hogy elbukjanak. A webes űrlap number mezőt használ, ahol ezt a böngésző intézi.',
        'One normalising function turns "1 250,50" into "1250.50" before sending; the tests were written to fail first. The web form uses a number input, where the browser does it.',
        'Eén normaliseerfunctie maakt van "1 250,50" "1250.50" vóór het versturen; de tests zijn eerst zo geschreven dat ze faalden. Het webformulier gebruikt een number-invoer, waar de browser dit doet.',
      ),
      source: 'docs/code-review.md · B2',
    },
    {
      title: tri(
        'A második nyelv több, mint lefordított szövegek',
        'A second language is more than translated strings',
        'Een tweede taal is meer dan vertaalde teksten',
      ),
      problem: tri(
        'A magyar nyelv hozzáadása felszínre hozott olyan szövegeket, amelyek megkerülték a fordítást (kódban összeállított mondatok, egy álnéven importált függvény, amelyet a kinyerő eszköz nem látott), valamint alapértelmezett kategóriákat, amelyeket az API angolul adott vissza, vagy amelyeket egy lefordított névvel meg lehetett duplázni.',
        'Adding Hungarian exposed texts that bypassed translation (sentences built in code, a function imported under an alias that the extraction tool did not see) and default categories that the API returned in English or that a translated name could duplicate.',
        'Het toevoegen van Hongaars bracht teksten aan het licht die de vertaling omzeilden (zinnen die in code werden opgebouwd, een onder een alias geïmporteerde functie die het extractiehulpmiddel niet zag) en standaardcategorieën die de API in het Engels teruggaf of die met een vertaalde naam konden worden gedupliceerd.',
      ),
      solution: tri(
        'A katalógusteszt beolvassa a forrást, és elbukik minden olyan szövegen, amely hiányzik belőle; egy AST-vizsgálat megtalálja a hibaosztályoknak átadott nyers szövegeket; a kategória-API az alapértelmezetteket a kérés nyelvén listázza, és elutasít egy lefordított alapértelmezettel megegyező nevet.',
        'The catalogue test reads the source and fails on any text missing from it; an AST scan finds raw strings handed to error classes; the category API lists the defaults in the request language and refuses a name equal to a translated default.',
        'De catalogustest leest de broncode en faalt op elke tekst die erin ontbreekt; een AST-scan vindt ruwe strings die aan foutklassen worden doorgegeven; de categorie-API toont de standaardcategorieën in de taal van het verzoek en weigert een naam die gelijk is aan een vertaalde standaard.',
      ),
      source: 'docs/code-review.md · A1–A5',
    },
  ],

  approach: [
    {
      title: tri('Vékony kliensek, egyetlen „agy”', 'Thin clients, one brain', 'Dunne clients, één brein'),
      text: tri(
        'A validáció, a tulajdonosi ellenőrzés, a pénzszámítás, az analitika és az észrevételek kizárólag a háttérrendszerben élnek. A web- és a mobilalkalmazás API-kliens saját felülettel; a pénz decimális szövegként érkezik, és a kliens soha nem számolja újra.',
        'Validation, ownership checks, money arithmetic, analytics and insights live only in the backend. The web and mobile apps are API clients with their own UI; money arrives as decimal strings and is never recalculated on the client.',
        'Validatie, eigenaarschapscontroles, geldberekeningen, analyses en inzichten leven alleen in de backend. De web- en mobiele app zijn API-clients met een eigen UI; geld komt als decimale tekst binnen en wordt op de client nooit herberekend.',
      ),
    },
    {
      title: tri('Rétegzett háttérrendszer', 'A layered backend', 'Een gelaagde backend'),
      text: tri(
        'A nézetek a HTTP-t, a jogosultságokat és a sebességkorlátokat kezelik; a szerializálók a bemenetet validálják; a szolgáltatások tartalmazzák az üzleti logikát HTTP nélkül; a modellek a megszorításokat. A nehéz lekérdezések rögzített számú lekérdezésből állnak, és a tesztek ellenőrzik a számot. Az OCR és a push kis felületek mögött áll.',
        'Views handle HTTP, permissions and rate limits; serializers validate input; services hold the business logic with no HTTP in it; models carry the constraints. Heavy queries run in a fixed number of queries and tests assert the number. OCR and push delivery sit behind small interfaces.',
        'Views regelen HTTP, rechten en snelheidslimieten; serializers valideren de invoer; services bevatten de bedrijfslogica zonder HTTP; modellen dragen de constraints. Zware queries draaien in een vast aantal queries en tests controleren dat aantal. OCR en pushbezorging zitten achter kleine interfaces.',
      ),
    },
    {
      title: tri('Minden sor egy felhasználóé', 'Every row belongs to a user', 'Elke rij hoort bij een gebruiker'),
      text: tri(
        'A querysetek mindig a bejelentkezett felhasználóra szűrnek, és egy objektumszintű jogosultság másodszor is ellenőriz; más felhasználó objektumára 404 a válasz, így a létezése sem derül ki. Az adatbázis CHECK és UNIQUE megszorításai is őrzik a fontos szabályokat.',
        'Querysets are always scoped to the signed-in user and an object permission adds a second check; another user’s object answers 404, so its existence is not revealed. Database CHECK and UNIQUE constraints back the important rules too.',
        'Querysets zijn altijd beperkt tot de ingelogde gebruiker en een objectrecht voegt een tweede controle toe; het object van een andere gebruiker geeft 404, zodat het bestaan niet wordt verraden. Ook CHECK- en UNIQUE-constraints in de database dekken de belangrijke regels af.',
      ),
    },
    {
      title: tri('Több eszköz, egy fiók', 'Many devices, one account', 'Meerdere apparaten, één account'),
      text: tri(
        'A mobilalkalmazás offline sorában az írások kliensazonosítót hordoznak, így az újrapróbálás nem duplikál. Minden kliens egy olcsó szinkronállapot-végpontot kérdez le, és a háttérben frissít; a szerkesztések verziót (If-Match) visznek, és az elavult szerkesztés 412-t kap, ahelyett hogy felülírna egy újabbat.',
        'The mobile app’s offline queue carries a client id with each write, so a retry never duplicates. Every client polls a cheap sync-status endpoint and refreshes in the background; edits carry a version (If-Match) and a stale edit gets 412 instead of overwriting a newer one.',
        'De offlinewachtrij van de mobiele app geeft elke schrijfactie een client-id mee, zodat een nieuwe poging nooit dubbelt. Elke client bevraagt een goedkoop sync-statuseindpunt en ververst op de achtergrond; bewerkingen dragen een versie (If-Match) en een verouderde bewerking krijgt 412 in plaats van een nieuwere te overschrijven.',
      ),
    },
    {
      title: tri('Egy origin élesben', 'One origin in production', 'Eén origin in productie'),
      text: tri(
        'Az nginx kiszolgálja a webes buildet, és az /api kéréseket az alkalmazásszerverre továbbítja, így egyetlen tanúsítvány kell, és nincs CORS-beállítás. A mobilalkalmazások ugyanezt a címet hívják.',
        'nginx serves the web build and proxies /api to the application server, so there is one certificate and no CORS setup. The mobile apps call the same address.',
        'nginx serveert de webbuild en stuurt /api door naar de applicatieserver, zodat er één certificaat is en geen CORS-configuratie. De mobiele apps roepen hetzelfde adres aan.',
      ),
    },
  ],

  architecture: {
    tiers: [
      {
        id: 'clients',
        label: tri('Kliensek', 'Clients', 'Clients'),
        nodes: [
          {
            id: 'web',
            label: 'React web app',
            detail: tri('React 19 · TypeScript · Vite', 'React 19 · TypeScript · Vite', 'React 19 · TypeScript · Vite'),
            status: 'built',
          },
          {
            id: 'mobile',
            label: 'Expo mobile app',
            detail: tri(
              'iOS és Android · React Native; néhány képernyő még hiányzik',
              'iOS and Android · React Native; some screens are still missing',
              'iOS en Android · React Native; enkele schermen ontbreken nog',
            ),
            status: 'partial',
          },
        ],
      },
      {
        id: 'edge',
        label: tri('Élesben', 'In production', 'In productie'),
        nodes: [
          {
            id: 'nginx',
            label: 'nginx',
            detail: tri('kiszolgálja a webes buildet, továbbítja az /api-t', 'serves the web build, proxies /api', 'serveert de webbuild, stuurt /api door'),
            status: 'built',
          },
        ],
      },
      {
        id: 'application',
        label: tri('Alkalmazás', 'Application', 'Applicatie'),
        nodes: [
          {
            id: 'api',
            label: 'Django REST API',
            detail: tri(
              'Django 5.2 · DRF · JWT · üzleti logika, validáció, analitika',
              'Django 5.2 · DRF · JWT · business logic, validation, analytics',
              'Django 5.2 · DRF · JWT · bedrijfslogica, validatie, analyse',
            ),
            status: 'built',
          },
        ],
      },
      {
        id: 'data',
        label: tri('Adat', 'Data', 'Data'),
        nodes: [{ id: 'db', label: 'PostgreSQL 16', status: 'built' }],
      },
      {
        id: 'services',
        label: tri('Külső szolgáltatások', 'External services', 'Externe diensten'),
        nodes: [
          {
            id: 'ocr',
            label: 'Tesseract OCR',
            detail: tri('blokkolvasás, cserélhető', 'receipt reading, swappable', 'bonnen lezen, uitwisselbaar'),
            status: 'built',
          },
          {
            id: 'push',
            label: 'Expo Push Service',
            detail: tri('APNs / FCM', 'APNs / FCM', 'APNs / FCM'),
            status: 'built',
          },
          {
            id: 'ai',
            label: 'AI provider',
            detail: tri(
              'alapból Gemini, opcionálisan Claude; kulcs nélkül ki van kapcsolva',
              'Gemini by default, Claude optionally; off unless a key is set',
              'standaard Gemini, optioneel Claude; uit zonder sleutel',
            ),
            status: 'built',
          },
          {
            id: 'ecb',
            label: 'ECB exchange rates',
            detail: tri('egy kezelőparancs tölti le', 'fetched by a management command', 'opgehaald door een beheeropdracht'),
            status: 'built',
          },
        ],
      },
    ],
    links: [
      { from: 'web', to: 'nginx', label: tri('HTTPS · JSON · JWT', 'HTTPS · JSON · JWT', 'HTTPS · JSON · JWT') },
      { from: 'mobile', to: 'api', label: tri('HTTPS · JSON · JWT, ugyanarra a címre', 'HTTPS · JSON · JWT, to the same address', 'HTTPS · JSON · JWT, naar hetzelfde adres'), status: 'partial' },
      { from: 'nginx', to: 'api', label: tri('/api továbbítása', 'proxies /api', 'stuurt /api door') },
      { from: 'api', to: 'db', label: tri('SQL, megszorításokkal', 'SQL, with constraints', 'SQL, met constraints') },
      { from: 'api', to: 'ocr', label: tri('blokkfotó → javaslatok, semmi sem mentődik', 'receipt photo → suggestions, nothing saved', 'bonfoto → suggesties, niets opgeslagen') },
      { from: 'api', to: 'push', label: tri('értesítések küldése', 'sends notifications', 'verstuurt notificaties') },
      { from: 'api', to: 'ai', label: tri('csak olvasó háttér-eszközök, aggregált számok', 'read-only backend tools, aggregated figures', 'alleen-lezen backendtools, geaggregeerde cijfers') },
      { from: 'api', to: 'ecb', label: tri('referenciaárfolyamok', 'reference rates', 'referentiekoersen') },
    ],
    note: tri(
      'Az OCR és a push választható integráció kis felületek mögött; az AI-asszisztens kikapcsolt, amíg nincs beállítva szolgáltatói kulcs.',
      'OCR and push are optional integrations behind small interfaces; the AI assistant is off until a provider key is configured.',
      'OCR en push zijn optionele integraties achter kleine interfaces; de AI-assistent staat uit zolang er geen providersleutel is ingesteld.',
    ),
  },

  features: [
    {
      status: 'done',
      title: tri('Tranzakciók és kategóriák', 'Transactions and categories', 'Transacties en categorieën'),
      text: tri(
        'Bevételek és kiadások létrehozása, szerkesztése, törlése; keresés, szűrés típus, kategória és dátum szerint, rendezés és lapozás. Felhasználónként tíz alapértelmezett kategória, saját színes, ikonos kategóriák mellett.',
        'Create, edit and delete income and expenses; search, filter by type, category and date, sort and paginate. Ten default categories per user, plus custom ones with colours and icons.',
        'Inkomsten en uitgaven aanmaken, bewerken en verwijderen; zoeken, filteren op type, categorie en datum, sorteren en pagineren. Tien standaardcategorieën per gebruiker, plus eigen categorieën met kleuren en iconen.',
      ),
      image: 'transactions',
    },
    {
      status: 'done',
      title: tri('Vezérlőpult és analitika', 'Dashboard and analytics', 'Dashboard en analyses'),
      text: tri(
        'Havi egyenleg, 12 hónapos trend, kiadások kategóriák szerint, kereskedők, hétköznapi minták, fix és változó kiadások, hónapról hónapra és évről évre összevetés. Mind az adatbázisban, rögzített számú lekérdezéssel számolva.',
        'Monthly balance, a 12-month trend, spending by category, merchants, weekday patterns, fixed versus variable spending, month-over-month and year-over-year comparison. All computed in the database with a fixed number of queries.',
        'Maandsaldo, een trend over 12 maanden, uitgaven per categorie, winkels, weekdagpatronen, vaste versus variabele uitgaven, vergelijking met vorige maand en vorig jaar. Alles berekend in de database met een vast aantal queries.',
      ),
      image: 'dashboard-light',
    },
    {
      status: 'partial',
      title: tri('Költségkeretek', 'Budgets', 'Budgetten'),
      text: tri(
        'Havi keretek kategóriánként vagy összesen; az elköltött, a maradék és a felhasználás élőben számolódik, figyelmeztető (≥ 80 %) és túllépett állapottal. A weben a keretek megtekinthetők, de létrehozásukhoz még az API kell: űrlap nincs.',
        'Monthly limits per category or overall; spent, remaining and usage are computed live, with warning (≥ 80 %) and over-budget states. The web app shows budgets, but creating one still needs the API: there is no form yet.',
        'Maandlimieten per categorie of totaal; uitgegeven, resterend en gebruik worden live berekend, met waarschuwing (≥ 80 %) en overschreden status. De webapp toont budgetten, maar aanmaken vereist nog de API: er is nog geen formulier.',
      ),
      image: 'budgets',
    },
    {
      status: 'partial',
      title: tri('Ismétlődő fizetések és előfizetések', 'Recurring payments and subscriptions', 'Terugkerende betalingen en abonnementen'),
      text: tri(
        'Az előfizetés-kezelő a webes felületen kiszámolja a havi és éves költséget és a következő fizetéseket. Az ismétlődő sablonok emlékeztetőket és összesítéseket hajtanak, de még nem hoznak létre tranzakciókat.',
        'The subscription manager on the web works out monthly and yearly cost and the next payments. Recurring templates drive reminders and totals, but do not yet create transactions.',
        'De abonnementenbeheerder op het web berekent maand- en jaarkosten en de volgende betalingen. Terugkerende sjablonen sturen herinneringen en totalen aan, maar maken nog geen transacties aan.',
      ),
    },
    {
      status: 'done',
      title: tri('Megtakarítási célok és mérföldkövek', 'Savings goals and achievements', 'Spaardoelen en mijlpalen'),
      text: tri(
        'Több cél felhasználónként, saját pénznemmel és határidővel; a pénz hozzáadása és levonása atomi, zárolt szerveroldali művelet. A mérföldköveket a szerver értékeli a meglévő adatokból, és egyszer megszerezve véglegesek. A weben elérhető; mobilra még nincs képernyő.',
        'Several goals per user, each in its own currency with an optional target date; adding and removing money are atomic, row-locked server actions. Achievements are evaluated on the server from existing data and are permanent once earned. Available on the web; the mobile screens do not exist yet.',
        'Meerdere doelen per gebruiker, elk in een eigen valuta met een optionele streefdatum; geld toevoegen en opnemen zijn atomaire serveracties met rijvergrendeling. Mijlpalen worden op de server beoordeeld uit bestaande data en zijn blijvend zodra ze behaald zijn. Beschikbaar op het web; mobiele schermen bestaan nog niet.',
      ),
    },
    {
      status: 'partial',
      title: tri('Észrevételek és értesítések', 'Insights and notifications', 'Inzichten en notificaties'),
      text: tri(
        'Szabályalapú észrevételek (8 szabálytípus) és a szerver által megírt értesítések: költségkeret-küszöbök, közelgő fizetések, havi összefoglaló; mindegyik fajta kikapcsolható. A mobilon push is érkezik; az alkalmazáson belüli értesítési postaláda képernyője még nincs meg.',
        'Rule-based insights (8 rule types) and server-written notifications: budget thresholds, upcoming payments, a monthly summary; each kind can be switched off. Mobile also gets a push; the in-app notification inbox screens are not built yet.',
        'Regelgebaseerde inzichten (8 regeltypen) en door de server geschreven notificaties: budgetdrempels, aankomende betalingen, een maandoverzicht; elk soort kan worden uitgezet. Op mobiel komt er ook een push; de schermen voor een notificatie-inbox in de app zijn nog niet gebouwd.',
      ),
    },
    {
      status: 'done',
      title: tri('Szinkron és offline mód', 'Sync and offline mode', 'Synchronisatie en offlinemodus'),
      text: tri(
        'A web, az iPhone és az Android egy fiókot és egy adatbázist használ; a telefonon rögzített tranzakció újratöltés nélkül megjelenik a megnyitott weboldalon. A mobilon a gyorsítótárazott képernyők offline is olvashatók, az új tranzakciók sorba kerülnek, és duplikáció nélkül szinkronizálódnak.',
        'Web, iPhone and Android share one account and one database; a transaction added on the phone appears on the open web page without a reload. On mobile, cached screens stay readable offline and new transactions are queued and synced without duplicates.',
        'Web, iPhone en Android delen één account en één database; een transactie die op de telefoon wordt toegevoegd verschijnt zonder herladen op de geopende webpagina. Op mobiel blijven gecachte schermen offline leesbaar en worden nieuwe transacties in de wachtrij gezet en zonder dubbelen gesynchroniseerd.',
      ),
      image: 'mobile-dashboard',
    },
    {
      status: 'done',
      title: tri('Többpénznemű számolás', 'Multi-currency', 'Meerdere valuta'),
      text: tri(
        'EUR, HUF, USD, GBP, JPY és CHF. A tranzakció megőrzi a fizetés pénznemét; az alappénznembeli értéke a napi ECB-referenciaárfolyammal rögzül, és az alappénznem váltása a teljes történetet a korabeli árfolyamokon számolja át.',
        'EUR, HUF, USD, GBP, JPY and CHF. A transaction keeps the currency it was paid in; its value in the base currency is fixed with the ECB reference rate of its date, and changing the base currency converts the whole history at historical rates.',
        'EUR, HUF, USD, GBP, JPY en CHF. Een transactie behoudt de valuta waarin ze betaald is; de waarde in de basisvaluta wordt vastgelegd met de ECB-referentiekoers van die datum en het wisselen van basisvaluta rekent de hele geschiedenis om tegen historische koersen.',
      ),
    },
    {
      status: 'done',
      title: tri('AI-pénzügyi asszisztens', 'AI finance assistant', 'AI-financiële assistent'),
      text: tri(
        'Chat a weben és mobilon. A modell nem éri el az adatbázist: hét csak olvasó háttér-eszközt hívhat, amelyek aggregált számokat adnak vissza azonosítók, név és e-mail nélkül. A válaszoknak ezekből kell származniuk; ha nem elég az adat, az asszisztens ezt mondja, nem találgat. Kulcs nélkül ki van kapcsolva.',
        'A chat on web and mobile. The model never touches the database: it can only call seven read-only backend tools that return aggregated figures with no ids, name or e-mail. Answers must come from those results; when they are not enough the assistant says so instead of guessing. Off unless a provider key is set.',
        'Een chat op web en mobiel. Het model raakt de database nooit aan: het kan alleen zeven alleen-lezen backendtools aanroepen die geaggregeerde cijfers teruggeven zonder id’s, naam of e-mail. Antwoorden moeten uit die resultaten komen; als die niet genoeg zijn, zegt de assistent dat in plaats van te gokken. Uit zolang er geen providersleutel is.',
      ),
    },
    {
      status: 'done',
      title: tri('Mobil extrák: blokkolvasás, biometrikus zár, push', 'Mobile extras: receipt scanning, biometric lock, push', 'Mobiele extra’s: bon scannen, biometrisch slot, push'),
      text: tri(
        'A fotóról a szerver OCR-rel kiolvassa a kereskedőt, az összeget, a dátumot és a tételeket, és kategóriát javasol; csak a megerősítés hoz létre tranzakciót. Face ID / ujjlenyomat zár, a frissítő token Keychain/Keystore-ban. A projekt saját átvilágítása szerint fizikai telefonon még nem ellenőrizték.',
        'The server reads merchant, total, date and items from the photo with OCR and suggests a category; only the confirmation creates a transaction. Face ID or fingerprint lock, with the refresh token in the Keychain/Keystore. According to the project’s own review, it has not yet been verified on a physical phone.',
        'De server leest winkel, totaal, datum en artikelen uit de foto met OCR en stelt een categorie voor; pas de bevestiging maakt een transactie aan. Face ID- of vingerafdrukslot, met het refresh-token in de Keychain/Keystore. Volgens de eigen review van het project is het nog niet op een fysieke telefoon geverifieerd.',
      ),
      image: 'mobile-add-transaction',
    },
    {
      status: 'done',
      title: tri('Fiók és biztonság', 'Account and security', 'Account en beveiliging'),
      text: tri(
        'Forgó JWT-tokenek feketelistával, eszközönkénti munkamenetek, kétfaktoros hitelesítés (TOTP, helyreállító kódok), naplózott bejelentkezések és törlések, valamint a saját adatok letöltése és törlése. Minden vizsgálati megállapítást először egy bukó teszttel reprodukáltak.',
        'Rotating JWT tokens with a blacklist, one session per device, two-factor authentication (TOTP, recovery codes), a log of sign-ins and deletions, and download and erasure of one’s own data. Every finding of the security audit was first reproduced by a failing test.',
        'Roterende JWT-tokens met blacklist, één sessie per apparaat, tweefactorauthenticatie (TOTP, herstelcodes), een log van aanmeldingen en verwijderingen en het downloaden en wissen van eigen gegevens. Elke bevinding van de beveiligingsaudit werd eerst met een falende test gereproduceerd.',
      ),
      image: 'api-docs',
    },
    {
      status: 'done',
      title: tri('Két nyelv és CSV-import', 'Two languages and CSV import', 'Twee talen en CSV-import'),
      text: tri(
        'Angol és magyar felület a weben és mobilon; a választás a fiókhoz kötődik, a számok, a pénz és a dátumok követik. A weben banki CSV-import automatikus kategorizálással, duplikátumfelismeréssel és sorokra bontott jelentéssel.',
        'English and Hungarian in the web and mobile apps; the choice is saved to the account and numbers, money and dates follow it. On the web, bank CSV import with automatic categorisation, duplicate detection and a per-row report.',
        'Engels en Hongaars in de web- en mobiele app; de keuze wordt in het account bewaard en cijfers, geld en datums volgen die. Op het web: bank-CSV-import met automatische categorisering, dubbeldetectie en een rapport per rij.',
      ),
      image: 'dashboard-hu',
    },
    {
      status: 'planned',
      title: tri('Automatikus ismétlődő tranzakciók', 'Automatic recurring transactions', 'Automatische terugkerende transacties'),
      text: tri(
        'Egy ütemezett, idempotens feladat hozná létre a tényleges tranzakciókat a sablonokból, sablononként bekapcsolhatóan, hogy a kézzel rögzített fizetések ne duplázódjanak.',
        'A scheduled, idempotent job should create the actual transactions from the templates, opt-in per template so manually entered payments are not duplicated.',
        'Een geplande, idempotente taak zou de echte transacties uit de sjablonen moeten aanmaken, per sjabloon aan te zetten zodat handmatig ingevoerde betalingen niet dubbel komen.',
      ),
    },
    {
      status: 'planned',
      title: tri('Mobilképernyők előfizetésekhez, célokhoz, mérföldkövekhez', 'Mobile screens for subscriptions, goals and achievements', 'Mobiele schermen voor abonnementen, doelen en mijlpalen'),
      text: tri(
        'A típusok és az API-szolgáltatások megvannak a mobilalkalmazásban, a képernyők még nem.',
        'The types and API services exist in the mobile app; the screens do not yet.',
        'De types en API-services bestaan in de mobiele app; de schermen nog niet.',
      ),
    },
    {
      status: 'planned',
      title: tri('Értesítési postaláda', 'Notification inbox', 'Notificatie-inbox'),
      text: tri(
        'Az API (lista, olvasott/olvasatlan, számláló, mind olvasott) és a kliensszolgáltatások megvannak; a webes harang és a mobil postaláda képernyője még nem.',
        'The API (list, read/unread, unread count, mark all read) and the client services exist; the web bell and the mobile inbox screen do not yet.',
        'De API (lijst, gelezen/ongelezen, teller, alles gelezen) en de clientservices bestaan; de webbel en het mobiele inboxscherm nog niet.',
      ),
    },
    {
      status: 'planned',
      title: tri('Megtakarítási előzmények', 'Savings history', 'Spaargeschiedenis'),
      text: tri(
        'Egy napló minden befizetésről és kivételről (a cél most csak az egyenlegét őrzi), amely megtakarítási ráta diagramot és „a céldátumra időben vagy” jelzéseket tenne lehetővé.',
        'A log of each deposit and withdrawal (a goal currently keeps only its balance), which would enable a savings-rate chart and "on track for the target date" hints.',
        'Een log van elke storting en opname (een doel bewaart nu alleen zijn saldo), waarmee een spaarquotegrafiek en "op schema voor de streefdatum"-hints mogelijk worden.',
      ),
    },
  ],

  limits: [
    tri(
      'Nincs üzemeltetve: nincs élő demó, és a projekt nem éles használatban van.',
      'It is not hosted anywhere: there is no live demo and it is not in production use.',
      'Het wordt nergens gehost: er is geen live demo en het is niet in productie.',
    ),
    tri(
      'A webes kategóriakezelő oldal még helyőrző; a költségkeret-létrehozáshoz nincs űrlap.',
      'The web category-management page is still a placeholder, and there is no form to create budgets.',
      'De webpagina voor categoriebeheer is nog een placeholder en er is geen formulier om budgetten aan te maken.',
    ),
    tri(
      'A mobilképernyők az Expo webes célpontján lettek ellenőrizve; iOS- és Android-eszközön még nem.',
      'The mobile screens were checked in the Expo web target; they have not been run on iOS or Android devices yet.',
      'De mobiele schermen zijn gecontroleerd in het Expo-webdoel; ze zijn nog niet op iOS- of Android-apparaten gedraaid.',
    ),
    tri(
      'Nincs jelszó-visszaállítás e-mailben.',
      'There is no password reset by e-mail.',
      'Er is geen wachtwoordherstel per e-mail.',
    ),
  ],

  decisions: [
    {
      title: tri('„Nyugodt főkönyv”, nem sablon-vezérlőpult', 'A calm ledger, not a dashboard template', 'Een rustig grootboek, geen dashboardsjabloon'),
      text: tri(
        'Meleg semleges színek tiszta fehér és fekete helyett, egyetlen visszafogott zsályazöld hangsúly, felületek közötti tónusbeli elválasztás szegélyek és árnyékok helyett. A tiszta #fff / #000 háttérként soha nem szerepel, és egy teszt ezt kikényszeríti.',
        'Warm neutrals instead of pure white and black, one muted sage-green accent, and tonal separation between surfaces instead of borders and shadows. Pure #fff / #000 is never a background, and a test enforces it.',
        'Warme neutrale kleuren in plaats van zuiver wit en zwart, één ingetogen saliegroen accent en toonscheiding tussen vlakken in plaats van randen en schaduwen. Zuiver #fff / #000 is nooit een achtergrond en een test dwingt dat af.',
      ),
    },
    {
      title: tri('A szín soha nem az egyetlen jelzés', 'Colour is never the only signal', 'Kleur is nooit het enige signaal'),
      text: tri(
        'A bevétel „+”, a kiadás „−”; a költségkeret „A terv szerint / Határon / Túllépve” szöveget és ikont kap; a változás nyilat és előjelet. A hosszú listákban a kiadások a normál szövegszínt használják, hogy egy oldalnyi kiadás ne legyen piros fal. A kontrasztot teszt védi mindkét témában.',
        'Income is "+" and spending is "−"; budgets say "On track / Near limit / Over budget" with an icon; changes carry an arrow and a sign. In long lists expenses use the normal text colour, so a page of spending is not a wall of red. Contrast is guarded by a test in both themes.',
        'Inkomsten zijn "+" en uitgaven "−"; budgetten zeggen "Op schema / Bijna op limiet / Overschreden" met een pictogram; wijzigingen dragen een pijl en een teken. In lange lijsten gebruiken uitgaven de gewone tekstkleur, zodat een pagina met uitgaven geen rode muur is. Contrast wordt in beide thema’s door een test bewaakt.',
      ),
    },
    {
      title: tri('Az összeg az űrlap fókusza', 'The amount is the focus of the form', 'Het bedrag is het brandpunt van het formulier'),
      text: tri(
        'A tranzakció űrlapja az összeggel kezdődik, mind a weben, mind a mobilon. Az üres állapotok megmondják, mi hiányzik, miért számít, és mi a következő lépés; a betöltés a kész tartalom méretű vázat mutat, hogy az oldal ne ugráljon; a hiba szekciónként jelenik meg újrapróbálással, így a vezérlőpult többi része tovább működik.',
        'A transaction form starts with the amount on both web and mobile. Empty states say what is missing, why it matters and what to do next; loading shows skeletons sized like the finished content so the page does not jump; errors are per section with a retry, so the rest of the dashboard keeps working.',
        'Een transactieformulier begint met het bedrag, zowel op web als op mobiel. Lege toestanden zeggen wat er ontbreekt, waarom het ertoe doet en wat de volgende stap is; laden toont skeletons met de grootte van de uiteindelijke inhoud zodat de pagina niet verspringt; fouten zijn per sectie met een nieuwe poging, zodat de rest van het dashboard blijft werken.',
      ),
    },
    {
      title: tri('A navigáció az eszközhöz igazodik', 'Navigation follows the device', 'Navigatie volgt het apparaat'),
      text: tri(
        'Asztalon oldalsáv, telefonon és táblagépen alsó navigáció kiemelt hozzáadás gombbal; a DOM-ban egyszerre csak egy navigáció van, így a képernyőolvasó nem találkozik két példánnyal. A párbeszédablakok telefonon alsó lapokká válnak, és csapdába ejtik, majd visszaadják a fókuszt.',
        'A sidebar on desktop, a bottom bar with a raised add button on phones and tablets; only one navigation is in the DOM at a time, so a screen reader never meets two copies. Dialogs become bottom sheets on phones and trap and then return focus.',
        'Een zijbalk op desktop, een onderbalk met verhoogde toevoegknop op telefoons en tablets; er staat telkens maar één navigatie in de DOM, zodat een schermlezer nooit twee kopieën tegenkomt. Dialogen worden op telefoons bottom sheets en vangen de focus op en geven die daarna terug.',
      ),
    },
    {
      title: tri('Valódi számjegyek, vezérelt témák', 'Real numerals, managed themes', 'Echte cijfers, beheerde thema’s'),
      text: tri(
        'Az összegek táblázatos számjegyeket használnak, így az oszlopok egy vonalban vannak, és az értékek nem ugrálnak. A téma Rendszer / Világos / Sötét lehet; a rendszerbeállítás élőben követhető, és a mentett választás nem villan fel a másik témában betöltéskor.',
        'Amounts use tabular figures so columns line up and values do not jitter. The theme is System / Light / Dark; the system setting is followed live, and a saved choice never flashes the other theme on load.',
        'Bedragen gebruiken tabelcijfers, zodat kolommen uitgelijnd zijn en waarden niet verspringen. Het thema is Systeem / Licht / Donker; de systeeminstelling wordt live gevolgd en een opgeslagen keuze flitst bij het laden niet in het andere thema.',
      ),
    },
  ],

  learned: [],

  next: [
    tri(
      'Ütemezett, idempotens generátor az ismétlődő tranzakciókhoz.',
      'A scheduled, idempotent generator for recurring transactions.',
      'Een geplande, idempotente generator voor terugkerende transacties.',
    ),
    tri(
      'A TypeScript típusok generálása az openapi.yaml-ból, a kézzel tükrözött típusok helyett.',
      'TypeScript types generated from openapi.yaml instead of types mirrored by hand.',
      'TypeScript-types genereren uit openapi.yaml in plaats van met de hand gespiegelde types.',
    ),
    tri(
      'Hibakövetés és automatikus adatbázis-mentések.',
      'Error tracking and automated database backups.',
      'Foutopsporing en geautomatiseerde databaseback-ups.',
    ),
  ],

  gallery: [
    {
      id: 'dashboard-light',
      src: '/projects/spendly/dashboard-light.webp',
      width: 1440,
      height: 1000,
      device: 'desktop',
      hero: true,
      alt: tri(
        'A vezérlőpult világos témában: egyenleg, bevételek és kiadások, észrevételek és diagramok.',
        'The dashboard in the light theme: balance, income and expenses, insights and charts.',
        'Het dashboard in het lichte thema: saldo, inkomsten en uitgaven, inzichten en grafieken.',
      ),
      caption: tri('Vezérlőpult, világos téma', 'Dashboard, light theme', 'Dashboard, licht thema'),
    },
    {
      id: 'dashboard-dark',
      src: '/projects/spendly/dashboard-dark.webp',
      width: 1440,
      height: 1000,
      device: 'desktop',
      alt: tri('Ugyanaz a vezérlőpult sötét témában.', 'The same dashboard in the dark theme.', 'Hetzelfde dashboard in het donkere thema.'),
      caption: tri('Ugyanez sötét témában', 'The same in the dark theme', 'Hetzelfde in het donkere thema'),
    },
    {
      id: 'dashboard-hu',
      src: '/projects/spendly/dashboard-hu.webp',
      width: 1440,
      height: 1000,
      device: 'desktop',
      alt: tri(
        'A vezérlőpult magyarul: minden szöveg, észrevétel, kategórianév, hónapnév és számformátum követi a nyelvet.',
        'The dashboard in Hungarian: every text, insight, category name, month name and number format follows the language.',
        'Het dashboard in het Hongaars: elke tekst, elk inzicht, elke categorienaam, maandnaam en getalnotatie volgt de taal.',
      ),
      caption: tri('Vezérlőpult magyarul', 'Dashboard in Hungarian', 'Dashboard in het Hongaars'),
    },
    {
      id: 'transactions',
      src: '/projects/spendly/transactions.webp',
      width: 1440,
      height: 900,
      device: 'desktop',
      alt: tri(
        'Napok szerint csoportosított tranzakciók kereséssel, szűrőkkel és rendezéssel.',
        'Transactions grouped by day, with search, filters and sorting.',
        'Transacties gegroepeerd per dag, met zoeken, filters en sorteren.',
      ),
      caption: tri('Tranzakciók', 'Transactions', 'Transacties'),
    },
    {
      id: 'budgets',
      src: '/projects/spendly/budgets.webp',
      width: 1440,
      height: 800,
      device: 'desktop',
      alt: tri('Költségkeretek felhasználási sávokkal és állapotjelvényekkel.', 'Budgets with usage bars and status badges.', 'Budgetten met gebruiksbalken en statusbadges.'),
      caption: tri('Költségkeretek', 'Budgets', 'Budgetten'),
    },
    {
      id: 'api-docs',
      src: '/projects/spendly/api-docs.webp',
      width: 1440,
      height: 968,
      device: 'desktop',
      alt: tri('A Swagger UI a dokumentált tranzakció-végpontokkal.', 'Swagger UI showing the documented transaction endpoints.', 'Swagger UI met de gedocumenteerde transactie-eindpunten.'),
      caption: tri('Interaktív API-dokumentáció', 'Interactive API documentation', 'Interactieve API-documentatie'),
    },
    {
      id: 'mobile-dashboard',
      src: '/projects/spendly/mobile-dashboard.webp',
      width: 520,
      height: 1125,
      device: 'mobile',
      alt: tri(
        'A mobil kezdőképernyő: egyenleg, bevételek és kiadások, észrevételek, hová ment a pénz.',
        'Mobile home: balance, income and expenses, insights, where the money went.',
        'Mobiel startscherm: saldo, inkomsten en uitgaven, inzichten, waar het geld naartoe ging.',
      ),
      caption: tri('Kezdőképernyő', 'Home', 'Start'),
    },
    {
      id: 'mobile-transactions',
      src: '/projects/spendly/mobile-transactions.webp',
      width: 520,
      height: 1125,
      device: 'mobile',
      alt: tri('Mobil tranzakciólista napok szerint csoportosítva, kereséssel és szűrőkkel.', 'Mobile transactions grouped by day, with search and filters.', 'Mobiele transacties gegroepeerd per dag, met zoeken en filters.'),
      caption: tri('Tranzakciók', 'Transactions', 'Transacties'),
    },
    {
      id: 'mobile-budgets',
      src: '/projects/spendly/mobile-budgets.webp',
      width: 520,
      height: 1125,
      device: 'mobile',
      alt: tri('Mobil költségkeretek felhasználási sávokkal és állapotjelvényekkel.', 'Mobile budgets with usage bars and status badges.', 'Mobiele budgetten met gebruiksbalken en statusbadges.'),
      caption: tri('Költségkeretek', 'Budgets', 'Budgetten'),
    },
    {
      id: 'mobile-add-transaction',
      src: '/projects/spendly/mobile-add-transaction.webp',
      width: 520,
      height: 1125,
      device: 'mobile',
      alt: tri('A mobil hozzáadás űrlap: először az összeg, aztán egy kategóriacsempe.', 'The mobile add form: amount first, then a category tile.', 'Het mobiele toevoegformulier: eerst het bedrag, dan een categorietegel.'),
      caption: tri('Hozzáadás: az összeg az első', 'Add: amount first', 'Toevoegen: eerst het bedrag'),
    },
  ],

  galleryNote: tri(
    'A képernyőképeken az alkalmazás mai neve, a WALLEX látszik (a Spendly a korábbi neve); minden adat generált demóadat. A mobil képernyőképek az Expo webes célpontjából készültek iPhone-méretben.',
    'The screenshots show the app under its current name, WALLEX (Spendly was its earlier name); all data is generated demo data. The mobile screenshots come from the Expo web target at iPhone size.',
    'De schermafbeeldingen tonen de app onder zijn huidige naam, WALLEX (Spendly was de eerdere naam); alle data is gegenereerde demodata. De mobiele schermafbeeldingen komen uit het Expo-webdoel op iPhone-formaat.',
  ),
}
