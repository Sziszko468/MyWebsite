import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listen, problemOf, speechSupport, SPEECH_LOCALES, tidyTranscript, type RecognitionConstructor, type RecognitionLike, type SpeechProblem } from './voice'

/*
 * A stand-in for the browser's speech recogniser. It lets the logic around it be tested; it is not
 * speech recognition, and nothing here shows that a real browser's recogniser hears Hungarian, English
 * or Dutch.
 */
function fakeRecogniser(options: { startThrows?: boolean } = {}) {
  const made: Array<RecognitionLike & { started: number; stopped: number; aborted: number }> = []
  const Ctor = class implements RecognitionLike {
    lang = ''
    continuous = true
    interimResults = false
    maxAlternatives = 5
    onresult: RecognitionLike['onresult'] = null
    onerror: RecognitionLike['onerror'] = null
    onend: RecognitionLike['onend'] = null
    onstart: RecognitionLike['onstart'] = null
    started = 0
    stopped = 0
    aborted = 0
    constructor() {
      made.push(this)
    }
    start() {
      if (options.startThrows) throw new Error('already started')
      this.started++
      this.onstart?.()
    }
    stop() {
      this.stopped++
      this.onend?.()
    }
    abort() {
      this.aborted++
      this.onerror?.({ error: 'aborted' })
      this.onend?.()
    }
  } as unknown as RecognitionConstructor
  return { Ctor, made }
}

const results = (...parts: Array<[string, boolean]>) => ({ results: parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) as never })

function collect() {
  const log = { text: [] as Array<{ final: string; interim: string }>, problems: [] as SpeechProblem[], listening: 0, ended: 0 }
  return {
    log,
    handlers: {
      onText: (text: { final: string; interim: string }) => log.text.push(text),
      onProblem: (p: SpeechProblem) => log.problems.push(p),
      onListening: () => log.listening++,
      onEnd: () => log.ended++,
    },
  }
}

describe('speech recognition in the description box', () => {
  it('finds the browser’s recogniser under either of its names, or none', () => {
    const Ctor = fakeRecogniser().Ctor
    expect(speechSupport({ SpeechRecognition: Ctor })).toBe(Ctor)
    expect(speechSupport({ webkitSpeechRecognition: Ctor })).toBe(Ctor)
    expect(speechSupport({})).toBeNull()
  })

  it('listens in the language asked for, once, until the speaker pauses', () => {
    const { Ctor, made } = fakeRecogniser()
    for (const language of ['hu', 'en', 'nl'] as const) {
      const { handlers } = collect()
      listen(language, handlers, Ctor)
      expect(made.at(-1)).toMatchObject({ lang: SPEECH_LOCALES[language], continuous: false, interimResults: true, maxAlternatives: 1, started: 1 })
    }
    expect(SPEECH_LOCALES).toEqual({ hu: 'hu-HU', en: 'en-US', nl: 'nl-NL' })
  })

  it('shows what it hears as it goes: interim words first, settled words after', () => {
    const { Ctor, made } = fakeRecogniser()
    const { log, handlers } = collect()
    listen('en', handlers, Ctor)
    expect(log.listening).toBe(1)
    made[0].onresult?.(results(['a small cop', false]))
    made[0].onresult?.(results(['a small copper robot', true], ['with a yellow', false]))
    made[0].onresult?.(results(['a small copper robot', true], ['with a yellow umbrella', true]))
    expect(log.text).toEqual([
      { final: '', interim: 'a small cop' },
      { final: 'a small copper robot', interim: 'with a yellow' },
      { final: 'a small copper robot with a yellow umbrella', interim: '' },
    ])
  })

  it('can be stopped, and says when it has ended, once, with nothing left hanging', () => {
    const { Ctor, made } = fakeRecogniser()
    const { log, handlers } = collect()
    const session = listen('nl', handlers, Ctor)!
    session.stop()
    expect(made[0].stopped).toBe(1)
    expect(log.ended).toBe(1)
    expect(made[0].onresult).toBeNull()
    expect(made[0].onend).toBeNull()
    session.stop() // already over: harmless
  })

  it('aborting is not reported as a problem', () => {
    const { Ctor } = fakeRecogniser()
    const { log, handlers } = collect()
    listen('hu', handlers, Ctor)!.abort()
    expect(log.problems).toEqual([])
    expect(log.ended).toBe(1)
  })

  it('names each browser error, so a refused microphone is explained and typing is still offered', () => {
    expect(problemOf('not-allowed')).toBe('denied')
    expect(problemOf('service-not-allowed')).toBe('denied')
    expect(problemOf('audio-capture')).toBe('no-microphone')
    expect(problemOf('no-speech')).toBe('no-speech')
    expect(problemOf('network')).toBe('network')
    expect(problemOf('language-not-supported')).toBe('language')
    expect(problemOf('something-new')).toBe('failed')
    const { Ctor, made } = fakeRecogniser()
    const { log, handlers } = collect()
    listen('en', handlers, Ctor)
    made[0].onerror?.({ error: 'not-allowed' })
    made[0].onend?.()
    expect(log.problems).toEqual(['denied'])
    expect(log.ended).toBe(1)
  })

  it('reports a browser without recognition, and a recogniser that cannot start', () => {
    const none = collect()
    expect(listen('en', none.handlers, null)).toBeNull()
    expect(none.log).toMatchObject({ problems: ['unsupported'], ended: 1 })
    const busy = collect()
    expect(listen('en', busy.handlers, fakeRecogniser({ startThrows: true }).Ctor)).toBeNull()
    expect(busy.log).toMatchObject({ problems: ['busy'], ended: 1 })
  })

  it('tidies recognised words into one clean line', () => {
    expect(tidyTranscript('  a \u0000small\n robot\t ')).toBe('a small robot')
    expect(tidyTranscript('')).toBe('')
  })

  it('never opens the microphone, records or sends audio itself: only the browser’s recogniser is used', () => {
    const code = (file: string) =>
      readFileSync(new URL(file, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
    for (const file of ['./voice.ts', './VoiceInput.tsx']) {
      const source = code(file)
      expect(source, file).not.toMatch(/getUserMedia|MediaRecorder|AudioContext|createMediaStream|FormData|sendBeacon|XMLHttpRequest|WebSocket/)
      expect(source, file).not.toMatch(/\bfetch\s*\(/)
      expect(source, file).not.toMatch(/localStorage|sessionStorage|indexedDB/)
    }
  })
})
