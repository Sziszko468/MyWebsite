import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import type { Tool } from './studioStore'

/**
 * The three handles for moving, rotating and scaling: arrows, rings and boxes along the X, Y and Z
 * axes, in the brand's colours (Racing Red, Warm Paper, Cobalt Blue). They are drawn over the scene
 * and always the same size on screen. Each visible handle has a larger invisible one around it, so
 * a fingertip can hit it: the invisible ones are what the pointer is tested against.
 */

export type GizmoTool = Exclude<Tool, 'select'>
export type Axis = 'x' | 'y' | 'z'
export type HandleAxis = Axis | 'free' | 'uniform'

export interface HandleInfo {
  tool: GizmoTool
  axis: HandleAxis
}

export const AXES: Record<Axis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
}

const AXIS_COLOUR: Record<Axis, number> = { x: 0xff161f, y: 0xf4f0e8, z: 0x445cff }
const CENTRE_COLOUR = 0xffffff

export const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

export class Gizmo {
  readonly root = new Group()
  /** The invisible hit meshes of each tool: what a press is tested against. */
  readonly handles: Record<GizmoTool, Mesh[]> = { move: [], rotate: [], scale: [] }
  private readonly groups: Record<GizmoTool, Group> = { move: new Group(), rotate: new Group(), scale: new Group() }
  private readonly geometries: BufferGeometry[] = []
  private readonly materials: MeshBasicMaterial[] = []
  private readonly visuals = new Map<string, Array<{ material: MeshBasicMaterial; base: number }>>()
  private hovered: string | null = null
  private active: string | null = null

  constructor() {
    this.root.renderOrder = 999
    for (const tool of ['move', 'rotate', 'scale'] as const) this.root.add(this.groups[tool])
    this.buildMove()
    this.buildRotate()
    this.buildScale()
    this.setTool('move')
  }

  private material(colour: number, opacity = 1): MeshBasicMaterial {
    const material = new MeshBasicMaterial({ color: colour, transparent: true, opacity, depthTest: false, depthWrite: false })
    this.materials.push(material)
    return material
  }

  private geometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry)
    return geometry
  }

  private add(tool: GizmoTool, key: string, info: HandleInfo, visual: Mesh[], hit: Mesh): void {
    const group = this.groups[tool]
    const list = this.visuals.get(key) ?? []
    for (const mesh of visual) {
      mesh.renderOrder = 999
      group.add(mesh)
      const material = mesh.material as MeshBasicMaterial
      list.push({ material, base: material.color.getHex() })
    }
    this.visuals.set(key, list)
    hit.userData.handle = info
    hit.userData.key = key
    ;(hit.material as MeshBasicMaterial).visible = false
    group.add(hit)
    this.handles[tool].push(hit)
  }

  /** Orients something built along +Y so it points along an axis. */
  private orient<T extends Mesh | Group>(object: T, axis: Axis): T {
    if (axis === 'x') object.rotation.z = -Math.PI / 2
    else if (axis === 'z') object.rotation.x = Math.PI / 2
    return object
  }

  private buildMove(): void {
    for (const axis of ['x', 'y', 'z'] as const) {
      const colour = AXIS_COLOUR[axis]
      const shaft = new Mesh(this.geometry(new CylinderGeometry(0.018, 0.018, 0.78, 8)), this.material(colour))
      shaft.position.y = 0.39
      const tip = new Mesh(this.geometry(new ConeGeometry(0.075, 0.22, 16)), this.material(colour))
      tip.position.y = 0.9
      const hit = new Mesh(this.geometry(new CylinderGeometry(0.16, 0.16, 1.05, 8)), this.material(colour))
      hit.position.y = 0.55
      const holder = new Group()
      holder.add(shaft, tip, hit)
      this.orient(holder, axis)
      // The group carries the shared orientation; the hit mesh needs its own world matrix when tested.
      holder.updateMatrixWorld(true)
      this.groups.move.add(holder)
      hit.userData.handle = { tool: 'move', axis } satisfies HandleInfo
      hit.userData.key = `move-${axis}`
      this.visuals.set(`move-${axis}`, [shaft, tip].map((mesh) => ({ material: mesh.material as MeshBasicMaterial, base: colour })))
      shaft.renderOrder = tip.renderOrder = 999
      ;(hit.material as MeshBasicMaterial).visible = false
      this.handles.move.push(hit)
    }
    const centre = new Mesh(this.geometry(new SphereGeometry(0.1, 16, 12)), this.material(CENTRE_COLOUR, 0.9))
    const centreHit = new Mesh(this.geometry(new SphereGeometry(0.2, 12, 8)), this.material(CENTRE_COLOUR))
    this.add('move', 'move-free', { tool: 'move', axis: 'free' }, [centre], centreHit)
  }

  private buildRotate(): void {
    for (const axis of ['x', 'y', 'z'] as const) {
      const colour = AXIS_COLOUR[axis]
      const ring = new Mesh(this.geometry(new TorusGeometry(1, 0.016, 8, 96)), this.material(colour, 0.95))
      const hit = new Mesh(this.geometry(new TorusGeometry(1, 0.1, 8, 48)), this.material(colour))
      const holder = new Group()
      holder.add(ring, hit)
      // A torus lies in the XY plane (its axis is Z): turn it so its axis is the one wanted.
      if (axis === 'x') holder.rotation.y = Math.PI / 2
      else if (axis === 'y') holder.rotation.x = Math.PI / 2
      this.groups.rotate.add(holder)
      ring.renderOrder = 999
      hit.userData.handle = { tool: 'rotate', axis } satisfies HandleInfo
      hit.userData.key = `rotate-${axis}`
      this.visuals.set(`rotate-${axis}`, [{ material: ring.material as MeshBasicMaterial, base: colour }])
      ;(hit.material as MeshBasicMaterial).visible = false
      this.handles.rotate.push(hit)
    }
  }

  private buildScale(): void {
    for (const axis of ['x', 'y', 'z'] as const) {
      const colour = AXIS_COLOUR[axis]
      const shaft = new Mesh(this.geometry(new CylinderGeometry(0.018, 0.018, 0.78, 8)), this.material(colour))
      shaft.position.y = 0.39
      const box = new Mesh(this.geometry(new BoxGeometry(0.14, 0.14, 0.14)), this.material(colour))
      box.position.y = 0.92
      const hit = new Mesh(this.geometry(new CylinderGeometry(0.16, 0.16, 1.05, 8)), this.material(colour))
      hit.position.y = 0.55
      const holder = new Group()
      holder.add(shaft, box, hit)
      this.orient(holder, axis)
      this.groups.scale.add(holder)
      shaft.renderOrder = box.renderOrder = 999
      hit.userData.handle = { tool: 'scale', axis } satisfies HandleInfo
      hit.userData.key = `scale-${axis}`
      this.visuals.set(`scale-${axis}`, [shaft, box].map((mesh) => ({ material: mesh.material as MeshBasicMaterial, base: colour })))
      ;(hit.material as MeshBasicMaterial).visible = false
      this.handles.scale.push(hit)
    }
    const centre = new Mesh(this.geometry(new BoxGeometry(0.2, 0.2, 0.2)), this.material(CENTRE_COLOUR, 0.9))
    const centreHit = new Mesh(this.geometry(new BoxGeometry(0.34, 0.34, 0.34)), this.material(CENTRE_COLOUR))
    this.add('scale', 'scale-uniform', { tool: 'scale', axis: 'uniform' }, [centre], centreHit)
  }

  setTool(tool: Tool): void {
    this.root.visible = tool !== 'select'
    for (const key of ['move', 'rotate', 'scale'] as const) this.groups[key].visible = key === tool
  }

  /** Puts the gizmo on an object and sizes it so it is the same size on screen. */
  place(position: Vector3, quaternion: Quaternion | null, size: number): void {
    this.root.position.copy(position)
    if (quaternion) this.root.quaternion.copy(quaternion)
    else this.root.quaternion.identity()
    this.root.scale.setScalar(size)
    this.root.updateMatrixWorld(true)
  }

  /** Lights up the handle under the pointer (or the one being dragged). */
  highlight(hovered: string | null, active: string | null = this.active): void {
    this.hovered = hovered
    this.active = active
    for (const [key, list] of this.visuals) {
      const on = key === this.active || (this.active === null && key === this.hovered)
      for (const item of list) {
        item.material.color.setHex(on ? 0xffd34a : item.base)
        item.material.opacity = on ? 1 : this.active ? 0.35 : 0.95
      }
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
  }
}
