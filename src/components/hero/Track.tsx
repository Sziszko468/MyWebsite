import { useFrame } from '@react-three/fiber'
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { createRibbon, createWall, trackCurve } from './heroGeometry'
import { createAsphaltTexture } from './heroMaterials'
import { MARKING_FRAG, MARKING_VERT } from './heroShaders'
import { usePart, type ScenePart } from './usePart'
import type { BlendedPalette, HeroUniforms } from './heroUniforms'
import { DASH_PITCH, TRACK_WIDTH, type QualityProfile } from './velocityHeroConfig'

const TEXTURE_TILE = 6
const WALL_OFFSET = TRACK_WIDTH / 2 + 2.6

interface TrackPart extends ScenePart {
  update(palette: BlendedPalette, uniforms: HeroUniforms): void
}

function buildTrack(profile: QualityProfile, uniforms: HeroUniforms): TrackPart {
  const root = new Group()
  const asphalt = createAsphaltTexture(profile.tier === 'low' ? 128 : 256)
  asphalt.repeat.set(3, 1 / TEXTURE_TILE)

  const surfaceGeometry = createRibbon(trackCurve, { samples: profile.trackSamples, offset: 0, halfWidth: TRACK_WIDTH / 2, y: 0 })
  const surfaceMaterial = new MeshStandardMaterial({ map: asphalt, roughness: 0.62, metalness: 0.1 })
  const surface = new Mesh(surfaceGeometry, surfaceMaterial)

  const markingGeometry = createRibbon(trackCurve, { samples: profile.trackSamples, offset: 0, halfWidth: TRACK_WIDTH / 2, y: 0.012 })
  const markingMaterial = new ShaderMaterial({
    vertexShader: MARKING_VERT,
    fragmentShader: MARKING_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: surfaceMaterial.color.clone() },
      uTravel: uniforms.uTravel,
      uPitch: { value: DASH_PITCH },
      uAlpha: { value: 0.55 },
      uFogNear: uniforms.uFogNear,
      uFogFar: uniforms.uFogFar,
      uBright: uniforms.uBright,
    },
  })
  const markings = new Mesh(markingGeometry, markingMaterial)
  markings.renderOrder = 1

  // Low barriers on both sides frame the road and make the bend readable.
  const wallMaterial = new MeshStandardMaterial({ roughness: 0.5, metalness: 0.35, side: DoubleSide })
  const wallGeometries = [-WALL_OFFSET, WALL_OFFSET].map((offset) => createWall(trackCurve, profile.trackSamples, offset, 0.7))
  const walls = wallGeometries.map((geometry) => new Mesh(geometry, wallMaterial))

  // Ground that blends into the fog; everything past the barriers is empty night (or paper).
  const groundGeometry = new PlaneGeometry(700, 700)
  groundGeometry.rotateX(-Math.PI / 2)
  const groundMaterial = new MeshBasicMaterial()
  const ground = new Mesh(groundGeometry, groundMaterial)
  ground.position.set(0, -0.04, -80)

  root.add(ground, surface, markings, ...walls)
  for (const mesh of [surface, markings, ground, ...walls]) mesh.frustumCulled = false

  return {
    root,
    update(palette, shared) {
      surfaceMaterial.color.copy(palette.track)
      surfaceMaterial.envMapIntensity = palette.reflection * palette.env
      asphalt.offset.y = shared.uTravel.value / TEXTURE_TILE
      markingMaterial.uniforms.uColor.value.copy(palette.marking)
      wallMaterial.color.copy(palette.carTrim)
      wallMaterial.envMapIntensity = palette.reflection * palette.env
      groundMaterial.color.copy(palette.bg)
    },
    dispose() {
      for (const resource of [surfaceGeometry, markingGeometry, groundGeometry, ...wallGeometries, surfaceMaterial, markingMaterial, wallMaterial, groundMaterial, asphalt]) {
        resource.dispose()
      }
    },
  }
}

/** The road: asphalt with a long bend, muted lane markings sliding towards the camera, and barriers. */
export function Track({ profile, uniforms, palette }: { profile: QualityProfile; uniforms: HeroUniforms; palette: BlendedPalette }) {
  const part = usePart(() => buildTrack(profile, uniforms))
  useFrame(() => part.update(palette, uniforms))
  return <primitive object={part.root} />
}
