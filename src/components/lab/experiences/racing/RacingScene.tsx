import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  BackSide,
  Color,
  DirectionalLight,
  BufferGeometry,
  Float32BufferAttribute,
  ConeGeometry,
  Fog,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  BoxGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  type PerspectiveCamera,
} from 'three'
import { createEnvironment } from '../../experience/environment'
import { useStore } from '../../experience/store'
import { GLOW_COLOUR, carLook } from './carLook'
import {
  checkpointScore,
  newCheckpointRun,
  newPrecisionRun,
  planCheckpoints,
  planSlalom,
  precisionResult,
  slalomFits,
  updateCheckpoints,
  updatePrecision,
  type CheckpointRun,
  type Cone,
  type PrecisionRun,
} from './challenges'
import { simulateLap } from './lapSim'
import { newDrift, sideslip, updateDrift, type DriftState } from './drift'
import { GhostRecorder, ghostTimeAt, loadGhost, newPlace, sampleGhost, saveGhost, type Ghost } from './ghost'
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
import { buildTrack, seeded } from './trackMesh'
import { gridSlot, sampleTrack, trackSignature, type TrackDef } from './trackModel'
import { award } from '../../progress/progress'
import { readBest, readDriftBest, saveBest, saveDriftBest } from './trackStore'
import { atmosphere, conditionsKey, resolveTime, wetFactor, type Conditions } from './weather'

/** What the page can ask of the scene. */
export interface RacingApi {
  /** Back onto the road where the car is (R). The lap in progress no longer counts. */
  reset(): void
  /** Everything from the start: the car on the grid, a new timer. */
  restart(): void
  /** Plays the last completed lap back. False if there is none yet. */
  startReplay(): boolean
  stopReplay(): void
  /** Pauses, changes the speed or jumps to a time (seconds from the line). */
  setReplay(change: { paused?: boolean; rate?: number; time?: number }): void
}

interface RacingSceneProps {
  track: TrackDef
  setup: CarSetup
  mode: RaceMode
  /** Changing it starts again. */
  runId: number
  cameraMode: CameraMode
  /** Race the best lap of this track and setup, if there is one. */
  ghostOn: boolean
  conditions: Conditions
  controls: Controls
  telemetry: Telemetry
  apiRef: RefObject<RacingApi | null>
  onEvent: (event: RaceEvent) => void
}

/** The physics runs in fixed steps, whatever the frame rate. */
const STEP = 1 / 120

export default function RacingScene({
  track,
  setup,
  mode,
  runId,
  cameraMode,
  ghostOn,
  conditions,
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
  const time = resolveTime(conditions, dusk)
  const atm = useMemo(() => atmosphere(conditions.sky, time), [conditions.sky, time])
  const dark = time !== 'day'

  const samples = useMemo(() => {
    const result = sampleTrack(track)
    if (!result) throw new Error('The track cannot be sampled')
    return result
  }, [track])
  const signature = useMemo(() => trackSignature(track), [track])
  const params = useMemo(() => deriveCarParams(setup, wetFactor(conditions.sky)), [setup, conditions.sky])
  const bestKey = `${signature}:${setupSignature(setup)}${conditionsKey(conditions)}`

  const built = useMemo(
    () => buildTrack(samples, { tier, dusk: dark, seed: signature }),
    [samples, tier, dark, signature],
  )
  useEffect(() => () => built.dispose(), [built])
  const model = useMemo(() => createCarModel(), [])
  useEffect(() => () => model.dispose(), [model])
  // The ghost is the same car, seen through: it is never part of the physics.
  const ghostModel = useMemo(() => {
    const ghostCar = createCarModel()
    ghostCar.root.visible = false
    ghostCar.root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.castShadow = false
      const material = object.material as MeshBasicMaterial
      material.transparent = true
      material.opacity = 0.34
      material.depthWrite = false
    })
    return ghostCar
  }, [])
  useEffect(() => () => ghostModel.dispose(), [ghostModel])
  // The look: paint, stripe, rims and the light under the floor.
  const look = useStore(carLook, (value) => value)
  useEffect(() => {
    model.applyLook(look)
  }, [model, look])
  const underglow = useMemo(() => {
    const light = new PointLight(0xffffff, 0, 7, 1.6)
    light.position.set(0, 0.14, 0)
    return light
  }, [])
  useEffect(() => {
    model.root.add(underglow)
    return () => {
      model.root.remove(underglow)
      underglow.dispose()
    }
  }, [model, underglow])
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
    lastSince: 0,
  })
  const ghost = useRef<Ghost | null>(null)
  const recorder = useRef(new GhostRecorder())
  const ghostPlace = useRef(newPlace())
  const drift = useRef<DriftState>(newDrift())
  const ckpt = useRef<CheckpointRun | null>(null)
  const prec = useRef<PrecisionRun | null>(null)
  const runStart = useRef(0)
  const challengeEnded = useRef(false)
  const lastLap = useRef<Ghost | null>(null)
  const replay = useRef({ active: false, time: 0, rate: 1, paused: false })
  const replayCar = useRef(createCarState())
  const replayPlace = useRef(newPlace())
  const driftEnded = useRef(false)

  // The latest props, for the callbacks the frame loop and the api hold on to.
  const latest = useRef({ mode, onEvent, bestKey, params, samples, ghostOn })
  useEffect(() => {
    latest.current = { mode, onEvent, bestKey, params, samples, ghostOn }
  })

  // The ghost of this track and setup, from the browser's storage.
  useEffect(() => {
    ghost.current = ghostOn ? loadGhost(bestKey) : null
  }, [ghostOn, bestKey, runId])

  // Sky, light, fog and reflections.
  const sky = useMemo(() => {
    const geometry = new SphereGeometry(2400, 24, 12)
    const material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new Color(atm.top) },
        uHorizon: { value: new Color(atm.horizon) },
        uGround: { value: new Color(atm.fog) },
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
  }, [atm])
  useEffect(
    () => () => {
      sky.geometry.dispose()
      ;(sky.material as ShaderMaterial).dispose()
    },
    [sky],
  )

  const sun = useMemo(() => new DirectionalLight(atm.sun.color, atm.sun.intensity), [atm])
  const sunTarget = useMemo(() => new Object3D(), [])
  const sunDirection = atm.sun
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
    scene.fog = new Fog(new Color(atm.fog), atm.fogNear, atm.fogFar)
    const environment = createEnvironment(gl, 'sky', 1, dark)
    scene.environment = environment.texture
    scene.environmentIntensity = atm.environment
    return () => {
      scene.fog = null
      scene.environment = null
      environment.dispose()
    }
  }, [gl, scene, atm, dark])

  useEffect(() => {
    underglow.intensity = look.glow === 'off' ? 0 : time === 'day' ? 12 : 30
    if (look.glow !== 'off') underglow.color.setHex(GLOW_COLOUR[look.glow])
  }, [underglow, look.glow, time])

  // The car's own light, for dusk, night, rain and fog.
  const lamps = useMemo(() => {
    const lights = [-0.45, 0.45].map((side) => {
      const lamp = new SpotLight(0xfff3d8, 0, 150, 0.5, 0.65, 1.4)
      lamp.position.set(2.3, 0.55, side)
      lamp.target.position.set(32, 0, side * 0.6)
      return lamp
    })
    return lights
  }, [])
  useEffect(() => {
    for (const lamp of lamps) {
      lamp.intensity = atm.headlights ? (time === 'night' ? 260 : 120) : 0
      model.root.add(lamp, lamp.target)
    }
    return () => {
      for (const lamp of lamps) {
        model.root.remove(lamp, lamp.target)
        lamp.dispose()
      }
    }
  }, [lamps, model, atm.headlights, time])

  useEffect(() => {
    built.setWet(atm.wet)
  }, [built, atm.wet])

  // Rain: streaks round the camera that fall, and slant with the car's speed. Fixed arrays, nothing made per frame.
  const rain = useMemo(() => {
    if (!atm.rain) return null
    const count = tier === 'high' ? 1600 : tier === 'medium' ? 900 : 420
    const positions = new Float32Array(count * 6)
    const random = seeded('rain')
    for (let i = 0; i < count; i++) {
      positions[i * 6] = (random() - 0.5) * 70
      positions[i * 6 + 1] = random() * 38 - 3
      positions[i * 6 + 2] = (random() - 0.5) * 70
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    const material = new LineBasicMaterial({
      color: 0xcfd8ff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: false,
    })
    const lines = new LineSegments(geometry, material)
    lines.frustumCulled = false
    lines.renderOrder = 5
    return { lines, positions, count, geometry, material }
  }, [atm.rain, tier])
  useEffect(
    () => () => {
      rain?.geometry.dispose()
      rain?.material.dispose()
    },
    [rain],
  )

  // What the challenges put on the track: gates for the Checkpoint Challenge, cones for Precision Driving.
  const estimate = useMemo(() => simulateLap(samples, params), [samples, params])
  const props = useMemo(() => {
    const materials = {
      pending: new MeshStandardMaterial({
        color: 0x1b2570,
        emissive: 0x445cff,
        emissiveIntensity: 0.5,
        roughness: 0.5,
      }),
      active: new MeshStandardMaterial({ color: 0x5a4a10, emissive: 0xffd166, emissiveIntensity: 1.8, roughness: 0.4 }),
      passed: new MeshStandardMaterial({ color: 0x0d3a22, emissive: 0x23ff6a, emissiveIntensity: 0.8, roughness: 0.5 }),
      missed: new MeshStandardMaterial({ color: 0x400808, emissive: 0xff161f, emissiveIntensity: 0.8, roughness: 0.5 }),
      cone: new MeshStandardMaterial({ color: 0xff7a2f, roughness: 0.6 }),
    }
    const post = new BoxGeometry(0.4, 5.2, 0.4)
    const beam = new BoxGeometry(0.45, 0.6, 1)
    const cone = new ConeGeometry(0.24, 0.7, 12)
    cone.translate(0, 0.35, 0)
    const group = new Group()
    group.name = 'LabChallenge'
    return { materials, post, beam, cone, group, gates: [] as Group[], cones: null as InstancedMesh | null }
  }, [])
  useEffect(
    () => () => {
      for (const material of Object.values(props.materials)) material.dispose()
      props.post.dispose()
      props.beam.dispose()
      props.cone.dispose()
      props.cones?.dispose()
    },
    [props],
  )
  const paintGates = useCallback(
    (run: CheckpointRun) => {
      props.gates.forEach((gate, i) => {
        const state =
          i < run.next ? (gateOutcome.current[i] ? 'passed' : 'missed') : i === run.next ? 'active' : 'pending'
        gate.traverse((object) => {
          if (object instanceof Mesh) object.material = props.materials[state]
        })
      })
    },
    [props],
  )
  const gateOutcome = useRef<boolean[]>([])
  const placeCones = useCallback(
    (run: PrecisionRun) => {
      const flat = run.gates.flatMap((gate) => gate.cones)
      const matrix = new Matrix4()
      const turn = new Quaternion()
      const one = new Vector3(1, 1, 1)
      const at = new Vector3()
      flat.forEach((cone: Cone, i) => {
        if (cone.knocked) {
          // Sent along the way the car was going, lying on its side.
          turn.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2 - 0.2)
          turn.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.atan2(cone.pushZ, cone.pushX)))
          at.set(cone.x + cone.pushX * 2.2, cone.y + 0.2, cone.z + cone.pushZ * 2.2)
        } else {
          turn.identity()
          at.set(cone.x, cone.y, cone.z)
        }
        matrix.compose(at, turn, one)
        props.cones?.setMatrixAt(i, matrix)
      })
      if (props.cones) props.cones.instanceMatrix.needsUpdate = true
    },
    [props],
  )

  // Starting a run: the car on the grid, a fresh timer, the camera behind it.
  const startRun = useCallback(() => {
    const c = car.current
    const slot = gridSlot(samples, 6)
    placeCar(c, samples, slot.x, slot.z, slot.heading)
    timer.current = createLapTimer(mode, c.place.s, readBest(bestKey))
    clock.current.accumulator = 0
    clock.current.wasOutside = false
    clock.current.lights = -1
    clock.current.lastSince = 0
    replay.current.active = false
    lastLap.current = null
    drift.current = newDrift(readDriftBest(bestKey))
    driftEnded.current = false
    challengeEnded.current = false
    runStart.current = c.place.s
    // The challenge scenery of this mode, and nothing of the others.
    props.group.clear()
    props.gates.length = 0
    props.cones?.dispose()
    props.cones = null
    ckpt.current = null
    prec.current = null
    if (mode === 'checkpoint') {
      const plan = planCheckpoints(samples, estimate.speed, c.place.s)
      ckpt.current = newCheckpointRun(plan)
      gateOutcome.current = []
      for (const gate of plan.gates) {
        const holder = new Group()
        holder.position.set(gate.x, gate.y, gate.z)
        holder.rotation.y = -gate.heading
        for (const side of [-1, 1]) {
          const post = new Mesh(props.post, props.materials.pending)
          post.position.set(0, 2.6, side * (gate.half + 1.2))
          holder.add(post)
        }
        const top = new Mesh(props.beam, props.materials.pending)
        top.scale.z = 2 * gate.half + 2.4
        top.position.set(0, 5.3, 0)
        holder.add(top)
        props.group.add(holder)
        props.gates.push(holder)
      }
      paintGates(ckpt.current)
    } else if (mode === 'precision' && slalomFits(samples, c.place.s)) {
      prec.current = newPrecisionRun(planSlalom(samples, c.place.s))
      const total = prec.current.gates.length * 2
      props.cones = new InstancedMesh(props.cone, props.materials.cone, total)
      props.cones.castShadow = true
      props.cones.frustumCulled = false
      props.group.add(props.cones)
      placeCones(prec.current)
    }
    recorder.current.reset()
    telemetry.sinceGo = 99
    telemetry.best = timer.current.best
    raceCamera.snap()
  }, [samples, mode, bestKey, telemetry, raceCamera, estimate, props, paintGates, placeCones])
  useEffect(() => {
    startRun()
    telemetry.ready = true
    return () => {
      telemetry.ready = false
    }
  }, [startRun, runId, telemetry])

  // A banked chain of drift points: told to the page, and the first real one is the First Drift.
  const bankChain = useCallback((points: number) => {
    if (points >= 40) award('drift:first', 20, 'first-drift')
    latest.current.onEvent({ type: 'drift', points })
  }, [])

  const relay = useCallback(
    (event: LapEvent) => {
      if (event.type === 'lap') {
        // The lap just driven can be watched again; if it is the best, it is also kept and raced next lap.
        const driven = recorder.current.finish(event.time)
        if (driven) lastLap.current = driven
        if (event.best) {
          saveBest(latest.current.bestKey, event.time)
          if (driven && saveGhost(latest.current.bestKey, driven)) {
            if (latest.current.ghostOn) ghost.current = driven
            latest.current.onEvent({ type: 'ghost', time: driven.time })
          }
        }
      }
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
      startReplay: () => {
        if (!lastLap.current) return false
        replay.current = { active: true, time: 0, rate: 1, paused: false }
        raceCamera.snap()
        return true
      },
      stopReplay: () => {
        replay.current.active = false
        raceCamera.snap()
      },
      setReplay: (change) => {
        const r = replay.current
        if (change.paused !== undefined) r.paused = change.paused
        if (change.rate !== undefined) r.rate = Math.min(4, Math.max(0.1, change.rate))
        if (change.time !== undefined) r.time = Math.min(lastLap.current?.time ?? 0, Math.max(0, change.time))
      },
      reset: () => {
        if (replay.current.active) return
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
    debug.__race = { car: car.current, camera, controls, telemetry, timer, scene, drift }
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

    // A replay plays the recorded lap and leaves the car, the timer and the physics where they were.
    const rp = replay.current
    const watching = rp.active && lastLap.current !== null
    if (watching && lastLap.current) {
      const g = lastLap.current
      const there = replayPlace.current
      if (!rp.paused) rp.time += s.clock.dt * rp.rate
      if (rp.time > g.time) rp.time = 0
      const rc = replayCar.current
      const gp1 = ghostPlace.current
      if (sampleGhost(g, rp.time, gp1) && sampleGhost(g, Math.min(rp.time + 0.05, g.time), there)) {
        const span = Math.min(rp.time + 0.05, g.time) - rp.time
        const speed = span > 1e-3 ? Math.hypot(there.x - gp1.x, there.z - gp1.z) / span : rc.u
        let turn = there.heading - gp1.heading
        while (turn > Math.PI) turn -= Math.PI * 2
        while (turn < -Math.PI) turn += Math.PI * 2
        const yaw = span > 1e-3 ? turn / span : 0
        const index = Math.round(gp1.distance / lap.spacing) % lap.count
        rc.ax += (Math.max(-45, Math.min(45, (speed - rc.u) / Math.max(s.clock.dt, 0.016))) - rc.ax) * 0.2
        rc.x = gp1.x
        rc.z = gp1.z
        rc.y = lap.y[index]
        rc.psi = gp1.heading
        rc.u = speed
        rc.v = 0
        rc.ay = speed * yaw
        rc.steerAngle = Math.max(-0.45, Math.min(0.45, Math.atan((3.4 * yaw) / Math.max(speed, 3))))
        rc.steerInput = rc.steerAngle / 0.45
        rc.braking = rc.ax < -9
        rc.slide = 0
        rc.surface = 'asphalt'
        if (!rp.paused) rc.wheelAngle += (speed / 0.33) * s.clock.dt * rp.rate
        rc.place.index = index
        rc.place.s = gp1.distance
        rc.place.slope = lap.slope[index]
        rc.place.heading = Math.atan2(lap.tz[index], lap.tx[index])
        rc.place.y = rc.y
      }
    }
    const shown = watching ? replayCar.current : c
    now.accumulator = watching ? 0 : Math.min(now.accumulator + s.clock.dt, 0.1)
    while (now.accumulator >= STEP) {
      stepCar(c, drive, p, lap, STEP)
      now.time += STEP
      updateLapTimer(t, STEP, c.place.s, lap.length, Math.hypot(c.u, c.v), c.outside, relay)
      // The lap is recorded from the line; crossing it starts a new recording (the finished one was kept above if it was the best).
      if (t.sinceLine >= 0 && t.phase === 'running') {
        if (t.sinceLine < now.lastSince) recorder.current.reset()
        recorder.current.add(t.sinceLine, c.x, c.z, c.psi, c.place.s)
        now.lastSince = t.sinceLine
      }
      if (c.impact > 2.5 && now.time - now.lastCollision > 0.6) {
        now.lastCollision = now.time
        emit({ type: 'collision', speed: c.impact })
      }
      if (latest.current.mode === 'drift') {
        const d = drift.current
        updateDrift(
          d,
          STEP,
          Math.hypot(c.u, c.v),
          sideslip(c.u, c.v),
          c.outside || c.impact > 2.5,
          t.phase === 'running' && t.timing,
          bankChain,
        )
        if (d.finished && !driftEnded.current) {
          driftEnded.current = true
          const record = d.score > readDriftBest(latest.current.bestKey)
          saveDriftBest(latest.current.bestKey, d.score)
          emit({ type: 'driftEnd', score: d.score, record })
        }
      }
      const challengeRunning = t.phase === 'running' && t.timing
      const along = (c.place.s - runStart.current + lap.length) % lap.length
      if (ckpt.current) {
        const run = ckpt.current
        updateCheckpoints(run, STEP, along, c.place.d, challengeRunning, (index, passed, bonus) => {
          gateOutcome.current[index] = passed
          paintGates(run)
          emit({ type: 'checkpoint', index, total: run.plan.gates.length, passed, bonus })
        })
        if (run.finished && !challengeEnded.current) {
          challengeEnded.current = true
          const score = checkpointScore(run)
          const record = run.won && score > readDriftBest(`c:${latest.current.bestKey}`)
          if (run.won) saveDriftBest(`c:${latest.current.bestKey}`, score)
          emit({
            type: 'challengeEnd',
            kind: 'checkpoint',
            won: run.won,
            score,
            record,
            passed: run.passed,
            total: run.plan.gates.length,
            hits: 0,
            missed: run.missed,
          })
        }
      }
      if (prec.current) {
        const run = prec.current
        updatePrecision(
          run,
          STEP,
          { x: c.x, z: c.z, heading: c.psi, u: along, d: c.place.d },
          challengeRunning,
          () => {
            placeCones(run)
            emit({ type: 'cone' })
          },
          (index, result) =>
            emit({
              type: 'slalomGate',
              index,
              total: run.gates.length,
              result: result === 'pending' ? 'missed' : result,
            }),
        )
        if (run.finished && !challengeEnded.current) {
          challengeEnded.current = true
          const result = precisionResult(run)
          const previousBest = readBest(`p:${latest.current.bestKey}`)
          const record = !run.timedOut && (previousBest === null || result < previousBest)
          if (!run.timedOut) saveBest(`p:${latest.current.bestKey}`, result)
          emit({
            type: 'challengeEnd',
            kind: 'precision',
            won: !run.timedOut,
            score: result,
            record,
            passed: run.clean,
            total: run.gates.length,
            hits: run.hits,
            missed: run.missed,
          })
        }
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
    model.root.position.set(shown.x, shown.y, shown.z)
    model.root.rotation.y = -shown.psi
    const view = pose.current
    view.slope = Math.atan(shown.place.slope * Math.cos(shown.psi - shown.place.heading))
    view.ax = shown.ax
    view.ay = shown.ay
    view.steer = shown.steerAngle
    view.wheelAngle = shown.wheelAngle
    view.braking = shown.braking
    model.update(view)

    // The ghost: where the best lap was this long after the line, and how far ahead or behind of it you are.
    const racing = ghost.current
    const gp = ghostPlace.current
    if (
      racing &&
      !watching &&
      latest.current.ghostOn &&
      t.phase === 'running' &&
      t.sinceLine >= 0 &&
      sampleGhost(racing, t.sinceLine, gp)
    ) {
      const i = Math.round(gp.distance / lap.spacing) % lap.count
      ghostModel.root.visible = true
      ghostModel.root.position.set(gp.x, lap.y[i], gp.z)
      ghostModel.root.rotation.y = -gp.heading
      view.slope = Math.atan(lap.slope[i])
      view.ax = 0
      view.ay = 0
      view.steer = 0
      view.wheelAngle = 0
      view.braking = false
      ghostModel.update(view)
      const there = ghostTimeAt(racing, shown.place.s)
      telemetry.ghostDelta = there === null ? null : t.sinceLine - there
    } else {
      ghostModel.root.visible = false
      telemetry.ghostDelta = null
    }
    telemetry.ghostTime = racing && latest.current.ghostOn ? racing.time : null
    const cr = ckpt.current
    telemetry.ckptPassed = cr?.passed ?? 0
    telemetry.ckptMissed = cr?.missed ?? 0
    telemetry.ckptTotal = cr?.plan.gates.length ?? 0
    telemetry.ckptRemaining = cr?.remaining ?? 0
    telemetry.ckptDistance =
      cr && cr.next < cr.plan.gates.length
        ? Math.max(0, cr.plan.gates[cr.next].u - ((shown.place.s - runStart.current + lap.length) % lap.length))
        : 0
    const pr = prec.current
    telemetry.precGate = pr ? Math.min(pr.next + 1, pr.gates.length) : 0
    telemetry.precTotal = pr?.gates.length ?? 0
    telemetry.precHits = pr?.hits ?? 0
    telemetry.precMissed = pr?.missed ?? 0
    telemetry.precTime = pr ? precisionResult(pr) : 0
    telemetry.driftScore = drift.current.score
    telemetry.driftChain = drift.current.chain
    telemetry.driftCombo = drift.current.combo
    telemetry.driftRemaining = drift.current.remaining
    telemetry.driftBest = drift.current.best
    telemetry.driftOn = drift.current.drifting

    // The rain follows the camera; each drop falls and is carried back by the car's speed.
    if (rain) {
      const { positions, count, lines, geometry } = rain
      const fall = 26 * (s.motion < 1 ? 0.6 : 1) * s.clock.dt
      const carried = Math.hypot(shown.u, shown.v)
      const dx = Math.cos(shown.psi) * carried * s.clock.dt
      const dz = Math.sin(shown.psi) * carried * s.clock.dt
      const tailX = Math.cos(shown.psi) * carried * 0.012
      const tailZ = Math.sin(shown.psi) * carried * 0.012
      for (let i = 0; i < count; i++) {
        const k = i * 6
        let x = positions[k] - dx
        let y = positions[k + 1] - fall
        let z = positions[k + 2] - dz
        if (y < -3) y += 38
        if (x < -35) x += 70
        else if (x > 35) x -= 70
        if (z < -35) z += 70
        else if (z > 35) z -= 70
        positions[k] = x
        positions[k + 1] = y
        positions[k + 2] = z
        positions[k + 3] = x - tailX
        positions[k + 4] = y + 0.9
        positions[k + 5] = z - tailZ
      }
      geometry.attributes.position.needsUpdate = true
      lines.position.copy(camera.position)
    }

    // The sun and the sky follow the car and the camera.
    sun.position.set(shown.x + sunDirection.x * 90, shown.y + sunDirection.y * 90, shown.z + sunDirection.z * 90)
    sunTarget.position.set(shown.x, shown.y, shown.z)
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
    telemetry.speed = Math.hypot(shown.u, shown.v) * 3.6
    telemetry.rpm = shown.rpm
    telemetry.gear = shown.gear
    telemetry.throttle = drive.throttle
    telemetry.brake = drive.brake
    telemetry.steer = shown.steerInput
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
    telemetry.surface = shown.surface
    telemetry.lateralG = shown.ay / G
    telemetry.longG = shown.ax / G
    telemetry.slide = shown.slide
    telemetry.x = shown.x
    telemetry.z = shown.z
    telemetry.psi = shown.psi
    telemetry.fraction = shown.place.s / lap.length
    telemetry.replay = watching
    telemetry.replayTime = rp.time
    telemetry.replayDuration = lastLap.current?.time ?? 0
    telemetry.replayRate = rp.rate
    telemetry.replayPaused = rp.paused
    // A race never rests: the canvas keeps drawing.
    return true
  })

  return (
    <>
      <hemisphereLight args={[atm.hemisphere.sky, atm.hemisphere.ground, atm.hemisphere.intensity]} />
      <primitive object={sky} />
      <primitive object={built.root} />
      <primitive object={model.root} />
      <primitive object={ghostModel.root} />
      {rain && <primitive object={rain.lines} />}
      <primitive object={props.group} />
    </>
  )
}
