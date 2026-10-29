import { tri } from '../trilingual'
import type { ProjectDetail } from './types'

/*
 * Logistics Platform. In the repository it is called Logextic. Source: Logextic/README.md and docs/
 * (architecture, frontend, known-limitations), read on 2026-10-28, and a check that the code for
 * each documented module exists (routers, pages, the mobile app, the CI workflow, six migrations).
 * The test suites were not re-run for this page. The project says of itself: "a portfolio project,
 * not used in production, with no customers, and all of its data is fictional".
 *
 * Numbers that change (tests, operations) are left out on purpose.
 */
export const logistics: ProjectDetail = {
  id: 'logistics',
  repoName: 'Logextic',
  accent: 'ink',
  hero: 'route',
  reviewed: '2026-10-28',
  sourceUrl: null,

  summary: tri(
    'Fuvarozás- és flottakezelő rendszer egy fiktív közúti fuvarozócégnek: szabályellenőrzött szállítmány-munkafolyamat, sofőrök, vontatók és pótkocsik, karbantartás, költségek és jelentések, élő frissítéssel és szerepkör-alapú hozzáféréssel. Bemutató projekt: nincs éles használatban, minden adata kitalált.',
    'A transport and fleet management system for a fictional road-freight company: a rule-checked shipment workflow, drivers, trucks and trailers, maintenance, costs and reports, with live updates and role-based access. A demonstration project: it is not in production and all of its data is fictional.',
    'Een transport- en vlootbeheersysteem voor een fictief wegtransportbedrijf: een door regels gecontroleerde zendingsworkflow, chauffeurs, trekkers en opleggers, onderhoud, kosten en rapporten, met live updates en rolgebaseerde toegang. Een demonstratieproject: het is niet in productie en alle data is fictief.',
  ),

  role: tri(
    'Egyszemélyes projekt: a tároló minden commitját én készítettem.',
    'A single-author project: every commit in the repository is mine.',
    'Een project van één auteur: elke commit in de repository is van mij.',
  ),

  stack: [
    {
      group: 'frontend',
      items: [
        'React 19',
        'TypeScript',
        'Vite',
        'React Router',
        'React Hook Form',
        'Zod',
        'Recharts',
        'Leaflet',
        'SCSS modules',
        'React Native',
        'Expo',
        'TanStack Query',
      ],
    },
    {
      group: 'backend',
      items: ['Python 3.13', 'FastAPI', 'SQLAlchemy 2', 'Alembic', 'Pydantic v2', 'Celery', 'PyJWT', 'Argon2id'],
    },
    { group: 'data', items: ['PostgreSQL 17', 'Redis 7'] },
    { group: 'infrastructure', items: ['Docker Compose', 'nginx', 'GitHub Actions'] },
    { group: 'testing', items: ['pytest', 'Vitest', 'Jest', 'Testing Library', 'Ruff', 'mypy (strict)'] },
    { group: 'services', items: ['OpenRouteService', 'OpenStreetMap'] },
  ],

  overview: {
    what: tri(
      'Egy kis közúti fuvarozócég mindennapi munkájának teljes veremű bemutatója: szállítmányok tervezése, sofőrök és járművek hozzárendelése, karbantartás és költségek követése, és auditnapló. Van hozzá React webalkalmazás az irodának és React Native sofőr-alkalmazás.',
      'A full-stack demonstration of the daily work of a small road-freight company: planning shipments, assigning drivers and vehicles, following maintenance and costs, and keeping an audit trail. It has a React web application for the office and a React Native driver app.',
      'Een full-stackdemonstratie van het dagelijkse werk van een klein wegtransportbedrijf: zendingen plannen, chauffeurs en voertuigen toewijzen, onderhoud en kosten volgen en een auditspoor bijhouden. Er is een React-webapplicatie voor kantoor en een React Native-chauffeursapp.',
    ),
    audience: tri(
      'Négy szerepkör, ahogy a rendszerben is: adminisztrátorok, diszpécserek, könyvelők és sofőrök; mindegyik ugyanannak az adatnak más szeletét látja.',
      'Four roles, as in the system itself: administrators, dispatchers, accountants and drivers; each sees a different slice of the same data.',
      'Vier rollen, zoals in het systeem zelf: beheerders, planners, boekhouders en chauffeurs; elk ziet een ander deel van dezelfde data.',
    ),
    problem: tri(
      'A kis és közepes fuvarozócégek a napot gyakran táblázatokon, telefonhívásokon, e-mailen és papír szállítólevelen viszik, amíg ki nem derül, hogy egy kocsit két rakományra is ígértek, egy sofőr jogosítványa észrevétlenül lejárt, vagy senki nem tudja megmondani, mit hozott egy szállítmány.',
      'Small and mid-sized freight companies often run the day on spreadsheets, phone calls, e-mail and paper consignment notes, until a truck is promised to two loads, a driver’s licence expires unnoticed, or nobody can say what a shipment earned.',
      'Kleine en middelgrote transportbedrijven draaien de dag vaak op spreadsheets, telefoontjes, e-mail en papieren vrachtbrieven, totdat een truck aan twee ladingen is beloofd, een rijbewijs ongemerkt verloopt of niemand kan zeggen wat een zending opleverde.',
    ),
    goal: tri(
      'A teljes veremű mérnöki munka bemutatása: típusos REST API, relációs adatmodell, háttérfeladatok, webes és mobilalkalmazás, automatikus tesztek, és egyetlen Docker-paranccsal induló környezet.',
      'To demonstrate full-stack engineering: a typed REST API, a relational data model, background jobs, a web app and a mobile app, automated tests, and a one-command Docker setup.',
      'Full-stackengineering demonstreren: een getypeerde REST API, een relationeel datamodel, achtergrondtaken, een webapp en een mobiele app, geautomatiseerde tests en een Docker-opzet met één opdracht.',
    ),
  },

  challenges: [
    {
      title: tri(
        'Szabályok, amelyeknek akkor is érvényesnek kell lenniük, ha a kód téved',
        'Rules that must hold even when the code is wrong',
        'Regels die moeten gelden ook als de code zich vergist',
      ),
      problem: tri(
        'Egy sofőr és egy vontató hozzárendelésekor figyelembe kell venni a jogosítványt, a bizonyítványokat, a biztosítást, a műszaki vizsgát, az átfedő fuvarokat és a műhelyben lévő járműveket; egy csak a felületen futó ellenőrzés megkerülhető, vagy versenyhelyzetbe kerülhet egy másik kéréssel.',
        'Assigning a driver and a truck has to respect licences, certificates, insurance, inspections, overlapping jobs and vehicles in the workshop; a check that lives only in the interface can be bypassed or race with another request.',
        'Het toewijzen van een chauffeur en een trekker moet rekening houden met rijbewijzen, certificaten, verzekering, keuringen, overlappende ritten en voertuigen in de werkplaats; een controle die alleen in de interface leeft kan worden omzeild of in een race met een ander verzoek terechtkomen.',
      ),
      solution: tri(
        'A szállítmány állapotgépét a háttérrendszer birtokolja, és a hozzárendelést olyan üzenettel utasítja el, amely megnevezi az erőforrást és az okot. Ugyanezek a szabályok CHECK, UNIQUE és ON DELETE RESTRICT megszorításként a PostgreSQL-ben is ott vannak, így az adatbázist nem lehet „megbeszélni”; az API megmondja a felületnek, mely állapotváltások engedélyezettek éppen.',
        'The backend owns the shipment state machine and refuses an assignment with a message naming the resource and the reason. The same rules are also CHECK, UNIQUE and ON DELETE RESTRICT constraints in PostgreSQL, so the database cannot be talked round; the API tells the interface which status moves are allowed right now.',
        'De backend is eigenaar van de toestandsmachine van de zending en weigert een toewijzing met een melding die de resource en de reden noemt. Dezelfde regels zijn ook CHECK-, UNIQUE- en ON DELETE RESTRICT-constraints in PostgreSQL, zodat de database niet te overtuigen is; de API vertelt de interface welke statusovergangen op dit moment zijn toegestaan.',
      ),
      source: 'docs/architecture.md · The shipment workflow · Decisions worth knowing about',
    },
    {
      title: tri('Különböző szerepkörök, különböző igazságok', 'Different roles, different truths', 'Verschillende rollen, verschillende waarheden'),
      problem: tri(
        'Egy sofőr csak a saját szállítmányait láthatja; egy könyvelő látja a pénzt, de a címeket nem.',
        'A driver may see only their own shipments; an accountant should see the money but not the addresses.',
        'Een chauffeur mag alleen zijn eigen zendingen zien; een boekhouder moet het geld zien maar niet de adressen.',
      ),
      solution: tri(
        'A hozzáférési mátrixot egyszer deklarálják, és tesztek vetik össze a specifikációval; a hozzáférés nemcsak engedélyezett, hanem szűkített is (más szállítmánya 404, így a létezése sem derül ki). Egy teszt minden útvonalat névtelenül hív, és elbukik, ha bármelyik 401-től eltérőt válaszol.',
        'The access matrix is declared once and checked against the specification by tests; access is scoped as well as allowed (someone else’s shipment is a 404, so its existence is not revealed). A test calls every route anonymously and fails if any answers anything but 401.',
        'De toegangsmatrix wordt één keer gedeclareerd en door tests met de specificatie vergeleken; toegang is niet alleen toegestaan maar ook beperkt (andermans zending is een 404, zodat het bestaan niet wordt verraden). Een test roept elke route anoniem aan en faalt als er een iets anders dan 401 antwoordt.',
      ),
      source: 'README · Engineering Highlights · Role-based access control',
    },
    {
      title: tri('Élő képernyők extra infrastruktúra és kiszivárgás nélkül', 'Live screens without extra infrastructure or leaks', 'Live schermen zonder extra infrastructuur of lekken'),
      problem: tri(
        'A diszpécsereknek olyan képernyők kellenek, amelyek maguktól frissülnek, ehhez külön üzenetközvetítő nélkül, és anélkül, hogy egy visszagörgetett változásról bárkit értesítenének.',
        'Dispatchers need screens that update by themselves, without a message broker just for that, and without telling anyone about a change that was rolled back.',
        'Planners hebben schermen nodig die zichzelf bijwerken, zonder een aparte berichtenbroker en zonder iemand te informeren over een wijziging die is teruggedraaid.',
      ),
      solution: tri(
        'Az események PostgreSQL LISTEN/NOTIFY-jal, a változást végző tranzakción belül mennek ki, így egy visszagörgetett változás senkit nem értesít. Az események nem hordoznak adatot: a képernyő a szokásos API-n át kéri le újra, így minden jogosultsági szabály újra érvényesül.',
        'Events go out through PostgreSQL LISTEN/NOTIFY inside the transaction that makes the change, so a rolled-back change tells nobody. Events carry no data: the screen refetches through the normal API, so every permission rule applies again.',
        'Events gaan uit via PostgreSQL LISTEN/NOTIFY binnen de transactie die de wijziging maakt, zodat een teruggedraaide wijziging niemand informeert. Events dragen geen data: het scherm haalt opnieuw op via de gewone API, zodat elke rechtenregel opnieuw geldt.',
      ),
      source: 'docs/architecture.md · Live updates · docs/realtime.md',
    },
    {
      title: tri('Egy demó, amely sosem mond ellent a rendszernek', 'A demo that never contradicts the system', 'Een demo die het systeem nooit tegenspreekt'),
      problem: tri(
        'Egy hihető demóhoz egy évnyi adat kell, de a kitalált adat megsértheti a rendszer saját szabályait (egy sofőr egyszerre két rakományon).',
        'A believable demo needs a year of data, but invented data can break the very rules the system enforces (a driver on two loads at once).',
        'Een geloofwaardige demo heeft een jaar aan data nodig, maar verzonnen data kan juist de regels breken die het systeem afdwingt (een chauffeur op twee ladingen tegelijk).',
      ),
      solution: tri(
        'A demócéget előbb megtervezik, majd ugyanazokkal a szabályokkal ellenőrzik, amelyeket az API is alkalmaz; a dátumok a mai naptól számolódnak, így a vezérlőpult a létrehozás pillanatában él.',
        'The demo company is planned first and then checked against the same rules the API applies; it is dated from today, so the dashboard is alive whenever it is created.',
        'Het democedrijf wordt eerst gepland en daarna gecontroleerd tegen dezelfde regels die de API toepast; het is gedateerd vanaf vandaag, zodat het dashboard leeft op het moment van aanmaken.',
      ),
      source: 'docs/architecture.md · Decisions worth knowing about · docs/demo-data.md',
    },
  ],

  approach: [
    {
      title: tri('A háttérrendszer az igazság forrása', 'The backend as the source of truth', 'De backend als bron van waarheid'),
      text: tri(
        'Rétegek: útválasztók (csak HTTP), függőségek (munkamenet, felhasználó, szerepkör-ellenőrzés), szolgáltatások (az üzleti szabályok) és tárolók (SQL). A felület az API válaszából dolgozik, és sosem számolja ki maga a szabályokat.',
        'Layers: routers (HTTP only), dependencies (session, signed-in user, role check), services (the business rules) and repositories (SQL). The interface works from the API’s answers and never works the rules out itself.',
        'Lagen: routers (alleen HTTP), dependencies (sessie, ingelogde gebruiker, rolcontrole), services (de bedrijfsregels) en repositories (SQL). De interface werkt vanuit de antwoorden van de API en berekent de regels nooit zelf.',
      ),
    },
    {
      title: tri('Egy tranzakció, három hatás', 'One transaction, three effects', 'Eén transactie, drie effecten'),
      text: tri(
        'A változás, az auditbejegyzés és az esemény ugyanabban a tranzakcióban van: a visszagörgetett változás nem hagy bejegyzést és nem értesít senkit; a megtartott változásnak mindig van bejegyzése.',
        'The change, the audit entry and the event are in the same transaction: a rolled-back change leaves no entry and tells nobody; a kept change always has both.',
        'De wijziging, het auditbericht en het event zitten in dezelfde transactie: een teruggedraaide wijziging laat geen bericht achter en informeert niemand; een behouden wijziging heeft altijd beide.',
      ),
    },
    {
      title: tri('A háttérmunka vékony marad', 'Background work stays thin', 'Achtergrondwerk blijft dun'),
      text: tri(
        'A Celery-feladatok a szolgáltatások vékony burkolói és idempotensek, pontosan egy ütemezővel; az API Redis nélkül is működik (az állapotjelzés ekkor „degraded”, nem „nem elérhető”).',
        'Celery tasks are thin wrappers over services and idempotent, with exactly one scheduler; the API works without Redis (the readiness check then says "degraded", not "unavailable").',
        'Celery-taken zijn dunne wrappers rond services en idempotent, met precies één scheduler; de API werkt zonder Redis (de readiness-check meldt dan "degraded", niet "unavailable").',
      ),
    },
    {
      title: tri('A webalkalmazás közös darabokból épül', 'A web app built from shared parts', 'Een webapp opgebouwd uit gedeelde onderdelen'),
      text: tri(
        'Típusos szolgáltatások és hookok, közös UI-készlet (táblák, szűrők, párbeszédek, jelzések), a listák állapota a címben él. A frontend a szerepkör szerint mutatja a menüt, de a jogosultságot az API tőle függetlenül kikényszeríti.',
        'Typed services and hooks, a shared UI kit (tables, filters, dialogs, status), and list state that lives in the address. The front end shows the menu by role, but the API enforces permissions independently of it.',
        'Getypeerde services en hooks, een gedeelde UI-kit (tabellen, filters, dialogen, status) en lijststatus die in het adres leeft. De frontend toont het menu per rol, maar de API dwingt rechten er onafhankelijk van af.',
      ),
    },
    {
      title: tri('Egyetlen paranccsal futtatható', 'Runnable with one command', 'Met één opdracht te draaien'),
      text: tri(
        'A Docker Compose hat szolgáltatást indít (PostgreSQL, Redis, API, worker, ütemező, webszerver), megvárva az egészséges függőségeket; a backend-kép nem root felhasználóként fut, a portok csak a 127.0.0.1-en nyitottak.',
        'Docker Compose starts six services (PostgreSQL, Redis, API, worker, scheduler, web server), waiting for healthy dependencies; the backend image runs as an unprivileged user and ports are published on 127.0.0.1 only.',
        'Docker Compose start zes services (PostgreSQL, Redis, API, worker, scheduler, webserver) en wacht op gezonde afhankelijkheden; het backendimage draait als niet-bevoorrechte gebruiker en poorten zijn alleen op 127.0.0.1 gepubliceerd.',
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
            label: 'Web app',
            detail: tri('React · TypeScript; adminisztrátorok, diszpécserek, könyvelők', 'React · TypeScript; administrators, dispatchers, accountants', 'React · TypeScript; beheerders, planners, boekhouders'),
            status: 'built',
          },
          {
            id: 'driver',
            label: 'Driver app',
            detail: tri(
              'React Native (Expo) · offline sor; fizikai eszközön még nem futtatva',
              'React Native (Expo) · offline queue; not yet run on a physical device',
              'React Native (Expo) · offlinewachtrij; nog niet op een fysiek apparaat gedraaid',
            ),
            status: 'partial',
          },
        ],
      },
      {
        id: 'edge',
        label: tri('Belépési pont', 'Entry point', 'Toegangspunt'),
        nodes: [
          {
            id: 'nginx',
            label: 'nginx',
            detail: tri('statikus fájlok, /api és WebSocket továbbítás', 'static files, /api and WebSocket proxy', 'statische bestanden, /api- en WebSocket-proxy'),
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
            label: 'FastAPI',
            detail: tri('útválasztók · szolgáltatások · tárolók', 'routers · services · repositories', 'routers · services · repositories'),
            status: 'built',
          },
          {
            id: 'worker',
            label: 'Celery worker',
            detail: tri('ellenőrzések és e-mailek', 'checks and e-mails', 'controles en e-mails'),
            status: 'built',
          },
          {
            id: 'beat',
            label: 'Celery beat',
            detail: tri('ütemező, pontosan egy példány', 'scheduler, exactly one instance', 'scheduler, precies één instantie'),
            status: 'built',
          },
        ],
      },
      {
        id: 'data',
        label: tri('Adat', 'Data', 'Data'),
        nodes: [
          {
            id: 'pg',
            label: 'PostgreSQL 17',
            detail: tri('adatok, auditnapló, LISTEN / NOTIFY', 'data, audit log, LISTEN / NOTIFY', 'data, auditlog, LISTEN / NOTIFY'),
            status: 'built',
          },
          {
            id: 'redis',
            label: 'Redis 7',
            detail: tri('csak a háttérfeladatok közvetítője', 'task broker only', 'alleen takenbroker'),
            status: 'built',
          },
        ],
      },
      {
        id: 'external',
        label: tri('Külső szolgáltatás', 'External service', 'Externe dienst'),
        nodes: [
          {
            id: 'maps',
            label: 'OpenRouteService / OpenStreetMap',
            detail: tri(
              'útvonaltervezés; az ORS-adaptert a dokumentációhoz tesztelték, nem éles kulccsal',
              'route planning; the ORS adapter is tested against its documentation, not a live key',
              'routeplanning; de ORS-adapter is getest tegen de documentatie, niet met een live sleutel',
            ),
            status: 'partial',
          },
        ],
      },
    ],
    links: [
      { from: 'web', to: 'nginx', label: tri('HTTP', 'HTTP', 'HTTP') },
      { from: 'driver', to: 'nginx', label: tri('REST + JWT', 'REST + JWT', 'REST + JWT'), status: 'partial' },
      { from: 'nginx', to: 'api', label: tri('/api és /api/ws', '/api and /api/ws', '/api en /api/ws') },
      { from: 'api', to: 'pg', label: tri('SQL', 'SQL', 'SQL') },
      { from: 'api', to: 'maps', label: tri('útvonaltervezés', 'route planning', 'routeplanning'), status: 'partial' },
      { from: 'beat', to: 'redis', label: tri('feladatok ütemezése', 'schedules tasks', 'plant taken in') },
      { from: 'redis', to: 'worker', label: tri('feladatok', 'tasks', 'taken') },
      { from: 'worker', to: 'pg', label: tri('SQL', 'SQL', 'SQL') },
      { from: 'pg', to: 'api', label: tri('NOTIFY-események (a tranzakció után)', 'NOTIFY events (after the transaction commits)', 'NOTIFY-events (nadat de transactie is gecommit)') },
      { from: 'api', to: 'web', label: tri('WebSocket: események, adat nélkül', 'WebSocket: events without data', 'WebSocket: events zonder data') },
    ],
    note: tri(
      'Az eseményeken át a képernyő újra lekéri az adatot a szokásos API-n keresztül, így minden jogosultsági szabály újra érvényesül.',
      'On an event the screen refetches through the normal API, so every permission rule applies again.',
      'Na een event haalt het scherm opnieuw op via de gewone API, zodat elke rechtenregel opnieuw geldt.',
    ),
  },

  features: [
    {
      status: 'done',
      title: tri('Szállítmányok és állapot-munkafolyamat', 'Shipments and the status workflow', 'Zendingen en de statusworkflow'),
      text: tri(
        'NEW → ASSIGNED → LOADING → IN_TRANSIT → DELIVERED (vagy CANCELLED), útpontokkal, térképen tervezett útvonallal, távolsággal és menetidővel, teljes állapottörténettel. Visszalépés és lemondás indoklást kér, és a szerepkör határozza meg, ki melyik lépést teheti.',
        'NEW → ASSIGNED → LOADING → IN_TRANSIT → DELIVERED (or CANCELLED), with waypoints, a route planned on a map with distance and driving time, and a full status history. Stepping back or cancelling asks for a reason, and the role decides who may make which move.',
        'NEW → ASSIGNED → LOADING → IN_TRANSIT → DELIVERED (of CANCELLED), met tussenstops, een op de kaart geplande route met afstand en rijtijd en een volledige statusgeschiedenis. Een stap terug of annuleren vraagt om een reden en de rol bepaalt wie welke stap mag zetten.',
      ),
      image: 'shipment-details',
    },
    {
      status: 'done',
      title: tri('Szabályellenőrzött hozzárendelés', 'Rule-checked assignment', 'Regelgecontroleerde toewijzing'),
      text: tri(
        'Sofőr, vontató és pótkocsi csak akkor rendelhető, ha a jogosítvány, a GKI, az orvosi alkalmasság, a biztosítás és a műszaki vizsga a kiszállítás napján érvényes, nincs átfedő nyitott fuvar, és semmi nincs a műhelyben.',
        'A driver, truck and trailer can be assigned only if the licence, GKI, medical certificate, insurance and inspection are valid on the delivery day, no other open shipment overlaps, and nothing is in the workshop.',
        'Een chauffeur, trekker en oplegger kunnen alleen worden toegewezen als rijbewijs, GKI, medisch certificaat, verzekering en keuring op de leverdag geldig zijn, geen andere open zending overlapt en niets in de werkplaats staat.',
      ),
      image: 'shipments',
    },
    {
      status: 'done',
      title: tri('Flotta, sofőrök és ügyfelek', 'Fleet, drivers and customers', 'Vloot, chauffeurs en klanten'),
      text: tri(
        'Vontatók, pótkocsik, sofőrök és ügyfelek lejárati dátumokkal, amelyeket a lejárat előtt jelöl a rendszer. A listák kereshetők, rendezhetők és lapozhatók, az állapotuk a címben él.',
        'Trucks, trailers, drivers and customers with expiry dates that are flagged before they pass. Lists are searchable, sortable and paged, with their state in the address.',
        'Trekkers, opleggers, chauffeurs en klanten met vervaldata die voor het verlopen worden gemarkeerd. Lijsten zijn doorzoekbaar, sorteerbaar en gepagineerd, met hun status in het adres.',
      ),
      image: 'fleet',
    },
    {
      status: 'done',
      title: tri('Karbantartás és üzemanyag', 'Maintenance and fuel', 'Onderhoud en brandstof'),
      text: tri(
        'Tervezett és késő szervizek súlyosság szerinti riasztásokkal (dátum és kilométer alapján), műhelylista, idővonal járművenként; tankolási rekordok, fogyasztás liter/100 km-ben, kilométerköltség és összehasonlítás.',
        'Planned and overdue services with alerts by severity (by date and by kilometres), a workshop list and a timeline per truck; refuelling records, consumption in litres per 100 km, cost per kilometre and a comparison.',
        'Geplande en achterstallige servicebeurten met meldingen naar ernst (op datum en op kilometers), een werkplaatslijst en een tijdlijn per truck; tankregistraties, verbruik in liters per 100 km, kosten per kilometer en een vergelijking.',
      ),
      image: 'maintenance',
    },
    {
      status: 'done',
      title: tri('Költségek, haszon és jelentések', 'Costs, profit and reports', 'Kosten, winst en rapporten'),
      text: tri(
        'Költségek szállítmányonként, haszon és árrés szállítmányonként, öt jelentés (szállítmányok, pénzügy, flotta, sofőrök, üzemanyag) CSV- és Excel-exporttal. A pénz NUMERIC, soha nem lebegőpontos. Csak euróban számol: más pénznemű költség rögzül, de nem számít bele.',
        'Expenses per shipment, profit and margin per shipment, five reports (shipments, financial, fleet, drivers, fuel) with CSV and Excel export. Money is NUMERIC, never floating point. It counts in euro only: an expense in another currency is recorded but not counted.',
        'Kosten per zending, winst en marge per zending, vijf rapporten (zendingen, financieel, vloot, chauffeurs, brandstof) met CSV- en Excel-export. Geld is NUMERIC, nooit floating point. Er wordt alleen in euro gerekend: een uitgave in een andere valuta wordt vastgelegd maar niet meegeteld.',
      ),
      image: 'reports',
    },
    {
      status: 'done',
      title: tri('Dokumentumok', 'Documents', 'Documenten'),
      text: tri(
        'CMR, kézbesítési igazolás és számlák csatolása szállítmányhoz: PDF, JPEG vagy PNG, méret- és típusellenőrzéssel, csak a szállítmányt látó szerepköröknek hozzáférhető. A fájlok helyi lemezen vannak.',
        'CMR, proof of delivery and invoices attached to a shipment: PDF, JPEG or PNG with size and type checks, available only to the roles that may see the shipment. Files live on local disk.',
        'CMR, afleverbewijs en facturen gekoppeld aan een zending: PDF, JPEG of PNG met controle op grootte en type, alleen toegankelijk voor de rollen die de zending mogen zien. Bestanden staan op de lokale schijf.',
      ),
    },
    {
      status: 'done',
      title: tri('Értesítések és élő frissítés', 'Notifications and live updates', 'Notificaties en live updates'),
      text: tri(
        'Ütemezett feladatok értesítést küldenek késő szállítmányokról, lejáró papírokról és késő karbantartásról (az alkalmazásban, sürgős esetben e-mailben is); a képernyők WebSockettel maguktól frissülnek. Az események jelzések, nem napló: nem tárolódnak és nem játszhatók vissza.',
        'Scheduled jobs raise notifications about late shipments, expiring papers and overdue maintenance (in the app, and by e-mail when urgent); screens refresh by themselves over a WebSocket. Events are hints, not a log: they are not stored or replayed.',
        'Geplande taken sturen notificaties over late zendingen, verlopende papieren en achterstallig onderhoud (in de app en bij urgentie per e-mail); schermen verversen zichzelf via een WebSocket. Events zijn hints, geen log: ze worden niet opgeslagen of herhaald.',
      ),
      image: 'dashboard',
    },
    {
      status: 'done',
      title: tri('Szerepkör-alapú hozzáférés és auditnapló', 'Role-based access and the audit log', 'Rolgebaseerde toegang en het auditlog'),
      text: tri(
        'Négy szerepkör a szerveren kikényszerítve; a hozzáférési mátrixot tesztek vetik össze a specifikációval. Csak hozzáfűzhető auditnapló minden változásról, JSONB-ben a változás előtti és utáni értékekkel.',
        'Four roles enforced on the server; the access matrix is checked against the specification by tests. An append-only audit log of every change, with before and after values in JSONB.',
        'Vier rollen afgedwongen op de server; de toegangsmatrix wordt door tests met de specificatie vergeleken. Een append-only auditlog van elke wijziging, met waarden voor en na in JSONB.',
      ),
    },
    {
      status: 'partial',
      title: tri('Sofőr-alkalmazás', 'Driver app', 'Chauffeursapp'),
      text: tri(
        'React Native (Expo) alkalmazás offline sorral az állapotváltásokhoz, tankolásokhoz és dokumentumfotókhoz. Az offline támogatás sor, nem teljes offline mód; fizikai eszközön még nem futtatták; a helyzetet még nem jelenti.',
        'A React Native (Expo) app with an offline queue for status changes, refuellings and document photos. Its offline support is a queue, not a full offline mode; it has not been run on a physical device, and it does not report position yet.',
        'Een React Native-app (Expo) met een offlinewachtrij voor statuswijzigingen, tankbeurten en documentfoto’s. De offline-ondersteuning is een wachtrij, geen volledige offlinemodus; ze is nog niet op een fysiek apparaat gedraaid en meldt nog geen positie.',
      ),
    },
    {
      status: 'partial',
      title: tri('Útvonaltérképek', 'Route maps', 'Routekaarten'),
      text: tri(
        'Az útvonal a szolgáltató adatainak minőségéig jó; a pozíció kézzel nem javítható, és egy szállítmány címei létrehozás után nem szerkeszthetők (az útpontok igen). Az OpenRouteService-adaptert a dokumentációhoz tesztelték, nem éles kulccsal.',
        'A route is only as good as the provider’s data; a position cannot be corrected by hand and a shipment’s own addresses cannot be edited after creation (its waypoints can). The OpenRouteService adapter is tested against its documentation, not a live key.',
        'Een route is zo goed als de data van de provider; een positie kan niet met de hand worden gecorrigeerd en de eigen adressen van een zending zijn na aanmaak niet te bewerken (de tussenstops wel). De OpenRouteService-adapter is getest tegen de documentatie, niet met een live sleutel.',
      ),
    },
    {
      status: 'partial',
      title: tri('Folyamatos integráció', 'Continuous integration', 'Continue integratie'),
      text: tri(
        'A GitHub Actions munkafolyamat megvan, és a fejlesztés során használt parancsokat futtatja; tiszta Linux-konténerekben ellenőrizték, de magán a GitHubon még nem futott. Telepítési folyamat nincs.',
        'The GitHub Actions workflow exists and runs exactly the commands used during development; it was checked in clean Linux containers but has not yet run on GitHub itself. There is no deployment pipeline.',
        'De GitHub Actions-workflow bestaat en draait precies de opdrachten die tijdens de ontwikkeling zijn gebruikt; hij is gecontroleerd in schone Linux-containers maar nog niet op GitHub zelf gedraaid. Er is geen deploymentpijplijn.',
      ),
    },
    {
      status: 'planned',
      title: tri('GPS és élő követés', 'GPS and live tracking', 'GPS en live tracking'),
      text: tri(
        'A sofőr-alkalmazás az állapotot jelenti, a pozíciót még nem. Következik: háttérbeli helyzetjelentés, pozíciótörténet és a járművek élő térképe a diszpécser vezérlőpultján.',
        'The driver app reports status, not yet position. Next: background location reporting, a position history and a live map of the vehicles on the dispatcher’s dashboard.',
        'De chauffeursapp meldt de status, nog niet de positie. Volgende stap: locatiemeldingen op de achtergrond, een positiegeschiedenis en een live kaart van de voertuigen op het dashboard van de planner.',
      ),
    },
    {
      status: 'planned',
      title: tri('Fiókok megerősítése', 'Hardening accounts', 'Accounts verstevigen'),
      text: tri(
        'Frissítő tokenek szerveroldali visszavonással, jelszómódosítás és -visszaállítás e-mailben, opcionális kétfaktoros bejelentkezés. Ma a hozzáférési tokenek egy óráig élnek, és nem vonhatók vissza.',
        'Refresh tokens with server-side revocation, password change and reset by e-mail, optional two-factor sign-in. Today access tokens last an hour and cannot be revoked.',
        'Refresh-tokens met intrekking aan serverzijde, wachtwoordwijziging en -herstel per e-mail, optioneel tweefactoraanmelden. Nu duren toegangstokens een uur en kunnen ze niet worden ingetrokken.',
      ),
    },
    {
      status: 'planned',
      title: tri('Üzemeltetett demó és böngészős végpontok közötti tesztek', 'A hosted demo and browser end-to-end tests', 'Een gehoste demo en browser-end-to-endtests'),
      text: tri(
        'A tárolóképek publikálása és egy üzemeltetett demó TLS mögött, mentésekkel és megfigyeléssel; Playwright-tesztek a fő útvonalakra (szállítmány létrehozása, hozzárendelése, kézbesítése).',
        'Publish the container images and deploy a hosted demo behind TLS, with backups and monitoring; Playwright tests for the main journeys (create a shipment, assign it, deliver it).',
        'De containerimages publiceren en een gehoste demo achter TLS uitrollen, met back-ups en monitoring; Playwright-tests voor de hoofdroutes (een zending aanmaken, toewijzen, afleveren).',
      ),
    },
  ],

  limits: [
    tri(
      'Nincs üzemeltetve sehol: a projekt nem éles, nincsenek ügyfelei, minden adata fiktív.',
      'It is not hosted anywhere: it is not in production, has no customers, and all of its data is fictional.',
      'Het wordt nergens gehost: het is niet in productie, heeft geen klanten en alle data is fictief.',
    ),
    tri(
      'A pénz csak euróban kezelt: nincs ÁFA, számlázás és árfolyam.',
      'Money is handled in euro only: no VAT, invoicing or exchange rates.',
      'Geld wordt alleen in euro behandeld: geen btw, facturatie of wisselkoersen.',
    ),
    tri(
      'A hozzáférési tokenek egy óráig élnek, és nem vonhatók vissza; nincs jelszó-visszaállítás és kétfaktoros belépés.',
      'Access tokens last an hour and cannot be revoked; there is no password reset and no two-factor sign-in.',
      'Toegangstokens duren een uur en kunnen niet worden ingetrokken; er is geen wachtwoordherstel en geen tweefactoraanmelding.',
    ),
    tri(
      'A dokumentumok helyi lemezen vannak, objektumtár és víruskeresés nélkül.',
      'Documents are stored on local disk, with no object storage or virus scan.',
      'Documenten staan op de lokale schijf, zonder objectopslag of virusscan.',
    ),
  ],

  decisions: [
    {
      title: tri('A menü csak azt mutatja, amit a szerepkör megnyithat', 'The menu shows only what the role may open', 'Het menu toont alleen wat de rol mag openen'),
      text: tri(
        'Az oldalsáv a bejelentkezett szerepkörnek megfelelően szűkül; aki mégis begépeli a címet, „hozzáférés megtagadva” képernyőt kap, és ugyanaz a kérés közvetlenül az API-nak 403. A felület csak megjeleníti a szabályt, az API érvényesíti.',
        'The sidebar narrows to the signed-in role; someone who types the address anyway gets an "access denied" screen, and the same request straight to the API is a 403. The interface only shows the rule; the API enforces it.',
        'De zijbalk past zich aan de ingelogde rol aan; wie het adres toch intypt krijgt een "toegang geweigerd"-scherm en hetzelfde verzoek rechtstreeks naar de API is een 403. De interface toont de regel alleen; de API dwingt hem af.',
      ),
    },
    {
      title: tri('A lista állapota a címben él', 'List state lives in the address', 'Lijststatus leeft in het adres'),
      text: tri(
        'A keresés, a szűrők, a rendezés és az oldal a címsorban van, így a lista könyvjelzőzhető, és a Vissza gomb oda tér vissza.',
        'Search, filters, sort and page are in the address, so a list can be bookmarked and Back returns to it.',
        'Zoeken, filters, sortering en pagina staan in het adres, zodat een lijst kan worden gebookmarkt en Terug ernaar terugkeert.',
      ),
    },
    {
      title: tri('Két stratégia a táblákra telefonon', 'Two strategies for tables on a phone', 'Twee strategieën voor tabellen op een telefoon'),
      text: tri(
        'A rekordtáblák telefonon kártyákká válnak; a széles adattáblák oldalra görgethetők, és az élükön árnyék jelzi, hol van még tartalom. Az elrendezés az alkotóelem rendelkezésére álló helyre reagál (konténer-lekérdezések), nem az ablakra.',
        'Record tables become cards on a phone; wide data tables scroll sideways with an edge shadow where more is hidden. Layouts react to the room a component has (container queries), not to the window.',
        'Recordtabellen worden kaarten op een telefoon; brede datatabellen scrollen zijwaarts met een randschaduw waar meer verborgen is. Layouts reageren op de ruimte van een component (containerqueries), niet op het venster.',
      ),
    },
    {
      title: tri('Billentyűzet-barát extrák', 'Keyboard-friendly extras', 'Toetsenbordvriendelijke extra’s'),
      text: tri(
        'Globális keresés (Ctrl/Cmd+K vagy „/”), morzsamenü, a fókuszt csapdába ejtő és visszaadó párbeszédablakok, a WCAG 1.4.13-at követő tippek; minden diagramhoz tartozik az adatai táblázata a képernyőolvasóknak.',
        'A global search (Ctrl/Cmd+K or "/"), breadcrumbs, dialogs that trap and return focus, tooltips that follow WCAG 1.4.13; every chart comes with its data as a table for screen readers.',
        'Een globale zoekfunctie (Ctrl/Cmd+K of "/"), kruimelpaden, dialogen die de focus vangen en teruggeven, tooltips die WCAG 1.4.13 volgen; elke grafiek komt met zijn data als tabel voor schermlezers.',
      ),
    },
  ],

  learned: [],

  next: [
    tri(
      'GPS és élő követés a sofőr-alkalmazásból, a járművek élő térképével.',
      'GPS and live tracking from the driver app, with a live map of the vehicles.',
      'GPS en live tracking vanuit de chauffeursapp, met een live kaart van de voertuigen.',
    ),
    tri(
      'Útvonal-optimalizálás: több megállós utak sorrendje és a legolcsóbb jármű kiválasztása.',
      'Route optimisation: sequencing multi-stop trips and choosing the truck that makes the plan cheapest.',
      'Routeoptimalisatie: meerdere stops volgordelijk plannen en de truck kiezen die het plan het goedkoopst maakt.',
    ),
    tri(
      'Üzemeltetett demó TLS mögött, mentésekkel és megfigyeléssel.',
      'A hosted demo behind TLS, with backups and monitoring.',
      'Een gehoste demo achter TLS, met back-ups en monitoring.',
    ),
  ],

  gallery: [
    {
      id: 'dashboard',
      src: '/projects/logistics-platform/dashboard.webp',
      width: 1440,
      height: 900,
      device: 'desktop',
      hero: true,
      alt: tri(
        'A vezérlőpult: nyitott szállítmányok, késések, szabad vontatók, súlyosság szerinti riasztások és a szállítmányok állapotdiagramja.',
        'The dashboard: open shipments, delays, available trucks, alerts by severity and the shipment status chart.',
        'Het dashboard: open zendingen, vertragingen, beschikbare trekkers, meldingen naar ernst en de statusgrafiek van zendingen.',
      ),
      caption: tri('Vezérlőpult', 'Dashboard', 'Dashboard'),
    },
    {
      id: 'shipments',
      src: '/projects/logistics-platform/shipments.webp',
      width: 1440,
      height: 900,
      device: 'desktop',
      alt: tri(
        'A szállítmánylista keresővel, állapot-, ügyfél-, sofőr-, vontató- és felvételi dátum szűrőkkel, rendezhető oszlopokkal és állapotjelvényekkel.',
        'The shipment list with search, status, customer, driver, truck and pickup-date filters, sortable columns and status badges.',
        'De zendingenlijst met zoeken, filters op status, klant, chauffeur, truck en ophaaldatum, sorteerbare kolommen en statusbadges.',
      ),
      caption: tri('Szállítmánykezelés', 'Shipment management', 'Zendingenbeheer'),
    },
    {
      id: 'shipment-details',
      src: '/projects/logistics-platform/shipment-details.webp',
      width: 1440,
      height: 1320,
      device: 'desktop',
      alt: tri(
        'Egy szállítmány részletei: az állapot-munkafolyamat a most engedélyezett lépésekkel és a térképen tervezett útvonal távolsággal és menetidővel.',
        'A shipment’s details: the status workflow with the moves allowed right now, and the planned route on a map with distance and driving time.',
        'De details van een zending: de statusworkflow met de nu toegestane stappen en de geplande route op een kaart met afstand en rijtijd.',
      ),
      caption: tri('Szállítmány részletei', 'Shipment details', 'Zendingdetails'),
    },
    {
      id: 'fleet',
      src: '/projects/logistics-platform/fleet.webp',
      width: 1440,
      height: 900,
      device: 'desktop',
      alt: tri(
        'A flotta: vontatók állapottal, futásteljesítménnyel és azokkal a dátumokkal, ameddig közúton járhatnak, a lejárókhoz jelzéssel.',
        'The fleet: trucks with status, mileage and the dates they must be road-legal until, flagged as they come due.',
        'De vloot: trucks met status, kilometerstand en de data tot wanneer ze wettelijk mogen rijden, gemarkeerd naarmate ze verlopen.',
      ),
      caption: tri('Flotta', 'Fleet', 'Vloot'),
    },
    {
      id: 'maintenance',
      src: '/projects/logistics-platform/maintenance.webp',
      width: 1440,
      height: 1000,
      device: 'desktop',
      alt: tri(
        'Karbantartás: mi késik, mi következik és mi van a műhelyben, járművenként.',
        'Maintenance: what is overdue, what is coming and what is in the workshop, truck by truck.',
        'Onderhoud: wat achterstallig is, wat eraan komt en wat in de werkplaats staat, truck per truck.',
      ),
      caption: tri('Karbantartás', 'Maintenance', 'Onderhoud'),
    },
    {
      id: 'reports',
      src: '/projects/logistics-platform/reports.webp',
      width: 1440,
      height: 1100,
      device: 'desktop',
      alt: tri(
        'Jelentések: bevétel, költség és haszon egy választott időszakra, diagramokkal és CSV- vagy Excel-exporttal.',
        'Reports: revenue, expenses and profit for a chosen period, with charts and CSV or Excel export.',
        'Rapporten: omzet, kosten en winst voor een gekozen periode, met grafieken en CSV- of Excel-export.',
      ),
      caption: tri('Jelentések', 'Reports', 'Rapporten'),
    },
  ],

  galleryNote: tri(
    'A képernyőképek a projekt tárolójából valók, és a későbbi sötétkék-narancs újratervezés, valamint a felület magyarra fordítása előtt készültek: a korábbi kék palettát és angol szövegeket mutatják. Minden adat egy fiktív budapesti fuvarozócég generált demóadata.',
    'The screenshots come from the project’s repository and were taken before its later navy-and-orange redesign and before the interface was translated, so they show the earlier blue palette and English texts. All data is generated demo data of a fictional Budapest haulier.',
    'De schermafbeeldingen komen uit de repository van het project en zijn gemaakt vóór de latere marineblauw-oranje herontwerp en vóór de interface werd vertaald, dus ze tonen het eerdere blauwe palet en Engelse teksten. Alle data is gegenereerde demodata van een fictief Boedapester transportbedrijf.',
  ),
}
