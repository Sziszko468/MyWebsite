import { tri } from '../../../../content/trilingual'

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface ChromaticControls {
  /** 0..2: how far the channels drift apart. */
  separation: number
  /** 0..2: how much the background waves. */
  waves: number
  /** 0.15..0.9: the size of the lens around the pointer, in screen heights. */
  lens: number
  /** 0..1: how often and how far horizontal slices of the picture slip sideways (a few times a second at most). */
  glitch: number
  /** 0..1: fine film grain over everything. */
  noise: number
  /** 0..360: the direction the red and blue channels are pulled in, in degrees. */
  angle: number
  /** Bumped by the panel to start a surge, as a click does. */
  surgeVersion: number
}

export const CHROMATIC_DEFAULTS: Readonly<ChromaticControls> = {
  separation: 1,
  waves: 1,
  lens: 0.45,
  glitch: 0,
  noise: 0,
  angle: 14,
  surgeVersion: 0,
}

export const chromaticText = {
  separation: tri('Csatornák eltolása', 'Channel separation', 'Kanaalscheiding'),
  waves: tri('Háttérhullámok', 'Background waves', 'Achtergrondgolven'),
  lens: tri('Lencse mérete', 'Lens size', 'Lensgrootte'),
  surge: tri('Felerősítés', 'Surge', 'Versterking'),
  glitch: tri('Glitch', 'Glitch', 'Glitch'),
  noise: tri('Zaj', 'Noise', 'Ruis'),
  angle: tri('Színeltolás iránya', 'Colour displacement direction', 'Richting van de kleurverschuiving'),
  randomise: tri('Véletlen', 'Randomise', 'Willekeurig'),
  glitchNote: tri(
    'A glitch csak vízszintes sávokat tol el, legfeljebb másodpercenként háromszor, és nem villan: csökkentett mozgás mellett kikapcsol.',
    'The glitch only slips horizontal slices, at most three times a second, and never flashes; under reduced motion it is off.',
    'De glitch verschuift alleen horizontale stroken, hooguit drie keer per seconde, en flitst nooit; bij verminderde beweging staat hij uit.',
  ),
} as const
