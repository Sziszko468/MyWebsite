import { tri } from '../../../content/trilingual'

/** The words of the Lab's overview page. The experiments' names and the signature line are not translated. */
export const pageText = {
  hero: {
    eyebrow: tri('Kísérleti digitális játszótér', 'Experimental digital playground', 'Experimentele digitale speeltuin'),
    /** The full stop at the end is the page's secret: it is its own button. */
    headline: tri('LÉPJ BE A KÍSÉRLETI DIGITÁLIS VILÁGBA', 'ENTER THE EXPERIMENTAL SIDE', 'STAP DE EXPERIMENTELE KANT OP'),
    lead: tri(
      'Hat interaktív élmény. Végtelen lehetőség. Egy digitális játszótér.',
      'Six interactive environments. Endless possibilities. One digital playground.',
      'Zes interactieve omgevingen. Eindeloze mogelijkheden. Eén digitale speeltuin.',
    ),
    create: tri('Alkoss valami furát', 'Create something weird', 'Maak iets raars'),
    explore: tri('A hat élmény', 'The six experiences', 'De zes ervaringen'),
    fieldLabel: tri(
      'Mozgó piros vonalak, amelyek követik a pointert. Díszítés, nincs benne információ.',
      'Moving red lines that follow the pointer. Decoration only; it carries no information.',
      'Bewegende rode lijnen die de aanwijzer volgen. Alleen decoratie; er staat geen informatie in.',
    ),
  },
  discovery: {
    title: tri('Hat környezet. Hat szabály.', 'Six environments. Six rules.', 'Zes omgevingen. Zes regels.'),
    intro: tri(
      'Mozgasd az egeret, érintsd meg vagy húzd az előnézeteket: mindegyik a maga módján felel. Aztán nyisd meg.',
      'Hover, touch or drag a preview: each one answers in its own way. Then open it.',
      'Beweeg, raak aan of sleep over een voorbeeld: elk antwoordt op zijn eigen manier. Open het daarna.',
    ),
    open: tri('Megnyitás', 'Open', 'Openen'),
    featured: tri('Kiemelt', 'Featured', 'Uitgelicht'),
    previewHint: {
      'particle-universe': tri('Mozgasd: eltaszítja őket. Nyomd: magához húzza.', 'Move to push them away. Press to pull them in.', 'Beweeg om ze weg te duwen. Druk om ze aan te trekken.'),
      'liquid-matter': tri('Mozgasd: a foltok követnek és összeolvadnak.', 'Move: the blobs follow and merge.', 'Beweeg: de vlekken volgen en smelten samen.'),
      'type-in-motion': tri('Mozgasd a betűk fölött: megnyúlnak.', 'Move over the letters: they stretch.', 'Beweeg over de letters: ze rekken uit.'),
      'infinite-space': tri('Mozgasd: kormányoz. Nyomd: gyorsít.', 'Move to steer. Press to speed up.', 'Beweeg om te sturen. Druk om te versnellen.'),
      'chromatic-distortion': tri('Mozgasd: széthúzza a színeket.', 'Move to pull the colours apart.', 'Beweeg om de kleuren uit elkaar te trekken.'),
      'generative-objects': tri('Nyisd meg, és írj le valami lehetetlent.', 'Open it and write something impossible.', 'Open het en beschrijf iets onmogelijks.'),
    },
  },
  feature: {
    eyebrow: tri('Kiemelt · 06', 'Featured · 06', 'Uitgelicht · 06'),
    title: tri('ÍRJ LE VALAMI LEHETETLENT.', 'DESCRIBE SOMETHING IMPOSSIBLE.', 'BESCHRIJF IETS ONMOGELIJKS.'),
    lead: tri(
      'Változtasd a furcsa ötleteidet furcsa 3D-alkotásokká.',
      'Turn strange ideas into strange 3D creations.',
      'Verander rare ideeën in rare 3D-creaties.',
    ),
    label: tri('Írd le', 'Describe it', 'Beschrijf het'),
    placeholder: tri('Egy dühös croissant, aki meg akarja hódítani a világot…', 'An angry croissant trying to conquer the world…', 'Een boze croissant die de wereld wil veroveren…'),
    cta: tri('Alkoss valami furát', 'Create something weird', 'Maak iets raars'),
    or: tri('Vagy próbálj ki egyet:', 'Or try one:', 'Of probeer er een:'),
    steps: {
      title: tri('Hogyan működik', 'How it works', 'Hoe het werkt'),
      write: tri('Írd le, mit szeretnél. Magyarul, angolul vagy hollandul.', 'Write what you want. In Hungarian, English or Dutch.', 'Schrijf wat je wilt. In het Hongaars, Engels of Nederlands.'),
      build: tri(
        'Egy szöveg-3D motor (AI) a szerveren át modellezi meg: előbb az alakzatot, textúra nélkül. Megnézheted, és csak ha kéred, jönnek a textúrák. Ha nincs motor bekötve, az oldal ezt mondja meg.',
        'A text-to-3D engine (AI) models it through this site’s server: the shape first, untextured. You look at it, and the textures follow only if you ask. If no engine is connected, the page says so.',
        'Een tekst-naar-3D-engine (AI) modelleert het via de server van deze site: eerst de vorm, zonder textuur. Jij bekijkt hem en de texturen volgen alleen als je erom vraagt. Is er geen engine gekoppeld, dan zegt de pagina dat.',
      ),
      keep: tri(
        'Forgasd, nagyítsd, mentsd el a böngészőben, töltsd le GLB-ként. Külön, megjelölt módban a gyors, szabályos építő (nem AI) vicces tárgyakat épít a böngészőben.',
        'Turn it, zoom, keep it in your browser, download it as a GLB. In a separate, labelled mode the quick rule-based builder (not AI) builds funny objects in the browser.',
        'Draai hem, zoom, bewaar hem in je browser, download hem als GLB. In een aparte, gemarkeerde modus bouwt de snelle regelgebaseerde bouwer (geen AI) grappige voorwerpen in de browser.',
      ),
    },
    examplesTitle: tri('Néhány alkotás, amit a gyors építő készített (nem AI)', 'A few creations the quick builder made (not AI)', 'Enkele creaties van de snelle bouwer (geen AI)'),
    examplesNote: tri(
      'Valódi képernyőképek a gyors, szabályos építő módról, a megadott mondatból, szerkesztés nélkül. Az AI-modellek képei ettől különböznek: azokat a bekötött motor készíti.',
      'Real screenshots of the quick rule-based mode, made from the sentence shown, unedited. AI models look different: the connected engine makes those.',
      'Echte schermafbeeldingen van de snelle regelgebaseerde modus, gemaakt uit de getoonde zin, onbewerkt. AI-modellen zien er anders uit: die maakt de gekoppelde engine.',
    ),
    makeIt: tri('Építsd meg magad', 'Make it yourself', 'Maak het zelf'),
  },
  philosophy: {
    title: tri('Minek egy Lab?', 'Why a Lab?', 'Waarom een Lab?'),
    intro: tri(
      'Hely arra, hogy kipróbáljak dolgokat, mielőtt hasznuk lenne.',
      'A place to try things before they have a use.',
      'Een plek om dingen uit te proberen voordat ze een nut hebben.',
    ),
    items: [
      {
        name: tri('Kreativitás', 'Creativity', 'Creativiteit'),
        text: tri(
          'Minden darab egy kérdésből indul, nem megrendelésből: mi lenne, ha ez mozogna? Ha hallgatna rád?',
          'Every piece starts from a question, not a brief: what if this moved? What if it listened?',
          'Elk stuk begint met een vraag, niet met een opdracht: wat als dit bewoog? Wat als het luisterde?',
        ),
      },
      {
        name: tri('Interakció', 'Interaction', 'Interactie'),
        text: tri(
          'Semmi itt nem videó. Mindegyik felel a kezedre, az ujjadra vagy a billentyűidre.',
          'Nothing here is a video. Each piece answers your hand, your finger or your keys.',
          'Niets hier is een video. Elk stuk antwoordt op je hand, je vinger of je toetsen.',
        ),
      },
      {
        name: tri('Digitális kísérletezés', 'Digital experimentation', 'Digitaal experimenteren'),
        text: tri(
          'Az ötleteket először kódban próbálom ki. Megtartom, ami meglep, eldobom, ami nem.',
          'Ideas are tried in code first. I keep what surprises me and throw away what does not.',
          'Ideeën probeer ik eerst in code uit. Wat me verrast houd ik, de rest gooi ik weg.',
        ),
      },
      {
        name: tri('Generatív vizuálok', 'Generative visuals', 'Generatieve beelden'),
        text: tri(
          'Szabályok és egy mag rajzolják a képet: ugyanazok a számok mindig ugyanazt adják, más mag mást.',
          'Rules and a seed make the picture: the same numbers always make the same piece, another seed another one.',
          'Regels en een seed maken het beeld: dezelfde getallen maken altijd hetzelfde stuk, een andere seed een ander.',
        ),
      },
      {
        name: tri('Valós idejű renderelés', 'Real-time rendering', 'Realtime renderen'),
        text: tri(
          'Mindent élőben a te böngésződ és videókártyád rajzol, az eszközödhöz igazodó minőségben.',
          'All of it is drawn live by your browser and graphics card, at a quality that follows your device.',
          'Alles wordt live getekend door je browser en videokaart, in een kwaliteit die bij je apparaat past.',
        ),
      },
      {
        name: tri('Kreatív technológia', 'Creative technology', 'Creatieve technologie'),
        text: tri(
          'Nem a hatás a lényeg, hanem az, amit lehetővé tesz: játékosabb felület, gyorsabb eszköz, jobb kérdés.',
          'The point is not the effect but what it makes possible: a more playful interface, a faster tool, a better question.',
          'Het gaat niet om het effect maar om wat het mogelijk maakt: een speelser scherm, een sneller gereedschap, een betere vraag.',
        ),
      },
    ],
  },
  closing: {
    title: tri('AZ EGYETLEN HATÁR AZ, AMIT KÉPES VAGY ELKÉPZELNI.', 'THE ONLY LIMIT IS WHAT YOU CAN IMAGINE.', 'DE ENIGE GRENS IS WAT JE KUNT BEDENKEN.'),
    text: tri(
      'Hat játszótér nyitva áll. Kezdd a legfurcsábbal.',
      'Six playgrounds are open. Start with the strangest.',
      'Zes speeltuinen staan open. Begin met de vreemdste.',
    ),
    cta: tri('Kezdj kísérletezni', 'Start experimenting', 'Begin met experimenteren'),
    back: tri('Vissza a portfólióba', 'Back to the portfolio', 'Terug naar het portfolio'),
  },
  examples: {
    banana: tri('Egy izmos banán versenyautóban', 'A muscular banana in a racing car', 'Een gespierde banaan in een racewagen'),
    frog: tri('Egy arany béka napszemüvegben', 'A golden frog in sunglasses', 'Een gouden kikker met zonnebril'),
    croissant: tri('Egy dühös croissant a világ ellen', 'An angry croissant against the world', 'Een boze croissant tegen de wereld'),
    fridge: tri('Egy hűtőszekrény sportautóvá alakítva', 'A refrigerator turned into a sports car', 'Een koelkast omgebouwd tot sportwagen'),
  },
}
