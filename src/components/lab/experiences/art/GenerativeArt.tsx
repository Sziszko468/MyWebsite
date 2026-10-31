import { lazy, useRef, useState, type ChangeEvent } from 'react'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { labProfileFor } from '../../core/labProfile'
import { artifactId, saveArtifact } from '../../artifacts/artifactActions'
import { artifactText } from '../../artifacts/artifactText'
import { useExperience } from '../../experience/context'
import { ExperienceFrame } from '../../experience/ExperienceFrame'
import { ExperienceStage } from '../../experience/ExperienceStage'
import { downloadBlob, downloadJson, readFileText, safeFilename } from '../../experience/persist'
import { useStore } from '../../experience/store'
import { Glyph, PanelSection, TabBar, Toast, ToolButton, ToolRow } from '../../experience/ui'
import { useMedia } from '../../experience/useMedia'
import { award } from '../../progress/progress'
import { LabChoice, LabSlider } from '../../ui/LabControls'
import {
  DEFAULT_PARAMS,
  FORMATIONS,
  PALETTES,
  PALETTE_IDS,
  POINTER_MODES,
  RANGES,
  art,
  patchParams,
  randomParams,
  readSlot,
  sanitizeParams,
  saveSlot,
  setMessage,
  setParams,
  setPaused,
  type Formation,
  type PaletteId,
  type PointerMode,
} from './artParams'
import type { ArtApi } from './ArtScene'
import { artText } from './artText'
import styles from './GenerativeArt.module.scss'

const ArtScene = lazy(() => import('./ArtScene'))

const CAMERA = { fov: 45, position: [0, 0.6, 9] as [number, number, number], near: 0.1, far: 100 }

type Text = ReturnType<typeof useLocalized<typeof artText>>
type TabId = 'shape' | 'motion' | 'colour' | 'keep'

const percent = (value: number) => value.toFixed(2)

function ShapePanel({
  t,
  cap,
  onRandom,
  onReset,
}: {
  t: Text
  cap: number
  onRandom: () => void
  onReset: () => void
}) {
  const params = useStore(art, (state) => state.params)
  return (
    <PanelSection title={t.tabs.shape}>
      <LabChoice<Formation>
        label={t.fields.formation}
        value={params.formation}
        options={FORMATIONS.map((value) => ({ value, label: t.formations[value] }))}
        onChange={(formation) => patchParams({ formation })}
        columns={3}
      />
      <LabSlider
        label={t.fields.scale}
        value={params.scale}
        min={RANGES.scale.min}
        max={RANGES.scale.max}
        step={RANGES.scale.step}
        format={percent}
        onChange={(scale) => patchParams({ scale })}
      />
      <LabSlider
        label={t.fields.distortion}
        value={params.distortion}
        min={0}
        max={1}
        step={RANGES.distortion.step}
        format={percent}
        onChange={(distortion) => patchParams({ distortion })}
      />
      <LabSlider
        label={t.fields.count}
        value={Math.min(params.count, cap)}
        min={RANGES.count.min}
        max={cap}
        step={RANGES.count.step}
        format={(value) => value.toLocaleString()}
        onChange={(count) => patchParams({ count })}
      />
      <label className={styles.seedField}>
        <span>{t.fields.seed}</span>
        <input
          type="number"
          inputMode="numeric"
          min={RANGES.seed.min}
          max={RANGES.seed.max}
          value={params.seed}
          onChange={(event) => {
            const value = Number(event.currentTarget.value)
            if (event.currentTarget.value !== '' && Number.isFinite(value)) patchParams({ seed: value })
          }}
        />
      </label>
      <ToolRow className={styles.randomRow}>
        <ToolButton
          tone="accent"
          label={t.actions.randomize}
          icon={
            <Glyph>
              <path d="M4 7h4l8 10h4M4 17h4l3-4M13 11l3-4h4M18 5l2 2-2 2M18 15l2 2-2 2" />
            </Glyph>
          }
          onClick={onRandom}
        />
        <ToolButton
          label={t.actions.reset}
          icon={
            <Glyph>
              <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />
            </Glyph>
          }
          onClick={onReset}
        />
      </ToolRow>
    </PanelSection>
  )
}

function MotionPanel({ t }: { t: Text }) {
  const params = useStore(art, (state) => state.params)
  return (
    <PanelSection title={t.tabs.motion}>
      <LabSlider
        label={t.fields.speed}
        value={params.speed}
        min={RANGES.speed.min}
        max={RANGES.speed.max}
        step={RANGES.speed.step}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(speed) => patchParams({ speed })}
      />
      <LabSlider
        label={t.fields.force}
        value={params.force}
        min={0}
        max={RANGES.force.max}
        step={RANGES.force.step}
        format={percent}
        onChange={(force) => patchParams({ force })}
      />
      <LabChoice<PointerMode>
        label={t.fields.pointer}
        value={params.pointer}
        options={POINTER_MODES.map((value) => ({ value, label: t.pointerModes[value] }))}
        onChange={(pointer) => patchParams({ pointer })}
        columns={2}
      />
      <LabSlider
        label={t.fields.gravity}
        value={params.gravity}
        min={-1}
        max={1}
        step={RANGES.gravity.step}
        format={percent}
        onChange={(gravity) => patchParams({ gravity })}
      />
      <LabSlider
        label={t.fields.turbulence}
        value={params.turbulence}
        min={0}
        max={RANGES.turbulence.max}
        step={RANGES.turbulence.step}
        format={percent}
        onChange={(turbulence) => patchParams({ turbulence })}
      />
      <LabSlider
        label={t.fields.rotation}
        value={params.rotation}
        min={-2}
        max={2}
        step={RANGES.rotation.step}
        format={percent}
        onChange={(rotation) => patchParams({ rotation })}
      />
      <LabSlider
        label={t.fields.noise}
        value={params.noise}
        min={0}
        max={1}
        step={RANGES.noise.step}
        format={percent}
        onChange={(noise) => patchParams({ noise })}
      />
    </PanelSection>
  )
}

function ColourPanel({ t }: { t: Text }) {
  const palette = useStore(art, (state) => state.params.palette)
  return (
    <PanelSection title={t.tabs.colour}>
      <div role="group" aria-label={t.fields.palette} className={styles.palettes}>
        {PALETTE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.palette}
            aria-pressed={palette === id}
            onClick={() => patchParams({ palette: id as PaletteId })}
          >
            <span className={styles.swatches} aria-hidden="true">
              {PALETTES[id].map((hex) => (
                <span key={hex} style={{ background: hex }} />
              ))}
            </span>
            {t.palettes[id]}
          </button>
        ))}
      </div>
    </PanelSection>
  )
}

function KeepPanel({ t, api }: { t: Text; api: React.RefObject<ArtApi | null> }) {
  const params = useStore(art, (state) => state.params)
  const message = useStore(art, (state) => state.message)
  const a = useLocalized(artifactText)
  const file = useRef<HTMLInputElement>(null)
  const kept = () => award('art:exported', 15, 'creative-explorer')

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!picked) return
    try {
      const data = JSON.parse(await readFileText(picked, 20_000)) as { version?: unknown }
      if (typeof data === 'object' && data !== null && data.version === 1)
        setParams(sanitizeParams(data), t.messages.loaded)
      else setMessage(t.messages.badFile)
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'too-large' ? t.messages.tooBig : t.messages.badFile)
    }
  }

  return (
    <PanelSection title={t.keep.title}>
      <p className={styles.note}>{t.keep.note}</p>
      <div className={styles.actions}>
        <ToolButton
          label={t.keep.png}
          icon={
            <Glyph>
              <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
            </Glyph>
          }
          onClick={async () => {
            const url = await api.current?.capture('full')
            if (!url) return setMessage(t.messages.imageFailed)
            downloadBlob(await (await fetch(url)).blob(), safeFilename(`generative-art-${params.seed}`, 'png'))
            kept()
            setMessage(t.messages.image)
          }}
        />
        <ToolButton
          label={t.keep.save}
          icon={
            <Glyph>
              <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />
            </Glyph>
          }
          onClick={() => setMessage(saveSlot(params) ? t.messages.saved : t.messages.saveFailed)}
        />
        <ToolButton
          label={t.keep.load}
          icon={
            <Glyph>
              <path d="M4 7h6l2 2h8v10H4zM12 11v6M9 14l3 3 3-3" />
            </Glyph>
          }
          onClick={() => {
            const saved = readSlot()
            if (saved) setParams(saved, t.messages.loaded)
            else setMessage(t.messages.nothing)
          }}
        />
        <ToolButton
          label={t.keep.download}
          icon={
            <Glyph>
              <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
            </Glyph>
          }
          onClick={() => {
            downloadJson(params, safeFilename(`generative-art-${params.seed}`, 'json'))
            kept()
            setMessage(t.messages.downloaded)
          }}
        />
        <ToolButton
          label={t.keep.open}
          icon={
            <Glyph>
              <path d="M12 20V9M7 13l5-5 5 5M5 4h14" />
            </Glyph>
          }
          onClick={() => file.current?.click()}
        />
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={onFile}
          aria-label={t.keep.open}
        />
        <ToolButton
          label={t.keep.artifact}
          icon={
            <Glyph>
              <path d="M4 7h16v12H4zM4 7l3-3h10l3 3M9 12h6" />
            </Glyph>
          }
          onClick={async () => {
            const thumbnail = (await api.current?.capture('thumb')) ?? undefined
            const result = await saveArtifact({
              id: artifactId('artwork', `art-${params.seed}`),
              type: 'artwork',
              name: `Art ${params.seed}`,
              payload: { ...params } as unknown as Record<string, unknown>,
              thumbnail,
            })
            if (result.ok) kept()
            setMessage(result.ok ? (result.persistent ? a.saved : a.savedSession) : a.failed[result.reason])
          }}
        />
      </div>
      <Toast
        message={message}
        tone={
          Object.values(a.failed).includes(message) ||
          message === t.messages.saveFailed ||
          message === t.messages.badFile ||
          message === t.messages.imageFailed
            ? 'error'
            : 'info'
        }
      />
    </PanelSection>
  )
}

function ArtApp() {
  const t = useLocalized(artText)
  const { experiments } = useLabText()
  const { view } = useExperience()
  const api = useRef<ArtApi | null>(null)
  const paused = useStore(art, (state) => state.paused)
  const wide = useMedia('(min-width: 68.75rem)')
  const [tab, setTab] = useState<TabId | null>('shape')
  // What this device can draw: the quality tier decides the most particles.
  const cap = Math.min(RANGES.count.max, labProfileFor(view.tier).particles)

  const randomize = () => {
    const seed = Math.floor(Math.random() * 99_999) + 1
    setParams(randomParams(seed, cap), fill(t.messages.random, { seed }))
  }
  const reset = () => setParams({ ...DEFAULT_PARAMS, count: Math.min(DEFAULT_PARAMS.count, cap) })

  const tabs = [
    {
      id: 'shape' as const,
      label: t.tabs.shape,
      icon: (
        <Glyph>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
        </Glyph>
      ),
    },
    {
      id: 'motion' as const,
      label: t.tabs.motion,
      icon: (
        <Glyph>
          <path d="M3 12c3-6 6 6 9 0s6 6 9 0" />
        </Glyph>
      ),
    },
    {
      id: 'colour' as const,
      label: t.tabs.colour,
      icon: (
        <Glyph>
          <circle cx="12" cy="12" r="8" />
          <path d="M8 9a5 5 0 0 1 4-2" />
        </Glyph>
      ),
    },
    {
      id: 'keep' as const,
      label: t.tabs.keep,
      icon: (
        <Glyph>
          <path d="M5 4h11l3 3v13H5zM8 4v5h7V4" />
        </Glyph>
      ),
    },
  ]
  const panel = (id: TabId) =>
    id === 'shape' ? (
      <ShapePanel t={t} cap={cap} onRandom={randomize} onReset={reset} />
    ) : id === 'motion' ? (
      <MotionPanel t={t} />
    ) : id === 'colour' ? (
      <ColourPanel t={t} />
    ) : (
      <KeepPanel t={t} api={api} />
    )

  return (
    <div className={styles.art} data-wide={wide}>
      <div className={styles.viewport}>
        <ExperienceStage
          label={experiments['generative-art'].stageLabel}
          camera={CAMERA}
          maxDpr={1.5}
          touchAction="pan-y"
          overlay={
            <>
              <div className={styles.quick} role="group" aria-label={t.actions.quick}>
                <ToolButton
                  tone="accent"
                  label={t.actions.randomize}
                  icon={
                    <Glyph>
                      <path d="M4 7h4l8 10h4M4 17h4l3-4M13 11l3-4h4M18 5l2 2-2 2M18 15l2 2-2 2" />
                    </Glyph>
                  }
                  onClick={randomize}
                />
                <ToolButton
                  label={paused ? t.actions.resume : t.actions.pause}
                  pressed={paused}
                  icon={
                    <Glyph>
                      <path d={paused ? 'M8 5l11 7-11 7z' : 'M8 5v14M16 5v14'} />
                    </Glyph>
                  }
                  onClick={() => setPaused(!paused)}
                />
                <ToolButton
                  label={t.actions.reset}
                  icon={
                    <Glyph>
                      <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />
                    </Glyph>
                  }
                  onClick={reset}
                />
              </div>
              <p className={styles.hint}>{t.hint}</p>
            </>
          }
        >
          <ArtScene apiRef={api} />
        </ExperienceStage>
      </div>

      {wide ? (
        <aside className={styles.side} aria-label={t.tabs.label}>
          {panel('shape')}
          {panel('motion')}
          {panel('colour')}
          {panel('keep')}
        </aside>
      ) : (
        <div className={styles.dock} data-open={tab !== null}>
          <TabBar
            label={t.tabs.label}
            tabs={tabs}
            value={tab ?? 'shape'}
            onChange={(id) => setTab((now) => (now === id ? null : id))}
            className={styles.dockTabs}
          />
          {tab && (
            <div className={styles.dockBody} role="tabpanel">
              {panel(tab)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Generative Art Engine: make a piece of art from particles. */
export default function GenerativeArt() {
  return (
    <ExperienceFrame id="generative-art">
      <ArtApp />
    </ExperienceFrame>
  )
}
