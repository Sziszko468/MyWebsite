import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Euler,
  Vector3,
  type Camera,
  type Texture,
} from 'three'
import { downloadBlob, safeFilename } from '../../experience/persist'
import { createEnvironment } from '../../experience/environment'
import { OrbitController } from '../../experience/orbit'
import { useSettle } from '../../experience/useSettle'
import { useStore } from '../../experience/store'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { Gizmo } from './gizmo'
import { GeometryCache } from './geometry'
import { StudioInteraction } from './interaction'
import { planLighting } from './lighting'
import { applyMaterialDef, createCarbonTexture, createStudioMaterial } from './materials'
import { selectedObject, type StudioObject } from './studioDoc'
import { patchUi, studio } from './studioStore'

/** What the page can ask of the scene: things only the renderer can do. */
export interface StudioApi {
  screenshot(): void
  exportGlb(): Promise<boolean>
  frame(): void
  view(name: 'front' | 'right' | 'top' | 'iso'): void
}

const HOME = { target: new Vector3(0, 0.9, 0), radius: 9, theta: 0.75, phi: 1.1 }

/** The twelve edges of a box, as line segments: the marker round the selected object. */
function boxEdges(box: Box3): BufferGeometry {
  const { min, max } = box
  const corners = [
    [min.x, min.y, min.z],
    [max.x, min.y, min.z],
    [max.x, min.y, max.z],
    [min.x, min.y, max.z],
    [min.x, max.y, min.z],
    [max.x, max.y, min.z],
    [max.x, max.y, max.z],
    [min.x, max.y, max.z],
  ]
  const edges = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]
  const positions: number[] = []
  for (const index of edges) positions.push(...corners[index])
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

function lines(points: number[], colours?: number[]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  if (colours) geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
  return geometry
}

interface MeshProps {
  object: StudioObject
  selected: boolean
  cache: GeometryCache
  carbon: Texture
  shadows: boolean
  registry: Map<string, Mesh>
  helpersHidden: RefObject<boolean>
}

function StudioMesh({ object, selected, cache, carbon, shadows, registry, helpersHidden }: MeshProps) {
  const mesh = useRef<Mesh>(null)
  const material = useMemo(() => createStudioMaterial(), [])
  const geometry = cache.get(object.kind, object.custom)
  const marker = useMemo(() => {
    geometry.computeBoundingBox()
    return boxEdges(geometry.boundingBox ?? new Box3())
  }, [geometry])
  const markerMaterial = useMemo(
    () => new LineBasicMaterial({ color: 0xff161f, depthTest: false, transparent: true, opacity: 0.95 }),
    [],
  )
  const selection = useRef<LineSegments>(null)

  useLayoutEffect(() => {
    applyMaterialDef(material, object.material, carbon, object.kind === 'plane')
  }, [material, object.material, object.kind, carbon])

  useEffect(() => {
    const node = mesh.current
    if (!node) return
    node.userData.id = object.id
    registry.set(object.id, node)
    return () => {
      registry.delete(object.id)
    }
  }, [registry, object.id])

  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => marker.dispose(), [marker])
  useEffect(() => () => markerMaterial.dispose(), [markerMaterial])

  useFrame(() => {
    if (selection.current) selection.current.visible = selected && !helpersHidden.current
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material as MeshPhysicalMaterial}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      visible={object.visible}
      castShadow={shadows && object.material.opacity > 0.6 && object.kind !== 'plane'}
      receiveShadow={shadows}
    >
      {selected && <lineSegments ref={selection} geometry={marker} material={markerMaterial} renderOrder={998} />}
    </mesh>
  )
}

export default function StudioScene({ apiRef }: { apiRef: RefObject<StudioApi | null> }) {
  const labScene = useLabScene()
  useSettle()
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)
  const set = useThree((state) => state.set)
  const invalidate = useThree((state) => state.invalidate)
  const state = useStore(studio, (value) => value)
  const { doc } = state
  const tier = labScene.profile.tier

  // The cameras: perspective and orthographic share one controller.
  const cameras = useMemo(() => {
    const perspective = new PerspectiveCamera(42, 1, 0.1, 400)
    const ortho = new OrthographicCamera(-1, 1, 1, -1, -200, 400)
    return { perspective, ortho }
  }, [])
  const current = state.ortho ? cameras.ortho : cameras.perspective
  const currentRef = useRef<Camera>(current)

  useLayoutEffect(() => {
    currentRef.current = current
    const { width, height } = size
    cameras.perspective.aspect = width / Math.max(height, 1)
    cameras.perspective.updateProjectionMatrix()
    cameras.ortho.left = -width / 2
    cameras.ortho.right = width / 2
    cameras.ortho.top = height / 2
    cameras.ortho.bottom = -height / 2
    cameras.ortho.updateProjectionMatrix()
    set({ camera: current })
    invalidate()
  }, [current, cameras, size, set, invalidate])

  const orbit = useMemo(() => {
    const controller = new OrbitController({ minRadius: 1.5, maxRadius: 80, maxPhi: Math.PI * 0.499, minPhi: 0.001 })
    controller.set(HOME.target, HOME.radius, HOME.theta, HOME.phi)
    return controller
  }, [])
  const gizmo = useMemo(() => new Gizmo(), [])
  useEffect(() => () => gizmo.dispose(), [gizmo])

  const cache = useMemo(() => new GeometryCache(tier === 'low' ? 0.5 : tier === 'medium' ? 0.75 : 1), [tier])
  useEffect(() => () => cache.dispose(), [cache])
  const carbon = useMemo(() => createCarbonTexture(), [])
  useEffect(() => () => carbon.dispose(), [carbon])
  const registry = useMemo(() => new Map<string, Mesh>(), [])
  const helpersHidden = useRef(false)

  // The reflections the materials show.
  useEffect(() => {
    const environment = createEnvironment(gl, 'studio', 1, true)
    scene.environment = environment.texture
    invalidate()
    return () => {
      scene.environment = null
      environment.dispose()
    }
  }, [gl, scene, invalidate])

  useEffect(() => {
    gl.shadowMap.enabled = tier !== 'low'
  }, [gl, tier])

  // Pointer handling: the editor first, so it can claim a press before the camera takes it.
  useEffect(() => {
    const element = gl.domElement.closest<HTMLElement>('[data-lab-stage]')
    if (!element) return
    const interaction = new StudioInteraction({
      element,
      getCamera: () => currentRef.current,
      getPickables: () => [...registry.values()].filter((mesh) => mesh.visible),
      gizmo,
      orbit,
      invalidate,
    })
    const detachInteraction = interaction.attach()
    orbit.shouldStart = (event) => !interaction.claimed.has(event.pointerId)
    orbit.onChange = invalidate
    const detachOrbit = orbit.attach(element, () => currentRef.current)
    return () => {
      detachOrbit()
      detachInteraction()
      orbit.shouldStart = null
      orbit.onChange = null
    }
  }, [gl, gizmo, orbit, registry, invalidate])

  // Things the page asks the scene to do.
  const capture = useRef<'idle' | 'pending' | 'hiding' | 'armed'>('idle')
  const frameSelection = () => {
    const object = selectedObject(studio.get().doc)
    const target = object ? new Vector3(...object.position) : HOME.target.clone()
    const extent = object ? Math.max(object.scale[0], object.scale[1], object.scale[2]) : 1
    orbit.goTo(target, Math.max(4, extent * 4.2), orbit.theta, orbit.phi)
  }
  useEffect(() => {
    apiRef.current = {
      screenshot: () => {
        capture.current = 'pending'
        invalidate()
      },
      frame: frameSelection,
      view: (name) => {
        const views = {
          front: [0, Math.PI / 2],
          right: [Math.PI / 2, Math.PI / 2],
          top: [0, 0.001],
          iso: [HOME.theta, HOME.phi],
        } as const
        const [theta, phi] = views[name]
        orbit.goTo(orbit.target.clone(), orbit.radius, theta, phi)
      },
      exportGlb: async () => {
        const visible = studio.get().doc.objects.filter((object) => object.visible)
        if (visible.length === 0) return false
        const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
        const group = new Group()
        group.name = 'LabModelStudio'
        const materials: MeshPhysicalMaterial[] = []
        for (const object of visible) {
          const material = createStudioMaterial()
          applyMaterialDef(material, object.material, carbon, object.kind === 'plane')
          materials.push(material)
          const node = new Mesh(cache.get(object.kind, object.custom), material)
          node.name = object.name
          node.position.set(...object.position)
          node.rotation.set(...object.rotation)
          node.scale.set(...object.scale)
          group.add(node)
        }
        try {
          const buffer = (await new GLTFExporter().parseAsync(group, {
            binary: true,
            onlyVisible: true,
            maxTextureSize: 512,
          })) as ArrayBuffer
          downloadBlob(new Blob([buffer], { type: 'model/gltf-binary' }), safeFilename('model-studio', 'glb'))
          return true
        } finally {
          for (const material of materials) material.dispose()
        }
      },
    }
    return () => {
      apiRef.current = null
    }
    // The api closes over stable objects only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef, orbit, cache, carbon, invalidate])

  // The screenshot is taken right after a frame without the helpers has been drawn.
  useFrame(() => {
    if (capture.current !== 'armed') return
    capture.current = 'idle'
    helpersHidden.current = false
    try {
      const url = gl.domElement.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = url
      link.download = safeFilename('model-studio', 'png')
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      patchUi({ drag: '' })
    }
    invalidate()
  }, 2)

  // The grid, the axes and the lights.
  const plan = useMemo(() => planLighting(doc.lighting), [doc.lighting])
  const shadows = tier !== 'low'
  const shadowSize = tier === 'high' ? 2048 : 1024

  const gridMaterials = useMemo(
    () => ({
      minor: new LineBasicMaterial({ transparent: true, opacity: 0.1, depthWrite: false }),
      major: new LineBasicMaterial({ transparent: true, opacity: 0.26, depthWrite: false }),
    }),
    [],
  )
  const gridGeometry = useMemo(() => {
    const minor: number[] = []
    const major: number[] = []
    const half = 20
    for (let i = -half; i <= half; i++) {
      const target = i % 5 === 0 ? major : minor
      target.push(i, 0, -half, i, 0, half, -half, 0, i, half, 0, i)
    }
    return { minor: lines(minor), major: lines(major) }
  }, [])
  const axesGeometry = useMemo(
    () =>
      lines(
        [-20, 0.002, 0, 20, 0.002, 0, 0, 0.002, -20, 0, 0.002, 20, 0, 0, 0, 0, 3.2, 0],
        [1, 0.09, 0.12, 1, 0.09, 0.12, 0.27, 0.36, 1, 0.27, 0.36, 1, 0.96, 0.94, 0.91, 0.96, 0.94, 0.91],
      ),
    [],
  )
  const axesMaterial = useMemo(
    () => new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }),
    [],
  )
  useEffect(
    () => () => {
      gridMaterials.minor.dispose()
      gridMaterials.major.dispose()
      gridGeometry.minor.dispose()
      gridGeometry.major.dispose()
      axesGeometry.dispose()
      axesMaterial.dispose()
    },
    [gridMaterials, gridGeometry, axesGeometry, axesMaterial],
  )

  const scratch = useMemo(() => ({ position: new Vector3(), quaternion: new Quaternion(), euler: new Euler() }), [])

  useLabFrame((s) => {
    const dt = s.clock.dt
    const camera = currentRef.current
    const moving = orbit.update(dt, camera, size.height)

    const ink = s.palette.ink
    gridMaterials.minor.color.copy(ink)
    gridMaterials.major.color.copy(ink)

    // Gizmo: on the selected object, the same size on screen.
    const object = selectedObject(studio.get().doc)
    const tool = studio.get().tool
    const show = !!object && !object.locked && tool !== 'select' && !helpersHidden.current
    gizmo.root.visible = show
    if (show && object) {
      gizmo.setTool(tool)
      scratch.position.set(...object.position)
      scratch.quaternion.setFromEuler(scratch.euler.set(...object.rotation, 'XYZ'))
      const ortho = camera as OrthographicCamera
      const distance = ortho.isOrthographicCamera ? 0 : camera.position.distanceTo(scratch.position)
      const sizeNow = ortho.isOrthographicCamera ? ((ortho.top - ortho.bottom) / ortho.zoom) * 0.17 : distance * 0.17
      gizmo.place(scratch.position, tool === 'scale' ? scratch.quaternion : null, sizeNow)
    }

    // A screenshot waits two frames: one for the helpers to hide, one drawn without them.
    if (capture.current === 'pending') {
      helpersHidden.current = true
      gizmo.root.visible = false
      capture.current = 'hiding'
      return true
    }
    if (capture.current === 'hiding') {
      capture.current = 'armed'
      return true
    }

    scene.environmentIntensity = plan.rig.environment * (0.6 + 0.4 * plan.gain)
    return moving
  })

  return (
    <>
      <ambientLight color={plan.rig.ambient.color} intensity={plan.rig.ambient.intensity * plan.gain * 2} />
      <directionalLight
        color={plan.rig.key.color}
        intensity={plan.rig.key.intensity * plan.gain}
        position={[plan.key[0] * 12, plan.key[1] * 12, plan.key[2] * 12]}
        castShadow={shadows}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-radius={plan.rig.hardShadows ? 1.5 : 7}
      />
      <directionalLight
        color={plan.rig.fill.color}
        intensity={plan.rig.fill.intensity * plan.gain}
        position={[plan.fill[0] * 12, plan.fill[1] * 12, plan.fill[2] * 12]}
      />
      <directionalLight
        color={plan.rig.rim.color}
        intensity={plan.rig.rim.intensity * plan.gain}
        position={[plan.rim[0] * 12, plan.rim[1] * 12, plan.rim[2] * 12]}
      />

      {shadows && (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <shadowMaterial opacity={plan.rig.hardShadows ? 0.55 : 0.32} transparent />
        </mesh>
      )}

      {state.grid && (
        <>
          <lineSegments geometry={gridGeometry.minor} material={gridMaterials.minor} />
          <lineSegments geometry={gridGeometry.major} material={gridMaterials.major} />
        </>
      )}
      {state.axes && <lineSegments geometry={axesGeometry} material={axesMaterial} />}

      {doc.objects.map((object) => (
        <StudioMesh
          key={object.id}
          object={object}
          selected={object.id === doc.selectedId}
          cache={cache}
          carbon={carbon}
          shadows={shadows}
          registry={registry}
          helpersHidden={helpersHidden}
        />
      ))}

      <primitive object={gizmo.root} />
    </>
  )
}
