import { lazy, useRef, useState, type RefObject } from 'react'
import { useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { SaveImage } from '../../artifacts/SaveImage'
import type { StageCapture } from '../../core/useStageCapture'
import { LabAction, LabActions, LabGroup, LabNote, LabSlider } from '../../ui/LabControls'
import { CHROMATIC_DEFAULTS, chromaticText, type ChromaticControls } from './chromaticControls'

// The scene (Three.js and the shader) loads after the page's words and controls.
const ChromaticScene = lazy(() => import('./ChromaticScene'))

const CAMERA = { fov: 50, position: [0, 0, 1] as [number, number, number] }

function ChromaticPanel({ controls, stage }: { controls: RefObject<ChromaticControls>; stage: RefObject<StageCapture | null> }) {
  const t = useLocalized(chromaticText)
  const { text } = useLabText()
  const [state, setState] = useState<ChromaticControls>(() => ({ ...controls.current }))

  const update = (patch: Partial<ChromaticControls>) => {
    const next = { ...controls.current, ...patch }
    controls.current = next
    setState(next)
  }
  const percent = (value: number) => `${Math.round(value * 100)}%`

  return (
    <>
      <LabGroup>
        <LabSlider
          label={t.separation}
          value={state.separation}
          min={0}
          max={2}
          step={0.05}
          format={percent}
          onChange={(separation) => update({ separation })}
        />
        <LabSlider
          label={t.waves}
          value={state.waves}
          min={0}
          max={2}
          step={0.05}
          format={percent}
          onChange={(waves) => update({ waves })}
        />
        <LabSlider
          label={t.lens}
          value={state.lens}
          min={0.15}
          max={0.9}
          step={0.05}
          format={percent}
          onChange={(lens) => update({ lens })}
        />
        <LabSlider
          label={t.angle}
          value={state.angle}
          min={0}
          max={360}
          step={5}
          format={(v) => `${v}°`}
          onChange={(angle) => update({ angle })}
        />
      </LabGroup>

      <LabGroup>
        <LabSlider
          label={t.glitch}
          value={state.glitch}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          onChange={(glitch) => update({ glitch })}
        />
        <LabNote>{t.glitchNote}</LabNote>
        <LabSlider
          label={t.noise}
          value={state.noise}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          onChange={(noise) => update({ noise })}
        />
      </LabGroup>

      <LabActions>
        <LabAction onClick={() => update({ surgeVersion: controls.current.surgeVersion + 1 })}>{t.surge}</LabAction>
        <LabAction
          onClick={() =>
            update({
              separation: 0.4 + Math.random() * 1.6,
              waves: Math.random() * 2,
              lens: 0.2 + Math.random() * 0.6,
              glitch: Math.random() < 0.5 ? Math.random() : 0,
              noise: Math.random() < 0.5 ? Math.random() * 0.8 : 0,
              angle: Math.floor(Math.random() * 72) * 5,
              surgeVersion: controls.current.surgeVersion + 1,
            })
          }
        >
          {t.randomise}
        </LabAction>
        <LabAction onClick={() => update({ ...CHROMATIC_DEFAULTS, surgeVersion: controls.current.surgeVersion })}>
          {text.panel.reset}
        </LabAction>
        <SaveImage name={() => 'chromatic-distortion'} stage={stage} />
      </LabActions>
    </>
  )
}

/** Chromatic Distortion: light and colour, pulled apart. */
export default function ChromaticDistortion() {
  const controls = useRef<ChromaticControls>({ ...CHROMATIC_DEFAULTS })
  const stage = useRef<StageCapture | null>(null)

  return (
    <ExperimentFrame
      id="chromatic-distortion"
      camera={CAMERA}
      // A full-screen shader pays for every pixel three times, so it draws at a lower resolution than the 3D scenes.
      dprCap={(profile) => profile.chromaticDpr}
      scene={<ChromaticScene controls={controls} stage={stage} />}
      panel={<ChromaticPanel controls={controls} stage={stage} />}
    />
  )
}
