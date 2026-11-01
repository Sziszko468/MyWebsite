import { lazy, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useSearchParams } from 'react-router'
import { cx } from '../../../../utils/cx'
import { artifactText } from '../../artifacts/artifactText'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { ExperienceFrame } from '../../experience/ExperienceFrame'
import { ExperienceStage } from '../../experience/ExperienceStage'
import { downloadBlob, downloadJson, safeFilename } from '../../experience/persist'
import { useStore } from '../../experience/store'
import { useMedia } from '../../experience/useMedia'
import { Glyph, TabBar, Toast } from '../../experience/ui'
import type { AiFailure } from './aiClient'
import { creationHandoff, creationPayload, type Creation } from './creation'
import { Gallery } from './Gallery'
import {
  AI_ACTIVE,
  cancelAi,
  checkAi,
  dismissAi,
  gen,
  generate,
  newIdea,
  patchLook,
  patchSpec,
  patchViewer,
  randomiseLook,
  refineAi,
  regenerate,
  resetLook,
  retryAi,
  setEnhance,
  setLanguage,
  setMode,
  setPrompt,
  setStyle,
  shownModel,
  showModel,
  suggestIdea,
  toggleAccessory,
  type Mode,
} from './genStore'
import { genText } from './genText'
import styles from './GenerativeObjects.module.scss'
import { EXAMPLES } from './ideas'
import { MAX_PROMPT } from './interpret'
import { keepCreation, openCreation } from './keep'
import { BACKGROUND_NAMES, CAMERA_NAMES, LIGHT_NAMES, POSE_NAMES, STYLE_NAMES, ACCESSORY_TERMS } from './lexicon'
import type { SceneApi } from './GenScene'
import {
  ACCESSORIES,
  BACKGROUNDS,
  BUILDS,
  CAMERAS,
  LIGHTS,
  MATERIALS,
  MOODS,
  POSES,
  SCALE_RANGE,
  STYLES,
  type StyleId,
} from './spec'
import { understoodName } from './understood'
import { VoiceInput } from './VoiceInput'
import { stopListening } from './voice'

// The scene (Three.js, the parts, the shaders) loads after the page's words and controls are up.
const GenScene = lazy(() => import('./GenScene'))

const CAMERA = { fov: 38, position: [0, 3.5, 9] as [number, number, number], near: 0.1, far: 200 }
/** After this long a wait is said to be longer than usual. The engine itself is given an hour. */
const SLOW_MS = 3 * 60_000
const HEAVY_TRIANGLES = 400_000

/** The scene's api, waiting a moment if the stage is just being rebuilt (a lowered graphics quality restarts it). */
async function sceneOf(api: RefObject<SceneApi | null>): Promise<SceneApi | null> {
  for (let i = 0; i < 40; i++) {
    if (api.current) return api.current
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const formatTime = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`
const formatBytes = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** The time, ticking once a second, only while something is being waited for. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

type Tab = 'understood' | 'prompt' | 'look' | 'parts' | 'gallery' | 'export'

// ── The composer ────────────────────────────────────────────────────────────

function EngineLine() {
  const t = useLocalized(genText)
  const status = useStore(gen, (state) => state.ai.status)
  const enhance = useStore(gen, (state) => state.enhance)
  const id = useId()
  if (!status) return <p className={styles.engineLine}>{t.composer.engineChecking}</p>
  if (!status.available) {
    return (
      <p className={cx(styles.engineLine, styles.engineDown)} data-engine="down">
        {t.composer.engineMissing}
      </p>
    )
  }
  return (
    <div className={styles.aiOptions}>
      <p className={styles.engineLine} data-engine={status.simulated ? 'test' : 'up'}>
        <strong>{fill(t.composer.engine, { name: status.provider ?? 'AI' })}</strong>
        {status.simulated ? ` · ${t.composer.engineStandIn}` : ''}
        {status.remaining > 0 && !status.simulated ? ` · ${fill(t.composer.remaining, { n: status.remaining })}` : ''}
      </p>
      {status.enhancement ? (
        <label className={styles.check} htmlFor={`${id}-enhance`}>
          <input id={`${id}-enhance`} type="checkbox" checked={enhance} onChange={(event) => setEnhance(event.currentTarget.checked)} />
          <span>
            {t.composer.enhance}
            <small>{t.composer.enhanceHelp}</small>
          </span>
        </label>
      ) : (
        <p className={styles.engineLine}>{t.composer.enhanceOff}</p>
      )}
    </div>
  )
}

function Composer({ promptRef }: { promptRef: RefObject<HTMLTextAreaElement | null> }) {
  const t = useLocalized(genText)
  const { lang } = useLabText()
  const id = useId()
  const prompt = useStore(gen, (state) => state.prompt)
  const mode = useStore(gen, (state) => state.mode)
  const style = useStore(gen, (state) => state.style)
  const hasCurrent = useStore(gen, (state) => state.current !== null)
  const busy = useStore(gen, (state) => AI_ACTIVE.includes(state.ai.phase))
  const maxPrompt = useStore(gen, (state) => (state.mode === 'ai' ? Math.min(MAX_PROMPT, state.ai.status?.maxPrompt || MAX_PROMPT) : MAX_PROMPT))

  const choose = (next: Mode) => {
    setMode(next)
    if (next === 'ai') void checkAi()
  }
  const submit = () => {
    stopListening()
    generate()
  }
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form
      className={styles.composer}
      data-mode={mode}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className={styles.modes} role="group" aria-label={t.composer.modeLabel}>
        {(['ai', 'quick'] as const).map((value) => (
          <button key={value} type="button" className={styles.modeCard} data-mode={value} aria-pressed={mode === value} title={value === 'ai' ? t.composer.aiHelp : t.composer.quickHelp} onClick={() => choose(value)}>
            <strong>{t.composer[value]}</strong>
            <span>{t.composer[value === 'ai' ? 'aiTag' : 'quickTag']}</span>
          </button>
        ))}
      </div>

      <div className={styles.promptRow}>
        <div className={styles.promptField}>
          <label htmlFor={`${id}-prompt`} className={styles.promptLabel}>
            {t.composer.label}
          </label>
          <textarea
            ref={promptRef}
            id={`${id}-prompt`}
            className={styles.prompt}
            rows={2}
            maxLength={maxPrompt}
            value={prompt}
            placeholder={t.composer.placeholder}
            aria-describedby={`${id}-help`}
            spellCheck={false}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            onKeyDown={onKey}
          />
          <p id={`${id}-help`} className={styles.promptHelp}>
            <span>{t.composer.help}</span>
            <span aria-hidden="true">{fill(t.composer.counter, { n: prompt.length, max: maxPrompt })}</span>
          </p>
          <VoiceInput value={prompt} max={maxPrompt} disabled={busy} onText={setPrompt} />
        </div>
        <div className={styles.actions}>
          <button type="submit" className={cx(styles.button, styles.primary)} disabled={busy}>
            {mode === 'ai' ? t.composer.generateAi : t.composer.generateQuick}
          </button>
          <button type="button" className={styles.button} onClick={() => (mode === 'ai' ? suggestIdea(lang) : newIdea(lang))} disabled={busy}>
            <span aria-hidden="true">🎲 </span>
            {t.composer.random}
          </button>
          <button type="button" className={cx(styles.button, styles.ghost)} onClick={() => regenerate()} disabled={!hasCurrent || busy} title={mode === 'ai' ? t.composer.regenerateAiHelp : undefined}>
            {mode === 'ai' ? t.composer.regenerateAi : t.composer.regenerate}
          </button>
        </div>
      </div>

      <div className={styles.optionRow}>
        {mode === 'ai' ? (
          <EngineLine />
        ) : (
          <>
            <p className={styles.modeHelp}>{t.composer.quickHelp}</p>
            <div className={styles.chips} role="group" aria-label={t.composer.stylesLabel}>
              <button type="button" aria-pressed={style === null} onClick={() => setStyle(null)}>
                {t.composer.anyStyle}
              </button>
              {STYLES.map((value: StyleId) => (
                <button key={value} type="button" aria-pressed={style === value} onClick={() => setStyle(value)}>
                  {STYLE_NAMES[value][lang]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </form>
  )
}

// ── The stage's overlay ─────────────────────────────────────────────────────

function ExampleChips({ onPick }: { onPick(text: string): void }) {
  const { lang } = useLabText()
  return (
    <ul className={styles.examples}>
      {EXAMPLES.map((example) => (
        <li key={example.en}>
          <button type="button" onClick={() => onPick(example[lang])}>
            {example[lang]}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Picks an example: in Quick mode it is built at once; in AI mode it is only written in the box, because making a model costs the engine's allowance. */
const pickExample = (text: string) => (gen.get().mode === 'ai' ? setPrompt(text) : generate(text))

const OWNER_PROBLEMS: readonly AiFailure[] = ['not-configured', 'no-key', 'no-server']
/** Trying the same words again changes nothing for these: the words, the account or the server must change first. */
const NO_RETRY: readonly AiFailure[] = [...OWNER_PROBLEMS, 'moderation', 'invalid', 'rejected', 'auth', 'credits', 'budget', 'gone']

/** What is happening with the engine, in its own words: the state name, what it means, what is really known. */
function StatusCard({ docked }: { docked: boolean }) {
  const t = useLocalized(genText)
  const ai = useStore(gen, (state) => state.ai)
  const loading = ai.phase === 'completed' && ai.load === 'loading'
  const active = AI_ACTIVE.includes(ai.phase)
  const now = useNow(active)
  if (!active && !loading) return null
  const name = loading ? t.status.names.processing : t.status.names[ai.phase]
  const text = loading ? t.status.descriptions.loading : t.status.descriptions[ai.phase as 'checking' | 'preparing' | 'queued' | 'geometry' | 'textures' | 'processing']
  const waited = ai.since ? Math.max(0, now - ai.since) : 0
  const real = ai.progress !== null
  const bytes = ai.bytes
  return (
    <div className={styles.progress} role="status" aria-live="polite" data-docked={docked} data-phase={loading ? 'processing' : ai.phase}>
      <p className={styles.phaseName}>{name}</p>
      <p>{text}</p>
      {ai.phase === 'queued' && ai.ahead ? <p className={styles.fine}>{fill(t.status.ahead, { n: ai.ahead })}</p> : null}
      {/* A bar only when the engine really reports progress; otherwise a plain moving one, which claims nothing. */}
      <span className={styles.bar} aria-hidden="true" data-indeterminate={!real}>
        <span style={real ? { width: `${Math.max(2, Math.round((ai.progress ?? 0) * 100))}%` } : undefined} />
      </span>
      {real && <p className={styles.fine}>{fill(t.status.reported, { percent: `${Math.round((ai.progress ?? 0) * 100)}%` })}</p>}
      {ai.phase === 'processing' && bytes && bytes.loaded > 0 && (
        <p className={styles.fine}>{bytes.total > 0 ? fill(t.status.received, { loaded: formatBytes(bytes.loaded), total: formatBytes(bytes.total) }) : fill(t.status.receivedUnknown, { loaded: formatBytes(bytes.loaded) })}</p>
      )}
      {active && waited >= 4000 && <p className={styles.fine}>{fill(t.status.waited, { time: formatTime(waited) })}</p>}
      {active && waited >= SLOW_MS && ai.phase !== 'processing' && <p className={cx(styles.fine, styles.slow)}>{t.status.slow}</p>}
      {active && ai.phase !== 'checking' && (
        <button type="button" onClick={() => cancelAi()}>
          {t.status.cancel}
        </button>
      )}
    </div>
  )
}

/** A failure, a cancellation or an unavailable engine: said plainly, with what can be done. Nothing is put in its place. */
function ProblemCard({ promptRef }: { promptRef: RefObject<HTMLTextAreaElement | null> }) {
  const t = useLocalized(genText)
  const ai = useStore(gen, (state) => state.ai)
  const hasModel = useStore(gen, (state) => shownModel(state) !== null)
  const loadFailed = useStore(gen, (state) => state.current?.source === 'ai' && state.ai.phase === 'completed' && state.ai.load === 'error')
  const phase = loadFailed ? 'failed' : ai.phase
  if (phase !== 'failed' && phase !== 'cancelled' && phase !== 'unavailable') return null
  const code: AiFailure = loadFailed ? 'load' : (ai.code ?? (phase === 'cancelled' ? 'cancelled' : 'service'))
  const retryable = phase === 'failed' && !NO_RETRY.includes(code) && (ai.job ? ai.job.canRetry || code === 'network' || code === 'upstream' : !!ai.text)
  return (
    <div className={styles.problem} role="alert" data-phase={phase} data-code={code}>
      <p className={styles.phaseName}>{t.status.names[phase]}</p>
      <p>{phase === 'cancelled' ? (ai.stopped === 'running-on' ? t.status.runningOn : t.status.stopped) : t.status.failed[code]}</p>
      {ai.working === 'refine' && hasModel && phase !== 'unavailable' && <p className={styles.fine}>{t.geometry.refineFailed}</p>}
      {!hasModel && <p className={styles.fine}>{t.status.nothingSubstituted}</p>}
      <div className={styles.buttonRow}>
        {(retryable || phase === 'cancelled') && ai.text && !NO_RETRY.includes(code) && (
          <button type="button" className={styles.primary} onClick={() => void retryAi()}>
            {t.status.retry}
          </button>
        )}
        {phase !== 'unavailable' && (
          <button type="button" onClick={() => promptRef.current?.focus()}>
            {t.status.edit}
          </button>
        )}
        {OWNER_PROBLEMS.includes(code) && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              dismissAi()
              setMode('quick')
            }}
          >
            {t.status.useQuick}
          </button>
        )}
        <button type="button" onClick={() => dismissAi()}>
          {t.status.dismiss}
        </button>
      </div>
    </div>
  )
}

/** The geometry is on stage: look at it, then decide about the textures. */
function GeometryCard() {
  const t = useLocalized(genText)
  const ai = useStore(gen, (state) => state.ai)
  const source = useStore(gen, (state) => state.current?.source)
  const [kept, setKept] = useState<number | null>(null)
  const job = ai.job
  const ready = source === 'ai' && ai.phase === 'completed' && ai.showing === 'preview' && ai.load === 'ready'
  if (!ready || !job || kept === job.createdAt) return null
  if (!job.canRefine) {
    return job.final === null || job.final.status === 'failed' ? (
      <p className={styles.geometryNote} data-geometry="no-refine">
        {t.geometry.unavailable}
      </p>
    ) : null
  }
  return (
    <div className={styles.geometry} role="group" aria-label={t.geometry.title} data-geometry="offer">
      <p className={styles.phaseName}>{t.geometry.title}</p>
      <p>
        <span className={styles.long}>{t.geometry.text}</span>
        <span className={styles.short}>{t.geometry.short}</span>
      </p>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.primary} onClick={() => void refineAi()}>
          {t.geometry.refine}
        </button>
        <button type="button" onClick={() => setKept(job.createdAt)}>
          {t.geometry.keep}
        </button>
      </div>
    </div>
  )
}

interface FullscreenControl {
  on: boolean
  toggle(): void
}

function StageOverlay({ api, touch, wide, full }: { api: RefObject<SceneApi | null>; touch: boolean; wide: boolean; full: FullscreenControl }) {
  const t = useLocalized(genText)
  const { lang } = useLabText()
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const current = useStore(gen, (state) => state.current)
  const stats = useStore(gen, (state) => state.stats)
  const ai = useStore(gen, (state) => state.ai)
  const viewer = useStore(gen, (state) => state.viewer)
  const mode = useStore(gen, (state) => state.mode)
  const look = current?.look
  const hasModel = useStore(gen, (state) => shownModel(state) !== null)
  const working = AI_ACTIVE.includes(ai.phase) || (ai.phase === 'completed' && ai.load === 'loading')
  const problem = ai.phase === 'failed' || ai.phase === 'cancelled' || ai.phase === 'unavailable' || (current?.source === 'ai' && ai.phase === 'completed' && ai.load === 'error')

  const badge = !current
    ? null
    : current.source === 'quick'
      ? t.stage.quickBadge
      : current.ai.simulated
        ? fill(t.stage.standInBadge, { stage: ai.showing === 'final' ? t.stage.stageFinal : t.stage.stageGeometry })
        : fill(ai.showing === 'final' ? t.stage.finalBadge : t.stage.geometryBadge, { provider: current.ai.provider })

  const screenshot = async () => {
    const url = await (await sceneOf(api))?.capture('full')
    if (url) downloadBlob(await (await fetch(url)).blob(), safeFilename(current?.title ?? 'creation', 'png'))
  }
  const both = ai.models.preview !== null && ai.models.final !== null
  const showEmpty = !current && !working && !problem
  const sizeText = current?.source === 'ai' ? formatBytes(current.ai.bytes) : ''

  return (
    <>
      {badge && (
        <p className={styles.badge} data-source={current?.source === 'ai' ? 'ai' : 'quick'} data-simulated={current?.source === 'ai' && current.ai.simulated}>
          {badge}
        </p>
      )}
      {both && (
        <div className={styles.compare} role="group" aria-label={t.stage.compare}>
          <button type="button" aria-pressed={ai.showing === 'preview'} onClick={() => showModel('preview')}>
            {t.stage.showGeometry}
          </button>
          <button type="button" aria-pressed={ai.showing === 'final'} onClick={() => showModel('final')}>
            {t.stage.showTextured}
          </button>
        </div>
      )}

      {current && (
        <div className={styles.stageTools} role="toolbar" aria-label={t.stage.toolbar}>
          <button type="button" aria-pressed={look?.spin} className={styles.iconButton} onClick={() => patchLook({ spin: !look?.spin })} title={t.stage.turnHelp}>
            <Glyph>
              <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
            </Glyph>
            <span className="visually-hidden">{t.stage.turn}</span>
          </button>
          <button type="button" className={styles.iconButton} onClick={() => void sceneOf(api).then((scene) => scene?.resetView())} title={t.stage.resetView}>
            <Glyph>
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
            </Glyph>
            <span className="visually-hidden">{t.stage.resetView}</span>
          </button>
          <button type="button" aria-pressed={viewer.pan} className={styles.iconButton} onClick={() => patchViewer({ pan: !viewer.pan })} title={t.stage.panHelp}>
            <Glyph>
              <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
            </Glyph>
            <span className="visually-hidden">{t.stage.pan}</span>
          </button>
          <button type="button" aria-pressed={viewer.grid} className={styles.iconButton} onClick={() => patchViewer({ grid: !viewer.grid })} title={t.stage.grid}>
            <Glyph>
              <path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
            </Glyph>
            <span className="visually-hidden">{t.stage.grid}</span>
          </button>
          <button type="button" aria-pressed={full.on} className={styles.iconButton} onClick={full.toggle} title={full.on ? t.stage.exitFullscreen : t.stage.fullscreen}>
            <Glyph>{full.on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</Glyph>
            <span className="visually-hidden">{full.on ? t.stage.exitFullscreen : t.stage.fullscreen}</span>
          </button>
          <button type="button" className={styles.iconButton} onClick={() => void screenshot()} title={t.export.png}>
            <Glyph>
              <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            </Glyph>
            <span className="visually-hidden">{t.export.png}</span>
          </button>
        </div>
      )}

      {showEmpty && (
        <div className={styles.empty}>
          <h2>{mode === 'ai' ? t.stage.emptyTitleAi : t.stage.emptyTitleQuick}</h2>
          <p>{mode === 'ai' ? t.stage.emptyTextAi : t.stage.emptyTextQuick}</p>
          {mode === 'ai' && (
            <p className={styles.stateWord} data-state="ready">
              {t.status.names.idle}
            </p>
          )}
          <ExampleChips onPick={pickExample} />
        </div>
      )}

      {!hasModel && <StatusCard docked={false} />}
      <ProblemCard promptRef={promptRef} />
      {current?.source === 'ai' && ai.missing && (
        <p className={styles.unavailable} role="status">
          {t.stage.modelMissing}
        </p>
      )}

      {current && (
        <div className={styles.stageBottom}>
          {hasModel && <StatusCard docked />}
          <GeometryCard />
          <div className={styles.chips} role="group" aria-label={t.stage.cameraGroup}>
            {CAMERAS.map((angle) => (
              <button key={angle} type="button" aria-pressed={look?.camera === angle} onClick={() => patchLook({ camera: angle })}>
                {CAMERA_NAMES[angle][lang]}
              </button>
            ))}
          </div>
          {stats && stats.triangles > HEAVY_TRIANGLES && current.source === 'ai' && <p className={cx(styles.stats, styles.slow)}>{fill(t.stage.heavy, { triangles: stats.triangles.toLocaleString(lang) })}</p>}
          {stats && wide && (
            <p className={styles.stats}>
              {current.source === 'ai'
                ? fill(t.stage.statsModel, { triangles: stats.triangles.toLocaleString(lang), textures: stats.textures ?? 0, size: sizeText })
                : fill(t.stage.stats, { parts: stats.parts, triangles: stats.triangles.toLocaleString(lang), ms: stats.ms })}
            </p>
          )}
          {!touch && wide && <p className={styles.keys}>{t.keys}</p>}
        </div>
      )}
    </>
  )
}

// ── Panels ──────────────────────────────────────────────────────────────────

function Chips<T extends string>({ label, values, value, name, onPick }: { label: string; values: readonly T[]; value: T | null | undefined; name: (id: T) => string; onPick(id: T): void }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.chips} role="group" aria-label={label}>
        {values.map((id) => (
          <button key={id} type="button" aria-pressed={value === id} onClick={() => onPick(id)}>
            {name(id)}
          </button>
        ))}
      </div>
    </div>
  )
}

function UnderstoodPanel() {
  const t = useLocalized(genText)
  const { lang } = useLabText()
  const current = useStore(gen, (state) => state.current)
  if (current?.source !== 'quick') return <p className={styles.note}>{t.understood.none}</p>
  const { interpretation } = current
  return (
    <div className={styles.panelStack}>
      {!interpretation.recognised && <p className={cx(styles.note, styles.warn)}>{t.understood.mystery}</p>}
      <ul className={styles.understood} aria-label={t.understood.title}>
        {interpretation.understood.map((item) => (
          <li key={`${item.role}-${item.id}`}>
            <span className={styles.role}>{t.understood.roles[item.role]}</span>
            <strong>{cap(understoodName(item, lang))}</strong>
            {item.word && <em>“{item.word}”</em>}
          </li>
        ))}
      </ul>
      {interpretation.unknown.length > 0 && <p className={styles.note}>{fill(t.understood.unknown, { words: interpretation.unknown.join(', ') })}</p>}
      {interpretation.ignored.length > 0 && <p className={styles.note}>{fill(t.understood.ignored, { words: interpretation.ignored.join(', ') })}</p>}
    </div>
  )
}

/** The path of an AI creation: the visitor's words, what the engine was sent, who made it, and which step is showing. */
function PromptPanel() {
  const t = useLocalized(genText)
  const { lang } = useLabText()
  const current = useStore(gen, (state) => state.current)
  const ai = useStore(gen, (state) => state.ai)
  const meta = current?.source === 'ai' ? current.ai : null
  const job = ai.job
  const yours = job?.prompt || current?.prompt || ''
  const sent = job?.prepared || meta?.prepared || ''
  if (!yours) return <p className={styles.note}>{t.prompt.nothing}</p>
  const enhanced = job ? job.enhanced : (meta?.enhanced ?? false)
  const tasks = meta?.tasks ?? job?.tasks
  const provider = meta?.provider ?? ai.status?.provider ?? 'AI'
  const simulated = meta?.simulated ?? job?.simulated ?? false
  return (
    <div className={styles.panelStack}>
      <dl className={styles.facts}>
        <dt>{t.prompt.yours}</dt>
        <dd>“{yours}”</dd>
        <dt>{t.prompt.sent}</dt>
        <dd>
          <q className={styles.sent}>{sent || yours}</q>
          <small>{enhanced ? t.prompt.howRewritten : t.prompt.howAsTyped}</small>
        </dd>
        <dt>{t.prompt.engine}</dt>
        <dd>
          {provider}
          {simulated && <small>{t.prompt.standIn}</small>}
        </dd>
        {meta && (
          <>
            <dt>{t.prompt.step}</dt>
            <dd>{ai.showing === 'final' ? t.stage.stageFinal : t.stage.stageGeometry}</dd>
            <dt>{t.prompt.file}</dt>
            <dd>
              GLB · {formatBytes(meta.bytes)}
              {ai.models.preview && ai.models.final ? ` · ${t.stage.showGeometry} / ${t.stage.showTextured}` : ''}
            </dd>
            <dt>{t.prompt.when}</dt>
            <dd>{meta.createdAt ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(meta.createdAt)) : '—'}</dd>
          </>
        )}
        {tasks && (tasks.preview || tasks.final) && (
          <>
            <dt>{t.prompt.tasks}</dt>
            <dd className={styles.mono}>
              {[tasks.preview, tasks.final].filter(Boolean).join(' → ')}
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}

function LookPanel() {
  const t = useLocalized(genText)
  const { lang } = useLabText()
  const current = useStore(gen, (state) => state.current)
  const viewer = useStore(gen, (state) => state.viewer)
  const look = current?.look
  if (!current || !look) return <p className={styles.note}>{t.export.nothing}</p>
  const isAi = current.source === 'ai'
  return (
    <div className={styles.panelStack}>
      {isAi && <p className={cx(styles.note, styles.warn)}>{t.look.viewerOnly}</p>}
      {!isAi && (
        <>
          <Chips label={t.look.material} values={MATERIALS} value={look.material} name={(id) => t.look.materials[id]} onPick={(material) => patchLook({ material })} />
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="gen-colour">
              {t.look.colour}
            </label>
            <div className={styles.colourRow}>
              <input id="gen-colour" type="color" value={look.colour ?? '#e0202c'} onChange={(event) => patchLook({ colour: event.currentTarget.value })} />
              <button type="button" aria-pressed={look.colour === null} onClick={() => patchLook({ colour: null })}>
                {t.look.natural}
              </button>
            </div>
          </div>
        </>
      )}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t.look.scale} <output>{Math.round(look.scale * 100)}%</output>
        </span>
        <input type="range" min={SCALE_RANGE.min} max={SCALE_RANGE.max} step={0.05} value={look.scale} onChange={(event) => patchLook({ scale: Number(event.currentTarget.value) })} />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t.look.rotation} <output>{look.rotation}°</output>
        </span>
        <input type="range" min={0} max={359} step={1} value={look.rotation} onChange={(event) => patchLook({ rotation: Number(event.currentTarget.value) })} />
      </label>
      <Chips label={t.look.lighting} values={LIGHTS} value={look.lighting} name={(id) => LIGHT_NAMES[id][lang]} onPick={(lighting) => patchLook({ lighting })} />
      <Chips label={t.look.background} values={BACKGROUNDS} value={look.background} name={(id) => BACKGROUND_NAMES[id][lang]} onPick={(background) => patchLook({ background })} />
      <Chips label={t.look.camera} values={CAMERAS} value={look.camera} name={(id) => CAMERA_NAMES[id][lang]} onPick={(camera) => patchLook({ camera })} />
      {isAi && (
        <>
          <Chips label={t.look.shading} values={['natural', 'clay', 'wireframe'] as const} value={viewer.shading} name={(id) => t.look.shadings[id]} onPick={(shading) => patchViewer({ shading })} />
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              {t.look.reflections} <output>{Math.round(viewer.reflections * 100)}%</output>
            </span>
            <input type="range" min={0} max={2} step={0.05} value={viewer.reflections} onChange={(event) => patchViewer({ reflections: Number(event.currentTarget.value) })} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              {t.look.exposure} <output>{Math.round(viewer.exposure * 100)}%</output>
            </span>
            <input type="range" min={0.4} max={2} step={0.05} value={viewer.exposure} onChange={(event) => patchViewer({ exposure: Number(event.currentTarget.value) })} />
          </label>
          <Chips label={t.look.grid} values={['on', 'off'] as const} value={viewer.grid ? 'on' : 'off'} name={(id) => (id === 'on' ? t.look.gridOn : t.look.gridOff)} onPick={(id) => patchViewer({ grid: id === 'on' })} />
        </>
      )}
      <div className={styles.buttonRow}>
        {!isAi && (
          <button type="button" className={styles.button} onClick={() => randomiseLook()}>
            {t.look.randomise}
          </button>
        )}
        <button type="button" className={styles.button} onClick={() => resetLook()}>
          {t.look.reset}
        </button>
      </div>
    </div>
  )
}

function PartsPanel() {
  const t = useLocalized(genText)
  const { lang } = useLabText()
  const current = useStore(gen, (state) => state.current)
  if (current?.source !== 'quick') return <ExampleChips onPick={pickExample} />
  const { spec } = current
  return (
    <div className={styles.panelStack}>
      <Chips label={t.parts.mood} values={MOODS} value={spec.mood} name={(id) => t.parts.moods[id]} onPick={(mood) => patchSpec({ mood })} />
      <Chips label={t.parts.pose} values={POSES} value={spec.pose} name={(id) => POSE_NAMES[id][lang]} onPick={(pose) => patchSpec({ pose })} />
      <Chips label={t.parts.build} values={BUILDS} value={spec.build} name={(id) => t.parts.builds[id]} onPick={(build) => patchSpec({ build })} />
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t.parts.accessories}</span>
        <div className={styles.chips} role="group" aria-label={t.parts.accessories}>
          {ACCESSORIES.map((id) => (
            <button key={id} type="button" aria-pressed={spec.accessories.includes(id)} onClick={() => toggleAccessory(id)}>
              {cap(ACCESSORY_TERMS[id].names[lang])}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.note}>
        {fill(t.parts.seed, { seed: current.seed })} · {t.parts.seedHelp}
      </p>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t.composer.tryTitle}</span>
        <ExampleChips onPick={pickExample} />
      </div>
    </div>
  )
}

function ExportPanel({ api, onSaved }: { api: RefObject<SceneApi | null>; onSaved(): void }) {
  const t = useLocalized(genText)
  const a = useLocalized(artifactText)
  const current = useStore(gen, (state) => state.current)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const nameId = useId()
  if (!current) return <p className={styles.note}>{t.export.nothing}</p>
  const title = name.trim() || current.title

  const save = async () => {
    const thumbnail = (await (await sceneOf(api))?.capture('thumb')) ?? undefined
    const state = gen.get()
    const result = await keepCreation({ current, title, stage: state.ai.showing, model: shownModel(state), thumbnail })
    if (!result.ok) return setMessage(a.failed[result.reason])
    if (current.source === 'ai' && !result.modelKept) setMessage(t.export.savedNoModel)
    else setMessage(result.persistent ? t.export.saved : t.export.savedSession)
    onSaved()
  }

  const png = async () => {
    const url = await (await sceneOf(api))?.capture('full')
    if (!url) return setMessage(t.export.pngFailed)
    downloadBlob(await (await fetch(url)).blob(), safeFilename(title, 'png'))
    setMessage(t.notices.png)
  }

  const glb = async () => {
    try {
      const buffer = await (await sceneOf(api))?.exportGlb()
      if (!buffer) return setMessage(t.export.glbFailed)
      downloadBlob(new Blob([buffer], { type: 'model/gltf-binary' }), safeFilename(title, 'glb'))
      setMessage(t.notices.glb)
    } catch {
      setMessage(t.export.glbFailed)
    }
  }

  const description = (): Creation =>
    current.source === 'ai'
      ? { version: 2, prompt: current.prompt, title, source: 'ai', spec: null, seed: 0, look: current.look, ai: { ...current.ai, model: null } }
      : { version: 2, prompt: current.prompt, title, source: 'quick', spec: current.spec, seed: current.seed, look: current.look, ai: null }

  return (
    <div className={styles.panelStack}>
      <label className={styles.field} htmlFor={nameId}>
        <span className={styles.fieldLabel}>{t.export.name}</span>
        <input id={nameId} className={styles.textInput} value={name} maxLength={60} placeholder={current.title} onChange={(event) => setName(event.currentTarget.value)} />
      </label>
      <div className={styles.buttonRow}>
        <button type="button" className={cx(styles.button, styles.primary)} onClick={() => void save()}>
          {t.export.save}
        </button>
        <button type="button" className={styles.button} onClick={() => void png()}>
          {t.export.png}
        </button>
        <button type="button" className={styles.button} onClick={() => void glb()}>
          {t.export.glb}
        </button>
        <button type="button" className={styles.button} onClick={() => downloadJson(creationPayload(description()), safeFilename(title, 'json'))}>
          {t.export.json}
        </button>
      </div>
      <p className={styles.note}>{t.export.glbNote}</p>
      <Toast message={message} />
    </div>
  )
}

// ── The page ────────────────────────────────────────────────────────────────

/** Full screen for the stage: the browser's own where it has one, otherwise the stage fills the window. */
function useFullscreen(target: RefObject<HTMLElement | null>): FullscreenControl & { expanded: boolean } {
  const [native, setNative] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement !== null && document.fullscreenElement === target.current)
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('keydown', onKey)
    }
  }, [target])
  const toggle = useCallback(() => {
    const element = target.current
    if (!element) return
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => undefined)
    if (expanded) return setExpanded(false)
    if (document.fullscreenEnabled && element.requestFullscreen) {
      element.requestFullscreen().catch(() => setExpanded(true))
    } else {
      // iPhones have no full screen for an element: the stage fills the window instead.
      setExpanded(true)
    }
  }, [target, expanded])
  return { on: native || expanded, expanded, toggle }
}

function Workbench() {
  const t = useLocalized(genText)
  const { experiments, lang } = useLabText()
  const wide = useMedia('(min-width: 64rem)')
  // A phone lying down has room beside the stage for the panel to stay open.
  const short = useMedia('(orientation: landscape) and (max-height: 32rem)')
  const touch = useMedia('(pointer: coarse)')
  const api = useRef<SceneApi | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const [tab, setTab] = useState<Tab | null>(null)
  const [savedVersion, setSavedVersion] = useState(0)
  const [params, setParams] = useSearchParams()
  const notice = useStore(gen, (state) => state.notice)
  const hasCurrent = useStore(gen, (state) => state.current !== null)
  const kind = useStore(gen, (state) => state.current?.source ?? state.mode)
  const started = useRef(false)
  const full = useFullscreen(viewport)

  useEffect(() => {
    setLanguage(lang)
  }, [lang])

  // A creation opened from the gallery on the Lab page, or words in the address (?q=…), start the page.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void checkAi()
    const handed = creationHandoff.peek()
    if (handed) {
      void openCreation(handed)
      return
    }
    const words = params.get('q')
    if (words) {
      // In AI mode the words only fill the box: a link must not start a model that costs the engine's allowance.
      if (gen.get().mode === 'ai') setPrompt(words)
      else generate(words)
      setParams((previous) => {
        const next = new URLSearchParams(previous)
        next.delete('q')
        return next
      }, { replace: true })
    }
    // Only once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    creationHandoff.clear()
  }, [])
  // The microphone is never left on when the page goes. A creation in progress is NOT stopped by leaving (or by the
  // stage being rebuilt when the graphics quality drops): its state lives in the store, so coming back shows it.
  useEffect(() => () => stopListening(), [])

  const open = useCallback((creation: Creation) => {
    void openCreation(creation)
    setTab(creation.source === 'ai' ? 'prompt' : 'understood')
  }, [])

  const tabs =
    kind === 'ai'
      ? [
          { id: 'prompt' as const, label: t.tabs.prompt },
          { id: 'look' as const, label: t.tabs.viewer },
          { id: 'gallery' as const, label: t.tabs.gallery },
          { id: 'export' as const, label: t.tabs.export },
        ]
      : [
          { id: 'understood' as const, label: t.tabs.understood },
          { id: 'look' as const, label: t.tabs.look },
          { id: 'parts' as const, label: t.tabs.parts },
          { id: 'gallery' as const, label: t.tabs.gallery },
          { id: 'export' as const, label: t.tabs.export },
        ]
  const first: Tab = kind === 'ai' ? 'prompt' : 'understood'
  const wanted: Tab = tab ?? first
  const active: Tab = tabs.some((item) => item.id === wanted) ? wanted : first
  const body = (which: Tab) =>
    which === 'understood' ? (
      <UnderstoodPanel />
    ) : which === 'prompt' ? (
      <PromptPanel />
    ) : which === 'look' ? (
      <LookPanel />
    ) : which === 'parts' ? (
      <PartsPanel />
    ) : which === 'gallery' ? (
      <Gallery version={savedVersion} onOpen={open} />
    ) : (
      <ExportPanel api={api} onSaved={() => setSavedVersion((value) => value + 1)} />
    )

  return (
    <div className={styles.workbench} data-wide={wide} data-has={hasCurrent} data-dock={!wide && !short && tab ? 'open' : 'closed'} data-kind={kind}>
      <Composer promptRef={promptRef} />
      <div className={styles.main}>
        <div ref={viewport} className={styles.viewport} data-expanded={full.expanded}>
          <ExperienceStage
            label={experiments['generative-objects'].stageLabel}
            camera={CAMERA}
            antialias
            maxDpr={2}
            overlay={<StageOverlay api={api} touch={touch} wide={wide} full={full} />}
          >
            <GenScene apiRef={api} />
          </ExperienceStage>
        </div>

        {wide ? (
          <aside className={styles.side} aria-label={t.tabs.label}>
            <TabBar label={t.tabs.label} tabs={tabs} value={active} onChange={setTab} className={styles.sideTabs} />
            <div className={styles.sideBody} role="tabpanel">
              {body(active)}
            </div>
          </aside>
        ) : (
          <div className={styles.dock} data-open={tab !== null || short}>
            <TabBar label={t.tabs.label} tabs={tabs} value={active} onChange={(id) => setTab((current) => (current === id && !short ? null : id))} className={styles.dockTabs} />
            {(tab ?? (short ? first : null)) && (
              <div className={styles.dockBody} role="tabpanel">
                {body(active)}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {notice ? t.notices[notice.code] : ''}
      </p>
    </div>
  )
}

/** Generative Objects: describe something, get a real 3D model made by an AI engine (or a quick procedural one). */
export default function GenerativeObjects() {
  return (
    <ExperienceFrame id="generative-objects">
      <Workbench />
    </ExperienceFrame>
  )
}
