import { tri } from '../../../../content/trilingual'
import type { MatterId } from './liquidMaterials'

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface LiquidControls {
  matter: MatterId
  /** 0.3..1.7: a multiplier on how far the state's deformation pushes the surface. */
  deformation: number
  /** 0..2: a multiplier on how fast the surface flows by itself. */
  flow: number
  /** 0.4..1.6: how bright the studio light is. */
  light: number
  /** Bumped by the panel to send a pulse through the form from the middle. */
  pulseVersion: number
}

export const LIQUID_DEFAULTS: Readonly<LiquidControls> = {
  matter: 'chrome',
  deformation: 1,
  flow: 1,
  light: 1,
  pulseVersion: 0,
}

export const liquidText = {
  matter: tri('Anyagállapot', 'State of matter', 'Toestand'),
  deformation: tri('Deformáció', 'Deformation', 'Vervorming'),
  flow: tri('Áramlás sebessége', 'Flow speed', 'Stroomsnelheid'),
  light: tri('Fényerő', 'Light', 'Licht'),
  pulse: tri('Impulzus', 'Pulse', 'Puls'),
} as const
