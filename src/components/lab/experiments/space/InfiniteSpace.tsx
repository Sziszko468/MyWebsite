import { lazy, useRef, useState, type RefObject } from 'react'
import { useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { LabAction, LabActions, LabChoice, LabGroup, LabNote, LabSlider } from '../../ui/LabControls'
import { SaveImage } from '../../artifacts/SaveImage'
import type { StageCapture } from '../../core/useStageCapture'
import { PARTICLE_PALETTES, particleText, type ParticlePalette } from '../particles/particleControls'
import { SPACE_DEFAULTS, SPACE_LAYERS, spaceText, type SpaceControls, type SpaceLayer } from './spaceControls'

// The scene (Three.js and the shaders) loads after the page's words and controls.
const SpaceScene = lazy(() => import('./SpaceScene'))

const CAMERA = { fov: 62, position: [0, 0, 0] as [number, number, number], far: 400 }

function SpacePanel({ controls, stage }: { controls: RefObject<SpaceControls>; stage: RefObject<StageCapture | null> }) {
  const t = useLocalized(spaceText)
  const palettes = useLocalized(particleText)
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
          label={t.intensity}
          value={state.intensity}
          min={0.2}
          max={2}
          step={0.05}
          format={percent}
          onChange={(intensity) => update({ intensity })}
        />
        <LabChoice<SpaceLayer>
          label={t.layer}
          value={state.layer}
          options={SPACE_LAYERS.map((layer) => ({ value: layer, label: t.layers[layer] }))}
          onChange={(layer) => update({ layer })}
          columns={2}
        />
        <LabChoice<ParticlePalette>
          label={t.palette}
          value={state.palette}
          options={PARTICLE_PALETTES.map((palette) => ({ value: palette, label: palettes.palettes[palette] }))}
          onChange={(palette) => update({ palette })}
          columns={3}
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
        <LabAction onClick={() => update({ warpVersion: controls.current.warpVersion + 1 })}>{t.warp}</LabAction>
        <LabAction
          onClick={() =>
            update({ ...SPACE_DEFAULTS, pulseVersion: controls.current.pulseVersion, warpVersion: controls.current.warpVersion })
          }
        >
          {text.panel.reset}
        </LabAction>
        <SaveImage name={() => 'infinite-space'} stage={stage} />
      </LabActions>
    </>
  )
}

/** Infinite Space: a tunnel of light that the visitor steers. */
export default function InfiniteSpace() {
  const controls = useRef<SpaceControls>({ ...SPACE_DEFAULTS })
  const stage = useRef<StageCapture | null>(null)

  return (
    <ExperimentFrame
      id="infinite-space"
      camera={CAMERA}
      scene={<SpaceScene controls={controls} stage={stage} />}
      panel={<SpacePanel controls={controls} stage={stage} />}
    />
  )
}
