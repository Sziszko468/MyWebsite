import { tri } from '../trilingual'

/**
 * The words of the tier comparison on the services page and of the package pages (`/services/packages/<package>`), in three
 * languages. Starting copy for the owner to confirm; read through `useShopText().tiers`. The package names, tier labels and the
 * comparison's rows are not here: they are data (content/packages.ts, content/shop/comparison.ts) the administrator edits.
 */

export const tiers = {
  /** The comparison on the services page. */
  compare: {
    title: tri('Négy csomag, egymás mellett', 'Four packages, side by side', 'Vier pakketten, naast elkaar'),
    intro: tri(
      'A Launch az alap, a Grow bővebb lehetőségeket ad, a Build összetettebb megoldás, a Care pedig a folyamatos támogatás. Minden lépcső megmutatja, mit tesz hozzá az előzőhöz.',
      'Launch is the foundation, Grow adds capabilities, Build is the more advanced solution and Care is continuous support. Each step shows what it adds to the one before.',
      'Launch is de basis, Grow voegt mogelijkheden toe, Build is de uitgebreidere oplossing en Care is voortdurende ondersteuning. Elke stap laat zien wat hij aan de vorige toevoegt.',
    ),
    tableLabel: tri('Csomagok összehasonlítása: a sorok a tulajdonságok, az oszlopok a csomagok', 'Package comparison: the rows are features, the columns are packages', 'Pakketvergelijking: de rijen zijn kenmerken, de kolommen zijn pakketten'),
    scrollLabel: tri('Összehasonlító táblázat, vízszintesen görgethető', 'Comparison table, scrolls sideways', 'Vergelijkingstabel, scrolt zijwaarts'),
    featureHeader: tri('Tulajdonság', 'Feature', 'Kenmerk'),
    legendTitle: tri('Jelmagyarázat', 'Key', 'Legenda'),
    levels: {
      included: tri('Tartalmazza', 'Included', 'Inbegrepen'),
      addon: tri('Kiegészítő', 'Add-on', 'Optie'),
      custom: tri('Egyedi', 'Custom', 'Maatwerk'),
      none: tri('Nem része', 'Not included', 'Niet inbegrepen'),
    },
    levelsLong: {
      included: tri('A csomag tartalmazza', 'Included in the package', 'Inbegrepen in het pakket'),
      addon: tri('Választható kiegészítőként kérhető', 'Available as an optional add-on', 'Beschikbaar als optionele toevoeging'),
      custom: tri('Egyedi szolgáltatásként kérhető', 'Available as a custom service', 'Beschikbaar als dienst op maat'),
      none: tri('Nem része a csomagnak', 'Not part of the package', 'Geen onderdeel van het pakket'),
    },
    adds: {
      row: tri('A lépcső értéke', 'The value of each step', 'De waarde van elke stap'),
      over: tri('Amit a(z) {name} hozzátesz a(z) {previous} csomaghoz', 'What {name} adds to {previous}', 'Wat {name} toevoegt aan {previous}'),
      start: tri('Amivel a(z) {name} indul', 'What {name} starts with', 'Waarmee {name} begint'),
      beside: tri('Amit a(z) {name} nyújt', 'What {name} provides', 'Wat {name} biedt'),
      more: tri('+{count} további, lent a táblázatban', '+{count} more, in the table below', '+{count} meer, in de tabel hieronder'),
      none: tri('Ennél a csomagnál nincs új tartalmazott tulajdonság.', 'This package has no newly included feature.', 'Dit pakket heeft geen nieuw inbegrepen kenmerk.'),
    },
    builds: tri('Épít a(z) {name} csomagra', 'Builds on {name}', 'Bouwt voort op {name}'),
    besideLadder: tri('A többi mellett áll: a már meglévő megoldást tartja karban és fejleszti', 'Stands beside the others: it maintains and develops what already exists', 'Staat naast de andere: het onderhoudt en ontwikkelt wat al bestaat'),
    groups: {
      every: tri('Minden csomagban', 'In every package', 'In elk pakket'),
      introduced: tri('A(z) {name} csomagtól', 'Introduced with {name}', 'Vanaf {name}'),
      other: tri('Csak kiegészítőként vagy egyedi szolgáltatásként', 'Only as an add-on or a custom service', 'Alleen als optie of dienst op maat'),
    },
    viewDetails: tri('Részletek', 'View details', 'Bekijk details'),
    viewDetailsOf: tri('{name} részletei', 'Details of {name}', 'Details van {name}'),
    start: tri('Kezdés a(z) {name} csomaggal', 'Start with {name}', 'Begin met {name}'),
    select: tri('Kiválasztom', 'Select', 'Kiezen'),
    selected: tri('Kiválasztva', 'Selected', 'Gekozen'),
    selectedLive: tri('Kiválasztott csomag: {name}', 'Selected package: {name}', 'Gekozen pakket: {name}'),
    notAvailable: tri('Jelenleg nem elérhető', 'Not available at the moment', 'Momenteel niet beschikbaar'),
    summaryTitle: tri('A kiválasztott csomag', 'Your selection', 'Je keuze'),
    explain: tri('Mit jelent: {name}?', 'What does {name} mean?', 'Wat betekent {name}?'),
    showMore: tri('Magyarázat', 'Explanation', 'Uitleg'),
    // The phone's version.
    tabsLabel: tri('Válassz csomagot', 'Choose a package', 'Kies een pakket'),
    swipeHint: tri('Húzd oldalra, vagy használd a füleket a csomagok közötti váltáshoz.', 'Swipe sideways or use the tabs to move between packages.', 'Veeg zijwaarts of gebruik de tabs om tussen pakketten te wisselen.'),
    allFeatures: tri('Az összes tulajdonság', 'All features', 'Alle kenmerken'),
    featuresCount: tri('{count} tulajdonság', '{count} features', '{count} kenmerken'),
    pair: {
      open: tri('Két csomag összehasonlítása', 'Compare two packages', 'Twee pakketten vergelijken'),
      close: tri('Vissza egy csomaghoz', 'Back to one package', 'Terug naar één pakket'),
      left: tri('Első csomag', 'First package', 'Eerste pakket'),
      right: tri('Második csomag', 'Second package', 'Tweede pakket'),
      differencesOnly: tri('Csak a különbségeket mutasd', 'Show only the differences', 'Toon alleen de verschillen'),
      same: tri('A két csomag ugyanazt mutatja: válassz másikat.', 'The two packages are the same: choose another.', 'De twee pakketten zijn gelijk: kies een ander.'),
      noDifferences: tri('Nincs különbség a két csomag között.', 'There is no difference between the two.', 'Er is geen verschil tussen de twee.'),
      live: tri('{count} különbség a két csomag között', '{count} differences between the two', '{count} verschillen tussen de twee'),
    },
    recommended: tri('Ajánlott', 'Recommended', 'Aanbevolen'),
  },

  /** A package's own page. */
  page: {
    eyebrow: tri('Csomag', 'Package', 'Pakket'),
    breadcrumbPackages: tri('Csomagok', 'Packages', 'Pakketten'),
    compareAll: tri('Az összes csomag összehasonlítása', 'Compare all packages', 'Alle pakketten vergelijken'),
    sections: {
      forWhom: tri('Kinek szól', 'Who this package is for', 'Voor wie dit pakket is'),
      included: tri('Tartalmazott szolgáltatások', 'Included services', 'Inbegrepen diensten'),
      deliverables: tri('Amit a végén a kezedben tartasz', 'What you hold at the end', 'Wat je aan het eind in handen hebt'),
      features: tri('Részletes tulajdonságok', 'Detailed features', 'Gedetailleerde kenmerken'),
      different: tri('Mitől más ez a lépcső', 'What makes this tier different', 'Wat dit niveau anders maakt'),
      addons: tri('Választható kiegészítők', 'Optional add-ons', 'Optionele toevoegingen'),
      related: tri('Kapcsolódó szolgáltatások', 'Related services', 'Gerelateerde diensten'),
      pricing: tri('Ár és ajánlat', 'Pricing', 'Prijs'),
      faq: tri('Gyakori kérdések', 'Questions', 'Veelgestelde vragen'),
    },
    fits: tri('Illik hozzá', 'A good fit for', 'Past bij'),
    scope: tri('Terjedelem', 'Scope', 'Omvang'),
    customization: tri('Testreszabhatóság', 'Customisation', 'Aanpasbaarheid'),
    support: tri('Támogatás', 'Support', 'Ondersteuning'),
    timeline: tri('Határidő', 'Timeline', 'Doorlooptijd'),
    featureGroups: {
      included: tri('A csomag tartalmazza', 'Included in the package', 'Inbegrepen in het pakket'),
      addon: tri('Választható kiegészítőként', 'Available as an optional add-on', 'Beschikbaar als optionele toevoeging'),
      custom: tri('Egyedi szolgáltatásként', 'Available as a custom service', 'Beschikbaar als dienst op maat'),
      none: tri('Nem része a csomagnak', 'Not part of the package', 'Geen onderdeel van het pakket'),
    },
    nextTier: tri('A következő lépcső: {name}', 'The next step up: {name}', 'De volgende stap: {name}'),
    previousTier: tri('Az előző lépcső: {name}', 'The step below: {name}', 'De stap eronder: {name}'),
    neighbours: tri('Szomszédos csomagok', 'Neighbouring packages', 'Naastgelegen pakketten'),
    noAddons: tri('Ehhez a csomaghoz jelenleg nincs választható kiegészítő.', 'There are no optional add-ons for this package at the moment.', 'Er zijn momenteel geen optionele toevoegingen voor dit pakket.'),
    addonsHint: tri('A kiegészítők a kosárban vagy az összeállítóban választhatók, és az ajánlat rögzíti őket.', 'Add-ons are chosen in the cart or the request builder and written down in the quote.', 'Opties kies je in de winkelmand of de aanvraagbouwer en ze worden in de offerte vastgelegd.'),
    ctaTitle: tri('Indítsuk el ezzel a csomaggal?', 'Shall we start with this package?', 'Zullen we met dit pakket beginnen?'),
    ctaText: tri('Az ajánlatkérés semmire nem köt: a pontos tartalmat és az árat az ajánlat rögzíti.', 'Asking commits you to nothing: the exact scope and price are written in the quote.', 'Een aanvraag verplicht tot niets: de exacte omvang en prijs staan in de offerte.'),
    notFoundTitle: tri('Ez a csomag nem található', 'This package was not found', 'Dit pakket is niet gevonden'),
  },
}
