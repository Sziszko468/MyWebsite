import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { createLoft, type LoftSection } from './heroGeometry'
import { createGlowMaterial, createRadialTexture } from './heroMaterials'
import { GLOW_FRAG, GLOW_VERT } from './heroShaders'
import { usePart, type ScenePart } from './usePart'
import type { HeroRig } from './heroRig'
import type { BlendedPalette, HeroUniforms } from './heroUniforms'
import type { QualityProfile } from './velocityHeroConfig'

/**
 * An original prototype racer, modelled from scratch: no marque, no licensed livery and no
 * downloaded model. The body and canopy are lofted through hand-placed cross-sections; the rest
 * is plain boxes and cylinders. It is a stylised model, not a photoreal one.
 *
 * Car space: +z is the rear (towards the camera), +y up, one unit is one metre.
 */

// Rear (largest z) to nose. See createLoft for the meaning of each field.
const BODY: LoftSection[] = [
  { z: 2.4, w: 0.7, yBottom: 0.2, yTop: 0.7, n: 3.4, taper: 0.75 },
  { z: 2.0, w: 0.9, yBottom: 0.16, yTop: 0.86, n: 3.0, taper: 0.55 },
  { z: 1.3, w: 1.04, yBottom: 0.13, yTop: 0.84, n: 3.0, taper: 0.5 },
  { z: 0.4, w: 1.06, yBottom: 0.12, yTop: 0.7, n: 3.2, taper: 0.62 },
  { z: -0.6, w: 0.98, yBottom: 0.11, yTop: 0.6, n: 3.2, taper: 0.7 },
  { z: -1.5, w: 0.78, yBottom: 0.1, yTop: 0.46, n: 3.0, taper: 0.75 },
  { z: -2.2, w: 0.48, yBottom: 0.09, yTop: 0.3, n: 2.8, taper: 0.8 },
  { z: -2.75, w: 0.14, yBottom: 0.09, yTop: 0.2, n: 2.4, taper: 0.9 },
]

const CANOPY: LoftSection[] = [
  { z: 0.75, w: 0.22, yBottom: 0.6, yTop: 0.8, n: 2.4, taper: 0.9 },
  { z: 0.2, w: 0.44, yBottom: 0.56, yTop: 1.04, n: 2.4, taper: 0.7 },
  { z: -0.5, w: 0.44, yBottom: 0.5, yTop: 1.0, n: 2.4, taper: 0.7 },
  { z: -1.1, w: 0.3, yBottom: 0.44, yTop: 0.78, n: 2.4, taper: 0.8 },
  { z: -1.5, w: 0.08, yBottom: 0.4, yTop: 0.56, n: 2.2, taper: 0.9 },
]

/** The wheels turn slower than the road moves: at full speed the true rate would strobe against the frame rate. */
const WHEEL_SPIN = 0.16

interface CarPart extends ScenePart {
  update(palette: BlendedPalette, uniforms: HeroUniforms, rig: HeroRig): void
}

function buildCar(profile: QualityProfile, uniforms: HeroUniforms): CarPart {
  const root = new Group()
  const disposables: Array<{ dispose(): void }> = []
  const own = <T extends { dispose(): void }>(resource: T): T => {
    disposables.push(resource)
    return resource
  }

  const box = (w: number, h: number, d: number): BoxGeometry => own(new BoxGeometry(w, h, d))

  // Materials
  const glossy = profile.tier !== 'low'
  const bodyMaterial: Material = own(
    glossy
      ? new MeshPhysicalMaterial({ metalness: 0.78, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 })
      : new MeshStandardMaterial({ metalness: 0.7, roughness: 0.35 }),
  )
  const trimMaterial = own(new MeshStandardMaterial({ metalness: 0.5, roughness: 0.5 }))
  const glassMaterial = own(new MeshStandardMaterial({ color: 0x04060a, metalness: 1, roughness: 0.07 }))
  const tyreMaterial = own(new MeshStandardMaterial({ color: 0x0b0b0d, metalness: 0.1, roughness: 0.9 }))
  const rimMaterial = own(new MeshStandardMaterial({ color: 0x2a2c34, metalness: 0.9, roughness: 0.3 }))
  const lampMaterial = own(new MeshBasicMaterial({ toneMapped: false }))
  const blueMaterial = own(new MeshBasicMaterial({ toneMapped: false }))

  const mesh = (geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh => {
    const m = new Mesh(geometry, material)
    m.position.set(x, y, z)
    root.add(m)
    return m
  }

  // Body and canopy
  mesh(own(createLoft(BODY, profile.detail)), bodyMaterial)
  mesh(own(createLoft(CANOPY, profile.detail)), glassMaterial)
  mesh(box(1.9, 0.05, 4.8), trimMaterial, 0, 0.1, -0.1)

  // Rear wing: two planes, end plates and pylons.
  const mainPlane = mesh(box(2.1, 0.035, 0.55), trimMaterial, 0, 1.16, 2.62)
  mainPlane.rotation.x = -0.08
  const flap = mesh(box(2.0, 0.03, 0.32), trimMaterial, 0, 1.3, 2.78)
  flap.rotation.x = -0.22
  mesh(box(0.05, 0.62, 1.0), trimMaterial, -1.06, 1.08, 2.64)
  mesh(box(0.05, 0.62, 1.0), trimMaterial, 1.06, 1.08, 2.64)
  mesh(box(0.1, 0.5, 0.2), trimMaterial, -0.38, 0.92, 2.36)
  mesh(box(0.1, 0.5, 0.2), trimMaterial, 0.38, 0.92, 2.36)
  mesh(box(1.7, 0.03, 0.36), trimMaterial, 0, 0.44, 2.72)

  // Diffuser fins
  mesh(box(1.5, 0.04, 0.7), trimMaterial, 0, 0.2, 2.3)
  for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) mesh(box(0.025, 0.22, 0.6), trimMaterial, x, 0.3, 2.3)

  // Tail lights: a light bar across the rear, vertical fins on the end plates, a centre rain light.
  mesh(box(1.1, 0.07, 0.05), lampMaterial, 0, 0.53, 2.44)
  mesh(box(0.24, 0.1, 0.05), lampMaterial, 0, 0.32, 2.44)
  mesh(box(0.03, 0.4, 0.55), lampMaterial, -1.03, 1.12, 2.66)
  mesh(box(0.03, 0.4, 0.55), lampMaterial, 1.03, 1.12, 2.66)

  // Cobalt Blue edge lights along the sides: the restrained secondary accent.
  mesh(box(0.03, 0.03, 2.6), blueMaterial, -1.02, 0.2, 0.4)
  mesh(box(0.03, 0.03, 2.6), blueMaterial, 1.02, 0.2, 0.4)

  // Wheels. Each is a group so the tyre, rim and spokes spin together.
  const wheels: Array<{ group: Group; radius: number }> = []
  const addWheel = (x: number, z: number, radius: number, width: number) => {
    const group = new Group()
    group.position.set(x, radius, z)
    const tyre = own(new CylinderGeometry(radius, radius, width, profile.detail))
    tyre.rotateZ(Math.PI / 2)
    const rim = own(new CylinderGeometry(radius * 0.64, radius * 0.64, width * 1.02, profile.detail))
    rim.rotateZ(Math.PI / 2)
    group.add(new Mesh(tyre, tyreMaterial), new Mesh(rim, rimMaterial))
    const spoke = own(new BoxGeometry(width * 1.06, radius * 1.1, 0.07))
    for (let i = 0; i < 5; i++) {
      const s = new Mesh(spoke, trimMaterial)
      s.rotation.x = (i * Math.PI * 2) / 5 / 2
      group.add(s)
    }
    root.add(group)
    wheels.push({ group, radius })
  }
  addWheel(-1.2, 1.4, 0.46, 0.54)
  addWheel(1.2, 1.4, 0.46, 0.54)
  addWheel(-1.02, -1.75, 0.4, 0.4)
  addWheel(1.02, -1.75, 0.4, 0.4)

  // Light spill: a halo behind the tail lights and a red pool on the road behind the car.
  const glowUniforms = (intensity: number, power: number) => ({
    uColor: uniforms.uRed,
    uIntensity: { value: intensity },
    uPower: { value: power },
    uAdd: uniforms.uAdd,
    uGlow: uniforms.uGlow,
    uBright: uniforms.uBright,
    uPulse: uniforms.uPulse,
  })
  const halo: ShaderMaterial = own(createGlowMaterial(GLOW_VERT, GLOW_FRAG, glowUniforms(0.26, 2.8)))
  const haloQuad = mesh(own(new PlaneGeometry(3.4, 1.4)), halo, 0, 0.62, 2.7)
  const pool: ShaderMaterial = own(createGlowMaterial(GLOW_VERT, GLOW_FRAG, glowUniforms(0.16, 2.4)))
  const poolGeometry = own(new PlaneGeometry(4.6, 6.5))
  poolGeometry.rotateX(-Math.PI / 2)
  const poolQuad = mesh(poolGeometry, pool, 0, 0.03, 6.6)
  for (const m of [haloQuad, poolQuad]) {
    m.renderOrder = 4
    m.frustumCulled = false
  }

  // Contact shadow
  const shadowTexture: Texture = own(createRadialTexture())
  const shadowMaterial = own(new MeshBasicMaterial({ map: shadowTexture, color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false }))
  const shadowGeometry = own(new PlaneGeometry(4.6, 8.2))
  shadowGeometry.rotateX(-Math.PI / 2)
  mesh(shadowGeometry, shadowMaterial, 0, 0.02, 0.2).renderOrder = 1

  return {
    root,
    update(palette, shared, rig) {
      const { lights, squat } = rig.state
      const body = bodyMaterial as MeshStandardMaterial
      body.color.copy(palette.carBody)
      body.envMapIntensity = palette.env * 1.5
      trimMaterial.color.copy(palette.carTrim)
      trimMaterial.envMapIntensity = palette.env
      glassMaterial.envMapIntensity = palette.env * 1.4

      const emissive = (0.08 + 1.35 * lights) * palette.glow * (1 + shared.uPulse.value * 0.7)
      lampMaterial.color.copy(palette.red).multiplyScalar(emissive)
      blueMaterial.color.copy(palette.blue).multiplyScalar(0.25 + 0.8 * lights)
      halo.uniforms.uIntensity.value = 0.26 * lights
      pool.uniforms.uIntensity.value = 0.16 * lights

      const spin = rig.travel * WHEEL_SPIN
      for (const { group, radius } of wheels) group.rotation.x = -spin / radius

      // Rear squat as the car launches, and a slow idle bob so it never looks frozen.
      root.rotation.x = 0.035 * squat
      root.position.y = 0.012 * Math.sin(rig.elapsed * 2.1)
    },
    dispose() {
      for (const resource of disposables) resource.dispose()
    },
  }
}

export function RacingCar({
  profile,
  uniforms,
  palette,
  rig,
}: {
  profile: QualityProfile
  uniforms: HeroUniforms
  palette: BlendedPalette
  rig: HeroRig
}) {
  const part = usePart(() => buildCar(profile, uniforms))
  useFrame(() => part.update(palette, uniforms, rig))
  return <primitive object={part.root} />
}
