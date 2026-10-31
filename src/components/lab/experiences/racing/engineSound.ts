import type { Telemetry } from './telemetry'

/**
 * An engine note and tyre noise from Web Audio, made of two oscillators and filtered noise. It is
 * silent until the visitor switches it on (browsers do not allow sound before a gesture, and the
 * Lab never starts it by itself), follows the car's revs, throttle and slide, and releases the
 * audio context when it is switched off or the page is left.
 */
export class EngineSound {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private low: OscillatorNode | null = null
  private high: OscillatorNode | null = null
  private tone: BiquadFilterNode | null = null
  private noiseGain: GainNode | null = null
  private noiseFilter: BiquadFilterNode | null = null
  private noiseSource: AudioBufferSourceNode | null = null

  get running(): boolean {
    return this.context !== null
  }

  /** Call from a click or key press. Returns false if the browser has no Web Audio. */
  start(): boolean {
    if (this.context) return true
    const Context =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return false
    try {
      const context = new Context()
      const master = context.createGain()
      master.gain.value = 0
      master.connect(context.destination)
      const tone = context.createBiquadFilter()
      tone.type = 'lowpass'
      tone.frequency.value = 1200
      tone.connect(master)
      const low = context.createOscillator()
      low.type = 'sawtooth'
      const high = context.createOscillator()
      high.type = 'square'
      const lowGain = context.createGain()
      lowGain.gain.value = 0.5
      const highGain = context.createGain()
      highGain.gain.value = 0.18
      low.connect(lowGain).connect(tone)
      high.connect(highGain).connect(tone)
      low.start()
      high.start()

      // Looping white noise for the wind and the tyres.
      const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      const noise = context.createBufferSource()
      noise.buffer = buffer
      noise.loop = true
      const filter = context.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1600
      filter.Q.value = 0.8
      const gain = context.createGain()
      gain.gain.value = 0
      noise.connect(filter).connect(gain).connect(master)
      noise.start()

      this.context = context
      this.master = master
      this.low = low
      this.high = high
      this.tone = tone
      this.noiseGain = gain
      this.noiseFilter = filter
      this.noiseSource = noise
      void context.resume()
      master.gain.setTargetAtTime(0.5, context.currentTime, 0.1)
      return true
    } catch {
      this.stop()
      return false
    }
  }

  update(telemetry: Telemetry): void {
    const context = this.context
    if (!context || !this.low || !this.high || !this.tone || !this.noiseGain || !this.noiseFilter) return
    const now = context.currentTime
    const revs = Math.max(telemetry.rpm, 3500) / 60
    this.low.frequency.setTargetAtTime(revs * 1.0, now, 0.05)
    this.high.frequency.setTargetAtTime(revs * 2.0, now, 0.05)
    this.tone.frequency.setTargetAtTime(500 + telemetry.throttle * 2200 + telemetry.rpm * 0.12, now, 0.08)
    const wind = Math.min(1, telemetry.speed / 320)
    this.noiseFilter.frequency.setTargetAtTime(900 + wind * 1800 + telemetry.slide * 900, now, 0.1)
    this.noiseGain.gain.setTargetAtTime(wind * 0.05 + telemetry.slide * 0.22, now, 0.08)
    this.master?.gain.setTargetAtTime(telemetry.phase === 'countdown' ? 0.12 : 0.28, now, 0.15)
  }

  stop(): void {
    const context = this.context
    this.context = null
    try {
      this.low?.stop()
      this.high?.stop()
      this.noiseSource?.stop()
    } catch {
      // Already stopped.
    }
    this.low = this.high = this.noiseSource = null
    this.master = this.tone = this.noiseGain = this.noiseFilter = null
    void context?.close().catch(() => undefined)
  }
}
