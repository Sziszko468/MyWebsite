import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Fragment, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Bloom } from './Bloom'
import { EnvironmentLighting } from './EnvironmentLighting'
import { ParticleField } from './ParticleField'
import { RacingCamera } from './RacingCamera'
import { RacingCar } from './RacingCar'
import { RacingLines } from './RacingLines'
import { Track } from './Track'
import { damp, smoothstep } from './heroMath'
import { readScenePalette } from './heroPalette'
import { createRig, type HeroRig } from './heroRig'
import { sampleTimeline, scrollTransition } from './heroTimeline'
import { blendPalette, createBlended, createUniforms, type BlendedPalette, type HeroUniforms } from './heroUniforms'
import type { HeroInputs } from './useHeroInputs'
import {
  POSE_IDLE,
  PULSE_SECONDS,
  QUALITY,
  SLOW_FRAME_MS,
  TOP_SPEED,
  type QualityProfile,
  type QualityTier,
} from './velocityHeroConfig'
import { createRigCapture } from './rigCapture'

export interface VelocityHeroSceneProps {
  theme: 'dark' | 'light'
  tier: QualityTier
  inputs: RefObject<HeroInputs>
  /** False when the hero is off screen: rendering stops until it returns. */
  active: boolean
  onReady: () => void
  /** The frame rate is too low for the current tier. */
  onSlow: (averageMs: number) => void
  onContextLost: () => void
  onContextRestored: () => void
}

type RuntimeProps = Pick<VelocityHeroSceneProps, 'inputs' | 'onReady' | 'onSlow' | 'onContextLost' | 'onContextRestored'> & {
  target: ReturnType<typeof readScenePalette>
  blended: BlendedPalette
  uniforms: HeroUniforms
  rig: HeroRig
}

// The first seconds include shader compilation, so the frame-rate check starts later and
// looks at windows of frames rather than single hitches.
const WARM_UP_FRAMES = 150
const WINDOW_FRAMES = 90
const COOL_DOWN_FRAMES = 150

/**
 * The master clock. It runs before every other part (priority -2), advances the choreography,
 * eases the palette, writes the shared uniforms, and watches the frame rate. It also reports
 * WebGL context loss and restoration.
 */
function Runtime({ inputs, target, blended, uniforms, rig, onReady, onSlow, onContextLost, onContextRestored }: RuntimeProps) {
  const gl = useThree((state) => state.gl)
  const frames = useRef(0)
  const watch = useRef({ time: 0, count: 0, strikes: 0, cooldown: WARM_UP_FRAMES })
  const latest = useRef(target)

  useEffect(() => {
    latest.current = target
  }, [target])

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

    rig.elapsed += dt
    sampleTimeline(rig.elapsed, rig.state)

    const input = inputs.current
    rig.scroll = damp(rig.scroll, input.scroll, 0.12, dt)
    const scroll = scrollTransition(rig.scroll)
    rig.speed = rig.state.speed + scroll.speedBoost
    rig.travel += rig.speed * TOP_SPEED * dt

    // A click: sharp attack, slow decay.
    const age = performance.now() / 1000 - input.pulseAt
    rig.pulse = age >= 0 && age < PULSE_SECONDS ? Math.pow(1 - age / PULSE_SECONDS, 2) * smoothstep(0, 0.06, age) : 0

    blendPalette(blended, latest.current, dt)

    uniforms.uTravel.value = rig.travel
    uniforms.uStreak.value = Math.min(1, rig.state.streak + scroll.speedBoost)
    uniforms.uPulse.value = rig.pulse
    uniforms.uAdd.value = blended.additive
    uniforms.uGlow.value = blended.glow
    uniforms.uBright.value = (0.12 + 0.88 * rig.state.lights) * scroll.brightness
    uniforms.uRed.value.copy(blended.red)
    uniforms.uBlue.value.copy(blended.blue)

    frames.current += 1
    if (frames.current === 2) onReady()

    // Frame-rate watchdog: two consecutive slow windows lower the quality tier.
    const w = watch.current
    if (w.cooldown > 0) {
      w.cooldown -= 1
      return
    }
    if (delta > 0.25) {
      // A pause (tab hidden, hero scrolled away) is not slowness.
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

function Scene({
  profile,
  theme,
  inputs,
  onReady,
  onSlow,
  onContextLost,
  onContextRestored,
}: { profile: QualityProfile } & Omit<VelocityHeroSceneProps, 'tier' | 'active'>) {
  // The active theme's colours and light levels, read from the design tokens. Changing the theme
  // changes this target; the scene eases towards it instead of restarting.
  const target = useMemo(() => readScenePalette(theme), [theme])
  const [blended] = useState(() => createBlended(target))
  const [uniforms] = useState(createUniforms)
  const [rig] = useState(createRig)

  return (
    <>
      <Runtime
        inputs={inputs}
        target={target}
        blended={blended}
        uniforms={uniforms}
        rig={rig}
        onReady={onReady}
        onSlow={onSlow}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      />
      <RacingCamera rig={rig} inputs={inputs} />
      <EnvironmentLighting profile={profile} palette={blended} uniforms={uniforms} rig={rig} light={theme === 'light'} />
      {/* Parts are built for one quality tier; a tier change rebuilds them. */}
      <Fragment key={profile.tier}>
        <Track profile={profile} uniforms={uniforms} palette={blended} />
        <RacingLines profile={profile} uniforms={uniforms} />
        <ParticleField profile={profile} uniforms={uniforms} />
        <RacingCar profile={profile} uniforms={uniforms} palette={blended} rig={rig} />
      </Fragment>
      {profile.bloom && <Bloom palette={blended} rig={rig} />}
      <RigCapture rig={rig} />
    </>
  )
}

/** Dev-only hook for inspecting the scene from the console. Compiles away in production. */
function RigCapture({ rig }: { rig: HeroRig }) {
  const { camera, gl, scene } = useThree()
  useEffect(() => createRigCapture({ rig, camera, gl, scene }), [rig, camera, gl, scene])
  return null
}

/**
 * The Three.js hero scene, loaded on demand. The canvas fills its layer, never takes pointer
 * input, and stops rendering while the hero is off screen. Antialiasing is fixed when the
 * context is created, so the canvas is re-created only if a tier change turns it on or off.
 */
export default function VelocityHeroScene({ theme, tier, inputs, active, onReady, onSlow, onContextLost, onContextRestored }: VelocityHeroSceneProps) {
  const profile = QUALITY[tier]

  return (
    <Canvas
      key={profile.antialias ? 'antialiased' : 'plain'}
      frameloop={active ? 'always' : 'never'}
      dpr={[1, profile.maxDpr]}
      gl={{ antialias: profile.antialias, alpha: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: POSE_IDLE.fov, near: 0.1, far: 260, position: [POSE_IDLE.x, POSE_IDLE.y, POSE_IDLE.z] }}
      resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
    >
      <Scene
        profile={profile}
        theme={theme}
        inputs={inputs}
        onReady={onReady}
        onSlow={onSlow}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      />
    </Canvas>
  )
}
