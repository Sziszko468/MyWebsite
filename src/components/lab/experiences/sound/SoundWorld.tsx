import { lazy, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { labProfileFor } from '../../core/labProfile'
import { useLabText, useLocalized } from '../../core/useLabText'
import { useExperience } from '../../experience/context'
import { ExperienceFrame } from '../../experience/ExperienceFrame'
import { ExperienceStage } from '../../experience/ExperienceStage'
import { useStore } from '../../experience/store'
import { Glyph, PanelSection, TabBar, Toast, ToolButton } from '../../experience/ui'
import { useMedia } from '../../experience/useMedia'
import { LabAction, LabChoice, LabNote, LabSlider, LabToggle } from '../../ui/LabControls'
import { TEMPO } from './rhythm'
import { SoundEngine, type EngineState, type SoundSource } from './soundEngine'
import {
  RANGES,
  SOUND_PALETTES,
  SOUND_PALETTE_IDS,
  loadSettings,
  particleBudget,
  patchSettings,
  resetSettings,
  setConsent,
  setMessage,
  sound,
  type SoundPaletteId,
} from './soundParams'
import { soundText } from './soundText'
import styles from './SoundWorld.module.scss'

const SoundScene = lazy(() => import('./SoundScene'))

const CAMERA = { fov: 45, position: [0, 0.4, 9] as [number, number, number], near: 0.1, far: 100 }

type Text = ReturnType<typeof useLocalized<typeof soundText>>
type TabId = 'sound' | 'react' | 'look'

/** Development only: the engine, for the browser checks. */
interface SoundWindow extends Window {
  __labSound?: SoundEngine
}

const percent = (value: number) => `${Math.round(value * 100)}%`

function useEngineState(engine: SoundEngine): EngineState {
  return useSyncExternalStore(engine.subscribe, engine.getState, engine.getState)
}

function statusText(t: Text, es: EngineState): string {
  if (es.micAsking) return t.status.asking
  if (es.micOn) return t.status.micOn
  if (es.source === 'mic') return t.status.micWaiting
  if (es.source === 'builtin') return es.playing ? t.status.playing : t.status.paused
  return es.previewOn ? t.status.previewRunning : t.status.previewPaused
}

/** What the main button does for the source in use. */
function usePrimary(engine: SoundEngine, es: EngineState, t: Text) {
  const start = async () => {
    const result = await engine.startBuiltIn()
    if (result === 'unavailable') {
      setMessage(t.messages.noAudio, 'warning')
      engine.setSource('preview')
      engine.setPreview(true)
    } else setMessage('')
  }
  if (es.source === 'mic') {
    return es.micOn
      ? {
          label: t.actions.stopMic,
          icon: 'M6 6h12v12H6z',
          pressed: false,
          run: () => {
            engine.stopMic()
            setMessage(t.messages.micStopped)
          },
        }
      : {
          label: t.actions.useMic,
          icon: 'M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3',
          pressed: false,
          run: () => setConsent(true),
        }
  }
  if (es.source === 'builtin') {
    return {
      label: es.playing ? t.actions.pause : t.actions.play,
      icon: es.playing ? 'M8 5v14M16 5v14' : 'M8 5l11 7-11 7z',
      pressed: es.playing,
      run: () => (es.playing ? engine.pauseBuiltIn() : void start()),
    }
  }
  return {
    label: es.previewOn ? t.actions.pausePreview : t.actions.runPreview,
    icon: es.previewOn ? 'M8 5v14M16 5v14' : 'M8 5l11 7-11 7z',
    pressed: es.previewOn,
    run: () => engine.setPreview(!es.previewOn),
  }
}

function SoundPanel({ engine, t }: { engine: SoundEngine; t: Text }) {
  const es = useEngineState(engine)
  const settings = useStore(sound, (state) => state.settings)
  const consent = useStore(sound, (state) => state.consent)
  const message = useStore(sound, (state) => state.message)
  const tone = useStore(sound, (state) => state.tone)
  const primary = usePrimary(engine, es, t)

  const choose = (source: SoundSource) => {
    setMessage('')
    // Choosing the microphone only shows what it will do; nothing is asked for until it is allowed.
    setConsent(source === 'mic')
    engine.setSource(source)
  }

  const allow = async () => {
    const result = await engine.startMic()
    if (result === 'on') {
      setConsent(false)
      setMessage('')
    } else if (result !== 'cancelled') {
      setConsent(false)
      engine.setSource('preview')
      engine.setPreview(true)
      setMessage(
        result === 'denied' ? t.messages.denied : result === 'unavailable' ? t.messages.unavailable : t.messages.error,
        result === 'error' ? 'error' : 'warning',
      )
    }
  }

  const note =
    es.source === 'mic' ? t.source.micNote : es.source === 'builtin' ? t.source.builtinNote : t.source.previewNote

  return (
    <PanelSection title={t.tabs.sound}>
      <LabChoice<SoundSource>
        label={t.source.label}
        value={es.source}
        options={[
          { value: 'preview', label: t.source.preview },
          { value: 'builtin', label: t.source.builtin },
          { value: 'mic', label: t.source.mic },
        ]}
        onChange={choose}
        columns={3}
      />
      <p className={styles.note}>{note}</p>

      {consent && es.source === 'mic' && !es.micOn && (
        <section className={styles.consent} aria-labelledby="sound-consent-title">
          <h3 id="sound-consent-title">{t.consent.title}</h3>
          <ul>
            <li>{t.consent.does}</li>
            <li>{t.consent.doesNot}</li>
            <li>{t.consent.control}</li>
          </ul>
          <p className={styles.note}>{t.consent.next}</p>
          <div className={styles.consentActions}>
            <LabAction variant="primary" onClick={allow} disabled={es.micAsking}>
              {t.actions.allow}
            </LabAction>
            <LabAction
              onClick={() => {
                engine.stopMic()
                setConsent(false)
                engine.setSource('preview')
              }}
            >
              {t.actions.notNow}
            </LabAction>
          </div>
        </section>
      )}

      <LabAction variant="primary" onClick={primary.run} pressed={primary.pressed || undefined}>
        {primary.label}
      </LabAction>

      {es.source !== 'mic' && (
        <LabSlider
          label={t.fields.tempo}
          value={settings.tempo}
          min={TEMPO.min}
          max={TEMPO.max}
          step={1}
          format={(v) => String(Math.round(v))}
          onChange={(tempo) => {
            patchSettings({ tempo })
            engine.setTempo(tempo)
          }}
        />
      )}
      {es.source === 'builtin' && (
        <LabSlider
          label={t.fields.volume}
          value={settings.volume}
          min={RANGES.volume.min}
          max={RANGES.volume.max}
          step={RANGES.volume.step}
          format={percent}
          onChange={(volume) => {
            patchSettings({ volume })
            engine.setVolume(volume)
          }}
        />
      )}
      <Toast message={message} tone={tone} />
    </PanelSection>
  )
}

/** Four bars that show what the engine hears, written straight to the page without rendering it again. */
function SignalMeter({ engine, t }: { engine: SoundEngine; t: Text }) {
  const bars = useRef<Record<string, HTMLElement | null>>({})
  useEffect(() => {
    let id = 0
    const loop = () => {
      const frame = engine.frame
      const values: Record<string, number> = { level: frame.level, bass: frame.bass, mid: frame.mid, high: frame.high }
      for (const key of Object.keys(values)) {
        const bar = bars.current[key]
        if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, values[key])).toFixed(3)})`
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [engine])
  return (
    <div className={styles.meters} role="group" aria-label={t.fields.meters}>
      {(['level', 'bass', 'mid', 'high'] as const).map((key) => (
        <div key={key} className={styles.meter}>
          <span>{t.meters[key]}</span>
          <i>
            <b
              ref={(node) => {
                bars.current[key] = node
              }}
            />
          </i>
        </div>
      ))}
    </div>
  )
}

function ReactionPanel({ engine, t }: { engine: SoundEngine; t: Text }) {
  const settings = useStore(sound, (state) => state.settings)
  return (
    <PanelSection title={t.tabs.react}>
      <SignalMeter engine={engine} t={t} />
      <LabSlider
        label={t.fields.sensitivity}
        value={settings.sensitivity}
        min={RANGES.sensitivity.min}
        max={RANGES.sensitivity.max}
        step={RANGES.sensitivity.step}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(sensitivity) => patchSettings({ sensitivity })}
      />
      <LabSlider
        label={t.fields.smoothing}
        value={settings.smoothing}
        min={RANGES.smoothing.min}
        max={RANGES.smoothing.max}
        step={RANGES.smoothing.step}
        format={percent}
        onChange={(smoothing) => {
          patchSettings({ smoothing })
          engine.setSmoothing(smoothing)
        }}
      />
      <LabSlider
        label={t.fields.geometry}
        value={settings.geometry}
        min={RANGES.geometry.min}
        max={RANGES.geometry.max}
        step={RANGES.geometry.step}
        format={percent}
        onChange={(geometry) => patchSettings({ geometry })}
      />
      <LabSlider
        label={t.fields.particles}
        value={settings.particles}
        min={RANGES.particles.min}
        max={RANGES.particles.max}
        step={RANGES.particles.step}
        format={percent}
        onChange={(particles) => patchSettings({ particles })}
      />
      <LabSlider
        label={t.fields.lights}
        value={settings.lights}
        min={RANGES.lights.min}
        max={RANGES.lights.max}
        step={RANGES.lights.step}
        format={percent}
        onChange={(lights) => patchSettings({ lights })}
      />
      <LabNote>{t.safety}</LabNote>
    </PanelSection>
  )
}

function LookPanel({ t, cap }: { t: Text; cap: number }) {
  const settings = useStore(sound, (state) => state.settings)
  return (
    <PanelSection title={t.tabs.look}>
      <div role="group" aria-label={t.fields.palette} className={styles.palettes}>
        {SOUND_PALETTE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.palette}
            aria-pressed={settings.palette === id}
            onClick={() => patchSettings({ palette: id as SoundPaletteId })}
          >
            <span className={styles.swatches} aria-hidden="true">
              {SOUND_PALETTES[id].map((hex) => (
                <span key={hex} style={{ background: hex }} />
              ))}
            </span>
            {t.palettes[id]}
          </button>
        ))}
      </div>
      <LabSlider
        label={t.fields.density}
        value={settings.density}
        min={RANGES.density.min}
        max={RANGES.density.max}
        step={RANGES.density.step}
        format={(v) => Math.round(v * cap).toLocaleString()}
        onChange={(density) => patchSettings({ density })}
      />
      <LabToggle
        label={t.fields.waveform}
        checked={settings.waveform}
        onChange={(waveform) => patchSettings({ waveform })}
      />
      <LabAction onClick={resetSettings}>{t.actions.reset}</LabAction>
    </PanelSection>
  )
}

function SoundApp() {
  const t = useLocalized(soundText)
  const { experiments } = useLabText()
  const { view } = useExperience()
  const wide = useMedia('(min-width: 68.75rem)')
  const [tab, setTab] = useState<TabId | null>('sound')
  // The engine is made with the page and does nothing until the effect below attaches it.
  const [engine] = useState(() => new SoundEngine())
  const engineRef = useRef<SoundEngine | null>(null)
  const live = useRef(view.view === 'live')
  const words = useRef(t)
  useEffect(() => {
    words.current = t
  })

  // The engine belongs to the page: it is attached here and released here, with the microphone first.
  useEffect(() => {
    const created = engine
    created.attach()
    const saved = loadSettings()
    created.setTempo(saved.tempo)
    created.setVolume(saved.volume)
    created.setSmoothing(saved.smoothing)
    // The silent preview begins by itself only where a scene may move by itself; a calm view waits to be asked.
    created.setPreview(live.current)
    engineRef.current = created
    if (import.meta.env.DEV) (window as SoundWindow).__labSound = created

    let wasOn = false
    const unsubscribe = created.subscribe(() => {
      const on = created.getState().micOn
      if (wasOn && !on) setMessage(words.current.messages.micStopped)
      wasOn = on
    })
    const leave = () => created.stopMic()
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      unsubscribe()
      created.dispose()
      engineRef.current = null
      if (import.meta.env.DEV && (window as SoundWindow).__labSound === created)
        delete (window as SoundWindow).__labSound
    }
  }, [engine])

  const tabs = [
    {
      id: 'sound' as const,
      label: t.tabs.sound,
      icon: (
        <Glyph>
          <path d="M4 9v6M8 6v12M12 3v18M16 7v10M20 10v4" />
        </Glyph>
      ),
    },
    {
      id: 'react' as const,
      label: t.tabs.react,
      icon: (
        <Glyph>
          <path d="M3 12c3-6 6 6 9 0s6 6 9 0" />
        </Glyph>
      ),
    },
    {
      id: 'look' as const,
      label: t.tabs.look,
      icon: (
        <Glyph>
          <circle cx="12" cy="12" r="8" />
          <path d="M8 9a5 5 0 0 1 4-2" />
        </Glyph>
      ),
    },
  ]
  const cap = particleBudget(labProfileFor(view.tier).particles)

  return (
    <div className={styles.world} data-wide={wide}>
      <div className={styles.viewport}>
        <ExperienceStage
          label={experiments['sound-world'].stageLabel}
          camera={CAMERA}
          maxDpr={1.5}
          touchAction="pan-y"
          overlay={<Overlay engine={engine} t={t} />}
        >
          <SoundScene engineRef={engineRef} />
        </ExperienceStage>
      </div>

      {wide ? (
        <aside className={styles.side} aria-label={t.tabs.label}>
          <SoundPanel engine={engine} t={t} />
          <ReactionPanel engine={engine} t={t} />
          <LookPanel t={t} cap={cap} />
        </aside>
      ) : (
        <div className={styles.dock} data-open={tab !== null}>
          <TabBar
            label={t.tabs.label}
            tabs={tabs}
            value={tab ?? 'sound'}
            onChange={(id) => setTab((now) => (now === id ? null : id))}
            className={styles.dockTabs}
          />
          {tab && (
            <div className={styles.dockBody} role="tabpanel">
              {tab === 'sound' && <SoundPanel engine={engine} t={t} />}
              {tab === 'react' && <ReactionPanel engine={engine} t={t} />}
              {tab === 'look' && <LookPanel t={t} cap={cap} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Over the picture: the main button, and a status that says out loud whether anything is listening. */
function Overlay({ engine, t }: { engine: SoundEngine; t: Text }) {
  const es = useEngineState(engine)
  const primary = usePrimary(engine, es, t)
  const state = es.micOn || es.micAsking ? 'mic' : es.source === 'builtin' && es.playing ? 'sound' : 'silent'
  return (
    <>
      <div className={styles.quick} role="group" aria-label={t.actions.quick} data-lab-ui>
        <ToolButton
          tone="accent"
          label={primary.label}
          pressed={primary.pressed || undefined}
          icon={
            <Glyph>
              <path d={primary.icon} />
            </Glyph>
          }
          onClick={primary.run}
        />
      </div>
      <p className={styles.badge} role="status" data-state={state} data-lab-ui>
        <span className={styles.dot} aria-hidden="true" />
        {statusText(t, es)}
      </p>
      <p className={styles.hint}>{es.previewOn || es.playing || es.micOn ? t.hintActive : t.hint}</p>
    </>
  )
}

/** Sound Reactive World: a 3D world that moves with sound. */
export default function SoundWorld() {
  return (
    <ExperienceFrame id="sound-world">
      <SoundApp />
    </ExperienceFrame>
  )
}
