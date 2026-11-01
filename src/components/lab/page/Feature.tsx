import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { experimentPath } from '../../../content/lab'
import { localizedPath } from '../../../i18n/paths'
import { useI18n } from '../../../i18n/useI18n'
import { Container } from '../../Container/Container'
import { Reveal } from '../../motion/Reveal'
import { Section } from '../../Section/Section'
import { useLocalized } from '../core/useLabText'
import { EXAMPLES } from '../experiments/generative/examples'
import { MAX_PROMPT } from '../experiments/generative/spec'
import styles from './Feature.module.scss'
import { pageText } from './pageText'

/** The real pictures (made by the generator from these sentences) shown under the form. */
const SHOWN = [
  { file: 'example-banana.jpg', example: 0, name: 'banana' },
  { file: 'example-croissant.jpg', example: 3, name: 'croissant' },
  { file: 'example-frog.jpg', example: 4, name: 'frog' },
  { file: 'example-fridge.jpg', example: 6, name: 'fridge' },
] as const

/**
 * The object generator's own band: what it is in one line, a box to write in (which opens the
 * generator with that sentence already building), sentences to start from, how it works, and a few
 * creations it really made, each one a link that builds it again.
 */
export function Feature() {
  const t = useLocalized(pageText)
  const { lang } = useI18n()
  const navigate = useNavigate()
  const titleId = useId()
  const inputId = useId()
  const [text, setText] = useState('')

  const go = (words: string) => {
    const query = words.trim() ? `?q=${encodeURIComponent(words.trim().slice(0, MAX_PROMPT))}` : ''
    navigate(`${localizedPath(lang, experimentPath('generative-objects'))}${query}`)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    go(text)
  }

  return (
    <Section id="generative-objects" tone="dark" labelledBy={titleId} className={styles.section}>
      <Container size="wide">
        <div className={styles.layout}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>{t.feature.eyebrow}</p>
            <h2 id={titleId} className={styles.title}>
              {t.feature.title}
            </h2>
            <p className={styles.lead}>{t.feature.lead}</p>

            <form className={styles.form} onSubmit={submit}>
              <label htmlFor={inputId} className={styles.label}>
                {t.feature.label}
              </label>
              <div className={styles.row}>
                <input
                  id={inputId}
                  className={styles.input}
                  value={text}
                  maxLength={MAX_PROMPT}
                  placeholder={t.feature.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setText(event.currentTarget.value)}
                />
                <button type="submit" className={styles.cta}>
                  {t.feature.cta}
                </button>
              </div>
            </form>

            <p className={styles.or}>{t.feature.or}</p>
            <ul className={styles.prompts}>
              {EXAMPLES.map((example) => (
                <li key={example.en}>
                  <button type="button" onClick={() => go(example[lang])}>
                    {example[lang]}
                  </button>
                </li>
              ))}
            </ul>

            <div className={styles.steps}>
              <h3>{t.feature.steps.title}</h3>
              <ol>
                <li>{t.feature.steps.write}</li>
                <li>{t.feature.steps.build}</li>
                <li>{t.feature.steps.keep}</li>
              </ol>
            </div>
          </div>

          <div className={styles.gallery}>
            <h3 className={styles.galleryTitle}>{t.feature.examplesTitle}</h3>
            <ul className={styles.pictures}>
              {SHOWN.map((item) => (
                <li key={item.file}>
                  <Reveal>
                    <button type="button" className={styles.picture} onClick={() => go(EXAMPLES[item.example][lang])} aria-label={`${t.feature.makeIt}: ${t.examples[item.name]}`}>
                      <img src={`${import.meta.env.BASE_URL}lab/${item.file}`} alt="" width={640} height={400} loading="lazy" decoding="async" />
                      <span className={styles.caption}>
                        <strong>{t.examples[item.name]}</strong>
                        <span>{t.feature.makeIt} →</span>
                      </span>
                    </button>
                  </Reveal>
                </li>
              ))}
            </ul>
            <p className={styles.note}>{t.feature.examplesNote}</p>
          </div>
        </div>
      </Container>
    </Section>
  )
}
