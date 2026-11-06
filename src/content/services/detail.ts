import { overlayServiceDetails } from '../catalogOverlay'
import type { ProjectId } from '../projects'
import { getPackage, type PackageId } from '../packages'
import { tri, type Trilingual } from '../trilingual'
import type { FaqItem } from './faq'
import type { ServiceId } from './ids'

/**
 * What each service's product page says besides the area's own name, summary and feature list
 * (content/services/areas.ts): the one-line promise, the overview, the benefits, the typical
 * projects, what the client receives, who it is for and the questions that belong to it.
 *
 * Starting copy for the owner to confirm. It describes what is offered and how the work is done;
 * it states no result, price, deadline, guarantee or experience that is not shown elsewhere on the
 * site. Where a package already says the same thing, the text is that package's own, so the two
 * never differ. Related projects name only work the portfolio really shows, and say what to look
 * at there.
 */

export interface Benefit {
  title: Trilingual
  text: Trilingual
}

export interface RelatedProject {
  project: ProjectId
  /** One sentence on what the project shows that is relevant to this service. */
  note: Trilingual
}

export interface ServiceDetail {
  id: ServiceId
  /** The promise under the name, in a line. */
  tagline: Trilingual
  /** Two quick facts shown beside the price status in the hero. */
  glance: readonly [Trilingual, Trilingual]
  overview: Trilingual
  benefits: readonly [Benefit, Benefit, Benefit]
  /** Typical projects. */
  useCases: readonly Trilingual[]
  /** What the client receives. */
  deliverables: readonly Trilingual[]
  audience: Trilingual
  /** What is specific to this service in the second step of the process. */
  howNote: Trilingual
  /** The packages the page offers first, in order; the rest stay available. */
  packages: readonly PackageId[]
  /** Portfolio projects that show this work. Empty: the page then says plainly that none does yet. */
  projects: readonly RelatedProject[]
  /** Ids from content/services/faq.ts to show, and the questions that belong to this service alone. */
  faq: { shared: readonly string[]; own: readonly FaqItem[] }
}

export const baseServiceDetails: readonly ServiceDetail[] = [
  {
    id: 'website',
    tagline: tri(
      'Egyedi megjelenés, érthető felület a látogatónak.',
      'A distinctive look, a clear interface for the visitor.',
      'Een eigen uitstraling, een heldere interface voor de bezoeker.',
    ),
    glance: [
      tri('Reszponzív: mobiltól asztali gépig', 'Responsive from phone to desktop', 'Responsief van telefoon tot desktop'),
      tri('Alapvető technikai SEO és metaadatok', 'Basic technical SEO and metadata', 'Basis technische SEO en metadata'),
    ],
    overview: tri(
      'A weboldal az első benyomás és a legtöbbször használt felület is: ezért a megjelenést és a használhatóságot együtt tervezem. A tartalomból indulunk ki: kinek szól az oldal, mit kell megtalálnia a látogatónak, és mi a következő lépés számára.',
      'A website is both the first impression and the interface people use most, so I design the look and the usability together. We start from the content: who the site is for, what a visitor needs to find, and what the visitor’s next step is.',
      'Een website is zowel de eerste indruk als de interface die mensen het vaakst gebruiken, dus ontwerp ik uitstraling en bruikbaarheid samen. We beginnen bij de inhoud: voor wie de site is, wat een bezoeker moet kunnen vinden en wat de volgende stap van de bezoeker is.',
    ),
    benefits: [
      {
        title: tri('Világos szerkezet', 'A clear structure', 'Een heldere structuur'),
        text: tri(
          'A látogató gyorsan megtalálja, amiért jött.',
          'Visitors quickly find what they came for.',
          'Bezoekers vinden snel waarvoor ze kwamen.',
        ),
      },
      {
        title: tri('Minden képernyőn működik', 'Works on every screen', 'Werkt op elk scherm'),
        text: tri(
          'Mobilról kiindulva tervezett elrendezés, nagyobb képernyőre bővítve.',
          'A layout designed from the phone upwards and extended for larger screens.',
          'Een opmaak die op de telefoon begint en uitgebreid wordt voor grotere schermen.',
        ),
      },
      {
        title: tri('Saját arculat', 'Your own identity', 'Een eigen identiteit'),
        text: tri(
          'A megjelenés a te márkádhoz és tartalmadhoz igazodik.',
          'The look follows your brand and your content.',
          'De uitstraling volgt jouw merk en jouw inhoud.',
        ),
      },
    ],
    useCases: getPackage('launch').fits,
    deliverables: [
      ...getPackage('launch').includes,
      tri('Átadás a megállapodás szerint', 'Handover as agreed', 'Oplevering zoals afgesproken'),
    ],
    audience: tri(
      'Vállalkozásoknak és magánszemélyeknek, akiknek érthető, jól használható webes jelenlétre van szükségük, és szeretnék, ha az a saját arculatukat tükrözné.',
      'For businesses and individuals who need a clear, usable web presence and want it to reflect their own identity.',
      'Voor bedrijven en particulieren die een heldere, bruikbare webpresentie nodig hebben en willen dat die hun eigen identiteit weerspiegelt.',
    ),
    howNote: tri(
      'Weboldalnál a második lépésben az oldalszerkezetet és a tartalmat is leírjuk: ki mit talál meg, és hol.',
      'For a website, the second step also writes down the page structure and the content: who finds what, and where.',
      'Bij een website leggen we in de tweede stap ook de paginastructuur en de inhoud vast: wie wat vindt, en waar.',
    ),
    packages: ['launch', 'grow', 'care'],
    projects: [
      {
        project: 'bookinghub',
        note: tri(
          'Egy foglalási alkalmazás Next.js-szel és Tailwinddel; a nyilvános felülete is reszponzív weboldal.',
          'A booking application built with Next.js and Tailwind; its public side is a responsive website too.',
          'Een boekingsapplicatie met Next.js en Tailwind; de publieke kant is ook een responsieve website.',
        ),
      },
    ],
    faq: {
      shared: ['cost', 'time', 'existing', 'handover'],
      own: [
        {
          id: 'cms',
          question: tri('Szerkeszthető-e az oldal tartalma utólag?', 'Can the content be edited afterwards?', 'Kan de inhoud achteraf worden aangepast?'),
          answer: tri(
            'Tartalomkezelő rendszert (CMS) a kezdő csomagok nem tartalmaznak. Ha szükséged van rá, írd le a követelményeknél; hogy belefér-e, a részletek ismeretében közösen döntjük el. Kisebb módosításokra a Care csomag való.',
            'The starting packages do not include a content management system (CMS). If you need one, write it in the requirements; whether it fits is decided together once the details are known. The Care package is meant for small changes.',
            'De startpakketten bevatten geen contentmanagementsysteem (CMS). Heb je dat nodig, schrijf het dan bij de eisen; of het past, bepalen we samen als de details bekend zijn. Het pakket Care is bedoeld voor kleine aanpassingen.',
          ),
        },
        {
          id: 'languages',
          question: tri('Lehet többnyelvű az oldal?', 'Can the site be multilingual?', 'Kan de site meertalig zijn?'),
          answer: tri(
            'Igen, ha a projekt igényli: a további nyelv választható kiegészítő. A szövegek elkészítésének módját az ajánlatban rögzítjük.',
            'Yes, if the project needs it: an additional language is an optional add-on. How the texts are produced is written in the quote.',
            'Ja, als het project dat vraagt: een extra taal is een optionele toevoeging. Hoe de teksten tot stand komen, staat in de offerte.',
          ),
        },
      ],
    },
  },
  {
    id: 'webapp',
    tagline: tri(
      'Az ötlettől az első használható verzióig.',
      'From the idea to a first usable version.',
      'Van idee tot een eerste bruikbare versie.',
    ),
    glance: [
      tri('Frontend és backend egy kézből', 'Frontend and back end from one hand', 'Frontend en back-end uit één hand'),
      tri('Tesztelés az átadás előtt', 'Testing before handover', 'Testen vóór de oplevering'),
    ],
    overview: tri(
      'Egy webalkalmazás akkor jó, ha eligazodsz benne anélkül, hogy elmagyaráznák. A felhasználói folyamatokból és az adatokból indulok ki; ebből lesz a felület és a háttérrendszer, és az első használható verziót közösen teszteljük.',
      'A web application is good when you find your way around without being told how. I start from the user flows and the data; the interface and the back end follow from them, and we test the first usable version together.',
      'Een webapplicatie is goed als je je weg erin vindt zonder uitleg. Ik begin bij de gebruikersflows en de gegevens; de interface en de back-end volgen daaruit, en we testen de eerste bruikbare versie samen.',
    ),
    benefits: [
      {
        title: tri('Folyamatból tervezve', 'Designed from the flow', 'Ontworpen vanuit de flow'),
        text: tri(
          'Először azt írjuk le, ki mit csinál az alkalmazásban; a felület csak ezután épül.',
          'We first write down who does what in the application; the interface is built after that.',
          'Eerst leggen we vast wie wat doet in de applicatie; daarna wordt de interface gebouwd.',
        ),
      },
      {
        title: tri('Adat és felület együtt', 'Data and interface together', 'Gegevens en interface samen'),
        text: tri(
          'Az adatkezelés, az adatbázis és a felület egy rendszerként készül.',
          'Data handling, the database and the interface are built as one system.',
          'Gegevensbeheer, de database en de interface worden als één systeem gebouwd.',
        ),
      },
      {
        title: tri('Bővíthető alap', 'A base to grow on', 'Een basis om op voort te bouwen'),
        text: tri(
          'Az első verzió után külön megállapodással tovább fejleszthető.',
          'After the first version it can be developed further by separate agreement.',
          'Na de eerste versie kan het volgens aparte afspraak verder worden ontwikkeld.',
        ),
      },
    ],
    useCases: getPackage('build').fits,
    deliverables: [
      ...getPackage('build').includes,
      tri('Tesztelés és átadás a megállapodás szerint', 'Testing and handover as agreed', 'Testen en oplevering zoals afgesproken'),
    ],
    audience: getPackage('build').audience,
    howNote: tri(
      'Alkalmazásnál a második lépésben a felhasználói szerepköröket és az adatokat írjuk le, mert minden más ezekre épül.',
      'For an application, the second step writes down the user roles and the data, because everything else builds on them.',
      'Bij een applicatie leggen we in de tweede stap de gebruikersrollen en de gegevens vast, omdat al het andere daarop voortbouwt.',
    ),
    packages: ['build', 'grow', 'care'],
    projects: [
      {
        project: 'spendly',
        note: tri(
          'Teljes stackes példa: React-kliens, REST API és PostgreSQL adatbázis.',
          'A full-stack example: a React client, a REST API and a PostgreSQL database.',
          'Een full-stackvoorbeeld: een React-client, een REST API en een PostgreSQL-database.',
        ),
      },
      {
        project: 'logistics',
        note: tri(
          'Egy kis fuvarozócég napi munkáját lefedő alkalmazás: szállítmányok, sofőrök, járművek; webes felület az irodának és mobilalkalmazás a sofőröknek.',
          'An application for the daily work of a small haulage company: shipments, drivers, vehicles; a web interface for the office and a mobile app for the drivers.',
          'Een applicatie voor het dagelijkse werk van een klein transportbedrijf: zendingen, chauffeurs, voertuigen; een webinterface voor kantoor en een mobiele app voor de chauffeurs.',
        ),
      },
      {
        project: 'bookinghub',
        note: tri(
          'Foglalási alkalmazás időpontokkal, ügyfelekkel és naptárnézettel.',
          'A booking application with appointments, clients and a calendar view.',
          'Een boekingsapplicatie met afspraken, klanten en een agendaweergave.',
        ),
      },
    ],
    faq: {
      shared: ['start', 'cost', 'time', 'custom', 'handover'],
      own: [
        {
          id: 'roles',
          question: tri(
            'Kell-e bejelentkezés és felhasználói szerepkör?',
            'Do we need sign-in and user roles?',
            'Hebben we inloggen en gebruikersrollen nodig?',
          ),
          answer: tri(
            'Csak akkor, ha a projekt igényli. A második lépésben megbeszéljük, kik használják az alkalmazást és ki mit láthat; ebből derül ki, kell-e bejelentkezés.',
            'Only if the project needs them. In the second step we talk through who uses the application and who may see what; that shows whether sign-in is needed.',
            'Alleen als het project dat vraagt. In de tweede stap bespreken we wie de applicatie gebruikt en wie wat mag zien; daaruit blijkt of inloggen nodig is.',
          ),
        },
      ],
    },
  },
  {
    id: 'ui',
    tagline: tri(
      'A terved, pontosan és reszponzívan megvalósítva.',
      'Your design, implemented precisely and responsively.',
      'Jouw ontwerp, nauwkeurig en responsief uitgewerkt.',
    ),
    glance: [
      tri('Meglévő designt követ', 'Follows an existing design', 'Volgt een bestaand ontwerp'),
      tri('Hozzáférhetőség az elejétől', 'Accessibility from the start', 'Toegankelijkheid vanaf het begin'),
    ],
    overview: tri(
      'Ha van már terved (mockup, vázlat vagy egy meglévő arculat), a feladatom, hogy az a böngészőben is úgy nézzen ki és úgy viselkedjen. Újrahasználható komponensekben és design tokenekben gondolkodom, hogy a felület később is egységes maradjon.',
      'If you already have a design (a mockup, a sketch or an existing brand), my job is to make it look and behave the same in the browser. I think in reusable components and design tokens so the interface stays consistent later on.',
      'Heb je al een ontwerp (een mockup, een schets of een bestaande huisstijl), dan is het mijn taak om het in de browser hetzelfde te laten ogen en zich hetzelfde te laten gedragen. Ik denk in herbruikbare componenten en designtokens, zodat de interface ook later consistent blijft.',
    ),
    benefits: [
      {
        title: tri('Hű a tervhez', 'True to the design', 'Trouw aan het ontwerp'),
        text: tri(
          'A megvalósítás a megadott terv szerint készül; ahol a terv hallgat, egyeztetünk.',
          'The implementation follows the design you give; where the design is silent, we talk.',
          'De uitwerking volgt het ontwerp dat je aanlevert; waar het ontwerp zwijgt, overleggen we.',
        ),
      },
      {
        title: tri('Újrahasználható építőkockák', 'Reusable building blocks', 'Herbruikbare bouwstenen'),
        text: tri(
          'Komponensek és design tokenek, hogy az újabb oldalak ugyanúgy nézzenek ki.',
          'Components and design tokens, so new pages look the same way.',
          'Componenten en designtokens, zodat nieuwe pagina’s er hetzelfde uitzien.',
        ),
      },
      {
        title: tri('Mindenkinek használható', 'Usable by everyone', 'Bruikbaar voor iedereen'),
        text: tri(
          'Billentyűzet, kontraszt és fókuszállapotok az elejétől számolva.',
          'Keyboard use, contrast and focus states counted in from the start.',
          'Toetsenbord, contrast en focusstatussen van het begin af meegenomen.',
        ),
      },
    ],
    useCases: [
      tri('Egy kész designterv webes megvalósítása', 'Building a finished design for the web', 'Een afgerond ontwerp voor het web uitwerken'),
      tri('Meglévő felület reszponzívvá tétele', 'Making an existing interface responsive', 'Een bestaande interface responsief maken'),
      tri(
        'Komponensek és design tokenek egy meglévő felülethez',
        'Components and design tokens for an existing interface',
        'Componenten en designtokens voor een bestaande interface',
      ),
    ],
    deliverables: [
      tri('A terv reszponzív megvalósítása', 'A responsive implementation of the design', 'Een responsieve uitwerking van het ontwerp'),
      tri('Újrahasználható komponensek', 'Reusable components', 'Herbruikbare componenten'),
      tri('Design tokenek: színek, tipográfia, térközök', 'Design tokens: colours, typography, spacing', 'Designtokens: kleuren, typografie, ruimtes'),
      tri(
        'Hozzáférhetőségi alapok: billentyűzet, kontraszt, fókuszállapotok',
        'Accessibility basics: keyboard use, contrast, focus states',
        'Toegankelijkheidsbasis: toetsenbord, contrast, focusstatussen',
      ),
      tri('Átadás a megállapodás szerint', 'Handover as agreed', 'Oplevering zoals afgesproken'),
    ],
    audience: tri(
      'Tervezőknek, csapatoknak és vállalkozásoknak, akiknek már van tervük vagy arculatuk, és szükségük van valakire, aki azt minőségi, reszponzív felületté építi.',
      'For designers, teams and businesses who already have a design or a brand and need someone to build it into a quality, responsive interface.',
      'Voor ontwerpers, teams en bedrijven die al een ontwerp of huisstijl hebben en iemand nodig hebben die dat omzet in een hoogwaardige, responsieve interface.',
    ),
    howNote: tri(
      'UI-megvalósításnál a második lépésben átnézzük a tervet: mi egyértelmű, mi hiányzik, és mely képernyőméreteket kell lefedni.',
      'For UI implementation, the second step goes through the design: what is clear, what is missing and which screen sizes it has to cover.',
      'Bij UI-implementatie lopen we in de tweede stap het ontwerp door: wat is duidelijk, wat ontbreekt en welke schermformaten moeten worden gedekt.',
    ),
    packages: ['grow', 'build', 'care'],
    projects: [
      {
        project: 'spendly',
        note: tri(
          'Webes felület, amelyhez saját, leírt design rendszer tartozik (színek, tipográfia, komponensek).',
          'A web interface with its own written design system (colours, typography, components).',
          'Een webinterface met een eigen beschreven designsysteem (kleuren, typografie, componenten).',
        ),
      },
    ],
    faq: {
      shared: ['cost', 'time', 'existing'],
      own: [
        {
          id: 'design-form',
          question: tri(
            'Milyen formában kell megadnom a tervet?',
            'In what form do I need to give you the design?',
            'In welke vorm moet ik het ontwerp aanleveren?',
          ),
          answer: tri(
            'Olyan formában, ahogyan megvan: képek, vázlatok, egy meglévő oldal vagy egy leírás. Az első lépésben megnézem, elég-e a megvalósításhoz, és ha hiányzik valami, megmondom, mi.',
            'In whatever form you have it: images, sketches, an existing site or a description. In the first step I look at whether it is enough to build from, and if something is missing I tell you what.',
            'In welke vorm je het ook hebt: afbeeldingen, schetsen, een bestaande site of een beschrijving. In de eerste stap kijk ik of het genoeg is om van uit te gaan, en als er iets ontbreekt, zeg ik wat.',
          ),
        },
      ],
    },
  },
  {
    id: 'integrations',
    tagline: tri(
      'Rendszerek, amelyek beszélnek egymással.',
      'Systems that talk to each other.',
      'Systemen die met elkaar praten.',
    ),
    glance: [
      tri('Külső API-k és saját REST API', 'External APIs and your own REST API', 'Externe API’s en een eigen REST API'),
      tri('Érthető hibakezelés', 'Clear error handling', 'Duidelijke foutafhandeling'),
    ],
    overview: tri(
      'Az integráció ott van értelme, ahol két rendszer között kézzel mozgatnak adatot, vagy egy felületről hiányzik egy szolgáltatás. Először azt tisztázzuk, mit lehet és érdemes összekötni; csak utána készül ajánlat.',
      'An integration makes sense where data is moved by hand between two systems, or where an interface lacks a service. We first settle what can and should be connected; only then is there a quote.',
      'Een integratie heeft zin waar gegevens met de hand tussen twee systemen worden verplaatst, of waar een interface een dienst mist. Eerst stellen we vast wat gekoppeld kan en moet worden; pas daarna volgt een offerte.',
    ),
    benefits: [
      {
        title: tri('Előbb a megvalósíthatóság', 'Feasibility first', 'Eerst de haalbaarheid'),
        text: tri(
          'Az ajánlat előtt közösen tisztázzuk, hogy egy szolgáltatás bekötése megvalósítható-e.',
          'Before the quote we settle together whether a service can be connected.',
          'Vóór de offerte stellen we samen vast of een dienst gekoppeld kan worden.',
        ),
      },
      {
        title: tri('Adat a helyén', 'Data where it belongs', 'Gegevens op de juiste plek'),
        text: tri(
          'Az adatok rendezetten mozognak a felület és a háttérrendszer között.',
          'Data moves in an orderly way between the interface and the back end.',
          'Gegevens verplaatsen zich ordelijk tussen de interface en de back-end.',
        ),
      },
      {
        title: tri('Hibák érthetően', 'Errors that make sense', 'Fouten die te begrijpen zijn'),
        text: tri(
          'Ha valami nem működik, a felhasználó érthető visszajelzést kap.',
          'When something does not work, the user gets clear feedback.',
          'Als iets niet werkt, krijgt de gebruiker duidelijke feedback.',
        ),
      },
    ],
    useCases: [
      tri(
        'Külső szolgáltatás bekötése egy meglévő weboldalba vagy alkalmazásba',
        'Connecting an external service to an existing website or application',
        'Een externe dienst koppelen aan een bestaande website of applicatie',
      ),
      tri('Saját REST API tervezése egy projekthez', 'Designing a REST API for a project', 'Een REST API voor een project ontwerpen'),
      tri(
        'Adatok mozgatása a felület és a háttérrendszer között',
        'Moving data between the interface and the back end',
        'Gegevens verplaatsen tussen de interface en de back-end',
      ),
    ],
    deliverables: [
      tri('Az egyeztetett API-k és szolgáltatások bekötése', 'The agreed APIs and services connected', 'De afgesproken API’s en diensten gekoppeld'),
      tri('Saját REST API, ha a projekt igényli', 'A REST API of your own, if the project needs one', 'Een eigen REST API, als het project dat vraagt'),
      tri(
        'Adatátvitel a felület és a háttérrendszer között',
        'Data transfer between the interface and the back end',
        'Gegevensoverdracht tussen de interface en de back-end',
      ),
      tri(
        'Hibakezelés és érthető visszajelzés a felhasználónak',
        'Error handling and clear feedback for the user',
        'Foutafhandeling en duidelijke feedback voor de gebruiker',
      ),
      tri('Átadás a megállapodás szerint', 'Handover as agreed', 'Oplevering zoals afgesproken'),
    ],
    audience: tri(
      'Ügyfeleknek, akiknek meglévő rendszereik vagy szolgáltatásaik vannak, és szükségük van valakire, aki összeköti őket a webes felületükkel.',
      'For clients who have existing systems or services and need someone to connect them to their web interface.',
      'Voor opdrachtgevers die bestaande systemen of diensten hebben en iemand nodig hebben die ze met hun webinterface verbindt.',
    ),
    howNote: tri(
      'Integrációnál a második lépés a legfontosabb: itt döntjük el, mit lehet bekötni, milyen hozzáféréssel, és mi marad a projekten kívül.',
      'For an integration the second step matters most: here we decide what can be connected, with what access, and what stays outside the project.',
      'Bij een integratie is de tweede stap het belangrijkst: hier beslissen we wat gekoppeld kan worden, met welke toegang, en wat buiten het project blijft.',
    ),
    packages: ['grow', 'build', 'care'],
    projects: [
      {
        project: 'spendly',
        note: tri(
          'Külső szolgáltatások egy rendszerben: blokkolvasás (OCR), push-értesítések és ECB-árfolyamok, választható és cserélhető integrációként.',
          'External services in one system: receipt reading (OCR), push notifications and ECB exchange rates, as optional, swappable integrations.',
          'Externe diensten in één systeem: bonnen lezen (OCR), pushmeldingen en ECB-wisselkoersen, als optionele, uitwisselbare integraties.',
        ),
      },
      {
        project: 'logistics',
        note: tri(
          'Típusos REST API (FastAPI) a webes és a mobilalkalmazás között.',
          'A typed REST API (FastAPI) between the web app and the mobile app.',
          'Een getypeerde REST API (FastAPI) tussen de webapp en de mobiele app.',
        ),
      },
    ],
    faq: {
      shared: ['cost', 'custom', 'existing'],
      own: [
        {
          id: 'which-services',
          question: tri(
            'Bármilyen szolgáltatást be lehet kötni?',
            'Can any service be connected?',
            'Kan elke dienst worden gekoppeld?',
          ),
          answer: tri(
            'Ezt előre nem tudom megmondani: függ attól, mit enged a szolgáltatás (hozzáférés, korlátok, feltételek). Ezért az ajánlat előtt közösen megnézzük, megvalósítható-e.',
            'I cannot say that in advance: it depends on what the service allows (access, limits, terms). That is why we look together, before the quote, at whether it can be done.',
            'Dat kan ik vooraf niet zeggen: het hangt af van wat de dienst toestaat (toegang, beperkingen, voorwaarden). Daarom bekijken we vóór de offerte samen of het kan.',
          ),
        },
      ],
    },
  },
]

/** The details as the website shows them: the source's, with the tagline and overview the owner edited laid over them (content/catalogOverlay.ts). */
export const serviceDetails: readonly ServiceDetail[] = [...overlayServiceDetails(baseServiceDetails)]

export function getServiceDetail(id: ServiceId): ServiceDetail {
  const found = serviceDetails.find((detail) => detail.id === id)
  if (!found) throw new Error(`Unknown service: ${id}`)
  return found
}
