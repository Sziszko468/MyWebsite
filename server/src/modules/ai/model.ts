import type { LanguageModel } from 'ai'

/**
 * THE MODEL LOCK (PROMPT 16.1).
 *
 * CONTROL ROOM AI runs on exactly one model: Anthropic Claude Haiku 5.5. The identifier below is a constant in code, not a
 * setting: there is no environment variable, no administration field, no request parameter and no fallback list that can
 * name another model. Changing it is a developer's act (edit this file, review it, deploy it), which is what "require an
 * explicit developer configuration update" means when Anthropic renames or retires the identifier.
 *
 * Two things make the lock more than a naming convention:
 *
 *  1. `createAiModel` is the ONLY place the Anthropic provider is instantiated, and it is only ever asked for `AI_MODEL_ID`.
 *     A model handed to the gateway from anywhere else (a test's mock) must still be called `AI_MODEL_ID` by a provider whose
 *     name starts with `anthropic`, or `guardModel` refuses it. A bare string would be resolved by the AI SDK through the
 *     Vercel AI Gateway (another provider); `guardModel` refuses strings.
 *  2. `guardModel` wraps the model so that every response is checked against the identifier the provider REPORTS back
 *     (`message.model` in Anthropic's reply), not against the one we asked for: a request that was answered by anything else
 *     fails with a `ModelLockError` before the visitor sees a word of it, and is recorded as a failed verification.
 *
 * `server/test/aiModelLock.test.ts` fails if another model identifier, provider package or fallback construct appears in the
 * server's source.
 */

export const AI_PROVIDER = 'anthropic'
export const AI_PROVIDER_NAME = 'Anthropic'
export const AI_MODEL_ID = 'claude-haiku-5-5'
export const AI_MODEL_NAME = 'Claude Haiku 5.5'

/** What a visitor is told when the model cannot be verified. The wording is fixed by the brief; the website translates it. */
export const MODEL_UNVERIFIED_MESSAGE = 'CONTROL ROOM AI is temporarily unavailable. The required AI model could not be verified.'

export type ModelLockCode = 'model_mismatch' | 'model_not_anthropic' | 'model_not_locked'

/** The model that answered (or was about to answer) was not the required one. Carries identifiers only: never a key or a prompt. */
export class ModelLockError extends Error {
  readonly code: ModelLockCode
  readonly reported: string | null
  constructor(code: ModelLockCode, reported: string | null = null) {
    super(`${code}: required ${AI_MODEL_ID}, got ${reported ?? 'none'}`)
    this.name = 'ModelLockError'
    this.code = code
    this.reported = reported
  }
}

/** What one request learned about the identity of the model that answered it. */
export class ModelObservation {
  /** The identifier the provider reported (null: it reported none). */
  reported: string | null = null
  /** The first reported identifier that was not the required one. */
  mismatch: string | null = null

  /** Records a reported identifier; anything but the exact required identifier is a mismatch and is refused. */
  see(modelId: string | undefined): void {
    if (modelId === undefined) return
    this.reported ??= modelId
    if (modelId !== AI_MODEL_ID) {
      this.mismatch ??= modelId
      throw new ModelLockError('model_mismatch', modelId)
    }
  }

  /** True only when the provider said, in its own reply, that Claude Haiku 5.5 answered. */
  get verified(): boolean {
    return this.mismatch === null && this.reported === AI_MODEL_ID
  }
}

export type LockedModel = Exclude<LanguageModel, string>

interface ModelLike {
  specificationVersion?: unknown
  modelId?: unknown
  provider?: unknown
}

/** Refuses anything that is not the required model of the Anthropic provider: strings, other identifiers, other providers. */
export function assertLockedModel(model: unknown): LockedModel {
  const candidate = model as ModelLike | null
  if (typeof model === 'string' || candidate === null || typeof candidate !== 'object') throw new ModelLockError('model_not_locked', typeof model === 'string' ? model : null)
  if (candidate.modelId !== AI_MODEL_ID) throw new ModelLockError('model_not_locked', typeof candidate.modelId === 'string' ? candidate.modelId : null)
  if (typeof candidate.provider !== 'string' || !candidate.provider.startsWith(AI_PROVIDER)) throw new ModelLockError('model_not_anthropic', typeof candidate.provider === 'string' ? candidate.provider : null)
  return model as LockedModel
}

/**
 * The real model: the Anthropic provider asked for `AI_MODEL_ID`, nothing else. The key and the address come from the
 * server's own configuration (never from a request). The provider's package is loaded when the model is first needed.
 */
export async function createAiModel(options: { apiKey: string; baseUrl: string | null }): Promise<LockedModel> {
  const { createAnthropic } = await import('@ai-sdk/anthropic')
  const provider = createAnthropic({ apiKey: options.apiKey, ...(options.baseUrl ? { baseURL: options.baseUrl } : {}) })
  return assertLockedModel(provider(AI_MODEL_ID))
}

/**
 * Wraps a model so that what the provider reports about itself is checked on every call (streamed or not). `observation`
 * collects the result for the caller: the gateway stores it with the request, the connection test turns it into evidence.
 */
export async function guardModel(model: unknown, observation: ModelObservation): Promise<LockedModel> {
  const locked = assertLockedModel(model)
  const { wrapLanguageModel } = await import('ai')
  return wrapLanguageModel({
    model: locked as Parameters<typeof wrapLanguageModel>[0]['model'],
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate }) => {
        const result = await doGenerate()
        observation.see(result.response?.modelId)
        return result
      },
      wrapStream: async ({ doStream }) => {
        const { stream, ...rest } = await doStream()
        return {
          ...rest,
          stream: stream.pipeThrough(
            new TransformStream({
              transform(part, controller) {
                // `response-metadata` is the provider's own statement of who answered; it comes before any content.
                if (part.type === 'response-metadata') {
                  try {
                    observation.see(part.modelId)
                  } catch (error) {
                    // Another model answered: the error is passed on as the stream's error part and the stream ends, so nothing
                    // that model wrote is ever passed on (and the connection is closed cleanly, not torn down).
                    controller.enqueue({ type: 'error', error })
                    controller.terminate()
                    return
                  }
                }
                controller.enqueue(part)
              },
            }),
          ),
        }
      },
    },
  })
}
