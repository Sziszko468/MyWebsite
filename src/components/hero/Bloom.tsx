import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { HeroDriver } from './HeroDriver'
import type { HeroRig } from './heroRig'
import type { BlendedPalette } from './fieldUniforms'
import { registerFrameRenderer, type DevSlot } from './rigCapture'

/**
 * Real bloom for capable desktops: render in half-float HDR, bloom the over-bright parts, tone-map,
 * then smooth edges with FXAA. It is the only post-processing in the scene, it is mounted only on
 * the high quality tier, and its cost was measured before it was kept (see the README). Mounting
 * it takes over rendering from R3F; unmounting hands it back.
 *
 * The render target is not multisampled: a multisampled half-float target rendered blank on some
 * GPUs, so edges are smoothed in post instead.
 */
export function Bloom({ palette, rig, driver, slot }: { palette: BlendedPalette; rig: HeroRig; driver: HeroDriver; slot: DevSlot }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)

  const { composer, bloom } = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
    const composer = new EffectComposer(gl, target)
    const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.8, 0.5, 0.85)
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
  useEffect(() => registerFrameRenderer(() => composer.render(0.016), slot), [composer, slot])

  // A priority above zero makes this the frame's renderer.
  useFrame((_, delta) => {
    bloom.strength = palette.bloom * (0.3 + 0.7 * rig.intro) * (1 + 0.5 * driver.cursor.energy)
    // On a light page the background itself is brighter than the dark theme's threshold; raise it
    // so only real over-bright light blooms, never the paper.
    bloom.threshold = 0.85 + 0.45 * (1 - palette.additive)
    composer.render(Math.min(delta, 0.05))
  }, 1)

  return null
}
