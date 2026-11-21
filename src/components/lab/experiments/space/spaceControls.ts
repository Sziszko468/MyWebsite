import { tri } from '../../../../content/trilingual'
import type { ParticlePalette } from '../particles/particleControls'

export const SPACE_LAYERS = ['full', 'streaks', 'rings', 'planes'] as const
export type SpaceLayer = (typeof SPACE_LAYERS)[number]

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface SpaceControls {
  /** 0..2: how fast the space drifts by itself when nobody is touching it. */
  drift: number
  /** 0.3..2: how long the light streaks are drawn. */
  streak: number
  /** 0.2..2: how strongly the pointer steers the view and speeds the flight. */
  intensity: number
  palette: ParticlePalette
  /** Which of the tunnel's systems are drawn: all of them, or one. */
  layer: SpaceLayer
  /** Bumped by the panel to jump forward through the tunnel. */
  warpVersion: number
  /** Bumped by the panel to bring the view back to straight ahead. */
  recentreVersion: number
  /** Bumped by the panel to send a pulse down the tunnel. */
  pulseVersion: number
}

export const SPACE_DEFAULTS: Readonly<SpaceControls> = {
  drift: 1,
  streak: 1,
  intensity: 1,
  palette: 'racing',
  layer: 'full',
  warpVersion: 0,
  recentreVersion: 0,
  pulseVersion: 0,
}

/**
 * Where a drag can turn the view, and by how much: a drag across the whole stage turns it about 35 degrees sideways, and the
 * view never leaves a cone the tunnel still reads in (about 57 degrees to either side, 31 up or down), so exploring cannot lose the way.
 */
export const LOOK = { yawPerUnit: 0.6, pitchPerUnit: 0.4, yawMax: 1, pitchMax: 0.55 } as const

export interface LookState {
  yaw: number
  pitch: number
}

/** The look after a drag of `dx`, `dy` (stage units; right and up are positive): a drag right looks right, up looks up. */
export function lookAfterDrag(look: LookState, dx: number, dy: number): LookState {
  const clampTo = (value: number, max: number) => Math.min(max, Math.max(-max, value))
  return {
    yaw: clampTo(look.yaw - dx * LOOK.yawPerUnit, LOOK.yawMax),
    pitch: clampTo(look.pitch + dy * LOOK.pitchPerUnit, LOOK.pitchMax),
  }
}

export const spaceText = {
  drift: tri('Önálló sodródás', 'Own drift', 'Eigen drift'),
  streak: tri('Fénycsíkok hossza', 'Streak length', 'Lengte van de lichtstrepen'),
  pulse: tri('Impulzus', 'Pulse', 'Puls'),
  warp: tri('Ugrás előre', 'Warp jump', 'Warpsprong'),
  recentre: tri('Nézet középre', 'Centre view', 'Beeld centreren'),
  intensity: tri('Mozgás intenzitása', 'Movement intensity', 'Bewegingsintensiteit'),
  palette: tri('Színpaletta', 'Colour palette', 'Kleurenpalet'),
  layer: tri('Minta', 'Pattern', 'Patroon'),
  layers: {
    full: tri('Minden', 'All', 'Alles'),
    streaks: tri('Fénycsíkok', 'Streaks', 'Strepen'),
    rings: tri('Gyűrűk', 'Rings', 'Ringen'),
    planes: tri('Síkok', 'Planes', 'Vlakken'),
  },
  steer: tri(
    'A nézőpontot a pointer irányítja. Húzással körülnézhetsz, és a nézet ott marad, ahol elengeded; billentyűzettel a nyílbillentyűk, a Home pedig középre visz.',
    'The pointer steers the view. Drag to look around and the view stays where you let go; with a keyboard, the arrow keys, and Home brings it back to the centre.',
    'De aanwijzer stuurt het beeld. Sleep om rond te kijken en het beeld blijft staan waar je loslaat; met een toetsenbord de pijltjestoetsen, en Home brengt het terug naar het midden.',
  ),
} as const
