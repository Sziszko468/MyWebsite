import { lazy, useRef, useState, type RefObject } from 'react'
import { useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { LabAction, LabActions, LabGroup, LabSlider } from '../../ui/LabControls'
import { CHROMATIC_DEFAULTS, chromaticText, type ChromaticControls } from './chromaticControls'

// The scene (Three.js and the shader) loads after the page's words and controls.
const ChromaticScene = lazy(() => import('./ChromaticScene'))

const CAMERA = { fov: 50, position: [0, 0, 1] as [number, number, number] }

function ChromaticPanel({ controls }: { controls: RefObject<ChromaticControls> }) {
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
      </LabGroup>

      <LabActions>
        <LabAction onClick={() => update({ surgeVersion: controls.current.surgeVersion + 1 })}>{t.surge}</LabAction>
        <LabAction onClick={() => update({ ...CHROMATIC_DEFAULTS, surgeVersion: controls.current.surgeVersion })}>
          {text.panel.reset}
        </LabAction>
      </LabActions>
    </>
  )
}

/** Chromatic Distortion: light and colour, pulled apart. */
export default function ChromaticDistortion() {
  const controls = useRef<ChromaticControls>({ ...CHROMATIC_DEFAULTS })

  return (
    <ExperimentFrame
      id="chromatic-distortion"
      camera={CAMERA}
      // A full-screen shader pays for every pixel three times, so it draws at a lower resolution than the 3D scenes.
      dprCap={(profile) => profile.chromaticDpr}
      scene={<ChromaticScene controls={controls} />}
      panel={<ChromaticPanel controls={controls} />}
    />
  )
}
