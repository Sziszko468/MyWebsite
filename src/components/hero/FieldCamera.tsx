import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { PerspectiveCamera } from 'three'
import type { HeroDriver } from './HeroDriver'
import { damp } from './heroMath'
import type { HeroRig } from './heroRig'
import { composeFor, parseLayout, type HeroLayout } from './velocityHeroConfig'

/** Most the camera drifts with the cursor, in world units and radians. */
const PARALLAX = { x: 0.55, y: 0.3, yaw: 0.04, pitch: 0.025, halfLife: 0.25 }

/**
 * The camera sits at the origin looking down the flow. It only ever leans a little with the
 * cursor (the cursor is already eased, and the camera eases it a second time), and it carries the
 * scroll transition: as the hero leaves, the view rolls and pitches, so the lines' direction turns,
 * and the focal point sinks towards the next section.
 *
 * Composition adapts to the layout: the focal point sits right of the headline when the scene is
 * behind the text, and centred when it is a stage of its own below it. While the intro leaves, the
 * view widens and rolls (`rig.motion`).
 */
export function FieldCamera({ rig, driver }: { rig: HeroRig; driver: HeroDriver }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const size = useThree((state) => state.size)
  const canvas = useThree((state) => state.gl.domElement)
  const lean = useRef({ x: 0, y: 0 })
  const layout = useRef<{ width: number; value: HeroLayout }>({ width: -1, value: 'full' })
  const view = useRef({ width: 0, height: 0, shiftX: NaN, shiftY: NaN })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const { cursor } = driver
    const { pose } = rig

    lean.current.x = damp(lean.current.x, cursor.x, PARALLAX.halfLife, dt)
    lean.current.y = damp(lean.current.y, cursor.y, PARALLAX.halfLife, dt)
    const { x, y } = lean.current

    // The layout is decided in CSS; re-read it whenever the canvas changes size.
    if (layout.current.width !== size.width) {
      layout.current = { width: size.width, value: parseLayout(getComputedStyle(canvas).getPropertyValue('--hero-layout')) }
    }
    const composition = composeFor(size.width / Math.max(size.height, 1), layout.current.value)

    const { fov, roll } = rig.motion
    camera.position.set(x * PARALLAX.x, y * PARALLAX.y, 0)
    camera.rotation.set(pose.pitch - y * PARALLAX.pitch, -x * PARALLAX.yaw, pose.roll + roll)
    camera.fov = composition.fov + fov

    const shiftY = composition.shiftY + pose.shiftY
    const applied = view.current
    if (
      applied.width !== size.width ||
      applied.height !== size.height ||
      applied.shiftX !== composition.shiftX ||
      Math.abs(applied.shiftY - shiftY) > 1e-4 ||
      Number.isNaN(applied.shiftY)
    ) {
      camera.setViewOffset(size.width, size.height, -size.width * composition.shiftX, size.height * shiftY, size.width, size.height)
      Object.assign(applied, { width: size.width, height: size.height, shiftX: composition.shiftX, shiftY })
    }
    camera.updateProjectionMatrix()
  })

  return null
}
