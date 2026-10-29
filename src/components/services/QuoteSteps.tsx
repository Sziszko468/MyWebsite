import { useI18n } from '../../i18n/useI18n'
import { STEPS } from '../../quote/types'
import { fill, pad } from '../../utils/format'
import styles from './QuoteForm.module.scss'

interface QuoteStepsProps {
  /** Zero-based position of the step being answered. */
  current: number
  /** Go back to an earlier step; answers are kept. */
  onGoTo: (index: number) => void
}

/**
 * Where the visitor is in the four steps. Narrow screens get one line and a bar ("Step 2 of 4,
 * Details"); from `md` the four steps are listed. Finished steps are buttons that lead back; the
 * current step is marked with aria-current and in words, not only with a colour.
 */
export function QuoteSteps({ current, onGoTo }: QuoteStepsProps) {
  const { t } = useI18n()
  const q = t.servicesPage.quote

  return (
    <div className={styles.steps}>
      <div className={styles.compact}>
        <p className={styles.compactText}>
          {fill(q.stepOf, { current: current + 1, total: STEPS.length })}
          <span aria-hidden="true"> · </span>
          {q.steps[STEPS[current]]}
        </p>
        <div className={styles.bar} aria-hidden="true">
          <span style={{ width: `${((current + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <ol className={styles.list} aria-label={q.stepsLabel}>
        {STEPS.map((id, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'todo'
          const content = (
            <>
              <span className={styles.stepMark} aria-hidden="true">
                {state === 'done' ? '✓' : pad(index + 1)}
              </span>
              <span className={styles.stepName}>{q.steps[id]}</span>
              {state === 'done' && <span className="visually-hidden"> ({q.stepDone})</span>}
              {state === 'current' && <span className="visually-hidden"> ({q.stepCurrent})</span>}
            </>
          )
          return (
            <li key={id} data-state={state}>
              {state === 'done' ? (
                <button type="button" className={styles.stepItem} onClick={() => onGoTo(index)}>
                  {content}
                </button>
              ) : (
                <span className={styles.stepItem} aria-current={state === 'current' ? 'step' : undefined}>
                  {content}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
