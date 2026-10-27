import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
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
/**
 * Guards the bloom against a single bad pixel. The bloom blurs the whole frame in several passes,
 * so one NaN in the half-float target (from an undefined operation in some driver, say) would be
 * spread over every pixel and the frame would go black for as long as it lasted: a flicker. This
 * pass zeroes any NaN or overflowed pixel and caps everything else at a sane radiance before that
 * can happen. It costs one full-screen pass.
 */
const SANITIZE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 v = texture2D(tDiffuse, vUv).rgb;
      // NaN, or a value so large it is really an overflow (a half float tops out at 65504): drop the
      // pixel. Capping it instead would turn a bug into a white flare once the bloom has blurred it.
      bool bad = !(v.r == v.r) || !(v.g == v.g) || !(v.b == v.b) || any(greaterThan(v, vec3(6.0e4)));
      gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(clamp(v, 0.0, 32.0), 1.0);
    }
  `,
}

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
    composer.addPass(new ShaderPass(SANITIZE))
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
