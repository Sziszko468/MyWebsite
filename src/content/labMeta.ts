import type { LabId } from './lab'
import { tri, type Trilingual } from './trilingual'

/**
 * What a search result, a browser tab and a shared link say about the Lab and each experiment. Kept apart from
 * the Lab's words (labText.ts) on purpose: the page frame reads these on every page of the site, and the Lab's
 * words are only loaded with the Lab. An experiment's line is one sentence of at most about 160 characters
 * (seo.test.ts keeps the length).
 */
export const labMeta = {
  title: tri(
    'Lab: kísérleti digitális játszótér',
    'Lab: an experimental digital playground',
    'Lab: een experimentele digitale speeltuin',
  ),
  description: tri(
    'Öt interaktív WebGL-élmény egy helyen: részecskék, folyékony anyag, mozgó tipográfia, végtelen tér és kromatikus torzítás.',
    'Five interactive WebGL experiences in one place: particles, liquid matter, kinetic type, endless space and chromatic distortion.',
    'Vijf interactieve WebGL-ervaringen op één plek: deeltjes, vloeibare materie, bewegende typografie, eindeloze ruimte en chromatische vervorming.',
  ),
}

export const experimentSummary: Record<LabId, Trilingual> = {
  'particle-universe': tri(
    'Mélységi rétegekbe rendezett WebGL-részecskefelhő: a pointer vonzza vagy taszítja, a kattintás szétveti, majd lassan újra összeáll.',
    'A depth-layered WebGL particle cloud: your pointer pulls or pushes the particles, and a click blasts the structure apart before it re-forms.',
    'Een WebGL-deeltjeswolk in dieptelagen: je aanwijzer trekt of duwt de deeltjes en een klik blaast de structuur uiteen voordat die zich herstelt.',
  ),
  'liquid-matter': tri(
    'Egy forma, négy anyagállapot: vertex shaderrel deformált felület, procedurális stúdiófény, és anyagváltáskor más viszkozitás és lüktetés.',
    'One form, four states of matter: a surface displaced in the vertex shader, lit by a procedural studio and re-shaded when you switch material.',
    'Één vorm, vier toestanden: een in de vertex-shader vervormd oppervlak, procedureel studiolicht en een nieuwe schaduwing bij elke materiaalwissel.',
  ),
  'type-in-motion': tri(
    'Minden betű valódi mélységű rétegek halmaza: a pointer felé dőlnek, lencse alatt hajlanak és rétegekre bomlanak, de a mondat olvasható marad.',
    'Every letter is a stack of layers with real depth: they tilt towards your pointer, bend under a lens and break apart, while the sentence stays readable.',
    'Elke letter is een stapel lagen met echte diepte: ze kantelen naar je aanwijzer, buigen onder een lens en vallen uiteen, terwijl de zin leesbaar blijft.',
  ),
  'infinite-space': tri(
    'Perspektivikus tér, amelyet te irányítasz: a pointer iránya fordítja a nézőpontot, a sebesség nyújtja a fénycsíkokat, a kattintás impulzust indít.',
    'A perspective space you steer yourself: the pointer swings the view, its speed stretches the light streaks and a click sends a pulse down the tunnel.',
    'Een perspectiefruimte die je zelf bestuurt: de aanwijzer draait het beeld, zijn snelheid rekt de lichtstrepen en een klik stuurt een puls door de tunnel.',
  ),
  'chromatic-distortion': tri(
    'A vörös, zöld és kék csatorna külön rajzolódik és eltolódik ott, ahol mozogsz; a pointer körül lokális kromatikus aberráció lencséje alakul ki.',
    'Red, green and blue are drawn separately and drift apart where you move; the pointer carries a local lens of chromatic aberration.',
    'Rood, groen en blauw worden apart getekend en schuiven uiteen waar je beweegt; je aanwijzer draagt een lokale lens van chromatische aberratie.',
  ),
}
