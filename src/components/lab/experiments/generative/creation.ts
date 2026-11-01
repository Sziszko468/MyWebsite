import { createHandoff } from '../../experience/handoff'
import { MAX_PROMPT } from './interpret'
import { DEFAULT_LOOK, sanitizeLook, sanitizeSpec, type Look, type ObjectSpec } from './spec'

/**
 * A creation as it is kept: the words it came from, how it is dressed, and either what the Quick builder
 * understood (a spec and a seed, which make the same object again) or the record of an AI model (which
 * engine made it, the prompt the engine got, the task numbers, the stage, and where the model file is
 * kept in this browser). It is plain data, so it is small, it can be downloaded as a file and it is
 * checked again every time it comes back from the browser's storage. The model file itself is not in
 * here: it is a binary in the browser's own database, under the key the record names.
 */
export interface AiMeta {
  /** The engine's name, as it named itself. */
  provider: string
  /** True when the "engine" is a stand-in that makes a cube. */
  simulated: boolean
  /** What the engine was actually sent (the visitor's words, or the rewritten prompt). */
  prepared: string
  enhanced: boolean
  /** This site's job number and the engine's task numbers (opaque; they identify the work, nothing more). */
  job: string | null
  tasks: { preview: string | null; final: string | null }
  /** Whether the kept model is the untextured geometry or the textured result. */
  stage: 'preview' | 'final'
  format: 'glb'
  bytes: number
  /** When the engine finished it, milliseconds since 1970. */
  createdAt: number
  /** Where the file is kept in this browser, or null when it could not be kept. */
  model: { store: 'indexeddb'; key: string } | null
}

export interface Creation {
  version: 2
  prompt: string
  title: string
  source: 'quick' | 'ai'
  /** What the Quick builder understood; null for an AI creation. */
  spec: ObjectSpec | null
  seed: number
  look: Look
  ai: AiMeta | null
}

export const MAX_TITLE = 60
const MAX_PREPARED = 800

const clean = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return ''
  let out = ''
  for (const char of value) if (char.charCodeAt(0) >= 32 && !'<>`\\'.includes(char)) out += char
  return out.replace(/\s+/g, ' ').trim().slice(0, max)
}

const ID = /^[\w-]{1,80}$/
const id = (value: unknown): string | null => (typeof value === 'string' && ID.test(value) ? value : null)
const count = (value: unknown, max: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0)

function sanitizeAi(raw: unknown): AiMeta | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const provider = clean(r.provider, 40)
  if (!provider) return null
  const tasks = (typeof r.tasks === 'object' && r.tasks !== null ? r.tasks : {}) as Record<string, unknown>
  const model = (typeof r.model === 'object' && r.model !== null ? r.model : null) as Record<string, unknown> | null
  const key = model && model.store === 'indexeddb' ? id(model.key) : null
  return {
    provider,
    simulated: r.simulated === true,
    prepared: clean(r.prepared, MAX_PREPARED),
    enhanced: r.enhanced === true,
    job: id(r.job),
    tasks: { preview: id(tasks.preview), final: id(tasks.final) },
    stage: r.stage === 'final' ? 'final' : 'preview',
    format: 'glb',
    bytes: count(r.bytes, 1e9),
    createdAt: count(r.createdAt, 1e14),
    model: key ? { store: 'indexeddb', key } : null,
  }
}

/** Accepts only a creation; anything else gives null. Numbers are clamped and ids checked. Older (version 1) Quick creations are still read. */
export function sanitizeCreation(raw: unknown): Creation | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1 && r.version !== 2) return null
  const prompt = clean(r.prompt, MAX_PROMPT)
  if (!prompt) return null
  const seed = typeof r.seed === 'number' && Number.isFinite(r.seed) ? Math.abs(Math.floor(r.seed)) % 1_000_000 : 0
  const title = clean(r.title, MAX_TITLE) || prompt.slice(0, MAX_TITLE)
  const look = sanitizeLook(r.look ?? DEFAULT_LOOK)

  if (r.version === 2 && r.source === 'ai') {
    const ai = sanitizeAi(r.ai)
    return ai ? { version: 2, prompt, title, source: 'ai', spec: null, seed, look, ai } : null
  }
  // Version 1 AI creations carried a model file inside the record; those were never from a real engine, so they open as Quick ones.
  const spec = sanitizeSpec(r.spec)
  return spec ? { version: 2, prompt, title, source: 'quick', spec, seed, look, ai: null } : null
}

export function creationPayload(creation: Creation): Record<string, unknown> {
  return { ...creation }
}

/** Where the gallery hands a creation to the page that opens it. */
export const creationHandoff = createHandoff<Creation>()
