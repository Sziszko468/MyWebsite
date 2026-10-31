import { useThree } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import {
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  type IUniform,
} from 'three'
import { clamp, damp, lerp, seededRandom } from '../../../hero/heroMath'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { useDisposable } from '../../core/resources'
import type { SpaceControls } from './spaceControls'
import {
  DUST_FRAGMENT,
  DUST_VERTEX,
  GLOW_FRAGMENT,
  GLOW_VERTEX,
  PLANE_FRAGMENT,
  PLANE_VERTEX,
  RING_FRAGMENT,
  RING_VERTEX,
  STREAK_FRAGMENT,
  STREAK_VERTEX,
} from './spaceShaders'

const SPACE_CAMERA = { fov: 62, position: [0, 0, 0] as [number, number, number], far: 400 }

/** The length of the tunnel of depth, in world units. */
const DEPTH = 150
/** Units per second the space drifts at rest (drift 1), and how much more the pointer's energy adds. */
const DRIFT_SPEED = 9
const ENERGY_SPEED = 46
const PULSE_SPEED = 60

type SharedUniforms = Record<string, IUniform>

/** The values every system reads, shared by reference: one write updates streaks, planes, rings and dust together. */
function createSharedUniforms(): SharedUniforms {
  return {
    uTravel: { value: 0 },
    uTime: { value: 0 },
    uEnergy: { value: 0 },
    uDepth: { value: DEPTH },
    uBright: { value: 1 },
    uAdd: { value: 1 },
    uPulseT: { value: -1e4 },
    uPulseSpeed: { value: PULSE_SPEED },
    uPulseAmp: { value: 1 },
    uRed: { value: new Color() },
    uBlue: { value: new Color() },
    uInk: { value: new Color() },
    uAspect: { value: 1 },
    uPxNdc: { value: 0.002 },
    uStretch: { value: 0.1 },
    uPulseGlow: { value: 0 },
  }
}

function lightMaterial(uniforms: SharedUniforms, vertexShader: string, fragmentShader: string): ShaderMaterial {
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    // The streaks are expanded on screen, so which way their triangles face depends on the view.
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  })
}

/** A strip of two triangles: x across (-1..1), y along (0..1). */
function createStripGeometry(): InstancedBufferGeometry {
  const strip = new BufferGeometry()
  strip.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3))
  strip.setIndex([0, 1, 2, 2, 1, 3])
  const result = new InstancedBufferGeometry()
  result.index = strip.index
  result.setAttribute('position', strip.getAttribute('position'))
  strip.dispose()
  return result
}

/** An instanced geometry on a unit quad (-0.5..0.5), with one 4-wide attribute per name. */
function createQuadInstances(count: number, attributes: Record<string, Float32Array>): InstancedBufferGeometry {
  const quad = new PlaneGeometry(1, 1)
  const result = new InstancedBufferGeometry()
  result.index = quad.index
  result.setAttribute('position', quad.getAttribute('position'))
  quad.dispose()
  for (const [name, data] of Object.entries(attributes))
    result.setAttribute(name, new InstancedBufferAttribute(data, 4))
  result.instanceCount = count
  return result
}

function Streaks({ shared }: { shared: SharedUniforms }) {
  const { profile } = useLabScene()
  const count = profile.spaceStreaks
  const geometry = useDisposable(() => {
    const random = seededRandom(31)
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < seed.length; i++) seed[i] = random()
    const result = createStripGeometry()
    result.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4))
    result.instanceCount = count
    return result
  }, [count])
  const uniforms = useMemo(() => ({ ...shared, uWidth: { value: 1.5 } }), [shared])
  const material = useDisposable(() => lightMaterial(uniforms, STREAK_VERTEX, STREAK_FRAGMENT), [uniforms])
  const { gl } = useThree()
  useLabFrame(() => {
    uniforms.uWidth.value = 1.9 * gl.getPixelRatio()
  })
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

function Planes({ shared }: { shared: SharedUniforms }) {
  const { profile } = useLabScene()
  const count = profile.spacePlanes
  const geometry = useDisposable(() => {
    const random = seededRandom(47)
    const place = new Float32Array(count * 4)
    const shape = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      place.set([random(), 3.5 + random() * 9.5, (i + random() * 0.6) / count, random()], i * 4)
      shape.set([0.9 + random() * 3.2, 0.7 + random() * 2.1, (random() - 0.5) * 1.4, random()], i * 4)
    }
    return createQuadInstances(count, { aPlace: place, aShape: shape })
  }, [count])
  const material = useDisposable(() => lightMaterial(shared, PLANE_VERTEX, PLANE_FRAGMENT), [shared])
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

function Rings({ shared }: { shared: SharedUniforms }) {
  const { profile } = useLabScene()
  const count = profile.spaceRings
  const geometry = useDisposable(() => {
    const random = seededRandom(59)
    const ring = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      ring.set(
        [4 + (i % 4) * 2.6 + random() * 1.2, (i + random() * 0.5) / count, 0.012 + random() * 0.022, random()],
        i * 4,
      )
    }
    return createQuadInstances(count, { aRing: ring })
  }, [count])
  const material = useDisposable(() => lightMaterial(shared, RING_VERTEX, RING_FRAGMENT), [shared])
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

function Dust({ shared }: { shared: SharedUniforms }) {
  const { profile } = useLabScene()
  const count = profile.spaceDust
  const geometry = useDisposable(() => {
    const random = seededRandom(71)
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < seed.length; i++) seed[i] = random()
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3))
    result.setAttribute('aSeed', new Float32BufferAttribute(seed, 4))
    return result
  }, [count])
  const uniforms = useMemo(() => ({ ...shared, uSize: { value: 2.4 }, uPixelRatio: { value: 1 } }), [shared])
  const material = useDisposable(() => lightMaterial(uniforms, DUST_VERTEX, DUST_FRAGMENT), [uniforms])
  const { gl } = useThree()
  useLabFrame(() => {
    uniforms.uPixelRatio.value = gl.getPixelRatio()
  })
  return <points geometry={geometry} material={material} frustumCulled={false} />
}

/** A soft glow where the tunnel ends, the one fixed point the eye can hold on to. */
function Glow({ shared }: { shared: SharedUniforms }) {
  const geometry = useDisposable(() => new PlaneGeometry(1, 1), [])
  const material = useDisposable(() => lightMaterial(shared, GLOW_VERTEX, GLOW_FRAGMENT), [shared])
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />
}

/** The camera and the clock of the space: the only things the visitor steers. */
function Rig({ controls, shared }: { controls: RefObject<SpaceControls>; shared: SharedUniforms }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const gl = useThree((state) => state.gl)
  const state = useRef({
    travel: 0,
    boost: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    energy: 0,
    pulses: controls.current.pulseVersion,
    seenPointerPulses: -1,
  })

  useLabFrame((s) => {
    const { pointer, clock, palette, motion, autonomous } = s
    const dt = clock.dt
    const ctl = controls.current
    const st = state.current

    // A pulse, from the click or tap or the panel's button.
    if (st.pulses !== ctl.pulseVersion) {
      st.pulses = ctl.pulseVersion
      pointer.pulse(0, 0, clock.t, 1)
    }
    if (pointer.pulseVersion !== st.seenPointerPulses) {
      st.seenPointerPulses = pointer.pulseVersion
      const newest = pointer.newestPulse(clock.t, 0.5)
      if (newest) {
        shared.uPulseT.value = newest.time
        shared.uPulseAmp.value = 0.55 + 0.45 * motion
        st.boost = Math.max(st.boost, 0.35 + 0.65 * motion)
      }
    }

    // How fast the space moves: its own drift (live only), the energy of the pointer and the pulse's kick.
    st.energy = damp(st.energy, pointer.energy, 0.18, dt)
    const speed =
      ctl.drift * DRIFT_SPEED * (autonomous ? 1 : 0) +
      st.energy * ENERGY_SPEED * (0.4 + 0.6 * motion) +
      st.boost * 55 * motion
    st.travel += speed * dt
    st.boost = damp(st.boost, 0, 0.55, dt)

    // Where the camera looks: the pointer's direction turns it, its movement rolls it.
    const present = pointer.presence
    st.yaw = damp(st.yaw, -pointer.x * 0.5 * motion * present, 0.22, dt)
    st.pitch = damp(st.pitch, pointer.y * 0.32 * motion * present, 0.22, dt)
    st.roll = damp(st.roll, clamp(-pointer.vx * 0.06, -0.12, 0.12) * motion, 0.3, dt)
    camera.rotation.set(st.pitch, st.yaw, st.roll, 'YXZ')
    // The faster you move, the wider the lens opens: the tunnel pulls away at the edges.
    const fov = SPACE_CAMERA.fov + st.energy * 14 * motion + st.boost * 12 * motion
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    shared.uTravel.value = st.travel
    shared.uTime.value = clock.t
    shared.uEnergy.value = st.energy
    shared.uAspect.value = s.aspect
    shared.uPxNdc.value = 2 / Math.max(gl.domElement.height, 1)
    shared.uBright.value = lerp(1.3, 0.8, palette.additive)
    shared.uAdd.value = palette.additive
    shared.uRed.value.copy(palette.red)
    shared.uBlue.value.copy(palette.blue)
    shared.uInk.value.copy(palette.ink)
    shared.uStretch.value = (0.1 + st.energy * 0.9) * ctl.streak * (0.5 + 0.5 * motion) + st.boost * 0.5
    shared.uPulseGlow.value = Math.max(0, 1 - (clock.t - shared.uPulseT.value) / 1.6) * 0.8

    return st.energy > 0.01 || st.boost > 0.01 || clock.t - shared.uPulseT.value < 7
  })

  return null
}

export default function SpaceScene({ controls }: { controls: RefObject<SpaceControls> }) {
  const shared = useMemo(() => createSharedUniforms(), [])
  return (
    <>
      <Rig controls={controls} shared={shared} />
      <Glow shared={shared} />
      <Rings shared={shared} />
      <Planes shared={shared} />
      <Streaks shared={shared} />
      <Dust shared={shared} />
    </>
  )
}
