import { Fragment, useLayoutEffect, useRef, type CSSProperties, type ElementType } from 'react'
import { MOTION, staggerDelay } from '../../motion/config'
import { observeOnce } from '../../motion/inView'
import { resolveVariant, splitGraphemes, splitParts, splitWords, type KineticVariant } from '../../motion/kinetic'
import { cx } from '../../utils/cx'
import styles from './KineticText.module.scss'

interface KineticTextProps {
  text: string
  as?: ElementType
  /**
   * `mask`: each word rises out of a clip, the signature move (headlines). `words`: each word rises
   * and fades in, softer (a statement). `chars`: letter by letter, for a few short words only (it
   * falls back to `mask` beyond 28 characters).
   */
  variant?: KineticVariant
  /** `mount`: plays as the element appears (the first screen). `view`: waits until it scrolls into view. */
  trigger?: 'mount' | 'view'
  className?: string
}

/**
 * Kinetic type for the headlines that deserve it (never a paragraph). Every word is real text in the
 * DOM, in reading order and separated by real spaces, so copying, finding, translating and screen
 * readers get the sentence as written; nothing is hidden from assistive technology and no label
 * repeats it. The boxes around the words keep the line exactly as tall and as wide as plain text
 * (nothing shifts while it plays), only transform and opacity animate, a hyphenated word still breaks
 * at its hyphen, and without CSS animation, without IntersectionObserver, under reduced motion and on
 * the cart and the request builder the text is simply there. The delays, durations and curve are the
 * motion tokens, so a scope's intensity applies, and the stagger is capped (a long headline does not
 * wait for its last word).
 */
export function KineticText({ text, as, variant = 'mask', trigger = 'mount', className }: KineticTextProps) {
  const Tag: ElementType = as ?? 'span'
  const ref = useRef<HTMLElement>(null)
  const kind = resolveVariant(variant, text)
  const words = splitWords(text)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || trigger !== 'view' || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (element.closest('[data-motion-scope="checkout"]')) return

    const box = element.getBoundingClientRect()
    if (box.top < window.innerHeight * 0.9 && box.bottom > 0) return

    element.dataset.state = 'hidden'
    const stop = observeOnce(
      element,
      () => {
        element.dataset.state = 'shown'
      },
      { threshold: 0.4, rootMargin: '0px 0px -8% 0px' },
    )
    return () => {
      stop()
      delete element.dataset.state
    }
  }, [trigger, text])

  let index = 0
  return (
    <Tag ref={ref} className={cx(styles.root, className)} data-kinetic={kind} data-trigger={trigger}>
      {words.map((word, wordIndex) => (
        <Fragment key={wordIndex}>
          {wordIndex > 0 && ' '}
          {splitParts(word).map((part, partIndex) => {
            const delay = staggerDelay(index++)
            return (
              <Fragment key={partIndex}>
                {partIndex > 0 && <wbr />}
                <span className={styles.word} style={{ '--d': `${delay}ms` } as CSSProperties}>
                  <span className={styles.inner}>
                    {kind === 'chars'
                      ? splitGraphemes(part).map((char, charIndex) => (
                          <span
                            key={charIndex}
                            className={styles.char}
                            style={{ '--c': `${Math.min(charIndex * 22, MOTION.stagger.max)}ms` } as CSSProperties}
                          >
                            {char}
                          </span>
                        ))
                      : part}
                  </span>
                </span>
              </Fragment>
            )
          })}
        </Fragment>
      ))}
    </Tag>
  )
}
