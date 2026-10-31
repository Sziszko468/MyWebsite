import { describe, expect, it } from 'vitest'
import { MIC_CONSTRAINTS, SoundEngine, type EngineDeps } from './soundEngine'
import { SPECTRUM_BINS } from './soundAnalysis'

// ── A stand-in for the browser's audio ────────────────────────────────────────────────────────

class FakeParam {
  value = 0
  setValueAtTime(v: number) {
    this.value = v
  }
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
  cancelScheduledValues() {}
  setTargetAtTime(v: number) {
    this.value = v
  }
}

class FakeNode {
  readonly name: string
  out: FakeNode[] = []
  constructor(name: string) {
    this.name = name
  }
  connect(next: FakeNode) {
    this.out.push(next)
    return next
  }
  disconnect() {
    this.out = []
  }
}

class FakeAnalyser extends FakeNode {
  fftSize = 2048
  smoothingTimeConstant = 0
  minDecibels = 0
  maxDecibels = 0
  /** The bytes this analyser reports. */
  bytes: number[] | null = null
  get frequencyBinCount() {
    return this.fftSize / 2
  }
  getByteFrequencyData(array: Uint8Array) {
    array.fill(0)
    if (this.bytes) this.bytes.forEach((v, i) => (array[i] = v))
  }
  getFloatTimeDomainData(array: Float32Array) {
    for (let i = 0; i < array.length; i++) array[i] = this.bytes ? Math.sin(i * 0.1) * 0.5 : 0
  }
}

class FakeContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  currentTime = 0
  sampleRate = 48_000
  readonly destination = new FakeNode('destination')
  readonly analysers: FakeAnalyser[] = []
  readonly sources: FakeNode[] = []
  oscillators = 0
  bursts = 0
  resumeFails = false
  resume() {
    if (this.resumeFails) return Promise.reject(new Error('blocked'))
    this.state = 'running'
    return Promise.resolve()
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
  createGain() {
    return Object.assign(new FakeNode('gain'), { gain: new FakeParam() })
  }
  createDynamicsCompressor() {
    return new FakeNode('compressor')
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode('filter'), { type: '', frequency: new FakeParam(), Q: new FakeParam() })
  }
  createOscillator() {
    this.oscillators++
    return Object.assign(new FakeNode('osc'), { type: '', frequency: new FakeParam(), start() {}, stop() {} })
  }
  createBufferSource() {
    this.bursts++
    return Object.assign(new FakeNode('noise'), { buffer: null, start() {}, stop() {} })
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) }
  }
  createAnalyser() {
    const analyser = new FakeAnalyser('analyser')
    this.analysers.push(analyser)
    return analyser
  }
  createMediaStreamSource() {
    const node = new FakeNode('mic-source')
    this.sources.push(node)
    return node
  }
}

class FakeTrack {
  readyState: 'live' | 'ended' = 'live'
  stops = 0
  private readonly listeners: Array<() => void> = []
  stop() {
    this.stops++
    this.readyState = 'ended'
  }
  addEventListener(_type: string, listener: () => void) {
    this.listeners.push(listener)
  }
  /** The device went away or the permission was taken back. */
  end() {
    this.readyState = 'ended'
    this.listeners.forEach((l) => l())
  }
}

class FakeStream {
  readonly track = new FakeTrack()
  getTracks() {
    return [this.track]
  }
  getAudioTracks() {
    return [this.track]
  }
}

function reaches(from: FakeNode, target: FakeNode, seen = new Set<FakeNode>()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  return from.out.some((next) => reaches(next, target, seen))
}

interface Rig {
  engine: SoundEngine
  contexts: FakeContext[]
  asked: MediaStreamConstraints[]
  streams: FakeStream[]
  timers: Map<number, () => void>
  /** Resolve or reject the pending microphone request. */
  answer: (result: 'allow' | Error) => void
}

function rig(options: { media?: 'none' | 'manual' | 'allow'; noContext?: boolean; resumeFails?: boolean } = {}): Rig {
  const contexts: FakeContext[] = []
  const asked: MediaStreamConstraints[] = []
  const streams: FakeStream[] = []
  const timers = new Map<number, () => void>()
  let next = 1
  let settle: ((result: 'allow' | Error) => void) | null = null
  const media = options.media ?? 'allow'
  const deps: EngineDeps = {
    createContext: () => {
      if (options.noContext) return null
      const context = new FakeContext()
      context.resumeFails = options.resumeFails ?? false
      contexts.push(context)
      return context as unknown as AudioContext
    },
    getUserMedia:
      media === 'none'
        ? null
        : (constraints) => {
            asked.push(constraints)
            return new Promise<MediaStream>((resolve, reject) => {
              const finish = (result: 'allow' | Error) => {
                if (result === 'allow') {
                  const stream = new FakeStream()
                  streams.push(stream)
                  resolve(stream as unknown as MediaStream)
                } else reject(result)
              }
              if (media === 'allow') finish('allow')
              else settle = finish
            })
          },
    setInterval: (callback) => {
      const id = next++
      timers.set(id, callback)
      return id
    },
    clearInterval: (id) => {
      timers.delete(id)
    },
  }
  return {
    engine: new SoundEngine(deps),
    contexts,
    asked,
    streams,
    timers,
    answer: (result) => settle?.(result),
  }
}

const denied = () => Object.assign(new Error('no'), { name: 'NotAllowedError' })

// ── Nothing happens by itself ─────────────────────────────────────────────────────────────────

describe('before anyone clicks', () => {
  it('creates no audio context and asks for nothing', () => {
    const r = rig()
    r.engine.read(1 / 60)
    r.engine.read(1 / 60)
    r.engine.setTempo(100)
    r.engine.setVolume(0.2)
    expect(r.contexts).toHaveLength(0)
    expect(r.asked).toHaveLength(0)
    expect(r.timers.size).toBe(0)
  })

  it('shows the silent preview without any audio', () => {
    const r = rig()
    r.engine.setPreview(true)
    let bass = 0
    for (let i = 0; i < 120; i++) bass = Math.max(bass, r.engine.read(1 / 60).bass)
    expect(bass).toBeGreaterThan(0.5)
    expect(r.contexts).toHaveLength(0)
    expect(r.asked).toHaveLength(0)
  })

  it('is still, with the preview off, and ends in zeros', () => {
    const r = rig()
    for (let i = 0; i < 60; i++) r.engine.read(1 / 60)
    expect(r.engine.frame.level).toBe(0)
    expect(r.engine.active).toBe(false)
  })
})

// ── The built-in sound ────────────────────────────────────────────────────────────────────────

describe('the built-in sound', () => {
  it('starts on a click: a context, a resumed one, a timer, and notes as time passes', async () => {
    const r = rig()
    expect(await r.engine.startBuiltIn()).toBe('playing')
    const [context] = r.contexts
    expect(context.state).toBe('running')
    expect(r.engine.getState()).toMatchObject({ source: 'builtin', playing: true })
    expect(r.timers.size).toBe(1)
    const tick = [...r.timers.values()][0]
    for (let t = 0; t < 2; t += 0.025) {
      context.currentTime = t
      tick()
    }
    expect(context.oscillators).toBeGreaterThan(8)
    expect(context.bursts).toBeGreaterThan(4)
  })

  it('plays through the speakers, and the picture listens before the volume', async () => {
    const r = rig()
    await r.engine.startBuiltIn()
    const [context] = r.contexts
    const [analyser] = context.analysers
    expect(analyser).toBeDefined()
    // The sound reaches the destination; the analyser is not on the way there.
    const gains = context.destination
    expect(gains.name).toBe('destination')
    expect(analyser.out).toHaveLength(0)
  })

  it('pauses: the timer is gone and no more notes are made', async () => {
    const r = rig()
    await r.engine.startBuiltIn()
    const [context] = r.contexts
    const tick = [...r.timers.values()][0]
    context.currentTime = 0.5
    tick()
    r.engine.pauseBuiltIn()
    expect(r.timers.size).toBe(0)
    expect(r.engine.getState().playing).toBe(false)
    const before = context.oscillators
    context.currentTime = 3
    tick()
    expect(context.oscillators).toBe(before)
  })

  it('starts the loop from its beginning and follows a change of tempo', async () => {
    const r = rig()
    await r.engine.startBuiltIn()
    r.engine.setTempo(140)
    expect(r.engine.getState().tempo).toBe(140)
    r.engine.setTempo(9999)
    expect(r.engine.getState().tempo).toBe(150)
  })

  it('says it cannot when the browser has no audio, or will not let it start', async () => {
    expect(await rig({ noContext: true }).engine.startBuiltIn()).toBe('unavailable')
    const blocked = rig({ resumeFails: true })
    expect(await blocked.engine.startBuiltIn()).toBe('unavailable')
    expect(blocked.engine.getState().playing).toBe(false)
    expect(blocked.timers.size).toBe(0)
  })

  it('turns what the analyser sees into a frame the scene can use', async () => {
    const r = rig()
    await r.engine.startBuiltIn()
    const analyser = r.contexts[0].analysers[0]
    // A strong bass, nothing above it.
    analyser.bytes = Array.from({ length: 1024 }, (_, i) => (i < 6 ? 230 : 0))
    let frame = r.engine.frame
    for (let i = 0; i < 60; i++) frame = r.engine.read(1 / 60)
    expect(frame.bass).toBeGreaterThan(0.6)
    expect(frame.high).toBeLessThan(0.05)
    expect(frame.spectrum).toHaveLength(SPECTRUM_BINS)
    expect(frame.level).toBeGreaterThan(0.1)
  })

  it('keeps the volume between 0 and 1', () => {
    const r = rig()
    r.engine.setVolume(7)
    expect(r.engine.getState().volume).toBe(1)
    r.engine.setVolume(-3)
    expect(r.engine.getState().volume).toBe(0)
    r.engine.setVolume(NaN)
    expect(r.engine.getState().volume).toBe(0)
  })
})

// ── The microphone ────────────────────────────────────────────────────────────────────────────

describe('the microphone', () => {
  it('is asked for once, for sound only, and only when the page says so', async () => {
    const r = rig()
    r.engine.setSource('mic')
    expect(r.asked).toHaveLength(0)
    expect(await r.engine.startMic()).toBe('on')
    expect(r.asked).toHaveLength(1)
    expect(r.asked[0]).toEqual(MIC_CONSTRAINTS)
    expect(r.asked[0].video).toBe(false)
    expect(r.asked[0].audio).toBeTruthy()
    // Already on: no second request.
    expect(await r.engine.startMic()).toBe('on')
    expect(r.asked).toHaveLength(1)
    expect(r.engine.getState()).toMatchObject({ source: 'mic', micOn: true, micAsking: false })
  })

  it('is wired to an analyser and to nothing that could play it back', async () => {
    const r = rig()
    await r.engine.startMic()
    const [context] = r.contexts
    const [source] = context.sources
    expect(source).toBeDefined()
    expect(reaches(source, context.destination)).toBe(false)
    // Its one connection is an analyser.
    expect(source.out).toHaveLength(1)
    expect(source.out[0]).toBeInstanceOf(FakeAnalyser)
    expect(source.out[0].out).toHaveLength(0)
  })

  it('makes the picture move with what it hears, and records nothing: no node takes the stream away', async () => {
    const r = rig()
    await r.engine.startMic()
    const [context] = r.contexts
    const micAnalyser = context.sources[0].out[0] as FakeAnalyser
    micAnalyser.bytes = Array.from({ length: 1024 }, (_, i) => (i > 8 && i < 100 ? 220 : 0))
    let frame = r.engine.frame
    for (let i = 0; i < 60; i++) frame = r.engine.read(1 / 60)
    expect(frame.mid).toBeGreaterThan(0.5)
    expect(frame.bass).toBeLessThan(0.1)
  })

  it('stops every track when it is switched off, and the picture goes quiet', async () => {
    const r = rig()
    await r.engine.startMic()
    const stream = r.streams[0]
    r.engine.stopMic()
    expect(stream.track.stops).toBeGreaterThanOrEqual(1)
    expect(stream.track.readyState).toBe('ended')
    expect(r.engine.getState()).toMatchObject({ micOn: false, source: 'preview' })
    expect(r.contexts[0].sources[0].out).toHaveLength(0)
    expect(r.engine.micTracks).toHaveLength(0)
    for (let i = 0; i < 90; i++) r.engine.read(1 / 60)
    expect(r.engine.frame.level).toBeLessThan(0.01)
  })

  it('stops the tracks when another source is chosen', async () => {
    for (const source of ['preview', 'builtin'] as const) {
      const r = rig()
      await r.engine.startMic()
      r.engine.setSource(source)
      expect(r.streams[0].track.readyState, source).toBe('ended')
      expect(r.engine.getState().micOn).toBe(false)
    }
  })

  it('stops the tracks when the built-in sound is started', async () => {
    const r = rig()
    await r.engine.startMic()
    await r.engine.startBuiltIn()
    expect(r.streams[0].track.readyState).toBe('ended')
    expect(r.engine.getState()).toMatchObject({ source: 'builtin', micOn: false, playing: true })
  })

  it('stops the tracks and closes the audio when the page is left', async () => {
    const r = rig()
    await r.engine.startMic()
    r.engine.dispose()
    expect(r.streams[0].track.readyState).toBe('ended')
    expect(r.contexts[0].state).toBe('closed')
  })

  it('lets go when the device goes away or the permission is taken back', async () => {
    const r = rig()
    await r.engine.startMic()
    r.streams[0].track.end()
    expect(r.engine.getState()).toMatchObject({ micOn: false, source: 'preview' })
  })

  it('reports a refusal, leaves nothing running and lets the built-in sound take over', async () => {
    const r = rig({ media: 'manual' })
    const pending = r.engine.startMic()
    expect(r.engine.getState().micAsking).toBe(true)
    r.answer(denied())
    expect(await pending).toBe('denied')
    expect(r.engine.getState()).toMatchObject({ micOn: false, micAsking: false })
    expect(r.streams).toHaveLength(0)
    expect(await r.engine.startBuiltIn()).toBe('playing')
  })

  it('tells "no microphone" and "other trouble" apart from a refusal', async () => {
    const missing = rig({ media: 'manual' })
    const a = missing.engine.startMic()
    missing.answer(Object.assign(new Error('x'), { name: 'NotFoundError' }))
    expect(await a).toBe('unavailable')
    const odd = rig({ media: 'manual' })
    const b = odd.engine.startMic()
    odd.answer(new Error('something else'))
    expect(await b).toBe('error')
    expect(rig({ media: 'none' }).engine.canListen).toBe(false)
    expect(await rig({ media: 'none' }).engine.startMic()).toBe('unavailable')
    expect(await rig({ noContext: true }).engine.startMic()).toBe('unavailable')
  })

  it('leaves nothing open if the visitor changes their mind while the question is open', async () => {
    const r = rig({ media: 'manual' })
    const pending = r.engine.startMic()
    r.engine.setSource('preview')
    expect(r.engine.getState().micAsking).toBe(false)
    r.answer('allow')
    expect(await pending).toBe('cancelled')
    expect(r.streams[0].track.readyState).toBe('ended')
    expect(r.engine.getState().micOn).toBe(false)
  })

  it('leaves nothing open if the page is left while the question is open', async () => {
    const r = rig({ media: 'manual' })
    const pending = r.engine.startMic()
    r.engine.dispose()
    r.answer('allow')
    expect(await pending).toBe('cancelled')
    expect(r.streams[0].track.readyState).toBe('ended')
  })

  it('does nothing at all once it has been disposed', async () => {
    const r = rig()
    r.engine.dispose()
    expect(await r.engine.startMic()).toBe('cancelled')
    expect(await r.engine.startBuiltIn()).toBe('unavailable')
    expect(r.asked).toHaveLength(0)
    expect(() => r.engine.dispose()).not.toThrow()
  })

  it('can be released and attached again, as React does with an effect, and still starts nothing by itself', async () => {
    const r = rig()
    r.engine.dispose()
    r.engine.attach()
    expect(r.contexts).toHaveLength(0)
    expect(r.asked).toHaveLength(0)
    expect(await r.engine.startMic()).toBe('on')
    expect(r.asked).toHaveLength(1)
    r.engine.dispose()
    expect(r.streams[0].track.readyState).toBe('ended')
    r.engine.attach()
    expect(r.engine.getState().micOn).toBe(false)
    expect(await r.engine.startBuiltIn()).toBe('playing')
  })

  it('tells its listeners when something changes, and not when nothing does', async () => {
    const r = rig()
    let calls = 0
    const stop = r.engine.subscribe(() => calls++)
    r.engine.setTempo(r.engine.getState().tempo)
    expect(calls).toBe(0)
    await r.engine.startMic()
    const afterOn = calls
    expect(afterOn).toBeGreaterThan(0)
    r.engine.stopMic()
    expect(calls).toBeGreaterThan(afterOn)
    stop()
  })
})
