import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  BufferGeometry,
  Color,
  CustomBlending,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  MathUtils,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'
import { clamp, damp, seededRandom } from '../../hero/heroMath'
import { useLabFrame, useLabScene } from '../core/sceneContext'
import { useDisposable, createIcoSphere } from '../core/resources'
import { createSurfaceUniforms, SurfaceDriver } from '../core/surface'
import { CORE_FRAGMENT, CORE_VERTEX, DUST_FRAGMENT, DUST_VERTEX } from './heroShaders'

/** Where the core sits in its stage, set by the page from its layout. */
export interface HeroLayout {
  /** Centre offset as a fraction of the half-width (+ is right). */
  shiftX: number
  shiftY: number
  /** The core fills this fraction of the smaller half-extent of the view. */
  fit: number
}

const HERO_CAMERA = { fov: 40, position: [0, 0, 6.4] as [number, number, number] }
const CAMERA_Z = HERO_CAMERA.position[2]
/** The undisturbed sphere is radius 1; waves and noise push it out to about this. */
const HEADROOM = 1.38

function Core({ layout }: { layout: RefObject<HeroLayout> }) {
  const scene = useLabScene()
  const camera = useThree((state) => state.camera)
  const group = useRef<Group>(null)
  const geometry = useDisposable(() => createIcoSphere(scene.profile.heroDetail), [scene.profile.heroDetail])
  const uniforms = useMemo(
    () => ({
      ...createSurfaceUniforms(),
      uBase: { value: new Color() },
      uLine: { value: new Color() },
      uRed: { value: new Color() },
      uBlue: { value: new Color() },
      uLightDir: { value: new Vector3(0.4, 0.5, 0.8) },
      uStripes: { value: 9 },
      uContour: { value: 16 },
      uEnergy: { value: 0 },
      uAdd: { value: 1 },
    }),
    [],
  )
  const material = useDisposable(
    () => new ShaderMaterial({ uniforms, vertexShader: CORE_VERTEX, fragmentShader: CORE_FRAGMENT }),
    [uniforms],
  )
  const driver = useMemo(() => new SurfaceDriver(), [])
  const state = useRef({ rotX: 0.25, rotY: 0, velX: 0, velY: 0, lookX: 0, lookY: 0, energy: 0, drag: { x: 0, y: 0 } })

  useLabFrame((s) => {
    const g = group.current
    if (!g) return
    const { pointer, clock, palette, motion, autonomous } = s
    const dt = clock.dt
    const st = state.current
    const place = layout.current

    // Where the core sits and how big it is: it fills `fit` of the smaller half-extent of the view.
    const halfHeight = Math.tan(MathUtils.degToRad(HERO_CAMERA.fov) / 2) * CAMERA_Z
    const halfWidth = halfHeight * s.aspect
    g.scale.setScalar((Math.min(halfWidth, halfHeight) * place.fit) / HEADROOM)
    g.position.set(place.shiftX * halfWidth, place.shiftY * halfHeight, 0)

    // Dragging spins it with inertia; the pointer's position also tilts it a little, like looking at it.
    pointer.takeDrag(st.drag)
    st.velY += st.drag.x * 4.2 * motion
    st.velX -= st.drag.y * 4.2 * motion
    st.velX = clamp(st.velX, -6, 6)
    st.velY = clamp(st.velY, -6, 6)
    st.rotX += st.velX * dt
    st.rotY += st.velY * dt + (autonomous ? dt * 0.035 : 0)
    st.velX = damp(st.velX, 0, 0.55, dt)
    st.velY = damp(st.velY, 0, 0.55, dt)
    st.lookX = damp(st.lookX, -pointer.y * 0.2 * motion * pointer.presence, 0.25, dt)
    st.lookY = damp(st.lookY, pointer.x * 0.3 * motion * pointer.presence, 0.25, dt)
    g.rotation.set(st.rotX + st.lookX, st.rotY + st.lookY, 0)
    g.updateMatrixWorld(true)

    st.energy = damp(st.energy, pointer.energy, 0.22, dt)
    driver.update(s, camera, g, g.scale.x * 1.04, uniforms, {
      noiseSpeed: (autonomous ? 0.05 : 0) + st.energy * 0.45 * motion,
      hitStrength: 0.7 + 0.3 * motion,
    })

    uniforms.uPulseGain.value = 0.7
    uniforms.uAmp.value = 0.045 + 0.15 * st.energy
    uniforms.uFreq.value = 0.95 + 0.55 * st.energy
    uniforms.uEnergy.value = st.energy
    uniforms.uAdd.value = palette.additive
    uniforms.uBase.value.copy(palette.bg).lerp(palette.ink, 0.07)
    uniforms.uLine.value.copy(palette.ink)
    uniforms.uRed.value.copy(palette.red)
    uniforms.uBlue.value.copy(palette.blue)
    uniforms.uLightDir.value.set(pointer.x * 0.9, 0.35 + pointer.y * 0.7, 0.9).normalize()

    return st.energy > 0.01 || Math.abs(st.velX) + Math.abs(st.velY) > 0.01 || driver.hasWaves(s)
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}

function Dust() {
  const scene = useLabScene()
  const gl = useThree((state) => state.gl)
  const points = useRef<Points>(null)
  const count = scene.profile.heroDust

  const geometry = useDisposable(() => {
    const random = seededRandom(7)
    const position = new Float32Array(count * 3)
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      const u = random() * 2 - 1
      const angle = random() * Math.PI * 2
      const ring = Math.sqrt(1 - u * u)
      const radius = 1.75 + Math.pow(random(), 1.7) * 1.9
      position[i * 3] = Math.cos(angle) * ring * radius
      position[i * 3 + 1] = u * radius * 0.82
      position[i * 3 + 2] = Math.sin(angle) * ring * radius
      seed[i * 4] = random()
      seed[i * 4 + 1] = random()
      seed[i * 4 + 2] = random()
      seed[i * 4 + 3] = random()
    }
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(position, 3))
    result.setAttribute('aSeed', new Float32BufferAttribute(seed, 4))
    return result
  }, [count])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uBurst: { value: -1e4 },
      uBurstAmt: { value: 0.5 },
      uSize: { value: 3.4 },
      uPixelRatio: { value: 1 },
      uAspect: { value: 1 },
      uPointerAmt: { value: 0 },
      uPointer: { value: new Vector2() },
      uRed: { value: new Color() },
      uBlue: { value: new Color() },
      uInk: { value: new Color() },
      uBright: { value: 1 },
      uAdd: { value: 1 },
    }),
    [],
  )
  const material = useDisposable(
    () =>
      new ShaderMaterial({
        uniforms,
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
      }),
    [uniforms],
  )
  const seen = useRef(-1)
  const phase = useRef(0)

  useLabFrame((s) => {
    const { pointer, clock, palette, motion, autonomous } = s
    phase.current += clock.dt * ((autonomous ? 1 : 0) + pointer.energy * 2.2 * motion)
    uniforms.uTime.value = clock.t
    uniforms.uPhase.value = phase.current
    uniforms.uPixelRatio.value = gl.getPixelRatio()
    uniforms.uAspect.value = s.aspect
    uniforms.uPointer.value.set(pointer.x, pointer.y)
    uniforms.uPointerAmt.value = pointer.presence
    uniforms.uBurstAmt.value = 0.55 * motion
    uniforms.uAdd.value = palette.additive
    uniforms.uRed.value.copy(palette.red)
    uniforms.uBlue.value.copy(palette.blue)
    uniforms.uInk.value.copy(palette.ink)
    uniforms.uBright.value = palette.glow * 0.5

    if (pointer.pulseVersion !== seen.current) {
      seen.current = pointer.pulseVersion
      const newest = pointer.newestPulse(clock.t, 0.5)
      if (newest) uniforms.uBurst.value = newest.time
    }
    return autonomous ? false : pointer.energy > 0.01 || pointer.hasPulses(clock.t, 3)
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />
}

/** Thin orbit lines around the core, tilted by the pointer. They are what makes the form read as a structure. */
function Orbits() {
  const root = useRef<Group>(null)

  const loops = useMemo(() => {
    const radii = [2.15, 2.62, 3.1]
    const tilts: Array<[number, number, number]> = [
      [1.15, 0.2, 0],
      [0.55, -0.6, 0.4],
      [1.45, 0.9, -0.3],
    ]
    return radii.map((radius, index) => {
      const points = new Float32Array(193 * 3)
      for (let i = 0; i <= 192; i++) {
        const a = (i / 192) * Math.PI * 2
        points[i * 3] = Math.cos(a) * radius
        points[i * 3 + 1] = 0
        points[i * 3 + 2] = Math.sin(a) * radius
      }
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
      const material = new LineBasicMaterial({ transparent: true, opacity: 0.28 - index * 0.05, depthWrite: false })
      const line = new Line(geometry, material)
      line.rotation.set(...tilts[index])
      return line
    })
  }, [])

  useEffect(
    () => () => {
      for (const line of loops) {
        line.geometry.dispose()
        ;(line.material as LineBasicMaterial).dispose()
      }
    },
    [loops],
  )

  const spin = useRef(0)
  useLabFrame((s) => {
    const group = root.current
    if (!group) return
    const { pointer, clock, palette, motion, autonomous } = s
    spin.current += clock.dt * ((autonomous ? 0.05 : 0) + pointer.energy * 0.6 * motion)
    group.rotation.set(-pointer.y * 0.18 * motion, spin.current + pointer.x * 0.25 * motion, 0)
    for (const line of loops) (line.material as LineBasicMaterial).color.copy(palette.ink)
    return pointer.energy > 0.01
  })

  return (
    <group ref={root}>
      {loops.map((line, index) => (
        <primitive key={index} object={line} />
      ))}
    </group>
  )
}

/** The Lab hero's scene: a contour-line core that the pointer dents and a click sends waves across, a halo of dust and thin orbits. */
export default function LabHeroScene({ layout }: { layout: RefObject<HeroLayout> }) {
  return (
    <>
      <Orbits />
      <Core layout={layout} />
      <Dust />
    </>
  )
}
