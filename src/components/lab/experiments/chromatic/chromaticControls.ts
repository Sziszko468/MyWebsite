import { tri } from '../../../../content/trilingual'

/**
 * How the channels are pulled apart:
 *  - `mixed`: a drift along the chosen direction and a lens around the pointer (the original look);
 *  - `linear`: every channel moves along the chosen direction only, with no lens, so the fringes are clean and parallel;
 *  - `radial`: the channels move outwards from the pointer, the direction is ignored.
 */
export const CHROMATIC_MODES = ['mixed', 'linear', 'radial'] as const
export type ChromaticMode = (typeof CHROMATIC_MODES)[number]

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface ChromaticControls {
  /** How the channels are pulled apart (see `CHROMATIC_MODES`). */
  mode: ChromaticMode
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
  mode: 'mixed',
  separation: 1,
  waves: 1,
  lens: 0.45,
  glitch: 0,
  noise: 0,
  angle: 14,
  surgeVersion: 0,
}

export const chromaticText = {
  mode: tri('Mód', 'Mode', 'Modus'),
  modes: {
    mixed: tri('Vegyes', 'Mixed', 'Gemengd'),
    linear: tri('Lineáris', 'Linear', 'Lineair'),
    radial: tri('Sugaras', 'Radial', 'Radiaal'),
  },
  modeHelp: {
    mixed: tri(
      'Eltolás a választott irányba, plusz egy lencse a pointer körül',
      'A drift in the chosen direction, plus a lens around the pointer',
      'Een verschuiving in de gekozen richting, plus een lens rond de aanwijzer',
    ),
    linear: tri(
      'Minden csatorna csak a választott irányba tolódik el, tiszta párhuzamos szegélyekkel',
      'Every channel moves only in the chosen direction, with clean parallel fringes',
      'Elk kanaal beweegt alleen in de gekozen richting, met zuivere parallelle randen',
    ),
    radial: tri(
      'A csatornák kifelé tolódnak a pointertől, az irány nem számít',
      'The channels move outwards from the pointer; the direction does not matter',
      'De kanalen bewegen naar buiten vanaf de aanwijzer; de richting doet er niet toe',
    ),
  },
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
