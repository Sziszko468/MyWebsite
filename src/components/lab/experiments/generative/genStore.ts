import { createStore } from '../../experience/store'
import {
  AiError,
  createJob,
  fetchModel,
  fetchStatus,
  followJob,
  getJob,
  jobAction,
  type AiFailure,
  type AiOptions,
  type AiStatus,
  type JobView,
  type ModelProgress,
} from './aiClient'
import type { AiMeta, Creation } from './creation'
import { createRandom, randomIdea } from './ideas'
import { interpret, MAX_PROMPT, seedFromText, type Interpretation } from './interpret'
import type { Lang } from './lexicon'
import {
  ACCESSORIES,
  BACKGROUNDS,
  DEFAULT_LOOK,
  LIGHTS,
  MATERIALS,
  SCALE_RANGE,
  sanitizeLook,
  type AccessoryId,
  type Look,
  type ObjectSpec,
  type StyleId,
} from './spec'

/**
 * The state of the generator: one place the composer, the stage and the panels all read.
 *
 * Two kinds of creation, never mixed up. A QUICK creation is built in the browser from a closed
 * vocabulary (procedural, not AI). An AI creation is a real model made by a text-to-3D engine through
 * this site's server: first the untextured geometry, then, only when the visitor asks, the textures.
 * Nothing of the Quick kind is ever put on the stage in place of an AI model that is still coming, has
 * failed or is not available: the stage stays empty and says what is happening.
 */
export type Mode = 'quick' | 'ai'

interface CurrentBase {
  prompt: string
  title: string
  /** How it is shown. For an AI model this is presentation only: the model file is never changed. */
  look: Look
  /** The look to go back to with Reset. */
  baseLook: Look
  /** Changes whenever the object must be built (or loaded) again. */
  build: number
}

export interface QuickCurrent extends CurrentBase {
  source: 'quick'
  spec: ObjectSpec
  seed: number
  interpretation: Interpretation
}

export interface AiCurrent extends CurrentBase {
  source: 'ai'
  ai: AiMeta
}

export type Current = QuickCurrent | AiCurrent

/** The wording of each state is in genText: READY, PREPARING PROMPT, GENERATION QUEUED, … */
export type AiPhase = 'idle' | 'checking' | 'unavailable' | 'preparing' | 'queued' | 'geometry' | 'textures' | 'processing' | 'completed' | 'failed' | 'cancelled'

export const AI_ACTIVE: readonly AiPhase[] = ['checking', 'preparing', 'queued', 'geometry', 'textures', 'processing']

export interface AiState {
  phase: AiPhase
  /** The step being made, or last attempted. */
  working: 'preview' | 'refine' | null
  /** The engine's own progress for this step, or null when it reports none (never invented). */
  progress: number | null
  /** Tasks ahead in the engine's queue, when it says. */
  ahead: number | null
  /** When this wait began (milliseconds since 1970), for the elapsed time and the "taking longer" note. */
  since: number | null
  code: AiFailure | null
  /** After a cancel: whether the engine really stopped, or carries on (and may still charge). */
  stopped: 'stopped' | 'running-on' | null
  status: AiStatus | null
  job: JobView | null
  /** The words that began the current attempt, for Try again. */
  text: string | null
  models: { preview: ArrayBuffer | null; final: ArrayBuffer | null }
  showing: 'preview' | 'final' | null
  bytes: ModelProgress | null
  /** Whether the viewer has the model loaded; set by the scene. */
  load: 'idle' | 'loading' | 'ready' | 'error'
  /** A reopened creation whose model file is not in this browser any more. */
  missing: boolean
}

/** Only how the model is shown; none of it touches the model file. */
export interface ViewerState {
  grid: boolean
  shading: 'natural' | 'clay' | 'wireframe'
  /** Strength of the reflections, 0 to 2. */
  reflections: number
  /** Brightness, 0.4 to 2. */
  exposure: number
  /** One finger pans instead of orbiting (for phones; two fingers always pan). */
  pan: boolean
}

export interface BuildStats {
  parts: number
  triangles: number
  ms: number
  textures?: number
}

export type NoticeCode =
  | 'created'
  | 'regenerated'
  | 'idea'
  | 'saved'
  | 'png'
  | 'glb'
  | 'opened'
  | 'reset'
  | 'randomised'
  | 'empty'
  | 'aiGeometry'
  | 'aiFinal'
  | 'aiFailed'
  | 'aiCancelled'
  | 'aiUnavailable'
  | 'modelMissing'

export interface GenState {
  prompt: string
  mode: Mode
  style: StyleId | null
  /** The language the visitor reads the site in; the description is assumed to be in it. */
  lang: Lang
  /** Ask the server to rewrite the description into an engine prompt, where it can. */
  enhance: boolean
  current: Current | null
  ai: AiState
  viewer: ViewerState
  stats: BuildStats | null
  notice: { id: number; code: NoticeCode } | null
}

export const IDLE_AI: AiState = {
  phase: 'idle',
  working: null,
  progress: null,
  ahead: null,
  since: null,
  code: null,
  stopped: null,
  status: null,
  job: null,
  text: null,
  models: { preview: null, final: null },
  showing: null,
  bytes: null,
  load: 'idle',
  missing: false,
}

export const DEFAULT_VIEWER: ViewerState = { grid: false, shading: 'natural', reflections: 1, exposure: 1, pan: false }

const initial = (): GenState => ({
  prompt: '',
  mode: 'ai',
  style: null,
  lang: 'en',
  enhance: true,
  current: null,
  ai: IDLE_AI,
  viewer: DEFAULT_VIEWER,
  stats: null,
  notice: null,
})

export const gen = createStore<GenState>(initial())

// For the browser tests in development: the store outlives the stage, which a slow device may rebuild or replace.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __genStore?: unknown }).__genStore = gen

let noticeId = 0
const say = (code: NoticeCode) => gen.set((s) => ({ ...s, notice: { id: ++noticeId, code } }))
let buildCounter = 0

export function setPrompt(prompt: string): void {
  gen.set((s) => ({ ...s, prompt: prompt.slice(0, MAX_PROMPT) }))
}
export function setMode(mode: Mode): void {
  gen.set((s) => ({ ...s, mode }))
}
export function setStyle(style: StyleId | null): void {
  gen.set((s) => ({ ...s, style }))
}
export function setLanguage(lang: Lang): void {
  gen.set((s) => ({ ...s, lang }))
}
export function setEnhance(enhance: boolean): void {
  gen.set((s) => ({ ...s, enhance }))
}
export function setStats(stats: BuildStats | null): void {
  gen.set((s) => ({ ...s, stats }))
}
export function patchViewer(patch: Partial<ViewerState>): void {
  gen.set((s) => ({ ...s, viewer: { ...s.viewer, ...patch } }))
}
export function setModelLoad(load: AiState['load']): void {
  gen.set((s) => ({ ...s, ai: { ...s.ai, load } }))
}

/** The model buffer the stage shows, if any. */
export const shownModel = (state: GenState): ArrayBuffer | null => (state.current?.source === 'ai' && state.ai.showing ? state.ai.models[state.ai.showing] : null)

const titleOf = (prompt: string) => prompt.replace(/\s+/g, ' ').trim().slice(0, 60)
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT)

// ── Quick creation: built in the browser, no server ─────────────────────────

/** A Quick creation from words (procedural; not AI). */
export function buildQuick(text: string, seed?: number): QuickCurrent | null {
  const prompt = tidy(text)
  if (!prompt) return null
  const interpretation = interpret(prompt)
  return {
    source: 'quick',
    prompt,
    title: titleOf(prompt),
    spec: interpretation.spec,
    seed: seed ?? seedFromText(prompt),
    look: { ...interpretation.look },
    baseLook: { ...interpretation.look },
    interpretation,
    build: ++buildCounter,
  }
}

function quickNow(text: string): void {
  const current = buildQuick(text)
  if (!current) return void say('empty')
  endRun()
  gen.set((s) => ({ ...s, prompt: current.prompt, current, stats: null, ai: { ...IDLE_AI, status: s.ai.status } }))
  say('created')
}

/**
 * Makes something from the words in the box (or given ones): a real AI model in AI mode, a Quick build in
 * Quick mode. The two never stand in for each other.
 */
export function generate(text?: string, options?: { ai?: AiOptions }): void {
  const state = gen.get()
  const words = text ?? state.prompt
  if (state.mode === 'ai') void startAi(words, options?.ai)
  else quickNow(words)
}

/** The same description again: another seed for a Quick creation; a new request to the engine for an AI one. */
export function regenerate(options?: { ai?: AiOptions }): void {
  const state = gen.get()
  const current = state.current
  if (!current) return generate(undefined, options)
  if (current.source === 'ai') return void startAi(current.prompt, options?.ai)
  endRun()
  gen.set((s) => ({
    ...s,
    current: { ...current, seed: Math.floor(Math.random() * 1_000_000), build: ++buildCounter },
    ai: { ...IDLE_AI, status: s.ai.status },
  }))
  say('regenerated')
}

/** A new amusing idea in the chosen style, written into the box and made at once. */
export function newIdea(lang: Lang, options?: { ai?: AiOptions }): void {
  const seed = Math.floor(Math.random() * 1_000_000_000)
  const { text } = randomIdea(gen.get().style, lang, seed)
  generate(text, options)
  say('idea')
}

/** In AI mode a random idea is only written into the box: making a model costs the engine's allowance, so it is never started by a die roll. */
export function suggestIdea(lang: Lang): void {
  const seed = Math.floor(Math.random() * 1_000_000_000)
  setPrompt(randomIdea(gen.get().style, lang, seed).text)
}

function patchCurrent(change: (current: Current) => Current): void {
  gen.set((s) => (s.current ? { ...s, current: change(s.current) } : s))
}

export function patchLook(patch: Partial<Look>): void {
  patchCurrent((c) => ({ ...c, look: sanitizeLook({ ...c.look, ...patch }) }))
}
export function resetLook(): void {
  patchCurrent((c) => ({ ...c, look: { ...c.baseLook } }))
  gen.set((s) => ({ ...s, viewer: DEFAULT_VIEWER }))
  say('reset')
}

/** A new appearance: material, colour, light and background chosen at random. The shape and the words stay. */
export function randomiseLook(): void {
  const random = createRandom(Math.floor(Math.random() * 1e9))
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length) % list.length]
  const colour = `#${[0, 1, 2].map(() => Math.floor(random() * 200 + 40).toString(16).padStart(2, '0')).join('')}`
  patchLook({
    material: pick(MATERIALS),
    colour: random() < 0.75 ? colour : null,
    lighting: pick(LIGHTS),
    background: pick(BACKGROUNDS),
    scale: Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, 0.8 + random() * 0.8)),
  })
  say('randomised')
}

/** Changes what a Quick object is (an accessory, a mood, a pose): it is built again. */
export function patchSpec(patch: Partial<ObjectSpec>): void {
  gen.set((s) => (s.current?.source === 'quick' ? { ...s, current: { ...s.current, spec: { ...s.current.spec, ...patch }, build: ++buildCounter } } : s))
}

export function toggleAccessory(id: AccessoryId): void {
  const current = gen.get().current
  if (current?.source !== 'quick' || !ACCESSORIES.includes(id)) return
  const has = current.spec.accessories.includes(id)
  patchSpec({ accessories: has ? current.spec.accessories.filter((item) => item !== id) : [...current.spec.accessories, id].slice(-8) })
}

/**
 * Puts a kept creation on the stage. For an AI creation the model file is given (read from the browser's
 * storage by the caller); without it the stage stays empty and says the file is not kept here.
 */
export function loadCreation(creation: Creation, model: ArrayBuffer | null = null, options?: AiOptions): void {
  endRun()
  if (creation.source === 'ai' && creation.ai) {
    const meta = creation.ai
    const current: AiCurrent = { source: 'ai', prompt: creation.prompt, title: creation.title, look: creation.look, baseLook: { ...DEFAULT_LOOK }, build: ++buildCounter, ai: meta }
    gen.set((s) => ({
      ...s,
      prompt: creation.prompt,
      current,
      stats: null,
      ai: {
        ...IDLE_AI,
        status: s.ai.status,
        phase: model ? 'completed' : 'idle',
        models: { preview: model && meta.stage === 'preview' ? model : null, final: model && meta.stage === 'final' ? model : null },
        showing: model ? meta.stage : null,
        load: model ? 'loading' : 'idle',
        missing: !model,
      },
    }))
    say(model ? 'opened' : 'modelMissing')
    // A kept geometry preview can still be textured if the server still has the job (it keeps jobs for the engine's own retention).
    if (model && meta.stage === 'preview' && meta.job) {
      const build = current.build
      void getJob(meta.job, new AbortController().signal, options)
        .then((job) => {
          if (gen.get().current?.build === build) setAi({ job })
        })
        .catch(() => undefined)
    }
    return
  }
  if (creation.source === 'quick' && creation.spec) {
    const interpretation = interpret(creation.prompt)
    gen.set((s) => ({
      ...s,
      prompt: creation.prompt,
      stats: null,
      current: {
        source: 'quick',
        prompt: creation.prompt,
        title: creation.title,
        spec: creation.spec!,
        seed: creation.seed,
        look: creation.look,
        baseLook: { ...interpretation.look },
        interpretation: { ...interpretation, spec: creation.spec! },
        build: ++buildCounter,
      },
      ai: { ...IDLE_AI, status: s.ai.status },
    }))
    say('opened')
  }
}

export function clearCurrent(): void {
  endRun()
  gen.set((s) => ({ ...s, current: null, stats: null, ai: { ...IDLE_AI, status: s.ai.status } }))
}

// ── AI creation ─────────────────────────────────────────────────────────────

/** Identifies the run in progress: whatever a finished await belongs to an older run is dropped. */
let run = 0
let controller: AbortController | null = null

const setAi = (patch: Partial<AiState>) => gen.set((s) => ({ ...s, ai: { ...s.ai, ...patch } }))

function beginRun(): { token: number; signal: AbortSignal } {
  controller?.abort()
  const mine = new AbortController()
  controller = mine
  return { token: ++run, signal: mine.signal }
}

function endRun(): void {
  controller?.abort()
  controller = null
  run++
}

/** Asks the server whether AI creation is set up. Remembered, so the page asks once. */
export async function checkAi(options?: AiOptions, force = false): Promise<AiStatus> {
  const known = gen.get().ai.status
  if (!force && known) return known
  const status = await fetchStatus(options)
  setAi({ status })
  return status
}

const phaseOf = (view: JobView): AiPhase => {
  switch (view.status) {
    case 'queued':
      return 'queued'
    case 'running':
      return view.stage === 'refine' ? 'textures' : 'geometry'
    case 'processing':
    case 'succeeded':
      return 'processing'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
  }
}

function applyView(token: number, view: JobView): void {
  if (token !== run) return
  gen.set((s) => {
    const phase = phaseOf(view)
    const stepChanged = s.ai.working !== view.stage || s.ai.phase === 'preparing'
    return {
      ...s,
      ai: {
        ...s.ai,
        job: view,
        phase,
        working: view.stage,
        progress: view.status === 'running' ? view.progress : null,
        ahead: view.status === 'queued' ? view.ahead : null,
        since: stepChanged ? Date.now() : s.ai.since,
      },
    }
  })
}

function fail(token: number, error: unknown): void {
  if (token !== run) return
  const code: AiFailure = error instanceof AiError ? error.code : 'upstream'
  if (code === 'cancelled') return
  controller = null
  setAi({ phase: 'failed', code, bytes: null, progress: null, ahead: null })
  say('aiFailed')
}

/** Follows a started step to its end, then fetches and takes in the model it made. */
async function drive(token: number, first: JobView, options: AiOptions): Promise<void> {
  const signal = controller?.signal
  if (!signal || token !== run) return
  applyView(token, first)
  try {
    const view = await followJob(first.id, (v) => applyView(token, v), signal, options)
    if (token !== run) return
    if (view.status === 'failed') {
      controller = null
      setAi({ phase: 'failed', code: view.error ?? 'service', progress: null, ahead: null })
      say('aiFailed')
      return
    }
    if (view.status === 'cancelled') {
      controller = null
      setAi({ phase: 'cancelled', stopped: view.cancel, progress: null, ahead: null })
      say('aiCancelled')
      return
    }
    const stage = view.stage === 'refine' ? 'final' : 'preview'
    setAi({ phase: 'processing', bytes: { loaded: 0, total: 0 }, progress: null, ahead: null })
    const model = await fetchModel(view.id, stage, signal, (bytes) => token === run && setAi({ bytes }), options)
    if (token !== run) return
    controller = null
    takeIn(stage, model, view)
  } catch (error) {
    fail(token, error)
  }
}

/** Puts a checked model on the stage and records where it came from. */
function takeIn(stage: 'preview' | 'final', model: ArrayBuffer, view: JobView): void {
  gen.set((s) => {
    const meta: AiMeta = {
      provider: s.ai.status?.provider ?? 'AI',
      simulated: view.simulated,
      prepared: view.prepared,
      enhanced: view.enhanced,
      job: view.id,
      tasks: view.tasks,
      stage,
      format: 'glb',
      bytes: model.byteLength,
      createdAt: Date.now(),
      model: null,
    }
    const before = s.current?.source === 'ai' ? s.current : null
    const current: AiCurrent = {
      source: 'ai',
      prompt: view.prompt || s.prompt,
      title: before?.title ?? titleOf(view.prompt || s.prompt),
      look: before?.look ?? { ...DEFAULT_LOOK },
      baseLook: { ...DEFAULT_LOOK },
      build: ++buildCounter,
      ai: meta,
    }
    return {
      ...s,
      current,
      ai: { ...s.ai, phase: 'completed', code: null, working: null, bytes: null, progress: null, ahead: null, load: 'loading', missing: false, models: { ...s.ai.models, [stage]: model }, showing: stage },
    }
  })
  say(stage === 'final' ? 'aiFinal' : 'aiGeometry')
}

/** Asks the engine for a real model. Nothing else is put on the stage meanwhile. */
export async function startAi(text: string, options: AiOptions = {}): Promise<void> {
  const words = tidy(text)
  if (!words) return void say('empty')
  const { token, signal } = beginRun()
  gen.set((s) => ({
    ...s,
    prompt: words,
    current: null,
    stats: null,
    ai: { ...IDLE_AI, status: s.ai.status, phase: 'checking', working: 'preview', since: Date.now(), text: words },
  }))
  const status = await checkAi(options)
  if (token !== run) return
  if (!status.available) {
    controller = null
    setAi({ phase: 'unavailable', code: status.reason ?? 'not-configured', since: null })
    say('aiUnavailable')
    return
  }
  setAi({ phase: 'preparing', since: Date.now() })
  const state = gen.get()
  try {
    const job = await createJob({ text: words, language: state.lang, enhance: state.enhance && status.enhancement }, signal, options)
    await drive(token, job, options)
  } catch (error) {
    // A creation is already running (a reload, a second tab): follow that one instead of starting another.
    if (error instanceof AiError && error.code === 'active' && error.job) {
      try {
        await drive(token, await getJob(error.job, signal, options), options)
        return
      } catch (again) {
        return fail(token, again)
      }
    }
    fail(token, error)
  }
}

/** Starts the textures for the geometry on the stage. Only ever on the visitor's request; it costs more. */
export async function refineAi(options: AiOptions = {}): Promise<void> {
  const job = gen.get().ai.job
  if (!job?.canRefine) return
  const { token, signal } = beginRun()
  setAi({ phase: 'queued', working: 'refine', code: null, stopped: null, progress: null, ahead: null, since: Date.now(), bytes: null })
  try {
    await drive(token, await jobAction(job.id, 'refine', signal, options), options)
  } catch (error) {
    fail(token, error)
  }
}

/** Tries a failed step again. A failure before the engine had a job begins afresh. */
export async function retryAi(options: AiOptions = {}): Promise<void> {
  const state = gen.get()
  const job = state.ai.job
  if (!job || !job.canRetry) {
    if (state.ai.text) return startAi(state.ai.text, options)
    return
  }
  const { token, signal } = beginRun()
  setAi({ phase: 'queued', code: null, stopped: null, progress: null, ahead: null, since: Date.now(), bytes: null })
  try {
    await drive(token, await jobAction(job.id, 'retry', signal, options), options)
  } catch (error) {
    fail(token, error)
  }
}

/** Stops waiting, and asks the engine to stop where it can. Says plainly when it cannot. */
export function cancelAi(options: AiOptions = {}): void {
  const state = gen.get()
  if (!AI_ACTIVE.includes(state.ai.phase)) return
  const job = state.ai.job
  endRun()
  setAi({ phase: 'cancelled', progress: null, ahead: null, bytes: null, stopped: null })
  say('aiCancelled')
  if (job && (job.status === 'queued' || job.status === 'running' || job.status === 'processing')) {
    const build = run
    void jobAction(job.id, 'cancel', new AbortController().signal, options)
      .then((view) => {
        if (build === run) setAi({ job: view, stopped: view.cancel })
      })
      .catch(() => undefined)
  }
}

/** Closes a failure or cancellation card, back to what is on the stage (or to READY). */
export function dismissAi(): void {
  gen.set((s) => ({ ...s, ai: { ...s.ai, phase: s.current ? 'completed' : 'idle', code: null, stopped: null } }))
}

/** Which of the two models (geometry, textured) the stage shows. */
export function showModel(which: 'preview' | 'final'): void {
  gen.set((s) => (s.ai.models[which] ? { ...s, ai: { ...s.ai, showing: which, load: 'loading' } } : s))
}

/** For tests and a fresh visit. */
export function resetGenerator(): void {
  endRun()
  gen.set(initial())
}
