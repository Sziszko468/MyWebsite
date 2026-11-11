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
 * Written for people with no technical background (PROMPT 18): each service answers "what do I get", "what does it help me
 * with" and "is it right for me" in short sentences and everyday words. It describes what is offered and how the work is
 * done; it states no result, price, deadline, guarantee or experience that is not shown elsewhere on the site. Where a
 * package already says the same thing, the text is that package's own, so the two never differ. Related projects name only
 * work the portfolio really shows, and say what to look at there.
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
      'Saját megjelenés, és egy oldal, amelyen a látogatók könnyen eligazodnak.',
      'A look of its own, and a site that visitors can easily find their way around.',
      'Een eigen uitstraling en een site waarin bezoekers makkelijk hun weg vinden.',
    ),
    glance: [
      tri('Telefonon, tableten és számítógépen is működik', 'Works on phones, tablets and computers', 'Werkt op telefoon, tablet en computer'),
      tri('Alapbeállítások a keresőkhöz', 'Basic settings for search engines', 'Basisinstellingen voor zoekmachines'),
    ],
    overview: tri(
      'A weboldal az első benyomás, és az a hely, ahol az emberek a legtöbbet használják. Ezért a megjelenést és a könnyű használatot együtt tervezem. A tartalomból indulunk ki: kinek szól az oldal, mit kell megtalálniuk a látogatóknak, és mit szeretnél, mit tegyenek utána.',
      'A website is your first impression, and the place people use most. So I design how it looks and how easy it is to use together. We start with the content: who the site is for, what visitors need to find, and what you want them to do next.',
      'Een website is je eerste indruk en de plek die mensen het meest gebruiken. Daarom ontwerp ik hoe hij eruitziet en hoe makkelijk hij te gebruiken is in één keer. We beginnen bij de inhoud: voor wie de site is, wat bezoekers moeten kunnen vinden en wat jij wilt dat ze daarna doen.',
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
          'Először telefonra tervezve, aztán nagyobb képernyőkre bővítve.',
          'Designed for the phone first, then extended to larger screens.',
          'Eerst ontworpen voor de telefoon en daarna uitgebreid voor grotere schermen.',
        ),
      },
      {
        title: tri('Saját arculat', 'A look of your own', 'Een eigen uitstraling'),
        text: tri(
          'A megjelenés a te márkádhoz és a tartalmadhoz igazodik.',
          'The look follows your brand and your content.',
          'De uitstraling volgt jouw merk en jouw inhoud.',
        ),
      },
    ],
    useCases: getPackage('launch').fits,
    deliverables: [
      ...getPackage('launch').includes,
      tri('Az átadás a megállapodás szerint', 'Handover as agreed', 'Oplevering zoals afgesproken'),
    ],
    audience: tri(
      'Vállalkozásoknak és magánszemélyeknek, akiknek áttekinthető, könnyen használható weboldalra van szükségük, amely tükrözi, kik ők.',
      'For businesses and individuals who want a clear, easy-to-use website that shows who they are.',
      'Voor bedrijven en particulieren die een heldere, makkelijk te gebruiken website willen die laat zien wie ze zijn.',
    ),
    howNote: tri(
      'Weboldalnál a második lépésben az oldalakat és a tartalmat is leírjuk: ki mit talál meg, és hol.',
      'For a website, the second step also covers the pages and the content: who finds what, and where.',
      'Bij een website bepalen we in de tweede stap ook de pagina’s en de inhoud: wie wat vindt, en waar.',
    ),
    packages: ['launch', 'grow', 'care'],
    projects: [
      {
        project: 'bookinghub',
        note: tri(
          'Foglalási alkalmazás, amelynek nyilvános oldala egy minden képernyőn működő weboldal.',
          'A booking application whose public side is also a website that works on every screen.',
          'Een boekingsapplicatie waarvan de publieke kant ook een website is die op elk scherm werkt.',
        ),
      },
    ],
    faq: {
      shared: ['cost', 'time', 'existing', 'handover'],
      own: [
        {
          id: 'cms',
          question: tri('Utólag magam is szerkeszthetem az oldal tartalmát?', 'Can I edit the content myself afterwards?', 'Kan ik de inhoud achteraf zelf aanpassen?'),
          answer: tri(
            'A kezdő csomagok nem tartalmaznak olyan rendszert, amellyel te magad szerkeszthetnéd a tartalmat (CMS). Ha szükséged van rá, írd le a követelményeknél, és ha a részletek ismertek, közösen döntjük el, hogy belefér-e. Kisebb módosításokra a Care csomag való.',
            'The starting packages do not include a system for editing the content yourself (a CMS). If you need one, write it in the requirements, and once the details are known we decide together whether it fits. The Care package is meant for small changes.',
            'De startpakketten bevatten geen systeem waarmee je de inhoud zelf kunt aanpassen (een cms). Heb je dat nodig, schrijf het dan bij de eisen; als de details bekend zijn, bepalen we samen of het past. Het pakket Care is bedoeld voor kleine aanpassingen.',
          ),
        },
        {
          id: 'languages',
          question: tri('Lehet többnyelvű az oldal?', 'Can the site be in more than one language?', 'Kan de site meertalig zijn?'),
          answer: tri(
            'Igen, ha a projekt igényli: a további nyelv választható kiegészítő. A szövegek elkészítésének módját az ajánlatban rögzítjük.',
            'Yes, if the project needs it. An additional language is an optional add-on, and the quote says how the texts are produced.',
            'Ja, als het project dat vraagt: een extra taal is een optionele extra. In de offerte staat hoe de teksten tot stand komen.',
          ),
        },
      ],
    },
  },
  {
    id: 'webapp',
    tagline: tri(
      'Az ötlettől az első használható verzióig.',
      'From your idea to a first usable version.',
      'Van idee tot een eerste bruikbare versie.',
    ),
    glance: [
      tri('A látható felület és a háttérben működő rész egy kézből', 'The part people see and the part behind the scenes, from one hand', 'Het zichtbare deel en het deel op de achtergrond, uit één hand'),
      tri('Tesztelés az átadás előtt', 'Testing before handover', 'Testen vóór de oplevering'),
    ],
    overview: tri(
      'A webalkalmazás akkor jó, ha az emberek magyarázat nélkül eligazodnak benne. Abból indulok ki, hogy a felhasználóid mit csinálnak, és milyen információra van szükségük. Ebből lesz a felület és minden, ami mögötte van, az első használható verziót pedig közösen teszteljük.',
      'A web application is good when people find their way around it without being told how. I start from what your users do and what information they need. The screens and everything behind them follow from that, and we test the first usable version together.',
      'Een webapplicatie is goed als mensen zich erin kunnen redden zonder uitleg. Ik begin bij wat je gebruikers doen en welke informatie ze nodig hebben. De schermen en alles erachter volgen daaruit, en we testen de eerste bruikbare versie samen.',
    ),
    benefits: [
      {
        title: tri('A munka köré tervezve', 'Designed around the work', 'Ontworpen rond het werk'),
        text: tri(
          'Először leírjuk, ki mit csinál az alkalmazásban. A képernyők csak ezután készülnek.',
          'We first write down who does what in the application. The screens are built after that.',
          'Eerst leggen we vast wie wat doet in de applicatie. Daarna worden de schermen gebouwd.',
        ),
      },
      {
        title: tri('Információ és képernyők együtt', 'Information and screens together', 'Gegevens en schermen samen'),
        text: tri(
          'Az adatok tárolása és a képernyők, amelyek megmutatják őket, egy egészként készülnek.',
          'Keeping the information and the screens that show it are built as one whole.',
          'Het bewaren van gegevens en de schermen die ze tonen worden als één geheel gebouwd.',
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
      'Alkalmazásnál a második lépésben azt tisztázzuk, kik használják, és milyen információra van szükségük, mert minden más erre épül.',
      'For an application, the second step covers who uses it and what information they need, because everything else builds on that.',
      'Bij een applicatie bepalen we in de tweede stap wie ermee werkt en welke informatie nodig is, omdat al het andere daarop voortbouwt.',
    ),
    packages: ['build', 'grow', 'care'],
    projects: [
      {
        project: 'spendly',
        note: tri(
          'Teljes példa: a felület, amit az emberek látnak, mögötte egy szerver, és egy adatbázis, amely az információt tárolja.',
          'A complete example: the screens people see, a server behind them, and a database that keeps the information.',
          'Een compleet voorbeeld: de schermen die mensen zien, een server erachter en een database die de gegevens bewaart.',
        ),
      },
      {
        project: 'logistics',
        note: tri(
          'Egy kis fuvarozócég napi munkáját segítő alkalmazás: szállítmányok, sofőrök, járművek; webes változat az irodának és mobilalkalmazás a sofőröknek.',
          'An application for the daily work of a small haulage company: shipments, drivers and vehicles, with a web version for the office and a mobile app for the drivers.',
          'Een applicatie voor het dagelijkse werk van een klein transportbedrijf: zendingen, chauffeurs en voertuigen, met een webversie voor kantoor en een mobiele app voor de chauffeurs.',
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
            'Kell bejelentkezés és eltérő hozzáférés a különböző felhasználóknak?',
            'Do we need sign-in and different access for different users?',
            'Hebben we inloggen en verschillende rechten voor gebruikers nodig?',
          ),
          answer: tri(
            'Csak akkor, ha a projekt igényli. A második lépésben megbeszéljük, kik használják az alkalmazást, és ki mit láthat. Ebből derül ki, kell-e bejelentkezés.',
            'Only if the project needs them. In the second step we talk through who uses the application and who may see what. That shows whether sign-in is needed.',
            'Alleen als het project dat vraagt. In de tweede stap bespreken we wie de applicatie gebruikt en wie wat mag zien. Daaruit blijkt of inloggen nodig is.',
          ),
        },
      ],
    },
  },
  {
    id: 'ui',
    tagline: tri(
      'A terved, pontosan megépítve, minden képernyőn működve.',
      'Your design, built precisely and working on every screen.',
      'Jouw ontwerp, nauwkeurig gebouwd en werkend op elk scherm.',
    ),
    glance: [
      tri('A meglévő tervet követi', 'Follows the design you have', 'Volgt het ontwerp dat je hebt'),
      tri('Az elejétől mindenki számára használható', 'Easy to use for everyone from the start', 'Van het begin af voor iedereen bruikbaar'),
    ],
    overview: tri(
      'Ha már van terved (látványterv, vázlat vagy meglévő arculat), az a dolgom, hogy a weboldal ugyanúgy nézzen ki, és ugyanúgy viselkedjen. Újrahasználható elemekből építkezem, hogy az oldal bővülés közben is egységes maradjon.',
      'If you already have a design (a mock-up, a sketch or an existing brand), my job is to make the website look and behave the same way. I build with reusable pieces, so the site stays consistent as it grows.',
      'Heb je al een ontwerp (een mock-up, een schets of een bestaande huisstijl), dan is het mijn taak om de website er hetzelfde uit te laten zien en hetzelfde te laten werken. Ik bouw met herbruikbare onderdelen, zodat de site consistent blijft als hij groeit.',
    ),
    benefits: [
      {
        title: tri('Hű a terveidhez', 'True to your design', 'Trouw aan je ontwerp'),
        text: tri(
          'A weboldal a megadott terv szerint készül. Ahol a terv nem mond semmit, megbeszéljük.',
          'The website follows the design you give. Where the design says nothing, we talk.',
          'De website volgt het ontwerp dat je aanlevert. Waar het ontwerp niets zegt, overleggen we.',
        ),
      },
      {
        title: tri('Újrahasználható építőelemek', 'Reusable building blocks', 'Herbruikbare bouwstenen'),
        text: tri(
          'Elemek, amelyeket újra fel lehet használni, hogy az új oldalak ugyanúgy nézzenek ki.',
          'Pieces that can be used again, so new pages look like the rest.',
          'Onderdelen die je opnieuw kunt gebruiken, zodat nieuwe pagina’s er hetzelfde uitzien.',
        ),
      },
      {
        title: tri('Mindenki számára használható', 'Usable by everyone', 'Voor iedereen bruikbaar'),
        text: tri(
          'A billentyűzetes használat, az olvasható színek és a jól látható kijelölés az elejétől a munka része.',
          'Keyboard use, readable colours and a clear highlight on the selected item are part of the work from the start.',
          'Toetsenbordgebruik, leesbare kleuren en een duidelijke markering van het gekozen onderdeel horen vanaf het begin bij het werk.',
        ),
      },
    ],
    useCases: [
      tri('Egy kész terv megvalósítása weboldalként', 'Building a finished design as a website', 'Een afgerond ontwerp als website uitwerken'),
      tri(
        'Meglévő oldal átalakítása, hogy minden képernyőn jól működjön',
        'Making an existing page work well on every screen',
        'Een bestaande pagina op elk scherm goed laten werken',
      ),
      tri(
        'Újrahasználható építőelemek egy meglévő weboldalhoz',
        'Reusable building blocks for an existing website',
        'Herbruikbare bouwstenen voor een bestaande website',
      ),
    ],
    deliverables: [
      tri(
        'A terved, megépítve úgy, hogy minden képernyőn működjön',
        'Your design, built so it works on every screen',
        'Je ontwerp, gebouwd zodat het op elk scherm werkt',
      ),
      tri('Újrahasználható építőelemek', 'Reusable building blocks', 'Herbruikbare bouwstenen'),
      tri(
        'A színek, betűtípusok és térközök egyszer leírva, hogy mindenhol egyformák maradjanak',
        'The colours, fonts and spacing written down once, so they stay the same everywhere',
        'De kleuren, lettertypen en ruimtes eenmalig vastgelegd, zodat ze overal gelijk blijven',
      ),
      tri(
        'A mindenki számára könnyű használat alapjai: billentyűzet, olvasható színek, jól látható kijelölés',
        'The basics of easy use for everyone: keyboard use, readable colours, a clear highlight',
        'De basis van gebruiksgemak voor iedereen: toetsenbord, leesbare kleuren, een duidelijke markering',
      ),
      tri('Az átadás a megállapodás szerint', 'Handover as agreed', 'Oplevering zoals afgesproken'),
    ],
    audience: tri(
      'Tervezőknek, csapatoknak és vállalkozásoknak, akiknek már van tervük vagy arculatuk, és szükségük van valakire, aki ebből jól megépített weboldalt készít.',
      'For designers, teams and businesses that already have a design or a brand and need someone to turn it into a well-made website.',
      'Voor ontwerpers, teams en bedrijven die al een ontwerp of huisstijl hebben en iemand nodig hebben die er een goed gebouwde website van maakt.',
    ),
    howNote: tri(
      'A terv megvalósításánál a második lépésben átnézzük a tervet: mi egyértelmű, mi hiányzik, és mely képernyőméreteket kell lefedni.',
      'When building from a design, the second step goes through the design: what is clear, what is missing and which screen sizes it has to cover.',
      'Bij het bouwen vanuit een ontwerp lopen we in de tweede stap het ontwerp door: wat is duidelijk, wat ontbreekt en welke schermformaten moeten worden gedekt.',
    ),
    packages: ['grow', 'build', 'care'],
    projects: [
      {
        project: 'spendly',
        note: tri(
          'Webes felület, saját leírt útmutatóval a színekről, betűtípusokról és építőelemekről.',
          'A web interface with its own written guide to colours, fonts and building blocks.',
          'Een webinterface met een eigen beschreven gids voor kleuren, lettertypen en bouwstenen.',
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
      'Eszközök és szolgáltatások, amelyek együtt dolgoznak.',
      'Tools and services that work together.',
      'Tools en diensten die samenwerken.',
    ),
    glance: [
      tri('Kapcsolat más szolgáltatásokkal', 'Links to other services', 'Koppelingen met andere diensten'),
      tri('Érthető üzenetek, ha valami nem sikerül', 'Clear messages when something goes wrong', 'Duidelijke meldingen als er iets misgaat'),
    ],
    overview: tri(
      'Az összekötésnek ott van értelme, ahol az emberek kézzel másolják az információt egyik rendszerből a másikba, vagy ahol a weboldalról hiányzik egy szolgáltatás. Először azt tisztázzuk, mit lehet és érdemes összekötni. Csak utána kapsz ajánlatot.',
      'Connecting services makes sense where people copy information by hand from one system to another, or where a website is missing a service. We first work out what can and should be connected. Only then do you get a quote.',
      'Koppelen heeft zin waar mensen informatie met de hand van het ene systeem naar het andere overzetten, of waar een website een dienst mist. Eerst bepalen we wat gekoppeld kan en moet worden. Pas daarna krijg je een offerte.',
    ),
    benefits: [
      {
        title: tri('Először megnézzük, megvalósítható-e', 'We check first whether it can be done', 'Eerst kijken of het kan'),
        text: tri(
          'Az ajánlat előtt közösen megnézzük, hogy egy szolgáltatás összekötése megvalósítható-e.',
          'Before the quote, we check together whether a service can be connected.',
          'Vóór de offerte bekijken we samen of een dienst gekoppeld kan worden.',
        ),
      },
      {
        title: tri('Az információ a megfelelő helyre kerül', 'Information in the right place', 'Informatie op de juiste plek'),
        text: tri(
          'Az információ rendezetten mozog a weboldalad és a másik szolgáltatás között.',
          'Information moves in an orderly way between your website and the other service.',
          'Informatie verplaatst zich ordelijk tussen je website en de andere dienst.',
        ),
      },
      {
        title: tri('Érthető üzenetek', 'Clear messages', 'Duidelijke meldingen'),
        text: tri(
          'Ha valami nem működik, a látogató érthető üzenetet kap.',
          'When something does not work, the visitor gets a message they can understand.',
          'Als iets niet werkt, krijgt de bezoeker een melding die hij begrijpt.',
        ),
      },
    ],
    useCases: [
      tri(
        'Külső szolgáltatás összekötése egy meglévő weboldallal vagy alkalmazással',
        'Connecting an outside service to an existing website or application',
        'Een externe dienst koppelen aan een bestaande website of applicatie',
      ),
      tri('Saját kapcsolat kiépítése egy projekthez', 'Building a connection of your own for a project', 'Een eigen koppeling bouwen voor een project'),
      tri(
        'Az információ mozgatása a látható felület és a háttérrendszer között',
        'Moving information between what people see and what works behind the scenes',
        'Informatie verplaatsen tussen wat mensen zien en wat op de achtergrond werkt',
      ),
    ],
    deliverables: [
      tri('Az egyeztetett szolgáltatások összekötve', 'The agreed services connected', 'De afgesproken diensten gekoppeld'),
      tri('Saját kapcsolat, ha a projekt igényli', 'A connection of your own, if the project needs one', 'Een eigen koppeling, als het project dat vraagt'),
      tri(
        'Az információ mozgása a látható felület és a háttérrendszer között',
        'Information moving between what people see and what works behind the scenes',
        'Informatie die beweegt tussen wat mensen zien en wat op de achtergrond werkt',
      ),
      tri(
        'Érthető üzenetek a látogatóknak, ha valami nem sikerül',
        'Clear messages for visitors when something goes wrong',
        'Duidelijke meldingen voor bezoekers als er iets misgaat',
      ),
      tri('Az átadás a megállapodás szerint', 'Handover as agreed', 'Oplevering zoals afgesproken'),
    ],
    audience: tri(
      'Azoknak, akik más rendszereket vagy szolgáltatásokat használnak, és szükségük van valakire, aki összeköti őket a weboldalukkal.',
      'For people who use other systems or services and need someone to connect them to their website.',
      'Voor mensen die andere systemen of diensten gebruiken en iemand nodig hebben die ze met hun website verbindt.',
    ),
    howNote: tri(
      'Összekötésnél a második lépés a legfontosabb: itt döntjük el, mi köthető össze, milyen hozzáféréssel, és mi marad a projekten kívül.',
      'When connecting services the second step matters most: here we decide what can be connected, with what access, and what stays outside the project.',
      'Bij koppelen is de tweede stap het belangrijkst: hier bepalen we wat gekoppeld kan worden, met welke toegang en wat buiten het project blijft.',
    ),
    packages: ['grow', 'build', 'care'],
    projects: [
      {
        project: 'spendly',
        note: tri(
          'Több külső szolgáltatás egy rendszerben: blokkok beolvasása fényképről, értesítések a telefonra és árfolyamok, amelyek kikapcsolhatók vagy lecserélhetők.',
          'Several outside services in one system: reading receipts from photos, notifications on the phone and exchange rates, which can be switched off or replaced.',
          'Meerdere externe diensten in één systeem: bonnen uit foto’s lezen, meldingen op de telefoon en wisselkoersen, die kunnen worden uitgezet of vervangen.',
        ),
      },
      {
        project: 'logistics',
        note: tri(
          'Jól meghatározott kapcsolat a webes változat és a mobilalkalmazás között, hogy mindkettő ugyanazt az információt használja.',
          'A defined connection between the web version and the mobile app, so both use the same information.',
          'Een vastgelegde koppeling tussen de webversie en de mobiele app, zodat beide dezelfde informatie gebruiken.',
        ),
      },
    ],
    faq: {
      shared: ['cost', 'custom', 'existing'],
      own: [
        {
          id: 'which-services',
          question: tri(
            'Bármilyen szolgáltatást össze lehet kötni?',
            'Can any service be connected?',
            'Kan elke dienst worden gekoppeld?',
          ),
          answer: tri(
            'Ezt előre nem tudom megmondani: függ attól, mit enged a szolgáltatás (hozzáférés, korlátok, feltételek). Ezért az ajánlat előtt közösen megnézzük, megvalósítható-e.',
            'I cannot say that in advance: it depends on what the service allows (access, limits, terms). That is why we check together, before the quote, whether it can be done.',
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
