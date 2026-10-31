import { Vector3, Vector4, type Camera, type IUniform, type Object3D } from 'three'
import { damp } from '../../hero/heroMath'
import { SURFACE_PULSES } from '../shaders/chunks'
import type { LabSceneContext } from './sceneContext'
import { SphereProbe } from './SphereProbe'

/** The uniforms the SURFACE_DEFORM chunk reads. */
export interface SurfaceUniforms {
  [name: string]: IUniform
  uTime: IUniform<number>
  uPhase: IUniform<number>
  uAmp: IUniform<number>
  uFreq: IUniform<number>
  uHitAmt: IUniform<number>
  uRipSpeed: IUniform<number>
  uRipDecay: IUniform<number>
  uPulseGain: IUniform<number>
  uHit: IUniform<Vector3>
  uRip: IUniform<Vector4[]>
}

export function createSurfaceUniforms(): SurfaceUniforms {
  return {
    uTime: { value: 0 },
    uPhase: { value: 0 },
    uAmp: { value: 0.1 },
    uFreq: { value: 1.2 },
    uHitAmt: { value: 0 },
    uRipSpeed: { value: 1.7 },
    uRipDecay: { value: 0.5 },
    uPulseGain: { value: 1 },
    uHit: { value: new Vector3(0, 0, 1) },
    uRip: { value: Array.from({ length: SURFACE_PULSES }, () => new Vector4(0, 0, 0, -1e4)) },
  }
}

export interface SurfaceDriveOptions {
  /** How fast the noise evolves on its own, per second. Zero holds the shape still. */
  noiseSpeed: number
  /** Scales how deep the pointer dents the surface. */
  hitStrength: number
  /** Seconds for the dent to cover half the way to the pointer: a thick material follows slowly. Default 0.08. */
  response?: number
}

/**
 * Turns the visitor's pointer into the surface shader's inputs: where on the sphere the pointer
 * is, how strongly it presses, and a travelling wave for each click. Shared by the hero's core
 * and Liquid Matter. It owns the CPU side of the noise clock, so the noise can speed up and slow
 * down without the pattern jumping.
 */
export class SurfaceDriver {
  readonly probe = new SphereProbe()
  /** Where the pointer is on the sphere, smoothed. */
  readonly hit = new Vector3(0, 0, 1)
  hitAmount = 0
  phase = 0

  private seenPulses = -1
  private slot = 0

  update(
    scene: LabSceneContext,
    camera: Camera,
    object: Object3D,
    radius: number,
    uniforms: SurfaceUniforms,
    options: SurfaceDriveOptions,
  ): void {
    const { pointer, clock } = scene
    const dt = clock.dt

    // A click or tap: a wave from the point under it.
    if (pointer.pulseVersion !== this.seenPulses) {
      this.seenPulses = pointer.pulseVersion
      const newest = pointer.newestPulse(clock.t, 0.5)
      if (newest) {
        this.probe.update(newest.x, newest.y, camera, object, radius, 1.4)
        const d = this.probe.direction
        const strength = newest.strength * (0.55 + 0.45 * this.probe.reach) * (scene.view === 'calm' ? 0.45 : 1)
        uniforms.uRip.value[this.slot].set(d.x * strength, d.y * strength, d.z * strength, newest.time)
        this.slot = (this.slot + 1) % SURFACE_PULSES
      }
    }

    // The pointer's own dent.
    this.probe.update(pointer.x, pointer.y, camera, object, radius)
    this.hit.lerp(this.probe.direction, 1 - Math.pow(0.5, dt / 0.05)).normalize()
    this.hitAmount = damp(
      this.hitAmount,
      pointer.presence * this.probe.reach * options.hitStrength,
      options.response ?? 0.08,
      dt,
    )

    this.phase += dt * options.noiseSpeed

    uniforms.uTime.value = clock.t
    uniforms.uPhase.value = this.phase
    uniforms.uHit.value.copy(this.hit)
    uniforms.uHitAmt.value = this.hitAmount
  }

  /** Whether a wave is still travelling, so an on-demand canvas keeps drawing. */
  hasWaves(scene: LabSceneContext, seconds = 5): boolean {
    return scene.pointer.hasPulses(scene.clock.t, seconds)
  }
}
