import type { LabId } from './lab'
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
  'generative-objects': {
    description: tri(
      'Egy kis generátor absztrakt 3D objektumokhoz. Válassz formacsaládot, alakítsd összetettséggel, mélységgel, torzulással és szimmetriával, válassz anyagot és palettát, majd dobj egy magot egy új formához. Ugyanaz a mag mindig ugyanazt az objektumot adja, a geometria pedig a helyén épül újra, így nem halmozódik memória.',
      'A small generator for abstract 3D objects. Pick a family, shape it with complexity, depth, distortion and symmetry, choose a material and a palette, and roll a seed for a new form. The same seed always makes the same object, and the geometry is rebuilt in place, so no memory piles up.',
      'Een kleine generator voor abstracte 3D-objecten. Kies een familie, vorm hem met complexiteit, diepte, vervorming en symmetrie, kies materiaal en palet en gooi een seed voor een nieuwe vorm. Dezelfde seed maakt altijd hetzelfde object en de geometrie wordt ter plekke herbouwd, zodat er geen geheugen ophoopt.',
    ),
    interactions: [
      tri(
        'Nyolc paraméter, mind élőben állítható',
        'Eight parameters, all adjustable live',
        'Acht parameters, allemaal live aan te passen',
      ),
      tri(
        'Új forma egy magból, ugyanaz a mag ugyanazt adja',
        'A new form from a seed; the same seed gives the same form',
        'Een nieuwe vorm uit een seed; dezelfde seed geeft dezelfde vorm',
      ),
      tri('Legfeljebb hat kedvenc elmenthető', 'Keep up to six favourites', 'Bewaar maximaal zes favorieten'),
      tri(
        'Teljes nézet a kezelőfelület nélkül',
        'A full view without the interface',
        'Een volledig beeld zonder interface',
      ),
    ],
    hint: tri(
      'Húzd a formát a forgatáshoz. Dobj új magot a Generálás gombbal.',
      'Drag the form to turn it. Roll a new seed with Generate.',
      'Sleep de vorm om te draaien. Gooi een nieuwe seed met Genereren.',
    ),
    hintTouch: tri(
      'Húzd a formát a forgatáshoz. Dobj új magot a Generálás gombbal.',
      'Drag the form to turn it. Roll a new seed with Generate.',
      'Sleep de vorm om te draaien. Gooi een nieuwe seed met Genereren.',
    ),
    stageLabel: tri(
      'Konfigurálható 3D objektumgenerátor. A forma húzással vagy a nyílbillentyűkkel forgatható, a paraméterek a vezérlőpanelen állíthatók.',
      'A configurable 3D object generator. Turn the form by dragging or with the arrow keys; set the parameters in the control panel.',
      'Een configureerbare 3D-objectgenerator. Draai de vorm door te slepen of met de pijltjestoetsen; stel de parameters in het bedieningspaneel in.',
    ),
  },
  'model-studio': {
    description: tri(
      'Hozz létre alakzatokat, mozgasd, forgasd és méretezd őket, adj nekik anyagot, állítsd be a fényeket, majd mentsd el a jelenetet, exportáld GLB-ként, vagy készíts képernyőképet. Egérrel, érintéssel és billentyűzettel is használható; mobilon külön transzformációs panel dolgozik.',
      'Create shapes, move, rotate and scale them, give them materials, light the scene, then save it, export it as GLB or take a screenshot. It works with a mouse, a finger or a keyboard; on a phone a separate transform panel does the work.',
      'Maak vormen, verplaats, draai en schaal ze, geef ze materiaal, belicht de scène en bewaar die, exporteer hem als GLB of maak een schermafbeelding. Het werkt met muis, vinger of toetsenbord; op een telefoon doet een apart transformatiepaneel het werk.',
    ),
    interactions: [
      tri(
        'Hét alakzat, köztük egy paraméteres egyedi forma',
        'Seven shapes, one of them a parametric custom form',
        'Zeven vormen, waarvan één parametrische eigen vorm',
      ),
      tri(
        'Mozgatás, forgatás és méretezés pontos tengelyek mentén',
        'Move, rotate and scale along exact axes',
        'Verplaatsen, draaien en schalen langs exacte assen',
      ),
      tri(
        'Hét anyag és öt fénybeállítás',
        'Seven materials and five lighting rigs',
        'Zeven materialen en vijf lichtopstellingen',
      ),
      tri(
        'Mentés, visszatöltés, GLB-export és képernyőkép',
        'Save, reload, GLB export and screenshot',
        'Bewaren, terugladen, GLB-export en schermafbeelding',
      ),
    ],
    hint: tri(
      'Adj hozzá egy alakzatot, és húzd a fogantyúit. Az üres helyen húzva forgathatod a nézetet.',
      'Add a shape, then drag its handles. Drag empty space to orbit.',
      'Voeg een vorm toe en sleep aan de handvatten. Sleep over lege ruimte om te draaien.',
    ),
    hintTouch: tri(
      'Adj hozzá egy alakzatot. Az üres helyen húzva forgatsz, két ujjal nagyítasz.',
      'Add a shape. Drag empty space to orbit, pinch to zoom.',
      'Voeg een vorm toe. Sleep over lege ruimte om te draaien, knijp om te zoomen.',
    ),
    stageLabel: tri(
      'Interaktív 3D nézet. Az objektumokat a panelekkel hozod létre és módosítod; billentyűzettel a nézetre lépve a nyílbillentyűk forgatnak, a + és a − nagyít, a pontos értékeket a transzformációs panel adja.',
      'An interactive 3D viewport. Create and change objects with the panels; with a keyboard, Tab to the viewport: the arrow keys orbit, + and − zoom, and the transform panel gives exact values.',
      'Een interactieve 3D-weergave. Maak en wijzig objecten met de panelen; met een toetsenbord ga je met Tab naar de weergave: de pijltjestoetsen draaien, + en − zoomen en het transformatiepaneel geeft exacte waarden.',
    ),
  },
  racing: {
    description: tri(
      'Valóban vezethető arcade-szimulátor: a gyorsulás, a fékezés, a kormányzás, a tapadás és a súlyáthelyeződés számított, nem lejátszott. Időmérő és szabad gyakorlás, három kamera, és a saját pályád ugyanitt vezethető. Billentyűzettel vagy érintőgombokkal.',
      'A drivable arcade simulator: acceleration, braking, steering, grip and weight transfer are calculated, not played back. Time Trial and free Practice, three cameras, and your own track from the Track Architect drives here too. With a keyboard or touch pads.',
      'Een bestuurbare arcadesimulator: acceleratie, remmen, sturen, grip en gewichtsverplaatsing worden berekend, niet afgespeeld. Tijdrit en vrij oefenen, drie camera’s, en je eigen baan uit de Track Architect rijdt hier ook. Met een toetsenbord of aanraakknoppen.',
    ),
    interactions: [
      tri(
        'W A S D vagy nyilak: gyorsítás, fékezés, kormányzás',
        'W A S D or arrows: accelerate, brake, steer',
        'W A S D of pijltjes: gas, rem, sturen',
      ),
      tri(
        'Három kamera, kézifék és újraindítás',
        'Three cameras, handbrake and reset',
        'Drie camera’s, handrem en reset',
      ),
      tri(
        'Időmérő: köridő, szakaszidők, legjobb kör',
        'Time Trial: lap time, sector checks, best lap',
        'Tijdrit: rondetijd, sectorcontroles, beste ronde',
      ),
      tri(
        'Mobilon nagy érintőgombok; a saját pályád és a Performance Lab beállításai itt futnak',
        'Big touch pads on a phone; your own track and the Performance Lab setup run here',
        'Grote aanraakknoppen op een telefoon; je eigen baan en de Performance Lab-setup rijden hier',
      ),
    ],
    hint: tri(
      'W A S D vagy a nyilak a vezetéshez. C: kamera, R: újraindítás.',
      'W A S D or the arrow keys to drive. C changes the camera, R resets.',
      'W A S D of de pijltjestoetsen om te rijden. C wisselt de camera, R reset.',
    ),
    hintTouch: tri(
      'Balra kormányzás, jobbra gáz és fék. A kamera gombja váltja a nézetet.',
      'Steer on the left, throttle and brake on the right. The camera button changes the view.',
      'Links sturen, rechts gas en rem. De camera-knop wisselt het beeld.',
    ),
    stageLabel: tri(
      'Vezethető 3D versenyautó. Billentyűzettel: W A S D vagy a nyilak, Space kézifék, C kamera, R újraindítás. Érintőképernyőn a képernyő alsó részén lévő gombok.',
      'A drivable 3D race car. Keyboard: W A S D or the arrows, Space handbrake, C camera, R reset. On a touch screen: the buttons at the bottom of the screen.',
      'Een bestuurbare 3D-raceauto. Toetsenbord: W A S D of de pijltjes, spatie handrem, C camera, R reset. Op een touchscreen: de knoppen onderaan het scherm.',
    ),
  },
  'track-architect': {
    description: tri(
      'Rajzold meg a pálya középvonalát felülnézetben: tegyél le pontokat, mozgasd őket, illessz be kanyarsablonokat, állítsd a szélességet és a szintkülönbséget, zárd le a kört. A szerkesztő folyamatosan ellenőrzi a pályát, és élőben építi belőle a 3D geometriát, amelyet a Racing Experience-ben azonnal ki is próbálhatsz.',
      'Draw the centreline of a circuit from above: place points, move them, insert corner templates, set width and elevation, close the loop. The editor checks the track as you go and builds its 3D geometry live, which you can drive at once in the Racing Experience.',
      'Teken de middellijn van een circuit van bovenaf: plaats punten, verplaats ze, voeg bochtsjablonen in, stel breedte en hoogte in en sluit de lus. De editor controleert de baan terwijl je werkt en bouwt er live 3D-geometrie van, die je meteen in de Racing Experience kunt rijden.',
    ),
    interactions: [
      tri(
        'Pontok lerakása, húzása, törlése; sima ívek',
        'Place, drag and delete points; smooth curves',
        'Punten plaatsen, slepen en verwijderen; vloeiende bochten',
      ),
      tri(
        'Egyenes, kanyar, hajtű, S-kanyar, emelkedő, lejtő sablonok',
        'Templates: straight, corners, hairpin, S-bend, climb, descent',
        'Sjablonen: rechte stukken, bochten, haarspeldbocht, S-bocht, klim, daling',
      ),
      tri(
        'Élő validáció: zártság, önmetszés, éles kanyar, szélesség',
        'Live validation: closed loop, self-overlap, sharp corners, width',
        'Live validatie: gesloten lus, zelfoverlap, scherpe bochten, breedte',
      ),
      tri(
        'Mentés, visszatöltés, JSON-export és azonnali kipróbálás',
        'Save, reload, JSON export and an instant test drive',
        'Bewaren, terugladen, JSON-export en meteen een proefrit',
      ),
    ],
    hint: tri(
      'Koppints a rajzterületre pont lerakásához, húzd a pontokat, vagy illessz be egy sablont.',
      'Click the map to place a point, drag points, or insert a template.',
      'Klik op de kaart om een punt te plaatsen, sleep punten of voeg een sjabloon in.',
    ),
    hintTouch: tri(
      'Koppints a térképre pont lerakásához, húzd a pontokat, vagy illessz be egy sablont.',
      'Tap the map to place a point, drag points, or insert a template.',
      'Tik op de kaart om een punt te plaatsen, sleep punten of voeg een sjabloon in.',
    ),
    stageLabel: tri(
      'Pályaszerkesztő felülnézeti térképpel és 3D előnézettel. A pontok billentyűzettel is kijelölhetők (Tab) és mozgathatók (nyilak), a Delete töröl.',
      'A track editor with a top-down map and a 3D preview. Points can be selected with the keyboard (Tab) and moved (arrow keys); Delete removes one.',
      'Een baaneditor met een kaart van bovenaf en een 3D-voorbeeld. Punten selecteer je met het toetsenbord (Tab) en verplaats je (pijltjestoetsen); Delete verwijdert er een.',
    ),
  },
  'performance-lab': {
    description: tri(
      'Állítsd a leszorítóerőt, a légellenállást, a felfüggesztést, a hasmagasságot, a fékeloszlást, az áttételt, a gumik tapadását és a tömeget, majd hasonlítsd össze az A és a B beállítást. A számok egy egyszerűsített tömegpontos köridő-szimulációból jönnek, nem mérésből; a légáramlás ábrája szemléltetés, nem CFD. A beállítás egy gombbal átkerül a Racing Experience-be.',
      'Set downforce, drag, suspension, ride height, brake balance, gearing, tyre grip and mass, then compare setup A with setup B. The numbers come from a simplified point-mass lap simulation, not from measurement; the airflow drawing is an illustration, not CFD. One button hands the setup to the Racing Experience.',
      'Stel downforce, luchtweerstand, vering, rijhoogte, remverdeling, overbrenging, bandengrip en massa in en vergelijk setup A met setup B. De getallen komen uit een vereenvoudigde puntmassa-rondesimulatie, niet uit metingen; de luchtstroomtekening is een illustratie, geen CFD. Eén knop geeft de setup door aan de Racing Experience.',
    ),
    interactions: [
      tri(
        'Nyolc korlátozott tartományú paraméter',
        'Eight parameters with sensible limits',
        'Acht parameters met zinnige grenzen',
      ),
      tri(
        'A és B beállítás: értékek, különbségek, becsült teljesítmény',
        'Setups A and B: values, differences, estimated performance',
        'Setups A en B: waarden, verschillen, geschatte prestaties',
      ),
      tri(
        'Szemléltető légáramlás, leszorítás és légellenállás jelzés',
        'Illustrative airflow, downforce and drag markers',
        'Illustratieve luchtstroom, downforce- en weerstandsmarkeringen',
      ),
      tri(
        'Kipróbálás a Racing Experience pályáján ugyanazzal a beállítással',
        'Test the setup on the Racing Experience circuit',
        'Test de setup op het circuit van de Racing Experience',
      ),
    ],
    hint: tri(
      'Állíts egy paramétert, és figyeld a számokat és az áramlást.',
      'Change a parameter and watch the numbers and the airflow.',
      'Wijzig een parameter en kijk naar de getallen en de luchtstroom.',
    ),
    hintTouch: tri(
      'Nyisd le a paramétereket, állíts egyet, és figyeld a számokat.',
      'Open the parameters, change one and watch the numbers.',
      'Open de parameters, wijzig er een en kijk naar de getallen.',
    ),
    stageLabel: tri(
      'Versenyautó 3D nézete szemléltető légáramlással. A beállítások és az eredmények a panelen szöveges, táblázatos formában is olvashatók.',
      'A 3D view of the race car with an illustrative airflow. The settings and the results are also given as text and tables in the panels.',
      'Een 3D-weergave van de raceauto met een illustratieve luchtstroom. De instellingen en resultaten staan ook als tekst en tabellen in de panelen.',
    ),
  },
  'generative-art': {
    description: tri(
      'Tízezernyi részecske egy alakzat körül, amelyet te formálsz: alakzat, léptékű torzítás, zaj, forgás, gravitáció, turbulencia és szín. A pointer eltaszítja vagy magához húzza őket, a kattintás szétrobbantja, a véletlen gomb új kompozíciót ad. Minden alkotás néhány számból áll, ezért elmentheted, letöltheted, képként exportálhatod.',
      'Tens of thousands of particles around a shape you form: the formation, distortion, noise, rotation, gravity, turbulence and colour. The pointer pushes or pulls them, a click blasts them apart, and the random button makes a new composition. Every piece is a handful of numbers, so you can keep it, download it or export it as an image.',
      'Tienduizenden deeltjes rond een vorm die je zelf vormgeeft: formatie, vervorming, ruis, rotatie, zwaartekracht, turbulentie en kleur. De aanwijzer duwt of trekt ze, een klik blaast ze uiteen en de willekeurknop maakt een nieuwe compositie. Elk werk bestaat uit een handvol getallen, dus je kunt het bewaren, downloaden of als beeld exporteren.',
    ),
    interactions: [
      tri(
        'Tizenegy paraméter: darabszám, sebesség, erő, gravitáció, turbulencia, torzítás, zaj, forgás, méret',
        'Eleven parameters: count, speed, force, gravity, turbulence, distortion, noise, rotation, scale',
        'Elf parameters: aantal, snelheid, kracht, zwaartekracht, turbulentie, vervorming, ruis, rotatie, schaal',
      ),
      tri(
        'A pointer taszít vagy vonz, a kattintás szétveti a részecskéket',
        'The pointer pushes or pulls, a click throws the particles apart',
        'De aanwijzer duwt of trekt, een klik gooit de deeltjes uiteen',
      ),
      tri(
        'Véletlen kompozíció, visszaállítás, öt színpaletta, hat alakzat',
        'Random composition, reset, five palettes, six formations',
        'Willekeurige compositie, reset, vijf paletten, zes formaties',
      ),
      tri(
        'PNG kép, JSON paraméterfájl és mentés a Digitális alkotások közé',
        'PNG image, a JSON parameter file and saving to Digital Artifacts',
        'PNG-beeld, een JSON-parameterbestand en opslaan bij Digitale creaties',
      ),
    ],
    hint: tri(
      'Mozgasd a pointert a részecskék között, kattints, vagy nyomd meg a Véletlen gombot.',
      'Move the pointer through the particles, click, or press Randomize.',
      'Beweeg de aanwijzer door de deeltjes, klik of druk op Willekeurig.',
    ),
    hintTouch: tri(
      'Húzd az ujjad a részecskék között, koppints, vagy nyomd meg a Véletlen gombot.',
      'Drag a finger through the particles, tap, or press Randomize.',
      'Sleep een vinger door de deeltjes, tik of druk op Willekeurig.',
    ),
    stageLabel: tri(
      'Interaktív generatív alkotás részecskékkel. A pointer vagy az ujjad hat rájuk; billentyűzettel a panel csúszkái és a Véletlen gomb változtatják a kompozíciót.',
      'An interactive generative artwork made of particles. The pointer or your finger acts on them; with a keyboard, the panel sliders and the Randomize button change the composition.',
      'Een interactief generatief kunstwerk van deeltjes. De aanwijzer of je vinger werkt erop in; met een toetsenbord veranderen de schuifregelaars en de knop Willekeurig de compositie.',
    ),
  },
  'sound-world': {
    description: tri(
      'Fényből épült világ, amely a hanggal mozog. A basszus kifelé tolja a középső formát, a spektrum egy részecskeburkot mozgat, a magas hangok két fényt gyújtanak, minden ütem egy fénygyűrűt indít, a hullámforma pedig körbe és alul látszik. Játszd le a beépített dalt, amelyet az oldal maga szintetizál, vagy hagyd, hogy a mikrofonodon át hallgasson: ez csak akkor történik meg, ha megerősíted, miután elolvastad, mit tesz. Semmit nem rögzít, nem ment és nem küld el.',
      'A world made of light that moves with sound. The bass pushes out a central form, the spectrum moves a shell of particles, the high notes switch on two lights, every beat sends out a ring of light, and the waveform is drawn round it and along its floor. Play the loop the page synthesises itself, or let it listen through your microphone: that only happens if you confirm, after reading what it does. Nothing is recorded, stored or sent.',
      'Een wereld van licht die met geluid beweegt. De bas duwt een centrale vorm naar buiten, het spectrum beweegt een schil van deeltjes, de hoge tonen schakelen twee lichten in, elke maat stuurt een lichtring uit en de golfvorm wordt eromheen en over de vloer getekend. Speel de loop die de pagina zelf synthetiseert, of laat hem luisteren via je microfoon: dat gebeurt alleen als je bevestigt, nadat je hebt gelezen wat het doet. Er wordt niets opgenomen, bewaard of verstuurd.',
    ),
    interactions: [
      tri(
        'Három forrás: néma előnézet, beépített hang, mikrofon (csak megerősítés után)',
        'Three sources: a silent preview, a built-in sound, the microphone (only after you confirm)',
        'Drie bronnen: een stille voorvertoning, een ingebouwd geluid, de microfoon (alleen na je bevestiging)',
      ),
      tri(
        'Basszus → forma, spektrum → részecskék, magas hangok → fények',
        'Bass → form, spectrum → particles, highs → lights',
        'Bas → vorm, spectrum → deeltjes, hoge tonen → licht',
      ),
      tri(
        'Tempó, hangerő, érzékenység, simítás és négy színpaletta',
        'Tempo, volume, sensitivity, smoothing and four palettes',
        'Tempo, volume, gevoeligheid, gladstrijken en vier paletten',
      ),
      tri(
        'Kattintás vagy koppintás: fényimpulzus. A hang soha nem kerül rögzítésre vagy elküldésre',
        'Click or tap for a pulse of light. Sound is never recorded or sent',
        'Klik of tik voor een lichtpuls. Geluid wordt nooit opgenomen of verstuurd',
      ),
    ],
    hint: tri(
      'Kattints a térre egy impulzusért. Indítsd el a néma előnézetet vagy a beépített hangot, hogy mozogjon.',
      'Click the space for a pulse. Run the silent preview or play the built-in sound to set it moving.',
      'Klik op de ruimte voor een puls. Start de stille voorvertoning of speel het ingebouwde geluid om hem te laten bewegen.',
    ),
    hintTouch: tri(
      'Koppints a térre egy impulzusért. Indítsd el a néma előnézetet vagy a beépített hangot, hogy mozogjon.',
      'Tap the space for a pulse. Run the silent preview or play the built-in sound to set it moving.',
      'Tik op de ruimte voor een puls. Start de stille voorvertoning of speel het ingebouwde geluid om hem te laten bewegen.',
    ),
    stageLabel: tri(
      'Hangra mozgó 3D világ: középen egy forma, körülötte részecskék és két fény, a hullámforma pedig körbe és alul húzódik. A hangforrást és a beállításokat a panel adja; a mikrofon csak a megerősítésed után kapcsol be.',
      'A 3D world that moves with sound: a form at the middle, particles and two lights round it, the waveform drawn round it and along the floor. The panel gives the sound source and the settings; the microphone only switches on after you confirm.',
      'Een 3D-wereld die met geluid beweegt: een vorm in het midden, deeltjes en twee lichten eromheen, de golfvorm eromheen en over de vloer. Het paneel geeft de geluidsbron en de instellingen; de microfoon gaat pas aan nadat je bevestigt.',
    ),
  },
}

/** Words shared by every part of the Lab. */
export const labText = {
  /** The Lab's own signature line; deliberately not translated. */
  signature: 'MOVE. DISTORT. EXPLORE.',

  hero: {
    eyebrow: tri(
      'Kísérleti digitális univerzum',
      'An experimental digital universe',
      'Een experimenteel digitaal universum',
    ),
    title: tri('Üdvözöllek a váratlan világban.', 'Welcome to the unexpected.', 'Welkom in het onverwachte.'),
    lead: tri(
      'Ahol a kód formává válik. A forma mozgássá. A mozgás pedig élménnyé.',
      'Where code becomes form. Form becomes motion. And motion becomes experience.',
      'Waar code vorm wordt. Vorm beweging. En beweging een ervaring.',
    ),
    cta: tri('Fedezd fel a kísérleteket', 'Explore the experiments', 'Ontdek de experimenten'),
    hint: tri(
      'Mozgasd a pointert egy zóna fölé, hogy felébredjen. Kattints a belépéshez.',
      'Move over a zone to wake it. Click to enter.',
      'Beweeg over een zone om hem wakker te maken. Klik om binnen te gaan.',
    ),
    hintTouch: tri(
      'Koppints egy zónára a kiválasztáshoz, még egyszer a belépéshez.',
      'Tap a zone to select it, tap again to enter.',
      'Tik op een zone om hem te kiezen, tik nog eens om binnen te gaan.',
    ),
    stageLabel: tri(
      'Interaktív 3D tér négy zónával: Model Studio, Racing Experience, Track Architect és Performance Lab. A pointer elfordítja a nézőpontot, a kattintás belép a zónába; a nyílbillentyűk és az Enter ugyanezt teszik. A tér alatti linkek ugyanoda visznek.',
      'An interactive 3D space with four zones: Model Studio, Racing Experience, Track Architect and Performance Lab. The pointer turns the view and a click enters a zone; the arrow keys and Enter do the same. The links under the space lead to the same places.',
      'Een interactieve 3D-ruimte met vier zones: Model Studio, Racing Experience, Track Architect en Performance Lab. De aanwijzer draait het beeld en een klik gaat een zone binnen; de pijltjestoetsen en Enter doen hetzelfde. De links onder de ruimte leiden naar dezelfde plekken.',
    ),
  },

  zones: {
    label: tri('A Lab négy zónája', 'The four zones of the Lab', 'De vier zones van het Lab'),
    enter: tri('Belépés', 'Enter', 'Betreden'),
    selected: tri(
      'Kiválasztva: {name}. Koppints még egyszer a belépéshez.',
      'Selected: {name}. Tap again to enter.',
      'Gekozen: {name}. Tik nog eens om binnen te gaan.',
    ),
    opening: tri('{name} megnyitása…', 'Opening {name}…', '{name} wordt geopend…'),
  },

  meta: {
    title: tri(
      'Lab: kísérleti digitális univerzum',
      'Lab: an experimental digital universe',
      'Lab: een experimenteel digitaal universum',
    ),
    description: tri(
      'Hat interaktív WebGL-kísérlet és hat teljes 3D élmény: modellezőstúdió, versenyautós vezetés, pályatervező, járműhangoló labor, generatív művészet és hangra reagáló világ.',
      'Six interactive WebGL experiments and six full 3D experiences: a modelling studio, a driving experience, a track designer, a car tuning lab, generative art and a world that moves with sound.',
      'Zes interactieve WebGL-experimenten en zes volledige 3D-ervaringen: een modelleerstudio, een rij-ervaring, een baanontwerper, een afstemlab voor auto’s, generatieve kunst en een wereld die met geluid beweegt.',
    ),
  },

  gallery: {
    title: tri('A kísérletek', 'The experiments', 'De experimenten'),
    intro: tri(
      'Hat önálló kísérlet. Mindegyik saját fényt, saját szabályokat és saját módot kapott arra, hogy válaszoljon neked. Alattuk hat teljes értékű élmény vár.',
      'Six separate experiments. Each has its own light, its own rules and its own way of answering you. Below them wait six full experiences.',
      'Zes afzonderlijke experimenten. Elk heeft zijn eigen licht, zijn eigen regels en zijn eigen manier om je te antwoorden. Daaronder wachten zes volledige ervaringen.',
    ),
    open: tri('Kísérlet megnyitása', 'Open the experiment', 'Experiment openen'),
    technology: tri('Technológia', 'Technology', 'Technologie'),
    interaction: tri('Interakció', 'Interaction', 'Interactie'),
    status: tri('Állapot', 'Status', 'Status'),
    listLabel: tri('Kísérletek listája', 'List of experiments', 'Lijst van experimenten'),
    experiencesTitle: tri('A hat élmény', 'The six experiences', 'De zes ervaringen'),
    experiencesIntro: tri(
      'Hat kis alkalmazás, nem csak látvány: modellezz, vezess, tervezz pályát, hangolj autót, alkoss generatív művészetet és játssz a hanggal. Néhány összekapcsolódik: a saját pályád és a hangolt autód a Racing Experience-ben fut.',
      'Six small applications, not only visuals: model, drive, design a circuit, tune a car, make generative art and play with sound. Some connect: your own track and your tuned car run in the Racing Experience.',
      'Zes kleine toepassingen, niet alleen beeld: modelleer, rijd, ontwerp een circuit, stem een auto af, maak generatieve kunst en speel met geluid. Sommige zijn gekoppeld: je eigen baan en afgestelde auto rijden in de Racing Experience.',
    ),
    noPage: tri('Még nincs megnyitható oldala', 'No page to open yet', 'Nog geen pagina om te openen'),
  },

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
    openIn: tri('Megnyitás: {name}', 'Open in {name}', 'Openen in {name}'),
    kindLabel: tri('Élmény', 'Experience', 'Ervaring'),
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
    more: tri('További kísérletek', 'More experiments', 'Meer experimenten'),
    keyboard: tri(
      'Billentyűzet: a Tab a vezérlők között léptet, a nyílbillentyűk a színpadon mozgatják a pointert, az Enter vagy a szóköz kattintást helyettesít.',
      'Keyboard: Tab moves between the controls, the arrow keys move the pointer on the stage, Enter or Space stand in for a click.',
      'Toetsenbord: Tab gaat langs de bediening, de pijltjestoetsen bewegen de aanwijzer op het podium, Enter of spatie vervangt een klik.',
    ),
  },
} as const

export type LabText = typeof labText
