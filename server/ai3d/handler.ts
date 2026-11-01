import type { Ai3dConfig } from './config.ts'
import { inspectGlb } from './glb.ts'
import { cleanText, LANGUAGES, preparePrompt, type Language, type PreparedBy } from './prompt.ts'
import { ProviderError, type FailureKind, type Stage, type Text3dProvider } from './provider.ts'
import { createFileStorage, createMemoryStorage, type JobStorage } from './storage.ts'
import { createUsage, pseudonym, type UsageLine } from './usage.ts'

/**
 * The server's side of AI creation, as one function from a web-standard `Request` to a `Response`
 * (so it runs in Node, in a serverless function or behind any adapter). Routes, under whatever path
 * it is mounted at:
 *
 *   GET  /status               is an engine configured, may it texture, is a prompt writer on?
 *   POST /jobs                 { text, lang?, enhance? } -> { id, prepared, … }   prepare the prompt, start the geometry
 *   GET  /jobs/:id             how it is going: stage, status, real progress, what can be done next
 *   GET  /jobs/:id/model       ?stage=preview|final   the model file (our copy, checked)
 *   POST /jobs/:id/refine      start the texturing of a finished preview (only ever on the visitor's request)
 *   POST /jobs/:id/retry       try the failed step again
 *   POST /jobs/:id/cancel      stop following; stops the engine's task too where it can be stopped
 *
 * What it guards: the text (a string, short, no control characters), who may call it (same site, or a
 * listed origin), how much it may cost (tasks per visitor per hour, models per day, tasks at once, an
 * optional daily credit budget, one active job per visitor, a repeated request answered with the job it
 * already started), and what it passes on (a copy it made itself, of a size allowed, that really is a
 * binary glTF). Visitors are held as a short hash, never as an address. The engine's key, addresses,
 * messages and prices never leave this file's callers.
 */
type StageState = 'queued' | 'running' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
type StageFailure = FailureKind | 'no-asset' | 'invalid-file' | 'too-large' | 'download' | 'timeout' | 'cancelled'

interface StageRecord {
  task: string
  state: StageState
  /** 0 to 1 as the engine reports it, or null when it does not. */
  progress: number | null
  ahead: number | null
  failure: StageFailure | null
  /** The engine's signed address of the finished file, only until our copy is made. */
  modelUrl: string | null
  bytes: number
  startedAt: number
  nextPoll: number
  cancel: 'stopped' | 'running-on' | null
}

interface Job {
  id: string
  /** The visitor as a hash. */
  who: string
  createdAt: number
  original: string
  prepared: string
  by: PreparedBy
  language: Language | null
  retries: number
  preview: StageRecord
  refine: StageRecord | null
}

/** A job nobody has asked about for this long, with nothing ticking in the background, no longer holds its visitor's place. */
const ABANDONED_MS = 3 * 60_000
/** The background ticker counts as running while it has ticked this recently. */
const TICKER_ALIVE_MS = 30_000

export interface Ai3dHandler {
  handle(request: Request, client: string): Promise<Response>
  /**
   * Asks the engine about every step in progress, so a finished model is copied even when nobody is
   * watching. A long-running server calls this every few seconds (see node.ts); where it is never called
   * (a serverless function) a step only moves when its visitor asks, and a job nobody has asked about for
   * a few minutes stops holding its visitor's one place.
   */
  tick(): Promise<void>
}

interface Reply {
  status: number
  body: unknown
  headers?: Record<string, string>
}

const HOUR = 60 * 60_000
const DAY = 24 * HOUR
const MAX_RETRIES = 3
const ACTIVE: readonly StageState[] = ['queued', 'running', 'processing']
const NOT_RETRYABLE: readonly StageFailure[] = ['moderation', 'invalid']

const reply = (status: number, body: unknown, headers?: Record<string, string>): Reply => ({ status, body, headers })
const fail = (status: number, error: string, extra: Record<string, unknown> = {}, headers?: Record<string, string>) => reply(status, { error, ...extra }, headers)

const send = (r: Reply): Response =>
  new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...r.headers } })

function providerFailure(error: unknown): Reply {
  if (error instanceof ProviderError) {
    const wait = error.retryAfterMs ? { 'retry-after': String(Math.ceil(error.retryAfterMs / 1000)) } : { 'retry-after': '60' }
    switch (error.code) {
      case 'auth':
        return fail(503, 'auth')
      case 'credits':
        return fail(503, 'credits')
      case 'rate-limit':
        return fail(429, 'rate-limit', {}, wait)
      case 'busy':
        return fail(429, 'busy', {}, wait)
      case 'moderation':
        return fail(400, 'moderation')
      case 'rejected':
        return fail(400, 'rejected')
      case 'gone':
        return fail(410, 'gone')
    }
  }
  return fail(502, 'upstream')
}

const isState = (value: unknown): value is StageState => typeof value === 'string' && ['queued', 'running', 'processing', 'succeeded', 'failed', 'cancelled'].includes(value)

function reviveStage(raw: unknown): StageRecord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Partial<StageRecord>
  if (typeof r.task !== 'string' || !isState(r.state)) return null
  // A step that was being copied when the server stopped is asked about again.
  const state: StageState = r.state === 'processing' ? 'running' : r.state
  return {
    task: r.task,
    state,
    progress: typeof r.progress === 'number' ? r.progress : null,
    ahead: typeof r.ahead === 'number' ? r.ahead : null,
    failure: typeof r.failure === 'string' ? (r.failure as StageFailure) : null,
    modelUrl: null,
    bytes: typeof r.bytes === 'number' ? r.bytes : 0,
    startedAt: typeof r.startedAt === 'number' ? r.startedAt : 0,
    nextPoll: 0,
    cancel: r.cancel === 'stopped' || r.cancel === 'running-on' ? r.cancel : null,
  }
}

function reviveJob(raw: unknown): Job | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Partial<Job>
  const preview = reviveStage(r.preview)
  if (!preview || typeof r.id !== 'string' || !/^[\w-]{1,64}$/.test(r.id) || typeof r.who !== 'string') return null
  return {
    id: r.id,
    who: r.who,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    original: typeof r.original === 'string' ? r.original : '',
    prepared: typeof r.prepared === 'string' ? r.prepared : '',
    by: r.by === 'language-model' ? 'language-model' : 'none',
    language: LANGUAGES.includes(r.language as Language) ? (r.language as Language) : null,
    retries: typeof r.retries === 'number' ? r.retries : 0,
    preview,
    refine: reviveStage(r.refine),
  }
}

/** Reads a response body up to a limit; null when it is larger. */
async function readCapped(response: Response, limit: number, abort: () => void): Promise<Uint8Array | null> {
  if (!response.ok || !response.body) throw new ProviderError('upstream', 'The file could not be fetched.')
  if (Number(response.headers.get('content-length') ?? 0) > limit) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      abort()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return bytes
}

export function createAi3dHandler(config: Ai3dConfig, now: () => number = Date.now, storageOverride?: JobStorage): Ai3dHandler {
  const storage = storageOverride ?? (config.storageDir ? createFileStorage(config.storageDir) : createMemoryStorage())
  /** Where a copy goes when the configured storage fails, so a full disk never loses a finished model. */
  const spare = createMemoryStorage(64 * 1024 * 1024)
  const jobs = new Map<string, Job>()
  const tasksByWho = new Map<string, number[]>()
  const refinesByWho = new Map<string, number[]>()
  let day: number[] = []
  const polling = new Set<string>()
  /** When each job was last asked about by its visitor (not kept on disk). */
  const seen = new Map<string, number>()
  let lastTick = 0
  const copying = new Map<string, Promise<void>>()
  const creating = new Map<string, { text: string; done: Promise<Reply> }>()

  const usage = createUsage({
    budget: config.dailyCreditBudget,
    now,
    sink: (line) => {
      config.log(line)
      void storage.appendLog(line).catch(() => undefined)
    },
  })
  const note = (who: string, line: UsageLine) => usage.log(who, line)

  let loaded: Promise<void> | null = null
  const load = () =>
    (loaded ??= (async () => {
      try {
        for (const raw of await storage.loadJobs()) {
          const job = reviveJob(raw)
          if (job) jobs.set(job.id, job)
        }
      } catch {
        config.log(JSON.stringify({ event: 'error', reason: 'storage-load' }))
      }
    })())

  const persist = (job: Job) => {
    const clean = { ...job, preview: { ...job.preview, modelUrl: null }, refine: job.refine ? { ...job.refine, modelUrl: null } : null }
    void storage.saveJob(job.id, clean).catch(() => note(job.who, { event: 'error', job: job.id, reason: 'storage-save' }))
  }

  const assetKey = (job: Job, stage: 'preview' | 'final') => `${job.id}-${stage}`
  const currentStage = (job: Job): Stage => (job.refine ? 'refine' : 'preview')
  const current = (job: Job): StageRecord => job.refine ?? job.preview

  const sweep = () => {
    const cutoff = now() - config.keepMs
    for (const [id, job] of jobs) {
      if (job.createdAt >= cutoff) continue
      jobs.delete(id)
      void storage.removeJob(id).catch(() => undefined)
      void storage.removeAsset(assetKey(job, 'preview')).catch(() => undefined)
      void storage.removeAsset(assetKey(job, 'final')).catch(() => undefined)
    }
    for (const map of [tasksByWho, refinesByWho]) {
      for (const [who, times] of map) {
        const recent = times.filter((time) => time > now() - HOUR)
        if (recent.length) map.set(who, recent)
        else map.delete(who)
      }
    }
    day = day.filter((time) => time > now() - DAY)
  }

  const activeCount = () => [...jobs.values()].filter((job) => ACTIVE.includes(current(job).state)).length
  const tickerAlive = () => now() - lastTick < TICKER_ALIVE_MS
  const held = (job: Job) => tickerAlive() || now() - (seen.get(job.id) ?? job.createdAt) < ABANDONED_MS
  const activeOf = (who: string) => [...jobs.values()].find((job) => job.who === who && ACTIVE.includes(current(job).state) && held(job)) ?? null

  const originAllowed = (request: Request): boolean => {
    const origin = request.headers.get('origin')
    if (!origin) return true
    return origin === new URL(request.url).origin || config.allowedOrigins.includes(origin)
  }

  const cors = (request: Request, response: Response): Response => {
    const origin = request.headers.get('origin')
    if (origin && config.allowedOrigins.includes(origin)) {
      response.headers.set('access-control-allow-origin', origin)
      response.headers.set('vary', 'origin')
    }
    return response
  }

  const withTimeout = <T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    return run(controller.signal).finally(() => clearTimeout(timer))
  }

  const view = (job: Job) => {
    const provider = config.provider!
    const cur = current(job)
    const ended = cur.state === 'failed' || cur.state === 'cancelled'
    return {
      id: job.id,
      prompt: job.original,
      prepared: job.prepared,
      enhanced: job.by === 'language-model',
      stage: currentStage(job),
      status: cur.state,
      progress: cur.state === 'running' || cur.state === 'succeeded' ? cur.progress : null,
      ahead: cur.state === 'queued' ? cur.ahead : null,
      error: ended ? cur.failure : null,
      cancel: cur.state === 'cancelled' ? cur.cancel : null,
      preview: { status: job.preview.state, bytes: job.preview.bytes },
      final: job.refine ? { status: job.refine.state, bytes: job.refine.bytes } : null,
      tasks: { preview: job.preview.task, final: job.refine?.task ?? null },
      canRefine:
        config.allowRefine &&
        provider.textures &&
        job.preview.state === 'succeeded' &&
        (!job.refine || job.refine.state === 'failed' || job.refine.state === 'cancelled') &&
        job.retries < MAX_RETRIES,
      canRetry: ended && !NOT_RETRYABLE.includes(cur.failure ?? 'service') && job.retries < MAX_RETRIES,
      simulated: provider.simulated,
      createdAt: job.createdAt,
    }
  }

  const newRecord = (task: string): StageRecord => ({ task, state: 'queued', progress: null, ahead: null, failure: null, modelUrl: null, bytes: 0, startedAt: now(), nextPoll: now() + 1000, cancel: null })

  /** Whether another task of this kind may start now; the reply says why not. */
  function allowance(who: string, stage: Stage, provider: Text3dProvider): Reply | null {
    sweep()
    if (stage === 'preview') {
      if ((tasksByWho.get(who) ?? []).length >= config.maxJobsPerHour) return fail(429, 'rate-limit', {}, { 'retry-after': '600' })
      if (day.length >= config.maxJobsPerDay) return fail(429, 'rate-limit', {}, { 'retry-after': '3600' })
    } else if ((refinesByWho.get(who) ?? []).length >= config.maxRefinesPerHour) {
      return fail(429, 'rate-limit', {}, { 'retry-after': '600' })
    }
    if (activeCount() >= config.maxConcurrent) return fail(429, 'busy', {}, { 'retry-after': '60' })
    if (!usage.fits(provider.credits(stage))) {
      note(who, { event: 'refused', stage, reason: 'budget' })
      return fail(503, 'budget')
    }
    return null
  }

  function counted(who: string, stage: Stage, job: string, task: string, by?: PreparedBy) {
    const provider = config.provider!
    const time = now()
    const map = stage === 'preview' ? tasksByWho : refinesByWho
    map.set(who, [...(map.get(who) ?? []), time])
    if (stage === 'preview') day.push(time)
    usage.created({ task, credits: provider.credits(stage) })
    note(who, { event: 'task-created', job, stage, task, credits: provider.credits(stage), by })
  }

  async function startJob(raw: unknown, who: string): Promise<Reply> {
    const provider = config.provider
    if (!provider) return fail(503, config.reason ?? 'no-provider')
    const body = (typeof raw === 'object' && raw !== null ? raw : {}) as { text?: unknown; lang?: unknown; enhance?: unknown }
    if (typeof body.text !== 'string') return fail(400, 'invalid')
    const text = cleanText(body.text)
    if ([...text].length < 2 || [...text].length > config.maxPrompt) return fail(400, 'invalid')
    const language = LANGUAGES.includes(body.lang as Language) ? (body.lang as Language) : null
    const enhance = body.enhance !== false

    const running = activeOf(who)
    if (running) return running.original === text ? reply(200, { ...view(running), reused: true }) : fail(409, 'active', { id: running.id })
    const inFlight = creating.get(who)
    if (inFlight) return inFlight.text === text ? await inFlight.done : fail(409, 'active')

    const done = (async (): Promise<Reply> => {
      const refusal = allowance(who, 'preview', provider)
      if (refusal) return refusal
      try {
        const prepared = await withTimeout(25_000, (signal) => preparePrompt({ text, language, enhance, maxLength: config.maxPrepared }, config.writer, signal))
        note(who, { event: 'prompt-prepared', by: prepared.by })
        const task = await withTimeout(20_000, (signal) => provider.createPreview(prepared.prompt, signal))
        const job: Job = {
          id: crypto.randomUUID(),
          who,
          createdAt: now(),
          original: text,
          prepared: prepared.prompt,
          by: prepared.by,
          language,
          retries: 0,
          preview: newRecord(task),
          refine: null,
        }
        jobs.set(job.id, job)
        seen.set(job.id, now())
        counted(who, 'preview', job.id, task, prepared.by)
        persist(job)
        return reply(202, view(job))
      } catch (error) {
        note(who, { event: 'error', stage: 'preview', reason: error instanceof ProviderError ? error.code : 'unknown' })
        return providerFailure(error)
      }
    })()
    creating.set(who, { text, done })
    try {
      return await done
    } finally {
      creating.delete(who)
    }
  }

  async function startRefine(job: Job): Promise<Reply> {
    const provider = config.provider!
    if (!config.allowRefine || !provider.textures) return fail(409, 'no-refine')
    if (job.preview.state !== 'succeeded') return fail(409, 'no-preview')
    if (job.refine && !(job.refine.state === 'failed' || job.refine.state === 'cancelled')) return fail(409, 'already')
    if (job.retries >= MAX_RETRIES) return fail(409, 'not-retryable')
    const refusal = allowance(job.who, 'refine', provider)
    if (refusal) return refusal
    try {
      const task = await withTimeout(20_000, (signal) => provider.createRefine(job.preview.task, signal))
      if (job.refine) job.retries += 1
      job.refine = newRecord(task)
      counted(job.who, 'refine', job.id, task)
      persist(job)
      return reply(202, view(job))
    } catch (error) {
      note(job.who, { event: 'error', job: job.id, stage: 'refine', reason: error instanceof ProviderError ? error.code : 'unknown' })
      return providerFailure(error)
    }
  }

  async function retryJob(job: Job): Promise<Reply> {
    const provider = config.provider!
    const cur = current(job)
    const stage = currentStage(job)
    if ((cur.state !== 'failed' && cur.state !== 'cancelled') || NOT_RETRYABLE.includes(cur.failure ?? 'service') || job.retries >= MAX_RETRIES) return fail(409, 'not-retryable')
    if (activeOf(job.who)) return fail(409, 'active')
    // A copy that failed on our side is fetched again by asking the engine afresh; no new task, no new cost.
    if (cur.failure === 'download') {
      cur.state = 'running'
      cur.failure = null
      cur.nextPoll = 0
      cur.startedAt = now()
      job.retries += 1
      persist(job)
      return reply(202, view(job))
    }
    const refusal = allowance(job.who, stage, provider)
    if (refusal) return refusal
    try {
      const task = await withTimeout(20_000, (signal) => (stage === 'preview' ? provider.createPreview(job.prepared, signal) : provider.createRefine(job.preview.task, signal)))
      job.retries += 1
      if (stage === 'preview') job.preview = newRecord(task)
      else job.refine = newRecord(task)
      counted(job.who, stage, job.id, task)
      persist(job)
      return reply(202, view(job))
    } catch (error) {
      note(job.who, { event: 'error', job: job.id, stage, reason: error instanceof ProviderError ? error.code : 'unknown' })
      return providerFailure(error)
    }
  }

  async function cancelJob(job: Job): Promise<Reply> {
    const provider = config.provider!
    const cur = current(job)
    if (!ACTIVE.includes(cur.state)) return reply(200, view(job))
    let outcome: 'cancelled' | 'running' = 'running'
    try {
      outcome = await withTimeout(10_000, (signal) => provider.cancel(cur.task, signal))
    } catch {
      outcome = 'running'
    }
    cur.state = 'cancelled'
    cur.failure = 'cancelled'
    cur.progress = null
    cur.cancel = outcome === 'cancelled' ? 'stopped' : 'running-on'
    note(job.who, { event: 'task-cancelled', job: job.id, stage: currentStage(job), task: cur.task, reason: cur.cancel })
    if (outcome === 'cancelled') usage.settle(cur.task, 0)
    persist(job)
    return reply(200, view(job))
  }

  /** Copies a finished file to our own storage and checks it; the engine's address stops being needed. */
  function copyAsset(job: Job, stage: Stage, rec: StageRecord): void {
    const key = `${job.id}:${stage}`
    if (copying.has(key) || !rec.modelUrl) return
    const address = rec.modelUrl
    const run = async () => {
      let problem: StageFailure | null = null
      let bytes: Uint8Array | null = null
      for (let attempt = 0; attempt < 3 && !bytes && !problem; attempt++) {
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 90_000)
          try {
            const response = await config.provider!.download(address, controller.signal)
            bytes = await readCapped(response, config.maxModelBytes, () => controller.abort())
            if (!bytes) problem = 'too-large'
          } finally {
            clearTimeout(timer)
          }
        } catch {
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500))
          else problem = 'download'
        }
      }
      if (bytes) {
        const check = inspectGlb(bytes, config.maxModelBytes)
        if (!check.ok) problem = check.reason === 'too-large' ? 'too-large' : 'invalid-file'
      }
      if (rec.state !== 'processing') return // cancelled meanwhile
      if (problem || !bytes) {
        rec.state = 'failed'
        rec.failure = problem ?? 'download'
        note(job.who, { event: 'task-failed', job: job.id, stage, task: rec.task, reason: rec.failure })
      } else {
        const key = assetKey(job, stage === 'preview' ? 'preview' : 'final')
        try {
          await storage.putAsset(key, bytes)
        } catch {
          // The configured storage failed: keep the copy in memory, say so in the log, and carry on.
          await spare.putAsset(key, bytes)
          note(job.who, { event: 'error', job: job.id, stage, reason: 'storage-asset' })
        }
        rec.state = 'succeeded'
        rec.bytes = bytes.byteLength
        rec.modelUrl = null
        rec.progress = 1
        note(job.who, { event: 'asset-stored', job: job.id, stage, task: rec.task, bytes: bytes.byteLength })
      }
      persist(job)
    }
    copying.set(
      key,
      run().finally(() => copying.delete(key)),
    )
  }

  /** Asks the engine about the step in progress, no more often than it allows. */
  async function refresh(job: Job): Promise<void> {
    const provider = config.provider!
    const stage = currentStage(job)
    const rec = current(job)
    if (rec.state !== 'queued' && rec.state !== 'running') return
    if (now() - rec.startedAt > config.timeoutMs) {
      rec.state = 'failed'
      rec.failure = 'timeout'
      note(job.who, { event: 'task-failed', job: job.id, stage, task: rec.task, reason: 'timeout' })
      persist(job)
      return
    }
    const key = `${job.id}:${stage}`
    if (now() < rec.nextPoll || polling.has(key)) return
    polling.add(key)
    try {
      const report = await withTimeout(15_000, (signal) => provider.poll(rec.task, signal))
      if (current(job) !== rec || (rec.state !== 'queued' && rec.state !== 'running')) return
      rec.nextPoll = now() + Math.max(provider.minPollMs, report.retryAfterMs ?? 0)
      if (report.credits !== null) usage.settle(rec.task, report.credits)
      if (report.state === 'failed') {
        rec.state = 'failed'
        rec.failure = report.failure ?? 'service'
        rec.progress = null
        note(job.who, { event: 'task-failed', job: job.id, stage, task: rec.task, reason: rec.failure })
        persist(job)
      } else if (report.state === 'succeeded') {
        note(job.who, { event: 'task-finished', job: job.id, stage, task: rec.task, credits: report.credits ?? undefined })
        if (!report.modelUrl) {
          rec.state = 'failed'
          rec.failure = 'no-asset'
          persist(job)
        } else {
          rec.state = 'processing'
          rec.progress = null
          rec.modelUrl = report.modelUrl
          copyAsset(job, stage, rec)
        }
      } else {
        rec.state = report.state
        rec.progress = report.progress === null ? null : Math.min(1, Math.max(0, report.progress))
        rec.ahead = report.ahead
      }
    } catch (error) {
      if (error instanceof ProviderError && (error.code === 'auth' || error.code === 'credits' || error.code === 'rejected' || error.code === 'gone')) {
        rec.state = 'failed'
        rec.failure = 'service'
        note(job.who, { event: 'task-failed', job: job.id, stage, task: rec.task, reason: error.code })
        persist(job)
      } else {
        // A moment's trouble reaching the engine does not end the task: ask again a little later.
        rec.nextPoll = now() + Math.max(provider.minPollMs, error instanceof ProviderError ? (error.retryAfterMs ?? 0) : 0)
      }
    } finally {
      polling.delete(key)
    }
  }

  async function model(job: Job, which: 'preview' | 'final'): Promise<Response> {
    const rec = which === 'preview' ? job.preview : job.refine
    if (!rec || rec.state !== 'succeeded') return send(fail(409, 'not-ready'))
    const key = assetKey(job, which)
    const bytes = (await storage.getAsset(key).catch(() => null)) ?? (await spare.getAsset(key))
    if (!bytes) return send(fail(410, 'gone'))
    return new Response(bytes.slice().buffer, {
      headers: { 'content-type': 'model/gltf-binary', 'content-length': String(bytes.byteLength), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    })
  }

  return {
    async tick() {
      await load()
      lastTick = now()
      sweep()
      await Promise.allSettled([...jobs.values()].filter((job) => config.provider && ACTIVE.includes(current(job).state)).map((job) => refresh(job)))
    },
    async handle(request, client) {
      const url = new URL(request.url)
      const path = url.pathname.replace(/\/+$/, '') || '/'
      if (request.method === 'OPTIONS') {
        if (!originAllowed(request)) return send(fail(403, 'origin'))
        return cors(request, new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' } }))
      }
      if (!originAllowed(request)) return send(fail(403, 'origin'))
      await load()
      const who = pseudonym(client)

      let response: Response
      if (request.method === 'GET' && path === '/status') {
        sweep()
        const provider = config.provider
        response = send(
          reply(200, {
            available: provider !== null,
            provider: provider?.name ?? null,
            simulated: provider?.simulated ?? false,
            reason: provider ? null : (config.reason ?? 'no-provider'),
            maxPrompt: config.maxPrompt,
            enhancement: config.writer !== null,
            refine: provider !== null && config.allowRefine && provider.textures,
            remaining: Math.max(0, config.maxJobsPerHour - (tasksByWho.get(who) ?? []).length),
          }),
        )
      } else if (request.method === 'POST' && path === '/jobs') {
        if (!(request.headers.get('content-type') ?? '').includes('json')) response = send(fail(400, 'invalid'))
        else {
          let raw: unknown = null
          try {
            raw = await request.json()
          } catch {
            raw = null
          }
          response = send(raw === null ? fail(400, 'invalid') : await startJob(raw, who))
        }
      } else {
        const match = /^\/jobs\/([\w-]{1,64})(?:\/(model|refine|retry|cancel))?$/.exec(path)
        if (!config.provider) response = send(fail(503, config.reason ?? 'no-provider'))
        else if (!match) response = send(fail(404, 'not-found'))
        else {
          const job = jobs.get(match[1])
          const action = match[2]
          if (job) seen.set(job.id, now())
          if (!job || job.who !== who) response = send(fail(404, 'not-found'))
          else if (action === 'model' && request.method === 'GET') response = await model(job, url.searchParams.get('stage') === 'final' ? 'final' : 'preview')
          else if (action === 'refine' && request.method === 'POST') response = send(await startRefine(job))
          else if (action === 'retry' && request.method === 'POST') response = send(await retryJob(job))
          else if (action === 'cancel' && request.method === 'POST') response = send(await cancelJob(job))
          else if (!action && request.method === 'GET') {
            await refresh(job)
            response = send(reply(200, view(job)))
          } else response = send(fail(404, 'not-found'))
        }
      }
      return cors(request, response)
    },
  }
}
