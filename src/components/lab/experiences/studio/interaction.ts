import { Euler, Quaternion, Raycaster, Vector2, Vector3, type Camera, type Mesh, type Ray } from 'three'
import type { OrbitController } from '../../experience/orbit'
import { AXES, AXIS_INDEX, type Gizmo, type HandleInfo } from './gizmo'
import { angleDelta, axisParameter, perpendicularFrame, planeHit, ringAngle, scaledByDrag, snap } from './gizmoMath'
import { SCALE_MAX, SCALE_MIN, selectedObject, updateObject, type StudioObject, type Vec3 } from './studioDoc'
import { patchUi, pushHistory, select, studio, transient } from './studioStore'

/**
 * What a press, a drag and a release do in the viewport:
 *
 *   on a handle of the active tool     drag it: the object follows the pointer along that axis or ring
 *   on an object                       a tap selects it (a drag still orbits the camera)
 *   on empty space                     a tap clears the selection (a drag orbits)
 *
 * The camera controller is told which presses are the editor's (`claimed`), so the two never fight
 * over one finger. A drag changes the document through `transient` (no history step on every
 * pixel) and becomes one undo step when it ends. Everything is exact: the handle moves as far as
 * the pointer moved along it, wherever on the handle it was grabbed.
 */

const TAP_DISTANCE = 7
const MOVE_SNAP = 0.25
const SCALE_SNAP = 0.1
const ROTATE_SNAP = (15 * Math.PI) / 180

interface Drag {
  pointerId: number
  info: HandleInfo
  key: string
  startDoc: ReturnType<typeof studio.get>['doc']
  object: StudioObject
  origin: Vector3
  axis: Vector3
  quaternion: Quaternion
  parameter: number
  hit: Vector3 | null
  angle: number
  frame: { u: Vector3; v: Vector3 }
  screenY: number
}

interface Pending {
  pointerId: number
  id: string | null
  x: number
  y: number
  moved: boolean
}

export interface InteractionHost {
  element: HTMLElement
  getCamera(): Camera
  getPickables(): Mesh[]
  gizmo: Gizmo
  orbit: OrbitController
  invalidate(): void
}

const toTuple = (v: Vector3): Vec3 => [v.x, v.y, v.z]

export class StudioInteraction {
  /** Pointers whose presses belong to the editor, not to the orbit camera. */
  readonly claimed = new Set<number>()
  private readonly raycaster = new Raycaster()
  private readonly ndc = new Vector2()
  private drag: Drag | null = null
  private pending: Pending | null = null

  private readonly host: InteractionHost

  constructor(host: InteractionHost) {
    this.host = host
  }

  private setRay(event: PointerEvent): Ray {
    const rect = this.host.element.getBoundingClientRect()
    this.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1))
    this.raycaster.setFromCamera(this.ndc, this.host.getCamera())
    return this.raycaster.ray
  }

  attach(): () => void {
    const element = this.host.element
    const down = (event: PointerEvent) => this.onDown(event)
    const move = (event: PointerEvent) => this.onMove(event)
    const up = (event: PointerEvent) => this.onUp(event)
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    return () => {
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      this.claimed.clear()
      this.drag = null
      this.pending = null
    }
  }

  private onDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const state = studio.get()
    const ray = this.setRay(event)
    const object = selectedObject(state.doc)

    // A second finger turns a tap into a pinch: nothing is picked.
    if (this.pending && this.pending.pointerId !== event.pointerId) {
      this.pending = null
      return
    }

    if (object && !object.locked && state.tool !== 'select') {
      const hit = this.raycaster.intersectObjects(this.host.gizmo.handles[state.tool], false)[0]
      if (hit) {
        const info = hit.object.userData.handle as HandleInfo
        if (this.startDrag(event, info, hit.object.userData.key as string, object, ray)) {
          this.claimed.add(event.pointerId)
          try {
            this.host.element.setPointerCapture(event.pointerId)
          } catch {
            // The press still counts.
          }
          event.preventDefault()
          return
        }
      }
    }

    const picked = this.raycaster.intersectObjects(this.host.getPickables(), false)[0]
    this.pending = { pointerId: event.pointerId, id: (picked?.object.userData.id as string | undefined) ?? null, x: event.clientX, y: event.clientY, moved: false }
  }

  private startDrag(event: PointerEvent, info: HandleInfo, key: string, object: StudioObject, ray: Ray): boolean {
    const origin = new Vector3(...object.position)
    const quaternion = new Quaternion().setFromEuler(new Euler(...object.rotation, 'XYZ'))
    let axis = new Vector3()
    let parameter = 0
    let hit: Vector3 | null = null
    let angle = 0
    let frame = { u: new Vector3(), v: new Vector3() }

    if (info.axis === 'free') {
      const normal = this.host.getCamera().getWorldDirection(new Vector3()).negate()
      axis = normal
      hit = planeHit(ray, origin, normal)
      if (!hit) return false
    } else if (info.axis === 'uniform') {
      // Uniform scale follows the pointer up and down the screen.
    } else {
      axis = AXES[info.axis].clone()
      // Scaling follows the object's own axes; moving and rotating follow the world's.
      if (info.tool === 'scale') axis.applyQuaternion(quaternion)
      if (info.tool === 'rotate') {
        frame = perpendicularFrame(axis)
        const start = ringAngle(ray, origin, axis, frame)
        if (start === null) return false
        angle = start
      } else {
        const start = axisParameter(ray, origin, axis)
        if (start === null) return false
        parameter = start
      }
    }

    this.drag = {
      pointerId: event.pointerId,
      info,
      key,
      startDoc: studio.get().doc,
      object,
      origin,
      axis,
      quaternion,
      parameter,
      hit,
      angle,
      frame,
      screenY: event.clientY,
    }
    this.host.gizmo.highlight(null, key)
    this.host.orbit.enabled = false
    this.host.invalidate()
    return true
  }

  private onMove(event: PointerEvent): void {
    if (this.drag && this.drag.pointerId === event.pointerId) {
      this.updateDrag(event)
      return
    }
    if (this.pending && this.pending.pointerId === event.pointerId && !this.pending.moved) {
      if (Math.hypot(event.clientX - this.pending.x, event.clientY - this.pending.y) > TAP_DISTANCE) this.pending.moved = true
    }
    // Hover feedback on a mouse: the handle under the pointer lights up.
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      const state = studio.get()
      const object = selectedObject(state.doc)
      if (object && !object.locked && state.tool !== 'select') {
        this.setRay(event)
        const hit = this.raycaster.intersectObjects(this.host.gizmo.handles[state.tool], false)[0]
        const key = (hit?.object.userData.key as string | undefined) ?? null
        this.host.gizmo.highlight(key)
        this.host.element.style.cursor = key ? 'grab' : ''
        this.host.invalidate()
      } else if (this.host.element.style.cursor) {
        this.host.element.style.cursor = ''
      }
    }
  }

  private updateDrag(event: PointerEvent): void {
    const drag = this.drag
    if (!drag) return
    const ray = this.setRay(event)
    const { info, object } = drag
    const snapping = studio.get().snap
    let patch: Partial<StudioObject> | null = null
    let readout = ''

    if (info.tool === 'move') {
      let position = drag.origin.clone()
      if (info.axis === 'free') {
        const hit = planeHit(ray, drag.origin, drag.axis)
        if (!hit || !drag.hit) return
        position = drag.origin.clone().add(hit.sub(drag.hit))
        if (snapping) position.set(snap(position.x, MOVE_SNAP), snap(position.y, MOVE_SNAP), snap(position.z, MOVE_SNAP))
        readout = `X ${position.x.toFixed(2)}  Y ${position.y.toFixed(2)}  Z ${position.z.toFixed(2)}`
      } else if (info.axis !== 'uniform') {
        const t = axisParameter(ray, drag.origin, drag.axis)
        if (t === null) return
        const index = AXIS_INDEX[info.axis]
        const next = [position.x, position.y, position.z]
        next[index] = snap(next[index] + (t - drag.parameter), snapping ? MOVE_SNAP : 0)
        position.set(next[0], next[1], next[2])
        readout = `${info.axis.toUpperCase()} ${next[index].toFixed(2)}`
      }
      patch = { position: toTuple(position) }
    } else if (info.tool === 'rotate' && info.axis !== 'free' && info.axis !== 'uniform') {
      const now = ringAngle(ray, drag.origin, drag.axis, drag.frame)
      if (now === null) return
      let delta = angleDelta(drag.angle, now)
      if (snapping) delta = snap(delta, ROTATE_SNAP)
      const turned = new Quaternion().setFromAxisAngle(drag.axis, delta).multiply(drag.quaternion)
      const euler = new Euler().setFromQuaternion(turned, 'XYZ')
      patch = { rotation: [euler.x, euler.y, euler.z] }
      readout = `${info.axis.toUpperCase()} ${((delta * 180) / Math.PI).toFixed(0)}°`
    } else if (info.tool === 'scale') {
      const scale: Vec3 = [...object.scale]
      if (info.axis === 'uniform') {
        const factor = Math.exp((drag.screenY - event.clientY) * 0.008)
        for (let i = 0; i < 3; i++) scale[i] = Math.min(SCALE_MAX, Math.max(SCALE_MIN, snap(object.scale[i] * factor, snapping ? SCALE_SNAP : 0)))
        readout = `× ${factor.toFixed(2)}`
      } else if (info.axis !== 'free') {
        const t = axisParameter(ray, drag.origin, drag.axis)
        if (t === null) return
        const index = AXIS_INDEX[info.axis]
        scale[index] = Math.min(SCALE_MAX, Math.max(SCALE_MIN, snap(scaledByDrag(object.scale[index], drag.parameter || 1, t, SCALE_MIN, SCALE_MAX), snapping ? SCALE_SNAP : 0)))
        readout = `${info.axis.toUpperCase()} ${scale[index].toFixed(2)}`
      }
      patch = { scale }
    }

    if (patch) {
      transient(updateObject(studio.get().doc, object.id, patch))
      patchUi({ drag: readout })
      this.host.invalidate()
    }
  }

  private onUp(event: PointerEvent): void {
    if (this.drag && this.drag.pointerId === event.pointerId) {
      pushHistory(this.drag.startDoc)
      this.drag = null
      this.claimed.delete(event.pointerId)
      this.host.orbit.enabled = true
      this.host.gizmo.highlight(null, null)
      patchUi({ drag: '' })
      try {
        this.host.element.releasePointerCapture(event.pointerId)
      } catch {
        // Already released.
      }
      this.host.invalidate()
      return
    }
    this.claimed.delete(event.pointerId)
    const pending = this.pending
    if (pending && pending.pointerId === event.pointerId) {
      this.pending = null
      if (!pending.moved && event.type === 'pointerup') {
        select(pending.id)
        this.host.invalidate()
      }
    }
  }
}
