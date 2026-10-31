/**
 * How a Lab stage is shown, decided in plain code so the rules can be tested without WebGL.
 *
 *   live    full motion and every effect
 *   calm    gentler motion and nothing that moves on its own: the scene answers the visitor's own
 *           input and draws only while something is changing (the default under reduced motion)
 *   still   no WebGL at all: a static picture of the experiment and the page's text
 */
export type LabView = 'live' | 'calm' | 'still'

/** Why a stage is still, or `null` when it is not. */
export type StillReason = 'no-webgl' | 'failed' | 'user' | null

export interface ViewInput {
  /** The visitor's choice, or null to follow the system. */
  preference: LabView | null
  reducedMotion: boolean
  webgl: boolean
  /** The scene threw, lost its context for good or could not hold a usable frame rate. */
  failed: boolean
}

export function decideView({ preference, reducedMotion, webgl, failed }: ViewInput): {
  view: LabView
  reason: StillReason
} {
  if (!webgl) return { view: 'still', reason: 'no-webgl' }
  if (failed) return { view: 'still', reason: 'failed' }
  if (preference === 'still') return { view: 'still', reason: 'user' }
  if (preference) return { view: preference, reason: null }
  return { view: reducedMotion ? 'calm' : 'live', reason: null }
}

/** How strongly a scene moves in a view: the factor on every amplitude it controls. */
export function motionScale(view: LabView): number {
  return view === 'live' ? 1 : view === 'calm' ? 0.35 : 0
}

/** Whether a scene may animate by itself, with nobody touching it. */
export function isAutonomous(view: LabView): boolean {
  return view === 'live'
}

export const VIEW_STORAGE_KEY = 'lab:view'

export function isLabView(value: unknown): value is LabView {
  return value === 'live' || value === 'calm' || value === 'still'
}

/** The saved choice for this tab, or null. Storage can be blocked, so every access is guarded. */
export function readViewPreference(storage: Pick<Storage, 'getItem'> | null): LabView | null {
  try {
    const value = storage?.getItem(VIEW_STORAGE_KEY)
    return isLabView(value) ? value : null
  } catch {
    return null
  }
}

export function storeViewPreference(storage: Pick<Storage, 'setItem'> | null, view: LabView | null): void {
  try {
    if (view && storage) storage.setItem(VIEW_STORAGE_KEY, view)
  } catch {
    // A blocked store only means the choice is not remembered.
  }
}
