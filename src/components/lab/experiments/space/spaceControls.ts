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
  pulseVersion: 0,
}

export const spaceText = {
  drift: tri('Önálló sodródás', 'Own drift', 'Eigen drift'),
  streak: tri('Fénycsíkok hossza', 'Streak length', 'Lengte van de lichtstrepen'),
  pulse: tri('Impulzus', 'Pulse', 'Puls'),
  warp: tri('Ugrás előre', 'Warp jump', 'Warpsprong'),
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
    'A nézőpontot a pointer irányítja; billentyűzettel a nyílbillentyűk.',
    'The pointer steers the view; with a keyboard, the arrow keys.',
    'De aanwijzer stuurt het beeld; met een toetsenbord de pijltjestoetsen.',
  ),
} as const
