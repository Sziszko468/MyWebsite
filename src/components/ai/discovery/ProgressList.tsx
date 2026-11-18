import { controlRoom } from '../../../ai/controlRoom'
import type { DiscoveryState, StageStatus } from '../../../ai/discoveryModel'
import { useDiscoveryText } from '../../../ai/useDiscoveryText'
import { cx } from '../../../utils/cx'
import { fill } from '../../../utils/format'
import styles from './Discovery.module.scss'

const MARK: Record<StageStatus, string> = { done: '✓', current: '→', todo: '○', skipped: '–', not_applicable: '·' }

/**
 * Where the visitor is in the discovery: how far, what is next, and every step with its state. An optional step can be skipped (and taken
 * back): nothing here forces a question, and a step that does not apply to this kind of project is shown as such, not as something to do.
 */
export function ProgressList({ state, locked }: { state: DiscoveryState; locked: boolean }) {
  const text = useDiscoveryText()
  const applicable = state.progress.filter((item) => item.status !== 'not_applicable')
  const total = applicable.length
  const finished = applicable.filter((item) => item.status === 'done' || item.status === 'skipped').length
  const current = state.progress.find((item) => item.status === 'current')
  // No step is current once a plan exists and only optional questions are open: "every step is done" would not be true, so it says what is left.
  const remaining = applicable.filter((item) => item.status === 'todo').length

  return (
    <section className={styles.progress} aria-label={text.progress.title}>
      <div className={styles.progressLine}>
        <span>{current ? fill(text.progress.now, { stage: text.progress.stage[current.stage] }) : remaining === 0 ? text.progress.allDone : fill(text.progress.optionalLeft, { n: remaining })}</span>
        {current && <span className={styles.muted}>{fill(text.progress.step, { n: Math.min(finished + 1, total), total })}</span>}
      </div>
      <div className={styles.meter} role="progressbar" aria-label={text.progress.title} aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished}>
        <span className={styles.meterFill} style={{ transform: `scaleX(${total === 0 ? 0 : finished / total})` }} />
      </div>
      <details className={styles.steps}>
        <summary>{text.progress.list}</summary>
        <ol className={styles.stepList}>
          {state.progress.map((item) => {
            const name = text.progress.stage[item.stage]
            const muted = item.status === 'skipped' || item.status === 'not_applicable'
            return (
              <li key={item.stage} className={cx(styles.step, item.status === 'done' && styles.stepDone, item.status === 'current' && styles.stepCurrent, muted && styles.stepMuted)} aria-current={item.status === 'current' ? 'step' : undefined}>
                <span className={styles.stepName}>
                  <span className={styles.stepMark} aria-hidden="true">
                    {MARK[item.status]}
                  </span>
                  <span>
                    {name} <span className={styles.small}>({text.progress.status[item.status]})</span>
                  </span>
                </span>
                {item.skippable && (item.status === 'todo' || item.status === 'current') && (
                  <button type="button" className={cx(styles.ghost, styles.compact)} disabled={locked} aria-label={`${text.progress.skip}: ${name}`} onClick={() => void controlRoom.discoverySkip(item.stage, true)}>
                    {text.progress.skip}
                  </button>
                )}
                {item.skippable && item.status === 'skipped' && (
                  <button type="button" className={cx(styles.ghost, styles.compact)} disabled={locked} aria-label={`${text.progress.unskip}: ${name}`} onClick={() => void controlRoom.discoverySkip(item.stage, false)}>
                    {text.progress.unskip}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </details>
    </section>
  )
}
