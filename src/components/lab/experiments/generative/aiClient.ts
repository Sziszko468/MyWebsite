import { MAX_GLB_BYTES, validateGlb, type GlbProblem } from './glb'

/**
 * The browser's side of AI creation. It talks only to this site's own endpoint (the server holds the
 * credentials and chooses the engine); it never sees an engine's address, key or prices.
 *
 * A creation is two steps the visitor decides about: the GEOMETRY (untextured) comes first, and the
 * TEXTURES are asked for separately, once the shape has been looked at. Every step can be cancelled,
 * every wait has an honest label, and a model file is checked before anything loads it.
 */
export const AI_ENDPOINT: string = (import.meta.env.VITE_AI3D_ENDPOINT as string | undefined) ?? '/api/ai3d'

export type Language = 'hu' | 'en' | 'nl'

export interface AiStatus {
  available: boolean
  /** The engine's own name, shown next to the model it made. */
  provider: string | null
  /** True when the "engine" is a stand-in that makes a cube. */
  simulated: boolean
  /** Why it is not available, as a code: the page has words for each. */
  reason: 'not-configured' | 'no-key' | 'no-server' | null
  maxPrompt: number
  /** Whether a language model rewrites descriptions into engine prompts on this server. */
  enhancement: boolean
  /** Whether the textures step exists. */
  refine: boolean
  /** New models this visitor may still start this hour. */
  remaining: number
}

export type AiFailure =
  | 'not-configured'
  | 'no-key'
  | 'no-server'
  | 'auth'
  | 'credits'
  | 'rate-limit'
  | 'busy'
  | 'budget'
  | 'active'
  | 'moderation'
  | 'rejected'
  | 'invalid'
  | 'upstream'
  | 'network'
  | 'timeout'
  | 'service'
  | 'gone'
  | 'cancelled'
  | 'no-asset'
  | 'download'
  | 'invalid-file'
  | 'too-large'
  | 'load'

export class AiError extends Error {
  readonly code: AiFailure
  readonly detail: GlbProblem | null
  /** For `active`: the job that is already running. */
  readonly job: string | null
  constructor(code: AiFailure, message: string, detail: GlbProblem | null = null, job: string | null = null) {
    super(message)
    this.name = 'AiError'
    this.code = code
    this.detail = detail
    this.job = job
  }
}

export type JobStatus = 'queued' | 'running' | 'processing' | 'succeeded' | 'failed' | 'cancelled'

export interface JobView {
  id: string
  /** The visitor's words. */
  prompt: string
  /** What the engine was sent. */
  prepared: string
  enhanced: boolean
  stage: 'preview' | 'refine'
  status: JobStatus
  /** The engine's own progress for this step, 0 to 1, or null when it does not report any. */
  progress: number | null
  /** Tasks ahead in the engine's queue, when it says. */
  ahead: number | null
  error: AiFailure | null
  /** After a cancel: `stopped` (the engine stopped it) or `running-on` (it carries on and may still charge). */
  cancel: 'stopped' | 'running-on' | null
  preview: { status: JobStatus; bytes: number }
  final: { status: JobStatus; bytes: number } | null
  tasks: { preview: string | null; final: string | null }
  canRefine: boolean
  canRetry: boolean
  simulated: boolean
  createdAt: number
  /** The server answered a repeated request with the job it already had. */
  reused: boolean
}

export interface AiOptions {
  fetchImpl?: typeof fetch
  endpoint?: string
  /** Time between two questions about a job. */
  pollMs?: number
  /** Where the clock and the waiting come from; tests replace them. */
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
}

const DEFAULT_POLL_MS = 2000

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AiError('cancelled', 'Cancelled.'))
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new AiError('cancelled', 'Cancelled.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

const SERVER_REASONS: Record<string, AiStatus['reason']> = {
  'no-provider': 'not-configured',
  'unknown-provider': 'not-configured',
  'bad-model': 'not-configured',
  'no-key': 'no-key',
}
const NO_SERVER: AiStatus = { available: false, provider: null, simulated: false, reason: 'no-server', maxPrompt: 0, enhancement: false, refine: false, remaining: 0 }

/** Asks whether AI creation is set up. It never throws: a missing server is just "not available". */
export async function fetchStatus(options: AiOptions = {}, signal?: AbortSignal): Promise<AiStatus> {
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = options.endpoint ?? AI_ENDPOINT
  try {
    const response = await fetchImpl(`${endpoint}/status`, { signal, headers: { accept: 'application/json' } })
    // A static host answers every address with the page itself, or with an error.
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return NO_SERVER
    const body = (await response.json()) as Record<string, unknown>
    const available = body.available === true
    return {
      available,
      provider: typeof body.provider === 'string' ? body.provider.slice(0, 40) : null,
      simulated: body.simulated === true,
      reason: available ? null : (SERVER_REASONS[String(body.reason)] ?? 'not-configured'),
      maxPrompt: typeof body.maxPrompt === 'number' && body.maxPrompt > 0 ? Math.min(body.maxPrompt, 1000) : 240,
      enhancement: body.enhancement === true,
      refine: body.refine === true,
      remaining: typeof body.remaining === 'number' ? Math.max(0, Math.floor(body.remaining)) : 0,
    }
  } catch {
    return NO_SERVER
  }
}

const STATUSES: readonly JobStatus[] = ['queued', 'running', 'processing', 'succeeded', 'failed', 'cancelled']
const FAILURES: readonly AiFailure[] = ['moderation', 'invalid', 'timeout', 'service', 'no-asset', 'invalid-file', 'too-large', 'download', 'cancelled']

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')
const status = (value: unknown): JobStatus => (STATUSES.includes(value as JobStatus) ? (value as JobStatus) : 'queued')
const num = (value: unknown, min: number, max: number): number | null => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null)
const taskId = (value: unknown) => (typeof value === 'string' && /^[\w-]{1,80}$/.test(value) ? value : null)

export function parseJob(raw: unknown): JobView {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const step = (value: unknown) => {
    const s = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    return { status: status(s.status), bytes: num(s.bytes, 0, 1e9) ?? 0 }
  }
  const tasks = (typeof r.tasks === 'object' && r.tasks !== null ? r.tasks : {}) as Record<string, unknown>
  const id = str(r.id, 64)
  return {
    id: /^[\w-]{1,64}$/.test(id) ? id : '',
    prompt: str(r.prompt, 800),
    prepared: str(r.prepared, 800),
    enhanced: r.enhanced === true,
    stage: r.stage === 'refine' ? 'refine' : 'preview',
    status: status(r.status),
    progress: num(r.progress, 0, 1),
    ahead: num(r.ahead, 0, 100000),
    error: FAILURES.includes(r.error as AiFailure) ? (r.error as AiFailure) : null,
    cancel: r.cancel === 'stopped' || r.cancel === 'running-on' ? r.cancel : null,
    preview: step(r.preview),
    final: r.final ? step(r.final) : null,
    tasks: { preview: taskId(tasks.preview), final: taskId(tasks.final) },
    canRefine: r.canRefine === true,
    canRetry: r.canRetry === true,
    simulated: r.simulated === true,
    createdAt: num(r.createdAt, 0, 1e14) ?? 0,
    reused: r.reused === true,
  }
}

const REFUSALS: Record<string, AiFailure> = {
  'no-provider': 'not-configured',
  'unknown-provider': 'not-configured',
  'bad-model': 'not-configured',
  'no-key': 'no-key',
  auth: 'auth',
  credits: 'credits',
  'rate-limit': 'rate-limit',
  busy: 'busy',
  budget: 'budget',
  active: 'active',
  moderation: 'moderation',
  rejected: 'rejected',
  invalid: 'invalid',
  gone: 'gone',
  upstream: 'upstream',
  'not-retryable': 'rejected',
  already: 'rejected',
  'no-preview': 'rejected',
  'no-refine': 'rejected',
}

async function request(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    if (init.signal?.aborted) throw new AiError('cancelled', 'Cancelled.')
    throw new AiError('network', error instanceof Error ? error.message : 'Network error.')
  }
  if (response.ok) return response
  let body: { error?: unknown; id?: unknown } = {}
  try {
    body = (await response.json()) as typeof body
  } catch {
    // Not JSON: a proxy's page, say.
  }
  const code = typeof body.error === 'string' ? body.error : ''
  const known = REFUSALS[code]
  if (known) throw new AiError(known, `The server said: ${code}.`, null, typeof body.id === 'string' && /^[\w-]{1,64}$/.test(body.id) ? body.id : null)
  if (response.status === 429) throw new AiError('rate-limit', 'Too many requests.')
  if (response.status === 503) throw new AiError('not-configured', 'AI creation is not available.')
  if (response.status >= 500) throw new AiError('upstream', `The server answered ${response.status}.`)
  throw new AiError('rejected', `The server answered ${response.status}.`)
}

const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' }

export interface NewJob {
  text: string
  language: Language
  /** Ask the server to rewrite the description into an engine prompt (only has an effect where it is set up). */
  enhance: boolean
}

/** Starts the geometry. The server prepares the prompt first, so this call is the "preparing prompt" wait. */
export async function createJob(job: NewJob, signal: AbortSignal, options: AiOptions = {}): Promise<JobView> {
  const response = await request((options.fetchImpl ?? fetch), `${options.endpoint ?? AI_ENDPOINT}/jobs`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ text: job.text, lang: job.language, enhance: job.enhance }),
    signal,
  })
  const view = parseJob(await response.json())
  if (!view.id) throw new AiError('rejected', 'The server sent no job number.')
  return view
}

export async function getJob(id: string, signal: AbortSignal, options: AiOptions = {}): Promise<JobView> {
  const response = await request(options.fetchImpl ?? fetch, `${options.endpoint ?? AI_ENDPOINT}/jobs/${encodeURIComponent(id)}`, { headers: { accept: 'application/json' }, signal })
  return parseJob(await response.json())
}

export type JobAction = 'refine' | 'retry' | 'cancel'

export async function jobAction(id: string, action: JobAction, signal: AbortSignal, options: AiOptions = {}): Promise<JobView> {
  const response = await request(options.fetchImpl ?? fetch, `${options.endpoint ?? AI_ENDPOINT}/jobs/${encodeURIComponent(id)}/${action}`, { method: 'POST', headers: JSON_HEADERS, signal })
  return parseJob(await response.json())
}

/**
 * Asks about a step every couple of seconds until it ends, telling `onView` each time. Resolves with the
 * last view (succeeded, failed or cancelled). It has no clock of its own: the server gives a step up after
 * its own time limit (an hour by default, which is how long the engine asks for patience), and the page
 * shows a plain "taking longer than usual" note meanwhile. A moment without an answer does not end a wait.
 */
export async function followJob(id: string, onView: (view: JobView) => void, signal: AbortSignal, options: AiOptions = {}): Promise<JobView> {
  const wait = options.wait ?? sleep
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const started = Date.now()
  let misses = 0
  for (;;) {
    try {
      const view = await getJob(id, signal, options)
      misses = 0
      onView(view)
      if (view.status === 'succeeded' || view.status === 'failed' || view.status === 'cancelled') return view
    } catch (error) {
      // Trouble reaching the server for a moment: ask again, but not for ever.
      if (!(error instanceof AiError) || error.code === 'cancelled' || (error.code !== 'network' && error.code !== 'upstream') || ++misses >= 8) throw error
    }
    // A long wait is asked about less and less often, and a hidden tab hardly at all: the server only passes on what the engine says every few seconds anyway.
    const waited = Date.now() - started
    const slower = waited > 10 * 60_000 ? 10_000 : waited > 2 * 60_000 ? 5000 : pollMs
    await wait(typeof document !== 'undefined' && document.hidden ? Math.max(slower, 10_000) : slower, signal)
  }
}

export interface ModelProgress {
  loaded: number
  /** 0 when the size is not known. */
  total: number
}

/** Fetches a finished model, counting bytes as they come, and checks it before returning it. */
export async function fetchModel(id: string, stage: 'preview' | 'final', signal: AbortSignal, onBytes: (progress: ModelProgress) => void, options: AiOptions = {}): Promise<ArrayBuffer> {
  const response = await request(options.fetchImpl ?? fetch, `${options.endpoint ?? AI_ENDPOINT}/jobs/${encodeURIComponent(id)}/model?stage=${stage}`, { signal })
  const total = Number(response.headers.get('content-length') ?? 0)
  if (total > MAX_GLB_BYTES) throw new AiError('too-large', 'The model file is too large.', 'too-large')
  let buffer: ArrayBuffer
  try {
    if (response.body) {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        loaded += value.byteLength
        if (loaded > MAX_GLB_BYTES) {
          void reader.cancel()
          throw new AiError('too-large', 'The model file is too large.', 'too-large')
        }
        chunks.push(value)
        onBytes({ loaded, total })
      }
      const bytes = new Uint8Array(loaded)
      let at = 0
      for (const chunk of chunks) {
        bytes.set(chunk, at)
        at += chunk.byteLength
      }
      buffer = bytes.buffer
    } else {
      buffer = await response.arrayBuffer()
    }
  } catch (error) {
    if (error instanceof AiError) throw error
    if (signal.aborted) throw new AiError('cancelled', 'Cancelled.')
    throw new AiError('network', 'The model download was interrupted.')
  }
  const check = validateGlb(buffer)
  if (!check.ok) throw new AiError(check.reason === 'too-large' ? 'too-large' : 'invalid-file', 'The model file is not a usable glTF.', check.reason)
  return buffer
}
