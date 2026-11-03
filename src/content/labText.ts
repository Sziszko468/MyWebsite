import type { LabId } from './lab'
import { labMeta } from './labMeta'
import { tri, type Trilingual } from './trilingual'

/**
 * The words of the Lab, each in Hungarian, English and Dutch side by side, so a missing translation
 * fails the build. The experiments' names and the line "MOVE. DISTORT. EXPLORE." are the Lab's
 * signature and stay in English everywhere; everything that explains or controls is translated.
 * Each experiment keeps the words of its own controls beside its code (components/lab/experiments).
 */

export interface ExperimentText {
  /** Two or three sentences: what the visitor will see and do. */
  description: Trilingual
  /** The ways to interact, as a list. */
  interactions: readonly Trilingual[]
  /** The line laid over the stage until the first interaction. */
  hint: Trilingual
  /** The line for a touch screen. */
  hintTouch: Trilingual
  /** What the stage is, for assistive technology (the canvas is never the only source of information). */
  stageLabel: Trilingual
}

export const experimentText: Record<LabId, ExperimentText> = {
  'particle-universe': {
    description: tri(
      'Mélységi rétegekbe rendezett részecskefelhő, amelynek saját viselkedése van. A pointer vonzza vagy taszítja a részecskéket, folyadékszerű áramlást húz át rajtuk, a kattintás pedig szétveti a szerkezetet, amely aztán lassan újra felveszi az alakját.',
      'A depth-layered cloud of particles with a behaviour of its own. Your pointer pulls them in or pushes them away and drags a fluid current through them; a click blasts the structure apart before it slowly finds its shape again.',
      'Een wolk van deeltjes in dieptelagen met een eigen gedrag. Je aanwijzer trekt ze aan of duwt ze weg en sleurt er een vloeibare stroming doorheen; een klik blaast de structuur uiteen voordat die langzaam weer haar vorm vindt.',
    ),
    interactions: [
      tri(
        'Mozgasd a pointert: vonzás vagy taszítás',
        'Move the pointer to attract or repel',
        'Beweeg de aanwijzer om aan te trekken of af te stoten',
      ),
      tri(
        'Kattints vagy koppints: a szerkezet szétrobban',
        'Click or tap to blast the structure apart',
        'Klik of tik om de structuur uiteen te blazen',
      ),
      tri(
        'Válassz alakzatot, és nézd, ahogy újra összeállnak',
        'Pick a shape and watch them re-form',
        'Kies een vorm en kijk hoe ze zich hervormen',
      ),
      tri(
        'Sűrűség és erősség élőben állítható',
        'Density and strength change live',
        'Dichtheid en kracht pas je live aan',
      ),
    ],
    hint: tri(
      'Mozogj a részecskék között. Kattints a szétlöveléshez.',
      'Move through the particles. Click to blast them.',
      'Beweeg door de deeltjes. Klik om ze uiteen te blazen.',
    ),
    hintTouch: tri(
      'Húzd az ujjad a részecskék között. Koppints a szétlöveléshez.',
      'Drag through the particles. Tap to blast them.',
      'Sleep door de deeltjes. Tik om ze uiteen te blazen.',
    ),
    stageLabel: tri(
      'Interaktív részecskerendszer. A pointer vagy a nyílbillentyűk mozgatják, az Enter vagy a szóköz szétszórja a részecskéket.',
      'An interactive particle system. The pointer or the arrow keys move it; Enter or Space scatter the particles.',
      'Een interactief deeltjessysteem. De aanwijzer of de pijltjestoetsen bewegen het; Enter of spatie verstrooit de deeltjes.',
    ),
  },
  'liquid-matter': {
    description: tri(
      'Egy forma, négy anyagállapot. A felületet a vertex shader deformálja, procedurális stúdiófény világítja meg, és anyagváltáskor újraárnyékolódik: nem színcsere, hanem más fényviselkedés, más viszkozitás és más lüktetés.',
      'One form, four states of matter. The surface is displaced in the vertex shader, lit by a procedural studio and re-shaded when you switch material: not a colour swap, but different light behaviour, a different viscosity and a different pulse.',
      'Eén vorm, vier toestanden. Het oppervlak wordt in de vertex-shader vervormd, belicht door een procedurele studio en opnieuw geschaduwd als je van materiaal wisselt: geen kleurwissel, maar ander lichtgedrag, een andere viscositeit en een andere puls.',
    ),
    interactions: [
      tri(
        'Mozgasd a pointert a formán: horpad és hullámzik',
        'Move over the form to dent and ripple it',
        'Beweeg over de vorm om hem te deuken en te laten golven',
      ),
      tri(
        'A pointer a fény irányát is vezeti',
        'The pointer steers the light as well',
        'De aanwijzer stuurt ook het licht',
      ),
      tri(
        'Kattintás: lecsengő deformációs impulzus',
        'Click for a deformation pulse that fades away',
        'Klik voor een vervormingspuls die wegebt',
      ),
      tri(
        'Húzással forgatható, négy anyag között váltasz',
        'Drag to turn it; switch between four materials',
        'Sleep om te draaien; wissel tussen vier materialen',
      ),
    ],
    hint: tri(
      'Mozgasd a pointert a formán. Kattints egy impulzushoz.',
      'Move over the form. Click for a pulse.',
      'Beweeg over de vorm. Klik voor een puls.',
    ),
    hintTouch: tri(
      'Húzd az ujjad a formán. Koppints egy impulzushoz.',
      'Drag over the form. Tap for a pulse.',
      'Sleep over de vorm. Tik voor een puls.',
    ),
    stageLabel: tri(
      'Interaktív, folyékony 3D forma. A pointer vagy a nyílbillentyűk deformálják, az Enter vagy a szóköz impulzust indít.',
      'An interactive, liquid 3D form. The pointer or the arrow keys deform it; Enter or Space send a pulse.',
      'Een interactieve, vloeibare 3D-vorm. De aanwijzer of de pijltjestoetsen vervormen hem; Enter of spatie stuurt een puls.',
    ),
  },
  'type-in-motion': {
    description: tri(
      'Minden betű valódi mélységű rétegek halmaza. A pointer felé dőlnek, lencse alatt hajlanak, rétegeikre bomlanak, majd visszaesnek a helyükre, miközben a mondat végig olvasható marad.',
      'Every letter is a stack of layers with real depth. They tilt towards your pointer, bend under a lens, break apart into their layers and fall back into place, while the sentence stays readable.',
      'Elke letter is een stapel lagen met echte diepte. Ze kantelen naar je aanwijzer, buigen onder een lens, vallen uiteen in hun lagen en vallen weer op hun plaats, terwijl de zin leesbaar blijft.',
    ),
    interactions: [
      tri(
        'Mozgasd a pointert: a közeli betűk megdőlnek és hajlanak',
        'Move to tilt and bend nearby letters',
        'Beweeg om nabije letters te laten kantelen en buigen',
      ),
      tri('Kattintás: a betűk szétszóródnak', 'Click to scatter the letters', 'Klik om de letters te verstrooien'),
      tri(
        'Bontsd rétegekre, majd állítsd vissza',
        'Break apart into layers, then reassemble',
        'Laat uiteenvallen in lagen en zet weer in elkaar',
      ),
      tri('Három mondat között váltasz', 'Switch between three sentences', 'Wissel tussen drie zinnen'),
    ],
    hint: tri(
      'Mozgasd a pointert a betűk fölött. Kattints a szétszóráshoz.',
      'Move over the letters. Click to scatter them.',
      'Beweeg over de letters. Klik om ze te verstrooien.',
    ),
    hintTouch: tri(
      'Húzd az ujjad a betűk fölött. Koppints a szétszóráshoz.',
      'Drag over the letters. Tap to scatter them.',
      'Sleep over de letters. Tik om ze te verstrooien.',
    ),
    stageLabel: tri(
      'Interaktív tipográfiai installáció. A kiválasztott mondat szövege a gombok mellett olvasható; a pointer vagy a nyílbillentyűk mozgatják a betűket.',
      'An interactive typographic installation. The chosen sentence is also given as text beside the buttons; the pointer or the arrow keys move the letters.',
      'Een interactieve typografische installatie. De gekozen zin staat ook als tekst bij de knoppen; de aanwijzer of de pijltjestoetsen bewegen de letters.',
    ),
  },
  'infinite-space': {
    description: tri(
      'Perspektivikus tér, amelyet te irányítasz. A pointer iránya fordítja a nézőpontot, a mozgás sebessége nyújtja a fénycsíkokat, a kattintás pedig impulzust indít az alagútban. Semmi nem vezet végig: te döntöd el, merre tart a tér.',
      'A perspective space you steer yourself. The pointer’s direction swings the view, its speed stretches the light streaks and a click sends a pulse down the tunnel. Nothing guides you: you decide where the space goes.',
      'Een perspectiefruimte die je zelf bestuurt. De richting van je aanwijzer draait het beeld, zijn snelheid rekt de lichtstrepen en een klik stuurt een puls door de tunnel. Niets leidt je: jij bepaalt waarheen de ruimte gaat.',
    ),
    interactions: [
      tri(
        'Mozgasd a pointert: a nézőpont követi',
        'Move the pointer to turn the view',
        'Beweeg de aanwijzer om het beeld te draaien',
      ),
      tri(
        'Gyorsabb mozgás: hosszabb, fényesebb csíkok',
        'Move faster for longer, brighter streaks',
        'Sneller bewegen geeft langere, helderdere strepen',
      ),
      tri(
        'Kattintás: impulzus fut végig az alagúton',
        'Click to send a pulse down the tunnel',
        'Klik om een puls door de tunnel te sturen',
      ),
      tri(
        'A nyílbillentyűk egér nélkül is kormányoznak',
        'Arrow keys steer without a mouse',
        'Met de pijltjestoetsen stuur je zonder muis',
      ),
    ],
    hint: tri(
      'Mozgasd a pointert a nézőpont fordításához. Kattints egy impulzushoz.',
      'Move the pointer to turn the view. Click for a pulse.',
      'Beweeg de aanwijzer om het beeld te draaien. Klik voor een puls.',
    ),
    hintTouch: tri(
      'Húzd az ujjad a nézőpont fordításához. Koppints egy impulzushoz.',
      'Drag to turn the view. Tap for a pulse.',
      'Sleep om het beeld te draaien. Tik voor een puls.',
    ),
    stageLabel: tri(
      'Interaktív, végtelen perspektivikus tér. A pointer vagy a nyílbillentyűk fordítják a nézőpontot, az Enter vagy a szóköz impulzust indít.',
      'An interactive, endless perspective space. The pointer or the arrow keys turn the view; Enter or Space send a pulse.',
      'Een interactieve, eindeloze perspectiefruimte. De aanwijzer of de pijltjestoetsen draaien het beeld; Enter of spatie stuurt een puls.',
    ),
  },
  'chromatic-distortion': {
    description: tri(
      'A vörös, a zöld és a kék csatorna külön rajzolódik, és ott tolódik el, ahol mozogsz. A formák színrétegekre válnak, a háttér hullámzik, a pointer körül pedig lokális kromatikus aberráció lencséje alakul ki. Az effektus finom és kontrollált, soha nem villog.',
      'Red, green and blue are drawn separately and drift apart where you move. Forms split into colour layers, the background ripples and the pointer carries a local lens of chromatic aberration. The effect is smooth and controlled, never flickering.',
      'Rood, groen en blauw worden apart getekend en schuiven uiteen waar je beweegt. Vormen splitsen in kleurlagen, de achtergrond golft en je aanwijzer draagt een lokale lens van chromatische aberratie. Het effect is soepel en beheerst en flikkert nooit.',
    ),
    interactions: [
      tri(
        'Mozgás közben a színcsatornák szétcsúsznak',
        'Move to separate the colour channels',
        'Beweeg om de kleurkanalen te scheiden',
      ),
      tri(
        'A pointer körül helyi lencse alakul ki',
        'A local lens follows the pointer',
        'Een lokale lens volgt de aanwijzer',
      ),
      tri(
        'Kattintás: rövid, sima felerősödés',
        'Click for a short, smooth surge',
        'Klik voor een korte, zachte versterking',
      ),
      tri(
        'Az eltolás, a hullámok és a lencse méretre állítható',
        'Tune separation, waves and lens size',
        'Stel scheiding, golven en lensgrootte af',
      ),
    ],
    hint: tri(
      'Mozogj a színek között. Kattints egy felerősödéshez.',
      'Move through the colours. Click for a surge.',
      'Beweeg door de kleuren. Klik voor een versterking.',
    ),
    hintTouch: tri(
      'Húzd az ujjad a színek között. Koppints egy felerősödéshez.',
      'Drag through the colours. Tap for a surge.',
      'Sleep door de kleuren. Tik voor een versterking.',
    ),
    stageLabel: tri(
      'Interaktív kromatikus torzulás. A pointer vagy a nyílbillentyűk mozgatják a lencsét, az Enter vagy a szóköz felerősíti az effektust.',
      'An interactive chromatic distortion. The pointer or the arrow keys move the lens; Enter or Space strengthen the effect.',
      'Een interactieve chromatische vervorming. De aanwijzer of de pijltjestoetsen bewegen de lens; Enter of spatie versterkt het effect.',
    ),
  },
}

/** Words shared by every part of the Lab. */
export const labText = {
  /** The Lab's own signature line; deliberately not translated. */
  signature: 'MOVE. DISTORT. EXPLORE.',

  meta: labMeta,

  exit: {
    title: tri('Vissza a valóságba.', 'Back to reality.', 'Terug naar de realiteit.'),
    text: tri(
      'A Lab a kísérletezésé. A munkáim és a szolgáltatásaim ott várnak, ahol a gyakorlati dolgok vannak.',
      'The Lab is for experiments. My work and my services are waiting where the practical things are.',
      'Het Lab is voor experimenten. Mijn werk en mijn diensten wachten waar de praktische dingen zijn.',
    ),
    work: tri('Munkáim', 'My work', 'Mijn werk'),
    contact: tri('Beszéljünk', 'Let’s talk', 'Laten we praten'),
  },

  nav: {
    label: tri('Lab navigáció', 'Lab navigation', 'Lab-navigatie'),
    exit: tri('Kilépés a portfólióba', 'Leave the Lab for the portfolio', 'Het Lab verlaten voor het portfolio'),
    exitShort: tri('Portfólió', 'Portfolio', 'Portfolio'),
    overview: tri('Összes kísérlet', 'All experiments', 'Alle experimenten'),
    overviewShort: tri('Kísérletek', 'Experiments', 'Experimenten'),
    experimentOf: tri(
      '{current}. kísérlet, összesen {total}',
      'Experiment {current} of {total}',
      'Experiment {current} van {total}',
    ),
    previous: tri('Előző kísérlet', 'Previous experiment', 'Vorig experiment'),
    next: tri('Következő kísérlet', 'Next experiment', 'Volgend experiment'),
    position: tri('{current} / {total}', '{current} / {total}', '{current} / {total}'),
    details: tri('Részletek', 'Details', 'Details'),
    lab: tri('Lab', 'Lab', 'Lab'),
  },

  panel: {
    controls: tri('Vezérlők', 'Controls', 'Bediening'),
    show: tri('Vezérlők megjelenítése', 'Show the controls', 'Bediening tonen'),
    hide: tri('Vezérlők elrejtése', 'Hide the controls', 'Bediening verbergen'),
    reset: tri('Alaphelyzet', 'Reset', 'Herstellen'),
  },

  view: {
    label: tri('Megjelenítés', 'Display', 'Weergave'),
    live: tri('Élő', 'Live', 'Live'),
    calm: tri('Nyugodt', 'Calm', 'Rustig'),
    still: tri('Állókép', 'Still', 'Statisch'),
    liveHelp: tri(
      'Teljes mozgás és minden effekt',
      'Full motion and every effect',
      'Volledige beweging en alle effecten',
    ),
    calmHelp: tri(
      'Kisebb mozgás, nincs önálló animáció',
      'Gentler motion, no animation of its own',
      'Rustiger beweging, geen eigen animatie',
    ),
    stillHelp: tri(
      'Nincs 3D: csak állókép és szöveg',
      'No 3D: a still image and text only',
      'Geen 3D: alleen een stilstaand beeld en tekst',
    ),
  },

  notices: {
    noWebgl: tri(
      'A böngésződ nem tud WebGL 2-t futtatni, ezért a kísérlet állóképként látszik. Az oldal többi része a szokásos módon működik.',
      'Your browser cannot run WebGL 2, so the experiment is shown as a still image. The rest of the page works as usual.',
      'Je browser kan geen WebGL 2 draaien, dus het experiment verschijnt als stilstaand beeld. De rest van de pagina werkt zoals gewoonlijk.',
    ),
    failed: tri(
      'Az élő nézet leállt, mert nem tudott egyenletes képfrissítést tartani, vagy elveszett a grafikus környezet. Az állókép megmarad.',
      'The live view stopped because it could not hold a steady frame rate or lost its graphics context. The still image stays.',
      'De live weergave is gestopt omdat hij geen vlotte beeldsnelheid kon halen of de grafische context verloor. Het stilstaande beeld blijft.',
    ),
    still: tri(
      'Állókép. Válts „Élő” vagy „Nyugodt” nézetre, hogy mozgasd.',
      'Still view. Switch to Live or Calm to move it.',
      'Stilstaand beeld. Kies Live of Rustig om het te bewegen.',
    ),
    calm: tri(
      'Nyugodt nézet: a rendszer csökkentett mozgást kér, ezért a kísérlet csak a te mozdulataidra reagál, finoman.',
      'Calm view: your system asks for reduced motion, so the experiment only answers your own movements, gently.',
      'Rustige weergave: je systeem vraagt om minder beweging, dus het experiment antwoordt alleen op je eigen bewegingen, zachtjes.',
    ),
    loading: tri('Az élő nézet betöltése…', 'Loading the live view…', 'De live weergave wordt geladen…'),
    contextLost: tri(
      'A grafikus környezet átmenetileg elveszett. Visszaállítás…',
      'The graphics context was lost for a moment. Restoring…',
      'De grafische context ging even verloren. Herstellen…',
    ),
    tryLive: tri('Élő nézet újra', 'Try the live view again', 'Live weergave opnieuw proberen'),
  },

  experience: {
    settings: tri('Beállítások', 'Settings', 'Instellingen'),
    menu: tri('Menü', 'Menu', 'Menu'),
    close: tri('Bezárás', 'Close', 'Sluiten'),
    qualityLabel: tri('Grafikai minőség', 'Graphics quality', 'Grafische kwaliteit'),
    quality: {
      auto: tri('Automatikus', 'Automatic', 'Automatisch'),
      high: tri('Magas', 'High', 'Hoog'),
      balanced: tri('Kiegyensúlyozott', 'Balanced', 'Gebalanceerd'),
      performance: tri('Teljesítmény', 'Performance', 'Prestaties'),
    },
    qualityHelp: tri(
      'Az automatikus beállítás az eszközödhöz igazodik, és magától csökkent, ha a képfrissítés lassul.',
      'Automatic follows your device and lowers itself when the frame rate drops.',
      'Automatisch past zich aan je apparaat aan en gaat zelf omlaag als de beeldsnelheid zakt.',
    ),
    qualityNow: tri('Most: {name}', 'Now: {name}', 'Nu: {name}'),
    noWebglTitle: tri(
      'A 3D nézet itt nem érhető el',
      'The 3D view is not available here',
      'De 3D-weergave is hier niet beschikbaar',
    ),
    noWebglText: tri(
      'Ez a böngésző nem tud WebGL 2-t futtatni, ezért ez az élmény itt nem indulhat el. A Lab többi része (a kísérletek és a leírások) továbbra is használható.',
      'This browser cannot run WebGL 2, so this experience cannot start here. The rest of the Lab, the experiments and the descriptions, still works.',
      'Deze browser kan geen WebGL 2 draaien, dus deze ervaring kan hier niet starten. De rest van het Lab, de experimenten en de beschrijvingen, werkt nog.',
    ),
    failedTitle: tri('Az élő nézet leállt', 'The live view stopped', 'De live weergave is gestopt'),
    failedText: tri(
      'A 3D nézet nem tudott egyenletes képfrissítést tartani, vagy elveszett a grafikus környezet. Próbáld újra, vagy válassz alacsonyabb grafikai minőséget.',
      'The 3D view could not hold a steady frame rate or lost its graphics context. Try again, or choose a lower graphics quality.',
      'De 3D-weergave kon geen vlotte beeldsnelheid halen of verloor de grafische context. Probeer opnieuw of kies een lagere grafische kwaliteit.',
    ),
    retry: tri('Újrapróbálom', 'Try again', 'Opnieuw proberen'),
    backToLab: tri('Vissza a Labhoz', 'Back to the Lab', 'Terug naar het Lab'),
    loading: tri('Betöltés…', 'Loading…', 'Laden…'),
    reducedMotion: tri(
      'Csökkentett mozgás: a nézet csak a te műveleteidre frissül, a kameramozgások finomabbak.',
      'Reduced motion: the view redraws only when you act, and camera movements are gentler.',
      'Verminderde beweging: het beeld ververst alleen als jij iets doet en cameraverplaatsingen zijn rustiger.',
    ),
  },

  crash: {
    title: tri(
      'Ez a kísérlet nem tudott elindulni.',
      'This experiment could not start.',
      'Dit experiment kon niet starten.',
    ),
    text: tri(
      'Valami hiba történt a betöltésekor. A Lab többi része működik.',
      'Something went wrong while loading it. The rest of the Lab works.',
      'Er ging iets mis bij het laden. De rest van het Lab werkt.',
    ),
    back: tri('Vissza a kísérletekhez', 'Back to the experiments', 'Terug naar de experimenten'),
  },

  details: {
    title: tri('A kísérletről', 'About this experiment', 'Over dit experiment'),
    status: tri('Állapot', 'Status', 'Status'),
    technology: tri('Technológia', 'Technology', 'Technologie'),
    interaction: tri('Interakció', 'Interaction', 'Interactie'),
    more: tri('További kísérletek', 'More experiments', 'Meer experimenten'),
    keyboard: tri(
      'Billentyűzet: a Tab a vezérlők között léptet, a nyílbillentyűk a színpadon mozgatják a pointert, az Enter vagy a szóköz kattintást helyettesít.',
      'Keyboard: Tab moves between the controls, the arrow keys move the pointer on the stage, Enter or Space stand in for a click.',
      'Toetsenbord: Tab gaat langs de bediening, de pijltjestoetsen bewegen de aanwijzer op het podium, Enter of spatie vervangt een klik.',
    ),
  },
} as const

export type LabText = typeof labText
