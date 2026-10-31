import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  type PerspectiveCamera,
} from 'three'
import { createEnvironment } from '../../experience/environment'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import {
  G,
  createCarState,
  deriveCarParams,
  newInput,
  placeCar,
  stepCar,
  type CarState,
  type DriverInput,
} from './carPhysics'
import { setupSignature, type CarSetup } from './carSetup'
import { createCarModel, type CarPose } from './carModel'
import {
  COUNTDOWN,
  TRIAL_LAPS,
  createLapTimer,
  updateLapTimer,
  type LapEvent,
  type LapTimer,
  type RaceMode,
} from './lapTimer'
import { RaceCamera, type CameraMode } from './racingCamera'
import type { Controls, RaceEvent, Telemetry } from './telemetry'
import { buildTrack } from './trackMesh'
import { gridSlot, sampleTrack, trackSignature, type TrackDef } from './trackModel'
import { readBest, saveBest } from './trackStore'

/** What the page can ask of the scene. */
export interface RacingApi {
  /** Back onto the road where the car is (R). The lap in progress no longer counts. */
  reset(): void
  /** Everything from the start: the car on the grid, a new timer. */
  restart(): void
}

interface RacingSceneProps {
  track: TrackDef
  setup: CarSetup
  mode: RaceMode
  /** Changing it starts again. */
  runId: number
  cameraMode: CameraMode
  controls: Controls
  telemetry: Telemetry
  apiRef: RefObject<RacingApi | null>
  onEvent: (event: RaceEvent) => void
}

/** The physics runs in fixed steps, whatever the frame rate. */
const STEP = 1 / 120

const SKY_TOP = { day: 0x7f9ae0, dusk: 0x10142e }
const SKY_HORIZON = { day: 0xf4e8d4, dusk: 0xff6a4f }
const FOG = { day: 0xe4e0d4, dusk: 0x6b4a54 }

export default function RacingScene({
  track,
  setup,
  mode,
  runId,
  cameraMode,
  controls,
  telemetry,
  apiRef,
  onEvent,
}: RacingSceneProps) {
  const lab = useLabScene()
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const tier = lab.profile.tier
  // The light follows the site's theme: a sunset behind the dark one, a clear afternoon behind the light one.
  const [dusk, setDusk] = useState(() => lab.palette.additive > 0.5)
  const look = dusk ? 'dusk' : 'day'

  const samples = useMemo(() => {
    const result = sampleTrack(track)
    if (!result) throw new Error('The track cannot be sampled')
    return result
  }, [track])
  const signature = useMemo(() => trackSignature(track), [track])
  const params = useMemo(() => deriveCarParams(setup), [setup])
  const bestKey = `${signature}:${setupSignature(setup)}`

  const built = useMemo(() => buildTrack(samples, { tier, dusk, seed: signature }), [samples, tier, dusk, signature])
  useEffect(() => () => built.dispose(), [built])
  const model = useMemo(() => createCarModel(), [])
  useEffect(() => () => model.dispose(), [model])
  const raceCamera = useMemo(() => new RaceCamera(samples), [samples])

  const car = useRef<CarState>(createCarState())
  const timer = useRef<LapTimer>(createLapTimer('practice', 0))
  const input = useRef<DriverInput>(newInput())
  const pose = useRef<CarPose>({ slope: 0, ax: 0, ay: 0, steer: 0, wheelAngle: 0, braking: false })
  const clock = useRef({
    accumulator: 0,
    time: 0,
    lastCollision: -9,
    lastInside: 0,
    wasOutside: false,
    lights: -1,
    lastBest: 0,
  })

  // The latest props, for the callbacks the frame loop and the api hold on to.
  const latest = useRef({ mode, onEvent, bestKey, params, samples })
  useEffect(() => {
    latest.current = { mode, onEvent, bestKey, params, samples }
  })

  // Sky, light, fog and reflections.
  const sky = useMemo(() => {
    const geometry = new SphereGeometry(2400, 24, 12)
    const material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new Color(SKY_TOP[look]) },
        uHorizon: { value: new Color(SKY_HORIZON[look]) },
        uGround: { value: new Color(FOG[look]) },
      },
      vertexShader:
        'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform vec3 uTop, uHorizon, uGround; varying vec3 vDir; void main() { float h = vDir.y; vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.5)) : mix(uHorizon, uGround, pow(-h, 0.35)); gl_FragColor = vec4(c, 1.0); }',
    })
    const mesh = new Mesh(geometry, material)
    mesh.renderOrder = -10
    mesh.frustumCulled = false
    return mesh
  }, [look])
  useEffect(
    () => () => {
      sky.geometry.dispose()
      ;(sky.material as ShaderMaterial).dispose()
    },
    [sky],
  )

  const sun = useMemo(() => new DirectionalLight(dusk ? 0xff9a6b : 0xfff1dc, dusk ? 2.4 : 2.8), [dusk])
  const sunTarget = useMemo(() => new Object3D(), [])
  const sunDirection = useMemo(() => (dusk ? { x: -0.8, y: 0.38, z: -0.45 } : { x: -0.5, y: 0.78, z: -0.4 }), [dusk])
  const shadows = tier !== 'low'
  const shadowSize = tier === 'high' ? 2048 : 1024
  useEffect(() => {
    sun.target = sunTarget
    sun.castShadow = shadows
    sun.shadow.mapSize.set(shadowSize, shadowSize)
    const cam = sun.shadow.camera
    cam.left = -46
    cam.right = 46
    cam.top = 46
    cam.bottom = -46
    cam.near = 5
    cam.far = 220
    cam.updateProjectionMatrix()
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.04
    scene.add(sun, sunTarget)
    return () => {
      scene.remove(sun, sunTarget)
      sun.shadow.map?.dispose()
      sun.dispose()
    }
  }, [scene, sun, sunTarget, shadows, shadowSize])

  useEffect(() => {
    gl.shadowMap.enabled = shadows
  }, [gl, shadows])

  useEffect(() => {
    scene.fog = new Fog(new Color(FOG[look]), 220, 1900)
    const environment = createEnvironment(gl, 'sky', 1, dusk)
    scene.environment = environment.texture
    scene.environmentIntensity = dusk ? 0.7 : 0.85
    return () => {
      scene.fog = null
      scene.environment = null
      environment.dispose()
    }
  }, [gl, scene, look, dusk])

  // Starting a run: the car on the grid, a fresh timer, the camera behind it.
  const startRun = useCallback(() => {
    const c = car.current
    const slot = gridSlot(samples, 6)
    placeCar(c, samples, slot.x, slot.z, slot.heading)
    timer.current = createLapTimer(mode, c.place.s, readBest(bestKey))
    clock.current.accumulator = 0
    clock.current.wasOutside = false
    clock.current.lights = -1
    telemetry.sinceGo = 99
    telemetry.best = timer.current.best
    raceCamera.snap()
  }, [samples, mode, bestKey, telemetry, raceCamera])
  useEffect(() => {
    startRun()
    telemetry.ready = true
    return () => {
      telemetry.ready = false
    }
  }, [startRun, runId, telemetry])

  const relay = useCallback(
    (event: LapEvent) => {
      if (event.type === 'lap' && event.best) saveBest(latest.current.bestKey, event.time)
      if (event.type === 'go') telemetry.sinceGo = 0
      latest.current.onEvent(event)
    },
    [telemetry],
  )

  useEffect(() => {
    apiRef.current = {
      restart: () => {
        startRun()
        latest.current.onEvent({ type: 'restart' })
      },
      reset: () => {
        const { samples: s } = latest.current
        const c = car.current
        const i = Math.round(c.place.s / s.spacing) % s.count
        const j = (i + 1) % s.count
        placeCar(c, s, s.x[i], s.z[i], Math.atan2(s.z[j] - s.z[i], s.x[j] - s.x[i]))
        if (timer.current.timing) timer.current.clean = false
        raceCamera.snap()
        latest.current.onEvent({ type: 'reset' })
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, raceCamera, startRun])

  // A handle for tests and the console in development only, like the renderer's `__labGl`.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = window as unknown as { __race?: unknown }
    debug.__race = { car: car.current, camera, controls, telemetry, timer, scene }
    return () => {
      delete debug.__race
    }
  }, [camera, controls, telemetry, scene])

  useLabFrame((s) => {
    const c = car.current
    const t = timer.current
    const now = clock.current
    const { keys, touch } = controls
    const drive = input.current
    const frozen = t.phase === 'countdown'

    // The player's hands.
    const left = keys.has('KeyA') || keys.has('ArrowLeft') || touch.left
    const right = keys.has('KeyD') || keys.has('ArrowRight') || touch.right
    drive.steer = (right ? 1 : 0) - (left ? 1 : 0)
    drive.throttle = keys.has('KeyW') || keys.has('ArrowUp') || touch.gas ? 1 : 0
    drive.brake = keys.has('KeyS') || keys.has('ArrowDown') || touch.brake ? 1 : 0
    drive.handbrake = keys.has('Space') || touch.hand
    if (frozen) {
      drive.throttle = 0
      drive.steer = 0
      // Held on the grid by the handbrake: the brake pedal alone would reverse the car.
      drive.handbrake = true
      drive.brake = 0
    }

    const { params: p, samples: lap, onEvent: emit } = latest.current
    const wantsDusk = s.palette.additive > 0.5
    if (wantsDusk !== dusk) setDusk(wantsDusk)

    now.accumulator = Math.min(now.accumulator + s.clock.dt, 0.1)
    while (now.accumulator >= STEP) {
      stepCar(c, drive, p, lap, STEP)
      now.time += STEP
      updateLapTimer(t, STEP, c.place.s, lap.length, Math.hypot(c.u, c.v), c.outside, relay)
      if (c.impact > 2.5 && now.time - now.lastCollision > 0.6) {
        now.lastCollision = now.time
        emit({ type: 'collision', speed: c.impact })
      }
      c.impact = 0
      if (c.outside) {
        if (!now.wasOutside && now.time - now.lastInside > 0.4 && t.phase !== 'countdown') emit({ type: 'offtrack' })
        now.wasOutside = true
      } else {
        now.wasOutside = false
        now.lastInside = now.time
      }
      now.accumulator -= STEP
    }
    if (t.phase === 'running' && t.timing) telemetry.sinceGo += s.clock.dt

    // The picture of the car.
    model.root.position.set(c.x, c.y, c.z)
    model.root.rotation.y = -c.psi
    const view = pose.current
    view.slope = Math.atan(c.place.slope * Math.cos(c.psi - c.place.heading))
    view.ax = c.ax
    view.ay = c.ay
    view.steer = c.steerAngle
    view.wheelAngle = c.wheelAngle
    view.braking = c.braking
    model.update(view)

    // The sun and the sky follow the car and the camera.
    sun.position.set(c.x + sunDirection.x * 90, c.y + sunDirection.y * 90, c.z + sunDirection.z * 90)
    sunTarget.position.set(c.x, c.y, c.z)
    sunTarget.updateMatrixWorld()
    raceCamera.update(camera, c, s.clock.dt, cameraMode, s.motion, model.helmet)
    sky.position.copy(camera.position)

    // The start lights.
    const lit =
      t.phase === 'countdown'
        ? Math.min(5, Math.floor((COUNTDOWN - t.countdown) / 0.6))
        : t.timing && telemetry.sinceGo < 1.4
          ? 10
          : 0
    if (lit !== now.lights) {
      now.lights = lit
      built.setLights(lit === 10 ? 5 : lit, lit === 10)
    }

    // What the page reads.
    telemetry.speed = Math.hypot(c.u, c.v) * 3.6
    telemetry.rpm = c.rpm
    telemetry.gear = c.gear
    telemetry.throttle = drive.throttle
    telemetry.brake = drive.brake
    telemetry.steer = c.steerInput
    telemetry.time = t.time
    telemetry.lap = t.lap
    telemetry.laps = latest.current.mode === 'trial' ? TRIAL_LAPS : 0
    telemetry.last = t.last
    telemetry.best = t.best
    telemetry.gates = t.gates
    telemetry.splits = t.splits
    telemetry.clean = t.clean
    telemetry.timing = t.timing
    telemetry.phase = t.phase
    telemetry.countdown = t.countdown
    telemetry.surface = c.surface
    telemetry.lateralG = c.ay / G
    telemetry.longG = c.ax / G
    telemetry.slide = c.slide
    telemetry.x = c.x
    telemetry.z = c.z
    telemetry.psi = c.psi
    telemetry.fraction = c.place.s / lap.length
    // A race never rests: the canvas keeps drawing.
    return true
  })

  return (
    <>
      <hemisphereLight args={[dusk ? 0x4a4f7a : 0xbfd4ff, dusk ? 0x2a2630 : 0x6a7a50, dusk ? 0.45 : 0.6]} />
      <primitive object={sky} />
      <primitive object={built.root} />
      <primitive object={model.root} />
    </>
  )
}
