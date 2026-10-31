import { tri } from '../../../../content/trilingual'

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface ChromaticControls {
  /** 0..2: how far the channels drift apart. */
  separation: number
  /** 0..2: how much the background waves. */
  waves: number
  /** 0.15..0.9: the size of the lens around the pointer, in screen heights. */
  lens: number
  /** Bumped by the panel to start a surge, as a click does. */
  surgeVersion: number
}

export const CHROMATIC_DEFAULTS: Readonly<ChromaticControls> = { separation: 1, waves: 1, lens: 0.45, surgeVersion: 0 }

export const chromaticText = {
  separation: tri('Csatornák eltolása', 'Channel separation', 'Kanaalscheiding'),
  waves: tri('Háttérhullámok', 'Background waves', 'Achtergrondgolven'),
  lens: tri('Lencse mérete', 'Lens size', 'Lensgrootte'),
  surge: tri('Felerősítés', 'Surge', 'Versterking'),
} as const
