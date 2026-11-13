import { useId } from 'react'
import { estimateSize } from '../../../shop/fullExperience/estimate'
import { useShopText } from '../../../shop/useShopText'
import styles from './ProjectSizeGuide.module.scss'

/**
 * "How big the project looks" (PROMPT 20): Basic, Moderate, Advanced or Custom, worked out from the answers by the rule in
 * shop/fullExperience/estimate.ts. A planning aid, said so on the screen next to the result: not a quote, not a promise, no price and
 * no time. Nothing is shown until there is something to base it on. The server works the same guide out again when the request is sent.
 */
export function ProjectSizeGuide({ answers }: { answers: Readonly<Record<string, readonly string[]>> }) {
  const { experience } = useShopText()
  const id = useId()
  const size = estimateSize(answers)
  if (!size) return null
  const words = experience.start.size
  const level = words.levels[size.level]

  return (
    <section className={styles.root} aria-labelledby={id} data-level={size.level}>
      <h3 id={id} className={styles.title}>
        {words.title}
      </h3>
      <p className={styles.level}>
        <strong>{level.name}</strong>
        <span className={styles.text}>{level.text}</span>
      </p>
      <p className={styles.note}>{words.note}</p>
    </section>
  )
}
