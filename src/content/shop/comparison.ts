import type { PackageId } from '../packages'
import { tri, type Trilingual } from '../trilingual'

/**
 * The tier comparison: which feature each package has, and how the tiers step up from one another. The website's own
 * statement of it (this file) is the starting copy and what the backend is seeded from (`npm run catalog:seed-export`);
 * once the administrator edits it (Administration > Shop > Comparison) the published copy from the backend is laid over it
 * (content/catalogOverlay.ts `overlayComparison`).
 *
 * Nothing here is invented. Every row is a statement the packages already make (content/packages.ts: what each one
 * `includes`, its add-ons `extras`, the service pages' feature lists), and the level of a cell says how that package
 * relates to it:
 *   included  the package's own description names it;
 *   addon     the package lists the matching optional add-on among its `extras` (content/services/addons.ts);
 *   custom    it is not part of the package, but any package except Care can be asked for custom functionality, and the
 *             scope of a custom service is settled in the quote;
 *   none      neither.
 * Launch -> Grow -> Build is a ladder (the brief's structure: essential foundation, expanded capabilities, an advanced
 * solution): a higher tier lists the foundation of the one below as included, and `buildsOn` says so. Care stands beside
 * the ladder: it maintains and develops what exists, and has no `buildsOn`. The cells that are the owner's to confirm
 * (the Build column of the first five rows, where a web application is not a website with a contact section) are named in
 * docs/shop/README.md.
 */

export type FeatureLevel = 'included' | 'addon' | 'custom' | 'none'
export const FEATURE_LEVELS = ['included', 'addon', 'custom', 'none'] as const satisfies readonly FeatureLevel[]
export const isFeatureLevel = (value: unknown): value is FeatureLevel => FEATURE_LEVELS.some((level) => level === value)

export interface TierInfo {
  package: PackageId
  /** What the tier is, in a few words ("Essential foundation"). */
  label: Trilingual
  /** The package this one steps up from; `null` for the start of the ladder and for Care. */
  buildsOn: PackageId | null
}

export interface ComparisonFeature {
  id: string
  name: Trilingual
  /** A short explanation shown on request (a tooltip on a desktop, an expandable line on a phone). Empty when the name says it all. */
  description: Trilingual
  levels: Record<PackageId, FeatureLevel>
}

export interface Comparison {
  tiers: TierInfo[]
  features: ComparisonFeature[]
}

const EMPTY = tri('', '', '')
const row = (id: string, name: Trilingual, levels: [FeatureLevel, FeatureLevel, FeatureLevel, FeatureLevel], description: Trilingual = EMPTY): ComparisonFeature => ({
  id,
  name,
  description,
  levels: { launch: levels[0], grow: levels[1], build: levels[2], care: levels[3] },
})

export const baseComparison: Comparison = {
  tiers: [
    { package: 'launch', label: tri('A stabil alap', 'Essential foundation', 'De essentiële basis'), buildsOn: null },
    { package: 'grow', label: tri('Bővebb lehetőségek', 'Expanded capabilities', 'Uitgebreide mogelijkheden'), buildsOn: 'launch' },
    { package: 'build', label: tri('Összetettebb megoldás', 'Advanced solution', 'Geavanceerde oplossing'), buildsOn: 'grow' },
    { package: 'care', label: tri('Folyamatos támogatás', 'Continuous support', 'Voortdurende ondersteuning'), buildsOn: null },
  ],
  features: [
    row(
      'quote',
      tri('Egyedi ajánlat, leírt tartalommal', 'A custom quote with the scope written down', 'Een offerte op maat met de omvang op papier'),
      ['included', 'included', 'included', 'included'],
      tri(
        'Minden csomag ajánlatkéréssel indul: a pontos tartalmat és az árat az ajánlat rögzíti, az ajánlatkérés semmire nem köt.',
        'Every package starts with a quote request: the exact scope and price are written in the quote, and asking commits you to nothing.',
        'Elk pakket begint met een offerteaanvraag: de exacte omvang en prijs staan in de offerte en een aanvraag verplicht tot niets.',
      ),
    ),
    row('responsive', tri('Reszponzív megjelenés mobiltól asztali gépig', 'A responsive layout from phone to desktop', 'Een responsieve opmaak van telefoon tot desktop'), ['included', 'included', 'included', 'none']),
    row('structure', tri('Átgondolt oldal- és tartalomszerkezet', 'A considered page and content structure', 'Een doordachte pagina- en inhoudsstructuur'), ['included', 'included', 'included', 'none']),
    row('navigation', tri('Mobilbarát navigáció', 'Mobile-friendly navigation', 'Mobielvriendelijke navigatie'), ['included', 'included', 'included', 'none']),
    row(
      'contact',
      tri('Kapcsolatfelvételi felület', 'A contact section', 'Een contactgedeelte'),
      ['included', 'included', 'custom', 'none'],
      tri(
        'Az üzenetek kezelésének módját projektenként egyeztetjük.',
        'How messages are handled is agreed per project.',
        'Hoe berichten worden afgehandeld spreken we per project af.',
      ),
    ),
    row('seo', tri('Alapvető metaadatok és technikai SEO', 'Basic metadata and technical SEO', 'Basismetadata en technische SEO'), ['included', 'included', 'custom', 'none']),
    row(
      'sections',
      tri('További oldalak és tartalmi szekciók', 'More pages and content sections', 'Meer pagina’s en inhoudssecties'),
      ['addon', 'included', 'custom', 'addon'],
      tri(
        'A megállapodott szerkezetbe illesztve; a Launch csomaghoz külön kiegészítőként kérhető.',
        'Fitted into the agreed structure; on Launch it can be asked for as an add-on.',
        'Ingepast in de afgesproken structuur; bij Launch kan het als optie worden gevraagd.',
      ),
    ),
    row('components', tri('Egyedi komponensek', 'Custom components', 'Eigen componenten'), ['custom', 'included', 'included', 'none']),
    row('interactive', tri('Interaktív felületek és mozgás', 'Interactive interfaces and motion', 'Interactieve interfaces en beweging'), ['addon', 'included', 'included', 'none'], tri('A használhatóság mindig előbbre való a mozgásnál.', 'Usability always comes before motion.', 'Bruikbaarheid gaat altijd voor beweging.')),
    row(
      'integrations',
      tri('Külső szolgáltatások és API-kapcsolatok', 'Third-party services and API connections', 'Externe diensten en API-koppelingen'),
      ['custom', 'included', 'included', 'none'],
      tri(
        'Hogy egy adott szolgáltatás bekötése megvalósítható-e, azt az ajánlat előtt tisztázzuk.',
        'Whether a particular service can be connected is settled before the quote.',
        'Of een bepaalde dienst gekoppeld kan worden, stemmen we af vóór de offerte.',
      ),
    ),
    row('userflows', tri('Egyedi felhasználói folyamatok', 'Custom user flows', 'Eigen gebruikersstromen'), ['custom', 'custom', 'included', 'none']),
    row('backend', tri('Frontend- és backendfejlesztés', 'Frontend and backend development', 'Frontend- en backendontwikkeling'), ['custom', 'custom', 'included', 'none'], tri('A megállapodott keretek között.', 'Within the agreed scope.', 'Binnen de afgesproken omvang.')),
    row('database', tri('Adatbázis-integráció', 'Database integration', 'Database-integratie'), ['custom', 'custom', 'included', 'none']),
    row('architecture', tri('Az alkalmazás architektúrájának kialakítása', 'Shaping the application architecture', 'Het vormgeven van de applicatiearchitectuur'), ['custom', 'custom', 'included', 'none']),
    row('languages', tri('További nyelvi változat', 'An additional language', 'Een extra taalversie'), ['addon', 'addon', 'addon', 'addon'], tri('A szövegek elkészítésének módját az ajánlatban rögzítjük.', 'How the texts are produced is agreed in the quote.', 'Hoe de teksten tot stand komen, leggen we vast in de offerte.')),
    row('performance', tri('Teljesítmény-átvilágítás', 'A performance check', 'Een prestatiecontrole'), ['custom', 'addon', 'addon', 'included']),
    row('maintenance', tri('Egyeztetett karbantartási feladatok', 'Agreed maintenance tasks', 'Afgesproken onderhoudstaken'), ['addon', 'addon', 'addon', 'included'], tri('Külön megállapodással; a teljes keretet a Care csomag adja.', 'By separate agreement; the Care package is built around it.', 'Via een aparte afspraak; het Care-pakket draait hier volledig om.')),
    row('fixes', tri('Hibaelhárítás és kisebb módosítások', 'Troubleshooting and small changes', 'Probleemoplossing en kleine aanpassingen'), ['addon', 'addon', 'addon', 'included']),
    row('handover', tri('Átadás a megállapodás szerint', 'Handover as agreed', 'Oplevering zoals afgesproken'), ['included', 'included', 'included', 'none'], tri('A karbantartás külön megállapodás (Care).', 'Ongoing maintenance is a separate agreement (Care).', 'Doorlopend onderhoud is een aparte afspraak (Care).')),
    row(
      'newfeatures',
      tri('Új funkciók tervezése külön megállapodással', 'New features planned by separate agreement', 'Nieuwe functies plannen via een aparte afspraak'),
      ['custom', 'custom', 'custom', 'custom'],
      tri('Amit a lista nem tartalmaz, azt leírod, és a részletek ismeretében közösen döntjük el, belefér-e.', 'What is not on the list you describe, and once the details are known we decide together whether it fits.', 'Wat niet op de lijst staat, beschrijf je, en als de details bekend zijn beslissen we samen of het past.'),
    ),
  ],
}

/** The comparison the pages read. Laid over, in place, by the live catalogue (content/liveCatalog.ts); the lists keep their identity. */
export const comparison: Comparison = { tiers: [...baseComparison.tiers], features: [...baseComparison.features] }
