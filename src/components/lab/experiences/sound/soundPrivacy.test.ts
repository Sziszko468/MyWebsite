import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  RANGES,
  SOUND_PALETTES,
  SOUND_PALETTE_IDS,
  particleBudget,
  patchSettings,
  resetSettings,
  sanitizeSettings,
  setConsent,
  sound,
} from './soundParams'

/**
 * The Sound Reactive World may listen through the microphone only when the visitor says so, and then
 * it may only look at the sound. These tests read the world's own source files and fail if any of
 * them could record, store or send sound, or play the microphone back: a promise kept in code, not
 * only in words. (The behaviour is tested in soundEngine.test.ts with a stand-in for the browser.)
 */
const files = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>
const own = Object.entries(files).filter(([name]) => !name.includes('.test.'))
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('what the sound world is built without', () => {
  it('reads its own files', () => {
    expect(own.map(([name]) => name)).toEqual(
      expect.arrayContaining(['./soundEngine.ts', './SoundWorld.tsx', './SoundScene.tsx']),
    )
  })

  it('has no way to record sound: no recorder, no capture of a stream, no worklet', () => {
    for (const [name, text] of own) {
      for (const pattern of [
        /MediaRecorder/,
        /createMediaStreamDestination/,
        /captureStream/,
        /AudioWorklet/,
        /ScriptProcessor/,
        /\.toBlob\(/,
      ]) {
        expect(pattern.test(code(text)), `${name} ${pattern}`).toBe(false)
      }
    }
  })

  it('has no way to send anything: no request, no socket, no beacon, no peer connection', () => {
    for (const [name, text] of own) {
      for (const pattern of [
        /\bfetch\s*\(/,
        /XMLHttpRequest/,
        /sendBeacon/,
        /WebSocket/,
        /RTCPeerConnection/,
        /EventSource/,
        /\bimport\s*\(\s*['"]http/,
      ]) {
        expect(pattern.test(code(text)), `${name} ${pattern}`).toBe(false)
      }
    }
  })

  it('has no place to keep sound: no database, no cache, no file, and its storage is the settings alone', () => {
    for (const [name, text] of own) {
      for (const pattern of [
        /indexedDB/i,
        /caches\./,
        /showSaveFilePicker/,
        /downloadBlob/,
        /downloadJson/,
        /URL\.createObjectURL/,
      ]) {
        expect(pattern.test(code(text)), `${name} ${pattern}`).toBe(false)
      }
      if (!name.endsWith('soundParams.ts'))
        expect(/localStorage|sessionStorage|loadJson|saveJson/.test(code(text)), name).toBe(false)
    }
  })

  it('asks for the microphone in exactly one place, for sound only', () => {
    const calls = own.flatMap(([name, text]) => (code(text).match(/getUserMedia\s*\(/g) ?? []).map(() => name))
    expect([...new Set(calls)]).toEqual(['./soundEngine.ts'])
    const engine = code(files['./soundEngine.ts'])
    expect(engine).toMatch(/video:\s*false/)
    expect(engine).not.toMatch(/video:\s*true/)
  })

  it('connects only its own mix to the speakers, never the microphone', () => {
    const engine = code(files['./soundEngine.ts'])
    // Whatever is connected to the destination, by the name it is connected from.
    const toSpeakers = [...engine.matchAll(/(\w+)\.connect\(\s*[\w.]*destination\s*\)/g)].map((m) => m[1])
    expect(toSpeakers).toEqual(['master'])
    // The microphone's node is connected to one analyser.
    expect(engine).toMatch(/node\.connect\(analyser\)/)
    expect(engine).not.toMatch(/micNode\.connect/)
  })

  it('does not ask for anything or make any sound when the page is merely opened', () => {
    const world = code(files['./SoundWorld.tsx'])
    expect(world).not.toMatch(/startMic\(\)\s*[;}]?\s*\n\s*\/\/ on mount/)
    // startMic is called from one handler (the "allow" button), startBuiltIn from the play button.
    expect((world.match(/engine\.startMic\(/g) ?? []).length).toBe(1)
    expect((world.match(/engine\.startBuiltIn\(/g) ?? []).length).toBe(1)
    expect(world).toMatch(/const allow = async/)
  })
})

describe('what is kept between visits', () => {
  it('is the settings, clamped, and never which source was in use', () => {
    const s = sanitizeSettings({
      source: 'mic',
      micOn: true,
      tempo: 9999,
      volume: -4,
      sensitivity: 99,
      palette: 'nope',
      waveform: 'yes',
      extra: 1,
    })
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort())
    expect(s.tempo).toBe(150)
    expect(s.volume).toBe(RANGES.volume.min)
    expect(s.sensitivity).toBe(RANGES.sensitivity.max)
    expect(s.palette).toBe(DEFAULT_SETTINGS.palette)
    expect(s.waveform).toBe(DEFAULT_SETTINGS.waveform)
    expect('source' in s).toBe(false)
  })

  it('survives anything it is handed', () => {
    for (const raw of [null, undefined, 'x', 4, [], {}, { tempo: NaN, volume: Infinity }]) {
      const s = sanitizeSettings(raw)
      expect(
        Number.isFinite(
          s.tempo + s.volume + s.smoothing + s.sensitivity + s.geometry + s.particles + s.lights + s.density,
        ),
      ).toBe(true)
    }
  })

  it('has real colours, three for each palette', () => {
    for (const id of SOUND_PALETTE_IDS) {
      expect(SOUND_PALETTES[id]).toHaveLength(3)
      for (const hex of SOUND_PALETTES[id]) expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('changes the store through patches that are checked', () => {
    resetSettings()
    patchSettings({ sensitivity: 50, geometry: -2, palette: 'ember' })
    expect(sound.get().settings.sensitivity).toBe(RANGES.sensitivity.max)
    expect(sound.get().settings.geometry).toBe(RANGES.geometry.min)
    expect(sound.get().settings.palette).toBe('ember')
    resetSettings()
    expect(sound.get().settings).toEqual(DEFAULT_SETTINGS)
  })

  it('shows the explanation only when asked, and starts without it', () => {
    expect(sound.get().consent).toBe(false)
    setConsent(true)
    expect(sound.get().consent).toBe(true)
    setConsent(false)
  })

  it('sizes the particles from the device, never beyond a share of what its tier allows', () => {
    expect(particleBudget(36_000)).toBeLessThan(36_000)
    expect(particleBudget(7_500)).toBeLessThan(particleBudget(18_000))
    expect(particleBudget(18_000)).toBeLessThan(particleBudget(36_000))
  })
})
