import type { ExtraId } from './services/addons'
import type { NeedId } from './services/ids'
import type { ServicePrice, Timeline, VatMode } from './pricing'
import { overlayPackages } from './catalogOverlay'
import { tri, type Trilingual } from './trilingual'

/**
 * The collaboration packages, in this order, on the home page and on the services page. Both read
 * their words from here, so a package never says two different things.
 *
 * The words are written for people with no technical background (PROMPT 18): short sentences, everyday vocabulary, and each
 * package answers three questions: what do I get (`deliverables`, `includes`), what does it help me with (`tagline`),
 * and is it right for me (`audience`, `fits`). A technical term appears only where there is no everyday word for it, and then
 * it is explained next to it.
 *
 * The packages are starting structures, not binding offers: the exact scope is settled after a
 * quote request. Nothing below is a real price, deadline or guarantee. To publish a price, set
 * `price: { kind: 'from', amount: 1200, currency: 'EUR' }` and say how VAT is handled in `vat`
 * (a test refuses a published price with `vat: 'unspecified'`); `quoteRequired` keeps the line
 * "the exact price comes with the quote"; `priceNote` is an optional sentence under the price;
 * `timeline` can carry a typical range once the owner is willing to publish one.
 */

export type PackageId = 'launch' | 'grow' | 'build' | 'care'

export interface ServicePackage {
  id: PackageId
  /** The package's name: a proper noun, shown as is in every language. */
  name: string
  /** The package given the most weight on the page. A visual weight only: it is not a claim of popularity. */
  featured: boolean

  price: ServicePrice
  vat: VatMode
  /** The exact price is always confirmed in a custom quote. */
  quoteRequired: boolean
  priceNote: Trilingual | null
  timeline: Timeline

  /** One sentence: what the package is and what it helps with. */
  tagline: Trilingual
  /** Who it is for. */
  audience: Trilingual
  /** The kinds of project it suits. */
  fits: readonly Trilingual[]
  /** What it can include; the exact list is settled in the quote. */
  includes: readonly Trilingual[]

  /**
   * The shop's view of the package. `needs` are the things a visitor may say they need that this
   * package suits: it drives the "suggested" hint and nothing more (a suggestion is not a claim of
   * being the best fit). `deliverables` are the three main things the client holds at the end,
   * and `scope`, `customization` and `support` are the comparison's rows. `extras` are the add-ons
   * (content/services/addons.ts) that can be put on it.
   */
  needs: readonly NeedId[]
  deliverables: readonly Trilingual[]
  scope: Trilingual
  customization: Trilingual
  support: Trilingual
  extras: readonly ExtraId[]
  /**
   * `false` when the owner has switched the package off in the administration: it stays on the page, marked as not available
   * at the moment, and cannot be started from there. Absent means available.
   */
  available?: boolean
}

/** The packages as written in this file: what the backend is seeded from (content/catalogExport.ts). */
export const basePackages: readonly ServicePackage[] = [
  {
    id: 'launch',
    name: 'Launch',
    featured: false,
    price: { kind: 'quote' },
    vat: 'unspecified',
    quoteRequired: true,
    priceNote: null,
    timeline: { kind: 'scope' },
    tagline: tri(
      'Egy áttekinthető, egyszerű weboldal, amellyel elindulhatsz az interneten.',
      'A clear, simple website that gets you online.',
      'Een heldere, eenvoudige website waarmee je online gaat.',
    ),
    audience: tri(
      'Kisvállalkozásoknak, egyéni vállalkozóknak és magánszemélyeknek, akiknek egyszerű weboldal kell: bemutatkozás és elérhetőség.',
      'For small businesses, freelancers and individuals who need a simple website that introduces them and shows how to get in touch.',
      'Voor kleine bedrijven, zzp’ers en particulieren die een eenvoudige website willen om zich voor te stellen en bereikbaar te zijn.',
    ),
    fits: [
      tri(
        'Weboldal, amely bemutatja a vállalkozásodat',
        'A website that introduces your business',
        'Een website waarmee je je bedrijf voorstelt',
      ),
      tri(
        'Személyes vagy szakmai bemutatkozó oldal',
        'A personal or professional profile page',
        'Een persoonlijke of professionele profielpagina',
      ),
      tri(
        'Kisebb weboldal néhány tájékoztató oldallal',
        'A small website with a few pages of information',
        'Een kleine website met een paar informatieve pagina’s',
      ),
    ],
    includes: [
      tri(
        'Egyszerű weboldal, amely telefonon, tableten és számítógépen is jól működik',
        'A simple website that works well on phones, tablets and computers',
        'Een eenvoudige website die goed werkt op telefoon, tablet en computer',
      ),
      tri(
        'Áttekinthető oldalak, hogy a látogatók gyorsan megtalálják, amit keresnek',
        'Clear pages, so visitors quickly find what they are looking for',
        'Overzichtelijke pagina’s, zodat bezoekers snel vinden wat ze zoeken',
      ),
      tri(
        'Menü, amely telefonon is könnyen használható',
        'A menu that is easy to use on a phone',
        'Een menu dat ook op een telefoon makkelijk werkt',
      ),
      tri(
        'Elérhetőségi rész, ahol a látogatók kapcsolatba léphetnek veled (hogy az üzenetek hogyan érkeznek hozzád, közösen megbeszéljük)',
        'A contact section where visitors can reach you (we agree together how messages get to you)',
        'Een contactgedeelte waar bezoekers je kunnen bereiken (hoe berichten bij jou komen, spreken we samen af)',
      ),
      tri(
        'Alapbeállítások a keresőkhöz, hogy a Google és a többi kereső megértse az oldalad',
        'Basic settings for search engines, so Google and others can understand your site',
        'Basisinstellingen voor zoekmachines, zodat Google en andere zoekmachines je site begrijpen',
      ),
    ],
    needs: ['website'],
    deliverables: [
      tri(
        'Kész weboldal, amely minden eszközön működik',
        'A finished website that works on every device',
        'Een afgeronde website die op elk apparaat werkt',
      ),
      tri(
        'Áttekinthető oldalak és menü, amely telefonon is működik',
        'Clear pages and a menu that also work on a phone',
        'Heldere pagina’s en een menu die ook op een telefoon werken',
      ),
      tri(
        'Beállított alapok a keresőkhöz',
        'The basics for search engines set up',
        'De basis voor zoekmachines ingesteld',
      ),
    ],
    scope: tri('Kisebb, áttekinthető weboldal.', 'A small, easy-to-follow website.', 'Een kleine, overzichtelijke website.'),
    customization: tri(
      'Saját megjelenés egy egyszerű szerkezeten belül.',
      'Your own look within a simple structure.',
      'Een eigen uitstraling binnen een eenvoudige structuur.',
    ),
    support: tri(
      'Az átadás módját megbeszéljük. A folyamatos karbantartás külön megállapodás (Care).',
      'We agree how the handover works. Ongoing maintenance is a separate agreement (Care).',
      'We spreken af hoe de oplevering gaat. Doorlopend onderhoud is een aparte afspraak (Care).',
    ),
    extras: ['pages', 'motion', 'languages', 'custom', 'care'],
  },
  {
    id: 'grow',
    name: 'Grow',
    featured: false,
    price: { kind: 'quote' },
    vat: 'unspecified',
    quoteRequired: true,
    priceNote: null,
    timeline: { kind: 'scope' },
    tagline: tri(
      'Fejleszd tovább a meglévő weboldalad: több oldal, több funkció, jobb élmény.',
      'Take your current website further: more pages, more features, a better experience.',
      'Ontwikkel je bestaande website verder: meer pagina’s, meer functies, een betere ervaring.',
    ),
    audience: tri(
      'Vállalkozásoknak, akiknek már van weboldaluk, és azt szeretnék, hogy többet tegyen értük.',
      'For businesses that already have a website and want it to do more for them.',
      'Voor bedrijven die al een website hebben en willen dat die meer voor hen doet.',
    ),
    fits: [
      tri(
        'Új részek vagy oldalak hozzáadása egy meglévő weboldalhoz',
        'Adding new sections or pages to an existing website',
        'Nieuwe onderdelen of pagina’s toevoegen aan een bestaande website',
      ),
      tri(
        'Interaktív részek és neked készített egyedi oldalelemek',
        'Interactive parts and page elements made specially for you',
        'Interactieve onderdelen en speciaal voor jou gemaakte pagina-elementen',
      ),
      tri(
        'A weboldal összekötése egy másik szolgáltatással, amelyet már használsz',
        'Connecting your website to another service you already use',
        'Je website koppelen aan een andere dienst die je al gebruikt',
      ),
    ],
    includes: [
      tri(
        'Nagyobb weboldal, több oldallal',
        'A larger website with more pages',
        'Een grotere website met meer pagina’s',
      ),
      tri(
        'Több hely a tartalmaidnak',
        'More room for your content',
        'Meer ruimte voor je inhoud',
      ),
      tri(
        'Neked készített egyedi oldalelemek',
        'Page elements made specially for you',
        'Speciaal voor jou gemaakte pagina-elementen',
      ),
      tri(
        'Interaktív részek, amelyeket a látogatók használhatnak',
        'Interactive parts that visitors can use',
        'Interactieve onderdelen die bezoekers kunnen gebruiken',
      ),
      tri(
        'Kapcsolat más szolgáltatásokkal, amelyeket már használsz (a megállapodott kereteken belül)',
        'Links to other services you already use (within the agreed scope)',
        'Koppelingen met andere diensten die je al gebruikt (binnen de afgesproken omvang)',
      ),
    ],
    needs: ['improve', 'website', 'ui', 'integrations'],
    deliverables: [
      tri(
        'A továbbfejlesztett, bővített weboldalad',
        'Your website, developed further and extended',
        'Je website, verder ontwikkeld en uitgebreid',
      ),
      tri(
        'Neked készített oldalelemek és interaktív részek',
        'Page elements and interactive parts made for you',
        'Voor jou gemaakte pagina-elementen en interactieve onderdelen',
      ),
      tri(
        'Az egyeztetett szolgáltatások összekötve a weboldaladdal',
        'The agreed services connected to your website',
        'De afgesproken diensten gekoppeld aan je website',
      ),
    ],
    scope: tri(
      'Meglévő weboldal bővítése, vagy egy nagyobb weboldal.',
      'Extending an existing website, or building a larger one.',
      'Een bestaande website uitbreiden, of een grotere website bouwen.',
    ),
    customization: tri(
      'Neked készített oldalelemek és interaktív részek.',
      'Page elements and interactive parts made for you.',
      'Voor jou gemaakte pagina-elementen en interactieve onderdelen.',
    ),
    support: tri(
      'Az átadás módját megbeszéljük. A folyamatos karbantartás külön megállapodás (Care).',
      'We agree how the handover works. Ongoing maintenance is a separate agreement (Care).',
      'We spreken af hoe de oplevering gaat. Doorlopend onderhoud is een aparte afspraak (Care).',
    ),
    extras: ['pages', 'responsive', 'motion', 'api', 'performance', 'languages', 'custom', 'care'],
  },
  {
    id: 'build',
    name: 'Build',
    featured: true,
    price: { kind: 'quote' },
    vat: 'unspecified',
    quoteRequired: true,
    priceNote: null,
    timeline: { kind: 'scope' },
    tagline: tri(
      'Egyedi webalkalmazás (böngészőben használt program) az ötlettől az első működő változatig.',
      'A custom web application (software used in a browser), from your idea to a first working version.',
      'Een webapplicatie op maat (software in je browser), van idee tot een eerste werkende versie.',
    ),
    audience: tri(
      'Akik a saját munkájukra szabott programot szeretnének, például foglalási vagy nyilvántartó rendszert.',
      'For people who want software built for their way of working, such as a booking system.',
      'Voor mensen die software voor hun eigen werkwijze willen, zoals een boekingssysteem.',
    ),
    fits: [
      tri(
        'Foglalási, nyilvántartási vagy kezelőfelületű alkalmazás',
        'A booking, record-keeping or management application',
        'Een boekings-, registratie- of beheerapplicatie',
      ),
      tri(
        'Digitális termék, amelyet különböző felhasználók más-más módon használnak',
        'A digital product that different kinds of users use in different ways',
        'Een digitaal product dat verschillende soorten gebruikers op verschillende manieren gebruiken',
      ),
      tri(
        'Egy meglévő folyamat áthelyezése az internetre',
        'Taking an existing process online',
        'Een bestaand proces online zetten',
      ),
    ],
    includes: [
      tri(
        'A felhasználók munkájához igazított képernyők és lépések',
        'Screens and steps designed around how your users work',
        'Schermen en stappen die zijn ontworpen rond hoe je gebruikers werken',
      ),
      tri(
        'Mind a látható felület, mind a háttérben működő rész, a megállapodott kereteken belül',
        'Both the part people see and the part that works behind the scenes, within the agreed scope',
        'Zowel het deel dat mensen zien als het deel dat op de achtergrond werkt, binnen de afgesproken omvang',
      ),
      tri(
        'Hely az adataid tárolására és kezelésére',
        'A place to store and manage your information',
        'Een plek om je gegevens op te slaan en te beheren',
      ),
      tri(
        'Kapcsolat más szolgáltatásokkal, amelyeket használsz',
        'Links to other services you use',
        'Koppelingen met andere diensten die je gebruikt',
      ),
      tri(
        'Terv arra, hogyan illeszkedik minden egymáshoz, hogy az alkalmazás később bővíthető legyen',
        'A plan for how everything fits together, so the application can grow later',
        'Een plan voor hoe alles in elkaar zit, zodat de applicatie later kan groeien',
      ),
    ],
    needs: ['webapp', 'integrations'],
    deliverables: [
      tri(
        'Működő webalkalmazás az első használható verzióig',
        'A working web application, up to a first usable version',
        'Een werkende webapplicatie, tot een eerste bruikbare versie',
      ),
      tri(
        'A látható felület és a háttérben működő rész, a megállapodott kereteken belül',
        'The part people see and the part behind the scenes, within the agreed scope',
        'Het deel dat mensen zien en het deel op de achtergrond, binnen de afgesproken omvang',
      ),
      tri(
        'Hely az adataidnak, és kapcsolatok más szolgáltatásokkal',
        'A place for your information, and links to other services',
        'Een plek voor je gegevens en koppelingen met andere diensten',
      ),
    ],
    scope: tri(
      'Egyedi webalkalmazás vagy összetettebb digitális termék.',
      'A custom web application or a more complex digital product.',
      'Een webapplicatie op maat of een complexer digitaal product.',
    ),
    customization: tri(
      'A te folyamatodra épített képernyők és lépések.',
      'Screens and steps built around your process.',
      'Schermen en stappen die zijn gebouwd rond jouw werkwijze.',
    ),
    support: tri(
      'Az átadás módját megbeszéljük. A további fejlesztés külön megállapodás.',
      'We agree how the handover works. Further development is a separate agreement.',
      'We spreken af hoe de oplevering gaat. Verdere ontwikkeling is een aparte afspraak.',
    ),
    extras: ['motion', 'api', 'performance', 'languages', 'custom', 'care'],
  },
  {
    id: 'care',
    name: 'Care',
    featured: false,
    price: { kind: 'quote' },
    vat: 'unspecified',
    quoteRequired: true,
    priceNote: null,
    timeline: { kind: 'scope' },
    tagline: tri(
      'Tartsd rendben a meglévő weboldaladat vagy alkalmazásodat, és fejleszd lépésről lépésre.',
      'Keep your existing website or application in good shape, and improve it step by step.',
      'Houd je bestaande website of applicatie in goede staat en verbeter die stap voor stap.',
    ),
    audience: tri(
      'Azoknak, akiknek már van weboldaluk vagy alkalmazásuk, és szeretnék, ha valaki gondozná.',
      'For people who already have a website or application and want someone to look after it.',
      'Voor mensen die al een website of applicatie hebben en willen dat iemand die onderhoudt.',
    ),
    fits: [
      tri(
        'Egy már működő weboldal hibáinak javítása',
        'Fixing problems on a website that is already live',
        'Problemen verhelpen op een website die al online staat',
      ),
      tri('Rendszeres kisebb módosítások', 'Regular small changes', 'Regelmatige kleine aanpassingen'),
      tri(
        'Új funkció tervezése egy meglévő alkalmazáshoz (külön megállapodással)',
        'Planning a new feature for an existing application (by separate agreement)',
        'Een nieuwe functie plannen voor een bestaande applicatie (volgens aparte afspraak)',
      ),
    ],
    includes: [
      tri(
        'Az általunk egyeztetett karbantartási feladatok',
        'Maintenance tasks that we agree on',
        'Onderhoudstaken die we samen afspreken',
      ),
      tri('Kisebb módosítások', 'Small changes', 'Kleine aanpassingen'),
      tri('Hibák felderítése és javítása', 'Finding and fixing problems', 'Problemen opsporen en verhelpen'),
      tri(
        'Annak ellenőrzése, mennyire gyors az oldalad',
        'A check of how fast your site is',
        'Een controle van hoe snel je site is',
      ),
      tri(
        'Új funkciók tervezése és elkészítése külön megállapodással',
        'Planning and building new features by separate agreement',
        'Nieuwe functies plannen en bouwen volgens aparte afspraak',
      ),
    ],
    needs: ['improve', 'website', 'webapp'],
    deliverables: [
      tri(
        'Az egyeztetett karbantartási feladatok elvégezve',
        'The agreed maintenance tasks, done',
        'De afgesproken onderhoudstaken, uitgevoerd',
      ),
      tri('Megtalált és kijavított hibák', 'Problems found and fixed', 'Gevonden en verholpen problemen'),
      tri(
        'Ellenőrzés, mennyire gyors az oldalad',
        'A check of how fast your site is',
        'Een controle van hoe snel je site is',
      ),
    ],
    scope: tri(
      'Egy már működő weboldal vagy alkalmazás folyamatos gondozása.',
      'Ongoing care for a website or application that already runs.',
      'Doorlopende zorg voor een website of applicatie die al draait.',
    ),
    customization: tri(
      'Kisebb módosítások a meglévő megoldáson.',
      'Small changes to what already exists.',
      'Kleine aanpassingen aan wat er al is.',
    ),
    support: tri(
      'A megbeszélt karbantartás a csomag lényege; hogy pontosan mit foglal magában, az ajánlatban áll.',
      'The agreed maintenance is the heart of this package; the quote spells out exactly what it covers.',
      'Het afgesproken onderhoud is de kern van dit pakket; in de offerte staat precies wat erbij hoort.',
    ),
    extras: ['pages', 'responsive', 'performance', 'languages', 'custom'],
  },
]

/** What the website shows: the packages above with the prices and texts the owner has edited in the administration laid over them (content/catalogOverlay.ts). */
/** A copy of its own: the live catalogue (content/liveCatalog.ts) updates this list in place and must never touch the source's `base…` list. */
export const packages: readonly ServicePackage[] = [...overlayPackages(basePackages)]

export function getPackage(id: PackageId): ServicePackage {
  const found = packages.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Unknown package: ${id}`)
  return found
}

export function isPackageId(value: string | null | undefined): value is PackageId {
  return packages.some((candidate) => candidate.id === value)
}
