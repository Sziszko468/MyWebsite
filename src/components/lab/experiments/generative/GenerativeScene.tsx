import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Group, MathUtils, PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { useLabFrame } from '../../core/sceneContext'
import { Spin } from '../../core/spin'
import { useStageCapture, type StageCapture } from '../../core/useStageCapture'
import { composeObject, type Composed } from './compose'
import { GENERATIVE_CAMERA, type GenerativeControls } from './generativeControls'
import { sameLook, type LightId, type Look } from './spec'

const CAMERA_Z = GENERATIVE_CAMERA.position[2]
/** How much of the view the object fills at size 1. */
const FILL = 0.74

/** A studio-like image of light for the metals and glass to reflect (generated in the browser; no file, no request). */
function Environment() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    const generator = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = generator.fromScene(room, 0.04)
    scene.environment = target.texture
    return () => {
      scene.environment = null
      target.dispose()
      generator.dispose()
      room.dispose()
    }
  }, [gl, scene])
  return null
}

function Lights({ id }: { id: LightId }) {
  switch (id) {
    case 'dramatic':
      return (
        <>
          <ambientLight intensity={0.05} />
          <directionalLight color={0xffd9b0} intensity={3.1} position={[-5, 6, 3]} />
          <directionalLight color={0xff2a2a} intensity={3.6} position={[4, 3, -5]} />
        </>
      )
    case 'neon':
      return (
        <>
          <ambientLight intensity={0.08} color={0x6a5cff} />
          <pointLight color={0x19e6ff} intensity={90} distance={30} decay={1.6} position={[-4, 2.5, 3]} />
          <pointLight color={0xff3df0} intensity={90} distance={30} decay={1.6} position={[4, 2.5, 2]} />
          <directionalLight color={0xffffff} intensity={0.5} position={[0, 7, 4]} />
        </>
      )
    case 'sunset':
      return (
        <>
          <ambientLight intensity={0.18} color={0xffb08a} />
          <directionalLight color={0xffb070} intensity={3.2} position={[6, 3, 4]} />
          <directionalLight color={0x7a8cff} intensity={0.8} position={[-5, 4, -3]} />
        </>
      )
    case 'moon':
      return (
        <>
          <ambientLight intensity={0.14} color={0x5a78ff} />
          <directionalLight color={0x9bb7ff} intensity={1.7} position={[-4, 7, 4]} />
          <directionalLight color={0xdfe9ff} intensity={1.5} position={[3, 3, -6]} />
        </>
      )
    default:
      return (
        <>
          <ambientLight intensity={0.3} />
          <directionalLight color={0xffffff} intensity={2.4} position={[4, 7, 5]} />
          <directionalLight color={0xc9d6ff} intensity={0.9} position={[-5, 3, 3]} />
          <directionalLight color={0xffffff} intensity={1.3} position={[-3, 4, -6]} />
        </>
      )
  }
}

function Creation({ controls }: { controls: RefObject<GenerativeControls> }) {
  const holder = useRef<Group>(null)
  const spin = useMemo(() => new Spin(0.18), [])
  // The object is built (and the old one released: it holds GPU resources) when the frame sees a new version, and kept in state so it is drawn.
  const built = useRef<{ composed: Composed; version: number } | null>(null)
  const [composed, setComposed] = useState<Composed | null>(null)
  const [light, setLight] = useState<LightId>(controls.current.look.lighting)
  const shownLook = useRef<Look | null>(null)

  useEffect(
    () => () => {
      built.current?.composed.dispose()
      built.current = null
    },
    [],
  )

  useLabFrame((s) => {
    const ctl = controls.current
    if (!built.current || built.current.version !== ctl.version) {
      built.current?.composed.dispose()
      const next = composeObject(ctl.made.spec, ctl.seed)
      next.applyLook(ctl.look)
      shownLook.current = ctl.look
      built.current = { composed: next, version: ctl.version }
      setComposed(next)
      return true
    }
    if (ctl.look.lighting !== light) setLight(ctl.look.lighting)
    const group = holder.current
    const composed = built.current.composed
    if (!group) return

    if (!shownLook.current || !sameLook(ctl.look, shownLook.current)) {
      composed.applyLook(ctl.look)
      shownLook.current = ctl.look
    }
    // Fit the object to the view at size 1, whatever shape the description gave it.
    const halfHeight = Math.tan(MathUtils.degToRad(GENERATIVE_CAMERA.fov) / 2) * CAMERA_Z
    const halfWidth = halfHeight * s.aspect
    group.scale.setScalar((Math.min(halfWidth, halfHeight) * FILL) / Math.max(0.01, composed.radius))
    // Turn it about its own middle, not about its base.
    composed.root.position.copy(composed.centre).multiplyScalar(-ctl.look.scale)

    spin.update(s, { idle: ctl.look.spin && s.autonomous ? 0.35 : 0, gain: 3.6 })
    spin.apply(group)
    composed.update(s.clock.t, s.motion)
    return s.autonomous || spin.moving
  })

  return (
    <>
      <Lights id={light} />
      <group ref={holder}>{composed && <primitive object={composed.root} />}</group>
    </>
  )
}

export default function GenerativeScene({
  controls,
  stage,
}: {
  controls: RefObject<GenerativeControls>
  /** Where the scene hands the page its picture (see useStageCapture). */
  stage: RefObject<StageCapture | null>
}) {
  const capture = useStageCapture()
  useEffect(() => {
    stage.current = { capture }
    return () => {
      stage.current = null
    }
  }, [stage, capture])
  return (
    <>
      <Environment />
      <Creation controls={controls} />
    </>
  )
}
