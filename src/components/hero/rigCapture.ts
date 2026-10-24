import type { HeroRig } from './heroRig'

/**
 * Development aid: exposes the live scene (rig, camera, renderer, scene) as `window.__hero` so the
 * choreography can be inspected from the console. In production builds this does nothing and
 * the call is removed with the dead branch.
 */
export function createRigCapture(handles: { rig: HeroRig } & Record<string, unknown>): (() => void) | undefined {
  if (!import.meta.env.DEV) return undefined
  const target = window as unknown as { __hero?: unknown }
  target.__hero = handles
  return () => {
    if (target.__hero === handles) delete target.__hero
  }
}
