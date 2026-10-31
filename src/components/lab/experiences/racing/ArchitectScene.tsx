import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import { Box3, Color, Fog, Vector3, type PerspectiveCamera } from 'three'
import { createEnvironment } from '../../experience/environment'
import { OrbitController } from '../../experience/orbit'
import { useSettle } from '../../experience/useSettle'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { buildTrack } from './trackMesh'
import type { TrackSamples } from './trackModel'

export interface ArchitectApi {
  /** Bring the whole track into view. */
  frame(): void
}

/**
 * The live 3D preview of the track being drawn: the same road, kerbs, run-off, barriers and gantry
 * the Racing Experience builds (it is the same builder), seen from an orbiting camera. It draws only
 * when something changes or the camera moves, so a track at rest costs nothing.
 */
export default function ArchitectScene({
  samples,
  apiRef,
}: {
  samples: TrackSamples | null
  apiRef: RefObject<ArchitectApi | null>
}) {
  const lab = useLabScene()
  useSettle()
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const dusk = lab.palette.additive > 0.5
  const tier = lab.profile.tier

  const built = useMemo(
    () => (samples ? buildTrack(samples, { tier, dusk, seed: 'preview', scenery: false }) : null),
    [samples, tier, dusk],
  )
  useEffect(() => {
    invalidate()
    return () => built?.dispose()
  }, [built, invalidate])

  const orbit = useMemo(
    () => new OrbitController({ minRadius: 25, maxRadius: 5000, minPhi: 0.12, maxPhi: Math.PI * 0.47 }),
    [],
  )

  const frame = useMemo(
    () => () => {
      if (!samples) return
      const box = new Box3()
      const point = new Vector3()
      for (let i = 0; i < samples.count; i += 4) box.expandByPoint(point.set(samples.x[i], samples.y[i], samples.z[i]))
      const centre = box.getCenter(new Vector3())
      const extent = box.getSize(new Vector3())
      // Far enough that the track fits both ways: a tall, narrow pane is limited by its width.
      const vertical = (camera.fov * Math.PI) / 360
      const half = Math.min(Math.tan(vertical), Math.tan(vertical) * camera.aspect)
      const radius = (Math.max(extent.x, extent.z, 80) / 2 / Math.max(half, 0.05)) * 1.3
      orbit.goTo(centre, radius, orbit.theta, 0.95)
    },
    [samples, orbit, camera],
  )

  useEffect(() => {
    apiRef.current = { frame }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, frame])

  // Frame the track the first time one exists, and again when the track's size changes a lot.
  const extent = samples ? Math.round(samples.length / 400) : 0
  useEffect(() => {
    if (samples) {
      frame()
      invalidate()
    }
    // The track's own movements must not re-frame the camera: only its overall size does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extent])

  useEffect(() => {
    const element = gl.domElement.closest<HTMLElement>('[data-lab-stage]')
    if (!element) return
    orbit.onChange = invalidate
    const detach = orbit.attach(element, () => camera)
    return () => {
      detach()
      orbit.onChange = null
    }
  }, [gl, orbit, camera, invalidate])

  useEffect(() => {
    scene.fog = new Fog(new Color(dusk ? 0x6b4a54 : 0xe4e0d4), 900, 6000)
    const environment = createEnvironment(gl, 'sky', 1, dusk)
    scene.environment = environment.texture
    scene.environmentIntensity = 0.9
    invalidate()
    return () => {
      scene.fog = null
      scene.environment = null
      environment.dispose()
    }
  }, [gl, scene, dusk, invalidate])

  useEffect(() => {
    camera.aspect = size.width / Math.max(size.height, 1)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, invalidate])

  useLabFrame((s) => orbit.update(s.clock.dt, camera, size.height))

  return (
    <>
      <hemisphereLight args={[dusk ? 0x4a4f7a : 0xbfd4ff, dusk ? 0x2a2630 : 0x6a7a50, dusk ? 0.55 : 0.7]} />
      <directionalLight position={[-300, 500, -200]} intensity={dusk ? 2.2 : 2.6} color={dusk ? 0xff9a6b : 0xfff1dc} />
      {built && <primitive object={built.root} />}
    </>
  )
}
