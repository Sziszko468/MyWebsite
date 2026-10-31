import { lazy, useRef, useState, type RefObject } from 'react'
import { useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { LabAction, LabActions, LabGroup, LabNote, LabSlider } from '../../ui/LabControls'
import { SPACE_DEFAULTS, spaceText, type SpaceControls } from './spaceControls'

// The scene (Three.js and the shaders) loads after the page's words and controls.
const SpaceScene = lazy(() => import('./SpaceScene'))

const CAMERA = { fov: 62, position: [0, 0, 0] as [number, number, number], far: 400 }

function SpacePanel({ controls }: { controls: RefObject<SpaceControls> }) {
  const t = useLocalized(spaceText)
  const { text } = useLabText()
  const [state, setState] = useState<SpaceControls>(() => ({ ...controls.current }))

  const update = (patch: Partial<SpaceControls>) => {
    const next = { ...controls.current, ...patch }
    controls.current = next
    setState(next)
  }
  const percent = (value: number) => `${Math.round(value * 100)}%`

  return (
    <>
      <LabGroup>
        <LabNote>{t.steer}</LabNote>
        <LabSlider
          label={t.drift}
          value={state.drift}
          min={0}
          max={2}
          step={0.05}
          format={percent}
          onChange={(drift) => update({ drift })}
        />
        <LabSlider
          label={t.streak}
          value={state.streak}
          min={0.3}
          max={2}
          step={0.05}
          format={percent}
          onChange={(streak) => update({ streak })}
        />
      </LabGroup>

      <LabActions>
        <LabAction onClick={() => update({ pulseVersion: controls.current.pulseVersion + 1 })}>{t.pulse}</LabAction>
        <LabAction onClick={() => update({ ...SPACE_DEFAULTS, pulseVersion: controls.current.pulseVersion })}>
          {text.panel.reset}
        </LabAction>
      </LabActions>
    </>
  )
}

/** Infinite Space: a tunnel of light that the visitor steers. */
export default function InfiniteSpace() {
  const controls = useRef<SpaceControls>({ ...SPACE_DEFAULTS })

  return (
    <ExperimentFrame
      id="infinite-space"
      camera={CAMERA}
      scene={<SpaceScene controls={controls} />}
      panel={<SpacePanel controls={controls} />}
    />
  )
}
