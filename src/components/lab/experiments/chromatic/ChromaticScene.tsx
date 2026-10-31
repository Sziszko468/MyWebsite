import { useThree } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial, Vector2 } from 'three'
import { clamp, damp } from '../../../hero/heroMath'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { useDisposable } from '../../core/resources'
import type { ChromaticControls } from './chromaticControls'
import { CHROMATIC_FRAGMENT, CHROMATIC_VERTEX } from './chromaticShaders'

/** One big triangle covers the screen: no seam down a diagonal and one vertex fewer than a quad. */
function createScreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  return geometry
}

function Field({ controls }: { controls: RefObject<ChromaticControls> }) {
  const { pointer: initialPointer } = useLabScene()
  const gl = useThree((state) => state.gl)
  const geometry = useDisposable(createScreenTriangle, [])
  const uniforms = useMemo(
    () => ({
      uRes: { value: new Vector2(1, 1) },
      uMouse: { value: new Vector2() },
      uVel: { value: new Vector2() },
      uAspect: { value: 1 },
      uPhase: { value: 0 },
      uSep: { value: 1 },
      uLocal: { value: 1 },
      uLensR: { value: 0.45 },
      uWave: { value: 1 },
      uBoost: { value: 0 },
      uLayers: { value: 3 },
      uEnergy: { value: 0 },
      uBg: { value: new Color() },
      uInk: { value: new Color() },
      uRed: { value: new Color() },
      uBlue: { value: new Color() },
    }),
    [],
  )
  const material = useDisposable(
    () =>
      new ShaderMaterial({
        uniforms,
        vertexShader: CHROMATIC_VERTEX,
        fragmentShader: CHROMATIC_FRAGMENT,
        depthTest: false,
        depthWrite: false,
      }),
    [uniforms],
  )
  const state = useRef({
    phase: 0,
    energy: 0,
    boost: 0,
    attack: 0,
    surges: controls.current.surgeVersion,
    pulses: initialPointer.pulseVersion,
    vx: 0,
    vy: 0,
  })

  useLabFrame((s) => {
    const { pointer, clock, palette, motion, autonomous } = s
    const dt = clock.dt
    const ctl = controls.current
    const st = state.current

    // A click or tap, or the panel's button: a surge that rises over a moment and falls over about a second.
    if (st.surges !== ctl.surgeVersion) {
      st.surges = ctl.surgeVersion
      st.attack = 0.16
    }
    if (pointer.pulseVersion !== st.pulses) {
      st.pulses = pointer.pulseVersion
      st.attack = 0.16
    }
    if (st.attack > 0) {
      st.attack -= dt
      st.boost = damp(st.boost, 1, 0.045, dt)
    } else {
      st.boost = damp(st.boost, 0, 0.32, dt)
    }

    st.energy = damp(st.energy, pointer.energy, 0.2, dt)
    // The waves move by themselves only when live; otherwise only the pointer moves them.
    st.phase += dt * ((autonomous ? 0.55 : 0) + st.energy * 1.4 * motion)
    st.vx = damp(st.vx, pointer.vx, 0.18, dt)
    st.vy = damp(st.vy, pointer.vy, 0.18, dt)

    gl.getDrawingBufferSize(uniforms.uRes.value)
    uniforms.uAspect.value = s.aspect
    uniforms.uPhase.value = st.phase
    uniforms.uMouse.value.set(pointer.x * s.aspect, pointer.y)
    uniforms.uVel.value.set(clamp(st.vx, -2, 2), clamp(st.vy, -2, 2))
    uniforms.uEnergy.value = st.energy * motion
    uniforms.uSep.value = ctl.separation * (0.55 + 0.45 * motion)
    uniforms.uLocal.value = pointer.presence * (0.6 + 0.4 * motion)
    uniforms.uLensR.value = ctl.lens
    uniforms.uWave.value = ctl.waves * (0.45 + 0.55 * motion)
    uniforms.uBoost.value = st.boost * (0.55 + 0.45 * motion)
    uniforms.uLayers.value = s.profile.chromaticLayers
    uniforms.uBg.value.copy(palette.bg)
    uniforms.uInk.value.copy(palette.ink)
    uniforms.uRed.value.copy(palette.red)
    uniforms.uBlue.value.copy(palette.blue)

    return st.energy > 0.01 || st.boost > 0.01 || st.attack > 0 || pointer.presence > 0.02
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

export default function ChromaticScene({ controls }: { controls: RefObject<ChromaticControls> }) {
  return <Field controls={controls} />
}
