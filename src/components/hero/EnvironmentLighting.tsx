import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  Color,
  DoubleSide,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  type ShaderMaterial,
  type AmbientLight,
  type DirectionalLight,
  type PointLight,
} from 'three'
import { createGlowMaterial } from './heroMaterials'
import { GLOW_FRAG, GLOW_VERT } from './heroShaders'
import { usePart } from './usePart'
import type { HeroRig } from './heroRig'
import type { BlendedPalette, HeroUniforms } from './heroUniforms'
import { FOG, type QualityProfile } from './velocityHeroConfig'

/**
 * A small studio built from scratch and baked into a reflection environment, so the car and the
 * road have something to reflect without downloading an HDR image: a soft box above, a red strip
 * behind (the tail-light colour) and a cobalt strip to one side.
 */
function buildStudio(light: boolean) {
  const studio = new Scene()
  studio.background = new Color(light ? 0xa9aeb8 : 0x050507)

  const geometries: PlaneGeometry[] = []
  const materials: MeshBasicMaterial[] = []
  const panel = (width: number, height: number, color: number, strength: number, position: [number, number, number]) => {
    const geometry = new PlaneGeometry(width, height)
    const material = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(strength), side: DoubleSide, toneMapped: false })
    const mesh = new Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.lookAt(0, 0.5, 0)
    studio.add(mesh)
    geometries.push(geometry)
    materials.push(material)
  }

  panel(12, 6, 0xffffff, light ? 3 : 3.2, [0, 7, 1])
  panel(1.6, 6, 0xff161f, light ? 3.5 : 6, [-6, 2.5, 5])
  panel(10, 0.6, 0xff161f, light ? 2.5 : 4, [0, 1.2, 7])
  panel(1.6, 6, 0x445cff, light ? 2.5 : 6, [6.5, 2.5, -3])
  panel(1.4, 5, 0x445cff, light ? 2 : 4, [-6.5, 2, 3])
  panel(6, 3, 0xffffff, light ? 2.2 : 0.8, [-6, 4, -6])

  return {
    studio,
    dispose() {
      for (const resource of [...geometries, ...materials]) resource.dispose()
    },
  }
}

/** Two soft glows on the horizon, red where the road vanishes and cobalt to its left. */
function buildHorizon(uniforms: HeroUniforms) {
  const root = new Group()
  const geometry = new PlaneGeometry(1, 1)
  const materials: ShaderMaterial[] = []

  const glow = (color: HeroUniforms['uRed'], x: number, y: number, width: number, height: number, intensity: number) => {
    const material = createGlowMaterial(GLOW_VERT, GLOW_FRAG, {
      uColor: color,
      uIntensity: { value: intensity },
      uPower: { value: 2.6 },
      uAdd: uniforms.uAdd,
      uGlow: uniforms.uGlow,
      uBright: uniforms.uBright,
      uPulse: uniforms.uPulse,
    })
    const mesh = new Mesh(geometry, material)
    mesh.position.set(x, y, -168)
    mesh.scale.set(width, height, 1)
    mesh.renderOrder = 0
    mesh.frustumCulled = false
    root.add(mesh)
    materials.push(material)
  }
  glow(uniforms.uRed, 10, 4, 84, 24, 0.3)
  glow(uniforms.uBlue, -30, 3, 70, 20, 0.2)

  return {
    root,
    dispose() {
      geometry.dispose()
      for (const material of materials) material.dispose()
    },
  }
}

/**
 * Lighting and atmosphere: the reflection environment, the lamps that light the road and the
 * car, and the fog that melts the far end of the track into the page colour. Everything follows
 * the eased palette, so a theme change re-tunes the light without restarting the scene.
 */
export function EnvironmentLighting({
  profile,
  palette,
  uniforms,
  rig,
  light,
}: {
  profile: QualityProfile
  palette: BlendedPalette
  uniforms: HeroUniforms
  rig: HeroRig
  /** Whether the light theme is active; picks which studio is baked. */
  light: boolean
}) {
  const { gl, scene } = useThree()
  const ambient = useRef<AmbientLight>(null)
  const key = useRef<DirectionalLight>(null)
  const tailRed = useRef<PointLight>(null)
  const sideBlue = useRef<PointLight>(null)
  const fog = useRef(new Fog(0x000000, FOG.near, FOG.far))
  const horizon = usePart(() => buildHorizon(uniforms))

  useEffect(() => {
    const { studio, dispose } = buildStudio(light)
    const generator = new PMREMGenerator(gl)
    const target = generator.fromScene(studio, 0.03, 0.1, 100, { size: profile.envSize })
    scene.environment = target.texture
    dispose()
    generator.dispose()
    return () => {
      scene.environment = null
      target.dispose()
    }
  }, [gl, scene, light, profile.envSize])

  useEffect(() => {
    scene.background = palette.bg
    scene.fog = fog.current
    return () => {
      scene.background = null
      scene.fog = null
    }
  }, [scene, palette])

  useFrame(() => {
    const { lights } = rig.state
    const bright = uniforms.uBright.value
    const pulse = 1 + rig.pulse * 0.9
    scene.environmentIntensity = palette.env * (0.35 + 0.65 * lights) * (0.6 + 0.4 * bright)
    fog.current.color.copy(palette.bg)

    if (ambient.current) ambient.current.intensity = 0.1 * palette.env + 0.1 * lights
    if (key.current) key.current.intensity = (0.4 + 0.9 * lights) * palette.env
    if (tailRed.current) {
      tailRed.current.color.copy(palette.red)
      tailRed.current.intensity = 3 * lights * palette.glow * pulse * bright
    }
    if (sideBlue.current) {
      sideBlue.current.color.copy(palette.blue)
      sideBlue.current.intensity = 5 * lights * palette.glow * bright
    }
  })

  return (
    <>
      <ambientLight ref={ambient} />
      <directionalLight ref={key} position={[-4, 7, 6]} color={0xdfe6ff} />
      <pointLight ref={tailRed} position={[0, 0.9, 4.4]} distance={22} decay={2} />
      <pointLight ref={sideBlue} position={[-4.5, 3.2, -3]} distance={18} decay={2} />
      <primitive object={horizon.root} />
    </>
  )
}
