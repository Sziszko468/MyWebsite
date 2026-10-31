import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CircleGeometry, Color, Mesh, MeshStandardMaterial, Vector3, type PerspectiveCamera } from 'three'
import { createEnvironment } from '../../experience/environment'
import { OrbitController } from '../../experience/orbit'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { useStore } from '../../experience/store'
import { useSettle } from '../../experience/useSettle'
import { carLook } from './carLook'
import { createCarModel } from './carModel'
import type { CarSetup } from './carSetup'

/**
 * The car on a turntable, changing with the setup: the wings tilt and grow with the downforce and
 * the body sits lower or higher on its wheels. It is the Racing Experience's own car model. It draws
 * only when the setup changes or the camera moves.
 */
export default function PerfScene({ setup }: { setup: CarSetup }) {
  const lab = useLabScene()
  useSettle()
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const tier = lab.profile.tier

  const model = useMemo(() => createCarModel(), [])
  useEffect(() => () => model.dispose(), [model])

  const look = useStore(carLook, (value) => value)
  useEffect(() => {
    model.applyLook(look)
    invalidate()
  }, [model, look, invalidate])

  useEffect(() => {
    model.applySetup(setup)
    model.update({ slope: 0, ax: 0, ay: 0, steer: 0, wheelAngle: 0, braking: false })
    invalidate()
  }, [model, setup, invalidate])

  const floor = useMemo(() => {
    const mesh = new Mesh(
      new CircleGeometry(6, 48),
      new MeshStandardMaterial({ color: new Color(0x1a1a22), roughness: 0.55, metalness: 0.4 }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = -0.002
    mesh.receiveShadow = true
    return mesh
  }, [])
  useEffect(
    () => () => {
      floor.geometry.dispose()
      ;(floor.material as MeshStandardMaterial).dispose()
    },
    [floor],
  )

  const orbit = useMemo(() => {
    const controller = new OrbitController({ minRadius: 3.5, maxRadius: 22, minPhi: 0.2, maxPhi: Math.PI * 0.49 })
    controller.set(new Vector3(0, 0.4, 0), 11.5, 0.85, 1.2)
    return controller
  }, [])

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
    const environment = createEnvironment(gl, 'studio', 1, true)
    scene.environment = environment.texture
    scene.environmentIntensity = 1
    invalidate()
    return () => {
      scene.environment = null
      environment.dispose()
    }
  }, [gl, scene, invalidate])

  useEffect(() => {
    gl.shadowMap.enabled = tier !== 'low'
  }, [gl, tier])

  useEffect(() => {
    camera.aspect = size.width / Math.max(size.height, 1)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, invalidate])

  useLabFrame((s) => orbit.update(s.clock.dt, camera, size.height))

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[6, 9, 5]}
        intensity={2.4}
        castShadow={tier !== 'low'}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-6, 3, -4]} intensity={1.1} color={0x8fa2ff} />
      <primitive object={floor} />
      <primitive object={model.root} />
    </>
  )
}
