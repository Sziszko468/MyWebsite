import type { CarSetup } from './carSetup'
import { newQuery, queryTrack, type Surface, type TrackQuery, type TrackSamples } from './trackModel'

/**
 * The car's physics: an arcade-flavoured dynamic bicycle model. Two axles carry the car; each axle's
 * tyres give a force that grows with slip angle and saturates at what the tyre's grip, the load on
 * it and the surface allow. The drive, the brakes and the lateral force share that grip (the
 * friction circle), so braking in a corner or opening the throttle too early costs steering. Weight
 * moves between the axles under braking and acceleration, downforce presses the car down with the
 * square of its speed, and drag takes it back. It is a game model, honest about being simplified:
 * it is neither a measurement of a real car nor a claim of one.
 *
 * Plan-view metres and seconds. Heading `psi` is 0 along +x and grows towards +z (clockwise on the
 * screen), so a positive yaw rate and a positive steering angle both turn right; `v` is the sideways
 * velocity to the right. No allocation in a step.
 */

export const G = 9.81
export const AIR = 1.2

// The car that every setup modifies.
const WHEELBASE = 3.4
const WHEEL_RADIUS = 0.33
const POWER = 420_000
const DRIVELINE = 0.93
const IDLE_RPM = 4500
const REDLINE_RPM = 12_000
const GEARS = 7
const FIRST = 3.37
const LAST = 1.07
/** Share of the downforce on the front axle. */
export const AERO_FRONT = 0.42
const CORNERING = 22
const RELAXATION = 0.9
/** Peak force of the brake system, in multiples of the car's weight. */
export const BRAKE_FORCE = 2.35
const NOSE = 2.3
const TAIL = 2.2
const HALF_WIDTH = 0.9
/**
 * How much of a tyre's grip the drive or the brakes may use: past it the tyre spins or locks. The
 * rest stays for steering, as it does on a real tyre, so a spinning wheel is not a lost car.
 */
const SLIDE = 0.9
/** The car can go no faster than this in reverse, m/s. */
const REVERSE_SPEED = 9

export const SURFACE_GRIP: Record<Surface, number> = { asphalt: 1, kerb: 0.92, grass: 0.55, gravel: 0.42, wall: 0.5 }
const SURFACE_DRAG: Record<Surface, number> = { asphalt: 0.015, kerb: 0.02, grass: 0.09, gravel: 0.3, wall: 0.05 }

export interface CarParams {
  mass: number
  wheelbase: number
  /** Centre of gravity to the front axle, m. */
  a: number
  /** Centre of gravity to the rear axle, m. */
  b: number
  inertia: number
  /** Share of the weight on the front axle at rest, 0 to 1. */
  frontWeight: number
  cgHeight: number
  /** Tyre friction coefficient, with the springs' effect on it already in. */
  mu: number
  /** Downforce coefficient times area, m², with the ride height's effect in. */
  downforce: number
  /** Drag coefficient times area, m², with the induced drag of the downforce in. */
  drag: number
  brakeBias: number
  /** Gear ratio times final drive, for each gear. */
  ratios: readonly number[]
  /** The share of its dry grip the road keeps: 1 dry, less in rain. */
  wet: number
  /** How quickly the load follows the car's acceleration, s. */
  transferTau: number
  /** Grip the springs and the ride height take away on a kerb. */
  kerbPenalty: number
}

const RATIOS_CACHE = new Map<number, readonly number[]>()

function ratiosFor(finalDrive: number): readonly number[] {
  const key = Math.round(finalDrive * 100)
  let ratios = RATIOS_CACHE.get(key)
  if (!ratios) {
    ratios = Array.from({ length: GEARS }, (_, i) => finalDrive * FIRST * Math.pow(LAST / FIRST, i / (GEARS - 1)))
    RATIOS_CACHE.set(key, ratios)
  }
  return ratios
}

/**
 * What a setup does to the car. Every line is a modelled effect with its size stated here, so the
 * Performance Lab can name it and a reader can check it:
 *  - downforce and drag scale the aero forces; downforce brings induced drag with it
 *  - a lower ride height raises downforce and drag a little (ground effect), 0.35 % per millimetre
 *  - springs have a best value for grip near 115 N/mm; softer ones roll, stiffer ones skip
 *  - stiff, low cars lose grip on kerbs
 *  - gearing sets the ratio of every gear; tyre grip and mass are the friction coefficient and the weight
 *  - the weight distribution moves the centre of gravity between the axles: more on the front axle
 *    steadies braking and bites into corners, less puts more load on the driven rear tyres
 */
export function deriveCarParams(setup: CarSetup, wet = 1): CarParams {
  const ride = 55 - setup.rideHeight
  const downforce = setup.downforce * (1 + 0.0035 * ride)
  const drag = setup.drag * (1 + 0.0015 * ride) + 0.07 * downforce
  const springs = (setup.springs - 115) / 80
  const platform = 1 - 0.05 * springs * springs
  const mass = setup.mass
  return {
    mass,
    wheelbase: WHEELBASE,
    a: WHEELBASE * (1 - setup.weightFront / 100),
    b: WHEELBASE * (setup.weightFront / 100),
    frontWeight: setup.weightFront / 100,
    inertia: mass * Math.pow(0.34 * WHEELBASE, 2),
    cgHeight: 0.29 + setup.rideHeight * 0.0005,
    mu: setup.tyreGrip * platform,
    wet,
    downforce,
    drag,
    brakeBias: setup.brakeBias / 100,
    ratios: ratiosFor(setup.gearing),
    transferTau: 0.32 * Math.sqrt(80 / setup.springs),
    kerbPenalty: Math.min(0.2, Math.max(0, (setup.springs - 90) / 600) + Math.max(0, (40 - setup.rideHeight) / 120)),
  }
}

/** Engine power as a fraction of the peak, by revs: a broad curve that is strong at the top. */
export function powerFraction(rpm: number): number {
  const x = (rpm - 10_500) / 6000
  return Math.max(0.28, 1 - x * x)
}

/** The force at the driven wheels in one gear at one speed (full throttle), N. */
export function driveForceAt(params: CarParams, gear: number, speed: number): number {
  const ratio = params.ratios[gear - 1]
  const rpm = Math.max(IDLE_RPM, (speed / WHEEL_RADIUS) * ratio * (60 / (2 * Math.PI)))
  if (rpm >= REDLINE_RPM) return 0
  const omega = (rpm * 2 * Math.PI) / 60
  return (POWER * powerFraction(rpm) * DRIVELINE * ratio) / (omega * WHEEL_RADIUS)
}

/** The strongest push forward at a speed over every gear, N: what an automatic gearbox tries to give. */
export function bestDriveForce(params: CarParams, speed: number): number {
  let best = 0
  for (let g = 1; g <= GEARS; g++) best = Math.max(best, driveForceAt(params, g, speed))
  return best
}

export function aeroForces(params: CarParams, speed: number): { downforce: number; drag: number } {
  const q = 0.5 * AIR * speed * speed
  return { downforce: q * params.downforce, drag: q * params.drag }
}

export function rollingResistance(params: CarParams): number {
  return 0.015 * params.mass * G
}

/** The highest speed at which the engine can still beat drag and rolling resistance, m/s. */
export function topSpeed(params: CarParams): number {
  let low = 10
  let high = 160
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    const push = bestDriveForce(params, mid)
    if (push > aeroForces(params, mid).drag + rollingResistance(params)) low = mid
    else high = mid
  }
  return low
}

/** The share of the braking that should go to the front for both axles to reach their limit together. */
export function idealBrakeBias(params: CarParams): number {
  return params.frontWeight + (params.mu * params.cgHeight) / params.wheelbase
}

/** How much of the best possible braking a bias gives, 0 to 1: the axle that locks first sets the limit. */
export function brakeEfficiency(params: CarParams): number {
  const ideal = idealBrakeBias(params)
  const f = params.brakeBias
  return f >= ideal ? ideal / f : (1 - ideal) / (1 - f)
}

// ── The car in motion ──────────────────────────────────────────────────────────────────

export interface DriverInput {
  /** 0 to 1. */
  throttle: number
  /** 0 to 1. */
  brake: number
  /** -1 (left) to 1 (right). */
  steer: number
  handbrake: boolean
}

export function newInput(): DriverInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false }
}

export interface CarState {
  x: number
  z: number
  y: number
  psi: number
  /** Forward velocity, m/s. */
  u: number
  /** Sideways velocity to the right, m/s. */
  v: number
  /** Yaw rate, rad/s: positive turns right. */
  r: number
  /** Smoothed steering input, -1 to 1, and the steering angle it makes, rad. */
  steerInput: number
  steerAngle: number
  gear: number
  rpm: number
  shiftTimer: number
  /** How far the wheels have turned, rad: for the picture. */
  wheelAngle: number
  /** Body accelerations, m/s²: for the picture and the g read-out. */
  ax: number
  ay: number
  /** Front and rear slip angles, rad. */
  slipFront: number
  slipRear: number
  /** Longitudinal acceleration the load follows, m/s². */
  transferAx: number
  /** Downforce now, N. */
  downforce: number
  /** The strongest wall hit since it was last cleared, m/s into the wall. */
  impact: number
  /** Under brakes, for the brake light. */
  braking: boolean
  /** The tyres are sliding noticeably: for the squeal and the smoke. */
  slide: number
  onKerb: boolean
  /** The centre of the car is on grass, gravel or against a wall: the lap is not clean. */
  outside: boolean
  surface: Surface
  /** Where the centre of the car is on the track. */
  place: TrackQuery
  corners: TrackQuery[]
}

export function createCarState(): CarState {
  return {
    x: 0,
    z: 0,
    y: 0,
    psi: 0,
    u: 0,
    v: 0,
    r: 0,
    steerInput: 0,
    steerAngle: 0,
    gear: 1,
    rpm: IDLE_RPM,
    shiftTimer: 0,
    wheelAngle: 0,
    ax: 0,
    ay: 0,
    slipFront: 0,
    slipRear: 0,
    transferAx: 0,
    downforce: 0,
    impact: 0,
    braking: false,
    slide: 0,
    onKerb: false,
    outside: false,
    surface: 'asphalt',
    place: newQuery(),
    corners: [newQuery(), newQuery(), newQuery(), newQuery()],
  }
}

const OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [NOSE, -HALF_WIDTH],
  [NOSE, HALF_WIDTH],
  [-TAIL, -HALF_WIDTH],
  [-TAIL, HALF_WIDTH],
]

/** Finds the car's centre and the four corners of its body on the track. Call after the car has been moved. */
export function locate(state: CarState, track: TrackSamples): void {
  const sin = Math.sin(state.psi)
  const cos = Math.cos(state.psi)
  const hint = state.place.index
  queryTrack(track, state.x, state.z, hint, state.place)
  for (let i = 0; i < 4; i++) {
    const [along, side] = OFFSETS[i]
    queryTrack(
      track,
      state.x + cos * along - sin * side,
      state.z + sin * along + cos * side,
      state.place.index,
      state.corners[i],
    )
  }
  state.y = state.place.y
  state.surface = state.place.surface
  state.outside = state.place.surface !== 'asphalt' && state.place.surface !== 'kerb'
}

/** Puts the car at rest on the track at a place, pointing a way. */
export function placeCar(state: CarState, track: TrackSamples, x: number, z: number, heading: number, speed = 0): void {
  state.x = x
  state.z = z
  state.psi = heading
  state.u = speed
  state.v = 0
  state.r = 0
  state.steerInput = 0
  state.steerAngle = 0
  state.gear = 1
  state.rpm = IDLE_RPM
  state.shiftTimer = 0
  state.ax = 0
  state.ay = 0
  state.transferAx = 0
  state.slipFront = 0
  state.slipRear = 0
  state.impact = 0
  state.slide = 0
  state.braking = false
  state.place.index = -1
  locate(state, track)
}

/** The steering angle the front wheels can reach at a speed: wide when slow, narrow when fast. */
export function maxSteerAngle(speed: number): number {
  const k = speed / 26
  return 0.45 / (1 + k * k)
}

/** Grip of a surface: a wet road loses all of the share it loses, rough ground only half of it. */
const gripOn = (surface: Surface, wet: number) =>
  SURFACE_GRIP[surface] * (surface === 'asphalt' || surface === 'kerb' ? wet : 1 - (1 - wet) * 0.5)

/** Advances the car by `dt` seconds (call with a small, fixed step). */
export function stepCar(state: CarState, input: DriverInput, params: CarParams, track: TrackSamples, dt: number): void {
  const { mass, a, b, wheelbase } = params
  const [fl, fr, rl, rr] = state.corners
  const place = state.place
  const gripFront = (gripOn(fl.surface, params.wet) + gripOn(fr.surface, params.wet)) / 2
  const gripRear = (gripOn(rl.surface, params.wet) + gripOn(rr.surface, params.wet)) / 2
  const kerb = fl.surface === 'kerb' || fr.surface === 'kerb' || rl.surface === 'kerb' || rr.surface === 'kerb'
  const resistance =
    (SURFACE_DRAG[fl.surface] + SURFACE_DRAG[fr.surface] + SURFACE_DRAG[rl.surface] + SURFACE_DRAG[rr.surface]) / 4
  state.onKerb = kerb

  // Controls: steering eases towards the key, and narrows with speed.
  const speed = Math.hypot(state.u, state.v)
  const rate = input.steer === 0 ? 5 : 3.4
  const toward = input.steer - state.steerInput
  state.steerInput += Math.sign(toward) * Math.min(Math.abs(toward), rate * dt)
  // At speed the wheel turns only a little, which keeps a straight line steady; in a slide it opens up
  // as far as the slide needs, so the car can be caught and held (counter-steering) instead of spun.
  const slideAngle = state.u > 3 ? Math.abs(Math.atan2(state.v, state.u)) : 0
  state.steerAngle = state.steerInput * Math.max(maxSteerAngle(speed), Math.min(0.45, 0.9 * slideAngle))
  const delta = state.steerAngle

  // Driving or reversing, braking or not.
  let throttle = input.throttle
  let brake = input.brake
  let reverse = 0
  if (brake > 0.05 && state.u < 0.8 && throttle < 0.05) {
    reverse = brake
    brake = 0
  } else if (throttle > 0.05 && state.u < -0.5) {
    brake = Math.max(brake, throttle)
    throttle = 0
  }
  // On a key the brake is all or nothing: ease off the pedal as the wheel turns, as a driver would.
  brake *= 1 - 0.35 * Math.abs(state.steerInput)

  // Gears.
  const total = params.ratios[state.gear - 1]
  state.rpm = Math.max(IDLE_RPM, (Math.abs(state.u) / WHEEL_RADIUS) * total * (60 / (2 * Math.PI)))
  if (state.shiftTimer > 0) state.shiftTimer -= dt
  else if (state.u > 0 && state.rpm > 11_500 && state.gear < GEARS) {
    state.gear++
    state.shiftTimer = 0.14
  } else if (state.rpm < 7000 && state.gear > 1) {
    state.gear--
    state.shiftTimer = 0.1
  }
  const ratio = params.ratios[state.gear - 1]
  state.rpm = Math.max(IDLE_RPM, (Math.abs(state.u) / WHEEL_RADIUS) * ratio * (60 / (2 * Math.PI)))

  // Loads: weight moves with the acceleration the car had a moment ago.
  state.transferAx += (state.ax - state.transferAx) * Math.min(1, dt / params.transferTau)
  const aero = aeroForces(params, speed)
  state.downforce = aero.downforce
  const weight = mass * G
  const transfer = (mass * state.transferAx * params.cgHeight) / wheelbase
  const loadFront = Math.max(0.12 * weight, weight * (b / wheelbase) + aero.downforce * AERO_FRONT - transfer)
  const loadRear = Math.max(0.12 * weight, weight * (a / wheelbase) + aero.downforce * (1 - AERO_FRONT) + transfer)

  // Grip: the tyre's coefficient, the surface, and a little less for each extra load (load sensitivity).
  const sensitivity = (load: number) => Math.pow(load / (weight / 2), -0.08)
  const kerbGrip = kerb ? 1 - params.kerbPenalty : 1
  const muFront = params.mu * gripFront * sensitivity(loadFront) * kerbGrip
  const muRear = params.mu * gripRear * sensitivity(loadRear) * kerbGrip * (input.handbrake ? 0.38 : 1)
  const capFront = muFront * loadFront
  const capRear = muRear * loadRear

  // Longitudinal forces: engine on the rear axle, brakes on both, each limited by its tyre.
  const direction = state.u >= 0 ? 1 : -1
  let drive = 0
  if (state.shiftTimer <= 0 && throttle > 0 && state.rpm < REDLINE_RPM) {
    const omega = (Math.max(state.rpm, IDLE_RPM) * 2 * Math.PI) / 60
    drive = (throttle * POWER * powerFraction(state.rpm) * DRIVELINE * ratio) / (omega * WHEEL_RADIUS)
  }
  if (reverse > 0 && state.u > -REVERSE_SPEED) drive = -reverse * 0.35 * Math.min(capRear, 9000)
  const demand = brake * BRAKE_FORCE * mass * G
  let brakeFront = Math.min(demand * params.brakeBias, SLIDE * capFront)
  let brakeRear = Math.min(demand * (1 - params.brakeBias), SLIDE * capRear)
  if (input.handbrake) brakeRear = Math.max(brakeRear, 0.85 * capRear)
  // Brakes cannot reverse the car: no more than what stops it within this step.
  const stopForce = (mass * Math.abs(state.u)) / dt
  const brakeTotal = brakeFront + brakeRear
  if (brakeTotal > stopForce) {
    const scale = stopForce / brakeTotal
    brakeFront *= scale
    brakeRear *= scale
  }
  state.braking = brake > 0.05 || input.handbrake

  const forceFrontX = -direction * brakeFront
  let forceRearX = drive - direction * brakeRear
  if (Math.abs(forceRearX) > SLIDE * capRear) forceRearX = Math.sign(forceRearX) * SLIDE * capRear

  // Lateral forces from slip angles, in what grip the longitudinal forces leave.
  const ux = Math.max(Math.abs(state.u), 2)
  const alphaFrontTarget =
    (state.u >= 0 ? delta : -delta) - Math.atan2(state.v + a * state.r, ux) * (state.u >= 0 ? 1 : -1)
  const alphaRearTarget = -Math.atan2(state.v - b * state.r, ux) * (state.u >= 0 ? 1 : -1)
  const follow = Math.min(1, (dt * ux) / RELAXATION)
  state.slipFront += (alphaFrontTarget - state.slipFront) * follow
  state.slipRear += (alphaRearTarget - state.slipRear) * follow
  const leftFront = Math.sqrt(Math.max(0, capFront * capFront - forceFrontX * forceFrontX))
  const leftRear = Math.sqrt(Math.max(0, capRear * capRear - forceRearX * forceRearX))
  const forceFrontY = leftFront * Math.tanh((CORNERING * state.slipFront) / Math.max(muFront, 0.2))
  const forceRearY = leftRear * Math.tanh((CORNERING * state.slipRear) / Math.max(muRear, 0.2))

  // Everything in the car's own frame.
  const sinD = Math.sin(delta)
  const cosD = Math.cos(delta)
  const q = 0.5 * AIR * params.drag
  const dragX = q * speed * state.u
  const dragY = q * speed * state.v
  const roll = direction * resistance * weight * Math.min(1, Math.abs(state.u) / 1.5)
  const grade = place.slope * Math.cos(state.psi - place.heading)
  const forceX = forceFrontX * cosD - forceFrontY * sinD + forceRearX - dragX - roll - weight * grade
  const forceY = forceFrontY * cosD + forceFrontX * sinD + forceRearY - dragY
  const yawMoment = a * (forceFrontY * cosD + forceFrontX * sinD) - b * forceRearY

  const accX = forceX / mass
  const accY = forceY / mass
  state.ax = accX
  state.ay = accY
  state.u += (accX + state.v * state.r) * dt
  state.v += (accY - state.u * state.r) * dt
  state.r += (yawMoment / params.inertia) * dt

  // Near a standstill the slip angles mean nothing: roll like a bicycle and let the sideways speed die.
  const crawl = Math.abs(state.u)
  if (crawl < 4) {
    const blend = 1 - crawl / 4
    state.r += ((state.u * Math.tan(delta)) / wheelbase - state.r) * blend * Math.min(1, dt * 8)
    state.v *= 1 - blend * Math.min(1, dt * 10)
  }
  if (state.u < 0 && input.throttle === 0 && input.brake === 0 && state.u > -0.3) state.u = 0

  state.psi += state.r * dt
  const sinNew = Math.sin(state.psi)
  const cosNew = Math.cos(state.psi)
  state.x += (state.u * cosNew - state.v * sinNew) * dt
  state.z += (state.u * sinNew + state.v * cosNew) * dt
  state.wheelAngle += (state.u / WHEEL_RADIUS) * dt
  state.slide =
    Math.min(1, Math.max(Math.abs(state.slipRear), Math.abs(state.slipFront) * 0.8) / 0.18) * Math.min(1, speed / 6)

  locate(state, track)
  collide(state, params, track)
}

/** Walls: the deepest corner into a barrier is pushed back and the car bounces off, losing speed and turning a little. */
function collide(state: CarState, params: CarParams, track: TrackSamples): void {
  let deepest = 0
  let which = -1
  for (let i = 0; i < 4; i++) {
    const q = state.corners[i]
    const depth = Math.abs(q.d) - q.barrier
    if (depth > deepest) {
      deepest = depth
      which = i
    }
  }
  if (which < 0) return
  const q = state.corners[which]
  const side = q.d > 0 ? 1 : -1
  // The wall's outward normal: to the right of the track's direction on the right-hand side.
  const nx = -Math.sin(q.heading) * side
  const nz = Math.cos(q.heading) * side
  state.x -= nx * (deepest + 0.02)
  state.z -= nz * (deepest + 0.02)

  const sin = Math.sin(state.psi)
  const cos = Math.cos(state.psi)
  let wx = state.u * cos - state.v * sin
  let wz = state.u * sin + state.v * cos
  const into = wx * nx + wz * nz
  if (into > 0) {
    const bounce = 0.18
    wx -= (1 + bounce) * into * nx
    wz -= (1 + bounce) * into * nz
    // Scraping along a wall costs speed too.
    const scrape = 1 - Math.min(0.4, 0.015 * into + 0.002)
    wx *= scrape
    wz *= scrape
    state.u = wx * cos + wz * sin
    state.v = -wx * sin + wz * cos
    const along = OFFSETS[which][0]
    const across = OFFSETS[which][1]
    const rcx = cos * along - sin * across
    const rcz = sin * along + cos * across
    const pushX = -(1 + bounce) * into * nx * params.mass * 0.5
    const pushZ = -(1 + bounce) * into * nz * params.mass * 0.5
    const spin = (rcx * pushZ - rcz * pushX) / params.inertia
    state.r += Math.max(-1.2, Math.min(1.2, spin))
    state.impact = Math.max(state.impact, into)
  }
  locate(state, track)
}

/** Fraction of the track the car has covered from the line, 0 to 1. */
export function lapFraction(state: CarState, track: TrackSamples): number {
  return state.place.s / track.length
}
