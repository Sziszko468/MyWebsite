import { createMeshyProvider, MESHY_MODELS, type MeshyModel, type TextureResolution } from './meshy.ts'
import { createMockProvider } from './mock.ts'
import { createAnthropicWriter, type MessagesClient, type PromptWriter } from './prompt.ts'
import type { Text3dProvider } from './provider.ts'

/**
 * Everything the server's behaviour depends on, read from the environment, so cost and exposure are
 * decided by whoever deploys it and not by the code. None of these names starts with `VITE_`, so none
 * of them can reach the browser bundle.
 *
 * The engine
 *   AI3D_PROVIDER            meshy | mock (default: meshy when MESHY_API_KEY is set, otherwise none)
 *   MESHY_API_KEY            the key; it lives only here
 *   AI3D_MESHY_MODEL         latest | meshy-7.1 | meshy-6 | meshy-6-lite (default latest)
 *   AI3D_MESHY_POLYCOUNT     triangles the mesh is reduced to, 100–300000 (default 30000)
 *   AI3D_MESHY_TEXTURE       2k | 4k | 8k texture size of the refine step (default 2k)
 *   AI3D_MESHY_PBR           0 to leave out the metallic/roughness/normal maps (default 1)
 *   AI3D_MESHY_MODERATION    0 to stop asking the engine to screen prompts (default 1)
 *   AI3D_ALLOW_REFINE        0 to offer the geometry preview only, never the dearer texturing (default 1)
 *
 * The prompt writer (optional)
 *   AI3D_LLM                 anthropic to rewrite descriptions into engine prompts (needs ANTHROPIC_API_KEY)
 *   AI3D_LLM_MODEL           default claude-opus-5-5; claude-haiku-5-5 is the cheaper, faster choice
 *   AI3D_MAX_PREPARED        longest rewritten prompt in characters (default 600, at most 800)
 *
 * Limits and cost
 *   AI3D_MAX_PROMPT          longest description a visitor may send, in characters (default 240)
 *   AI3D_MAX_JOBS_PER_HOUR   new models per visitor address (default 6)
 *   AI3D_MAX_REFINES_PER_HOUR texturing steps per visitor address (default 3)
 *   AI3D_MAX_JOBS_PER_DAY    new models in total (default 60)
 *   AI3D_MAX_CONCURRENT      tasks running at once, in total (default 3)
 *   AI3D_DAILY_CREDIT_BUDGET the most credits (the engine's estimated prices) to spend in 24 hours; unset = no cap
 *   AI3D_TIMEOUT_SECONDS     a task is given up after this long (default 3600: the engine asks for an hour's patience)
 *   AI3D_MAX_MODEL_BYTES     the biggest model file kept and passed on (default 52428800)
 *
 * Storage and exposure
 *   AI3D_STORAGE_DIR         keep jobs, models and a usage log on disk here (default: memory only)
 *   AI3D_KEEP_HOURS          how long jobs and stored models are kept (default 72, the engine's own retention)
 *   AI3D_ALLOWED_ORIGINS     comma-separated origins allowed to call it from another site (default none: same site only)
 *   AI3D_TRUST_PROXY         1 to take the visitor's address from X-Forwarded-For (only behind a proxy you control)
 */
export type UnavailableReason = 'no-provider' | 'no-key' | 'unknown-provider' | 'bad-model'

/** What to tell the owner (in the server's log, never a visitor) about why there is no engine. */
export const REASON_TEXT: Record<UnavailableReason, string> = {
  'no-provider': 'AI creation is off: no engine is configured (set MESHY_API_KEY, or AI3D_PROVIDER=mock to try the stand-in).',
  'no-key': 'AI creation is off: AI3D_PROVIDER is meshy but MESHY_API_KEY is not set.',
  'unknown-provider': 'AI creation is off: AI3D_PROVIDER names an engine this server does not know (meshy or mock).',
  'bad-model': 'AI creation is off: AI3D_MESHY_MODEL or AI3D_MESHY_TEXTURE is not one the engine offers (see .env.example).',
}

export interface Ai3dConfig {
  provider: Text3dProvider | null
  /** Why there is no provider, as a code the browser has words for. */
  reason: UnavailableReason | null
  writer: PromptWriter | null
  maxPrompt: number
  maxPrepared: number
  maxJobsPerHour: number
  maxRefinesPerHour: number
  maxJobsPerDay: number
  maxConcurrent: number
  dailyCreditBudget: number | null
  timeoutMs: number
  maxModelBytes: number
  keepMs: number
  allowRefine: boolean
  storageDir: string | null
  allowedOrigins: string[]
  trustProxy: boolean
  /** Where usage and error lines go (one JSON object per call). */
  log: (line: string) => void
}

type Env = Record<string, string | undefined>

const number = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && value !== undefined && value !== '' ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback
}
const flag = (value: string | undefined, fallback: boolean) => (value === undefined || value === '' ? fallback : value !== '0' && value.toLowerCase() !== 'false')

export interface ConfigDeps {
  fetchImpl?: typeof fetch
  /** A stand-in for the Anthropic client, for tests. */
  llmClient?: MessagesClient
  log?: (line: string) => void
}

export function readConfig(env: Env, deps: ConfigDeps = {}): Ai3dConfig {
  const wanted = (env.AI3D_PROVIDER ?? '').trim().toLowerCase() || (env.MESHY_API_KEY ? 'meshy' : '')
  let provider: Text3dProvider | null = null
  let reason: UnavailableReason | null = 'no-provider'
  if (wanted === 'meshy') {
    const model = (env.AI3D_MESHY_MODEL || 'latest') as MeshyModel
    const texture = (env.AI3D_MESHY_TEXTURE || '2k').toLowerCase()
    if (!env.MESHY_API_KEY) reason = 'no-key'
    else if (!MESHY_MODELS.includes(model) || !['2k', '4k', '8k'].includes(texture)) reason = 'bad-model'
    else {
      provider = createMeshyProvider({
        apiKey: env.MESHY_API_KEY,
        model,
        polycount: number(env.AI3D_MESHY_POLYCOUNT, 30_000, 100, 300_000),
        textureResolution: texture as TextureResolution,
        pbr: flag(env.AI3D_MESHY_PBR, true),
        moderation: flag(env.AI3D_MESHY_MODERATION, true),
        fetchImpl: deps.fetchImpl,
      })
      reason = null
    }
  } else if (wanted === 'mock') {
    provider = createMockProvider()
    reason = null
  } else if (wanted) {
    reason = 'unknown-provider'
  }

  const maxPrompt = number(env.AI3D_MAX_PROMPT, 240, 20, 800)
  const writer =
    (env.AI3D_LLM ?? '').toLowerCase() === 'anthropic' && (env.ANTHROPIC_API_KEY || deps.llmClient)
      ? createAnthropicWriter({ apiKey: env.ANTHROPIC_API_KEY ?? '', model: env.AI3D_LLM_MODEL || undefined, client: deps.llmClient })
      : null
  const budget = number(env.AI3D_DAILY_CREDIT_BUDGET, 0, 0, 10_000_000)
  return {
    provider,
    reason,
    writer,
    maxPrompt,
    maxPrepared: Math.max(maxPrompt, number(env.AI3D_MAX_PREPARED, 600, 100, 800)),
    maxJobsPerHour: number(env.AI3D_MAX_JOBS_PER_HOUR, 6, 1, 1000),
    maxRefinesPerHour: number(env.AI3D_MAX_REFINES_PER_HOUR, 3, 0, 1000),
    maxJobsPerDay: number(env.AI3D_MAX_JOBS_PER_DAY, 60, 1, 100000),
    maxConcurrent: number(env.AI3D_MAX_CONCURRENT, 3, 1, 50),
    dailyCreditBudget: budget > 0 ? budget : null,
    timeoutMs: number(env.AI3D_TIMEOUT_SECONDS, 3600, 10, 7200) * 1000,
    maxModelBytes: number(env.AI3D_MAX_MODEL_BYTES, 52_428_800, 100_000, 200_000_000),
    keepMs: number(env.AI3D_KEEP_HOURS, 72, 1, 24 * 90) * 60 * 60_000,
    allowRefine: flag(env.AI3D_ALLOW_REFINE, true),
    storageDir: (env.AI3D_STORAGE_DIR ?? '').trim() || null,
    allowedOrigins: (env.AI3D_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: env.AI3D_TRUST_PROXY === '1',
    log: deps.log ?? ((line) => console.info(`[ai3d] ${line}`)),
  }
}
