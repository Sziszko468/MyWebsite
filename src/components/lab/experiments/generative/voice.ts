import type { Language } from './aiClient'

/**
 * Speech to text for the description box, using the browser's own speech recognition
 * (`SpeechRecognition`, or `webkitSpeechRecognition` in Chrome, Edge and Safari). This site records
 * nothing: it never opens the microphone itself (no getUserMedia, no MediaRecorder), never holds audio,
 * and sends no audio anywhere. It only receives the words the browser recognised and puts them in the
 * box, where the visitor can edit them before anything is sent.
 *
 * What the browser does with the sound is the browser's business, and the page says so before the first
 * use: Chrome and Edge send the audio to their vendor's recognition service (and Safari may), so the
 * microphone is only ever started by a click, listens until the speaker pauses (not continuously) and
 * stops at once on the next click, a key press or when the page is left.
 */
export type SpeechProblem = 'unsupported' | 'denied' | 'no-microphone' | 'no-speech' | 'network' | 'language' | 'busy' | 'failed'

export const SPEECH_LOCALES: Record<Language, string> = { hu: 'hu-HU', en: 'en-US', nl: 'nl-NL' }

interface AlternativeLike {
  transcript: string
}
interface ResultLike {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: AlternativeLike
}
interface ResultEventLike {
  readonly results: { readonly length: number; [index: number]: ResultLike }
}

/** The parts of the browser's recogniser this file uses. */
export interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: ResultEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

export type RecognitionConstructor = new () => RecognitionLike

/** The browser's recogniser, or null where there is none (Firefox, some embedded browsers). */
export function speechSupport(scope: object = typeof window === 'undefined' ? {} : window): RecognitionConstructor | null {
  const w = scope as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Names what went wrong, from the browser's error codes. */
export function problemOf(error: string): SpeechProblem {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied'
    case 'audio-capture':
      return 'no-microphone'
    case 'no-speech':
      return 'no-speech'
    case 'network':
      return 'network'
    case 'language-not-supported':
      return 'language'
    default:
      return 'failed'
  }
}

/** Recognised words as a clean single line. */
export function tidyTranscript(raw: string): string {
  let out = ''
  for (const char of raw) {
    const code = char.charCodeAt(0)
    out += code < 32 || code === 127 ? ' ' : char
  }
  return out.replace(/\s+/g, ' ').trim()
}

export interface SpeechHandlers {
  /** The words so far: `final` is settled, `interim` may still change as the speaker goes on. */
  onText(text: { final: string; interim: string }): void
  onProblem(problem: SpeechProblem): void
  /** The microphone is on and the browser is listening. */
  onListening(): void
  /** Listening has ended, however it ended. */
  onEnd(): void
}

export interface Listening {
  /** Stop listening and keep what was recognised. */
  stop(): void
  /** Stop at once and drop it. */
  abort(): void
}

/** The one listening there can be at a time. */
let current: Listening | null = null

/** Stops listening, keeping what was recognised. Called when a creation is started or the page is left. */
export function stopListening(): void {
  current?.stop()
}

/** Stops listening at once and drops what was heard. */
export function abortListening(): void {
  current?.abort()
}

/**
 * Starts listening in the given language, ending any earlier listening first. Returns null (after reporting
 * `unsupported`) where the browser has no recogniser.
 */
export function listen(language: Language, handlers: SpeechHandlers, ctor: RecognitionConstructor | null = speechSupport()): Listening | null {
  current?.abort()
  current = null
  if (!ctor) {
    handlers.onProblem('unsupported')
    handlers.onEnd()
    return null
  }
  let recognition: RecognitionLike
  try {
    recognition = new ctor()
  } catch {
    handlers.onProblem('failed')
    handlers.onEnd()
    return null
  }
  recognition.lang = SPEECH_LOCALES[language]
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  recognition.onstart = () => handlers.onListening()
  recognition.onresult = (event) => {
    let settled = ''
    let pending = ''
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i]
      const text = result.length > 0 ? result[0].transcript : ''
      if (result.isFinal) settled += `${text} `
      else pending += `${text} `
    }
    handlers.onText({ final: tidyTranscript(settled), interim: tidyTranscript(pending) })
  }
  recognition.onerror = (event) => {
    // "aborted" is what stopping on purpose looks like; it is not a problem to report.
    if (event.error !== 'aborted') handlers.onProblem(problemOf(event.error))
  }
  recognition.onend = () => {
    recognition.onresult = recognition.onerror = recognition.onend = recognition.onstart = null
    if (current === session) current = null
    handlers.onEnd()
  }
  const session: Listening = {
    stop: () => {
      try {
        recognition.stop()
      } catch {
        // Already stopped.
      }
    },
    abort: () => {
      try {
        recognition.abort()
      } catch {
        // Already stopped.
      }
    },
  }
  current = session
  try {
    recognition.start()
  } catch {
    // Starting twice, or in a page the browser will not allow.
    if (current === session) current = null
    handlers.onProblem('busy')
    handlers.onEnd()
    return null
  }
  return session
}
