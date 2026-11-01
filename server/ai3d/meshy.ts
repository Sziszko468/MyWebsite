import { ProviderError, type FailureKind, type Stage, type TaskReport, type Text3dProvider } from './provider.ts'

/**
 * Meshy's text-to-3D API, written from its published documentation (read 2026-11-01):
 *
 *   docs.meshy.ai/en/api/text-to-3d      endpoints, fields, task object
 *   docs.meshy.ai/en/api/task-lifecycle  statuses, polling (Retry-After, else every 5 s), 60 min patience
 *   docs.meshy.ai/en/api/errors          401 / 402 / 403 / 404 / 409 / 429, task_error { type, code, message }
 *   docs.meshy.ai/en/api/rate-limits     429 "Rate limit exceeded" (+ Retry-After) vs "NoMorePendingTasks…"
 *   docs.meshy.ai/en/api/pricing         credits per task
 *   docs.meshy.ai/en/api/asset-retention files kept 3 days at most, signed URLs on assets.meshy.ai
 *
 *   POST   {base}/openapi/v2/text-to-3d  { mode: 'preview', prompt, ai_model, … }       -> { result: <task id> }
 *   POST   {base}/openapi/v2/text-to-3d  { mode: 'refine', preview_task_id, … }         -> { result: <task id> }
 *   GET    {base}/openapi/v2/text-to-3d/:id   -> { status: PENDING | IN_PROGRESS | SUCCEEDED | FAILED | CANCELED,
 *                                                 progress: 0..100, preceding_tasks, model_urls: { glb }, task_error }
 *   DELETE {base}/openapi/v2/text-to-3d/:id   -> 200 (a PENDING task is refunded) | 409 while IN_PROGRESS
 *   Authorization: Bearer <key>
 *
 * Deliberately not used: the unprefixed /v2/text-to-3d path (deprecated 2026-09-29), `art_style`,
 * `ultra_mode`, `hd_texture`, `symmetry_mode` (deprecated), and the retired models meshy-5 and meshy-t1.
 * The shared test-mode key was retired by Meshy on 2026-09-16, so there is no free way to try this
 * adapter against the live service: it needs a paid account's key.
 *
 * Status: written from the documents above and exercised against a stand-in that answers the way they
 * describe (ai3d.test.ts). It has NOT been run against the live service, so every field name, limit and
 * message here is as documented, not as observed.
 */
export const MESHY_MODELS = ['latest', 'meshy-7.1', 'meshy-6', 'meshy-6-lite'] as const
export type MeshyModel = (typeof MESHY_MODELS)[number]
export type TextureResolution = '2k' | '4k' | '8k'

export interface MeshyOptions {
  apiKey: string
  baseUrl?: string
  /** `latest` (Meshy 7.1) by default. */
  model?: MeshyModel
  /** Triangles the mesh is reduced to (100–300000); fewer is lighter on a phone. */
  polycount?: number
  textureResolution?: TextureResolution
  /** Metallic, roughness and normal maps on the textured model (larger file). */
  pbr?: boolean
  /** Ask Meshy to screen the prompt; a refused one makes no task. */
  moderation?: boolean
  fetchImpl?: typeof fetch
}

const MESHY_HOSTS = ['assets.meshy.ai']
/** Credits per task, from the pricing page (2026-11-01). An estimate for the budget; the task reports what it really cost. */
const PREVIEW_CREDITS: Record<MeshyModel, number> = { latest: 20, 'meshy-7.1': 20, 'meshy-6': 20, 'meshy-6-lite': 5 }
const REFINE_CREDITS: Record<TextureResolution, number> = { '2k': 10, '4k': 10, '8k': 15 }
const TASK_ID = /^[\w-]{1,80}$/

/** Texture sizes above 2k need a model that supports them. */
export function textureResolutionFor(model: MeshyModel, wanted: TextureResolution): TextureResolution {
  return wanted !== '2k' && model === 'meshy-6-lite' ? '2k' : wanted
}

export function createMeshyProvider(options: MeshyOptions): Text3dProvider {
  const base = (options.baseUrl ?? 'https://api.meshy.ai').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? fetch
  const model = options.model ?? 'latest'
  const polycount = Math.min(300_000, Math.max(100, Math.floor(options.polycount ?? 30_000)))
  const resolution = textureResolutionFor(model, options.textureResolution ?? '2k')

  const call = async (
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    signal: AbortSignal,
    body?: unknown,
  ): Promise<{ body: Record<string, unknown>; retryAfterMs: number | null }> => {
    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        signal,
        headers: { authorization: `Bearer ${options.apiKey}`, ...(body ? { 'content-type': 'application/json' } : {}), accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      // Only the kind of failure is kept: an error from the network layer can carry the request's details.
      throw new ProviderError('upstream', error instanceof Error && error.name === 'AbortError' ? 'The service did not answer in time.' : 'The service could not be reached.')
    }
    const seconds = Number(response.headers.get('retry-after'))
    const retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 600) * 1000 : null
    const text = response.ok ? '' : await response.text().catch(() => '')
    if (response.status === 401 || response.status === 403) throw new ProviderError('auth', 'The service refused the key.')
    if (response.status === 402) throw new ProviderError('credits', 'The account has no credits (or is on a free plan).')
    if (response.status === 404) throw new ProviderError('gone', 'The service no longer has that task.')
    if (response.status === 409) throw new ProviderError('rejected', 'The task is in a state that does not allow that.')
    if (response.status === 429) {
      // "NoMorePendingTasks…" / "NoMoreConcurrentTasks…" mean too many tasks at once (no Retry-After); the plain message is a request-rate limit.
      throw new ProviderError(/NoMore(Pending|Concurrent)Tasks/i.test(text) ? 'busy' : 'rate-limit', 'The service is limiting requests.', retryAfterMs)
    }
    if (response.status === 400) {
      throw new ProviderError(options.moderation && /moderat|harm|safety|inappropriate|policy/i.test(text) ? 'moderation' : 'rejected', 'The service refused the request.')
    }
    if (!response.ok) throw new ProviderError('upstream', `The service answered ${response.status}.`)
    let parsed: unknown = {}
    if (method !== 'DELETE') {
      try {
        parsed = await response.json()
      } catch {
        throw new ProviderError('upstream', 'The service sent an answer that could not be read.')
      }
    }
    return { body: typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}, retryAfterMs }
  }

  const taskId = (answer: Record<string, unknown>): string => {
    const id = answer.result
    if (typeof id !== 'string' || !TASK_ID.test(id)) throw new ProviderError('upstream', 'The service sent no task id.')
    return id
  }

  const failureOf = (task: Record<string, unknown>): FailureKind => {
    const error = (task.task_error ?? {}) as { type?: unknown; code?: unknown }
    if (typeof error.code === 'string' && error.code.startsWith('moderation_blocked')) return 'moderation'
    if (error.type === 'invalid_input') return 'invalid'
    if (error.type === 'timeout') return 'timeout'
    return 'service'
  }

  return {
    id: 'meshy',
    name: 'Meshy',
    simulated: false,
    textures: true,
    minPollMs: 5000,
    credits: (stage: Stage) => (stage === 'preview' ? PREVIEW_CREDITS[model] : REFINE_CREDITS[resolution]),

    async createPreview(prompt, signal) {
      const { body } = await call('POST', '/openapi/v2/text-to-3d', signal, {
        mode: 'preview',
        prompt,
        ai_model: model,
        should_remesh: true,
        topology: 'triangle',
        target_polycount: polycount,
        target_formats: ['glb'],
        moderation: options.moderation === true,
      })
      return taskId(body)
    },

    async createRefine(previewTaskId, signal) {
      if (!TASK_ID.test(previewTaskId)) throw new ProviderError('rejected', 'Not a task id.')
      // `ai_model` is left out on purpose: a refine takes the preview's model, and a mismatch is a 400.
      const { body } = await call('POST', '/openapi/v2/text-to-3d', signal, {
        mode: 'refine',
        preview_task_id: previewTaskId,
        enable_pbr: options.pbr !== false,
        texture_resolution: resolution,
        target_formats: ['glb'],
      })
      return taskId(body)
    },

    async poll(id, signal): Promise<TaskReport> {
      if (!TASK_ID.test(id)) throw new ProviderError('rejected', 'Not a task id.')
      const { body: task, retryAfterMs } = await call('GET', `/openapi/v2/text-to-3d/${id}`, signal)
      const status = String(task.status ?? '')
      const percent = typeof task.progress === 'number' && Number.isFinite(task.progress) ? Math.min(100, Math.max(0, task.progress)) : 0
      const urls = (task.model_urls ?? {}) as Record<string, unknown>
      const credits = typeof task.consumed_credits === 'number' && Number.isFinite(task.consumed_credits) ? task.consumed_credits : null
      if (status === 'SUCCEEDED') {
        return { state: 'succeeded', progress: 1, ahead: null, modelUrl: typeof urls.glb === 'string' ? urls.glb : null, retryAfterMs, credits, failure: null }
      }
      if (status === 'FAILED' || status === 'CANCELED') {
        return { state: 'failed', progress: null, ahead: null, modelUrl: null, retryAfterMs: null, credits: 0, failure: status === 'CANCELED' ? 'service' : failureOf(task) }
      }
      const ahead = typeof task.preceding_tasks === 'number' && task.preceding_tasks > 0 ? Math.floor(task.preceding_tasks) : null
      // Meshy says progress is 0 until a task starts; 0 is "not known yet", not a measurement.
      return {
        state: status === 'IN_PROGRESS' ? 'running' : 'queued',
        progress: status === 'IN_PROGRESS' && percent > 0 ? percent / 100 : null,
        ahead: status === 'PENDING' ? ahead : null,
        modelUrl: null,
        retryAfterMs,
        credits,
        failure: null,
      }
    },

    async cancel(id, signal) {
      if (!TASK_ID.test(id)) return 'running'
      try {
        await call('DELETE', `/openapi/v2/text-to-3d/${id}`, signal)
        return 'cancelled'
      } catch (error) {
        // 409: the task is already running and cannot be stopped; any other trouble also leaves it running.
        if (error instanceof ProviderError) return 'running'
        throw error
      }
    },

    async download(modelUrl, signal) {
      const url = new URL(modelUrl)
      if (url.protocol !== 'https:' || !MESHY_HOSTS.includes(url.hostname)) throw new ProviderError('rejected', 'The model is not at the provider’s address.')
      return fetchImpl(url, { signal, redirect: 'error' })
    },
  }
}
