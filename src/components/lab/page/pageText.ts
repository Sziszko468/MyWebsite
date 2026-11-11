import { tri } from '../../../content/trilingual'

/** The words of the Lab's overview page. The experiments' names and the signature line are not translated. */
export const pageText = {
  hero: {
    eyebrow: tri('Kísérleti digitális játszótér', 'Experimental digital playground', 'Experimentele digitale speeltuin'),
    /** The full stop at the end is the page's secret: it is its own button. */
    headline: tri('LÉPJ BE A KÍSÉRLETI DIGITÁLIS VILÁGBA', 'ENTER THE EXPERIMENTAL SIDE', 'STAP DE EXPERIMENTELE KANT OP'),
    lead: tri(
      'Öt interaktív élmény. Végtelen lehetőség. Egy digitális játszótér.',
      'Five interactive environments. Endless possibilities. One digital playground.',
      'Vijf interactieve omgevingen. Eindeloze mogelijkheden. Één digitale speeltuin.',
    ),
    create: tri('Kezdd az elsővel', 'Start with the first', 'Begin met de eerste'),
    explore: tri('Az öt élmény', 'The five experiences', 'De vijf ervaringen'),
    fieldLabel: tri(
      'Mozgó piros vonalak, amelyek követik a pointert. Díszítés, nincs benne információ.',
      'Moving red lines that follow the pointer. Decoration only; it carries no information.',
      'Bewegende rode lijnen die de aanwijzer volgen. Alleen decoratie; er staat geen informatie in.',
    ),
  },
  discovery: {
    title: tri('Öt környezet. Öt szabály.', 'Five environments. Five rules.', 'Vijf omgevingen. Vijf regels.'),
    intro: tri(
      'Mozgasd az egeret, érintsd meg vagy húzd az előnézeteket: mindegyik a maga módján felel. Aztán nyisd meg.',
      'Hover, touch or drag a preview: each one answers in its own way. Then open it.',
      'Beweeg, raak aan of sleep over een voorbeeld: elk antwoordt op zijn eigen manier. Open het daarna.',
    ),
    open: tri('Megnyitás', 'Open', 'Openen'),
    previewHint: {
      'particle-universe': tri('Mozgasd: eltaszítja őket. Nyomd: magához húzza.', 'Move to push them away. Press to pull them in.', 'Beweeg om ze weg te duwen. Druk om ze aan te trekken.'),
      'liquid-matter': tri('Mozgasd: a foltok követnek és összeolvadnak.', 'Move: the blobs follow and merge.', 'Beweeg: de vlekken volgen en smelten samen.'),
      'type-in-motion': tri('Mozgasd a betűk fölött: megnyúlnak.', 'Move over the letters: they stretch.', 'Beweeg over de letters: ze rekken uit.'),
      'infinite-space': tri('Mozgasd: kormányoz. Nyomd: gyorsít.', 'Move to steer. Press to speed up.', 'Beweeg om te sturen. Druk om te versnellen.'),
      'chromatic-distortion': tri('Mozgasd: széthúzza a színeket.', 'Move to pull the colours apart.', 'Beweeg om de kleuren uit elkaar te trekken.'),
    },
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
        name: tri('Generatív látványelemek', 'Generative visuals', 'Generatieve beelden'),
        text: tri(
          'Szabályok és egy mag rajzolják a képet: ugyanazok a számok mindig ugyanazt adják, más mag mást.',
          'Rules and a seed make the picture: the same numbers always make the same piece, another seed another one.',
          'Regels en een seed maken het beeld: dezelfde getallen maken altijd hetzelfde stuk, een andere seed een ander.',
        ),
      },
      {
        name: tri('Valós idejű megjelenítés', 'Real-time rendering', 'Realtime renderen'),
        text: tri(
          'Mindent élőben a te böngésződ és videokártyád rajzol, az eszközödhöz igazodó minőségben.',
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
      'Öt játszótér nyitva áll. Kezdd a legfurcsábbal.',
      'Five playgrounds are open. Start with the strangest.',
      'Vijf speeltuinen staan open. Begin met de vreemdste.',
    ),
    cta: tri('Kezdj kísérletezni', 'Start experimenting', 'Begin met experimenteren'),
    back: tri('Vissza a portfólióba', 'Back to the portfolio', 'Terug naar het portfolio'),
  },
}
