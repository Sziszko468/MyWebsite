import { beforeEach, describe, expect, it } from 'vitest'
import { makeCubeGlb } from '../../../../../server/ai3d/mock'
import { AiError, createJob, fetchModel, fetchStatus, followJob, jobAction, parseJob, sleep, type AiOptions } from './aiClient'
import type { Creation } from './creation'
import { validateGlb } from './glb'
import {
  cancelAi,
  gen,
  generate,
  loadCreation,
  newIdea,
  patchLook,
  patchSpec,
  randomiseLook,
  refineAi,
  regenerate,
  resetGenerator,
  resetLook,
  retryAi,
  setMode,
  showModel,
  startAi,
  suggestIdea,
  toggleAccessory,
} from './genStore'
import { ACCESSORIES, BACKGROUNDS, DEFAULT_LOOK, LIGHTS, MATERIALS, defaultSpec } from './spec'

/*
 * A stand-in for this site's AI endpoint, written to answer the way server/ai3d/handler.ts does. It is a
 * test double: nothing here is an AI model, and nothing in this file claims a real engine works.
 */
interface EngineOptions {
  available?: boolean
  reason?: string
  /** How many questions each step needs before it is done. */
  steps?: number
  failPreview?: 'service' | 'moderation'
  failRefine?: boolean
  file?: ArrayBuffer
  /** Answer the job-creating request with this error instead. */
  refuse?: { status: number; error: string; id?: string }
  html?: boolean
  canRefine?: boolean
  prompt?: string
}

function engine(options: EngineOptions = {}) {
  const calls: string[] = []
  const steps = options.steps ?? 4
  let polls = 0
  let stage: 'preview' | 'refine' = 'preview'
  let state: 'queued' | 'running' | 'processing' | 'succeeded' | 'failed' | 'cancelled' = 'queued'
  let failure: string | null = null
  let cancel: string | null = null
  let retries = 0
  const view = (extra: object = {}) => ({
    id: 'job-1',
    prompt: options.prompt ?? 'a frog',
    prepared: 'A green frog, glossy skin.',
    enhanced: true,
    stage,
    status: state,
    progress: state === 'running' && polls > 1 ? Math.min(0.9, polls / (steps + 1)) : null,
    ahead: state === 'queued' ? 2 : null,
    error: state === 'failed' || state === 'cancelled' ? failure : null,
    cancel,
    preview: { status: stage === 'refine' || state === 'succeeded' ? 'succeeded' : state, bytes: stage === 'refine' || state === 'succeeded' ? 1200 : 0 },
    final: stage === 'refine' ? { status: state, bytes: state === 'succeeded' ? 1500 : 0 } : null,
    tasks: { preview: 'task-p', final: stage === 'refine' ? 'task-r' : null },
    canRefine: (options.canRefine ?? true) && stage === 'preview' && state === 'succeeded',
    canRetry: state === 'failed' && failure !== 'moderation' && retries < 3,
    simulated: true,
    createdAt: 1_700_000_000_000,
    ...extra,
  })
  const advance = () => {
    if (state === 'failed' || state === 'cancelled' || state === 'succeeded') return
    polls++
    const failing = stage === 'preview' ? options.failPreview : options.failRefine ? 'service' : undefined
    if (failing && polls >= 3) {
      state = 'failed'
      failure = failing
    } else if (polls >= steps + 1) state = 'succeeded'
    else if (polls >= steps) state = 'processing'
    else if (polls >= 2) state = 'running'
  }
  const begin = (next: 'preview' | 'refine') => {
    stage = next
    state = 'queued'
    polls = 0
    failure = null
    cancel = null
  }
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url.replace(/^\/ai/, '')}`)
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    if (url.endsWith('/status')) {
      if (options.html) return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
      return Response.json({ available: options.available ?? true, provider: 'Test model (a cube)', simulated: true, reason: options.available === false ? (options.reason ?? 'no-provider') : null, maxPrompt: 240, enhancement: true, refine: true, remaining: 5 })
    }
    if (url.endsWith('/jobs') && method === 'POST') {
      if (options.refuse) return Response.json({ error: options.refuse.error, id: options.refuse.id }, { status: options.refuse.status })
      begin('preview')
      return Response.json(view(), { status: 202 })
    }
    if (url.endsWith('/jobs/job-1') && method === 'GET') {
      advance()
      return Response.json(view())
    }
    if (url.endsWith('/jobs/job-1/refine')) {
      begin('refine')
      return Response.json(view(), { status: 202 })
    }
    if (url.endsWith('/jobs/job-1/retry')) {
      retries++
      begin(stage)
      return Response.json(view(), { status: 202 })
    }
    if (url.endsWith('/jobs/job-1/cancel')) {
      if (state === 'queued' || state === 'running' || state === 'processing') {
        cancel = polls <= 1 ? 'stopped' : 'running-on'
        state = 'cancelled'
        failure = 'cancelled'
      }
      return Response.json(view())
    }
    if (url.includes('/jobs/job-1/model')) {
      const file = options.file ?? makeCubeGlb(url.includes('stage=final') ? [0.9, 0.2, 0.2] : undefined)
      return new Response(file, { headers: { 'content-length': String(file.byteLength) } })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { fetchImpl, calls }
}

const quickly = (options: EngineOptions = {}): AiOptions & { calls: string[] } => {
  const stand = engine(options)
  return { endpoint: '/ai', pollMs: 1, wait: async () => {}, fetchImpl: stand.fetchImpl, calls: stand.calls }
}
/** The same, but each wait really lets time pass, so a test can do something while a creation is in progress. */
const slowly = (options: EngineOptions = {}): AiOptions & { calls: string[] } => ({ ...quickly(options), wait: (_ms, s) => sleep(3, s) })
const signal = () => new AbortController().signal

describe('checking a model file before it is loaded', () => {
  it('accepts a real binary glTF and reports what is in it', () => {
    expect(validateGlb(makeCubeGlb())).toMatchObject({ ok: true, meshes: 1, nodes: 1, vertices: 8 })
    expect(validateGlb(makeCubeGlb([1, 0, 0]))).toMatchObject({ ok: true })
  })

  it('refuses everything else, and says what is wrong', () => {
    const good = new Uint8Array(makeCubeGlb())
    const copy = () => good.slice().buffer as ArrayBuffer
    expect(validateGlb(new ArrayBuffer(0))).toEqual({ ok: false, reason: 'empty' })
    expect(validateGlb(new ArrayBuffer(10))).toEqual({ ok: false, reason: 'not-glb' })
    expect(validateGlb(new TextEncoder().encode('<html>'.padEnd(64)).buffer as ArrayBuffer)).toEqual({ ok: false, reason: 'not-glb' })
    expect(validateGlb(copy().slice(0, 60))).toEqual({ ok: false, reason: 'truncated' })
    const v1 = copy()
    new DataView(v1).setUint32(4, 1, true)
    expect(validateGlb(v1)).toEqual({ ok: false, reason: 'version' })
    expect(validateGlb(new ArrayBuffer(51 * 1024 * 1024))).toEqual({ ok: false, reason: 'too-large' })
    const json = copy()
    new Uint8Array(json)[22] = 0x7d // breaks the JSON
    expect(validateGlb(json).ok).toBe(false)
  })

  it('refuses a model that points at the network, has no mesh or is far too complex', () => {
    const build = (doc: object) => {
      const text = JSON.stringify(doc)
      const padded = text + ' '.repeat((4 - (text.length % 4)) % 4)
      const bytes = new TextEncoder().encode(padded)
      const out = new ArrayBuffer(20 + bytes.length)
      const view = new DataView(out)
      view.setUint32(0, 0x46546c67, true)
      view.setUint32(4, 2, true)
      view.setUint32(8, out.byteLength, true)
      view.setUint32(12, bytes.length, true)
      view.setUint32(16, 0x4e4f534a, true)
      new Uint8Array(out).set(bytes, 20)
      return out
    }
    const mesh = { primitives: [{ attributes: { POSITION: 0 } }] }
    expect(validateGlb(build({ asset: { version: '2.0' }, meshes: [] }))).toEqual({ ok: false, reason: 'no-mesh' })
    expect(validateGlb(build({ asset: { version: '2.0' }, meshes: [mesh], buffers: [{ uri: 'https://evil.test/a.bin', byteLength: 4 }] }))).toEqual({ ok: false, reason: 'external-uri' })
    expect(validateGlb(build({ asset: { version: '2.0' }, meshes: [mesh], images: [{ uri: '//evil.test/a.png' }] }))).toEqual({ ok: false, reason: 'external-uri' })
    expect(validateGlb(build({ asset: { version: '2.0' }, meshes: [mesh], accessors: [{ count: 9_000_000 }] }))).toEqual({ ok: false, reason: 'too-complex' })
    expect(validateGlb(build({ asset: { version: '2.0' }, meshes: [mesh], accessors: [{ count: 30 }], buffers: [{ uri: 'data:application/octet-stream;base64,AAAA', byteLength: 3 }] })).ok).toBe(true)
  })
})

describe('the client of the site’s AI endpoint', () => {
  it('says AI is not available instead of failing, whatever is wrong with the server', async () => {
    expect(await fetchStatus(quickly({ available: false, reason: 'no-key' }))).toMatchObject({ available: false, reason: 'no-key' })
    expect(await fetchStatus(quickly({ available: false }))).toMatchObject({ available: false, reason: 'not-configured' })
    expect((await fetchStatus(quickly({ html: true }))).reason).toBe('no-server')
    expect((await fetchStatus({ fetchImpl: engine().fetchImpl, endpoint: '/ai-missing' })).available).toBe(true)
    expect((await fetchStatus({ endpoint: '/ai', fetchImpl: (async () => new Response('{}', { status: 404 })) as typeof fetch })).reason).toBe('no-server')
    expect((await fetchStatus({ endpoint: '/ai', fetchImpl: (async () => { throw new TypeError('offline') }) as typeof fetch })).available).toBe(false)
    expect(await fetchStatus(quickly())).toMatchObject({ available: true, provider: 'Test model (a cube)', simulated: true, enhancement: true, refine: true, remaining: 5 })
  })

  it('reads a job answer defensively', () => {
    const view = parseJob({ id: 'job-1', status: 'nonsense', progress: 7, ahead: -3, error: 'secret', stage: 'refine', tasks: { preview: 'a b', final: 'task-2' }, cancel: 'x', prompt: 'p'.repeat(2000) })
    expect(view).toMatchObject({ id: 'job-1', status: 'queued', progress: 1, ahead: 0, error: null, stage: 'refine', cancel: null, tasks: { preview: null, final: 'task-2' } })
    expect(view.prompt).toHaveLength(800)
    expect(parseJob(null).id).toBe('')
  })

  it('starts a job with the words, the language and the enhancement choice', async () => {
    const options = quickly()
    const view = await createJob({ text: 'a frog', language: 'hu', enhance: false }, signal(), options)
    expect(view).toMatchObject({ id: 'job-1', status: 'queued', prepared: 'A green frog, glossy skin.', enhanced: true })
    expect(options.calls[0]).toBe('POST /jobs')
  })

  it('follows a step to its end and fetches a checked model, reporting every view and byte count', async () => {
    const options = quickly({ steps: 4 })
    const views: string[] = []
    await createJob({ text: 'a frog', language: 'en', enhance: true }, signal(), options)
    const last = await followJob('job-1', (v) => views.push(`${v.status}:${v.progress}`), signal(), options)
    expect(last.status).toBe('succeeded')
    expect(views[0]).toBe('queued:null')
    expect(views.some((v) => v.startsWith('processing'))).toBe(true)
    const bytes: number[] = []
    const model = await fetchModel('job-1', 'preview', signal(), (p) => bytes.push(p.loaded), options)
    expect(validateGlb(model).ok).toBe(true)
    expect(bytes.at(-1)).toBe(model.byteLength)
  })

  it('maps each way it can go wrong to a code the page can word', async () => {
    const create = async (options: EngineOptions) =>
      createJob({ text: 'a frog', language: 'en', enhance: true }, signal(), quickly(options))
        .then(() => 'ok')
        .catch((error: AiError) => error.code)
    expect(await create({ refuse: { status: 503, error: 'credits' } })).toBe('credits')
    expect(await create({ refuse: { status: 503, error: 'auth' } })).toBe('auth')
    expect(await create({ refuse: { status: 503, error: 'no-key' } })).toBe('no-key')
    expect(await create({ refuse: { status: 503, error: 'budget' } })).toBe('budget')
    expect(await create({ refuse: { status: 429, error: 'rate-limit' } })).toBe('rate-limit')
    expect(await create({ refuse: { status: 429, error: 'busy' } })).toBe('busy')
    expect(await create({ refuse: { status: 400, error: 'moderation' } })).toBe('moderation')
    expect(await create({ refuse: { status: 400, error: 'invalid' } })).toBe('invalid')
    expect(await create({ refuse: { status: 502, error: 'upstream' } })).toBe('upstream')
    expect(await create({ refuse: { status: 500, error: 'weird' } })).toBe('upstream')
    const active = await createJob({ text: 'a frog', language: 'en', enhance: true }, signal(), quickly({ refuse: { status: 409, error: 'active', id: 'job-9' } })).catch((e: AiError) => e)
    expect(active).toMatchObject({ code: 'active', job: 'job-9' })
    const offline = { endpoint: '/ai', fetchImpl: (async () => { throw new TypeError('offline') }) as typeof fetch }
    expect(await createJob({ text: 'a', language: 'en', enhance: true }, signal(), offline).catch((e: AiError) => e.code)).toBe('network')
  })

  it('refuses a model file that is not a glTF or is too big, and one that cannot be fetched', async () => {
    const html = new TextEncoder().encode('<html>not a model</html>'.padEnd(64)).buffer as ArrayBuffer
    const code = (options: EngineOptions) => fetchModel('job-1', 'preview', signal(), () => {}, quickly(options)).then(() => 'ok').catch((e: AiError) => e.code)
    expect(await code({ file: html })).toBe('invalid-file')
    expect(await code({ file: new ArrayBuffer(51 * 1024 * 1024) })).toBe('too-large')
    expect(await fetchModel('nope', 'preview', signal(), () => {}, quickly()).catch((e: AiError) => e.code)).toBe('rejected')
  })

  it('does not give up on a moment without an answer, but does not wait for ever either', async () => {
    let n = 0
    const flaky = (async (input: string | URL | Request) => {
      if (String(input).endsWith('/jobs/job-1') && ++n < 3) throw new TypeError('offline for a moment')
      return Response.json({ id: 'job-1', status: 'succeeded' })
    }) as typeof fetch
    const view = await followJob('job-1', () => {}, signal(), { endpoint: '/ai', fetchImpl: flaky, wait: async () => {} })
    expect(view.status).toBe('succeeded')
    const dead = (async () => { throw new TypeError('offline') }) as typeof fetch
    expect(await followJob('job-1', () => {}, signal(), { endpoint: '/ai', fetchImpl: dead, wait: async () => {} }).catch((e: AiError) => e.code)).toBe('network')
  })

  it('can be cancelled in the middle of a wait', async () => {
    const controller = new AbortController()
    const wait = (_ms: number, s: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        controller.abort()
        if (s.aborted) reject(new AiError('cancelled', 'Cancelled.'))
      })
    const result = await followJob('job-1', () => {}, controller.signal, { ...quickly({ steps: 9 }), wait }).catch((e: AiError) => e.code)
    expect(result).toBe('cancelled')
    expect((await jobAction('job-1', 'cancel', signal(), quickly())).status).toBe('cancelled')
  })
})

describe('Quick creation: the generator’s state', () => {
  beforeEach(() => {
    resetGenerator()
    setMode('quick')
  })

  it('opens in AI mode, the featured one', () => {
    resetGenerator()
    expect(gen.get().mode).toBe('ai')
  })

  it('builds from the words, says what it understood, and does nothing for empty words', () => {
    generate('A muscular banana driving a racing car.')
    const state = gen.get()
    expect(state.current).toMatchObject({ source: 'quick', spec: { main: 'banana', vehicle: 'racecar', build: 'muscular' } })
    expect(state.current?.source === 'quick' && state.current.interpretation.understood.length).toBeGreaterThan(2)
    expect(state.notice?.code).toBe('created')
    const before = state.current
    generate('   ')
    expect(gen.get().current).toBe(before)
    expect(gen.get().notice?.code).toBe('empty')
  })

  it('makes the same object from the same words, and another from regenerate', () => {
    generate('A sad robot')
    const first = gen.get().current!
    generate('A sad robot')
    expect(gen.get().current).toMatchObject({ seed: (first as { seed: number }).seed, spec: (first as { spec: object }).spec })
    regenerate()
    const again = gen.get().current!
    expect((again as { spec: object }).spec).toEqual((first as { spec: object }).spec)
    expect(again.build).toBeGreaterThan(first.build)
  })

  it('writes a new idea in the chosen style and builds it, in each language', () => {
    for (const lang of ['hu', 'en', 'nl'] as const) {
      newIdea(lang)
      expect(gen.get().prompt.length).toBeGreaterThan(8)
      const current = gen.get().current
      expect(current?.source === 'quick' && current.interpretation.recognised).toBe(true)
    }
  })

  it('in AI mode a random idea is only written in the box, never started', () => {
    setMode('ai')
    suggestIdea('en')
    expect(gen.get().prompt.length).toBeGreaterThan(8)
    expect(gen.get().current).toBeNull()
    expect(gen.get().ai.phase).toBe('idle')
  })

  it('changes the look without a new build, and the parts with one', () => {
    generate('A frog')
    const built = gen.get().current!.build
    patchLook({ material: 'gold', colour: '#ff0000', scale: 99, rotation: 400, lighting: 'neon', background: 'grid', camera: 'top' })
    expect(gen.get().current).toMatchObject({ build: built, look: { material: 'gold', colour: '#ff0000', scale: 2.2, rotation: 40, lighting: 'neon', background: 'grid', camera: 'top' } })
    patchLook({ material: 'nonsense' as never, colour: 'red' })
    expect(gen.get().current?.look).toMatchObject({ material: 'natural', colour: null })
    resetLook()
    expect(gen.get().current?.look).toEqual(gen.get().current?.baseLook)
    const spec = () => (gen.get().current as { spec: { accessories: string[] } }).spec
    toggleAccessory('crown')
    expect(spec().accessories).toContain('crown')
    expect(gen.get().current!.build).toBeGreaterThan(built)
    toggleAccessory('crown')
    expect(spec().accessories).not.toContain('crown')
    toggleAccessory('nope' as never)
    patchSpec({ mood: 'angry', pose: 'dance' })
    expect(spec()).toMatchObject({ mood: 'angry', pose: 'dance' })
    for (let i = 0; i < 30; i++) {
      randomiseLook()
      const look = gen.get().current!.look
      expect(MATERIALS).toContain(look.material)
      expect(LIGHTS).toContain(look.lighting)
      expect(BACKGROUNDS).toContain(look.background)
      expect(look.colour === null || /^#[0-9a-f]{6}$/.test(look.colour)).toBe(true)
    }
    expect(ACCESSORIES.length).toBeGreaterThan(10)
  })

  it('opens a kept Quick creation', () => {
    const creation: Creation = { version: 2, prompt: 'a sad robot', title: 'Sad', source: 'quick', spec: defaultSpec('robot'), seed: 9, look: { ...DEFAULT_LOOK, material: 'chrome' }, ai: null }
    loadCreation(creation)
    expect(gen.get()).toMatchObject({ prompt: 'a sad robot', current: { seed: 9, source: 'quick', look: { material: 'chrome' } } })
  })
})

describe('AI creation: a real model or an honest message, never a stand-in', () => {
  beforeEach(() => resetGenerator())

  it('with no engine it says so, puts nothing on the stage, and does not fall back to a Quick build', async () => {
    await startAi('a frog', quickly({ available: false, reason: 'no-key' }))
    expect(gen.get().ai).toMatchObject({ phase: 'unavailable', code: 'no-key' })
    expect(gen.get().current).toBeNull()
    expect(gen.get().notice?.code).toBe('aiUnavailable')
    await startAi('a frog', { ...quickly({ html: true }), fetchImpl: quickly({ html: true }).fetchImpl })
    expect(gen.get().ai.code).toBe('no-key') // the answer is remembered: the page asks once
  })

  it('asks for an engine in AI mode when generating, and builds the Quick object only in Quick mode', async () => {
    const options = quickly({ available: false })
    generate('a frog', { ai: options })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(gen.get().current).toBeNull()
    expect(options.calls[0]).toBe('GET /status')
  })

  it('runs the geometry to the end: states in order, a checked model, and no texturing of its own accord', async () => {
    const options = quickly({ steps: 4 })
    const phases: string[] = []
    const stop = gen.subscribe(() => {
      const phase = gen.get().ai.phase
      if (phases.at(-1) !== phase) phases.push(phase)
    })
    await startAi('a frog', options)
    stop()
    expect(phases).toEqual(expect.arrayContaining(['checking', 'preparing', 'queued', 'geometry', 'processing', 'completed']))
    expect(phases.indexOf('queued')).toBeLessThan(phases.indexOf('geometry'))
    expect(phases.indexOf('geometry')).toBeLessThan(phases.indexOf('processing'))
    const ai = gen.get().ai
    expect(ai).toMatchObject({ phase: 'completed', showing: 'preview', load: 'loading' })
    expect(ai.models.preview).toBeInstanceOf(ArrayBuffer)
    expect(ai.models.final).toBeNull()
    expect(ai.job).toMatchObject({ canRefine: true, prepared: 'A green frog, glossy skin.', enhanced: true })
    expect(gen.get().current).toMatchObject({ source: 'ai', ai: { stage: 'preview', simulated: true, provider: 'Test model (a cube)', tasks: { preview: 'task-p', final: null }, job: 'job-1' } })
    expect(options.calls.some((c) => c.includes('/refine'))).toBe(false)
    expect(gen.get().notice?.code).toBe('aiGeometry')
  })

  it('shows only the progress the engine reports, never one it did not', async () => {
    const seen: Array<number | null> = []
    const stop = gen.subscribe(() => {
      if (gen.get().ai.phase === 'queued') seen.push(gen.get().ai.progress)
    })
    await startAi('a frog', quickly({ steps: 5 }))
    stop()
    expect(seen.every((p) => p === null)).toBe(true)
  })

  it('textures the geometry only when asked, and then the textured model replaces it on the stage', async () => {
    const options = quickly({ steps: 3 })
    await startAi('a frog', options)
    const preview = gen.get().ai.models.preview
    await refineAi(options)
    const ai = gen.get().ai
    expect(options.calls.filter((c) => c.includes('/refine'))).toHaveLength(1)
    expect(ai).toMatchObject({ phase: 'completed', showing: 'final' })
    expect(ai.models.final).toBeInstanceOf(ArrayBuffer)
    expect(ai.models.preview).toBe(preview)
    expect(gen.get().current).toMatchObject({ source: 'ai', ai: { stage: 'final' } })
    // Both stay available, and which one shows can be switched.
    showModel('preview')
    expect(gen.get().ai.showing).toBe('preview')
    showModel('final')
    expect(gen.get().ai.showing).toBe('final')
    expect(new TextDecoder().decode(new Uint8Array(ai.models.final!))).toContain('baseColorFactor')
    expect(new TextDecoder().decode(new Uint8Array(ai.models.preview!))).not.toContain('baseColorFactor')
  })

  it('does not texture what cannot be textured', async () => {
    const options = quickly({ canRefine: false })
    await startAi('a frog', options)
    await refineAi(options)
    expect(options.calls.some((c) => c.includes('/refine'))).toBe(false)
  })

  it('when the geometry fails it says so, keeps nothing on the stage and offers no texturing', async () => {
    const options = quickly({ steps: 5, failPreview: 'service' })
    await startAi('a frog', options)
    expect(gen.get().ai).toMatchObject({ phase: 'failed', code: 'service' })
    expect(gen.get().current).toBeNull()
    expect(gen.get().ai.models.preview).toBeNull()
    expect(gen.get().notice?.code).toBe('aiFailed')
    await refineAi(options)
    expect(options.calls.some((c) => c.includes('/refine'))).toBe(false)
  })

  it('tries a failed step again as a new task, and a refused prompt is not retried by the job', async () => {
    const options = quickly({ steps: 3, failPreview: 'service' })
    await startAi('a frog', options)
    expect(gen.get().ai.job?.canRetry).toBe(true)
    await retryAi(options)
    expect(options.calls).toContain('POST /jobs/job-1/retry')
    const moderated = quickly({ steps: 5, failPreview: 'moderation' })
    await startAi('a frog', moderated)
    expect(gen.get().ai).toMatchObject({ phase: 'failed', code: 'moderation' })
    expect(gen.get().ai.job?.canRetry).toBe(false)
  })

  it('a failed texturing keeps the geometry on the stage', async () => {
    const options = quickly({ steps: 4, failRefine: true })
    await startAi('a frog', options)
    await refineAi(options)
    expect(gen.get().ai).toMatchObject({ phase: 'failed', code: 'service', working: 'refine', showing: 'preview' })
    expect(gen.get().current).toMatchObject({ source: 'ai' })
    expect(gen.get().ai.models.preview).toBeInstanceOf(ArrayBuffer)
  })

  it('names what went wrong when the request itself is refused', async () => {
    for (const [refuse, code] of [
      [{ status: 503, error: 'credits' }, 'credits'],
      [{ status: 429, error: 'rate-limit' }, 'rate-limit'],
      [{ status: 400, error: 'moderation' }, 'moderation'],
      [{ status: 503, error: 'budget' }, 'budget'],
    ] as const) {
      await startAi('a frog', quickly({ refuse }))
      expect(gen.get().ai, code).toMatchObject({ phase: 'failed', code })
      expect(gen.get().current).toBeNull()
    }
  })

  it('refuses a model file that is not a glTF instead of loading it', async () => {
    const html = new TextEncoder().encode('<html>not a model</html>'.padEnd(64)).buffer as ArrayBuffer
    await startAi('a frog', quickly({ steps: 2, file: html }))
    expect(gen.get().ai).toMatchObject({ phase: 'failed', code: 'invalid-file' })
    expect(gen.get().ai.models.preview).toBeNull()
  })

  it('stops waiting when cancelled, asks the engine to stop, and says whether it did', async () => {
    const options = slowly({ steps: 99 })
    const run = startAi('a frog', options)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(['queued', 'geometry']).toContain(gen.get().ai.phase)
    cancelAi(options)
    await run
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(gen.get().ai.phase).toBe('cancelled')
    expect(options.calls).toContain('POST /jobs/job-1/cancel')
    expect(gen.get().ai.stopped).not.toBeNull()
    expect(gen.get().current).toBeNull()
    expect(gen.get().notice?.code).toBe('aiCancelled')
  })

  it('follows the job that is already running instead of starting another', async () => {
    // The server refuses a second creation while one runs ("active", naming it); the page follows that one.
    const running = engine({ steps: 2 })
    const refusing = engine({ refuse: { status: 409, error: 'active', id: 'job-1' } })
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const isCreate = String(input).endsWith('/jobs') && init?.method === 'POST'
      return String(input).endsWith('/status') || isCreate ? refusing.fetchImpl(input, init) : running.fetchImpl(input, init)
    }) as typeof fetch
    await startAi('a frog', { endpoint: '/ai', pollMs: 1, wait: async () => {}, fetchImpl })
    expect(gen.get().ai).toMatchObject({ phase: 'completed', showing: 'preview' })
    expect(running.calls.filter((c) => c.startsWith('POST'))).toEqual([])
  })

  it('does not show a model that arrives after the visitor asked for something else', async () => {
    const slow = startAi('a frog', slowly({ steps: 30 }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await startAi('a cat', quickly({ steps: 2, prompt: 'a cat' }))
    await slow
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(gen.get().current).toMatchObject({ source: 'ai', prompt: 'a cat' })
    expect(gen.get().ai).toMatchObject({ phase: 'completed' })
    expect(gen.get().ai.job?.prompt).toBe('a cat')
  })

  it('opens a kept AI creation with its model, or says the file is missing, and keeps the engine’s details', () => {
    const ai: Creation['ai'] = { provider: 'Meshy', simulated: false, prepared: 'A green frog.', enhanced: true, job: 'job-7', tasks: { preview: 'p', final: 'f' }, stage: 'final', format: 'glb', bytes: 1500, createdAt: 1_700_000_000_000, model: { store: 'indexeddb', key: 'm1' } }
    const creation: Creation = { version: 2, prompt: 'a frog', title: 'Frog', source: 'ai', spec: null, seed: 0, look: { ...DEFAULT_LOOK, lighting: 'neon' }, ai }
    loadCreation(creation, makeCubeGlb([1, 0, 0]))
    expect(gen.get().current).toMatchObject({ source: 'ai', look: { lighting: 'neon' }, ai: { provider: 'Meshy', stage: 'final', tasks: { final: 'f' } } })
    expect(gen.get().ai).toMatchObject({ phase: 'completed', showing: 'final', missing: false })
    expect(gen.get().ai.models.final).toBeInstanceOf(ArrayBuffer)
    loadCreation(creation, null)
    expect(gen.get().ai).toMatchObject({ phase: 'idle', showing: null, missing: true })
    expect(gen.get().current).toMatchObject({ source: 'ai' })
    expect(gen.get().notice?.code).toBe('modelMissing')
  })
})
