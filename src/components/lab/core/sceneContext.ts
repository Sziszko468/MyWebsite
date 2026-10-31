import { useFrame } from '@react-three/fiber'
import { createContext, useContext, useEffect, useRef } from 'react'
import type { ScenePalette } from '../../hero/heroPalette'
import type { LabClock } from './labClock'
import type { LabProfile } from './labProfile'
import type { LabPointer } from './LabPointer'

/** What every scene of the Lab can read. One object, created once, mutated in place; never React state. */
export interface LabSceneContext {
  pointer: LabPointer
  clock: LabClock
  profile: LabProfile
  /** `live` or `calm`: a still stage has no scene. */
  view: 'live' | 'calm'
  /** The factor on every amplitude the scene controls: 1 live, less when calm. */
  motion: number
  /** The scene may animate by itself, with nobody touching it. */
  autonomous: boolean
  /** The active theme's colours, eased towards the target when the theme changes. */
  palette: ScenePalette
  /** Width over height of the canvas. */
  aspect: number
  /** A scene sets this while it still has something to animate; an on-demand canvas then draws another frame. */
  busy: { current: boolean }
}

export const SceneContext = createContext<LabSceneContext | null>(null)

export function useLabScene(): LabSceneContext {
  const value = useContext(SceneContext)
  if (!value) throw new Error('useLabScene must be used inside <LabCanvas>')
  return value
}

/** What a frame callback may tell the runtime: it still needs more frames (only matters when calm). */
export type FrameResult = boolean | void

/**
 * Registers a scene's per-frame work after the runtime has advanced the clock and the pointer and
 * before the frame is drawn. `busy` is how a calm (on-demand) canvas learns it must keep drawing.
 */
export function useLabFrame(callback: (scene: LabSceneContext) => FrameResult): void {
  const scene = useLabScene()
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })
  useFrame(() => {
    if (latest.current(scene) === true) scene.busy.current = true
  }, 0)
}
