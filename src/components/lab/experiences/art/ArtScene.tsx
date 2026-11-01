import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { useStageCapture } from '../../core/useStageCapture'
import { useStore } from '../../experience/store'
import { useSettle } from '../../experience/useSettle'
import { art, type ArtParams } from './artParams'
import { ParticleField, newPointer } from './artSim'

/** What the page can ask of the scene: things only the renderer can do. */
export interface ArtApi {
  /** The picture as a PNG data URL; `thumb` is a small one for a preview. Null if it could not be made. */
  capture(kind: 'full' | 'thumb'): Promise<string | null>
  /** Throws the particles apart from the middle (the click, for a button). */
  burst(): void
}

const VERTEX = `
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uPixel;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uPixel / max(-view.z, 0.5), 1.0, 40.0);
    gl_Position = projectionMatrix * view;
  }
`
const FRAGMENT = `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 1.6);
    gl_FragColor = vec4(vColor * (0.55 + 0.9 * a), a * 0.85);
  }
`

/**
 * The picture: tens of thousands of soft points whose positions are the simulation's own array. The
 * pointer is turned into a point on the middle plane and handed to the simulation; a click is an
 * impulse. Changing a parameter changes the piece at once (a new formation lets the particles flow
 * to it), and the seed or the count rebuilds it.
 */
export default function ArtScene({ apiRef }: { apiRef: RefObject<ArtApi | null> }) {
  const lab = useLabScene()
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  useSettle()
  const params = useStore(art, (value) => value.params)
  const paused = useStore(art, (value) => value.paused)
  const capacity = lab.profile.particles

  const field = useMemo(() => new ParticleField(capacity), [capacity])
  const parts = useMemo(() => {
    const geometry = new BufferGeometry()
    const position = new BufferAttribute(field.position, 3)
    position.setUsage(DynamicDrawUsage)
    const colours = new Float32Array(capacity * 3)
    const colour = new BufferAttribute(colours, 3)
    const sizes = new BufferAttribute(field.size, 1)
    geometry.setAttribute('position', position)
    geometry.setAttribute('aColor', colour)
    geometry.setAttribute('aSize', sizes)
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uPixel: { value: 300 } },
    })
    const points = new Points(geometry, material)
    points.frustumCulled = false
    return { geometry, material, points, position, colour, sizes, colours }
  }, [field, capacity])
  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.material.dispose()
    },
    [parts],
  )

  // The parameters the simulation last saw, to tell a change of shape from a change of piece.
  const seen = useRef<ArtParams | null>(null)
  useEffect(() => {
    const before = seen.current
    const rebuild = !before || before.seed !== params.seed || before.count !== params.count
    if (rebuild) field.build(params)
    else if (
      before.formation !== params.formation ||
      before.scale !== params.scale ||
      before.distortion !== params.distortion ||
      before.noise !== params.noise
    )
      field.retarget(params)
    field.paint(params, parts.colours)
    parts.colour.needsUpdate = true
    parts.sizes.needsUpdate = true
    parts.geometry.setDrawRange(0, field.count)
    seen.current = params
    invalidate()
  }, [params, field, parts, invalidate])

  // Pixels per world unit at one unit of distance, so a particle keeps its size whatever the screen.
  useEffect(() => {
    const fov = ((camera as { fov?: number }).fov ?? 45) * (Math.PI / 180)
    parts.material.uniforms.uPixel.value = ((size.height * gl.getPixelRatio()) / (2 * Math.tan(fov / 2))) * 0.035
    invalidate()
  }, [camera, size.height, gl, parts, invalidate])

  // The pointer, as a point in the middle of the picture.
  const pointer = useMemo(() => newPointer(), [])
  const latest = useRef({ params, paused })
  useEffect(() => {
    latest.current = { params, paused }
  })
  useEffect(() => {
    const element = gl.domElement.closest<HTMLElement>('[data-lab-stage]')
    if (!element) return
    const ray = new Vector3()
    const place = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      ray.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize()
      const t = -camera.position.z / (ray.z || -1)
      pointer.x = camera.position.x + ray.x * t
      pointer.y = camera.position.y + ray.y * t
      pointer.z = 0
      invalidate()
    }
    const move = (event: PointerEvent) => {
      place(event)
      pointer.active = true
    }
    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('button, input, select, label, a')) return
      place(event)
      pointer.active = true
      field.impulse(
        pointer.x,
        pointer.y,
        0,
        Math.max(0.6, latest.current.params.force) * (latest.current.params.pointer === 'attract' ? -0.8 : 1),
      )
    }
    const leave = () => {
      pointer.active = false
    }
    const up = (event: PointerEvent) => {
      // A finger is only there while it touches; a mouse stays.
      if (event.pointerType !== 'mouse') pointer.active = false
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointerleave', leave)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', leave)
    return () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointerleave', leave)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', leave)
    }
  }, [gl, camera, field, pointer, invalidate])

  // Pictures: taken by the shared hook, after the scene has been drawn into the canvas again.
  const capture = useStageCapture()
  useEffect(() => {
    apiRef.current = {
      capture,
      burst: () => {
        field.impulse(0, 0, 0, Math.max(0.8, latest.current.params.force))
        invalidate()
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, capture, field, invalidate])

  // The art is made of light: it is drawn on carbon in both themes, because added light on paper turns to white.
  const backdrop = useMemo(() => new Color(0x0b0b0d), [])
  useLabFrame((s) => {
    if (scene.background !== backdrop) scene.background = backdrop
    const { params: current, paused: stopped } = latest.current
    if (stopped) return false
    field.step(s.clock.dt, current, pointer, s.motion)
    parts.position.needsUpdate = true
    return true
  })

  return <primitive object={parts.points} />
}
