import { lazy, useEffect, useRef, useState, type RefObject } from 'react'
import { KeepWork } from '../../artifacts/KeepWork'
import type { StageCapture } from '../../core/useStageCapture'
import { useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { LabAction, LabActions, LabChoice, LabColour, LabGroup, LabSlider } from '../../ui/LabControls'
import { LIQUID_DEFAULTS, liquidHandoff, liquidText, materialWork, type LiquidControls } from './liquidControls'
import { MATTER_NAMES, MATTERS, type MatterId } from './liquidMaterials'

// The scene (Three.js, the shaders) loads after the page's words and controls.
const LiquidScene = lazy(() => import('./LiquidScene'))

/** The time, short, to tell one kept work from another. */
const stamp = () => new Date().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })

const CAMERA = { fov: 40, position: [0, 0, 6.2] as [number, number, number] }

function LiquidPanel({
  controls,
  stage,
}: {
  controls: RefObject<LiquidControls>
  stage: RefObject<StageCapture | null>
}) {
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
        <LabColour
          label={t.tint}
          value={state.tint}
          fallback="#ff3b43"
          clearLabel={t.ownColours}
          onChange={(tint) => update({ tint })}
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
        <LabAction
          onClick={() =>
            update({
              matter: MATTERS[Math.floor(Math.random() * MATTERS.length)],
              deformation: 0.5 + Math.random() * 1.1,
              flow: Math.random() * 1.8,
              tint: Math.random() < 0.6 ? `#${[0, 1, 2].map(() => Math.floor(60 + Math.random() * 195).toString(16).padStart(2, '0')).join('')}` : null,
              pulseVersion: controls.current.pulseVersion + 1,
            })
          }
        >
          {t.randomise}
        </LabAction>
        <LabAction onClick={() => update({ ...LIQUID_DEFAULTS, pulseVersion: controls.current.pulseVersion })}>
          {text.panel.reset}
        </LabAction>
      </LabActions>

      <KeepWork
        type="material"
        stage={stage}
        name={() => `${names[controls.current.matter]} ${stamp()}`}
        payload={() => materialWork(controls.current) as unknown as Record<string, unknown>}
      />
    </>
  )
}

/** Liquid Matter: one form, four states of matter. */
export default function LiquidMatter() {
  // A material opened from the saved works arrives through the handoff; otherwise the defaults.
  const controls = useRef<LiquidControls>({ ...(liquidHandoff.peek() ?? LIQUID_DEFAULTS) })
  const stage = useRef<StageCapture | null>(null)
  useEffect(() => {
    liquidHandoff.clear()
  }, [])

  return (
    <ExperimentFrame
      id="liquid-matter"
      camera={CAMERA}
      antialias
      scene={<LiquidScene controls={controls} stage={stage} />}
      panel={<LiquidPanel controls={controls} stage={stage} />}
    />
  )
}
