import { tri } from '../../../../content/trilingual'

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface SpaceControls {
  /** 0..2: how fast the space drifts by itself when nobody is touching it. */
  drift: number
  /** 0.3..2: how long the light streaks are drawn. */
  streak: number
  /** Bumped by the panel to send a pulse down the tunnel. */
  pulseVersion: number
}

export const SPACE_DEFAULTS: Readonly<SpaceControls> = { drift: 1, streak: 1, pulseVersion: 0 }

export const spaceText = {
  drift: tri('Önálló sodródás', 'Own drift', 'Eigen drift'),
  streak: tri('Fénycsíkok hossza', 'Streak length', 'Lengte van de lichtstrepen'),
  pulse: tri('Impulzus', 'Pulse', 'Puls'),
  steer: tri(
    'A nézőpontot a pointer irányítja; billentyűzettel a nyílbillentyűk.',
    'The pointer steers the view; with a keyboard, the arrow keys.',
    'De aanwijzer stuurt het beeld; met een toetsenbord de pijltjestoetsen.',
  ),
} as const
