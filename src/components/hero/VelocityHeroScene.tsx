import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Bloom } from './Bloom'
import { DistortionField } from './DistortionField'
import { createMotion, fieldMotion, type ExitSignal, type FieldMode } from './fieldMotion'
import { blendPalette, createBlended, createUniforms, type BlendedPalette, type FieldUniforms } from './fieldUniforms'
import { FieldCamera } from './FieldCamera'
import { FramePacer, stepScaleDown } from './framePacing'
import type { HeroDriver } from './HeroDriver'
import { clamp, clockSeconds, smoothstep } from './heroMath'
import { readScenePalette, type ScenePalette } from './heroPalette'
import { createRig, type HeroRig } from './heroRig'
import { LightTrails } from './LightTrails'
import { PointerBeam } from './PointerBeam'
import { PointerHud } from './PointerHud'
import { ReactiveParticles } from './ReactiveParticles'
import { createRigCapture, registerFrameRenderer, type DevSlot } from './rigCapture'
import { scrollPose } from './ScrollTransition'
import { quietKnownLibraryWarnings } from './threeConsole'
import { TunnelRings } from './TunnelRings'
import { VelocityField } from './VelocityField'
import { CURSOR, FIELD, SLOW_FRAME_MS, profileFor, type QualityProfile, type QualityTier } from './velocityHeroConfig'

// Before the first Canvas exists: react-three-fiber creates its clock when the Canvas mounts.
quietKnownLibraryWarnings()

export interface VelocityHeroSceneProps {
  theme: 'dark' | 'light'
  tier: QualityTier
  /** The page's input: cursor, clicks and scroll, already eased. Read every frame, never copied to state. */
  driver: HeroDriver
  /**
   * `hero`: a world that is always flowing, rendered every frame while on screen.
   * `intro`: a world that is still until touched, rendered only while something is changing.
   */
  mode?: FieldMode
  /** The intro's leaving transition; read every frame. */
  exit?: RefObject<ExitSignal>
  /** False when the hero is off screen: rendering stops until it returns. */
  active: boolean
  onReady: () => void
  /** The frame rate is too low for the current tier. */
  onSlow: (averageMs: number) => void
  onContextLost: () => void
  onContextRestored: () => void
  /** Development only: force bloom on or off, to measure its cost. */
  bloom?: boolean
  /** Development only: force multisampling on or off, to measure its cost. */
  antialias?: boolean
}

type RuntimeProps = Pick<VelocityHeroSceneProps, 'driver' | 'onReady' | 'onSlow' | 'onContextLost' | 'onContextRestored'> & {
  mode: FieldMode
  exit?: RefObject<ExitSignal>
  target: ScenePalette
  blended: BlendedPalette
  uniforms: FieldUniforms
  rig: HeroRig
}

// The first seconds include shader compilation, so the frame-rate check starts later and
// looks at windows of frames rather than single hitches.
const WARM_UP_FRAMES = 150
const WINDOW_FRAMES = 90
const COOL_DOWN_FRAMES = 150

/** However low the budget and the adaptive scale, the canvas keeps at least this pixel ratio. */
const MIN_DPR = 0.55

/**
 * The master clock. It runs before every other part (priority -2): it advances the world's
 * motion, turns the visitor's eased input into uniforms, eases the palette, and watches the
 * frame rate. It also reports WebGL context loss and restoration. Per frame it only writes
 * numbers into objects created once; it allocates nothing.
 *
 * In `intro` mode the canvas renders on demand: this keeps asking for the next frame only while
 * something is changing (pointer, click waves, waking up, theme blend, exit), so a scene at rest
 * costs nothing.
 */
function Runtime({ driver, mode, exit, target, blended, uniforms, rig, onReady, onSlow, onContextLost, onContextRestored }: RuntimeProps) {
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const frames = useRef(0)
  const watch = useRef({ time: 0, count: 0, strikes: 0, cooldown: WARM_UP_FRAMES })
  const rippleVersion = useRef(-1)
  const latest = useRef(target)
  const motion = useRef(createMotion())

  useEffect(() => {
    latest.current = target
    invalidate()
  }, [target, invalidate])

  // New input may need a new frame.
  useEffect(() => driver.subscribe(invalidate), [driver, invalidate])

  // The scene's background is the page colour, eased with the theme.
  useEffect(() => {
    scene.background = blended.bg
    return () => {
      scene.background = null
    }
  }, [scene, blended])

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

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const { cursor, scroll } = driver
    const u = uniforms
    const intro = mode === 'intro'
    const now = clockSeconds()
    const leaving = exit?.current.progress ?? 0

    rig.elapsed += dt
    rig.intro = smoothstep(0, intro ? FIELD.introRampSeconds : FIELD.introSeconds, rig.elapsed)
    scrollPose(scroll.progress, rig.pose)

    // How hard the visitor is pushing the field: the cursor's eased energy, plus scroll speed.
    const energy = cursor.energy
    const pull = Math.min(1, Math.abs(scroll.velocity) * 1.5)
    const m = fieldMotion(
      { mode, ramp: rig.intro, energy, pull, boost: rig.pose.speedBoost, exit: leaving },
      motion.current,
    )
    rig.speed = m.speed
    rig.travel += m.speed * dt
    rig.phase += m.phaseRate * dt
    rig.exit = leaving
    rig.motion = m

    const paletteMoving = blendPalette(blended, latest.current, dt)

    u.uTime.value = now
    u.uTravel.value = rig.travel
    u.uPhase.value = rig.phase
    u.uPresence.value = cursor.presence
    u.uSpread.value = m.spread
    u.uExit.value = leaving
    u.uWaves.value = cursor.hasActiveRipples(now) ? 1 : 0
    u.uStreak.value = m.streak
    u.uEnergy.value = energy
    u.uWarp.value = m.warp
    u.uAspect.value = size.width / Math.max(size.height, 1)
    u.uPixel.value.set(2 / Math.max(size.width, 1), 2 / Math.max(size.height, 1))
    u.uCursor.value.set(cursor.x, cursor.y)
    u.uCursorVel.value.set(cursor.vx, cursor.vy)
    if (leaving > 0) {
      // The exit radiates from the newest click wave: the click (or the button) that started it.
      let newest = 0
      for (let i = 1; i < CURSOR.maxRipples; i++) {
        if (cursor.ripples[i * 4 + 2] > cursor.ripples[newest * 4 + 2]) newest = i
      }
      u.uOrigin.value.set(cursor.ripples[newest * 4], cursor.ripples[newest * 4 + 1])
    }

    if (rippleVersion.current !== cursor.rippleVersion) {
      rippleVersion.current = cursor.rippleVersion
      for (let i = 0; i < u.uRipples.value.length; i++) {
        u.uRipples.value[i].set(cursor.ripples[i * 4], cursor.ripples[i * 4 + 1], cursor.ripples[i * 4 + 2], cursor.ripples[i * 4 + 3])
      }
    }

    u.uAdd.value = blended.additive
    u.uGlow.value = blended.glow
    u.uBright.value = rig.intro * rig.pose.brightness * m.brightness
    u.uRed.value.copy(blended.red)
    u.uBlue.value.copy(blended.blue)
    u.uInk.value.copy(blended.ink)
    u.uGrid.value.copy(blended.grid)

    frames.current += 1
    if (frames.current === 2) onReady()

    // On demand: ask for another frame only while something is still changing.
    if (intro && (!cursor.settled || !scroll.settled || rig.intro < 1 || leaving > 0 || paletteMoving || cursor.hasActiveRipples(now))) {
      invalidate()
    }

    // Frame-rate watchdog: two consecutive slow windows lower the quality tier.
    const w = watch.current
    if (w.cooldown > 0) {
      w.cooldown -= 1
      return
    }
    if (delta > 0.25) {
      // A pause (tab hidden, hero scrolled away, a scene at rest) is not slowness.
      Object.assign(w, { time: 0, count: 0, strikes: 0 })
      return
    }
    w.time += delta
    w.count += 1
    if (w.count >= WINDOW_FRAMES) {
      const averageMs = (w.time / w.count) * 1000
      w.strikes = averageMs > SLOW_FRAME_MS ? w.strikes + 1 : 0
      w.time = 0
      w.count = 0
      if (w.strikes >= 2) {
        w.strikes = 0
        w.cooldown = COOL_DOWN_FRAMES
        onSlow(averageMs)
      }
    }
  }, -2)

  return null
}

/**
 * Keeps the canvas within the tier's pixel budget. On a big screen the pixel ratio is lowered so
 * the canvas never has more pixels than the device can fill at a steady frame rate; the budget is
 * re-applied whenever the size changes (resize, rotation, a new window).
 */
function PixelBudget({ profile, scale }: { profile: QualityProfile; scale: number }) {
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)
  const setDpr = useThree((state) => state.setDpr)

  // The canvas puts its own `dpr` prop back whenever its parent re-renders, so the budget is
  // re-applied whenever the pixel ratio has drifted from it, not only when the size changes.
  // `scale` is the adaptive part: it shrinks when the frame rate cannot hold (see Scene).
  useEffect(() => {
    const cssPixels = Math.max(size.width * size.height, 1)
    const budget = Math.sqrt(profile.maxPixels / cssPixels)
    const chosen = clamp(Math.min(window.devicePixelRatio || 1, profile.maxDpr, budget) * scale, MIN_DPR, 3)
    if (Math.abs(dpr - chosen) > 0.001) setDpr(chosen)
  }, [size.width, size.height, dpr, scale, profile.maxPixels, profile.maxDpr, setDpr])

  return null
}

/**
 * Caps the rate at which frames are drawn, so that a 120, 144 or 240 Hz screen does not cost two
 * or three times the power and heat of a 60 Hz one for no visible gain (see FramePacer). This
 * takes over the drawing (a subscriber above priority 0 does) and skips the frames the pacer
 * says to skip. On demand, a skipped frame asks for the next one, so the last frame before a
 * scene settles is never lost.
 */
function FrameCap() {
  const invalidate = useThree((state) => state.invalidate)
  const [pacer] = useState(() => new FramePacer())

  useFrame((state) => {
    if (!pacer.tick(performance.now())) {
      if (state.get().frameloop === 'demand') invalidate()
      return
    }
    state.gl.render(state.scene, state.camera)
  }, 1)

  return null
}

/** Asks the driver to compile the scene's shader programs in parallel, so the first frame does not wait for them one by one. */
function Warmup({ tier }: { tier: QualityTier }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    // Best effort: where it is not supported the first frame simply compiles them as before.
    gl.compileAsync?.(scene, camera).catch(() => undefined)
  }, [gl, scene, camera, tier])

  return null
}

/** Development hook for inspecting and benchmarking the scene from the console. Compiles away in production. */
function DevHandle({
  rig,
  uniforms,
  driver,
  bloom,
  slot,
}: {
  rig: HeroRig
  uniforms: FieldUniforms
  driver: HeroDriver
  bloom: boolean
  slot: DevSlot
}) {
  const { camera, gl, scene, get } = useThree()
  useEffect(() => createRigCapture({ rig, uniforms, driver, camera, gl, scene, get }, slot), [rig, uniforms, driver, camera, gl, scene, get, slot])
  // Without the composer, plain rendering is the frame; with it, the composer registers itself.
  useEffect(() => (bloom ? undefined : registerFrameRenderer(() => gl.render(scene, camera), slot)), [bloom, gl, scene, camera, slot])
  return null
}

function Scene({
  profile,
  theme,
  driver,
  mode,
  exit,
  onReady,
  onSlow,
  onContextLost,
  onContextRestored,
}: { profile: QualityProfile; mode: FieldMode } & Omit<VelocityHeroSceneProps, 'tier' | 'active' | 'bloom' | 'mode'>) {
  // The active theme's colours and light levels, read from the design tokens. Changing the theme
  // changes this target; the scene eases towards it instead of restarting.
  const target = useMemo(() => readScenePalette(theme), [theme])
  const [blended] = useState(() => createBlended(target))
  const [uniforms] = useState(createUniforms)
  const [rig] = useState(createRig)

  // When the frame rate cannot hold, the cheapest remedy comes first: draw fewer pixels. Only when
  // the resolution is already at its floor does the quality tier drop, which rebuilds the scene.
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  const handleSlow = useCallback(
    (averageMs: number) => {
      const lower = stepScaleDown(scaleRef.current)
      if (lower !== null) {
        scaleRef.current = lower
        setScale(lower)
      } else {
        onSlow(averageMs)
      }
    },
    [onSlow],
  )

  return (
    <>
      <Runtime
        driver={driver}
        mode={mode}
        exit={exit}
        target={target}
        blended={blended}
        uniforms={uniforms}
        rig={rig}
        onReady={onReady}
        onSlow={handleSlow}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      />
      <PixelBudget profile={profile} scale={scale} />
      <FieldCamera rig={rig} driver={driver} />
      {/* Parts are built for one quality tier; a tier change rebuilds them. */}
      <Fragment key={profile.tier}>
        {profile.surfaces > 0 && <DistortionField profile={profile} uniforms={uniforms} />}
        {profile.rings > 0 && <TunnelRings profile={profile} uniforms={uniforms} />}
        <LightTrails profile={profile} uniforms={uniforms} />
        <VelocityField profile={profile} uniforms={uniforms} />
        <ReactiveParticles profile={profile} uniforms={uniforms} />
        {mode === 'intro' && <PointerBeam uniforms={uniforms} />}
        {mode === 'intro' && profile.overlay && <PointerHud uniforms={uniforms} />}
      </Fragment>
      {profile.bloom ? <Bloom palette={blended} rig={rig} driver={driver} slot={mode} /> : <FrameCap />}
      <Warmup tier={profile.tier} />
      <DevHandle rig={rig} uniforms={uniforms} driver={driver} bloom={profile.bloom} slot={mode} />
    </>
  )
}

/**
 * The generative scene, loaded on demand. The canvas fills its layer, never takes pointer input,
 * and stops rendering while it is off screen (hero) or at rest (intro). Antialiasing is fixed when
 * the context is created, so the canvas is re-created only if a tier change turns it on or off.
 */
export default function VelocityHeroScene({
  theme,
  tier,
  driver,
  mode = 'hero',
  exit,
  active,
  onReady,
  onSlow,
  onContextLost,
  onContextRestored,
  bloom,
  antialias,
}: VelocityHeroSceneProps) {
  const base = profileFor(mode, tier)
  const profile = { ...base, bloom: bloom ?? base.bloom, antialias: antialias ?? base.antialias }

  // The intro renders on demand. The hero does too while something else (the intro) covers it: it
  // draws one frame to compile its shaders, then waits.
  const frameloop = mode === 'intro' || !active ? 'demand' : 'always'

  return (
    <Canvas
      // No tone mapping: the scene's background must come out as exactly the page colour in both themes.
      flat
      key={profile.antialias ? 'antialiased' : 'plain'}
      frameloop={frameloop}
      dpr={[1, profile.maxDpr]}
      // The default power preference lets the browser pick the GPU: forcing the discrete one on a hybrid laptop
      // means copying every frame across to the integrated one that drives the screen.
      gl={{ antialias: profile.antialias, alpha: false, powerPreference: 'default', stencil: false, depth: false }}
      camera={{ fov: 60, near: 0.1, far: 300, position: [0, 0, 0] }}
      resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
    >
      <Scene
        profile={profile}
        mode={mode}
        theme={theme}
        driver={driver}
        exit={exit}
        onReady={onReady}
        onSlow={onSlow}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      />
    </Canvas>
  )
}
