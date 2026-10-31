import { tri } from '../../../../content/trilingual'
import type { ShapeId } from './particleShapes'

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface ParticleControls {
  /** 0.1..1: the share of the tier's particles that are alive. */
  density: number
  /** `attract` pulls particles towards the pointer, `repel` pushes them away. */
  mode: 'attract' | 'repel'
  /** 0.3..1.6: how bright and how red the particles get. */
  intensity: number
  /** 0.2..2: how hard the pointer and the current push. */
  strength: number
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
  burst: tri('Szétlövés', 'Burst', 'Uitbarsting'),
} as const
