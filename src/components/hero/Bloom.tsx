import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { HeroRig } from './heroRig'
import type { BlendedPalette } from './heroUniforms'

/**
 * Real bloom for capable desktops: render in half-float HDR, bloom the over-bright emissive
 * parts, tone-map, then smooth edges with FXAA. It is the only post-processing in the scene and
 * is mounted only on the high quality tier. Mounting it takes over rendering from R3F; unmounting
 * hands it back.
 *
 * The render target is not multisampled: a multisampled half-float target rendered blank on some
 * GPUs, so edges are smoothed in post instead.
 */
export function Bloom({ palette, rig }: { palette: BlendedPalette; rig: HeroRig }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)

  const { composer, bloom } = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
    const composer = new EffectComposer(gl, target)
    const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.8, 0.55, 0.9)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    composer.addPass(new FXAAPass())
    return { composer, bloom }
  }, [gl, scene, camera])

  useEffect(() => {
    composer.setPixelRatio(dpr)
    composer.setSize(size.width, size.height)
  }, [composer, size.width, size.height, dpr])

  useEffect(() => () => composer.dispose(), [composer])

  // A priority above zero makes this the frame's renderer.
  useFrame((_, delta) => {
    bloom.strength = palette.bloom * (0.25 + 0.75 * rig.state.lights) * (1 + rig.pulse * 0.6)
    composer.render(Math.min(delta, 0.05))
  }, 1)

  return null
}
