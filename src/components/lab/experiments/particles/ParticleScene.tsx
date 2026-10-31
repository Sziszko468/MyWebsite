import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  MathUtils,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  ShaderMaterial,
} from 'three'
import { clamp, damp, lerp } from '../../../hero/heroMath'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { useDisposable } from '../../core/resources'
import type { ParticleControls } from './particleControls'
import { PARTICLE_FRAGMENT, PARTICLE_VERTEX } from './particleShaders'
import { FlowField, ParticleSim } from './particleSim'
import { SHAPE_EXTENT } from './particleShapes'

const PARTICLE_CAMERA = { fov: 50, position: [0, 0, 9] as [number, number, number] }
const CAMERA_Z = PARTICLE_CAMERA.position[2]

/** The pointer's reach, in the cloud's own units. */
const POINTER_RADIUS = 1.7

function Cloud({ controls }: { controls: RefObject<ParticleControls> }) {
  const scene = useLabScene()
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const points = useRef<Points>(null)
  const capacity = scene.profile.particles

  // A change of quality tier rebuilds the whole scene, so these are made once per tier.
  const [sim] = useState(() => new ParticleSim(capacity, controls.current.shape))
  const [flow] = useState(() => {
    const cols = scene.profile.fluidCols
    return new FlowField(cols, Math.round((cols * 9) / 16))
  })

  // The attributes share the simulation's own arrays: moving the particles is writing into them,
  // and uploading them is a flag. Nothing is copied or allocated per frame.
  const geometry = useDisposable(() => {
    const result = new BufferGeometry()
    result.setAttribute('position', new BufferAttribute(sim.positions, 3).setUsage(DynamicDrawUsage))
    result.setAttribute('aHeat', new BufferAttribute(sim.heat, 1).setUsage(DynamicDrawUsage))
    result.setAttribute('aSeed', new BufferAttribute(sim.seeds, 4))
    result.setDrawRange(0, sim.active)
    return result
  }, [sim])

  const uniforms = useMemo(
    () => ({
      uSize: { value: 0.03 },
      uFocal: { value: 900 },
      uFocusDistance: { value: CAMERA_Z },
      uFocusRange: { value: 5 },
      uIntensity: { value: 1 },
      uAdd: { value: 1 },
      uRed: { value: new Color() },
      uBlue: { value: new Color() },
      uInk: { value: new Color() },
    }),
    [],
  )
  const material = useDisposable(
    () =>
      new ShaderMaterial({
        uniforms,
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
      }),
    [uniforms],
  )

  const seen = useRef({ burst: 0, reset: 0, pulses: -1 })
  const look = useRef({ x: 0, y: 0 })

  useEffect(() => {
    seen.current = { burst: controls.current.burstVersion, reset: controls.current.resetVersion, pulses: -1 }
  }, [controls])

  const forces = useMemo(
    () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      presence: 0,
      sign: 1 as 1 | -1,
      strength: 1,
      radius: POINTER_RADIUS,
      time: 0,
      ambient: 1,
    }),
    [],
  )

  useLabFrame((s) => {
    const { pointer, clock, palette, motion, autonomous } = s
    const dt = clock.dt
    const ctl = controls.current
    const mesh = points.current
    if (!mesh) return

    // The view: how big the cloud is so any shape fits, and where the pointer is inside it.
    const halfHeight = Math.tan(MathUtils.degToRad(PARTICLE_CAMERA.fov) / 2) * CAMERA_Z
    const halfWidth = halfHeight * s.aspect
    const fit = clamp(Math.min(halfWidth / SHAPE_EXTENT.x, halfHeight / SHAPE_EXTENT.y), 0.32, 1.25)
    mesh.scale.setScalar(fit)
    const cloudHalfWidth = halfWidth / fit
    const cloudHalfHeight = halfHeight / fit

    // Commands from the panel.
    if (seen.current.reset !== ctl.resetVersion) {
      seen.current.reset = ctl.resetVersion
      sim.settle()
      flow.clear()
    }
    if (seen.current.burst !== ctl.burstVersion) {
      seen.current.burst = ctl.burstVersion
      sim.burst(0, 0, 1 * (autonomous ? 1 : 0.55))
    }
    sim.setShape(ctl.shape)
    const wanted = Math.max(1, Math.round(capacity * clamp(ctl.density, 0.05, 1)))
    if (wanted !== sim.active) {
      sim.setActive(wanted)
      geometry.setDrawRange(0, wanted)
    }

    // A click or tap blasts the cloud from the point under it.
    if (pointer.pulseVersion !== seen.current.pulses) {
      seen.current.pulses = pointer.pulseVersion
      const newest = pointer.newestPulse(clock.t, 0.5)
      if (newest)
        sim.burst(newest.x * cloudHalfWidth, newest.y * cloudHalfHeight, newest.strength * (autonomous ? 1 : 0.5))
    }

    // The pointer's force and the current it stirs.
    forces.x = pointer.x * cloudHalfWidth
    forces.y = pointer.y * cloudHalfHeight
    forces.vx = pointer.vx * cloudHalfWidth
    forces.vy = pointer.vy * cloudHalfHeight
    forces.presence = pointer.presence
    forces.sign = ctl.mode === 'attract' ? 1 : -1
    forces.strength = ctl.strength * (0.6 + 0.4 * motion)
    forces.time = clock.t
    forces.ambient = autonomous ? 1 : 0

    flow.setBounds(cloudHalfWidth, cloudHalfHeight)
    if (pointer.presence > 0.05 && pointer.speed > 0.015) {
      flow.splat(forces.x, forces.y, forces.vx * 0.55, forces.vy * 0.55, POINTER_RADIUS * 1.1, Math.min(1, dt * 14))
    }
    flow.step(dt)
    sim.step(dt, forces, flow)

    const position = geometry.getAttribute('position') as BufferAttribute
    const heat = geometry.getAttribute('aHeat') as BufferAttribute
    position.needsUpdate = true
    heat.needsUpdate = true

    // A little parallax: the camera leans after the pointer, so the layers slide against each other.
    look.current.x = damp(look.current.x, pointer.x * 0.55 * motion * pointer.presence, 0.3, dt)
    look.current.y = damp(look.current.y, pointer.y * 0.4 * motion * pointer.presence, 0.3, dt)
    camera.position.set(look.current.x, look.current.y, CAMERA_Z)
    camera.lookAt(0, 0, 0)

    uniforms.uFocal.value = gl.domElement.height / (2 * Math.tan(MathUtils.degToRad(PARTICLE_CAMERA.fov) / 2))
    uniforms.uSize.value = 0.021 * clamp(Math.sqrt(36_000 / capacity), 1, 2.1) * fit
    uniforms.uAdd.value = palette.additive
    uniforms.uIntensity.value = ctl.intensity * lerp(0.9, 0.5, palette.additive)
    uniforms.uRed.value.copy(palette.red)
    uniforms.uBlue.value.copy(palette.blue)
    uniforms.uInk.value.copy(palette.ink)

    // A calm (on-demand) canvas draws on while anything is still moving.
    return !autonomous && (sim.loosen > 0 || flow.peak > 0.01 || sim.disorder() > 0.015)
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />
}

export default function ParticleScene({ controls }: { controls: RefObject<ParticleControls> }) {
  return <Cloud controls={controls} />
}
