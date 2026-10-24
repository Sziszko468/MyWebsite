import { useFrame, useThree } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import type { PerspectiveCamera } from 'three'
import { damp, lerp } from './heroMath'
import type { HeroRig } from './heroRig'
import { scrollTransition } from './heroTimeline'
import type { HeroInputs } from './useHeroInputs'
import { composeFor, parseLayout, POINTER, POSE_IDLE, POSE_SPEED, SWAY, type HeroLayout } from './velocityHeroConfig'

/**
 * The camera: a blend between an idle pose (close, high) and a speed pose (far, low, wide) driven
 * by the timeline, plus a smoothed, range-limited reaction to the cursor, a faint idle sway and
 * the scroll transition. It never shakes, and it never follows the cursor directly: the target is
 * eased with a fixed half-life.
 *
 * The composition adapts to the layout: shifted clear of the headline when the scene sits behind
 * the text, centred and backed off when it is a stage of its own below it.
 */
export function RacingCamera({ rig, inputs }: { rig: HeroRig; inputs: RefObject<HeroInputs> }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const size = useThree((state) => state.size)
  const canvas = useThree((state) => state.gl.domElement)
  const smooth = useRef({ x: 0, y: 0 })
  const layout = useRef<{ width: number; value: HeroLayout }>({ width: -1, value: 'full' })
  const view = useRef({ width: 0, height: 0, shiftX: NaN, shiftY: NaN })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const { push } = rig.state
    const scroll = scrollTransition(rig.scroll)
    const aspect = size.width / Math.max(size.height, 1)

    smooth.current.x = damp(smooth.current.x, inputs.current.pointerX, POINTER.halfLife, dt)
    smooth.current.y = damp(smooth.current.y, inputs.current.pointerY, POINTER.halfLife, dt)
    const { x: px, y: py } = smooth.current

    // The layout is decided in CSS; re-read it whenever the canvas changes size.
    if (layout.current.width !== size.width) {
      layout.current = { width: size.width, value: parseLayout(getComputedStyle(canvas).getPropertyValue('--hero-layout')) }
    }

    const baseFov = lerp(POSE_IDLE.fov, POSE_SPEED.fov, push)
    const composition = composeFor(aspect, baseFov, layout.current.value)

    const swayX = Math.sin(rig.elapsed * SWAY.speed) * SWAY.x
    const swayY = Math.sin(rig.elapsed * SWAY.speed * 1.3 + 1.2) * SWAY.y

    camera.position.set(
      lerp(POSE_IDLE.x, POSE_SPEED.x, push) + px * POINTER.rangeX + swayX,
      lerp(POSE_IDLE.y, POSE_SPEED.y, push) + py * POINTER.rangeY + swayY + scroll.rise,
      lerp(POSE_IDLE.z, POSE_SPEED.z, push) + composition.dolly + scroll.dolly,
    )
    camera.lookAt(
      lerp(POSE_IDLE.tx, POSE_SPEED.tx, push) + px * POINTER.lookX,
      lerp(POSE_IDLE.ty, POSE_SPEED.ty, push),
      lerp(POSE_IDLE.tz, POSE_SPEED.tz, push),
    )

    if (camera.fov !== composition.fov) camera.fov = composition.fov

    // Re-frame only when the size or the composition changes; R3F already keeps the aspect ratio.
    const applied = view.current
    if (
      applied.width !== size.width ||
      applied.height !== size.height ||
      applied.shiftX !== composition.shiftX ||
      applied.shiftY !== composition.shiftY
    ) {
      camera.setViewOffset(size.width, size.height, -size.width * composition.shiftX, size.height * composition.shiftY, size.width, size.height)
      Object.assign(applied, { width: size.width, height: size.height, shiftX: composition.shiftX, shiftY: composition.shiftY })
    }
    camera.updateProjectionMatrix()
  })

  return null
}
