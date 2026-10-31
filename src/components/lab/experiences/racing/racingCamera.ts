import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import type { CarState } from './carPhysics'
import { newQuery, queryTrack, type TrackSamples } from './trackModel'

/**
 * The race cameras. All three are smoothed so they never jump, and none can go through a barrier
 * or under the road.
 *  - chase: behind and above, swinging round after the car, a wider view the faster it goes
 *  - cockpit: the driver's eyes, looking into the corner a little
 *  - cinematic: a television director, cutting between fixed spots beside the track and following
 *    the car with a zoom that grows with the distance
 * `motion` (0 to 1) scales the movement that is not strictly needed: the speed zoom, the lean.
 */
export type CameraMode = 'chase' | 'cockpit' | 'cinematic'

export const CAMERA_MODES: readonly CameraMode[] = ['chase', 'cockpit', 'cinematic']

const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt)

export class RaceCamera {
  private readonly position = new Vector3()
  private readonly target = new Vector3()
  private readonly scratch = new Vector3()
  private readonly look = new Vector3()
  private readonly query = newQuery()
  private yaw = 0
  private fov = 62
  private fresh = true
  private spot = -1
  private readonly spots: Vector3[] = []
  private readonly spotS: number[] = []
  private readonly samples: TrackSamples
  private lastMode: CameraMode = 'chase'

  constructor(samples: TrackSamples) {
    this.samples = samples
    // Fixed camera positions along the track, alternating sides, behind the barrier.
    const total = Math.max(6, Math.round(samples.length / 240))
    for (let k = 0; k < total; k++) {
      const i = Math.round((k / total) * samples.count) % samples.count
      const side = k % 2 === 0 ? 1 : -1
      const clear = (side > 0 ? samples.right[i] : samples.left[i]) + 3.5
      this.spots.push(
        new Vector3(
          samples.x[i] - samples.tz[i] * side * clear,
          samples.y[i] + 2.4 + (k % 3) * 1.1,
          samples.z[i] + samples.tx[i] * side * clear,
        ),
      )
      this.spotS.push(i * samples.spacing)
    }
  }

  /** Jump to the right place on the next update (after a reset). */
  snap(): void {
    this.fresh = true
    this.spot = -1
  }

  update(
    camera: PerspectiveCamera,
    car: CarState,
    dt: number,
    mode: CameraMode,
    motion: number,
    hideHelmet: { visible: boolean },
  ): void {
    const speed = Math.hypot(car.u, car.v)
    const cos = Math.cos(car.psi)
    const sin = Math.sin(car.psi)
    if (mode !== this.lastMode) {
      this.fresh = true
      this.lastMode = mode
    }
    hideHelmet.visible = mode !== 'cockpit'

    if (mode === 'cockpit') {
      const lean = car.steerAngle * 0.9 * motion
      const yaw = car.psi + lean
      this.position.set(car.x + cos * -0.05, car.y + 0.98, car.z + sin * -0.05)
      this.target.set(
        this.position.x + Math.cos(yaw) * 30,
        this.position.y - 0.4 + Math.min(1.2, speed * 0.01),
        this.position.z + Math.sin(yaw) * 30,
      )
      this.apply(camera, 78, dt, true)
      return
    }

    if (mode === 'cinematic') {
      this.cinematic(camera, car, dt, motion)
      return
    }

    // Chase: the heading eases after the car's own, so the view swings in a corner and settles on a straight.
    if (this.fresh) this.yaw = car.psi
    else this.yaw += this.angleDelta(car.psi, this.yaw) * ease(5, dt)
    const behind = 7.4 + speed * 0.035
    const height = 2.5 + speed * 0.009
    this.scratch.set(car.x - Math.cos(this.yaw) * behind, car.y + height, car.z - Math.sin(this.yaw) * behind)
    this.keepInside(this.scratch, car)
    this.position.copy(this.scratch)
    this.target.set(car.x + Math.cos(this.yaw) * 9, car.y + 0.95, car.z + Math.sin(this.yaw) * 9)
    this.apply(camera, 60 + motion * Math.min(15, speed * 0.16), dt, false)
  }

  private angleDelta(target: number, current: number): number {
    let delta = target - current
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    return delta
  }

  /** Keeps a camera position inside the barriers and above the road. */
  private keepInside(point: Vector3, car: CarState): void {
    const q = queryTrack(this.samples, point.x, point.z, car.place.index, this.query)
    const room = q.barrier - 0.9
    if (Math.abs(q.d) > room) {
      const excess = Math.abs(q.d) - room
      const side = q.d > 0 ? 1 : -1
      point.x += Math.sin(q.heading) * side * excess
      point.z -= Math.cos(q.heading) * side * excess
    }
    point.y = Math.max(point.y, q.y + 0.9)
  }

  private cinematic(camera: PerspectiveCamera, car: CarState, dt: number, motion: number): void {
    const length = this.samples.length
    const wrap = (value: number) => ((value + length * 1.5) % length) - length / 2
    const carS = car.place.s
    let ahead = this.spot >= 0 ? wrap(this.spotS[this.spot] - carS) : -Infinity
    if (this.spot < 0 || ahead < -40 || ahead > 320) {
      // The nearest spot that is 50 to 300 m in front of the car.
      let best = -1
      let bestGap = Infinity
      for (let k = 0; k < this.spots.length; k++) {
        const gap = wrap(this.spotS[k] - carS)
        if (gap > 50 && gap < bestGap) {
          bestGap = gap
          best = k
        }
      }
      if (best < 0) best = 0
      this.spot = best
      ahead = wrap(this.spotS[best] - carS)
      this.fresh = true
    }
    this.position.copy(this.spots[this.spot])
    const distance = Math.hypot(this.position.x - car.x, this.position.z - car.z)
    // The look-at point follows the car with a little lag, so a close pass is a pan, not a whip.
    this.scratch.set(car.x, car.y + 0.7, car.z)
    if (this.fresh) this.look.copy(this.scratch)
    else this.look.lerp(this.scratch, ease(motion > 0 ? 6 : 3, dt))
    this.target.copy(this.look)
    this.apply(camera, MathUtils.clamp(56 - distance * 0.22, 16, 56), dt, this.fresh)
  }

  private apply(camera: PerspectiveCamera, fov: number, dt: number, rigid: boolean): void {
    if (this.fresh || rigid) {
      camera.position.copy(this.position)
      this.scratch.copy(this.target)
      this.fov = fov
      this.fresh = false
    } else {
      camera.position.lerp(this.position, ease(9, dt))
      this.scratch.copy(this.target)
      this.fov += (fov - this.fov) * ease(3, dt)
    }
    camera.lookAt(this.scratch)
    if (Math.abs(camera.fov - this.fov) > 0.05) {
      camera.fov = this.fov
      camera.updateProjectionMatrix()
    }
  }
}
