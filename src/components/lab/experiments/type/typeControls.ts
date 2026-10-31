import { tri } from '../../../../content/trilingual'

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface TypeControls {
  /** Index into PHRASES. */
  phrase: number
  /** 0..1: how deep each letter is. */
  depth: number
  /** 0..1.5: how hard the pointer bends, tilts and lifts the letters. */
  distortion: number
  /** The letters are broken apart into their layers. */
  broken: boolean
  /** Bumped by the panel to scatter the letters, or to reset. */
  scatterVersion: number
  resetVersion: number
}

export const TYPE_DEFAULTS: Readonly<TypeControls> = {
  phrase: 0,
  depth: 0.55,
  distortion: 1,
  broken: false,
  scatterVersion: 0,
  resetVersion: 0,
}

export const typeText = {
  phrase: tri('Mondat', 'Sentence', 'Zin'),
  depth: tri('Mélység', 'Depth', 'Diepte'),
  distortion: tri('Torzítás', 'Distortion', 'Vervorming'),
  breakApart: tri('Bontás rétegekre', 'Break apart', 'Uiteenvallen'),
  reassemble: tri('Összerakás', 'Reassemble', 'Weer in elkaar'),
  scatter: tri('Szétszórás', 'Scatter', 'Verstrooien'),
  readAs: tri('A mondat: {text}', 'The sentence: {text}', 'De zin: {text}'),
} as const
