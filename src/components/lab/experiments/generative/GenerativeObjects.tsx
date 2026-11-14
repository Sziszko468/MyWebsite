import { lazy, useRef, useState, type FormEvent, type RefObject } from 'react'
import { SaveImage } from '../../artifacts/SaveImage'
import type { StageCapture } from '../../core/useStageCapture'
import { useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { LabAction, LabActions, LabChoice, LabGroup, LabNote, LabSlider, LabTextField, LabToggle } from '../../ui/LabControls'
import {
  GENERATIVE_CAMERA,
  generativeText,
  LIGHT_IDS,
  LIGHT_NAMES,
  makeFrom,
  MATERIAL_IDS,
  MATERIAL_NAMES,
  SIZE_RANGE,
  startControls,
  surpriseText,
  type GenerativeControls,
} from './generativeControls'
import { EXAMPLES } from './ideas'
import { MAX_PROMPT } from './interpret'
import { understoodName } from './understood'
import type { LightId, MaterialId } from './spec'

// The scene (Three.js, the procedural parts) loads after the page's words and controls.
const GenerativeScene = lazy(() => import('./GenerativeScene'))

function GenerativePanel({
  controls,
  stage,
}: {
  controls: RefObject<GenerativeControls>
  stage: RefObject<StageCapture | null>
}) {
  const t = useLocalized(generativeText)
  const materials = useLocalized(MATERIAL_NAMES)
  const lights = useLocalized(LIGHT_NAMES)
  const { lang } = useLabText()
  const [state, setState] = useState<GenerativeControls>(() => ({ ...controls.current }))
  // What is in the field is not the object on show until the visitor presses Make (or Enter).
  const [draft, setDraft] = useState(controls.current.text)

  const update = (next: GenerativeControls) => {
    controls.current = next
    setState(next)
  }
  const patchLook = (patch: Partial<GenerativeControls['look']>) => update({ ...controls.current, look: { ...controls.current.look, ...patch } })
  const make = (text: string) => {
    update(makeFrom(text, controls.current))
    setDraft(controls.current.text)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    make(draft)
  }

  const { made } = state
  const understood = made.understood.map((item) => understoodName(item, lang)).filter((name) => name !== '')

  return (
    <>
      <form onSubmit={submit}>
        <LabGroup>
          <LabTextField label={t.describe} value={draft} onChange={setDraft} maxLength={MAX_PROMPT} placeholder={t.placeholder} help={t.help} />
          <LabActions>
            <LabAction variant="primary" type="submit">
              {t.make}
            </LabAction>
            <LabAction onClick={() => make(surpriseText(lang))}>{t.surprise}</LabAction>
            <LabAction
              onClick={() => {
                const next = (controls.current.example + 1) % EXAMPLES.length
                update({ ...controls.current, example: next })
                make(EXAMPLES[next][lang])
              }}
            >
              {t.example}
            </LabAction>
            <LabAction onClick={() => update({ ...controls.current, seed: Math.floor(Math.random() * 2 ** 31), version: controls.current.version + 1 })}>{t.vary}</LabAction>
          </LabActions>
        </LabGroup>
      </form>

      <LabGroup>
        {made.recognised ? <LabNote live>{`${t.understood}: ${understood.join(', ')}`}</LabNote> : <LabNote live>{t.nothingKnown}</LabNote>}
        {made.unknown.length > 0 && <LabNote>{`${t.unknown}: ${made.unknown.join(', ')}`}</LabNote>}
      </LabGroup>

      <LabGroup>
        <LabChoice<MaterialId>
          label={t.material}
          value={state.look.material}
          options={MATERIAL_IDS.map((id) => ({ value: id, label: materials[id] }))}
          onChange={(material) => patchLook({ material })}
          columns={2}
        />
        <LabChoice<LightId>
          label={t.light}
          value={state.look.lighting}
          options={LIGHT_IDS.map((id) => ({ value: id, label: lights[id] }))}
          onChange={(lighting) => patchLook({ lighting })}
          columns={2}
        />
        <LabSlider
          label={t.size}
          value={state.look.scale}
          min={SIZE_RANGE.min}
          max={SIZE_RANGE.max}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(scale) => patchLook({ scale })}
        />
        <LabToggle label={t.spin} checked={state.look.spin} onChange={(spin) => patchLook({ spin })} />
      </LabGroup>

      <SaveImage name={() => 'generative-objects'} stage={stage} />
    </>
  )
}

/** Generative Objects: a description, read by a fixed word list, built from procedural parts. No AI, no server. */
export default function GenerativeObjects() {
  const { lang } = useLabText()
  const controls = useRef<GenerativeControls>(startControls(lang))
  const stage = useRef<StageCapture | null>(null)

  return (
    <ExperimentFrame
      id="generative-objects"
      camera={GENERATIVE_CAMERA}
      antialias
      scene={<GenerativeScene controls={controls} stage={stage} />}
      panel={<GenerativePanel controls={controls} stage={stage} />}
    />
  )
}
