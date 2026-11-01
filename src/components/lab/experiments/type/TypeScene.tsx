import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  MathUtils,
  NoColorSpace,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three'
import { clamp, damp, lerp } from '../../../hero/heroMath'
import { useLabFrame, useLabScene } from '../../core/sceneContext'
import { useDisposable } from '../../core/resources'
import { useStageCapture, type StageCapture } from '../../core/useStageCapture'
import type { FontId, TypeControls } from './typeControls'
import { presetOffset } from './typeMotion'
import { CAP_HEIGHT, fontSizeFor, layoutPhrase, linesOf, LINE_HEIGHT, MARGIN, textSeed, type PhraseLayout } from './typeLayout'
import { DOF, LetterField, MAX } from './typeSim'
import { TYPE_FRAGMENT, TYPE_VERTEX } from './typeShaders'

const TYPE_CAMERA = { fov: 36, position: [0, 0, 17] as [number, number, number] }
const CAMERA_Z = TYPE_CAMERA.position[2]

/** The glyph texture has one fixed size, so loading another sentence only redraws it. */
const TEXTURE_W = 2048
const TEXTURE_H = 768
const FONT_FAMILY = '"Archivo Variable", Archivo, system-ui, sans-serif'
/** World width of a sentence's longest line, whatever the sentence. */
const BLOCK_WIDTH = 14
const SEGMENTS = 8

interface Loaded {
  layout: PhraseLayout
  /** World units per texture pixel for this sentence. */
  unit: number
  /** The block's size in world units. */
  width: number
  height: number
}

/** The typefaces the panel offers, as canvas fonts. The two widths of the page's own face use its width axis. */
const FONT_CSS: Record<FontId, { family: string; weight: number; stretch: string }> = {
  archivo: { family: FONT_FAMILY, weight: 900, stretch: 'semi-expanded' },
  condensed: { family: FONT_FAMILY, weight: 900, stretch: 'condensed' },
  serif: { family: 'Georgia, "Times New Roman", serif', weight: 900, stretch: 'normal' },
  mono: { family: 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace', weight: 800, stretch: 'normal' },
}

function configureContext(context: CanvasRenderingContext2D, fontPx: number, font: FontId): void {
  const css = FONT_CSS[font]
  context.font = `${css.weight} ${fontPx}px ${css.family}`
  if ('fontStretch' in context) (context as unknown as { fontStretch: string }).fontStretch = css.stretch
  context.textBaseline = 'alphabetic'
}

/** Draws a sentence into the glyph canvas and returns where every letter is. */
function drawPhrase(canvas: HTMLCanvasElement, lines: readonly string[], font: FontId): PhraseLayout {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('A 2D canvas is needed to set the type')
  context.clearRect(0, 0, canvas.width, canvas.height)

  configureContext(context, 100, font)
  const reference = (text: string) => context.measureText(text).width
  const wanted = fontSizeFor(lines, TEXTURE_W - 2 * MARGIN * 230, 100, reference)
  // The block must also fit the texture's height: four lines need a smaller letter than one.
  const byHeight = TEXTURE_H / (lines.length * LINE_HEIGHT + 2 * MARGIN)
  const fontPx = Math.min(wanted, 230, byHeight)

  configureContext(context, fontPx, font)
  const layout = layoutPhrase(lines, fontPx, (text) => context.measureText(text).width)

  context.fillStyle = '#ffffff'
  lines.forEach((line, lineIndex) => {
    const top = MARGIN * fontPx + lineIndex * LINE_HEIGHT * fontPx
    const baseline = top + (LINE_HEIGHT * fontPx + CAP_HEIGHT * fontPx) / 2
    context.fillText(line, MARGIN * fontPx, baseline)
  })
  return layout
}

function Sentence({ controls }: { controls: RefObject<TypeControls> }) {
  const scene = useLabScene()
  const camera = useThree((state) => state.camera)
  const mesh = useRef<Mesh>(null)
  const layers = scene.profile.typeLayers
  const capacity = MAX * layers

  const canvas = useMemo(() => {
    const element = document.createElement('canvas')
    element.width = TEXTURE_W
    element.height = TEXTURE_H
    return element
  }, [])
  const texture = useDisposable(() => {
    const result = new CanvasTexture(canvas)
    result.generateMipmaps = false
    result.minFilter = LinearFilter
    result.magFilter = LinearFilter
    result.colorSpace = NoColorSpace
    return result
  }, [canvas])

  const geometry = useDisposable(() => {
    const quad = new PlaneGeometry(1, 1, SEGMENTS, SEGMENTS)
    const result = new InstancedBufferGeometry()
    result.index = quad.index
    result.setAttribute('position', quad.getAttribute('position'))
    for (const name of ['aRect', 'aUv', 'aMeta'])
      result.setAttribute(name, new InstancedBufferAttribute(new Float32Array(capacity * 4), 4))
    for (const name of ['aPose', 'aPose2']) {
      const attribute = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
      attribute.setUsage(DynamicDrawUsage)
      result.setAttribute(name, attribute)
    }
    result.instanceCount = 0
    // The quad's own buffers belong to the instanced geometry now; only the helper is released.
    quad.dispose()
    return result
  }, [capacity])

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uExtrude: { value: 0.6 },
      uPointer: { value: new Vector2() },
      uLens: { value: 0 },
      uLensRadius: { value: 3.4 },
      uInk: { value: new Color() },
      uRed: { value: new Color() },
      uShadow: { value: new Color() },
      uOpacity: { value: 0 },
    }),
    [texture],
  )
  const material = useDisposable(
    () =>
      new ShaderMaterial({
        uniforms,
        vertexShader: TYPE_VERTEX,
        fragmentShader: TYPE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    [uniforms],
  )

  const field = useMemo(() => new LetterField(), [])
  const [fontReady, setFontReady] = useState(false)
  const loaded = useRef<{ key: string; info: Loaded | null }>({ key: '', info: null })
  const phase = useRef(0)
  const seen = useRef({ scatter: controls.current.scatterVersion, reset: controls.current.resetVersion, pulses: -1 })
  const look = useRef({ x: 0, y: 0, opacity: 0 })

  // The glyphs are drawn in the page's font, so wait for it (it is already loaded on most visits).
  useEffect(() => {
    let alive = true
    const ready = document.fonts?.load ? document.fonts.load('900 100px "Archivo Variable"') : Promise.resolve([])
    ready
      .catch(() => undefined)
      .finally(() => {
        if (alive) setFontReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  /** Draws a sentence, cuts it into letter quads and sends the letters in. */
  const load = (text: string, font: FontId, scattered: boolean) => {
    const lines = linesOf(text)
    const layout = drawPhrase(canvas, lines, font)
    texture.needsUpdate = true

    const unit = BLOCK_WIDTH / (layout.width - 2 * MARGIN * layout.fontPx)
    const width = layout.width * unit
    const height = layout.height * unit
    const rect = geometry.getAttribute('aRect') as InstancedBufferAttribute
    const uv = geometry.getAttribute('aUv') as InstancedBufferAttribute
    const meta = geometry.getAttribute('aMeta') as InstancedBufferAttribute
    const count = layout.letters.length
    const homes = new Float32Array(count * 2)

    layout.letters.forEach((letter, i) => {
      const cx = (letter.x + letter.width / 2 - layout.width / 2) * unit
      const cy = -(letter.y + letter.height / 2 - layout.height / 2) * unit
      homes[i * 2] = cx
      homes[i * 2 + 1] = cy
      for (let layer = 0; layer < layers; layer++) {
        // Back layers first: they are drawn first, so the front one ends up on top.
        const at = (layers - 1 - layer) * count + i
        rect.setXYZW(at, cx, cy, (letter.width / 2) * unit, (letter.height / 2) * unit)
        uv.setXYZW(
          at,
          letter.x / TEXTURE_W,
          1 - (letter.y + letter.height) / TEXTURE_H,
          (letter.x + letter.width) / TEXTURE_W,
          1 - letter.y / TEXTURE_H,
        )
        meta.setXYZW(
          at,
          layers > 1 ? layer / (layers - 1) : 0,
          i / Math.max(count - 1, 1),
          (i * 0.618) % 1,
          letter.line,
        )
      }
    })
    rect.needsUpdate = true
    uv.needsUpdate = true
    meta.needsUpdate = true
    geometry.instanceCount = count * layers

    field.setLetters(homes, count, scattered, textSeed(text) + 1)
    loaded.current = { key: `${font}|${text}`, info: { layout, unit, width, height } }
  }

  useEffect(() => {
    if (fontReady) loaded.current = { key: '', info: null }
  }, [fontReady])

  const forces = useMemo(() => ({ x: 0, y: 0, vx: 0, vy: 0, presence: 0, radius: 3.4, strength: 1, broken: false }), [])

  useLabFrame((s) => {
    const group = mesh.current
    if (!group || !fontReady) return
    const { pointer, clock, palette, motion, autonomous } = s
    const dt = clock.dt
    const ctl = controls.current

    if (loaded.current.key !== `${ctl.font}|${ctl.text}` || !loaded.current.info) {
      // The first sentence is already in place; a new one arrives scattered and assembles itself.
      load(ctl.text, ctl.font, loaded.current.info !== null)
    }
    const info = loaded.current.info
    if (!info) return

    // Fit the block in the view.
    const halfHeight = Math.tan(MathUtils.degToRad(TYPE_CAMERA.fov) / 2) * CAMERA_Z
    const halfWidth = halfHeight * s.aspect
    const fit =
      clamp(Math.min((halfWidth * 2 * 0.9) / info.width, (halfHeight * 2 * 0.74) / info.height), 0.2, 2) * ctl.size
    group.scale.setScalar(fit)

    if (seen.current.reset !== ctl.resetVersion) {
      seen.current.reset = ctl.resetVersion
      load(ctl.text, ctl.font, false)
    }
    if (seen.current.scatter !== ctl.scatterVersion) {
      seen.current.scatter = ctl.scatterVersion
      field.scatter(0, 0, autonomous ? 1 : 0.5, clock.frame)
    }
    if (pointer.pulseVersion !== seen.current.pulses) {
      seen.current.pulses = pointer.pulseVersion
      const newest = pointer.newestPulse(clock.t, 0.5)
      if (newest)
        field.scatter(
          (newest.x * halfWidth) / fit,
          (newest.y * halfHeight) / fit,
          newest.strength * (autonomous ? 0.85 : 0.4),
          clock.frame,
        )
    }

    forces.x = (pointer.x * halfWidth) / fit
    forces.y = (pointer.y * halfHeight) / fit
    forces.vx = (pointer.vx * halfWidth) / fit
    forces.vy = (pointer.vy * halfHeight) / fit
    forces.presence = pointer.presence
    forces.strength = ctl.distortion * (0.55 + 0.45 * motion)
    forces.broken = ctl.broken
    forces.radius = 3.4
    // The speed slider is the animation's clock: the letters' springs and the preset's time both follow it.
    const tick = dt * ctl.speed
    phase.current += tick
    field.step(tick, forces)

    // Every layer of a letter takes its letter's pose.
    const pose = geometry.getAttribute('aPose') as InstancedBufferAttribute
    const pose2 = geometry.getAttribute('aPose2') as InstancedBufferAttribute
    const count = field.count
    for (let layer = 0; layer < layers; layer++) {
      const base = (layers - 1 - layer) * count
      for (let i = 0; i < count; i++) {
        const at = i * DOF
        const o = presetOffset(ctl.motion, i, field.homes[i * 2], phase.current, autonomous ? motion : 0)
        pose.setXYZW(base + i, field.pose[at] + o.x, field.pose[at + 1] + o.y, field.pose[at + 2] + o.z, o.scale)
        pose2.setXYZW(base + i, field.pose[at + 3] + o.rx, field.pose[at + 4] + o.ry, field.pose[at + 5] + o.rz, field.split)
      }
    }
    pose.needsUpdate = true
    pose2.needsUpdate = true

    look.current.x = damp(look.current.x, pointer.x * 0.9 * motion * pointer.presence, 0.3, dt)
    look.current.y = damp(look.current.y, pointer.y * 0.55 * motion * pointer.presence, 0.3, dt)
    camera.position.set(look.current.x, look.current.y, CAMERA_Z)
    camera.lookAt(0, 0, 0)

    look.current.opacity = damp(look.current.opacity, 1, 0.12, dt)
    uniforms.uOpacity.value = look.current.opacity
    uniforms.uExtrude.value = lerp(0.1, 1.5, ctl.depth)
    uniforms.uPointer.value.set(forces.x, forces.y)
    uniforms.uLens.value = 0.2 * ctl.distortion * pointer.presence * motion
    if (ctl.colour) uniforms.uInk.value.set(ctl.colour)
    else uniforms.uInk.value.copy(palette.ink)
    uniforms.uRed.value.copy(palette.red)
    uniforms.uShadow.value.copy(palette.red).multiplyScalar(0.16).lerp(palette.bg, 0.25)

    return (
      look.current.opacity < 0.99 ||
      field.unrest > 0.02 ||
      Math.abs(field.split - (ctl.broken ? 1 : 0)) > 0.01 ||
      pointer.presence > 0.02 ||
      (autonomous && ctl.motion !== 'none')
    )
  })

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />
}

export default function TypeScene({
  controls,
  stage,
}: {
  controls: RefObject<TypeControls>
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
  return <Sentence controls={controls} />
}
