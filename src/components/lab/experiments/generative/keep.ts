import { saveArtifact } from '../../artifacts/artifactActions'
import { artifacts, type FailReason } from '../../artifacts/artifactDb'
import type { AiOptions } from './aiClient'
import { creationPayload, type Creation } from './creation'
import { validateGlb } from './glb'
import { loadCreation, type Current } from './genStore'

/**
 * Keeping a creation in this browser and opening it again. The record (words, look, the engine's
 * details) goes in the works store; an AI model file, several megabytes, goes beside it in the
 * browser's database under a key the record names. If the file does not fit, the record is still kept
 * and says so, and the visitor is told to download the GLB.
 */
export type KeepResult = { ok: true; persistent: boolean; modelKept: boolean } | { ok: false; reason: FailReason }

const newKey = () => `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e8).toString(36)}`

export async function keepCreation(input: { current: Current; title: string; stage: 'preview' | 'final' | null; model: ArrayBuffer | null; thumbnail?: string }): Promise<KeepResult> {
  const { current, title } = input
  const service = await artifacts()
  let key: string | null = null
  let modelKept = false

  let creation: Creation
  if (current.source === 'ai') {
    if (input.model) {
      const candidate = newKey()
      try {
        await service.files.put(candidate, input.model)
        key = candidate
        modelKept = true
      } catch {
        // A full browser: the record is still worth keeping.
        key = null
      }
    }
    creation = {
      version: 2,
      prompt: current.prompt,
      title: title.slice(0, 60),
      source: 'ai',
      spec: null,
      seed: 0,
      look: current.look,
      ai: { ...current.ai, stage: input.stage ?? current.ai.stage, bytes: input.model?.byteLength ?? current.ai.bytes, model: key ? { store: 'indexeddb', key } : null },
    }
  } else {
    creation = { version: 2, prompt: current.prompt, title: title.slice(0, 60), source: 'quick', spec: current.spec, seed: current.seed, look: current.look, ai: null }
  }

  const result = await saveArtifact({ type: 'creation', name: title, payload: creationPayload(creation), thumbnail: input.thumbnail })
  if (!result.ok) {
    if (key) await service.files.remove(key).catch(() => undefined)
    return result
  }
  return { ok: true, persistent: result.persistent, modelKept: current.source === 'ai' ? modelKept : false }
}

/** The model file kept with a creation, checked again; null if there is none or it is damaged. */
export async function readKeptModel(creation: Creation): Promise<ArrayBuffer | null> {
  const key = creation.ai?.model?.key
  if (!key) return null
  try {
    const buffer = await (await artifacts()).files.get(key)
    return buffer && validateGlb(buffer).ok ? buffer : null
  } catch {
    return null
  }
}

/** Puts a kept creation on the stage, fetching its model file first. */
export async function openCreation(creation: Creation, options?: AiOptions): Promise<void> {
  loadCreation(creation, creation.source === 'ai' ? await readKeptModel(creation) : null, options)
}

/** Removes the model file that belonged to a deleted creation. */
export async function forgetKeptModel(creation: Creation | null): Promise<void> {
  const key = creation?.ai?.model?.key
  if (!key) return
  try {
    await (await artifacts()).files.remove(key)
  } catch {
    // Nothing to remove, or the browser would not: the record is gone either way.
  }
}
