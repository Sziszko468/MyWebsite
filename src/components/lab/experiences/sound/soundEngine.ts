import { LOOP_STEPS, TEMPO, clampTempo, dueSteps, midiToHz, patternAt, previewRaw, stepSeconds } from './rhythm'
import { BytesReader, FrameShaper, createFrame, createRaw, type AudioFrame } from './soundAnalysis'

/**
 * The sound side of the Sound Reactive World: one object that owns the browser's audio and gives the
 * scene a frame of numbers each time it asks. It has three sources, and only one is ever live:
 *
 *  - the silent preview: no audio at all, the loop's score drawn as if it were heard;
 *  - the built-in sound: the loop played by oscillators and noise, started by a click;
 *  - the microphone, started by a click after the visitor has read what it will and will not do.
 *
 * What it promises about the microphone, and what the tests hold it to:
 *  - nothing is created before a click: no audio context, no request for the microphone;
 *  - the microphone is wired to an analyser and to nothing else: never to the speakers, never to a
 *    recorder, never to the network. The page has no code that records, stores or sends sound;
 *  - every track is stopped when the microphone is switched off, when another source is chosen, when
 *    the page is left, when the device goes away, and when the visitor changed their mind while the
 *    browser's own permission question was still open.
 */

export type SoundSource = 'preview' | 'builtin' | 'mic'
export type BuiltInResult = 'playing' | 'unavailable'
export type MicResult = 'on' | 'denied' | 'unavailable' | 'error' | 'cancelled'

export interface EngineState {
  source: SoundSource
  /** The built-in loop is playing. */
  playing: boolean
  /** The silent preview is running. */
  previewOn: boolean
  /** The microphone is live. */
  micOn: boolean
  /** The browser's permission question is open. */
  micAsking: boolean
  tempo: number
  volume: number
  smoothing: number
}

/** The parts of the browser the engine uses, so a test can stand in for them. */
export interface EngineDeps {
  createContext: () => AudioContext | null
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null
  setInterval: (callback: () => void, ms: number) => number
  clearInterval: (id: number) => void
}

export function browserDeps(): EngineDeps {
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  return {
    createContext: () => {
      const Context =
        typeof AudioContext === 'undefined'
          ? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : AudioContext
      return Context ? new Context({ latencyHint: 'interactive' }) : null
    },
    getUserMedia: media?.getUserMedia ? (constraints) => media.getUserMedia(constraints) : null,
    setInterval: (callback, ms) => window.setInterval(callback, ms),
    clearInterval: (id) => window.clearInterval(id),
  }
}

/** The constraints the microphone is asked with: sound only, and as it is, so the analysis sees the room. */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  video: false,
}

const LOOKAHEAD = 0.12
const TIMER_MS = 25

function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

export class SoundEngine {
  /** The frame the scene reads; `read()` refills it. */
  readonly frame: AudioFrame = createFrame()
  private current: EngineState = {
    source: 'preview',
    playing: false,
    previewOn: false,
    micOn: false,
    micAsking: false,
    tempo: TEMPO.default,
    volume: 0.6,
    smoothing: 0.4,
  }

  private context: AudioContext | null = null
  private mix: GainNode | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private builtinAnalyser: AnalyserNode | null = null
  private micAnalyser: AnalyserNode | null = null
  private micNode: MediaStreamAudioSourceNode | null = null
  private micStream: MediaStream | null = null
  private micToken = 0
  private timer: number | null = null
  private readonly clock = { nextTime: 0, step: 0 }
  private previewTime = 0
  private disposed = false

  private readonly raw = createRaw()
  private readonly shaper = new FrameShaper()
  private readonly reader = new BytesReader()
  private bytes: Uint8Array<ArrayBuffer> | null = null
  private floats: Float32Array<ArrayBuffer> | null = null
  private readonly listeners = new Set<() => void>()

  private readonly deps: EngineDeps

  constructor(deps: EngineDeps = browserDeps()) {
    this.deps = deps
  }

  // ── State, for the page ──────────────────────────────────────────────────────────────

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getState = (): EngineState => this.current

  private change(patch: Partial<EngineState>): void {
    this.current = { ...this.current, ...patch }
    for (const listener of [...this.listeners]) listener()
  }

  /** Whether this browser can offer a microphone at all (it cannot on a page that is not secure). */
  get canListen(): boolean {
    return this.deps.getUserMedia !== null
  }

  /** The live tracks of the microphone, for a check that they are stopped. */
  get micTracks(): MediaStreamTrack[] {
    return this.micStream?.getTracks() ?? []
  }

  // ── Choosing and tuning ──────────────────────────────────────────────────────────────

  setSource(source: SoundSource): void {
    if (this.disposed) return
    // Choosing anything but the microphone ends it, even a question still open: this runs first.
    if (source !== 'mic') this.stopMic()
    if (source !== 'builtin') this.pauseBuiltIn()
    if (source === this.current.source) return
    this.shaper.reset()
    this.change({ source })
  }

  setPreview(on: boolean): void {
    if (this.current.previewOn !== on) this.change({ previewOn: on })
  }

  setTempo(bpm: number): void {
    const tempo = clampTempo(bpm)
    if (tempo !== this.current.tempo) this.change({ tempo })
  }

  setVolume(volume: number): void {
    const value = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0))
    this.change({ volume: value })
    if (this.master && this.context && this.current.playing)
      this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.03)
  }

  setSmoothing(smoothing: number): void {
    this.change({ smoothing: Math.min(1, Math.max(0, Number.isFinite(smoothing) ? smoothing : 0)) })
  }

  // ── The audio graph, built on the first click ───────────────────────────────────────

  private ensureContext(): AudioContext | null {
    if (this.disposed) return null
    if (this.context) return this.context
    const context = this.deps.createContext()
    if (!context) return null
    const mix = context.createGain()
    const compressor = context.createDynamicsCompressor()
    const master = context.createGain()
    master.gain.value = 0
    mix.connect(compressor)
    compressor.connect(master)
    master.connect(context.destination)
    // The picture listens to the mix before the volume: lowering the sound does not dim the world.
    const analyser = this.makeAnalyser(context)
    mix.connect(analyser)

    const noise = context.createBuffer(1, Math.max(1, Math.round(context.sampleRate)), context.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    this.context = context
    this.mix = mix
    this.master = master
    this.noise = noise
    this.builtinAnalyser = analyser
    return context
  }

  private makeAnalyser(context: AudioContext): AnalyserNode {
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.35
    analyser.minDecibels = -90
    analyser.maxDecibels = -10
    if (!this.bytes) {
      this.bytes = new Uint8Array(analyser.frequencyBinCount)
      this.floats = new Float32Array(analyser.fftSize)
    }
    return analyser
  }

  // ── The built-in sound ───────────────────────────────────────────────────────────────

  /** Starts the loop. It must be called from a click or a key: that is what lets the browser play sound. */
  async startBuiltIn(): Promise<BuiltInResult> {
    const context = this.ensureContext()
    if (!context || !this.master) return 'unavailable'
    try {
      if (context.state === 'suspended') await context.resume()
    } catch {
      return 'unavailable'
    }
    if (this.disposed) return 'unavailable'
    this.setSource('builtin')
    if (this.current.playing) return 'playing'
    this.clock.nextTime = context.currentTime + 0.08
    this.clock.step = 0
    this.master.gain.setTargetAtTime(this.current.volume, context.currentTime, 0.03)
    this.timer = this.deps.setInterval(() => this.tick(), TIMER_MS)
    this.change({ playing: true })
    return 'playing'
  }

  pauseBuiltIn(): void {
    if (this.timer !== null) this.deps.clearInterval(this.timer)
    this.timer = null
    if (this.master && this.context) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.05)
    if (this.current.playing) this.change({ playing: false })
  }

  private tick(): void {
    const context = this.context
    if (!context || !this.current.playing) return
    for (const due of dueSteps(this.clock, context.currentTime, LOOKAHEAD, this.current.tempo))
      this.playStep(due.step % LOOP_STEPS, due.time)
  }

  private playStep(index: number, time: number): void {
    const step = patternAt(index)
    const length = stepSeconds(this.current.tempo)
    if (step.kick) this.kick(time)
    if (step.snare) this.clap(time)
    if (step.hat) this.hat(time, step.hat === 2)
    if (step.bass !== null) this.bass(time, midiToHz(step.bass), length * 2.6)
    if (step.arp !== null) this.arp(time, midiToHz(step.arp), length * 1.8)
  }

  private envelope(time: number, peak: number, decay: number): GainNode | null {
    const context = this.context
    if (!context || !this.mix) return null
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay)
    gain.connect(this.mix)
    return gain
  }

  private kick(time: number): void {
    const context = this.context
    const gain = this.envelope(time, 0.95, 0.4)
    if (!context || !gain) return
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(165, time)
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.14)
    osc.connect(gain)
    osc.start(time)
    osc.stop(time + 0.42)
  }

  private noiseBurst(
    time: number,
    filter: BiquadFilterType,
    frequency: number,
    q: number,
    peak: number,
    decay: number,
  ) {
    const context = this.context
    const gain = this.envelope(time, peak, decay)
    if (!context || !gain || !this.noise) return
    const source = context.createBufferSource()
    source.buffer = this.noise
    const biquad = context.createBiquadFilter()
    biquad.type = filter
    biquad.frequency.value = frequency
    biquad.Q.value = q
    source.connect(biquad)
    biquad.connect(gain)
    source.start(time, Math.random() * 0.5)
    source.stop(time + decay + 0.02)
  }

  private clap(time: number): void {
    this.noiseBurst(time, 'bandpass', 1900, 0.8, 0.55, 0.2)
    const context = this.context
    const gain = this.envelope(time, 0.22, 0.12)
    if (!context || !gain) return
    const osc = context.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = 190
    osc.connect(gain)
    osc.start(time)
    osc.stop(time + 0.14)
  }

  private hat(time: number, open: boolean): void {
    this.noiseBurst(time, 'highpass', 7500, 0.7, open ? 0.26 : 0.2, open ? 0.22 : 0.05)
  }

  private bass(time: number, hz: number, length: number): void {
    const context = this.context
    const gain = this.envelope(time, 0.5, length)
    if (!context || !gain) return
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 4
    filter.frequency.setValueAtTime(900, time)
    filter.frequency.exponentialRampToValueAtTime(160, time + 0.2)
    const osc = context.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = hz
    osc.connect(filter)
    filter.connect(gain)
    osc.start(time)
    osc.stop(time + length + 0.02)
  }

  private arp(time: number, hz: number, length: number): void {
    const context = this.context
    const gain = this.envelope(time, 0.15, length)
    if (!context || !gain) return
    const osc = context.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = hz
    osc.connect(gain)
    osc.start(time)
    osc.stop(time + length + 0.02)
  }

  // ── The microphone ───────────────────────────────────────────────────────────────────

  /**
   * Asks the browser for the microphone and, if it is given, listens. The caller must already have
   * shown the visitor what this means and have their yes: this is the step after it. The answer is
   * `denied` when the browser or the visitor refused, `unavailable` when there is no microphone (or
   * this page is not allowed to ask), and `cancelled` when the visitor changed their mind or left
   * while the question was open: then nothing is left running.
   */
  async startMic(): Promise<MicResult> {
    if (this.disposed) return 'cancelled'
    if (this.current.micOn) return 'on'
    const getUserMedia = this.deps.getUserMedia
    if (!getUserMedia) return 'unavailable'
    const context = this.ensureContext()
    if (!context) return 'unavailable'

    const token = ++this.micToken
    this.change({ micAsking: true })
    let stream: MediaStream
    try {
      stream = await getUserMedia(MIC_CONSTRAINTS)
    } catch (error) {
      if (token === this.micToken) this.change({ micAsking: false })
      const name = (error as { name?: unknown } | null)?.name
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'NotReadableError')
        return 'unavailable'
      return 'error'
    }
    if (this.disposed || token !== this.micToken) {
      stopStream(stream)
      return 'cancelled'
    }
    try {
      if (context.state === 'suspended') await context.resume()
    } catch {
      // The analyser still runs on a context that could not be resumed; there is just nothing to hear.
    }
    if (this.disposed || token !== this.micToken) {
      stopStream(stream)
      return 'cancelled'
    }

    const node = context.createMediaStreamSource(stream)
    const analyser = this.makeAnalyser(context)
    // To the analyser and nowhere else: the microphone is never played back.
    node.connect(analyser)
    this.micStream = stream
    this.micNode = node
    this.micAnalyser = analyser
    for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => this.stopMic())
    this.pauseBuiltIn()
    this.shaper.reset()
    this.change({ source: 'mic', micOn: true, micAsking: false })
    return 'on'
  }

  /** Switches the microphone off: every track stopped, the wire cut. Safe to call at any time. */
  stopMic(): void {
    this.micToken += 1
    const wasOn = this.current.micOn
    const wasAsking = this.current.micAsking
    stopStream(this.micStream)
    try {
      this.micNode?.disconnect()
    } catch {
      // Already disconnected.
    }
    this.micStream = null
    this.micNode = null
    this.micAnalyser = null
    if (wasOn || wasAsking) {
      this.shaper.reset()
      this.change({
        micOn: false,
        micAsking: false,
        ...(this.current.source === 'mic' ? { source: 'preview' as const } : {}),
      })
    }
  }

  // ── What the scene reads ─────────────────────────────────────────────────────────────

  /** Advances the sound by `dt` seconds and refills (and returns) the frame. */
  read(dt: number): AudioFrame {
    const step = Math.min(Math.max(dt, 0), 0.1)
    const { source, previewOn, micOn } = this.current
    const analyser = source === 'mic' && micOn ? this.micAnalyser : source === 'builtin' ? this.builtinAnalyser : null
    if (analyser && this.context && this.bytes && this.floats) {
      analyser.getByteFrequencyData(this.bytes)
      analyser.getFloatTimeDomainData(this.floats)
      this.reader.read(this.bytes, this.floats, this.context.sampleRate, step, this.raw)
    } else if (source === 'preview' && previewOn) {
      this.previewTime += step
      previewRaw(this.previewTime, this.current.tempo, this.raw)
    } else {
      this.raw.level = this.raw.bass = this.raw.mid = this.raw.high = 0
      this.raw.spectrum.fill(0)
      this.raw.wave.fill(0)
    }
    this.shaper.shape(this.raw, this.frame, step, this.current.smoothing)
    return this.frame
  }

  /** Whether anything is making the picture move: a sound, or the preview, or a tail still fading. */
  get active(): boolean {
    const { source, previewOn, playing, micOn } = this.current
    return (
      (source === 'preview' && previewOn) ||
      (source === 'builtin' && playing) ||
      (source === 'mic' && micOn) ||
      this.frame.level > 0.003 ||
      this.frame.beat > 0.01
    )
  }

  // ── Leaving ──────────────────────────────────────────────────────────────────────────

  /**
   * Lets go of everything: the microphone first, then the sound, then the audio itself. A released
   * engine does nothing until `attach()` is called, which is what a page does when React runs an
   * effect, ends it and runs it again.
   */
  dispose(): void {
    if (this.disposed) return
    this.stopMic()
    this.pauseBuiltIn()
    this.disposed = true
    const context = this.context
    this.context = null
    this.mix = null
    this.master = null
    this.builtinAnalyser = null
    void context?.close().catch(() => undefined)
  }

  /** Makes a released engine usable again. Nothing is started: audio is still made only on a click. */
  attach(): void {
    this.disposed = false
  }
}
