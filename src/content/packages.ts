import type { ExtraId } from './services/addons'
import type { NeedId } from './services/ids'
import type { ServicePrice, Timeline, VatMode } from './pricing'
import { overlayPackages } from './catalogOverlay'
import { tri, type Trilingual } from './trilingual'

/**
 * The collaboration packages, in this order, on the home page and on the services page. Both read
 * their words from here, so a package never says two different things.
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

  /** One sentence: what the package is. */
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
      'Egy világos, jól használható weboldal, amellyel elindulhatsz.',
      'A clear, usable website to get you started.',
      'Een heldere, bruikbare website waarmee je van start gaat.',
    ),
    audience: tri(
      'Egyszerűbb webes jelenlétet létrehozni kívánó vállalkozásoknak és magánszemélyeknek.',
      'For businesses and individuals who want to set up a straightforward web presence.',
      'Voor bedrijven en particulieren die een eenvoudige webpresentie willen opzetten.',
    ),
    fits: [
      tri(
        'Bemutatkozó weboldal vállalkozásnak',
        'An introductory website for a business',
        'Een introductiewebsite voor een bedrijf',
      ),
      tri(
        'Személyes vagy szakmai bemutatkozó oldal',
        'A personal or professional profile page',
        'Een persoonlijke of professionele profielpagina',
      ),
      tri('Kisebb, tartalomközpontú weboldal', 'A small, content-focused website', 'Een kleine, inhoudelijke website'),
    ],
    includes: [
      tri('Reszponzív bemutatkozó weboldal', 'A responsive introductory website', 'Een responsieve introductiewebsite'),
      tri('Alapvető oldalszerkezet', 'A basic page structure', 'Een basisstructuur van de pagina’s'),
      tri('Mobilbarát navigáció', 'Mobile-friendly navigation', 'Mobielvriendelijke navigatie'),
      tri(
        'Kapcsolatfelvételi felület; az üzenetek kezelésének módját projektenként egyeztetjük',
        'A contact section; how messages are handled is agreed per project',
        'Een contactgedeelte; hoe berichten worden afgehandeld spreken we per project af',
      ),
      tri(
        'Alapvető metaadatok és technikai SEO-beállítások',
        'Basic metadata and technical SEO settings',
        'Basismetadata en technische SEO-instellingen',
      ),
    ],
    needs: ['website'],
    deliverables: [
      tri('Kész, reszponzív weboldal', 'A finished, responsive website', 'Een afgeronde, responsieve website'),
      tri(
        'Oldalszerkezet és navigáció, amely telefonon is működik',
        'A page structure and navigation that work on a phone',
        'Een paginastructuur en navigatie die ook op een telefoon werken',
      ),
      tri(
        'Beállított metaadatok és technikai SEO-alapok',
        'Metadata and technical SEO basics set up',
        'Ingestelde metadata en technische SEO-basis',
      ),
    ],
    scope: tri('Kisebb, áttekinthető weboldal.', 'A small, easy-to-grasp website.', 'Een kleine, overzichtelijke website.'),
    customization: tri(
      'Egyedi megjelenés az alapszerkezeten belül.',
      'A distinctive look within the basic structure.',
      'Een eigen uitstraling binnen de basisstructuur.',
    ),
    support: tri(
      'Átadás a megállapodás szerint; a folyamatos karbantartás külön megállapodás (Care).',
      'Handover as agreed; ongoing maintenance is a separate agreement (Care).',
      'Oplevering zoals afgesproken; doorlopend onderhoud is een aparte afspraak (Care).',
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
      'Meglévő online jelenlét továbbfejlesztése: új szekciók, jobb élmény, bővítés.',
      'Taking an existing online presence further: new sections, a better experience, more features.',
      'Een bestaande online aanwezigheid verder ontwikkelen: nieuwe secties, een betere ervaring, uitbreiding.',
    ),
    audience: tri(
      'Meglévő online jelenlétüket továbbfejleszteni kívánó vállalkozásoknak.',
      'For businesses that want to develop an existing online presence further.',
      'Voor bedrijven die een bestaande online aanwezigheid verder willen ontwikkelen.',
    ),
    fits: [
      tri(
        'Meglévő weboldal bővítése új szekciókkal',
        'Extending an existing website with new sections',
        'Een bestaande website uitbreiden met nieuwe secties',
      ),
      tri(
        'Interaktív elemek és egyedi komponensek',
        'Interactive elements and custom components',
        'Interactieve elementen en maatwerkcomponenten',
      ),
      tri(
        'Külső szolgáltatás bekötése a projekt keretein belül',
        'Connecting an external service within the project scope',
        'Een externe dienst koppelen binnen de projectomvang',
      ),
    ],
    includes: [
      tri('Összetettebb weboldal', 'A more complex website', 'Een complexere website'),
      tri('Több tartalmi szekció', 'More content sections', 'Meer inhoudelijke secties'),
      tri('Testreszabott komponensek', 'Custom components', 'Maatwerkcomponenten'),
      tri('Interaktív felületek', 'Interactive interfaces', 'Interactieve interfaces'),
      tri(
        'Harmadik féltől származó integrációk a projekt keretein belül',
        'Third-party integrations within the project scope',
        'Integraties met derden binnen de projectomvang',
      ),
    ],
    needs: ['improve', 'website', 'ui', 'integrations'],
    deliverables: [
      tri('Továbbfejlesztett, bővített weboldal', 'A developed, extended website', 'Een doorontwikkelde, uitgebreide website'),
      tri(
        'Testreszabott komponensek és interaktív felületek',
        'Custom components and interactive interfaces',
        'Maatwerkcomponenten en interactieve interfaces',
      ),
      tri(
        'Az egyeztetett külső szolgáltatások bekötve',
        'The agreed external services connected',
        'De afgesproken externe diensten gekoppeld',
      ),
    ],
    scope: tri(
      'Meglévő vagy összetettebb weboldal bővítése.',
      'Extending an existing or more complex website.',
      'Een bestaande of complexere website uitbreiden.',
    ),
    customization: tri(
      'Testreszabott komponensek és interaktív elemek.',
      'Custom components and interactive elements.',
      'Maatwerkcomponenten en interactieve elementen.',
    ),
    support: tri(
      'Átadás a megállapodás szerint; a folyamatos karbantartás külön megállapodás (Care).',
      'Handover as agreed; ongoing maintenance is a separate agreement (Care).',
      'Oplevering zoals afgesproken; doorlopend onderhoud is een aparte afspraak (Care).',
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
      'Egyedi webalkalmazás az ötlettől az első használható verzióig.',
      'A custom web application, from the idea to a first usable version.',
      'Een maatwerk-webapplicatie, van idee tot een eerste bruikbare versie.',
    ),
    audience: tri(
      'Egyedi webalkalmazást vagy összetettebb digitális terméket fejleszteni kívánó ügyfeleknek.',
      'For clients building a custom web application or a more complex digital product.',
      'Voor opdrachtgevers die een maatwerk-webapplicatie of een complexer digitaal product willen laten bouwen.',
    ),
    fits: [
      tri(
        'Foglalási, nyilvántartási vagy kezelőfelületű alkalmazás',
        'A booking, records or management application',
        'Een boekings-, registratie- of beheerapplicatie',
      ),
      tri(
        'Digitális termék több felhasználói szerepkörrel',
        'A digital product with several user roles',
        'Een digitaal product met meerdere gebruikersrollen',
      ),
      tri(
        'Meglévő folyamat digitalizálása webalkalmazással',
        'Taking an existing process online as a web application',
        'Een bestaand proces digitaliseren als webapplicatie',
      ),
    ],
    includes: [
      tri('Egyedi felhasználói folyamatok', 'Custom user flows', 'Maatwerk gebruikersflows'),
      tri(
        'Frontend- és backendfejlesztés a megállapodott terjedelem szerint',
        'Frontend and backend development within the agreed scope',
        'Frontend- en backendontwikkeling binnen de afgesproken omvang',
      ),
      tri('Adatbázis-integráció', 'Database integration', 'Database-integratie'),
      tri('API-kapcsolatok', 'API connections', 'API-koppelingen'),
      tri(
        'Az alkalmazásarchitektúra kialakítása',
        'Shaping the application architecture',
        'Opzet van de applicatiearchitectuur',
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
        'Frontend és backend a megállapodott terjedelemben',
        'Frontend and back end within the agreed scope',
        'Frontend en back-end binnen de afgesproken omvang',
      ),
      tri('Adatbázis- és API-kapcsolatok', 'Database and API connections', 'Database- en API-koppelingen'),
    ],
    scope: tri(
      'Egyedi webalkalmazás vagy összetettebb digitális termék.',
      'A custom web application or a more complex digital product.',
      'Een maatwerk-webapplicatie of een complexer digitaal product.',
    ),
    customization: tri(
      'Egyedi felhasználói folyamatok és architektúra.',
      'Custom user flows and architecture.',
      'Maatwerk gebruikersflows en architectuur.',
    ),
    support: tri(
      'Átadás a megállapodás szerint; a további fejlesztés külön megállapodás.',
      'Handover as agreed; further development is a separate agreement.',
      'Oplevering zoals afgesproken; verdere ontwikkeling is een aparte afspraak.',
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
      'Meglévő weboldalak és alkalmazások karbantartása és továbbfejlesztése.',
      'Maintaining and developing existing websites and applications.',
      'Bestaande websites en applicaties onderhouden en doorontwikkelen.',
    ),
    audience: tri(
      'Meglévő weboldalak és alkalmazások karbantartását, továbbfejlesztését igénylő ügyfeleknek.',
      'For clients who need an existing website or application maintained and developed further.',
      'Voor opdrachtgevers die een bestaande website of applicatie willen laten onderhouden en doorontwikkelen.',
    ),
    fits: [
      tri(
        'Egy már működő oldal hibáinak javítása',
        'Fixing problems on a site that already runs',
        'Problemen verhelpen op een site die al draait',
      ),
      tri('Rendszeres kisebb módosítások', 'Regular small changes', 'Regelmatige kleine aanpassingen'),
      tri(
        'Új funkció tervezése egy meglévő alkalmazásba, külön megállapodás szerint',
        'Planning a new feature for an existing application, by separate agreement',
        'Een nieuwe functie plannen voor een bestaande applicatie, volgens aparte afspraak',
      ),
    ],
    includes: [
      tri('Egyeztetett karbantartási feladatok', 'Agreed maintenance tasks', 'Afgesproken onderhoudstaken'),
      tri('Kisebb módosítások', 'Small changes', 'Kleine aanpassingen'),
      tri('Hibakeresés', 'Troubleshooting', 'Foutopsporing'),
      tri('Teljesítményellenőrzés', 'A performance check', 'Prestatiecontrole'),
      tri(
        'Új funkciók tervezése és fejlesztése külön megállapodás szerint',
        'Planning and building new features by separate agreement',
        'Nieuwe functies ontwerpen en bouwen volgens aparte afspraak',
      ),
    ],
    needs: ['improve', 'website', 'webapp'],
    deliverables: [
      tri('Az egyeztetett karbantartási feladatok elvégezve', 'The agreed maintenance tasks carried out', 'De afgesproken onderhoudstaken uitgevoerd'),
      tri('Felderített és javított hibák', 'Problems found and fixed', 'Gevonden en verholpen problemen'),
      tri('Teljesítményellenőrzés', 'A performance check', 'Een prestatiecontrole'),
    ],
    scope: tri(
      'Egy már működő weboldal vagy alkalmazás folyamatos gondozása.',
      'Ongoing care of a website or application that already runs.',
      'Doorlopende zorg voor een website of applicatie die al draait.',
    ),
    customization: tri(
      'Kisebb módosítások a meglévő megoldáson.',
      'Small changes to what already exists.',
      'Kleine aanpassingen aan wat er al is.',
    ),
    support: tri(
      'Az egyeztetett karbantartás maga a csomag lényege; a terjedelmet az ajánlat rögzíti.',
      'The agreed maintenance is the point of the package; the scope is written in the quote.',
      'Het afgesproken onderhoud is de kern van het pakket; de omvang staat in de offerte.',
    ),
    extras: ['pages', 'responsive', 'performance', 'languages', 'custom'],
  },
]

/** What the website shows: the packages above with the prices and texts the owner has edited in the administration laid over them (content/catalogOverlay.ts). */
export const packages: readonly ServicePackage[] = overlayPackages(basePackages)

export function getPackage(id: PackageId): ServicePackage {
  const found = packages.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Unknown package: ${id}`)
  return found
}

export function isPackageId(value: string | null | undefined): value is PackageId {
  return packages.some((candidate) => candidate.id === value)
}
