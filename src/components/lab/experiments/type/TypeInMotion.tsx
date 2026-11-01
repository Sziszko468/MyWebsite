import { lazy, useEffect, useRef, useState, type RefObject } from 'react'
import { KeepWork } from '../../artifacts/KeepWork'
import type { StageCapture } from '../../core/useStageCapture'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { LabAction, LabActions, LabChoice, LabColour, LabGroup, LabNote, LabSlider, LabTextField } from '../../ui/LabControls'
import {
  FONTS,
  MOTIONS,
  TYPE_DEFAULTS,
  TYPE_RANGES,
  typeHandoff,
  typeText,
  typeWork,
  type FontId,
  type MotionId,
  type TypeControls,
} from './typeControls'
import { MAX_LETTERS, PHRASES, sanitizeText } from './typeLayout'

// The scene (Three.js, the shaders, the glyph texture) loads after the page's words and controls.
const TypeScene = lazy(() => import('./TypeScene'))

/** The time, short, to tell one kept work from another. */
const stamp = () => new Date().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })

const CAMERA = { fov: 36, position: [0, 0, 17] as [number, number, number] }

const random = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

function TypePanel({ controls, stage }: { controls: RefObject<TypeControls>; stage: RefObject<StageCapture | null> }) {
  const t = useLocalized(typeText)
  const { text } = useLabText()
  const [state, setState] = useState<TypeControls>(() => ({ ...controls.current }))
  // What is in the box, which may be half-typed: the scene gets the cleaned words as they are typed.
  const [typed, setTyped] = useState(state.text)

  const update = (patch: Partial<TypeControls>) => {
    const next = { ...controls.current, ...patch }
    controls.current = next
    setState(next)
    if (patch.text !== undefined) setTyped(patch.text)
  }
  const percent = (value: number) => `${Math.round(value * 100)}%`

  return (
    <>
      <LabGroup>
        <LabTextField
          label={t.text}
          value={typed}
          maxLength={60}
          help={fill(t.textHelp, { max: MAX_LETTERS })}
          onChange={(value) => {
            setTyped(value)
            update({ text: sanitizeText(value, controls.current.text) })
          }}
        />
        <LabChoice<string>
          label={t.presets}
          value={PHRASES.find((phrase) => phrase.lines.join(' ') === state.text)?.id ?? ''}
          options={PHRASES.map((phrase) => ({ value: phrase.id, label: phrase.lines[0] }))}
          onChange={(id) => update({ text: PHRASES.find((phrase) => phrase.id === id)!.lines.join(' ') })}
          columns={3}
        />
        {/* The letters are drawn, so the sentence is also given as text. */}
        <LabNote live>{fill(t.readAs, { text: state.text })}</LabNote>
      </LabGroup>

      <LabGroup>
        <LabChoice<FontId>
          label={t.font}
          value={state.font}
          options={FONTS.map((font) => ({ value: font, label: t.fonts[font] }))}
          onChange={(font) => update({ font })}
          columns={2}
        />
        <LabSlider
          label={t.size}
          value={state.size}
          min={TYPE_RANGES.size.min}
          max={TYPE_RANGES.size.max}
          step={0.05}
          format={percent}
          onChange={(size) => update({ size })}
        />
        <LabColour
          label={t.colour}
          value={state.colour}
          fallback="#f4f0e8"
          clearLabel={t.themeInk}
          onChange={(colour) => update({ colour })}
        />
      </LabGroup>

      <LabGroup>
        <LabChoice<MotionId>
          label={t.motion}
          value={state.motion}
          options={MOTIONS.map((motion) => ({ value: motion, label: t.motions[motion] }))}
          onChange={(motion) => update({ motion })}
          columns={3}
        />
        <LabSlider
          label={t.speed}
          value={state.speed}
          min={TYPE_RANGES.speed.min}
          max={TYPE_RANGES.speed.max}
          step={0.05}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={(speed) => update({ speed })}
        />
        <LabSlider
          label={t.depth}
          value={state.depth}
          min={TYPE_RANGES.depth.min}
          max={TYPE_RANGES.depth.max}
          step={0.05}
          format={percent}
          onChange={(depth) => update({ depth })}
        />
        <LabSlider
          label={t.distortion}
          value={state.distortion}
          min={TYPE_RANGES.distortion.min}
          max={TYPE_RANGES.distortion.max}
          step={0.05}
          format={percent}
          onChange={(distortion) => update({ distortion })}
        />
      </LabGroup>

      <LabActions>
        <LabAction pressed={state.broken} onClick={() => update({ broken: !state.broken })}>
          {state.broken ? t.reassemble : t.breakApart}
        </LabAction>
        <LabAction onClick={() => update({ scatterVersion: controls.current.scatterVersion + 1 })}>{t.scatter}</LabAction>
        <LabAction
          onClick={() =>
            update({
              font: random(FONTS),
              motion: random(MOTIONS.filter((motion) => motion !== 'none')),
              speed: 0.6 + Math.random() * 1.2,
              depth: Math.random(),
              distortion: 0.4 + Math.random() * 1.1,
              colour: Math.random() < 0.6 ? `#${[0, 1, 2].map(() => Math.floor(80 + Math.random() * 175).toString(16).padStart(2, '0')).join('')}` : null,
              scatterVersion: controls.current.scatterVersion + 1,
            })
          }
        >
          {t.randomise}
        </LabAction>
        <LabAction
          onClick={() =>
            update({
              ...TYPE_DEFAULTS,
              scatterVersion: controls.current.scatterVersion,
              resetVersion: controls.current.resetVersion + 1,
            })
          }
        >
          {text.panel.reset}
        </LabAction>
      </LabActions>

      <KeepWork
        type="typography"
        stage={stage}
        name={() => `${controls.current.text.slice(0, 24)} ${stamp()}`}
        payload={() => typeWork(controls.current) as unknown as Record<string, unknown>}
      />
    </>
  )
}

/** Type in Motion: letters that live in space. */
export default function TypeInMotion() {
  // A work opened from the saved works arrives through the handoff; otherwise the defaults.
  const controls = useRef<TypeControls>({ ...(typeHandoff.peek() ?? TYPE_DEFAULTS) })
  const stage = useRef<StageCapture | null>(null)
  useEffect(() => {
    typeHandoff.clear()
  }, [])

  return (
    <ExperimentFrame
      id="type-in-motion"
      camera={CAMERA}
      antialias
      scene={<TypeScene controls={controls} stage={stage} />}
      panel={<TypePanel controls={controls} stage={stage} />}
    />
  )
}
