import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FramePacer, stepScaleDown } from '../../hero/framePacing'
import { blendPalette, createBlended } from '../../hero/fieldUniforms'
import { readScenePalette, type ScenePalette } from '../../hero/heroPalette'
import { quietKnownLibraryWarnings } from '../../hero/threeConsole'
import { SLOW_FRAME_MS, type QualityTier } from '../../hero/velocityHeroConfig'
import { FrameWatchdog, SEVERE_FACTOR } from './frameWatchdog'
import type { Theme } from '../../../theme/theme'
import type { LabClock } from './labClock'
import { chooseDpr, labProfileFor, type LabProfile } from './labProfile'
import type { LabPointer } from './LabPointer'
import { SceneContext, type LabSceneContext } from './sceneContext'

// Before the first Canvas exists: react-three-fiber creates its clock when the Canvas mounts.
quietKnownLibraryWarnings()

interface RuntimeProps {
  pointer: LabPointer
  clock: LabClock
  profile: LabProfile
  view: 'live' | 'calm'
  target: ScenePalette
  onReady: () => void
  onSlow: (averageMs: number) => void
  onContextLost: () => void
  onContextRestored: () => void
  children: ReactNode
}

/** Development only: the renderer for inspection from the console (resource counts, context loss). */
interface LabDebugWindow extends Window {
  __labGl?: unknown
}

/**
 * The master clock and the renderer's governor, in one place for every experiment:
 *
 *  - before everything (priority -2) it advances the clock, eases the pointer and the palette and
 *    watches the frame rate;
 *  - after everything (priority 1) it draws, skipping frames on screens faster than the pacer
 *    allows, and in a calm (on-demand) canvas asks for another frame only while something changes;
 *  - it keeps the canvas inside the tier's pixel budget, and reports context loss and restoration.
 *
 * Per frame it writes numbers into objects created once and allocates nothing.
 */
function Runtime({
  pointer,
  clock,
  profile,
  view,
  target,
  onReady,
  onSlow,
  onContextLost,
  onContextRestored,
  children,
}: RuntimeProps) {
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)
  const setDpr = useThree((state) => state.setDpr)
  const invalidate = useThree((state) => state.invalidate)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  const [palette] = useState(() => createBlended(target))
  const latestTarget = useRef(target)
  const [busy] = useState(() => ({ current: false }))
  const [pacer] = useState(() => new FramePacer())
  const [watchdog] = useState(() => new FrameWatchdog())
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)

  const context = useMemo<LabSceneContext>(
    () => ({
      pointer,
      clock,
      profile,
      view,
      motion: view === 'live' ? 1 : 0.35,
      autonomous: view === 'live',
      palette,
      aspect: 1,
      busy,
    }),
    [pointer, clock, profile, view, palette, busy],
  )

  useEffect(() => {
    latestTarget.current = target
    invalidate()
  }, [target, invalidate])

  // The scene's background is the page colour, eased with the theme (the palette object is updated in place).
  useEffect(() => {
    scene.background = palette.bg
    return () => {
      scene.background = null
    }
  }, [scene, palette])

  // Input wakes an on-demand canvas.
  useEffect(() => {
    pointer.onActivity = invalidate
    return () => {
      if (pointer.onActivity === invalidate) pointer.onActivity = null
    }
  }, [pointer, invalidate])

  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event) => {
      event.preventDefault()
      onContextLost()
    }
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
    }
  }, [gl, onContextLost, onContextRestored])

  // The pixel budget, re-applied whenever the size, the tier or the adaptive scale changes. The
  // canvas puts its own `dpr` prop back whenever its parent re-renders, so it is also re-applied
  // whenever the pixel ratio has drifted from the budget.
  useEffect(() => {
    const chosen = chooseDpr(profile, size.width, size.height, window.devicePixelRatio, scale)
    if (Math.abs(dpr - chosen) > 0.001) setDpr(chosen)
  }, [size.width, size.height, dpr, scale, profile, setDpr])

  // Ask the driver to compile the shader programs in parallel, so the first frame does not wait for them one by one.
  useEffect(() => {
    gl.compileAsync?.(scene, camera).catch(() => undefined)
  }, [gl, scene, camera, profile.tier])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = window as LabDebugWindow
    debug.__labGl = gl
    return () => {
      if (debug.__labGl === gl) delete debug.__labGl
    }
  }, [gl])

  const handleSlow = useCallback(
    (averageMs: number) => {
      // The cheapest remedy first: draw fewer pixels. Only at the floor does the tier drop, and
      // straight away when the frames are so slow that fewer pixels cannot be the whole answer.
      const severe = averageMs > SLOW_FRAME_MS * SEVERE_FACTOR
      const lower = severe ? null : stepScaleDown(scaleRef.current)
      if (lower !== null) {
        scaleRef.current = lower
        setScale(lower)
      } else {
        onSlow(averageMs)
      }
    },
    [onSlow],
  )

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    clock.dt = dt
    clock.t += dt
    clock.frame += 1
    context.aspect = size.width / Math.max(size.height, 1)

    pointer.update(dt)
    const paletteMoving = blendPalette(palette, latestTarget.current, dt)
    busy.current = paletteMoving || !pointer.settled

    if (clock.frame === 2) onReady()

    // Frame-rate watchdog (only meaningful when the canvas draws continuously).
    if (view !== 'live') return
    const averageMs = watchdog.tick(delta)
    if (averageMs !== null) handleSlow(averageMs)
  }, -2)

  // Taking over the drawing (a subscriber above priority 0 does) lets the pacer skip frames: a
  // 120 or 144 Hz screen would otherwise cost twice the power for no visible gain.
  useFrame((state) => {
    const onDemand = state.get().frameloop === 'demand'
    if (!onDemand && !pacer.tick(performance.now())) return
    state.gl.render(state.scene, state.camera)
    if (onDemand && busy.current) invalidate()
  }, 1)

  return <SceneContext.Provider value={context}>{children}</SceneContext.Provider>
}

/** Shadows are off until a scene turns them on. This keeps react-three-fiber from setting a shadow-map type that three no longer has. */
const SHADOWS = { enabled: false, type: PCFShadowMap } as const

export interface LabCanvasProps {
  pointer: LabPointer
  clock: LabClock
  tier: QualityTier
  view: 'live' | 'calm'
  theme: Theme
  /** False while the stage is off screen or the tab is hidden: nothing is drawn. */
  active: boolean
  camera: { fov: number; position: [number, number, number]; near?: number; far?: number }
  /** Multisampling. It is fixed when the context is created, so changing it re-creates the canvas. */
  antialias?: boolean
  /** Draw only when something asks (an editor at rest costs nothing); the scene calls `invalidate()` or reports itself busy. */
  onDemand?: boolean
  /** A pixel-ratio ceiling of this experiment's own, below the tier's (a full-screen shader pays for every pixel). */
  maxDpr?: number
  onReady: () => void
  onSlow: (averageMs: number) => void
  onContextLost: () => void
  onContextRestored: () => void
  children: ReactNode
}

/**
 * The one canvas of a Lab stage. It fills its container, reads its colours from the design tokens
 * and the theme, and draws only while it is on screen: continuously when live, on demand when calm.
 * A tier change rebuilds the scene's parts (the children are keyed by tier) but not the canvas.
 */
export function LabCanvas({
  pointer,
  clock,
  tier,
  view,
  theme,
  active,
  camera,
  antialias = false,
  maxDpr,
  onDemand = false,
  onReady,
  onSlow,
  onContextLost,
  onContextRestored,
  children,
}: LabCanvasProps) {
  const tierProfile = labProfileFor(tier)
  const profile = useMemo(
    () => (maxDpr !== undefined && maxDpr < tierProfile.maxDpr ? { ...tierProfile, maxDpr } : tierProfile),
    [tierProfile, maxDpr],
  )
  const target = useMemo(() => readScenePalette(theme), [theme])
  const hasAntialias = antialias && tier !== 'low'

  // Not drawing at all while hidden; continuous when live; on demand when calm.
  const frameloop = !active ? 'never' : view === 'live' && !onDemand ? 'always' : 'demand'

  return (
    <Canvas
      // No tone mapping: the scene's background must come out as exactly the page colour in both themes.
      flat
      shadows={SHADOWS}
      key={hasAntialias ? 'antialiased' : 'plain'}
      frameloop={frameloop}
      dpr={[1, profile.maxDpr]}
      // The default power preference lets the browser pick the GPU: forcing the discrete one on a hybrid laptop
      // means copying every frame across to the integrated one that drives the screen.
      gl={{ antialias: hasAntialias, alpha: false, powerPreference: 'default', stencil: false }}
      camera={{ fov: camera.fov, near: camera.near ?? 0.1, far: camera.far ?? 300, position: camera.position }}
      resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
    >
      <Runtime
        pointer={pointer}
        clock={clock}
        profile={profile}
        view={onDemand ? 'calm' : view}
        target={target}
        onReady={onReady}
        onSlow={onSlow}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      >
        {/* Parts are built for one quality tier; a tier change rebuilds them. */}
        <Fragment key={tier}>{children}</Fragment>
      </Runtime>
    </Canvas>
  )
}
