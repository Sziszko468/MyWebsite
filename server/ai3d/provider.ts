/**
 * The seam between this site and a text-to-3D service. The handler knows only this interface; a
 * provider is one file that turns it into a real service's requests. To change provider (Tripo, Rodin…):
 * write another file that returns a `Text3dProvider` and choose it in `config.ts`. Nothing in the
 * browser changes, because the browser never sees a provider: it talks to this server, which holds the
 * credentials.
 *
 * Making a model is two tasks, and the visitor decides about the second: a PREVIEW makes the untextured
 * geometry, a REFINE textures a preview that has succeeded. A provider that cannot texture says so with
 * `textures: false` and the handler never offers the second step.
 */
export type Stage = 'preview' | 'refine'

export type TaskState = 'queued' | 'running' | 'succeeded' | 'failed'

/** Why a task failed, in this site's words (the provider's own wording never reaches the browser). */
export type FailureKind = 'moderation' | 'invalid' | 'timeout' | 'service'

export interface TaskReport {
  state: TaskState
  /** 0 to 1 of this task, only when the service really reports it; null otherwise. Never invented. */
  progress: number | null
  /** Tasks ahead in the service's queue, when it says so. */
  ahead: number | null
  /** Where the finished model can be fetched from, as the provider says. Only `download` may use it. */
  modelUrl: string | null
  /** How long the service asked to wait before asking again. */
  retryAfterMs: number | null
  /** Credits the service says this task cost. Kept on the server for the budget; never sent to the browser. */
  credits: number | null
  /** Set when `state` is `failed`. */
  failure: FailureKind | null
}

export type ProviderErrorCode = 'auth' | 'credits' | 'rate-limit' | 'busy' | 'rejected' | 'moderation' | 'gone' | 'upstream'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly retryAfterMs: number | null
  constructor(code: ProviderErrorCode, message: string, retryAfterMs: number | null = null) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.retryAfterMs = retryAfterMs
  }
}

export interface Text3dProvider {
  /** A short stable name for logs and the status answer. */
  readonly id: string
  /** What the visitor sees next to a model it made. Honest: a stand-in says so. */
  readonly name: string
  /** True for a stand-in that makes a cube, never for a real service. The browser says so on stage. */
  readonly simulated: boolean
  /** Whether a second, texturing task exists. */
  readonly textures: boolean
  /** The shortest time between two questions about one task. */
  readonly minPollMs: number
  /** What a task is expected to cost, in the service's credits, for the budget. An estimate; `TaskReport.credits` is the truth. */
  credits(stage: Stage): number
  /** Starts the geometry from a prompt. Resolves with the provider's own task id. */
  createPreview(prompt: string, signal: AbortSignal): Promise<string>
  /** Starts texturing of a preview that has succeeded. */
  createRefine(previewTaskId: string, signal: AbortSignal): Promise<string>
  /** Asks how a task is doing. */
  poll(taskId: string, signal: AbortSignal): Promise<TaskReport>
  /** Tries to stop a task. `running` means the service could not: it carries on (and may still charge). */
  cancel(taskId: string, signal: AbortSignal): Promise<'cancelled' | 'running'>
  /** Fetches a finished model. It must refuse any address that is not the provider's own. */
  download(modelUrl: string, signal: AbortSignal): Promise<Response>
}
