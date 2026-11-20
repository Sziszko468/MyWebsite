import { useId, useRef, useState, type ReactNode } from 'react'
import { fill } from '../../utils/format'
import { automation, newDecisionKey, type ActionDetail, type ActionSummary, type HistoryLine, type Preview } from '../api/automation'
import { AdminButton } from '../components/AdminButton'
import { CheckField, TextAreaField } from '../components/form'
import { Icon } from '../components/Icon'
import styles from '../styles/automation.module.scss'
import { errorSentence, moment, valueWord, word } from './model'
import { useAutomationLanguage, useAutomationText } from './text'

/**
 * The parts of the automation screen (PROMPT 33). Every text is the dictionary's; every piece of text an assistant or a customer wrote (a reason, a draft, a note) is put on the page as
 * TEXT (React escapes it): it can never become markup, a link or a control. The server decides what may be done; the buttons here only offer what the server says (`can`) and the
 * server checks again when one is pressed.
 */

export function StatusPill({ status }: { status: ActionSummary['status'] }) {
  const t = useAutomationText()
  return (
    <span className={styles.status} data-status={status}>
      {word(t.status, status)}
    </span>
  )
}

/** Who did a step: the assistant, an administrator or the server, in words (never by colour alone). */
export function ActorLabel({ actor }: { actor: HistoryLine['actor'] }) {
  const t = useAutomationText()
  const name = word(t.actors, actor.type)
  return (
    <span className={styles.actor} data-actor={actor.type}>
      {name}
      {actor.type !== 'server' && actor.email ? ` · ${actor.email}` : ''}
    </span>
  )
}

// ---- what would change -------------------------------------------------------------------------------------------------------------

export function PreviewView({ preview, expiresAt, requiresSecond }: { preview: Preview; expiresAt: string; requiresSecond: boolean }) {
  const t = useAutomationText()
  const language = useAutomationLanguage()
  const names = t.language.names as Record<string, string>
  return (
    <div className={styles.preview}>
      <section aria-labelledby="preview-records" className={styles.block}>
        <h3 id="preview-records" className={styles.blockTitle}>
          {t.detail.recordsTitle}
        </h3>
        <ul className={styles.plainList}>
          {preview.records.map((record, index) => (
            <li key={`${record.type}-${record.reference ?? index}`}>
              <strong>{word(t.targets, record.type)}</strong>
              {record.reference ? ` ${record.reference}` : ''}
              {record.label ? ` · ${record.label}` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="preview-changes" className={styles.block}>
        <h3 id="preview-changes" className={styles.blockTitle}>
          {t.detail.changesTitle}
        </h3>
        {preview.changes.length === 0 ? (
          <p className={styles.muted}>{t.detail.noChanges}</p>
        ) : (
          <div className={styles.tableScroll} tabIndex={0} role="group" aria-label={t.detail.changesTitle}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t.detail.field}</th>
                  <th scope="col">{t.detail.before}</th>
                  <th scope="col">{t.detail.after}</th>
                </tr>
              </thead>
              <tbody>
                {preview.changes.map((change) => (
                  <tr key={change.field}>
                    <th scope="row">{word(t.fields, change.field)}</th>
                    <td>{valueWord(t, language, change.field, change.before)}</td>
                    <td>
                      <strong>{valueWord(t, language, change.field, change.after)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {preview.contents.length > 0 && (
        <section aria-labelledby="preview-contents" className={styles.block}>
          <h3 id="preview-contents" className={styles.blockTitle}>
            {t.detail.contentsTitle}
          </h3>
          {preview.contents.map((content, index) => (
            <figure key={`${content.kind}-${index}`} className={styles.content}>
              <figcaption>
                {word(t.detail.contents, content.kind)}
                {content.language ? ` · ${fill(t.detail.contentLanguage, { language: names[content.language] ?? content.language })}` : ''}
              </figcaption>
              <p className={styles.contentText}>{content.text}</p>
            </figure>
          ))}
        </section>
      )}

      <section aria-labelledby="preview-effects" className={styles.block}>
        <h3 id="preview-effects" className={styles.blockTitle}>
          {t.detail.sideEffectsTitle}
        </h3>
        <ul className={styles.plainList}>
          {preview.sideEffects.map((code) => (
            <li key={code}>{word(t.sideEffects, code)}</li>
          ))}
        </ul>
      </section>

      <dl className={styles.facts}>
        <div>
          <dt>{t.detail.reversibleTitle}</dt>
          <dd>{word(t.reversible, preview.reversible)}</dd>
        </div>
        <div>
          <dt>{t.detail.visibleTitle}</dt>
          <dd>{preview.customerVisible ? t.detail.visible.yes : t.detail.visible.no}</dd>
        </div>
        <div>
          <dt>{t.detail.secondTitle}</dt>
          <dd>{requiresSecond ? t.detail.secondYes : t.detail.secondNo}</dd>
        </div>
        <div>
          <dt>{t.detail.expiresTitle}</dt>
          <dd>{moment(expiresAt, language)}</dd>
        </div>
      </dl>
    </div>
  )
}

// ---- the history ---------------------------------------------------------------------------------------------------------------------

export function Timeline({ lines }: { lines: readonly HistoryLine[] }) {
  const t = useAutomationText()
  const language = useAutomationLanguage()
  return (
    <ol className={styles.timeline}>
      {lines.map((line) => (
        <li key={line.seq} className={styles.timelineItem} data-actor={line.actor.type}>
          <p className={styles.timelineHead}>
            <strong>{word(t.events, line.kind)}</strong> <ActorLabel actor={line.actor} />
          </p>
          <p className={styles.muted}>
            <time dateTime={line.at}>{moment(line.at, language)}</time>
            {` · ${line.from ? `${word(t.status, line.from)} → ` : ''}${word(t.status, line.to)}`}
            {typeof line.detail?.code === 'string' ? ` · ${word(t.failures, line.detail.code)}` : ''}
          </p>
        </li>
      ))}
    </ol>
  )
}

// ---- the decision ---------------------------------------------------------------------------------------------------------------------

/**
 * The dedicated controls. Approving sends the hash of the payload that is on the screen and this decision's own key; the server compares the hash with the frozen payload, checks the permission
 * and the record again, and only then runs it. The second confirmation is a checkbox the server insists on (the button being disabled is a convenience, not the rule).
 */
export function DecisionPanel({ action, onChanged }: { action: ActionDetail; onChanged: (message: string | null) => void }) {
  const t = useAutomationText()
  const titleId = useId()
  const key = useRef(newDecisionKey())
  const [second, setSecond] = useState(false)
  const [note, setNote] = useState('')
  const [working, setWorking] = useState<null | 'approve' | 'reject' | 'cancel' | 'retry'>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const can = action.can
  const nothing = !can.approve && !can.reject && !can.cancel && !can.retry

  const run = async (kind: NonNullable<typeof working>, work: () => Promise<ActionDetail>) => {
    setWorking(kind)
    setProblem(null)
    try {
      const done = await work()
      onChanged(kind === 'approve' ? (done.status === 'completed' ? t.approval.done : t.approval.failedNow) : kind === 'reject' ? t.approval.rejectedNow : kind === 'cancel' ? t.approval.cancelledNow : t.approval.retryNow)
    } catch (error) {
      setProblem(errorSentence(t, error))
      // An approval that no longer holds has changed the action (it failed, with a reason): show it as it is now.
      onChanged(null)
    } finally {
      setWorking(null)
    }
  }

  if (nothing) return action.status === 'awaiting_approval' ? <p className={styles.muted}>{t.approval.cannot}</p> : null
  return (
    <section className={styles.decision} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.panelTitle}>
        {t.approval.title}
      </h2>
      {can.approve && <p className={styles.muted}>{t.approval.lead}</p>}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      {can.approve && action.requiresSecondConfirmation && <CheckField label={t.approval.second} checked={second} onChange={setSecond} />}
      <div className={styles.buttons}>
        {can.approve && (
          <AdminButton variant="primary" type="button" loading={working === 'approve'} loadingLabel={t.approval.working} disabled={working !== null || (action.requiresSecondConfirmation && !second)} onClick={() => void run('approve', () => automation.approve(action.reference, { payloadHash: action.payloadHash, idempotencyKey: key.current, secondConfirmation: second }))}>
            {t.approval.approve}
          </AdminButton>
        )}
        {can.retry && (
          <AdminButton variant="primary" type="button" loading={working === 'retry'} loadingLabel={t.approval.working} disabled={working !== null} onClick={() => void run('retry', () => automation.retry(action.reference))}>
            {t.approval.retry}
          </AdminButton>
        )}
        {can.cancel && (
          <AdminButton variant="secondary" type="button" loading={working === 'cancel'} loadingLabel={t.approval.working} disabled={working !== null} onClick={() => void run('cancel', () => automation.cancel(action.reference))}>
            {t.approval.cancel}
          </AdminButton>
        )}
      </div>
      {can.reject && (
        <div className={styles.rejectBox}>
          <TextAreaField label={t.approval.rejectNote} value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={2} />
          <AdminButton variant="secondary" danger type="button" loading={working === 'reject'} loadingLabel={t.approval.working} disabled={working !== null} onClick={() => void run('reject', () => automation.reject(action.reference, note.trim() || null))}>
            {t.approval.reject}
          </AdminButton>
        </div>
      )}
      {can.retry && <p className={styles.muted}>{t.approval.asideRetry}</p>}
    </section>
  )
}

// ---- a line in a list ------------------------------------------------------------------------------------------------------------------

export function Notice({ tone, children }: { tone: 'info' | 'alert'; children: ReactNode }) {
  return (
    <p className={styles.notice} data-tone={tone} role={tone === 'alert' ? 'alert' : 'status'}>
      <Icon name={tone === 'alert' ? 'alert' : 'info'} className={styles.noticeIcon} />
      <span>{children}</span>
    </p>
  )
}

/**
 * The one-line summary of what an action changes, for a list: "Status: Design → Review"; where nothing was there before only what is there after ("Closed days: 2026-12-24 – 2026-12-26 (3)");
 * nothing at all for an action that changes no record (its name is already the line above).
 */
export function SummaryLine({ item }: { item: ActionSummary }) {
  const t = useAutomationText()
  const language = useAutomationLanguage()
  if (!item.change) return null
  const { field, before, after } = item.change
  const now = valueWord(t, language, field, after)
  return <>{before === null ? `${word(t.fields, field)}: ${now}` : `${word(t.fields, field)}: ${valueWord(t, language, field, before)} → ${now}`}</>
}
