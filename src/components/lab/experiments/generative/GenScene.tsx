import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  CanvasTexture,
  Group,
  MathUtils,
  Box3,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Texture,
} from 'three'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { useStageCapture, type CaptureKind } from '../../core/useStageCapture'
import { createEnvironment } from '../../experience/environment'
import { OrbitController } from '../../experience/orbit'
import { useStore } from '../../experience/store'
import { composeObject, meshesOf, type Composed } from './compose'
import { exportGlb } from './glb'
import { gen, patchViewer, setModelLoad, setStats, shownModel } from './genStore'
import { createRandom } from './ideas'
import type { BackgroundId, CameraAngle, LightId } from './spec'

/** What the page can ask of the scene: things only the renderer, or the built object, can do. */
export interface SceneApi {
  capture(kind: CaptureKind): Promise<string | null>
  /** The model as a GLB file: the procedural build, or the AI model exactly as it was received. */
  exportGlb(): Promise<ArrayBuffer | null>
  /** Back to the camera angle the Look names, centred on the object. */
  resetView(): void
}

const VIEWS: Record<CameraAngle, { theta: number; phi: number; zoom: number; lift: number }> = {
  'three-quarter': { theta: 0.72, phi: 1.3, zoom: 1, lift: 0 },
  front: { theta: 0, phi: 1.48, zoom: 1, lift: 0 },
  side: { theta: Math.PI / 2, phi: 1.48, zoom: 1, lift: 0 },
  top: { theta: 0.3, phi: 0.2, zoom: 1.05, lift: 0 },
  low: { theta: 0.45, phi: 1.66, zoom: 0.95, lift: 0 },
  close: { theta: 0.5, phi: 1.38, zoom: 0.55, lift: 0.28 },
}

/** The distance that fits a sphere of this radius in a 38° view, with some air. */
const FIT = 2.65

function backgroundTexture(id: BackgroundId): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const g = canvas.getContext('2d')!
  const radial = (stops: Array<[number, string]>, cx = 0.5, cy = 0.62, r = 0.75) => {
    const gradient = g.createRadialGradient(256 * 2 * cx, 512 * cy, 0, 256 * 2 * cx, 512 * cy, 512 * r)
    for (const [at, colour] of stops) gradient.addColorStop(at, colour)
    g.fillStyle = gradient
    g.fillRect(0, 0, 512, 512)
  }
  const linear = (stops: Array<[number, string]>) => {
    const gradient = g.createLinearGradient(0, 0, 0, 512)
    for (const [at, colour] of stops) gradient.addColorStop(at, colour)
    g.fillStyle = gradient
    g.fillRect(0, 0, 512, 512)
  }
  switch (id) {
    case 'red':
      radial([[0, '#ff3a3f'], [0.35, '#a30f1a'], [1, '#12060a']], 0.5, 0.58, 0.85)
      break
    case 'paper':
      linear([[0, '#f8f4ec'], [1, '#d6cfbf']])
      radial([[0, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']], 0.5, 0.55, 0.6)
      break
    case 'sunset':
      linear([[0, '#1b0b3b'], [0.45, '#8a2b5b'], [0.78, '#ff7a45'], [1, '#ffcf8a']])
      break
    case 'grid':
      radial([[0, '#1a2140'], [1, '#05060c']])
      break
    case 'night': {
      linear([[0, '#04050d'], [1, '#101a44']])
      const random = createRandom(11)
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(255,255,255,${0.25 + random() * 0.6})`
        g.fillRect(random() * 512, random() * 380, 1 + random() * 1.4, 1 + random() * 1.4)
      }
      break
    }
    default:
      radial([[0, '#2a2a33'], [0.55, '#14141a'], [1, '#07070a']])
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = 'srgb'
  return texture
}

const FLOOR: Record<BackgroundId, number> = {
  carbon: 0x17171d,
  red: 0x2a0a0e,
  paper: 0xe4dece,
  sunset: 0x2e1233,
  grid: 0x0a0d1c,
  night: 0x0a1030,
}

function Lights({ id, shadows }: { id: LightId; shadows: boolean }) {
  const size = shadows ? 1024 : 256
  const key = {
    castShadow: shadows,
    'shadow-mapSize': [size, size] as [number, number],
    'shadow-camera-left': -6,
    'shadow-camera-right': 6,
    'shadow-camera-top': 6,
    'shadow-camera-bottom': -6,
    'shadow-camera-near': 1,
    'shadow-camera-far': 30,
    'shadow-bias': -0.0005,
    'shadow-radius': 5,
  }
  switch (id) {
    case 'dramatic':
      return (
        <>
          <ambientLight intensity={0.05} />
          <directionalLight color={0xffd9b0} intensity={3.1} position={[-5, 6, 3]} {...key} />
          <directionalLight color={0xff2a2a} intensity={3.6} position={[4, 3, -5]} />
        </>
      )
    case 'neon':
      return (
        <>
          <ambientLight intensity={0.08} color={0x6a5cff} />
          <pointLight color={0x19e6ff} intensity={90} distance={30} decay={1.6} position={[-4, 2.5, 3]} />
          <pointLight color={0xff3df0} intensity={90} distance={30} decay={1.6} position={[4, 2.5, 2]} />
          <directionalLight color={0xffffff} intensity={0.5} position={[0, 7, 4]} {...key} />
        </>
      )
    case 'sunset':
      return (
        <>
          <ambientLight intensity={0.18} color={0xffb08a} />
          <directionalLight color={0xffb070} intensity={3.2} position={[6, 3, 4]} {...key} />
          <directionalLight color={0x7a8cff} intensity={0.8} position={[-5, 4, -3]} />
        </>
      )
    case 'moon':
      return (
        <>
          <ambientLight intensity={0.14} color={0x5a78ff} />
          <directionalLight color={0x9bb7ff} intensity={1.7} position={[-4, 7, 4]} {...key} />
          <directionalLight color={0xdfe9ff} intensity={1.5} position={[3, 3, -6]} />
        </>
      )
    default:
      return (
        <>
          <ambientLight intensity={0.3} />
          <directionalLight color={0xffffff} intensity={2.4} position={[4, 7, 5]} {...key} />
          <directionalLight color={0xc9d6ff} intensity={0.9} position={[-5, 3, 3]} />
          <directionalLight color={0xffffff} intensity={1.3} position={[-3, 4, -6]} />
        </>
      )
  }
}

const ENVIRONMENT: Record<LightId, { kind: 'studio' | 'sky'; strength: number; dark: boolean }> = {
  studio: { kind: 'studio', strength: 1, dark: true },
  dramatic: { kind: 'studio', strength: 0.3, dark: true },
  neon: { kind: 'studio', strength: 0.95, dark: true },
  sunset: { kind: 'sky', strength: 0.7, dark: true },
  moon: { kind: 'studio', strength: 0.3, dark: true },
}

function measure(root: Group, ms: number) {
  const meshes = meshesOf(root)
  let triangles = 0
  const textures = new Set<Texture>()
  for (const mesh of meshes) {
    const geometry = mesh.geometry as BufferGeometry
    triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) if ((value as Texture | null)?.isTexture) textures.add(value as Texture)
    }
  }
  return { parts: meshes.length, triangles: Math.round(triangles), ms: Math.round(ms), textures: textures.size }
}

/** The materials a model came with, kept so the viewer-only shading can be switched back. */
const ORIGINAL = 'originalMaterial'

function releaseModel(group: Group) {
  group.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const original = mesh.userData[ORIGINAL] as Material | Material[] | undefined
    for (const material of [mesh.material, original ?? []].flat()) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if ((value as Texture | null)?.isTexture) (value as Texture).dispose()
      }
      ;(material as Material).dispose()
    }
  })
}

/** Switches how a model is shown (its own materials, a plain clay, or a wireframe) without touching the model. */
function applyShading(group: Group, shading: 'natural' | 'clay' | 'wireframe', clay: Material, wire: Material) {
  group.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    if (mesh.userData[ORIGINAL] === undefined) mesh.userData[ORIGINAL] = mesh.material
    mesh.material = shading === 'clay' ? clay : shading === 'wireframe' ? wire : (mesh.userData[ORIGINAL] as Material | Material[])
  })
}

export default function GenScene({ apiRef }: { apiRef: RefObject<SceneApi | null> }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const { profile } = useLabScene()
  const capture = useStageCapture()

  const current = useStore(gen, (state) => state.current)
  const aiModel = useStore(gen, shownModel)
  const viewer = useStore(gen, (state) => state.viewer)
  const look = current?.look ?? null
  const build = current?.build ?? 0
  const quickBuild = current?.source === 'quick' ? build : 0

  const pivot = useRef<Group>(null)
  const [composed, setComposed] = useState<Composed | null>(null)
  const [model, setModel] = useState<Group | null>(null)
  const born = useRef(-1)
  const spin = useRef(0)
  const touched = useRef(-10)

  // A Quick object, built from what was understood. It is built again only when its build number changes.
  // An AI creation never builds one: there is no procedural stand-in for a model that is coming or has failed.
  useEffect(() => {
    const now = gen.get().current
    if (!now || now.source !== 'quick') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setComposed(null)
      return
    }
    const started = performance.now()
    const made = composeObject(now.spec, now.seed)
    setStats(measure(made.root, performance.now() - started))
    setComposed(made)
    born.current = -1
    return () => made.dispose()
  }, [quickBuild])

  // A model from the engine, loaded from the checked file.
  useEffect(() => {
    if (!aiModel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModel(null)
      if (gen.get().current?.source === 'ai') setStats(null)
      return
    }
    let cancelled = false
    let loaded: Group | null = null
    const started = performance.now()
    void import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      new GLTFLoader().parse(
        aiModel.slice(0),
        '',
        (gltf) => {
          if (cancelled) return releaseModel(gltf.scene)
          const group = new Group()
          group.add(gltf.scene)
          const box = new Box3().setFromObject(gltf.scene)
          const extent = box.getSize(new Vector3())
          const fit = 2.6 / Math.max(extent.x, extent.y, extent.z, 0.001)
          const centre = box.getCenter(new Vector3())
          gltf.scene.position.set(-centre.x, -box.min.y, -centre.z)
          group.scale.setScalar(fit)
          group.userData.fit = fit
          // Where the camera should look and how far it must stand back, from the model's own size.
          group.userData.middle = (extent.y * fit) / 2
          group.userData.reach = Math.max(0.8, extent.length() * fit * 0.5 * 1.3)
          loaded = group
          born.current = -1
          setStats(measure(group, performance.now() - started))
          setModel(group)
          setModelLoad('ready')
        },
        () => {
          if (cancelled) return
          setModel(null)
          setModelLoad('error')
        },
      )
    })
    return () => {
      cancelled = true
      if (loaded) releaseModel(loaded)
    }
  }, [aiModel])

  // How it is dressed, without building it again.
  useEffect(() => {
    if (look) composed?.applyLook(look)
    if (look && model) model.scale.setScalar((model.userData.fit as number) * look.scale)
    invalidate()
  }, [composed, model, look, invalidate])

  // Viewer-only shading of an AI model: its own materials, a plain clay, or a wireframe. The model file is never changed.
  const [shaders, setShaders] = useState<{ clay: Material; wire: Material } | null>(null)
  useEffect(() => {
    const clay = new MeshStandardMaterial({ color: 0xbfc3cc, roughness: 0.85, metalness: 0 })
    const wire = new MeshBasicMaterial({ color: 0xe6edf7, wireframe: true })
    // The materials are made here (not while rendering) so they can be disposed with it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShaders({ clay, wire })
    return () => {
      clay.dispose()
      wire.dispose()
    }
  }, [])
  useEffect(() => {
    if (model && shaders) applyShading(model, viewer.shading, shaders.clay, shaders.wire)
    invalidate()
  }, [model, shaders, viewer.shading, invalidate])

  useEffect(() => {
    gl.toneMappingExposure = viewer.exposure
    scene.environmentIntensity = viewer.reflections
    invalidate()
  }, [gl, scene, viewer.exposure, viewer.reflections, invalidate])

  // The camera.
  const orbit = useMemo(() => new OrbitController({ minRadius: 1.5, maxRadius: 40, minPhi: 0.1, maxPhi: 1.72 }), [])
  useEffect(() => {
    const element = gl.domElement.closest<HTMLElement>('[data-lab-stage]')
    if (!element) return
    orbit.onChange = invalidate
    const detach = orbit.attach(element, () => camera)
    const touch = () => (touched.current = performance.now() / 1000)
    element.addEventListener('pointerdown', touch)
    element.addEventListener('pointermove', touch)
    element.addEventListener('wheel', touch)
    return () => {
      detach()
      element.removeEventListener('pointerdown', touch)
      element.removeEventListener('pointermove', touch)
      element.removeEventListener('wheel', touch)
      orbit.onChange = null
    }
  }, [gl, camera, orbit, invalidate])

  useEffect(() => {
    orbit.primaryPans = viewer.pan
  }, [orbit, viewer.pan])

  const angle = look?.camera ?? 'three-quarter'
  const scale = look?.scale ?? 1
  const reach = model ? ((model.userData.reach as number | undefined) ?? 1.45) : (composed?.radius ?? 2.2)
  const middle = model ? ((model.userData.middle as number | undefined) ?? 1.3) : (composed?.centre.y ?? 1.2)
  const frame = useCallback(() => {
    const view = VIEWS[angle]
    const grown = Math.max(1, scale * 0.85)
    orbit.goTo(new Vector3(0, middle * Math.min(scale, 1.6) + view.lift * reach, 0), Math.max(2.4, reach * FIT * view.zoom * grown), view.theta, view.phi)
  }, [angle, reach, middle, orbit, scale])
  useEffect(() => {
    frame()
  }, [frame, build, model])

  // Light and reflections.
  const lighting = look?.lighting ?? 'studio'
  useEffect(() => {
    const spec = ENVIRONMENT[lighting]
    const environment = createEnvironment(gl, spec.kind, spec.strength, spec.dark)
    scene.environment = environment.texture
    invalidate()
    return () => {
      scene.environment = null
      environment.dispose()
    }
  }, [gl, scene, lighting, invalidate])

  const background = look?.background ?? 'carbon'
  // The "grid" backdrop is a grid: choosing it turns the grid on (and it can be turned off again).
  useEffect(() => {
    if (background === 'grid') patchViewer({ grid: true })
  }, [background])
  useEffect(() => {
    const texture = backgroundTexture(background)
    scene.background = texture
    invalidate()
    return () => {
      scene.background = null
      texture.dispose()
    }
  }, [scene, background, invalidate])

  useEffect(() => {
    gl.shadowMap.enabled = profile.tier !== 'low'
  }, [gl, profile.tier])

  // What the page asks of the scene.
  useEffect(() => {
    apiRef.current = {
      capture,
      async exportGlb() {
        const now = gen.get()
        const received = shownModel(now)
        if (now.current?.source === 'ai') return received ? received.slice(0) : null
        return composed ? exportGlb(composed.root) : null
      },
      resetView: frame,
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, capture, composed, frame])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const handle = window as unknown as { __gen?: unknown }
    handle.__gen = { composed, orbit, model, store: gen }
    return () => {
      handle.__gen = undefined
    }
  }, [composed, orbit, model])

  useLabFrame((s) => {
    const motion = s.autonomous ? s.motion : 0
    const moving = orbit.update(s.clock.dt, camera, size.height)
    composed?.update(s.clock.t, motion)

    let popping = false
    const group = pivot.current
    if (group) {
      if (born.current < 0) born.current = s.clock.t
      const k = Math.min(1, (s.clock.t - born.current) / 0.55)
      popping = k < 1 && s.autonomous
      const eased = 1 - Math.pow(1 - k, 3)
      group.scale.setScalar(s.autonomous ? 0.72 + 0.28 * eased : 1)
      const idle = performance.now() / 1000 - touched.current > 2.5
      if (look?.spin && idle) spin.current += s.clock.dt * 0.5 * motion
      group.rotation.y = MathUtils.degToRad(look?.rotation ?? 0) + spin.current
    }
    return moving || popping
  })

  const shadows = profile.tier !== 'low'
  return (
    <>
      <Lights id={lighting} shadows={shadows} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.002, 0]}>
        <circleGeometry args={[7.5, 72]} />
        <meshStandardMaterial color={FLOOR[background]} roughness={0.6} metalness={0.15} />
      </mesh>
      {viewer.grid && <gridHelper args={[15, 15, 0x19e6ff, 0x1d2a55]} position={[0, 0.004, 0]} />}
      <group ref={pivot}>
        {composed && !model && <primitive object={composed.root} />}
        {model && <primitive object={model} />}
      </group>
    </>
  )
}
