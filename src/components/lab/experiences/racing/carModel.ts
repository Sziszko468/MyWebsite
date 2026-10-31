import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type Material,
} from 'three'

/**
 * The race car, built from primitives: a tapered nose and tub, side pods, an engine cover, front
 * and rear wings, a halo, a helmet and four wheels. It is an open-wheel car of no particular maker
 * (no logo, no livery of a real team): Racing Red paint with a Warm Paper stripe, carbon and rubber.
 * The model faces +x with +y up and +z to the right, so the car's heading turns it about y.
 *
 * `update` poses it every frame without allocating: body pitch and roll from the accelerations, the
 * front wheels steered, all four wheels turned by the distance driven, the brake light lit.
 */
export interface CarModel {
  root: Group
  /** The part that leans; the wheels stay on the road. */
  body: Group
  helmet: Mesh
  update(pose: CarPose): void
  dispose(): void
}

export interface CarPose {
  /** Pitch from the road's slope, rad (nose up positive). */
  slope: number
  /** Longitudinal and lateral acceleration, m/s². */
  ax: number
  ay: number
  steer: number
  wheelAngle: number
  braking: boolean
}

const WHEEL_RADIUS = 0.33
const FRONT_AXLE = 1.84
const REAR_AXLE = -1.56
const TRACK_HALF = 0.88

export function createCarModel(): CarModel {
  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const geo = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g)
    return g
  }
  const mat = <T extends Material>(m: T): T => {
    materials.push(m)
    return m
  }

  const paint = mat(
    new MeshPhysicalMaterial({
      color: 0xff161f,
      metalness: 0.3,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  )
  const paper = mat(new MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.5 }))
  const carbon = mat(new MeshStandardMaterial({ color: 0x17171b, metalness: 0.55, roughness: 0.42 }))
  const rubber = mat(new MeshStandardMaterial({ color: 0x0f0f11, roughness: 0.95 }))
  const metal = mat(new MeshStandardMaterial({ color: 0xc9ccd6, metalness: 1, roughness: 0.28 }))
  const brakeLight = mat(
    new MeshStandardMaterial({ color: 0x300000, emissive: 0xff1a1a, emissiveIntensity: 0.5, roughness: 0.4 }),
  )
  const visor = mat(new MeshStandardMaterial({ color: 0x0b0b0d, metalness: 0.9, roughness: 0.1 }))

  const root = new Group()
  root.name = 'LabRaceCar'
  const body = new Group()
  root.add(body)

  const add = (
    parent: Group,
    geometry: BufferGeometry,
    material: Material,
    x: number,
    y: number,
    z: number,
    shadows = true,
  ): Mesh => {
    const mesh = new Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = shadows
    mesh.receiveShadow = false
    parent.add(mesh)
    return mesh
  }

  // The nose: a tapering cylinder along x.
  const nose = add(body, geo(new CylinderGeometry(0.06, 0.3, 2.1, 14)), paint, 1.4, 0.36, 0)
  nose.rotation.z = Math.PI / 2
  nose.scale.set(1, 1, 0.9)
  // The tub and the engine cover behind it.
  add(body, geo(new BoxGeometry(1.5, 0.42, 0.62)), paint, 0.15, 0.42, 0)
  const cover = add(body, geo(new CylinderGeometry(0.1, 0.3, 2.0, 14)), paint, -1.1, 0.6, 0)
  cover.rotation.z = -Math.PI / 2
  cover.scale.set(1, 1, 0.85)
  // The airbox over the driver's head, and the stripe down the middle.
  add(body, geo(new BoxGeometry(0.55, 0.3, 0.3)), carbon, -0.55, 0.82, 0)
  add(body, geo(new BoxGeometry(2.2, 0.015, 0.14)), paper, 1.0, 0.655, 0, false)
  add(body, geo(new BoxGeometry(1.7, 0.015, 0.14)), paper, -1.2, 0.84, 0, false)
  // Side pods.
  for (const side of [-1, 1]) {
    const pod = add(body, geo(new BoxGeometry(1.5, 0.36, 0.42)), paint, -0.25, 0.32, side * 0.6)
    pod.scale.set(1, 1, 1)
    add(body, geo(new BoxGeometry(0.5, 0.2, 0.2)), carbon, 0.55, 0.3, side * 0.62)
  }
  // The floor.
  add(body, geo(new BoxGeometry(3.7, 0.04, 1.5)), carbon, -0.1, 0.12, 0)

  // Cockpit: halo and helmet.
  const halo = add(body, geo(new TorusGeometry(0.3, 0.025, 8, 20, Math.PI)), carbon, 0.12, 0.7, 0)
  halo.rotation.set(0, Math.PI / 2, 0)
  add(body, geo(new BoxGeometry(0.08, 0.2, 0.08)), carbon, 0.42, 0.74, 0)
  const helmet = add(body, geo(new SphereGeometry(0.15, 16, 12)), paper, -0.12, 0.74, 0, false)
  const visorMesh = add(body, geo(new BoxGeometry(0.12, 0.07, 0.2)), visor, 0.0, 0.76, 0, false)
  helmet.add(visorMesh)
  visorMesh.position.set(0.12, 0.02, 0)

  // Wings.
  add(body, geo(new BoxGeometry(0.55, 0.03, 1.95)), carbon, 2.1, 0.13, 0)
  add(body, geo(new BoxGeometry(0.42, 0.025, 1.95)), paint, 2.0, 0.2, 0)
  for (const side of [-1, 1]) add(body, geo(new BoxGeometry(0.62, 0.22, 0.025)), paint, 2.05, 0.18, side * 0.98)
  add(body, geo(new BoxGeometry(0.5, 0.035, 1.25)), carbon, -2.12, 0.92, 0)
  add(body, geo(new BoxGeometry(0.4, 0.03, 1.25)), paint, -2.07, 1.05, 0)
  for (const side of [-1, 1]) add(body, geo(new BoxGeometry(0.72, 0.52, 0.025)), paint, -2.1, 0.88, side * 0.63)
  add(body, geo(new BoxGeometry(0.1, 0.5, 0.08)), carbon, -2.0, 0.65, 0)
  add(body, geo(new BoxGeometry(0.04, 0.09, 0.22)), brakeLight, -2.25, 0.62, 0, false)

  // Wheels: a tyre, a rim with a red band, and a pivot to steer the front pair.
  const wheels: Array<{ pivot: Group; spin: Group; front: boolean }> = []
  const wheelSpecs: Array<{ x: number; z: number; width: number; front: boolean }> = [
    { x: FRONT_AXLE, z: -TRACK_HALF, width: 0.32, front: true },
    { x: FRONT_AXLE, z: TRACK_HALF, width: 0.32, front: true },
    { x: REAR_AXLE, z: -TRACK_HALF - 0.04, width: 0.42, front: false },
    { x: REAR_AXLE, z: TRACK_HALF + 0.04, width: 0.42, front: false },
  ]
  for (const spec of wheelSpecs) {
    const pivot = new Group()
    pivot.position.set(spec.x, WHEEL_RADIUS, spec.z)
    const spin = new Group()
    pivot.add(spin)
    const tyre = new Mesh(geo(new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, spec.width, 28)), rubber)
    tyre.rotation.x = Math.PI / 2
    tyre.castShadow = true
    spin.add(tyre)
    const rim = new Mesh(geo(new CylinderGeometry(0.2, 0.2, spec.width + 0.02, 18)), metal)
    rim.rotation.x = Math.PI / 2
    spin.add(rim)
    const band = new Mesh(geo(new CylinderGeometry(0.3, 0.3, spec.width + 0.012, 28, 1, true)), paint)
    band.rotation.x = Math.PI / 2
    band.scale.set(1, 1, 1)
    spin.add(band)
    // A mark on the rim, so the turning can be seen.
    const mark = new Mesh(geo(new BoxGeometry(0.34, 0.03, spec.width + 0.03)), paper)
    spin.add(mark)
    root.add(pivot)
    wheels.push({ pivot, spin, front: spec.front })
    // The arm to the body.
    const arm = new Mesh(geo(new BoxGeometry(0.06, 0.04, TRACK_HALF - 0.4)), carbon)
    arm.position.set(spec.x, WHEEL_RADIUS + 0.03, Math.sign(spec.z) * (0.42 + (TRACK_HALF - 0.4) / 2))
    body.add(arm)
  }

  return {
    root,
    body,
    helmet,
    update(pose) {
      // Nose dips under braking, squats under power; the body leans out of a corner.
      body.rotation.z = -Math.max(-0.045, Math.min(0.045, pose.ax * 0.0034))
      body.rotation.x = -Math.max(-0.06, Math.min(0.06, pose.ay * 0.0042))
      body.position.y = 0.02 + Math.min(0.03, Math.abs(pose.ay) * 0.0012)
      brakeLight.emissiveIntensity = pose.braking ? 5 : 0.5
      for (const wheel of wheels) {
        wheel.spin.rotation.z = -pose.wheelAngle
        if (wheel.front) wheel.pivot.rotation.y = -pose.steer
      }
      root.rotation.z = pose.slope
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
    },
  }
}
