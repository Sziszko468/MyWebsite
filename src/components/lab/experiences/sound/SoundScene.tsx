import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  Points,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import { clamp, damp, seededRandom } from '../../../hero/heroMath'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { createIcoSphere } from '../../core/resources'
import { useStore } from '../../experience/store'
import { useSettle } from '../../experience/useSettle'
import { SPECTRUM_BINS, WAVE_POINTS } from './soundAnalysis'
import type { SoundEngine } from './soundEngine'
import { SOUND_PALETTES, particleBudget, sound } from './soundParams'
import {
  FLARE_FRAGMENT,
  FLARE_VERTEX,
  ORB_FRAGMENT,
  ORB_VERTEX,
  PARTICLE_FRAGMENT,
  PARTICLE_VERTEX,
} from './soundShaders'

const RING_POOL = 5
/** Seconds a pulse ring takes to spread and fade. */
const RING_LIFE = 1.1
const WAVE_RADIUS = 3.35

/** Development only: what the scene is showing, for the browser checks. */
interface SoundDebugWindow extends Window {
  __labSoundView?: {
    bass: number
    mid: number
    high: number
    level: number
    beat: number
    lightA: number
    lightB: number
    rings: number
    particles: number
  }
}

/**
 * The world: a form at the middle that the bass pushes out and the loud moments make spiky, a shell
 * of particles each tied to one pitch, two lights that the high notes switch on, rings of light that
 * spread from every beat and every click, and the waveform drawn round it and along the floor. All
 * motion comes from the numbers the engine hands over each frame; before any sound it rests.
 */
export default function SoundScene({ engineRef }: { engineRef: RefObject<SoundEngine | null> }) {
  const lab = useLabScene()
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  useSettle()
  const settings = useStore(sound, (state) => state.settings)

  const capacity = particleBudget(lab.profile.particles)
  const detail = Math.min(lab.profile.heroDetail, 32)

  const parts = useMemo(() => {
    // The shell of particles: each point's height decides which pitch moves it.
    const random = seededRandom(5)
    const positions = new Float32Array(capacity * 3)
    const bins = new Float32Array(capacity)
    const seeds = new Float32Array(capacity * 2)
    for (let i = 0; i < capacity; i++) {
      const u = random() * 2 - 1
      const angle = random() * Math.PI * 2
      const ring = Math.sqrt(1 - u * u)
      const radius = 1.9 + Math.pow(random(), 1.4) * 0.95
      positions[i * 3] = Math.cos(angle) * ring * radius
      positions[i * 3 + 1] = u * radius
      positions[i * 3 + 2] = Math.sin(angle) * ring * radius
      bins[i] = clamp(Math.floor((u * 0.5 + 0.5 + (random() - 0.5) * 0.1) * SPECTRUM_BINS), 0, SPECTRUM_BINS - 1)
      seeds[i * 2] = random()
      seeds[i * 2 + 1] = random()
    }
    const particleGeometry = new BufferGeometry()
    particleGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    particleGeometry.setAttribute('aBin', new Float32BufferAttribute(bins, 1))
    particleGeometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 2))
    const particleMaterial = new ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpectrum: { value: new Float32Array(SPECTRUM_BINS) },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uBeat: { value: 0 },
        uPart: { value: 1 },
        uPixel: { value: 300 },
        uColA: { value: new Color() },
        uColB: { value: new Color() },
        uColC: { value: new Color() },
      },
    })
    const particles = new Points(particleGeometry, particleMaterial)
    particles.frustumCulled = false

    // The form at the middle.
    const orbGeometry = createIcoSphere(detail)
    const orbMaterial = new ShaderMaterial({
      vertexShader: ORB_VERTEX,
      fragmentShader: ORB_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uLevel: { value: 0 },
        uBeat: { value: 0 },
        uGeo: { value: 1 },
        uBase: { value: new Color() },
        uRim: { value: new Color() },
        uLightPos: { value: [new Vector3(), new Vector3()] },
        uLightCol: { value: [new Color(), new Color()] },
        uLightI: { value: [0, 0] },
      },
    })
    const orb = new Mesh(orbGeometry, orbMaterial)
    orb.scale.setScalar(1.15)
    orb.frustumCulled = false

    // The glow of the two lights.
    const flareGeometry = new BufferGeometry()
    const flarePosition = new Float32BufferAttribute(new Float32Array(6), 3)
    flarePosition.setUsage(DynamicDrawUsage)
    const flareSize = new Float32BufferAttribute(new Float32Array(2), 1)
    flareSize.setUsage(DynamicDrawUsage)
    const flareColor = new Float32BufferAttribute(new Float32Array(6), 3)
    flareColor.setUsage(DynamicDrawUsage)
    flareGeometry.setAttribute('position', flarePosition)
    flareGeometry.setAttribute('aSize', flareSize)
    flareGeometry.setAttribute('aColor', flareColor)
    const flareMaterial = new ShaderMaterial({
      vertexShader: FLARE_VERTEX,
      fragmentShader: FLARE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uPixel: { value: 300 } },
    })
    const flares = new Points(flareGeometry, flareMaterial)
    flares.frustumCulled = false

    // Rings of light that spread from a beat or a click.
    const ringGeometry = new RingGeometry(0.985, 1, 96)
    const rings = Array.from({ length: RING_POOL }, () => {
      const material = new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      })
      const mesh = new Mesh(ringGeometry, material)
      mesh.visible = false
      mesh.frustumCulled = false
      return { mesh, material, age: RING_LIFE, strength: 0 }
    })

    // The waveform: a ring round the world and a line along its floor.
    const waveRingGeometry = new BufferGeometry()
    const waveRingPosition = new Float32BufferAttribute(new Float32Array(WAVE_POINTS * 3), 3)
    waveRingPosition.setUsage(DynamicDrawUsage)
    waveRingGeometry.setAttribute('position', waveRingPosition)
    const waveMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false })
    const waveRing = new LineLoop(waveRingGeometry, waveMaterial)
    waveRing.rotation.x = 0.35
    waveRing.frustumCulled = false

    const scopeGeometry = new BufferGeometry()
    const scopePosition = new Float32BufferAttribute(new Float32Array(WAVE_POINTS * 3), 3)
    scopePosition.setUsage(DynamicDrawUsage)
    scopeGeometry.setAttribute('position', scopePosition)
    const scopeMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false })
    const scope = new Line(scopeGeometry, scopeMaterial)
    scope.frustumCulled = false

    return {
      particles,
      particleGeometry,
      particleMaterial,
      orb,
      orbGeometry,
      orbMaterial,
      flares,
      flareGeometry,
      flareMaterial,
      flarePosition,
      flareSize,
      flareColor,
      ringGeometry,
      rings,
      waveRing,
      waveRingGeometry,
      waveRingPosition,
      waveMaterial,
      scope,
      scopeGeometry,
      scopePosition,
      scopeMaterial,
    }
  }, [capacity, detail])

  useEffect(
    () => () => {
      parts.particleGeometry.dispose()
      parts.particleMaterial.dispose()
      parts.orbGeometry.dispose()
      parts.orbMaterial.dispose()
      parts.flareGeometry.dispose()
      parts.flareMaterial.dispose()
      parts.ringGeometry.dispose()
      for (const ring of parts.rings) ring.material.dispose()
      parts.waveRingGeometry.dispose()
      parts.waveMaterial.dispose()
      parts.scopeGeometry.dispose()
      parts.scopeMaterial.dispose()
    },
    [parts],
  )

  // The palette: three colours that every part takes its own from.
  const colours = useMemo(() => ({ a: new Color(), b: new Color(), c: new Color(), dark: new Color() }), [])
  useEffect(() => {
    const [a, b, c] = SOUND_PALETTES[settings.palette]
    colours.a.set(a)
    colours.b.set(b)
    colours.c.set(c)
    colours.dark.set(c).multiplyScalar(0.06)
    const u = parts.particleMaterial.uniforms
    u.uColA.value.copy(colours.a)
    u.uColB.value.copy(colours.b)
    u.uColC.value.copy(colours.c)
    const o = parts.orbMaterial.uniforms
    o.uBase.value.copy(colours.dark)
    o.uRim.value.copy(colours.a)
    ;(o.uLightCol.value as Color[])[0].copy(colours.b)
    ;(o.uLightCol.value as Color[])[1].copy(colours.c)
    parts.waveMaterial.color.copy(colours.c)
    parts.scopeMaterial.color.copy(colours.b)
    for (const ring of parts.rings) ring.material.color.copy(colours.a)
    invalidate()
  }, [settings.palette, colours, parts, invalidate])

  useEffect(() => {
    const fov = (camera.fov ?? 45) * (Math.PI / 180)
    const pixel = ((size.height * gl.getPixelRatio()) / (2 * Math.tan(fov / 2))) * 0.03
    parts.particleMaterial.uniforms.uPixel.value = pixel
    parts.flareMaterial.uniforms.uPixel.value = pixel * 4
    parts.particleGeometry.setDrawRange(0, Math.max(1, Math.round(capacity * settings.density)))
    invalidate()
  }, [camera, size.height, gl, parts, invalidate, capacity, settings.density])

  // The pointer: it steers the view a little, and a press sends a ring out.
  const state = useRef({ px: 0, py: 0, tx: 0, ty: 0, press: false, click: 0, yaw: 0, pitch: 0 })
  const latest = useRef({ settings })
  useEffect(() => {
    latest.current = { settings }
  })
  useEffect(() => {
    const element = gl.domElement.closest<HTMLElement>('[data-lab-stage]')
    if (!element) return
    const place = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      state.current.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1
      state.current.ty = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      invalidate()
    }
    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('button, input, select, label, a, [data-lab-ui]')) return
      place(event)
      state.current.press = true
      invalidate()
    }
    const leave = () => {
      state.current.tx = 0
      state.current.ty = 0
      invalidate()
    }
    element.addEventListener('pointermove', place)
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointerleave', leave)
    return () => {
      element.removeEventListener('pointermove', place)
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointerleave', leave)
    }
  }, [gl, invalidate])

  const backdrop = useMemo(() => new Color(0x0b0b0d), [])
  const lights = useMemo(() => [new Vector3(), new Vector3()], [])
  const look = useMemo(() => new Vector3(), [])

  useLabFrame((s) => {
    // The world is made of light: it is drawn on carbon in both themes.
    if (scene.background !== backdrop) scene.background = backdrop
    const dt = s.clock.dt
    const t = s.clock.t
    const set = latest.current.settings
    const engine = engineRef.current
    const frame = engine ? engine.read(dt) : null
    const st = state.current

    const sens = set.sensitivity
    const amount = 0.5 + 0.5 * s.motion
    const bass = frame ? Math.min(1, frame.bass * sens) : 0
    const mid = frame ? Math.min(1, frame.mid * sens) : 0
    const high = frame ? Math.min(1, frame.high * sens) : 0
    const level = frame ? Math.min(1, frame.level * sens) : 0

    // A beat or a press sends a ring out; a press also gives the world a push of its own.
    if (st.press) {
      st.press = false
      st.click = 1
      spawn(parts.rings, 1)
    }
    st.click = Math.max(0, st.click - dt / 0.35)
    if (frame?.beatHit) spawn(parts.rings, 0.55 + 0.45 * bass)
    const beat = Math.min(1, (frame ? frame.beat * Math.min(1.3, sens) : 0) + st.click * 0.8)

    // The particles and the form.
    const pu = parts.particleMaterial.uniforms
    pu.uTime.value = t
    const spectrum = pu.uSpectrum.value as Float32Array
    if (frame) for (let i = 0; i < SPECTRUM_BINS; i++) spectrum[i] = Math.min(1, frame.spectrum[i] * sens)
    else spectrum.fill(0)
    pu.uBass.value = bass
    pu.uMid.value = mid
    pu.uHigh.value = high
    pu.uBeat.value = beat
    pu.uPart.value = set.particles * amount

    const ou = parts.orbMaterial.uniforms
    ou.uTime.value = t
    ou.uBass.value = bass
    ou.uMid.value = mid
    ou.uLevel.value = level
    ou.uBeat.value = beat
    ou.uGeo.value = set.geometry * amount

    // Two lights circle the form; the high notes are what lights them.
    lights[0].set(Math.cos(t * 0.5) * 3.4, Math.sin(t * 0.37) * 1.6 + 0.6, Math.sin(t * 0.5) * 3.4)
    lights[1].set(
      Math.cos(t * 0.5 + Math.PI) * 3.0,
      Math.sin(t * 0.29 + 2) * 1.4 - 0.4,
      Math.sin(t * 0.5 + Math.PI) * 3.0,
    )
    const lit = set.lights * amount
    const intensityA = 0.1 + (high * 2.4 + beat * 0.35) * lit
    const intensityB = 0.08 + (high * 1.9 + mid * 0.5) * lit
    const positions = ou.uLightPos.value as Vector3[]
    positions[0].copy(lights[0])
    positions[1].copy(lights[1])
    const intensities = ou.uLightI.value as number[]
    intensities[0] = intensityA
    intensities[1] = intensityB

    const fp = parts.flarePosition.array as Float32Array
    const fs = parts.flareSize.array as Float32Array
    const fc = parts.flareColor.array as Float32Array
    lights.forEach((light, i) => {
      fp[i * 3] = light.x
      fp[i * 3 + 1] = light.y
      fp[i * 3 + 2] = light.z
      const strength = i === 0 ? intensityA : intensityB
      fs[i] = 0.25 + strength * 0.9
      const colour = i === 0 ? colours.b : colours.c
      fc[i * 3] = colour.r * Math.min(1, strength * 0.6)
      fc[i * 3 + 1] = colour.g * Math.min(1, strength * 0.6)
      fc[i * 3 + 2] = colour.b * Math.min(1, strength * 0.6)
    })
    parts.flarePosition.needsUpdate = true
    parts.flareSize.needsUpdate = true
    parts.flareColor.needsUpdate = true

    // The rings.
    let ringsAlive = 0
    for (const ring of parts.rings) {
      if (ring.age >= RING_LIFE) {
        ring.mesh.visible = false
        continue
      }
      ring.age += dt
      const life = Math.min(1, ring.age / RING_LIFE)
      ring.mesh.visible = life < 1
      ring.mesh.scale.setScalar(1.3 + life * 4.6)
      ring.material.opacity = Math.pow(1 - life, 2) * 0.7 * ring.strength * amount
      ringsAlive++
    }

    // The waveform, round the form and along the floor.
    const visible = set.waveform
    parts.waveRing.visible = visible
    parts.scope.visible = visible
    if (visible && frame) {
      const wr = parts.waveRingPosition.array as Float32Array
      const sc = parts.scopePosition.array as Float32Array
      const swing = Math.min(1.6, sens) * 0.55
      for (let i = 0; i < WAVE_POINTS; i++) {
        const w = frame.wave[i]
        const a = (i / WAVE_POINTS) * Math.PI * 2
        const r = WAVE_RADIUS + w * swing
        wr[i * 3] = Math.cos(a) * r
        wr[i * 3 + 1] = Math.sin(a) * r
        wr[i * 3 + 2] = 0
        sc[i * 3] = (i / (WAVE_POINTS - 1) - 0.5) * 8.4
        sc[i * 3 + 1] = -3.05 + w * swing
        sc[i * 3 + 2] = 0
      }
      parts.waveRingPosition.needsUpdate = true
      parts.scopePosition.needsUpdate = true
    }

    // The view follows the pointer a little, and drifts by itself while the scene may move alone.
    st.px = damp(st.px, st.tx, 0.22, dt)
    st.py = damp(st.py, st.ty, 0.22, dt)
    const yaw = st.px * 0.32 * s.motion + (s.autonomous ? Math.sin(t * 0.13) * 0.08 : 0)
    const pitch = st.py * 0.16 * s.motion
    // A tall, narrow stage (a phone upright) needs the camera further back for the whole world to fit.
    const distance = 9 * Math.max(1, 1.2 / Math.max(s.aspect, 0.4))
    camera.position.set(Math.sin(yaw) * distance, 0.4 + Math.sin(pitch) * distance, Math.cos(yaw) * distance)
    look.set(0, 0, 0)
    camera.lookAt(look)

    if (import.meta.env.DEV) {
      const debug = window as SoundDebugWindow
      debug.__labSoundView = {
        bass,
        mid,
        high,
        level,
        beat,
        lightA: intensityA,
        lightB: intensityB,
        rings: ringsAlive,
        particles: Math.round(capacity * set.density),
      }
    }

    return (
      (engine?.active ?? false) ||
      ringsAlive > 0 ||
      st.click > 0 ||
      Math.abs(st.px - st.tx) + Math.abs(st.py - st.ty) > 0.002
    )
  })

  return (
    <>
      <primitive object={parts.particles} />
      <primitive object={parts.orb} />
      <primitive object={parts.flares} />
      {parts.rings.map((ring, i) => (
        <primitive key={i} object={ring.mesh} />
      ))}
      <primitive object={parts.waveRing} />
      <primitive object={parts.scope} />
    </>
  )
}

/** Starts the oldest ring of the pool. */
function spawn(
  rings: Array<{ age: number; strength: number; mesh: Mesh; material: MeshBasicMaterial }>,
  strength: number,
) {
  let oldest = rings[0]
  for (const ring of rings) if (ring.age > oldest.age) oldest = ring
  oldest.age = 0
  oldest.strength = strength
  oldest.mesh.visible = true
}
