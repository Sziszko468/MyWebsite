import { tri } from '../../../../content/trilingual'
import type { ShapeId } from './particleShapes'

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export const PARTICLE_PALETTES = ['racing', 'cobalt', 'aurora', 'ember', 'mono'] as const
export type ParticlePalette = (typeof PARTICLE_PALETTES)[number]

/** The three colours of a palette: what a fast particle becomes, the far layers, and the resting colour. `racing` follows the theme. */
export const PALETTE_COLOURS: Record<Exclude<ParticlePalette, 'racing'>, { hot: number; cool: number; base: number }> = {
  cobalt: { hot: 0x7a98ff, cool: 0x1a2f9e, base: 0xcfe0ff },
  aurora: { hot: 0x4dffb0, cool: 0x7a3cff, base: 0xdff7f0 },
  ember: { hot: 0xffb347, cool: 0xff3d1f, base: 0xffe9c4 },
  mono: { hot: 0xffffff, cool: 0x8a8a94, base: 0xe6e6ea },
}

export interface ParticleControls {
  /** 0.1..1: the share of the tier's particles that are alive. */
  density: number
  /** `attract` pulls particles towards the pointer, `repel` pushes them away. */
  mode: 'attract' | 'repel'
  /** 0.3..1.6: how bright and how red the particles get. */
  intensity: number
  /** 0.2..2: how hard the pointer and the current push. */
  strength: number
  /** 0.2..2.5: how fast everything moves (the clock of the simulation). */
  speed: number
  palette: ParticlePalette
  shape: ShapeId
  /** Bumped by the panel to ask the scene for a burst from the middle, or a reset. */
  burstVersion: number
  resetVersion: number
}

export const PARTICLE_DEFAULTS: Readonly<ParticleControls> = {
  density: 0.8,
  mode: 'attract',
  intensity: 1,
  strength: 1,
  speed: 1,
  palette: 'racing',
  shape: 'sphere',
  burstVersion: 0,
  resetVersion: 0,
}

export const particleText = {
  shape: tri('Alakzat', 'Shape', 'Vorm'),
  shapes: {
    sphere: tri('Gömb', 'Sphere', 'Bol'),
    ring: tri('Gyűrű', 'Ring', 'Ring'),
    wave: tri('Hullám', 'Wave', 'Golf'),
    spiral: tri('Spirál', 'Spiral', 'Spiraal'),
    mark: tri('Embléma', 'Mark', 'Embleem'),
  },
  mode: tri('A pointer hatása', 'Pointer force', 'Kracht van de aanwijzer'),
  attract: tri('Vonzás', 'Attract', 'Aantrekken'),
  repel: tri('Taszítás', 'Repel', 'Afstoten'),
  density: tri('Részecskesűrűség', 'Particle density', 'Deeltjesdichtheid'),
  strength: tri('Interakció erőssége', 'Interaction strength', 'Kracht van de interactie'),
  intensity: tri('Színintenzitás', 'Colour intensity', 'Kleurintensiteit'),
  speed: tri('Sebesség', 'Speed', 'Snelheid'),
  palette: tri('Színpaletta', 'Colour palette', 'Kleurenpalet'),
  palettes: {
    racing: tri('Racing', 'Racing', 'Racing'),
    cobalt: tri('Kobalt', 'Cobalt', 'Kobalt'),
    aurora: tri('Sarki fény', 'Aurora', 'Aurora'),
    ember: tri('Parázs', 'Ember', 'Gloed'),
    mono: tri('Mono', 'Mono', 'Mono'),
  },
  randomise: tri('Véletlen', 'Randomise', 'Willekeurig'),
  burst: tri('Szétlövés', 'Burst', 'Uitbarsting'),
} as const
