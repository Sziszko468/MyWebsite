import { lazy, useRef, useState, type RefObject } from 'react'
import { useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { LabAction, LabActions, LabChoice, LabGroup, LabSlider } from '../../ui/LabControls'
import { LIQUID_DEFAULTS, liquidText, type LiquidControls } from './liquidControls'
import { MATTER_NAMES, MATTERS, type MatterId } from './liquidMaterials'

// The scene (Three.js, the shaders) loads after the page's words and controls.
const LiquidScene = lazy(() => import('./LiquidScene'))

const CAMERA = { fov: 40, position: [0, 0, 6.2] as [number, number, number] }

function LiquidPanel({ controls }: { controls: RefObject<LiquidControls> }) {
  const t = useLocalized(liquidText)
  const names = useLocalized(MATTER_NAMES)
  const { text } = useLabText()
  const [state, setState] = useState<LiquidControls>(() => ({ ...controls.current }))

  const update = (patch: Partial<LiquidControls>) => {
    const next = { ...controls.current, ...patch }
    controls.current = next
    setState(next)
  }
  const percent = (value: number) => `${Math.round(value * 100)}%`

  return (
    <>
      <LabGroup>
        <LabChoice<MatterId>
          label={t.matter}
          value={state.matter}
          options={MATTERS.map((matter) => ({ value: matter, label: names[matter] }))}
          onChange={(matter) => update({ matter })}
          columns={2}
        />
      </LabGroup>

      <LabGroup>
        <LabSlider
          label={t.deformation}
          value={state.deformation}
          min={0.3}
          max={1.7}
          step={0.05}
          format={percent}
          onChange={(deformation) => update({ deformation })}
        />
        <LabSlider
          label={t.flow}
          value={state.flow}
          min={0}
          max={2}
          step={0.05}
          format={percent}
          onChange={(flow) => update({ flow })}
        />
        <LabSlider
          label={t.light}
          value={state.light}
          min={0.4}
          max={1.6}
          step={0.05}
          format={percent}
          onChange={(light) => update({ light })}
        />
      </LabGroup>

      <LabActions>
        <LabAction onClick={() => update({ pulseVersion: controls.current.pulseVersion + 1 })}>{t.pulse}</LabAction>
        <LabAction onClick={() => update({ ...LIQUID_DEFAULTS, pulseVersion: controls.current.pulseVersion })}>
          {text.panel.reset}
        </LabAction>
      </LabActions>
    </>
  )
}

/** Liquid Matter: one form, four states of matter. */
export default function LiquidMatter() {
  const controls = useRef<LiquidControls>({ ...LIQUID_DEFAULTS })

  return (
    <ExperimentFrame
      id="liquid-matter"
      camera={CAMERA}
      antialias
      scene={<LiquidScene controls={controls} />}
      panel={<LiquidPanel controls={controls} />}
    />
  )
}
