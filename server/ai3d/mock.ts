import { ProviderError, type Stage, type Text3dProvider } from './provider.ts'

/**
 * A valid binary glTF 2.0 of a cube: the smallest real model there is. `colour` gives it a material
 * (a flat base colour), the way a textured model has one; without it the cube is plain, like a preview.
 */
export function makeCubeGlb(colour?: [number, number, number]): ArrayBuffer {
  const positions = new Float32Array([-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1])
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 5, 6, 1, 6, 2, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0])
  const binary = new Uint8Array(positions.byteLength + indices.byteLength)
  binary.set(new Uint8Array(positions.buffer), 0)
  binary.set(new Uint8Array(indices.buffer), positions.byteLength)
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'stand-in provider (a cube, not an AI model)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Cube' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, ...(colour ? { material: 0 } : {}) }] }],
    ...(colour ? { materials: [{ pbrMetallicRoughness: { baseColorFactor: [...colour, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } }] } : {}),
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1] },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
  })
  const pad = (length: number) => (4 - (length % 4)) % 4
  const jsonBytes = new TextEncoder().encode(json + ' '.repeat(pad(json.length)))
  const binPad = pad(binary.byteLength)
  const total = 12 + 8 + jsonBytes.byteLength + 8 + binary.byteLength + binPad
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.byteLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.set(jsonBytes, 20)
  const at = 20 + jsonBytes.byteLength
  view.setUint32(at, binary.byteLength + binPad, true)
  view.setUint32(at + 4, 0x004e4942, true)
  bytes.set(binary, at + 8)
  return out
}

export interface MockOptions {
  /** How many questions a task needs before it is done. */
  steps?: number
  /** Make the geometry task fail. */
  failPreview?: boolean
  /** Make the texturing task fail. */
  failRefine?: boolean
  /** Send this instead of a model file (to test that a bad file is refused). */
  file?: ArrayBuffer
  /** Whether it offers the second, texturing step. */
  textures?: boolean
}

/**
 * A stand-in provider for development and tests: it answers like a service but makes a cube. It is
 * chosen only by `AI3D_PROVIDER=mock`, names itself "Test model (a cube)" and says `simulated`, so
 * nobody mistakes its result for an AI model; it exists to exercise the whole path (jobs, both
 * stages, progress, download, checks, errors) without a paid account. Words in the prompt steer it so
 * a browser test can reach every state: `[fail]` fails the geometry, `[fail-texture]` the texturing,
 * `[credits]`, `[moderation]` and `[busy]` refuse the request, `[slow]` takes long.
 */
export function createMockProvider(options: MockOptions = {}): Text3dProvider {
  const steps = options.steps ?? 4
  const tasks = new Map<string, { stage: Stage; polls: number; steps: number; fail: boolean }>()
  let counter = 0
  return {
    id: 'mock',
    name: 'Test model (a cube)',
    simulated: true,
    textures: options.textures ?? true,
    minPollMs: 600,
    credits: (stage) => (stage === 'preview' ? 20 : 10),

    async createPreview(prompt) {
      if (prompt.includes('[credits]')) throw new ProviderError('credits', 'Stand-in: no credits.')
      if (prompt.includes('[moderation]')) throw new ProviderError('moderation', 'Stand-in: refused.')
      if (prompt.includes('[busy]')) throw new ProviderError('busy', 'Stand-in: busy.', 5000)
      const id = `mock-${++counter}`
      tasks.set(id, { stage: 'preview', polls: 0, steps: prompt.includes('[slow]') ? 40 : steps, fail: options.failPreview === true || prompt.includes('[fail]') })
      return id
    },
    async createRefine(previewTaskId) {
      if (!tasks.has(previewTaskId)) throw new ProviderError('gone', 'Stand-in: no such task.')
      const id = `mock-${++counter}`
      tasks.set(id, { stage: 'refine', polls: 0, steps, fail: options.failRefine === true })
      return id
    },
    async poll(taskId) {
      const task = tasks.get(taskId)
      if (!task) throw new ProviderError('gone', 'Stand-in: no such task.')
      task.polls += 1
      if (task.fail && task.polls >= 3) return { state: 'failed', progress: null, ahead: null, modelUrl: null, retryAfterMs: null, credits: 0, failure: 'service' }
      if (task.polls < task.steps) {
        return task.polls === 1
          ? { state: 'queued', progress: null, ahead: 1, modelUrl: null, retryAfterMs: null, credits: null, failure: null }
          : { state: 'running', progress: task.polls / task.steps, ahead: null, modelUrl: null, retryAfterMs: null, credits: null, failure: null }
      }
      return { state: 'succeeded', progress: 1, ahead: null, modelUrl: `mock://${task.stage}/${taskId}`, retryAfterMs: null, credits: task.stage === 'preview' ? 20 : 10, failure: null }
    },
    async cancel(taskId) {
      const task = tasks.get(taskId)
      // A task that has not started can be stopped; one that is running cannot, like the real service.
      return task && task.polls <= 1 ? 'cancelled' : 'running'
    },
    async download(modelUrl) {
      const file = options.file ?? makeCubeGlb(modelUrl.startsWith('mock://refine/') ? [0.86, 0.1, 0.14] : undefined)
      return new Response(file, { headers: { 'content-type': 'model/gltf-binary', 'content-length': String(file.byteLength) } })
    },
  }
}
