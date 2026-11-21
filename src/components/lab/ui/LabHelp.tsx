import type { LabId } from '../../../content/lab'
import { useLabText } from '../core/useLabText'
import styles from './LabHelp.module.scss'

/**
 * "How to use it": the ways to interact with this experience, in the panel itself, so the visitor
 * does not have to leave the stage to learn them. A native disclosure: closed it is one line,
 * open it is the experience's own list and the keyboard line, and the browser gives it its role,
 * its state and its keys.
 */
export function LabHelp({ id }: { id: LabId }) {
  const { text, experiments } = useLabText()
  const copy = experiments[id]

  return (
    <details className={styles.help} data-lab-help>
      <summary className={styles.summary}>{text.help.title}</summary>
      <ul className={styles.list}>
        {copy.interactions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className={styles.keys}>{text.details.keyboard}</p>
    </details>
  )
}
