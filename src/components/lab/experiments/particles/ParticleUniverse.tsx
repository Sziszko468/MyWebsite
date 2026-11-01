import { lazy, useRef, useState, type RefObject } from 'react'
import { SaveImage } from '../../artifacts/SaveImage'
import type { StageCapture } from '../../core/useStageCapture'
import { useLabText, useLocalized } from '../../core/useLabText'
import { LabAction, LabActions, LabChoice, LabGroup, LabSlider } from '../../ui/LabControls'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { PARTICLE_DEFAULTS, PARTICLE_PALETTES, particleText, type ParticleControls, type ParticlePalette } from './particleControls'
import { SHAPES, type ShapeId } from './particleShapes'

// The scene (Three.js, the shaders, the simulation) loads after the page's words and controls.
const ParticleScene = lazy(() => import('./ParticleScene'))

const CAMERA = { fov: 50, position: [0, 0, 9] as [number, number, number] }

function ParticlePanel({ controls, stage }: { controls: RefObject<ParticleControls>; stage: RefObject<StageCapture | null> }) {
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
        <LabChoice<ParticlePalette>
          label={t.palette}
          value={state.palette}
          options={PARTICLE_PALETTES.map((palette) => ({ value: palette, label: t.palettes[palette] }))}
          onChange={(palette) => update({ palette })}
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
          label={t.speed}
          value={state.speed}
          min={0.2}
          max={2.5}
          step={0.05}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={(speed) => update({ speed })}
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
          onClick={() => {
            const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
            update({
              shape: pick(SHAPES),
              mode: pick(['attract', 'repel'] as const),
              palette: pick(PARTICLE_PALETTES),
              strength: 0.5 + Math.random() * 1.4,
              speed: 0.5 + Math.random() * 1.6,
              density: 0.45 + Math.random() * 0.55,
              intensity: 0.7 + Math.random() * 0.8,
              burstVersion: controls.current.burstVersion + 1,
            })
          }}
        >
          {t.randomise}
        </LabAction>
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
        <SaveImage name={() => 'particle-universe'} stage={stage} />
      </LabActions>
    </>
  )
}

/** Particle Universe: thousands of particles that follow, flee and re-form. */
export default function ParticleUniverse() {
  const controls = useRef<ParticleControls>({ ...PARTICLE_DEFAULTS })
  const stage = useRef<StageCapture | null>(null)

  return (
    <ExperimentFrame
      id="particle-universe"
      camera={CAMERA}
      scene={<ParticleScene controls={controls} stage={stage} />}
      panel={<ParticlePanel controls={controls} stage={stage} />}
    />
  )
}
