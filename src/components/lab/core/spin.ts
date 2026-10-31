import type { Object3D } from 'three'
import { clamp, damp } from '../../hero/heroMath'
import type { LabSceneContext } from './sceneContext'

/**
 * Turns the visitor's drag into a spin with inertia, and the pointer's position into a slight
 * tilt, as if the object were being looked at. Shared by the objects the pointer can turn. Plain
 * numbers, no allocation per frame.
 */
export class Spin {
  rotX: number
  rotY = 0
  velX = 0
  velY = 0
  lookX = 0
  lookY = 0
  private readonly drag = { x: 0, y: 0 }

  constructor(startTilt = 0.2) {
    this.rotX = startTilt
  }

  /** Advances the spin by one frame. `idle` is a slow turn (radians per second) for a live scene with nobody touching it. */
  update(
    scene: LabSceneContext,
    options: { gain?: number; idle?: number; look?: number; halfLife?: number } = {},
  ): void {
    const { pointer, clock, motion } = scene
    const dt = clock.dt
    const gain = options.gain ?? 4.2
    const halfLife = options.halfLife ?? 0.55

    pointer.takeDrag(this.drag)
    this.velY = clamp(this.velY + this.drag.x * gain * motion, -7, 7)
    this.velX = clamp(this.velX - this.drag.y * gain * motion, -7, 7)
    this.rotX += this.velX * dt
    this.rotY += this.velY * dt + (options.idle ?? 0) * dt
    this.velX = damp(this.velX, 0, halfLife, dt)
    this.velY = damp(this.velY, 0, halfLife, dt)

    const look = options.look ?? 1
    this.lookX = damp(this.lookX, -pointer.y * 0.2 * look * motion * pointer.presence, 0.25, dt)
    this.lookY = damp(this.lookY, pointer.x * 0.3 * look * motion * pointer.presence, 0.25, dt)
  }

  apply(object: Object3D): void {
    object.rotation.set(this.rotX + this.lookX, this.rotY + this.lookY, 0)
    object.updateMatrixWorld(true)
  }

  /** Whether it is still turning, so an on-demand canvas keeps drawing. */
  get moving(): boolean {
    return Math.abs(this.velX) + Math.abs(this.velY) > 0.01
  }
}
