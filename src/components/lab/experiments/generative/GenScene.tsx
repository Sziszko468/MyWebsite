import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { BufferGeometry, Color, DoubleSide, Group, MathUtils, Mesh, ShaderMaterial, Vector3 } from 'three'
import { clamp, damp } from '../../../hero/heroMath'
import { useLabFrame } from '../../core/sceneContext'
import { useDisposable } from '../../core/resources'
import { Spin } from '../../core/spin'
import { LIQUID_FRAGMENT } from '../liquid/liquidShaders'
import { MATTER_PARAMS, type MatterId } from '../liquid/liquidMaterials'
import { buildGenerative, OBJECT_RADIUS } from './genGeometry'
import { PALETTES, type GenMaterialId, type GenParams } from './genParams'

const GEN_CAMERA = { fov: 38, position: [0, 0, 6.6] as [number, number, number] }
const CAMERA_Z = GEN_CAMERA.position[2]

/** What the page and the scene share: the parameters, and requests the scene answers. One mutable object. */
export interface GenControls {
  params: GenParams
  /** Bumped whenever the parameters change, so the scene knows to rebuild. */
  revision: number
  /** Bumped to ask for a small picture of the object as it is now. */
  captureVersion: number
  /** Called with that picture. */
  onCapture: ((picture: string) => void) | null
}

/** The solid materials are the Liquid shading model with the matter's parameters; the wire frame is its own. */
const MATTER_OF: Record<Exclude<GenMaterialId, 'wire'>, MatterId> = { chrome: 'chrome', clay: 'soft', glass: 'glass' }

const OBJECT_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying float vField;
  varying float vHeat;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vField = 0.0;
    vHeat = 0.0;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const WIRE_FRAGMENT = /* glsl */ `
  uniform vec3 uRed, uBlue, uInk;
  uniform float uLightGain;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - abs(dot(N, V)), 1.6);
    vec3 colour = mix(uInk, mix(uRed, uBlue, smoothstep(-0.6, 0.6, N.x)), 0.35 + 0.5 * rim);
    gl_FragColor = vec4(colour * (0.55 + 0.7 * rim) * uLightGain, 1.0);
    #include <colorspace_fragment>
  }
`

/** How often (seconds) a stream of slider changes may rebuild the geometry. */
const REBUILD_INTERVAL = 0.09

function Specimen({ controls }: { controls: RefObject<GenControls> }) {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const group = useRef<Group>(null)
  const mesh = useRef<Mesh>(null)
  const spin = useMemo(() => new Spin(0.25), [])

  const uniforms = useMemo(
    () => ({
      uBase: { value: new Color() },
      uLightDir: { value: new Vector3(0.4, 0.6, 0.7) },
      uMetal: { value: 1 },
      uRough: { value: 0 },
      uFres: { value: 1 },
      uGlass: { value: 0 },
      uDisp: { value: 0 },
      uFacet: { value: 0 },
      uMolten: { value: 0 },
      uSheen: { value: 0 },
      uAdd: { value: 1 },
      uRed: { value: new Color() },
      uBlue: { value: new Color() },
      uInk: { value: new Color() },
      uStudioTurn: { value: 0 },
      uAmbient: { value: 0 },
      uLightGain: { value: 1 },
    }),
    [],
  )
  const solid = useDisposable(
    () =>
      new ShaderMaterial({ uniforms, vertexShader: OBJECT_VERTEX, fragmentShader: LIQUID_FRAGMENT, side: DoubleSide }),
    [uniforms],
  )
  const wire = useDisposable(
    () => new ShaderMaterial({ uniforms, vertexShader: OBJECT_VERTEX, fragmentShader: WIRE_FRAGMENT, wireframe: true }),
    [uniforms],
  )

  // The object being shown. It is replaced in place: the old geometry is disposed the moment the new one is attached.
  const current = useRef<{ geometry: BufferGeometry | null; revision: number; builtAt: number }>({
    geometry: null,
    revision: -1,
    builtAt: -1,
  })
  useEffect(() => {
    const state = current.current
    return () => {
      state.geometry?.dispose()
      state.geometry = null
      state.revision = -1
    }
  }, [])

  const captured = useRef(controls.current.captureVersion)
  const wantCapture = useRef(false)
  const eased = useRef({ turn: 0, tilt: 0 })

  /** Takes a small square picture of the canvas right after a frame has been drawn (priority 2: after the draw). */
  useFrame(() => {
    if (!wantCapture.current) return
    wantCapture.current = false
    const source = gl.domElement
    const side = Math.min(source.width, source.height)
    const small = document.createElement('canvas')
    small.width = 160
    small.height = 160
    const context = small.getContext('2d')
    if (!context) return
    context.drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, 160, 160)
    try {
      controls.current.onCapture?.(small.toDataURL('image/webp', 0.8))
    } catch {
      controls.current.onCapture?.('')
    }
  }, 2)

  useLabFrame((s) => {
    const node = group.current
    const object = mesh.current
    if (!node || !object) return
    const { pointer, clock, palette, motion, autonomous } = s
    const ctl = controls.current
    const params = ctl.params
    const budget = s.profile.genVertices

    // Rebuild when the parameters changed, at most every REBUILD_INTERVAL seconds so dragging a slider stays smooth.
    const state = current.current
    if (state.revision !== ctl.revision && (clock.t - state.builtAt > REBUILD_INTERVAL || !state.geometry)) {
      const built = buildGenerative(params, budget)
      const previous = state.geometry
      object.geometry = built.geometry
      previous?.dispose()
      state.geometry = built.geometry
      state.revision = ctl.revision
      state.builtAt = clock.t
    }
    const changing = state.revision !== ctl.revision

    // The object fits the view.
    const halfHeight = Math.tan(MathUtils.degToRad(GEN_CAMERA.fov) / 2) * CAMERA_Z
    const halfWidth = halfHeight * s.aspect
    node.scale.setScalar(clamp((Math.min(halfWidth, halfHeight) * 0.8) / OBJECT_RADIUS, 0.3, 2))

    spin.update(s, { idle: autonomous ? 0.16 : 0, gain: 3.4 })
    spin.apply(node)

    // Material, palette and light.
    const material = params.material
    const palette3 = PALETTES[params.palette]
    object.material = material === 'wire' ? wire : solid
    if (material !== 'wire') {
      const matter = MATTER_PARAMS[MATTER_OF[material]]
      uniforms.uBase.value.setRGB(
        matter.baseR * palette3.tint[0],
        matter.baseG * palette3.tint[1],
        matter.baseB * palette3.tint[2],
      )
      uniforms.uMetal.value = matter.metal
      uniforms.uRough.value = matter.rough
      uniforms.uFres.value = matter.fres
      uniforms.uGlass.value = matter.glass
      uniforms.uDisp.value = matter.dispersion
      uniforms.uFacet.value = material === 'glass' || params.form === 'crystal' ? 1 : 0
      uniforms.uSheen.value = matter.sheen
    }
    uniforms.uRed.value.setHex(palette3.red)
    uniforms.uBlue.value.setHex(palette3.blue)
    uniforms.uInk.value.setHex(palette3.ink)
    eased.current.turn = damp(eased.current.turn, pointer.x * 1.1 * motion * pointer.presence, 0.2, clock.dt)
    uniforms.uStudioTurn.value = eased.current.turn
    uniforms.uLightDir.value.set(pointer.x * 0.9, 0.5 + pointer.y * 0.6, 0.8).normalize()
    uniforms.uLightGain.value = params.light
    uniforms.uAmbient.value = (1 - palette.additive) * 0.14
    uniforms.uAdd.value = palette.additive

    if (captured.current !== ctl.captureVersion) {
      captured.current = ctl.captureVersion
      wantCapture.current = true
      invalidate()
    }

    return changing || spin.moving || wantCapture.current
  })

  return (
    <group ref={group}>
      <mesh ref={mesh} frustumCulled={false} />
    </group>
  )
}

export default function GenScene({ controls }: { controls: RefObject<GenControls> }) {
  return <Specimen controls={controls} />
}
