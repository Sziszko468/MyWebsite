/**
 * Development aid: exposes the live scene (rig, camera, renderer, uniforms, driver) as
 * `window.__hero` (the Home hero) or `window.__intro` (the fullscreen intro) so it can be
 * inspected and measured from the console. The two scenes can exist at the same moment, so each
 * has its own slot. In production builds this does nothing and the call is removed with the dead
 * branch.
 */
export type DevSlot = 'hero' | 'intro'

type DevWindow = Record<string, unknown>

export function createRigCapture(handles: Record<string, unknown>, slot: DevSlot = 'hero'): (() => void) | undefined {
  if (!import.meta.env.DEV) return undefined
  const key = slot === 'intro' ? '__intro' : '__hero'
  const target = window as unknown as DevWindow
  target[key] = handles
  return () => {
    if (target[key] === handles) delete target[key]
  }
}

/**
 * Lets the part that really renders the frame (plain or post-processed) register itself, so the
 * cost of a frame can be benchmarked from the console as `window.__heroRenderFrame()` (or
 * `window.__introRenderFrame()`).
 */
export function registerFrameRenderer(render: () => void, slot: DevSlot = 'hero'): (() => void) | undefined {
  if (!import.meta.env.DEV) return undefined
  const key = slot === 'intro' ? '__introRenderFrame' : '__heroRenderFrame'
  const target = window as unknown as DevWindow
  target[key] = render
  return () => {
    if (target[key] === render) delete target[key]
  }
}
