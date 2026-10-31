import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial, MathUtils, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import { damp } from '../../hero/heroMath'
import { useLabFrame } from '../core/sceneContext'
import type { HeroLayout } from './LabHeroScene'
import { buildZoneRigs, easeAwake } from './zoneRigs'
import {
  ZONE_CAMERA,
  ZONE_DEPTH,
  ZONE_IDS,
  activate,
  autoPlacement,
  hitZone,
  openingProgress,
  release,
  resolveTap,
  zoneStore,
  type Anchor,
  type ZoneId,
  type ZonePlace,
} from './zones'

/** What the page gives its 3D space: where the zones stand, and what to do when one is entered. */
export interface ZoneBridge {
  place: RefObject<ZonePlace[]>
  open: (zone: ZoneId) => void
}

/** A finger covers more than a pixel: a tap counts as on a zone this close (view units). */
const TOUCH_REACH = 0.2

/** Development only: where the zones are on screen, for the browser checks. */
interface ZonesDebugWindow extends Window {
  __labZones?: () => Array<{ id: ZoneId; x: number; y: number; r: number }>
  __labZoneStore?: typeof zoneStore
}

const FALLBACK = autoPlacement(1.6)

/**
 * The Lab's four zones as 3D objects in the hero's stage, round the core. The scene reads the
 * pointer and the zone store each frame and does four things:
 *
 *  - the camera swings a few degrees round the zones' middle to follow the pointer, so the space
 *    has depth;
 *  - the zone under the pointer wakes (and with it its link in the bar); where the pointer is, is
 *    decided on the objects' projected circles, so what is hit is what is seen;
 *  - a click or a tap enters a zone (a first tap with a finger only selects it);
 *  - entering is a flight: the camera dives towards the zone and the rest fall away, then the page
 *    changes (the page does that, after the same few tenths of a second).
 */
export function Zones({ bridge, layout }: { bridge: ZoneBridge; layout: RefObject<HeroLayout> }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const canvas = useThree((state) => state.gl.domElement)
  const invalidate = useThree((state) => state.invalidate)

  const rigs = useMemo(() => buildZoneRigs(), [])
  const tethers = useMemo(
    () =>
      ZONE_IDS.map(() => {
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3))
        const material = new LineBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false })
        const line = new Line(geometry, material)
        line.frustumCulled = false
        return line
      }),
    [],
  )
  useEffect(
    () => () => {
      for (const rig of rigs) rig.dispose()
      for (const line of tethers) {
        line.geometry.dispose()
        ;(line.material as LineBasicMaterial).dispose()
      }
    },
    [rigs, tethers],
  )

  // The page's links and the keyboard change the store too: wake a calm canvas for them.
  useEffect(() => zoneStore.subscribe(invalidate), [invalidate])

  const state = useRef({
    awake: ZONE_IDS.map(() => 0),
    lookX: 0,
    lookY: 0,
    hover: null as ZoneId | null,
    pulses: 0,
    openSince: -1,
    anchors: ZONE_IDS.map((id): Anchor => ({ id, x: 0, y: 0, r: 0.2 })),
    aspect: 1.6,
  })
  const tmp = useMemo(() => ({ point: new Vector3(), focus: new Vector3(), dive: new Vector3() }), [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = window as ZonesDebugWindow
    const read = () => {
      const box = canvas.getBoundingClientRect()
      const half = box.height / 2
      return state.current.anchors.map((a) => ({
        id: a.id,
        x: box.left + box.width / 2 + a.x * half,
        y: box.top + half - a.y * half,
        r: a.r * half,
      }))
    }
    debug.__labZones = read
    debug.__labZoneStore = zoneStore
    return () => {
      if (debug.__labZones === read) delete debug.__labZones
    }
  }, [canvas])

  useLabFrame((s) => {
    const { pointer, clock, motion, autonomous, palette } = s
    const dt = clock.dt
    const st = state.current
    const store = zoneStore.get()
    const places = bridge.place.current ?? FALLBACK
    st.aspect = s.aspect

    const reach = Math.tan(MathUtils.degToRad(camera.fov) / 2)
    const cameraZ = ZONE_CAMERA.position[2]
    const depth = cameraZ - ZONE_DEPTH
    const h = reach * depth

    // The camera swings a little round the middle of the zones, following the pointer.
    st.lookX = damp(st.lookX, pointer.x * pointer.presence, 0.25, dt)
    st.lookY = damp(st.lookY, pointer.y * pointer.presence, 0.25, dt)

    const opening = store.opening
    if (opening && st.openSince < 0) st.openSince = clock.t
    if (!opening) st.openSince = -1
    const flight = opening ? openingProgress(clock.t, st.openSince) : 0

    // Where each zone stands (and how big it is) comes from the page's layout.
    ZONE_IDS.forEach((id, i) => {
      const rig = rigs[i]
      const place = places[i] ?? FALLBACK[i]
      st.awake[i] = easeAwake(st.awake[i], store.active === id ? 1 : 0, dt)
      let size = place.r * h * (1 + 0.1 * st.awake[i])
      if (opening) size *= id === opening ? 1 + 0.7 * flight : 1 - 0.55 * flight
      rig.group.position.set(place.x * h, place.y * h, ZONE_DEPTH)
      rig.group.scale.setScalar(Math.max(size, 1e-3))
    })

    const yaw = st.lookX * 0.075 * motion + (autonomous ? Math.sin(clock.t * 0.17) * 0.012 : 0)
    const pitch = st.lookY * 0.045 * motion
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * depth,
      Math.sin(pitch) * depth,
      ZONE_DEPTH + Math.cos(yaw) * Math.cos(pitch) * depth,
    )
    tmp.focus.set(0, 0, ZONE_DEPTH)
    if (opening && flight > 0) {
      const target = rigs[ZONE_IDS.indexOf(opening)].group.position
      tmp.dive.set(target.x * 0.85, target.y * 0.85, target.z + 2.2)
      camera.position.lerp(tmp.dive, flight)
      tmp.focus.lerp(target, flight)
    }
    camera.lookAt(tmp.focus)
    camera.updateMatrixWorld()

    // The zones as the screen sees them: what a pointer is tested against.
    ZONE_IDS.forEach((_, i) => {
      const group = rigs[i].group
      tmp.point.copy(group.position)
      const distance = camera.position.distanceTo(tmp.point)
      tmp.point.project(camera)
      const anchor = st.anchors[i]
      anchor.x = tmp.point.x * s.aspect
      anchor.y = tmp.point.y
      anchor.r = group.scale.x / (reach * Math.max(distance, 0.1))
    })

    if (!opening) {
      if (pointer.inside && !pointer.touch) {
        const hit = hitZone(st.anchors, pointer.x, pointer.y, s.aspect)
        if (hit !== st.hover) {
          st.hover = hit
          if (hit) activate(hit, 'hover')
          else release('hover')
        }
      } else if (st.hover !== null) {
        st.hover = null
        release('hover')
      }

      if (pointer.pulseVersion !== st.pulses) {
        st.pulses = pointer.pulseVersion
        const pulse = pointer.newestPulse(clock.t, 0.25)
        if (pulse) {
          const hit = hitZone(st.anchors, pulse.x, pulse.y, s.aspect, pointer.touch ? TOUCH_REACH : 0)
          const outcome = resolveTap(store, hit, pointer.touch)
          if (outcome.kind === 'open') bridge.open(outcome.zone)
          else if (outcome.kind === 'select') activate(outcome.zone, 'tap')
          else if (outcome.kind === 'clear') release('tap')
        }
      }
    }

    // A thin line from each zone to the core: the zone that is awake lights its own.
    const core = layout.current
    const coreHeight = reach * cameraZ
    const coreZ = core?.z ?? 0
    const coreScale = (cameraZ - coreZ) / cameraZ
    const coreX = (core?.shiftX ?? 0) * coreHeight * s.aspect * coreScale
    const coreY = (core?.shiftY ?? 0) * coreHeight * coreScale
    tethers.forEach((line, i) => {
      const attribute = line.geometry.getAttribute('position')
      const array = attribute.array as Float32Array
      const from = rigs[i].group.position
      array[0] = from.x
      array[1] = from.y
      array[2] = from.z
      array[3] = coreX
      array[4] = coreY
      array[5] = coreZ
      attribute.needsUpdate = true
      const material = line.material as LineBasicMaterial
      material.color.copy(palette.ink).lerp(palette.red, st.awake[i])
      material.opacity = (0.1 + 0.6 * st.awake[i]) * (opening ? 1 - flight : 1)
    })

    ZONE_IDS.forEach((_, i) => {
      rigs[i].update({
        dt,
        t: clock.t,
        awake: st.awake[i],
        lookX: st.lookX,
        lookY: st.lookY,
        motion,
        autonomous,
        palette,
      })
    })

    return st.awake.some((a) => a > 0.003 && a < 0.997) || store.active !== null || opening !== null
  })

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={2.4} />
      {tethers.map((line, i) => (
        <primitive key={ZONE_IDS[i]} object={line} />
      ))}
      {rigs.map((rig) => (
        <primitive key={rig.id} object={rig.group} />
      ))}
    </>
  )
}
