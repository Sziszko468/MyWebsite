import { useEffect, useId, useRef, useState } from 'react'
import { cx } from '../../../../utils/cx'
import { useLabText, useLocalized } from '../../core/useLabText'
import { Glyph } from '../../experience/ui'
import type { Language } from './aiClient'
import { genText } from './genText'
import styles from './GenerativeObjects.module.scss'
import { abortListening, listen, speechSupport, stopListening, tidyTranscript, type SpeechProblem } from './voice'

/** Whether the visitor has read the note about where the browser sends the sound, for this visit. */
let informed = false

const LANGUAGE_NAMES: Record<Language, string> = { hu: 'Magyar', en: 'English', nl: 'Nederlands' }
const join = (before: string, spoken: string) => (before && spoken ? `${before.replace(/\s+$/, '')} ${spoken}` : before || spoken)

/**
 * The microphone beside the description box. It starts only when clicked (after a note, the first
 * time, about where the browser sends the sound), shows what it hears as it goes, puts the words in
 * the box for editing and stops when asked, on a pause, on Escape or when the page is left. The page
 * itself records and stores nothing: see voice.ts.
 */
export function VoiceInput({ value, max, disabled, onText }: { value: string; max: number; disabled?: boolean; onText(text: string): void }) {
  const t = useLocalized(genText)
  const { lang } = useLabText()
  const id = useId()
  const [supported] = useState(() => speechSupport() !== null)
  const [language, setLanguage] = useState<Language>(lang)
  const [state, setState] = useState<'off' | 'starting' | 'on'>('off')
  const [heard, setHeard] = useState('')
  const [problem, setProblem] = useState<SpeechProblem | null>(null)
  const [asking, setAsking] = useState(false)
  const base = useRef('')
  const spoken = useRef('')
  const commit = useRef(onText)
  useEffect(() => {
    commit.current = onText
  })

  const begin = () => {
    setProblem(null)
    setAsking(false)
    setHeard('')
    spoken.current = ''
    base.current = value
    setState('starting')
    listen(language, {
      onListening: () => setState('on'),
      onText: ({ final, interim }) => {
        spoken.current = tidyTranscript(`${final} ${interim}`)
        setHeard(spoken.current)
      },
      onProblem: (p) => setProblem(p),
      onEnd: () => {
        // What was recognised goes into the box, to be edited; nothing is sent from here.
        if (spoken.current) commit.current(join(base.current, spoken.current).slice(0, max))
        spoken.current = ''
        setState('off')
        setHeard('')
      },
    })
  }

  const click = () => {
    if (state !== 'off') return stopListening()
    if (!informed) return setAsking(true)
    begin()
  }

  // The microphone is never left on behind the visitor's back.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stopListening()
    }
    const onHide = () => {
      if (document.hidden) stopListening()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onHide)
      abortListening()
    }
  }, [])

  if (!supported) {
    return (
      <p className={styles.voiceNote} data-voice="unsupported">
        {t.voice.unsupported}
      </p>
    )
  }

  const on = state !== 'off'
  return (
    <div className={styles.voice} data-voice={state}>
      <div className={styles.voiceRow}>
        <button type="button" className={cx(styles.mic, on && styles.micOn)} aria-pressed={on} disabled={disabled} onClick={click} title={on ? t.voice.stop : t.voice.label}>
          <Glyph>
            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
          </Glyph>
          <span>{on ? t.voice.stop : t.voice.start}</span>
        </button>
        <label className={styles.voiceLanguage} htmlFor={`${id}-lang`}>
          <span className="visually-hidden">{t.voice.language}</span>
          <select id={`${id}-lang`} value={language} disabled={on} onChange={(event) => setLanguage(event.currentTarget.value as Language)} aria-label={t.voice.language}>
            {(Object.keys(LANGUAGE_NAMES) as Language[]).map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {on && (
        <p className={styles.hearing} role="status" aria-live="off" data-hearing>
          <strong>{state === 'starting' ? t.voice.listening : t.voice.hearing}</strong> {heard}
        </p>
      )}
      {problem && (
        <p className={cx(styles.voiceNote, styles.warn)} role="alert" data-voice-problem={problem}>
          {t.voice.problems[problem]}
        </p>
      )}
      {asking && (
        <div className={styles.consent} role="group" aria-label={t.voice.consentTitle}>
          <p>
            <strong>{t.voice.consentTitle}</strong>
          </p>
          <p>{t.voice.consent}</p>
          <p>{t.voice.editHint}</p>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={cx(styles.button, styles.primary)}
              onClick={() => {
                informed = true
                begin()
              }}
            >
              {t.voice.consentGo}
            </button>
            <button type="button" className={styles.button} onClick={() => setAsking(false)}>
              {t.voice.consentNo}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
