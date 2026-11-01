import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Color, Group, MathUtils, ShaderMaterial, Vector3 } from 'three'
import { clamp, lerp } from '../../../hero/heroMath'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { createIcoSphere, useDisposable } from '../../core/resources'
import { Spin } from '../../core/spin'
import { useStageCapture, type StageCapture } from '../../core/useStageCapture'
import { createSurfaceUniforms, SurfaceDriver } from '../../core/surface'
import type { LiquidControls } from './liquidControls'
import { cloneParams, easeMatter, MATTER_PARAMS } from './liquidMaterials'
import { LIQUID_FRAGMENT, LIQUID_VERTEX } from './liquidShaders'

const LIQUID_CAMERA = { fov: 40, position: [0, 0, 6.2] as [number, number, number] }
const CAMERA_Z = LIQUID_CAMERA.position[2]
/** The largest the deformed form gets, for fitting it in the view. */
const HEADROOM = 1.42

function Blob({ controls }: { controls: RefObject<LiquidControls> }) {
  const scene = useLabScene()
  const camera = useThree((state) => state.camera)
  const group = useRef<Group>(null)
  const geometry = useDisposable(() => createIcoSphere(scene.profile.liquidDetail), [scene.profile.liquidDetail])
  const uniforms = useMemo(
    () => ({
      ...createSurfaceUniforms(),
      uQuant: { value: 0 },
      uBase: { value: new Color() },
      uLightDir: { value: new Vector3(0.4, 0.6, 0.7) },
      uMetal: { value: 1 },
      uRough: { value: 0 },
      uFres: { value: 1 },
      uGlass: { value: 0 },
      uDisp: { value: 0 },
      uFacet: { value: 0 },
      uMolten: { value: 0 },
      uSheen: { value: 0 },
      uAdd: { value: 1 },
      uRed: { value: new Color() },
      uBlue: { value: new Color() },
      uInk: { value: new Color() },
      uStudioTurn: { value: 0 },
      uAmbient: { value: 0 },
      uLightGain: { value: 1 },
    }),
    [],
  )
  const material = useDisposable(
    () => new ShaderMaterial({ uniforms, vertexShader: LIQUID_VERTEX, fragmentShader: LIQUID_FRAGMENT }),
    [uniforms],
  )
  const driver = useMemo(() => new SurfaceDriver(), [])
  const spin = useMemo(() => new Spin(0.15), [])
  // The parameters being shown: they ease towards the chosen state, so a change of matter is a transition.
  const [shown] = useState(() => cloneParams(controls.current.matter))
  const state = useRef({ energy: 0, pulses: controls.current.pulseVersion, turn: 0 })

  useLabFrame((s) => {
    const g = group.current
    if (!g) return
    const { pointer, clock, palette, motion, autonomous } = s
    const dt = clock.dt
    const ctl = controls.current
    const st = state.current

    const changing = easeMatter(shown, MATTER_PARAMS[ctl.matter], dt)

    const halfHeight = Math.tan(MathUtils.degToRad(LIQUID_CAMERA.fov) / 2) * CAMERA_Z
    const halfWidth = halfHeight * s.aspect
    g.scale.setScalar((Math.min(halfWidth, halfHeight) * 0.82) / HEADROOM)

    spin.update(s, { idle: autonomous ? 0.05 : 0, gain: 3.6 })
    spin.apply(g)

    // The panel's pulse button: a wave from the middle of the form, for keyboards and touch screens.
    if (st.pulses !== ctl.pulseVersion) {
      st.pulses = ctl.pulseVersion
      pointer.pulse(0, 0, clock.t, 1)
    }

    st.energy = lerp(st.energy, pointer.energy, 1 - Math.pow(0.5, dt / 0.2))
    const deformation = ctl.deformation
    driver.update(s, camera, g, g.scale.x * 1.04, uniforms, {
      noiseSpeed:
        (shown.noiseSpeed * ctl.flow * (autonomous ? 1 : 0) + st.energy * 0.5 * motion) * (0.6 + 0.4 * motion),
      hitStrength: shown.hitStrength * deformation,
      response: shown.response,
    })

    uniforms.uAmp.value = shown.amp * deformation * (0.8 + 0.4 * st.energy)
    uniforms.uFreq.value = shown.freq
    uniforms.uPulseGain.value = shown.pulseGain * (0.7 + 0.3 * deformation)
    uniforms.uRipDecay.value = shown.pulseDecay
    uniforms.uRipSpeed.value = lerp(1.25, 1.9, clamp(1 - shown.pulseDecay, 0, 1))
    uniforms.uQuant.value = shown.quant
    uniforms.uBase.value.setRGB(shown.baseR, shown.baseG, shown.baseB)
    uniforms.uMetal.value = shown.metal
    uniforms.uRough.value = shown.rough
    uniforms.uFres.value = shown.fres
    uniforms.uGlass.value = shown.glass
    uniforms.uDisp.value = shown.dispersion
    uniforms.uFacet.value = shown.facet
    uniforms.uMolten.value = shown.molten
    uniforms.uSheen.value = shown.sheen

    // The pointer steers the light: the studio turns after it and the diffuse light follows.
    st.turn = lerp(st.turn, pointer.x * 1.3 * motion * pointer.presence, 1 - Math.pow(0.5, dt / 0.18))
    uniforms.uStudioTurn.value = st.turn
    uniforms.uLightDir.value.set(pointer.x * 0.9, 0.5 + pointer.y * 0.6, 0.8).normalize()
    uniforms.uLightGain.value = ctl.light
    uniforms.uAmbient.value = (1 - palette.additive) * 0.16
    uniforms.uAdd.value = palette.additive
    uniforms.uRed.value.copy(palette.red)
    uniforms.uBlue.value.copy(palette.blue)
    uniforms.uInk.value.copy(palette.ink)

    return changing || st.energy > 0.01 || spin.moving || driver.hasWaves(s, 7)
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}

export default function LiquidScene({
  controls,
  stage,
}: {
  controls: RefObject<LiquidControls>
  /** Where the scene hands the page its picture (see useStageCapture). */
  stage: RefObject<StageCapture | null>
}) {
  const capture = useStageCapture()
  useEffect(() => {
    stage.current = { capture }
    return () => {
      stage.current = null
    }
  }, [stage, capture])
  return <Blob controls={controls} />
}
