import { tri } from '../trilingual'

/** The shop's landing page (/services): hero, discovery, packages, comparison, process, support, work, questions. */

export const landing = {

  hero: {
    titleLine1: tri('Alkossunk valami', 'Build something', 'Bouw iets'),
    titleLine2: tri('maradandót.', 'that matters.', 'dat ertoe doet.'),
    lead: tri(
      'Weboldalak, digitális élmények és alkalmazások, amelyek a következő nagy ötleted köré épülnek.',
      'Digital experiences, websites and applications designed around your next big idea.',
      'Websites, digitale ervaringen en applicaties, ontworpen rond jouw volgende grote idee.',
    ),
    ctaPrimary: tri('Szolgáltatások felfedezése', 'Explore services', 'Ontdek de diensten'),
    ctaSecondary: tri('Beszéljünk', 'Let’s talk', 'Laten we praten'),
    glance: tri('Mit kaphatsz', 'What you can get', 'Wat je kunt krijgen'),
    note: tri(
      'Az ajánlatkérés nem megrendelés: leírod, mire van szükséged, és egyedi ajánlatot kapsz.',
      'Asking for a quote is not placing an order: you say what you need and you get a custom quote.',
      'Een offerte aanvragen is geen bestelling: je zegt wat je nodig hebt en krijgt een offerte op maat.',
    ),
    compositionLabel: tri('A négy szolgáltatás egy képen', 'The four services in one picture', 'De vier diensten in één beeld'),
  },

  discovery: {
    title: tri('Találd meg a megfelelő szolgáltatást', 'Find the right service', 'Vind de juiste dienst'),
    intro: tri(
      'Négy szolgáltatás, mindegyiknek saját oldala. Olvasd végig, vagy keress rá arra, ami érdekel.',
      'Four services, each with a page of its own. Read through them, or search for what you are after.',
      'Vier diensten, elk met een eigen pagina. Lees ze door of zoek op wat je zoekt.',
    ),
    finder: {
      label: tri('Keresés szolgáltatások, csomagok és kiegészítők között', 'Search services, packages and add-ons', 'Zoek in diensten, pakketten en extra’s'),
      placeholder: tri('pl. nyelv, mobil, foglalás', 'e.g. language, mobile, booking', 'bijv. taal, mobiel, boeking'),
      filterLabel: tri('Szűrés típus szerint', 'Filter by type', 'Filter op soort'),
      kinds: {
        all: tri('Mind', 'All', 'Alles'),
        service: tri('Szolgáltatások', 'Services', 'Diensten'),
        package: tri('Csomagok', 'Packages', 'Pakketten'),
        addon: tri('Kiegészítők', 'Add-ons', 'Extra’s'),
      },
      kindOne: {
        service: tri('Szolgáltatás', 'Service', 'Dienst'),
        package: tri('Csomag', 'Package', 'Pakket'),
        addon: tri('Kiegészítő', 'Add-on', 'Extra'),
      },
      clear: tri('Szűrők törlése', 'Clear all filters', 'Alle filters wissen'),
      count: tri('{count} találat', '{count} results', '{count} resultaten'),
      countOne: tri('1 találat', '1 result', '1 resultaat'),
      emptyTitle: tri('Nincs találat', 'No results', 'Geen resultaten'),
      emptyText: tri(
        'Erre nem találtam semmit. Próbálj rövidebb szót, vagy töröld a szűrőket. Ha egyik sem illik a projektedhez, kérhetsz egyedi megoldást.',
        'I found nothing for that. Try a shorter word, or clear the filters. If nothing fits your project, you can ask for a custom solution.',
        'Daar vond ik niets voor. Probeer een korter woord of wis de filters. Past niets bij je project, dan kun je een oplossing op maat vragen.',
      ),
      emptyCta: tri('Egyedi projekt leírása', 'Describe a custom project', 'Vraag maatwerk aan'),
      appliesTo: tri('Ehhez adható: {list}', 'Can be added to: {list}', 'Toe te voegen aan: {list}'),
      open: tri('Megnézem', 'Open', 'Bekijken'),
      resultsLabel: tri('Keresési találatok', 'Search results', 'Zoekresultaten'),
    },
    card: {
      benefits: tri('Előnyök', 'Benefits', 'Voordelen'),
      useCases: tri('Tipikus felhasználás', 'Typical use', 'Typisch gebruik'),
      included: tri('Amit tartalmazhat', 'What can be included', 'Wat erbij kan horen'),
      example: tri('Példa a munkáimból', 'An example from my work', 'Een voorbeeld uit mijn werk'),
      noExample: tri('Ezt a munkát még nem mutatja egyik portfólióprojekt sem.', 'No portfolio project shows this kind of work yet.', 'Geen enkel portfolioproject toont dit soort werk al.'),
      more: tri('Részletek', 'Details', 'Details'),
      suggested: tri('Ajánlott csomagok', 'Suggested packages', 'Voorgestelde pakketten'),
    },
  },

  packages: {
    title: tri('Csomagok', 'Packages', 'Pakketten'),
    intro: tri(
      'Négy csomag, amelyből kiindulhatsz. Nem végleges ajánlatok: a pontos tartalom, ár és időzítés az ajánlatkérés után, a projekt ismeretében dől el.',
      'Four packages to start from. They are not final offers: the exact content, price and timing are settled after a quote request, once the project is known.',
      'Vier pakketten om mee te beginnen. Het zijn geen definitieve offertes: de exacte inhoud, prijs en timing worden na een offerteaanvraag vastgesteld, als het project bekend is.',
    ),
    chooser: tri('Válassz csomagot', 'Choose a package', 'Kies een pakket'),
    rows: {
      audience: tri('Kinek szól', 'Who it is for', 'Voor wie'),
      deliverables: tri('Amit kapsz', 'What you get', 'Wat je krijgt'),
      includes: tri('Amit tartalmazhat', 'What can be included', 'Wat erbij kan horen'),
      extras: tri('Választható kiegészítők', 'Optional add-ons', 'Optionele extra’s'),
      price: tri('Ár', 'Price', 'Prijs'),
      timeline: tri('Határidő', 'Timeline', 'Doorlooptijd'),
      fits: tri('Ilyen projektekhez illik', 'Suits projects like', 'Past bij projecten als'),
    },
    timeline: {
      scope: tri('A projekt terjedelmétől függ, és az ajánlatban rögzítjük.', 'Depends on the scope of the project and is fixed in the quote.', 'Hangt af van de omvang van het project en wordt vastgelegd in de offerte.'),
      estimate: tri('Jellemzően {range} {unit}, az ajánlatban megerősítve.', 'Typically {range} {unit}, confirmed in the quote.', 'Doorgaans {range} {unit}, bevestigd in de offerte.'),
      units: {
        days: { one: tri('nap', 'day', 'dag'), other: tri('nap', 'days', 'dagen') },
        weeks: { one: tri('hét', 'week', 'week'), other: tri('hét', 'weeks', 'weken') },
        months: { one: tri('hónap', 'month', 'maand'), other: tri('hónap', 'months', 'maanden') },
      },
    },
    featured: tri('Hangsúlyosabb', 'Highlighted', 'Uitgelicht'),
    featuredNote: tri('Csak vizuális hangsúly, nem népszerűségi állítás.', 'A visual emphasis only, not a claim of popularity.', 'Alleen visuele nadruk, geen bewering van populariteit.'),
    start: tri('Kezdés: {name}', 'Start with {name}', 'Begin met {name}'),
    chosenLive: tri('Kiválasztott csomag: {name}', 'Selected package: {name}', 'Geselecteerd pakket: {name}'),
    customCard: {
      cta: tri('Egyedi projekt leírása', 'Describe a custom project', 'Vraag maatwerk aan'),
      title: tri('Egyik sem illik? Egyedi projekt.', 'None of them fit? A custom project.', 'Past er geen bij? Een maatwerkproject.'),
      text: tri(
        'Leírod, mit szeretnél, és az ajánlat a projektre készül, nem egy csomagra.',
        'You describe what you want and the quote is made for the project, not for a package.',
        'Jij beschrijft wat je wilt en de offerte wordt op het project gemaakt, niet op een pakket.',
      ),
    },
  },

  compare: {
    title: tri('Csomagok összehasonlítása', 'Compare packages', 'Pakketten vergelijken'),
    intro: tri(
      'Mit kapsz, mekkora projektre szól, mit kérhetsz hozzá, és milyen támogatást kapsz: egymás mellett. Telefonon soronként olvasható.',
      'What you get, how big a project it suits, what you can add and what support you have: side by side. On a phone it reads row by row.',
      'Inhoud, omvang, extra’s, ondersteuning en aanpasbaarheid naast elkaar. Op een telefoon lees je het rij voor rij.',
    ),
    open: tri('Összehasonlítás megnyitása', 'Show the comparison', 'Vergelijking tonen'),
    close: tri('Összehasonlítás elrejtése', 'Hide the comparison', 'Vergelijking verbergen'),
    pick: tri('Mely csomagokat hasonlítsuk össze?', 'Which packages to compare?', 'Welke pakketten vergelijken?'),
    pickHint: tri('Legalább kettőt hagyj bekapcsolva.', 'Keep at least two switched on.', 'Laat er minstens twee aan staan.'),
    rowsLabel: tri('Összehasonlító táblázat', 'Comparison', 'Vergelijking'),
    rows: {
      includes: tri('Tartalmazott szolgáltatások', 'Included services', 'Inbegrepen diensten'),
      scope: tri('Mekkora projektre szól', 'How big a project it suits', 'Voor hoe groot een project'),
      customization: tri('Mennyi készül kifejezetten neked', 'How much is made for you', 'Hoeveel speciaal voor jou wordt gemaakt'),
      extras: tri('Választható kiegészítők', 'Available add-ons', 'Beschikbare extra’s'),
      support: tri('Támogatás', 'Support', 'Ondersteuning'),
      price: tri('Ár', 'Price', 'Prijs'),
      timeline: tri('Határidő', 'Timeline', 'Doorlooptijd'),
    },
  },

  configureBand: {
    title: tri('Nem tudod, mire van szükséged? Állítsd össze a kérésed.', 'Not sure what you need? Build your request.', 'Weet je niet wat je nodig hebt? Stel je aanvraag samen.'),
    text: tri(
      'Hat rövid lépés: mire van szükséged, melyik csomag, milyen kiegészítők, a projekt részletei, áttekintés, ajánlatkérés. Bármikor visszaléphetsz, és semmire nem kötelez.',
      'Six short steps: what you need, which package, which add-ons, the project details, a review and the request. You can go back at any time and it commits you to nothing.',
      'Zes korte stappen: wat je nodig hebt, welk pakket, welke extra’s, de projectdetails, een overzicht en de aanvraag. Je kunt altijd terug en het verplicht je tot niets.',
    ),
    cta: tri('Összeállítás indítása', 'Start building', 'Begin met samenstellen'),
    custom: tri('Egyedi projektet írok le', 'Describe a custom project', 'Vraag maatwerk aan'),
    steps: tri('6 lépés', '6 steps', '6 stappen'),
  },

  process: {
    title: tri('Hogyan működik egy projekt', 'How a project runs', 'Hoe een project verloopt'),
    intro: tri('Öt lépés az ötlettől az átadásig.', 'Five steps from idea to handover.', 'Vijf stappen van idee tot oplevering.'),
    afterTitle: tri('Mi történik az ajánlatkérés után', 'What happens after you ask', 'Wat er gebeurt nadat je aanvraagt'),
    afterIntro: tri(
      'Csak a sorrendet mondom meg; válaszidőt, árat vagy határidőt nem ígérek.',
      'I can only tell you the order of things; I promise no reply time, price or deadline.',
      'Ik kan alleen de volgorde noemen; ik beloof geen reactietijd, prijs of deadline.',
    ),
    collabTitle: tri('Kommunikáció és együttműködés', 'Communication and collaboration', 'Communicatie en samenwerking'),
  },

  support: {
    title: tri('Támogatási lehetőségek', 'Support options', 'Hulp na de oplevering'),
    intro: tri(
      'Mi történik az átadás után? Három külön dolog, amelyeket nem keverek össze.',
      'What happens after handover? Three separate things, which I do not mix up.',
      'Wat gebeurt er na de oplevering? Drie aparte dingen, die ik niet door elkaar haal.',
    ),
    items: [
      {
        title: tri('Átadáskor', 'At handover', 'Bij de oplevering'),
        text: tri(
          'Az átadás módját a projekt elején egyeztetjük, és az ajánlatban rögzítjük.',
          'How the handover works is agreed at the start of the project and written in the quote.',
          'Hoe de oplevering verloopt, spreken we aan het begin van het project af en leggen we vast in de offerte.',
        ),
      },
      {
        title: tri('Folyamatos karbantartás', 'Ongoing maintenance', 'Doorlopend onderhoud'),
        text: tri(
          'Nem automatikus: külön megállapodás tárgya. Erre való a Care csomag.',
          'It is not automatic: it is a separate agreement. That is what the Care package is for.',
          'Het is niet automatisch: het is een aparte afspraak. Daar is het pakket Care voor.',
        ),
      },
      {
        title: tri('Új funkciók', 'New features', 'Nieuwe functies'),
        text: tri(
          'Egy kész megoldás továbbfejlesztése külön megállapodás szerint történik.',
          'Developing a finished solution further is done by separate agreement.',
          'Een afgeronde oplossing verder ontwikkelen gebeurt volgens aparte afspraak.',
        ),
      },
    ],
  },

  work: {
    title: tri('Portfóliópéldák', 'Portfolio examples', 'Voorbeelden uit het portfolio'),
    intro: tri(
      'Valódi projektek, amelyek megmutatják, hogyan dolgozom. Mindegyiknél ott áll, mi az állapota.',
      'Real projects that show how I work. Each one says what state it is in.',
      'Echte projecten die laten zien hoe ik werk. Bij elk staat in welke staat het is.',
    ),
    all: tri('Összes munka', 'All work', 'Al het werk'),
    details: tri('Részletek', 'Details', 'Details'),
  },

  faq: {
    title: tri('Gyakori kérdések', 'Frequently asked questions', 'Veelgestelde vragen'),
    intro: tri(
      'Őszinte, általános válaszok. Ha a tiéd nincs itt, írd le az ajánlatkérésben.',
      'Honest, general answers. If yours is not here, write it in the quote request.',
      'Eerlijke, algemene antwoorden. Staat de jouwe er niet bij, schrijf hem dan in de offerteaanvraag.',
    ),
  },

  final: {
    title: tri('Van egy ötleted?', 'Have an idea?', 'Heb je een idee?'),
    text: tri(
      'Nézzük meg, hogyan lehet belőle működő digitális termék.',
      'Let’s see how it can become a working digital product.',
      'Laten we kijken hoe het een werkend digitaal product kan worden.',
    ),
    cta: tri('Összeállítom a kérésem', 'Build my request', 'Mijn aanvraag samenstellen'),
  },

  loadingPage: tri('A bolt betöltése', 'Loading the shop', 'De winkel wordt geladen'),
}
