import { lazy, useRef, useState, type RefObject } from 'react'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { LabAction, LabActions, LabChoice, LabGroup, LabNote, LabSlider } from '../../ui/LabControls'
import { TYPE_DEFAULTS, typeText, type TypeControls } from './typeControls'
import { PHRASES } from './typeLayout'

// The scene (Three.js, the shaders, the glyph texture) loads after the page's words and controls.
const TypeScene = lazy(() => import('./TypeScene'))

const CAMERA = { fov: 36, position: [0, 0, 17] as [number, number, number] }

function TypePanel({ controls }: { controls: RefObject<TypeControls> }) {
  const t = useLocalized(typeText)
  const { text } = useLabText()
  const [state, setState] = useState<TypeControls>(() => ({ ...controls.current }))

  const update = (patch: Partial<TypeControls>) => {
    const next = { ...controls.current, ...patch }
    controls.current = next
    setState(next)
  }
  const percent = (value: number) => `${Math.round(value * 100)}%`
  const sentence = PHRASES[state.phrase].lines.join(' ')

  return (
    <>
      <LabGroup>
        <LabChoice<string>
          label={t.phrase}
          value={String(state.phrase)}
          options={PHRASES.map((phrase, index) => ({ value: String(index), label: phrase.lines[0] }))}
          onChange={(value) => update({ phrase: Number(value) })}
          columns={3}
        />
        {/* The letters are drawn, so the sentence is also given as text. */}
        <LabNote live>{fill(t.readAs, { text: sentence })}</LabNote>
      </LabGroup>

      <LabGroup>
        <LabSlider
          label={t.depth}
          value={state.depth}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          onChange={(depth) => update({ depth })}
        />
        <LabSlider
          label={t.distortion}
          value={state.distortion}
          min={0}
          max={1.5}
          step={0.05}
          format={percent}
          onChange={(distortion) => update({ distortion })}
        />
      </LabGroup>

      <LabActions>
        <LabAction pressed={state.broken} onClick={() => update({ broken: !state.broken })}>
          {state.broken ? t.reassemble : t.breakApart}
        </LabAction>
        <LabAction onClick={() => update({ scatterVersion: controls.current.scatterVersion + 1 })}>
          {t.scatter}
        </LabAction>
        <LabAction
          onClick={() =>
            update({
              ...TYPE_DEFAULTS,
              phrase: controls.current.phrase,
              scatterVersion: controls.current.scatterVersion,
              resetVersion: controls.current.resetVersion + 1,
            })
          }
        >
          {text.panel.reset}
        </LabAction>
      </LabActions>
    </>
  )
}

/** Type in Motion: letters that live in space. */
export default function TypeInMotion() {
  const controls = useRef<TypeControls>({ ...TYPE_DEFAULTS })

  return (
    <ExperimentFrame
      id="type-in-motion"
      camera={CAMERA}
      antialias
      scene={<TypeScene controls={controls} />}
      panel={<TypePanel controls={controls} />}
    />
  )
}
