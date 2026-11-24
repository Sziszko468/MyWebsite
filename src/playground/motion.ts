/**
 * The motion laboratory's rules (PROMPT 36): the easing curves and the bounded parameters, and the custom properties an example plays with. The curves are the site's own
 * (`--ease-*` in tokens.css) and the defaults are the site's own durations and distances (a test keeps them equal), so the laboratory shows the motion system, not another one.
 * Plain data and functions, no React and no DOM.
 */

/** The site's easing curves, by the token that holds each. */
export const EASINGS = [
  { id: 'out', token: '--ease-out', curve: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  { id: 'in-out', token: '--ease-in-out', curve: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  { id: 'racing', token: '--ease-racing', curve: 'cubic-bezier(0.7, 0, 0.1, 1)' },
  { id: 'accelerate', token: '--ease-accelerate', curve: 'cubic-bezier(0.55, 0, 1, 0.45)' },
  { id: 'elastic', token: '--ease-elastic', curve: 'cubic-bezier(0.34, 1.45, 0.64, 1)' },
] as const
export type EasingId = (typeof EASINGS)[number]['id']

export const MOTION_BOUNDS = {
  duration: { min: 80, max: 1200, step: 20 },
  distance: { min: 0, max: 64, step: 4 },
  stagger: { min: 0, max: 200, step: 10 },
} as const

/** The original values: `--dur-base`, `--ease-out`, `--motion-distance-md` and `--motion-stagger` of tokens.css. */
export const MOTION_DEFAULTS = { duration: 240, easing: 'out' as EasingId, distance: 16, stagger: 60 }

export interface MotionState {
  duration: number
  easing: EasingId
  distance: number
  stagger: number
  /** The visitor asked the playground to behave as under "reduce motion", whatever the system says. */
  simulateReduced: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function bounded(value: unknown, { min, max, step }: { min: number; max: number; step: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(Math.round((clamp(value, min, max) - min) / step) * step + min, min, max)
}

export const isEasing = (value: unknown): value is EasingId => EASINGS.some((easing) => easing.id === value)

export function clampMotion(input: Partial<MotionState>, original: MotionState): MotionState {
  return {
    duration: bounded(input.duration, MOTION_BOUNDS.duration, original.duration),
    easing: isEasing(input.easing) ? input.easing : original.easing,
    distance: bounded(input.distance, MOTION_BOUNDS.distance, original.distance),
    stagger: bounded(input.stagger, MOTION_BOUNDS.stagger, original.stagger),
    simulateReduced: typeof input.simulateReduced === 'boolean' ? input.simulateReduced : original.simulateReduced,
  }
}

const tokenOf = (id: EasingId): string => EASINGS.find((easing) => easing.id === id)!.token
/** The curve itself, not a reference to its token: the stage overrides `--ease-out`, and `--ease-out: var(--ease-out)` would be a cycle that makes every use of it invalid. */
const curveOf = (id: EasingId): string => EASINGS.find((easing) => easing.id === id)!.curve

/** Whether motion is reduced here: the system asks for it, or the visitor chose to see what it looks like. */
export const isReduced = (state: Pick<MotionState, 'simulateReduced'>, systemReduced: boolean): boolean => systemReduced || state.simulateReduced

/**
 * The custom properties of the laboratory's stage. They are set on the stage only. Under reduced motion every duration, distance and stagger is taken out, as the site's
 * own tokens do (`--dur-*` collapse, `--motion-intensity` is 0). The site's duration and curve tokens are overridden INSIDE the stage too, so the real Button and the real
 * links in it follow the same parameters.
 */
export function motionVars(state: MotionState, systemReduced: boolean): Record<string, string> {
  const reduced = isReduced(state, systemReduced)
  const duration = reduced ? '0.01ms' : `${state.duration}ms`
  const fast = reduced ? '0.01ms' : `${Math.max(MOTION_BOUNDS.duration.min, Math.round(state.duration * 0.6))}ms`
  return {
    '--pg-duration': duration,
    '--pg-ease': curveOf(state.easing),
    '--pg-distance': reduced ? '0px' : `${state.distance}px`,
    '--pg-stagger': reduced ? '0ms' : `${state.stagger}ms`,
    '--dur-base': duration,
    '--dur-fast': fast,
    '--ease-out': curveOf(state.easing),
  }
}

/** The CSS a visitor can copy for the transition. */
export function motionCss(state: MotionState): string {
  const curve = tokenOf(state.easing)
  return [`transition: transform ${state.duration}ms var(${curve}), opacity ${state.duration}ms var(${curve});`, `/* entrance: translateY(${state.distance}px) → 0, stagger ${state.stagger}ms */`].join('\n')
}
