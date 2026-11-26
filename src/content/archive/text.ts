import { tri } from '../trilingual'

/**
 * Every word of the Command Center and the Digital Archive (PROMPT 37), in the site's three languages. The names, descriptions and categories of the records are NOT here:
 * they are read from where they already live (the projects, the Lab, the demos, the playground). The statuses use the site's own words (the dictionaries and the Lab's).
 */
export const archiveText = {
  system: {
    label: tri('Irányítóközpont navigáció', 'Command Center navigation', 'Navigatie van het commandocentrum'),
    command: tri('Irányítóközpont', 'Command Center', 'Commandocentrum'),
    archive: tri('Archívum', 'Archive', 'Archief'),
    work: tri('Munkák', 'Work', 'Werk'),
    lab: tri('Lab', 'Lab', 'Lab'),
  },

  kinds: {
    one: {
      project: tri('Projekt', 'Project', 'Project'),
      demo: tri('Interaktív bemutató', 'Interactive demo', 'Interactieve demo'),
      lab: tri('Lab-élmény', 'Lab experience', 'Lab-ervaring'),
      tool: tri('Dizájneszköz', 'Design tool', 'Ontwerpgereedschap'),
    },
    many: {
      project: tri('Projektek', 'Projects', 'Projecten'),
      demo: tri('Bemutatók', 'Demos', 'Demo’s'),
      lab: tri('Lab-élmények', 'Lab experiences', 'Lab-ervaringen'),
      tool: tri('Eszközök', 'Tools', 'Gereedschappen'),
    },
  },
  categories: {
    creativeCoding: tri('Kreatív programozás', 'Creative coding', 'Creatief programmeren'),
    designTools: tri('Dizájneszközök', 'Design tools', 'Ontwerpgereedschappen'),
    /** A project category the CMS gives no readable name in this language. Its key is never shown; the numbered form tells several apart. */
    unnamed: tri('Névtelen kategória', 'Unnamed category', 'Naamloze categorie'),
    unnamedNumbered: tri('Névtelen kategória {number}', 'Unnamed category {number}', 'Naamloze categorie {number}'),
  },
  demoTitle: tri('{project}: {demo}', '{project}: {demo}', '{project}: {demo}'),

  archive: {
    eyebrow: tri('Controlled Chaos · archívum', 'Controlled Chaos · archive', 'Controlled Chaos · archief'),
    titleA: tri('Digitális', 'Digital', 'Digitaal'),
    titleB: tri('archívum', 'Archive', 'archief'),
    lead: tri(
      'Minden, amit ez a weboldal nyilvánosan megmutat, egy helyen: a projektek, az interaktív bemutatók, a Lab hat élménye és a dizájneszköz. Kereshető, szűrhető, rendezhető, és minden bejegyzés a saját oldalára visz.',
      'Everything this website shows in public, in one place: the projects, the interactive demos, the six Lab experiences and the design tool. Search it, filter it, sort it, and every entry leads to its own page.',
      'Alles wat deze website openbaar laat zien, op één plek: de projecten, de interactieve demo’s, de zes ervaringen van het Lab en het ontwerpgereedschap. Doorzoek, filter en sorteer het, en elk item leidt naar zijn eigen pagina.',
    ),
    listHeading: tri('Bejegyzések', 'Entries', 'Items'),
    controlsLabel: tri('Keresés és szűrés', 'Search and filter', 'Zoeken en filteren'),
    search: tri('Keresés az archívumban', 'Search the archive', 'Zoek in het archief'),
    searchHelp: tri('Név, technológia vagy bármely szó; ékezet és kis-nagybetű nem számít.', 'A name, a technology or any word; accents and case do not matter.', 'Een naam, een technologie of een woord; accenten en hoofdletters maken niet uit.'),
    kind: tri('Típus', 'Kind', 'Soort'),
    category: tri('Kategória', 'Category', 'Categorie'),
    status: tri('Állapot', 'Status', 'Status'),
    sort: tri('Rendezés', 'Sort by', 'Sorteren op'),
    sorts: {
      curated: tri('Válogatott sorrend', 'Curated order', 'Samengestelde volgorde'),
      name: tri('Név szerint (A–Z)', 'Name (A–Z)', 'Naam (A–Z)'),
      nameDesc: tri('Név szerint (Z–A)', 'Name (Z–A)', 'Naam (Z–A)'),
      kind: tri('Típus szerint', 'Kind', 'Soort'),
    },
    all: tri('Mind', 'All', 'Alles'),
    counted: tri('{label} ({count})', '{label} ({count})', '{label} ({count})'),
    clear: tri('Minden törlése', 'Clear all', 'Alles wissen'),
    results: tri('{shown} / {total} bejegyzés látszik', '{shown} of {total} entries shown', '{shown} van {total} items zichtbaar'),
    loading: tri('A projektek betöltése…', 'Loading the projects…', 'De projecten worden geladen…'),
    emptyTitle: tri('Nincs találat', 'Nothing matches', 'Niets gevonden'),
    emptyText: tri('Próbálj más szavakat, vagy töröld a szűrőket.', 'Try other words, or clear the filters.', 'Probeer andere woorden of wis de filters.'),
    entry: {
      open: tri('Megnyitás', 'Open', 'Openen'),
      openNamed: tri('{name} megnyitása', 'Open {name}', '{name} openen'),
      tryDemo: tri('Bemutató kipróbálása', 'Try the demo', 'Demo proberen'),
      projectPage: tri('A projekt oldala', 'The project page', 'De projectpagina'),
      noPage: tri('Még nincs saját oldala', 'No page of its own yet', 'Nog geen eigen pagina'),
      link: tri('Közvetlen link', 'Direct link', 'Directe link'),
      linkNamed: tri('Közvetlen link: {name}', 'Direct link to {name}', 'Directe link naar {name}'),
      linked: tri('Ezt a bejegyzést közvetlen link nyitotta meg.', 'A direct link opened this entry.', 'Een directe link opende dit item.'),
      tags: tri('Technológiák és címkék', 'Technologies and tags', 'Technologieën en labels'),
      cover: tri('Borítókép', 'Cover', 'Omslag'),
    },
  },

  command: {
    eyebrow: tri('Controlled Chaos · belépési pont', 'Controlled Chaos · entry point', 'Controlled Chaos · startpunt'),
    titleA: tri('Irányító', 'Command', 'Commando'),
    titleB: tri('központ', 'Center', 'centrum'),
    lead: tri(
      'A belépési pont mindenhez, amit ez a weboldal megmutat: a munkákhoz, az archívumhoz, a Lab kísérleteihez, a bemutatókhoz, a szolgáltatásokhoz és hozzám.',
      'The way into everything this website shows: the work, the archive, the experiments of the Lab, the demos, the services and the person behind it.',
      'De toegang tot alles wat deze website laat zien: het werk, het archief, de experimenten van het Lab, de demo’s, de diensten en de maker.',
    ),
    enter: tri('Az archívum megnyitása', 'Open the archive', 'Het archief openen'),
    line: tri('{entries} nyilvános bejegyzés · {languages} nyelv', '{entries} public entries · {languages} languages', '{entries} openbare items · {languages} talen'),
    map: {
      title: tri('A térkép', 'The map', 'De kaart'),
      lead: tri('Hét irány, a valódi tartalom számaival.', 'Seven directions, with the numbers of what is really there.', 'Zeven richtingen, met de aantallen van wat er echt is.'),
      archive: { title: tri('Archívum', 'Archive', 'Archief'), text: tri('Minden bejegyzés, keresővel.', 'Every entry, with search.', 'Elk item, met zoekfunctie.'), count: tri('{count} bejegyzés', '{count} entries', '{count} items') },
      work: { title: tri('Munkák', 'Work', 'Werk'), text: tri('A nyilvános projektek.', 'The published projects.', 'De openbare projecten.'), count: tri('{count} projekt', '{count} projects', '{count} projecten') },
      demos: { title: tri('Bemutatók', 'Demos', 'Demo’s'), text: tri('Mintaadatokkal kipróbálható.', 'Try them on sample data.', 'Probeer ze met voorbeeldgegevens.'), count: tri('{count} bemutató', '{count} demos', '{count} demo’s') },
      lab: { title: tri('Lab', 'Lab', 'Lab'), text: tri('A hat kísérleti élmény.', 'The six experimental experiences.', 'De zes experimentele ervaringen.'), count: tri('{count} élmény', '{count} experiences', '{count} ervaringen') },
      tool: { title: tri('Design System Playground', 'Design System Playground', 'Design System Playground'), text: tri('A dizájnrendszer kézbe vehetően.', 'The design system, to handle.', 'Het designsysteem om aan te pakken.'), count: tri('{count} eszköz', '{count} tool', '{count} gereedschap') },
      services: { title: tri('Szolgáltatások', 'Services', 'Diensten'), text: tri('Amit megrendelhetsz.', 'What you can order.', 'Wat je kunt bestellen.'), count: tri('{count} szolgáltatás', '{count} services', '{count} diensten') },
      people: { title: tri('Rólam és kapcsolat', 'About and contact', 'Over mij en contact'), text: tri('Ki készíti, és hogyan érsz el.', 'Who makes it, and how to reach me.', 'Wie het maakt en hoe je me bereikt.'), count: tri('{count} oldal', '{count} pages', '{count} pagina’s') },
    },
    featured: { title: tri('Kiemelt munkák', 'Featured work', 'Uitgelicht werk'), all: tri('Minden munka', 'All work', 'Al het werk') },
    lab: { title: tri('A Lab hat élménye', 'The six experiences of the Lab', 'De zes ervaringen van het Lab'), text: tri('Valós idejű grafika, egérrel, érintéssel és billentyűzettel.', 'Real-time graphics, with a mouse, a finger or a keyboard.', 'Realtime graphics, met muis, vinger of toetsenbord.'), all: tri('A Lab oldala', 'The Lab page', 'De Lab-pagina') },
    demos: {
      title: tri('Interaktív bemutatók', 'Interactive demos', 'Interactieve demo’s'),
      text: tri('Kitalált mintaadatokkal futnak; semmi nem mentődik.', 'They run on invented sample data; nothing is saved.', 'Ze draaien op verzonnen voorbeeldgegevens; niets wordt opgeslagen.'),
      none: tri('Most egyetlen bemutató sincs bekapcsolva.', 'No demo is switched on right now.', 'Er staat nu geen demo aan.'),
    },
    services: {
      title: tri('Szolgáltatások és bolt', 'Services and the shop', 'Diensten en de winkel'),
      shop: tri('Az összes szolgáltatás és csomag', 'All services and packages', 'Alle diensten en pakketten'),
      full: tri('A teljes élmény', 'The full experience', 'De volledige ervaring'),
    },
    people: { title: tri('Aki mögötte áll', 'The person behind it', 'Wie erachter zit'), about: tri('Rólam', 'About me', 'Over mij'), contact: tri('Kapcsolat', 'Contact', 'Contact') },
  },
} as const
