import { tri } from '../../../../content/trilingual'
import type { Language } from '../../../../i18n/config'
import { EXAMPLES, randomIdea } from './ideas'
import { interpret, seedFromText, type Interpretation } from './interpret'
import { LIGHTS, MATERIALS, type LightId, type Look, type MaterialId } from './spec'

/**
 * Generative Objects is procedural and local. A written description is read by a fixed word list (`interpret`) into what the object is, a
 * small closed set of procedural parts builds it (`compose`) and a seeded random generator decides the details, so the same words always give
 * the same object. There is no AI model, no external service, no server and nothing leaves the device: this file and its neighbours import
 * none (a test keeps it that way).
 */

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface GenerativeControls {
  /** The description that was made into the object on show. */
  text: string
  made: Interpretation
  /** Decides the small choices of the build; the same words give the same seed. */
  seed: number
  /** Material, colour, size, light and spin, applied to the object without rebuilding it. */
  look: Look
  /** Bumped when the object has to be built again. */
  version: number
  /** Which of the examples the next "example" press shows. */
  example: number
}

/** The camera the page asks for; the scene fits the object to what it sees. Kept here so the page does not import the scene (which loads later, on its own). */
export const GENERATIVE_CAMERA = { fov: 38, position: [0, 0.3, 7] as [number, number, number] }

/** The look is bounded to what fits the stage at any size. */
export const SIZE_RANGE = { min: 0.5, max: 1.4 } as const

/** Builds what a description asks for: the object, its seed and the look its words suggest ("golden" asks for gold). */
export function makeFrom(text: string, current: GenerativeControls): GenerativeControls {
  const made = interpret(text)
  return {
    ...current,
    text: made.text,
    made,
    seed: seedFromText(made.text),
    look: { ...made.look, scale: Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, made.look.scale)) },
    version: current.version + 1,
  }
}

/** The start: the first example, in the visitor's language. */
export function startControls(language: Language): GenerativeControls {
  const base = { text: '', made: interpret(''), seed: 0, look: interpret('').look, version: 0, example: 0 }
  return makeFrom(EXAMPLES[0][language], base)
}

/** A description that was never written before: a random idea, built from the closed word list. */
export function surpriseText(language: Language): string {
  return randomIdea(null, language, Math.floor(Math.random() * 2 ** 31)).text
}

export const generativeText = {
  describe: tri('Írd le, mit építsünk', 'Describe what to build', 'Beschrijf wat er gebouwd moet worden'),
  placeholder: tri('pl. egy szomorú robot kalapban', 'for example a sad robot in a hat', 'bijvoorbeeld een droevige robot met een hoed'),
  help: tri(
    'Egy rögzített szólista olvassa el: mesterséges intelligencia nincs benne, és semmi nem megy ki az eszközödről.',
    'A fixed word list reads it: no AI is involved and nothing leaves your device.',
    'Een vaste woordenlijst leest het: er komt geen AI aan te pas en er verlaat niets je apparaat.',
  ),
  make: tri('Készítés', 'Make', 'Maken'),
  surprise: tri('Lepj meg', 'Surprise me', 'Verras me'),
  example: tri('Példa', 'Example', 'Voorbeeld'),
  vary: tri('Másik változat', 'Another version', 'Andere variant'),
  material: tri('Anyag', 'Material', 'Materiaal'),
  light: tri('Fény', 'Light', 'Licht'),
  size: tri('Méret', 'Size', 'Grootte'),
  spin: tri('Magától forog', 'Turns by itself', 'Draait vanzelf'),
  understood: tri('Értettem', 'Understood', 'Begrepen'),
  unknown: tri('Nem ismert szavak', 'Words not known', 'Onbekende woorden'),
  nothingKnown: tri(
    'Egyetlen ismert szót sem találtam, ezért kitalált lényt építettem.',
    'No known word was found, so a made-up creature was built.',
    'Er is geen bekend woord gevonden, dus er is een verzonnen wezen gebouwd.',
  ),
}

const MATERIAL_WORDS: Record<MaterialId, ReturnType<typeof tri>> = {
  natural: tri('Eredeti', 'Natural', 'Natuurlijk'),
  gold: tri('Arany', 'Gold', 'Goud'),
  chrome: tri('Króm', 'Chrome', 'Chroom'),
  glass: tri('Üveg', 'Glass', 'Glas'),
  matte: tri('Matt', 'Matte', 'Mat'),
  neon: tri('Neon', 'Neon', 'Neon'),
  candy: tri('Cukorka', 'Candy', 'Snoep'),
  wood: tri('Fa', 'Wood', 'Hout'),
}

const LIGHT_WORDS: Record<LightId, ReturnType<typeof tri>> = {
  studio: tri('Stúdió', 'Studio', 'Studio'),
  dramatic: tri('Drámai', 'Dramatic', 'Dramatisch'),
  neon: tri('Neon', 'Neon', 'Neon'),
  sunset: tri('Naplemente', 'Sunset', 'Zonsondergang'),
  moon: tri('Holdfény', 'Moonlight', 'Maanlicht'),
}

export const MATERIAL_NAMES = MATERIAL_WORDS
export const LIGHT_NAMES = LIGHT_WORDS
export const MATERIAL_IDS = MATERIALS
export const LIGHT_IDS = LIGHTS
