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
    { package: 'launch', label: tri('Az alapok', 'The essentials', 'De basis'), buildsOn: null },
    { package: 'grow', label: tri('Több lehetőség', 'More possibilities', 'Meer mogelijkheden'), buildsOn: 'launch' },
    { package: 'build', label: tri('Összetettebb megoldás', 'A more advanced solution', 'Een uitgebreidere oplossing'), buildsOn: 'grow' },
    { package: 'care', label: tri('Folyamatos támogatás', 'Ongoing support', 'Doorlopende ondersteuning'), buildsOn: null },
  ],
  features: [
    row(
      'quote',
      tri('Egyedi ajánlat, amely leírja, mit kapsz', 'A custom quote that spells out what you get', 'Een offerte op maat waarin staat wat je krijgt'),
      ['included', 'included', 'included', 'included'],
      tri(
        'Minden csomag ajánlatkéréssel indul: a pontos tartalmat és az árat az ajánlat rögzíti, az ajánlatkérés semmire nem kötelez.',
        'Every package starts with a quote request: the exact scope and price are written in the quote, and asking commits you to nothing.',
        'Elk pakket begint met een offerteaanvraag: de exacte omvang en prijs staan in de offerte en een aanvraag verplicht tot niets.',
      ),
    ),
    row('responsive', tri('Jól működik telefonon, tableten és számítógépen', 'Works well on phones, tablets and computers', 'Werkt goed op telefoon, tablet en computer'), ['included', 'included', 'included', 'none']),
    row('structure', tri('Áttekinthető oldalak és tartalom', 'Clear pages and content', 'Heldere pagina’s en inhoud'), ['included', 'included', 'included', 'none']),
    row('navigation', tri('Telefonon is könnyen használható menü', 'A menu that is easy to use on a phone', 'Een menu dat ook op een telefoon makkelijk werkt'), ['included', 'included', 'included', 'none']),
    row(
      'contact',
      tri('Elérhetőségi rész', 'A contact section', 'Een contactgedeelte'),
      ['included', 'included', 'custom', 'none'],
      tri(
        'Az üzenetek kezelésének módját projektenként egyeztetjük.',
        'How messages are handled is agreed per project.',
        'Hoe berichten worden afgehandeld spreken we per project af.',
      ),
    ),
    row(
      'seo',
      tri('Alapbeállítások a keresőkhöz', 'Basic settings for search engines', 'Basisinstellingen voor zoekmachines'),
      ['included', 'included', 'custom', 'none'],
      tri(
        'Hogy a Google és a többi kereső megértse az oldalt.',
        'So that Google and other search engines can understand the site.',
        'Zodat Google en andere zoekmachines de site begrijpen.',
      ),
    ),
    row(
      'sections',
      tri('További oldalak és részek', 'More pages and sections', 'Meer pagina’s en onderdelen'),
      ['addon', 'included', 'custom', 'addon'],
      tri(
        'A megegyezett szerkezetbe illesztve; a Launch csomaghoz külön kiegészítőként kérhető.',
        'Added to the agreed structure; with Launch you can ask for it as an add-on.',
        'Ingepast in de afgesproken structuur; bij Launch kun je het als extra vragen.',
      ),
    ),
    row('components', tri('Neked készített oldalelemek', 'Page elements made for you', 'Voor jou gemaakte pagina-elementen'), ['custom', 'included', 'included', 'none']),
    row('interactive', tri('Interaktív részek és mozgás', 'Interactive parts and movement', 'Interactieve onderdelen en beweging'), ['addon', 'included', 'included', 'none'], tri('A könnyű használat mindig előbbre való a mozgásnál.', 'Ease of use always comes before movement.', 'Gebruiksgemak gaat altijd voor beweging.')),
    row(
      'integrations',
      tri('Kapcsolat más szolgáltatásokkal', 'Links to other services', 'Koppelingen met andere diensten'),
      ['custom', 'included', 'included', 'none'],
      tri(
        'Hogy egy adott szolgáltatás összekötése megvalósítható-e, azt az ajánlat előtt közösen megnézzük.',
        'Whether a particular service can be connected is something we check together before the quote.',
        'Of een bepaalde dienst gekoppeld kan worden, bekijken we samen vóór de offerte.',
      ),
    ),
    row('userflows', tri('A felhasználók munkájához igazított lépések', 'Steps built around how your users work', 'Stappen die zijn gebouwd rond hoe je gebruikers werken'), ['custom', 'custom', 'included', 'none']),
    row('backend', tri('A háttérben működő rész is', 'The part behind the scenes too', 'Ook het deel op de achtergrond'), ['custom', 'custom', 'included', 'none'], tri('A megállapodott kereteken belül.', 'Within the agreed scope.', 'Binnen de afgesproken omvang.')),
    row('database', tri('Hely az információ tárolására', 'A place to keep your information', 'Een plek om je gegevens te bewaren'), ['custom', 'custom', 'included', 'none']),
    row(
      'architecture',
      tri('Terv arra, hogyan illeszkedik minden egymáshoz', 'A plan for how everything fits together', 'Een plan voor hoe alles in elkaar zit'),
      ['custom', 'custom', 'included', 'none'],
      tri('Hogy az alkalmazás később bővíthető legyen.', 'So the application can grow later.', 'Zodat de applicatie later kan groeien.'),
    ),
    row('languages', tri('További nyelvi változat', 'An additional language', 'Een extra taalversie'), ['addon', 'addon', 'addon', 'addon'], tri('A szövegek elkészítésének módját az ajánlatban rögzítjük.', 'We agree in the quote how the texts are produced.', 'In de offerte leggen we vast hoe de teksten tot stand komen.')),
    row('performance', tri('Sebességvizsgálat', 'A speed check', 'Een snelheidscontrole'), ['custom', 'addon', 'addon', 'included']),
    row('maintenance', tri('Egyeztetett karbantartási feladatok', 'Agreed maintenance tasks', 'Afgesproken onderhoudstaken'), ['addon', 'addon', 'addon', 'included'], tri('Külön megállapodással; a Care csomag erről szól.', 'By separate agreement; the Care package is built around it.', 'Via een aparte afspraak; het pakket Care draait hier volledig om.')),
    row('fixes', tri('Hibák javítása és kisebb módosítások', 'Fixing problems and small changes', 'Problemen verhelpen en kleine aanpassingen'), ['addon', 'addon', 'addon', 'included']),
    row('handover', tri('Az átadás a megállapodás szerint', 'Handover as agreed', 'Oplevering zoals afgesproken'), ['included', 'included', 'included', 'none'], tri('A folyamatos karbantartás külön megállapodás (Care).', 'Ongoing maintenance is a separate agreement (Care).', 'Doorlopend onderhoud is een aparte afspraak (Care).')),
    row(
      'newfeatures',
      tri('Új funkciók tervezése külön megállapodással', 'New features planned by separate agreement', 'Nieuwe functies plannen via een aparte afspraak'),
      ['custom', 'custom', 'custom', 'custom'],
      tri('Amit a lista nem tartalmaz, azt leírod, és ha a részletek ismertek, közösen döntjük el, hogy belefér-e.', 'What is not on the list you describe, and once the details are known we decide together whether it fits.', 'Wat niet op de lijst staat, beschrijf je, en als de details bekend zijn beslissen we samen of het past.'),
    ),
  ],
}

/** The comparison the pages read. Laid over, in place, by the live catalogue (content/liveCatalog.ts); the lists keep their identity. */
export const comparison: Comparison = { tiers: [...baseComparison.tiers], features: [...baseComparison.features] }
