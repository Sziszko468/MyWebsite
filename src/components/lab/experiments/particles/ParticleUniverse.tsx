import { lazy, useRef, useState, type RefObject } from 'react'
import { useLabText, useLocalized } from '../../core/useLabText'
import { LabAction, LabActions, LabChoice, LabGroup, LabSlider } from '../../ui/LabControls'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { PARTICLE_DEFAULTS, particleText, type ParticleControls } from './particleControls'
import { SHAPES, type ShapeId } from './particleShapes'

// The scene (Three.js, the shaders, the simulation) loads after the page's words and controls.
const ParticleScene = lazy(() => import('./ParticleScene'))

const CAMERA = { fov: 50, position: [0, 0, 9] as [number, number, number] }

function ParticlePanel({ controls }: { controls: RefObject<ParticleControls> }) {
  const t = useLocalized(particleText)
  const { text } = useLabText()
  const [state, setState] = useState<ParticleControls>(() => ({ ...controls.current }))

  // The panel owns what the visitor sees; the scene reads the same values from the ref every frame.
  const update = (patch: Partial<ParticleControls>) => {
    const next = { ...controls.current, ...patch }
    controls.current = next
    setState(next)
  }

  const percent = (value: number) => `${Math.round(value * 100)}%`

  return (
    <>
      <LabGroup>
        <LabChoice<ShapeId>
          label={t.shape}
          value={state.shape}
          options={SHAPES.map((shape) => ({ value: shape, label: t.shapes[shape] }))}
          onChange={(shape) => update({ shape })}
          columns={3}
        />
      </LabGroup>

      <LabGroup>
        <LabChoice<ParticleControls['mode']>
          label={t.mode}
          value={state.mode}
          options={[
            { value: 'attract', label: t.attract },
            { value: 'repel', label: t.repel },
          ]}
          onChange={(mode) => update({ mode })}
        />
        <LabSlider
          label={t.strength}
          value={state.strength}
          min={0.2}
          max={2}
          step={0.05}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={(strength) => update({ strength })}
        />
        <LabSlider
          label={t.density}
          value={state.density}
          min={0.1}
          max={1}
          step={0.05}
          format={percent}
          onChange={(density) => update({ density })}
        />
        <LabSlider
          label={t.intensity}
          value={state.intensity}
          min={0.3}
          max={1.6}
          step={0.05}
          format={percent}
          onChange={(intensity) => update({ intensity })}
        />
      </LabGroup>

      <LabActions>
        <LabAction onClick={() => update({ burstVersion: controls.current.burstVersion + 1 })}>{t.burst}</LabAction>
        <LabAction
          onClick={() =>
            update({
              ...PARTICLE_DEFAULTS,
              burstVersion: controls.current.burstVersion,
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

/** Particle Universe: thousands of particles that follow, flee and re-form. */
export default function ParticleUniverse() {
  const controls = useRef<ParticleControls>({ ...PARTICLE_DEFAULTS })

  return (
    <ExperimentFrame
      id="particle-universe"
      camera={CAMERA}
      scene={<ParticleScene controls={controls} />}
      panel={<ParticlePanel controls={controls} />}
    />
  )
}
