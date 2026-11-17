import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { useI18n } from '../../i18n/useI18n'
import {
  addComment,
  approveVersion,
  askForChanges,
  deleteComment,
  editComment,
  fetchDeliverable,
  fetchDeliverables,
  followUp,
  reopenComment,
  sendFeedback,
  withdrawApproval,
  type DeliverableComment,
  type DeliverableDetail,
  type DeliverableSummary,
  type DeliverableVersion,
  type Failure,
  type Result,
} from '../../portal/api'
import { failureText, usePortalText, type PortalWords } from '../../portal/text'
import { useLoad, usePortal, type Loaded } from '../../portal/usePortal'
import { describePoint, type Point } from '../../utils/annotations'
import { fill, formatDay, formatMoment } from '../../utils/format'
import { Button } from '../Button/Button'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { AnnotatedImage, type Marker } from './AnnotatedImage'
import { Dialog } from './Dialog'
import d from './Deliverables.module.scss'
import styles from './Portal.module.scss'
import { Load, PageHeader, StatusBadge } from './ui'

/**
 * What the customer reads and does about the deliverables of a project (PROMPT 27). Everything shown is what the server returned for THIS customer from deliverables the owner
 * published: the version being looked at, the comments of that version, the request for approval if one is waiting. The things a customer can do each go to one endpoint that
 * names the project, the deliverable and (when needed) one comment or request, never a customer, an author or a version: the server knows who is asking and which version is
 * current. Opening a page never approves anything: approval is an explicit confirmation of one exact version, inside a dialog.
 */

const REVIEW_TONE: Record<DeliverableSummary['reviewState'], 'attention' | 'active' | 'done' | 'muted'> = { not_submitted: 'muted', awaiting_customer: 'attention', changes_requested: 'active', approved: 'done', superseded: 'active' }

/** The words for a request that did not go through, in the customer's language. */
function problemText(failure: Failure, words: PortalWords): string {
  const w = words.deliverables
  if (failure.kind === 'refused') {
    if (failure.reason === 'stale') return w.approval.stale
    if (failure.reason === 'superseded') return w.approval.superseded
    if (failure.status === 422) return failure.fields.body === 'tooLong' || failure.fields.explanation === 'tooLong' ? w.feedback.errors.tooLong : failure.fields.body === 'tooMany' ? w.feedback.errors.tooMany : w.feedback.errors.required
    return w.feedback.errors.closed
  }
  if (failure.kind === 'not_found') return w.feedback.errors.closed
  if (failure.kind === 'unauthorized') return failureText(failure, words)
  return w.feedback.errors.failed
}

// ---- the project's list ----------------------------------------------------------------------------------------------------------------------

function groupOf(entry: DeliverableSummary): 'awaiting' | 'changes' | 'approved' | 'other' | 'archived' {
  if (entry.archived) return 'archived'
  if (entry.reviewState === 'awaiting_customer') return 'awaiting'
  if (entry.reviewState === 'changes_requested') return 'changes'
  if (entry.reviewState === 'approved') return 'approved'
  return 'other'
}

const GROUPS = ['awaiting', 'changes', 'other', 'approved', 'archived'] as const

export function ProjectDeliverables({ reference }: { reference: string }) {
  const { lang } = useI18n()
  const words = usePortalText()
  const w = words.deliverables
  const { state, reload } = useLoad(() => fetchDeliverables(reference), `deliverables:${reference}`)
  return (
    <section className={styles.section} aria-labelledby="deliverables-title">
      <h2 id="deliverables-title" className={styles.sectionTitle}>
        {w.title}
      </h2>
      <Load state={state} onRetry={reload}>
        {(entries) =>
          entries.length === 0 ? (
            <p className={styles.muted}>{w.empty}</p>
          ) : (
            <div className={d.group} role="group" aria-label={w.list.label}>
              {GROUPS.map((group) => {
                const inGroup = entries.filter((entry) => groupOf(entry) === group)
                if (inGroup.length === 0) return null
                return (
                  <div key={group} className={d.group}>
                    <h3 className={d.groupTitle}>
                      {w.groups[group]} <span className={styles.muted}>({inGroup.length})</span>
                    </h3>
                    <ul className={d.cards}>
                      {inGroup.map((entry) => (
                        <li key={entry.reference} className={d.card} data-attention={entry.awaitingApproval}>
                          <div className={d.cardHead}>
                            <h4 className={d.cardTitle}>
                              <LocalizedLink to={`/client-portal/projects/${reference}/deliverables/${entry.reference}`} className={d.link}>
                                {entry.title}
                              </LocalizedLink>
                            </h4>
                            <StatusBadge status={entry.reviewState} label={w.review[entry.reviewState]} tone={REVIEW_TONE[entry.reviewState]} />
                          </div>
                          <p className={d.meta}>
                            <span>{w.type[entry.type]}</span>
                            <span>{fill(w.list.versionLine, { number: entry.currentVersion, title: entry.versionTitle })}</span>
                            <span>{fill(w.list.published, { date: formatDay(entry.publishedAt.slice(0, 10), lang) })}</span>
                            {entry.openThreads > 0 && <span>{fill(w.list.openThreads, { count: entry.openThreads })}</span>}
                            {entry.approvedAt && <span>{fill(w.list.approvedOn, { date: formatMoment(entry.approvedAt, lang) })}</span>}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )
        }
      </Load>
    </section>
  )
}

// ---- one deliverable ----------------------------------------------------------------------------------------------------------------------

/** Loads one deliverable (and again for another version), and takes in what every change answers with, so the page never reloads under the customer's hands. */
function useDeliverable(reference: string, deliverable: string, version: number | null): { state: Loaded<DeliverableDetail>; apply: (detail: DeliverableDetail) => void; reload: () => void } {
  const { ended } = usePortal()
  const [state, setState] = useState<Loaded<DeliverableDetail>>({ status: 'loading' })
  const [round, setRound] = useState(0)
  useEffect(() => {
    let current = true
    void fetchDeliverable(reference, deliverable, version).then((result) => {
      if (!current) return
      if (result.ok) setState({ status: 'ready', data: result.data })
      else if (result.failure.kind === 'unauthorized') ended()
      else setState({ status: 'failed', failure: result.failure })
    })
    return () => {
      current = false
    }
  }, [reference, deliverable, version, round, ended])
  const apply = useCallback((detail: DeliverableDetail) => setState({ status: 'ready', data: detail }), [])
  const reload = useCallback(() => setRound((value) => value + 1), [])
  return { state, apply, reload }
}

/** A message that is said, and moved to, so a keyboard or screen-reader user hears what just happened. */
function Notice({ kind, children }: { kind: 'status' | 'alert'; children: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [children])
  return (
    <p ref={ref} className={d.done} role={kind} tabIndex={-1}>
      {children}
    </p>
  )
}

interface Thread {
  root: DeliverableComment
  replies: DeliverableComment[]
}

function threadsOf(comments: DeliverableComment[]): Thread[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]))
  const rootOf = (comment: DeliverableComment): string => {
    let at = comment
    while (at.parentId && byId.has(at.parentId)) at = byId.get(at.parentId)!
    return at.id
  }
  return comments
    .filter((comment) => comment.parentId === null)
    .map((root) => ({ root, replies: comments.filter((comment) => comment.parentId !== null && rootOf(comment) === root.id) }))
}

function Preview({ detail, version, markers, placing, pending, onPlace, onCancel, onSelect }: { detail: DeliverableDetail; version: DeliverableVersion; markers: Marker[]; placing: boolean; pending: Point | null; onPlace: (point: Point) => void; onCancel: () => void; onSelect: (id: string) => void }) {
  const words = usePortalText().deliverables
  const p = words.preview
  const none = !version.previewUrl && !version.imageUrl
  return (
    <section className={d.previewBox} aria-labelledby="preview-title">
      <h2 id="preview-title" className={styles.sectionTitle}>
        {p.title}
      </h2>
      <h3 className={styles.subTitle}>{version.title}</h3>
      <p className={styles.prose}>{version.description || p.noDescription}</p>
      {detail.description && version.current && <p className={styles.muted}>{detail.description}</p>}
      {detail.task && <p className={styles.muted}>{fill(p.task, { title: detail.task.title })}</p>}
      {none && <p className={styles.muted}>{p.none}</p>}
      {version.imageUrl && <AnnotatedImage src={version.imageUrl} alt={fill(p.image, { title: version.title })} markers={markers} placing={placing} pending={pending} onPlace={onPlace} onCancel={onCancel} onSelect={onSelect} />}
      {version.previewUrl && version.embeddable && (
        <>
          <p className={d.hint}>{p.embedded}</p>
          {/* A frame only for an address on the owner's list: sandboxed, no permissions, no referrer. Anything else is a link below. */}
          <iframe className={d.frame} src={version.previewUrl} title={fill(p.frame, { title: version.title })} sandbox="allow-scripts allow-same-origin allow-forms" referrerPolicy="no-referrer" loading="lazy" allow="" />
        </>
      )}
      {version.previewUrl && (
        <p className={d.externalLink}>
          <a href={version.previewUrl} target="_blank" rel="noopener noreferrer nofollow external" className={d.link}>
            {p.open}
          </a>
          {version.previewHost && <span className={d.hint}>{fill(p.opens, { host: version.previewHost })}</span>}
        </p>
      )}
    </section>
  )
}

function Versions({ detail, onShow }: { detail: DeliverableDetail; onShow: (number: number) => void }) {
  const { lang } = useI18n()
  const w = usePortalText().deliverables.version
  return (
    <section className={styles.section} aria-labelledby="versions-title">
      <h2 id="versions-title" className={styles.sectionTitle}>
        {w.list}
      </h2>
      <p className={styles.muted}>{w.listNote}</p>
      <ul className={d.versions}>
        {detail.versions.map((version) => (
          <li key={version.number} className={d.versionRow} data-viewing={version.number === detail.viewing}>
            <div className={d.cardHead}>
              <strong>
                {fill(w.label, { number: version.number })} · {version.title}
              </strong>
              <span className={d.meta}>
                <span>{version.current ? w.current : w.previous}</span>
                {version.outcome && <span>{w.outcome[version.outcome]}</span>}
                {version.awaiting && <span>{w.outcome.awaiting}</span>}
              </span>
            </div>
            <p className={d.meta}>
              <span>{fill(w.published, { date: formatMoment(version.publishedAt, lang) })}</span>
              <span className={d.code} title={w.fingerprintNote}>
                {fill(w.fingerprint, { code: version.checksum.slice(0, 12) })}
              </span>
            </p>
            {version.number === detail.viewing ? (
              <p className={d.hint} aria-live="polite">
                {fill(w.viewing, { number: version.number })}
              </p>
            ) : (
              <div className={d.actions}>
                <Button type="button" variant="secondary" size="sm" onClick={() => onShow(version.number)}>
                  {`${w.show}: ${fill(w.label, { number: version.number })}`}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function DeliverableView() {
  const { reference = '', deliverable = '' } = useParams()
  const { lang } = useI18n()
  const words = usePortalText()
  const w = words.deliverables
  const [viewing, setViewing] = useState<number | null>(null)
  const { state, apply, reload } = useDeliverable(reference, deliverable, viewing)
  return (
    <>
      <p className={styles.back}>
        <LocalizedLink to={`/client-portal/projects/${reference}`}>← {w.back}</LocalizedLink>
      </p>
      <Load state={state} onRetry={reload} heading>
        {(detail) => <DeliverablePage key={detail.reference} reference={reference} deliverable={deliverable} detail={detail} apply={apply} reload={reload} onShow={setViewing} lang={lang} />}
      </Load>
    </>
  )
}

/** One deliverable's page, given what the server sent (exported so it can be rendered with a fixture). */
export function DeliverablePage({ reference, deliverable, detail, apply, reload, onShow, lang }: { reference: string; deliverable: string; detail: DeliverableDetail; apply: (detail: DeliverableDetail) => void; reload: () => void; onShow: (number: number | null) => void; lang: ReturnType<typeof useI18n>['lang'] }) {
  const words = usePortalText()
  const w = words.deliverables
  const version = detail.versions.find((entry) => entry.number === detail.viewing)!
  const [notice, setNotice] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [position, setPosition] = useState<Point | null>(null)
  const [placing, setPlacing] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [changes, setChanges] = useState<string | null>(null)
  const [followId, setFollowId] = useState<string | null>(null)
  const [followText, setFollowText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)

  const threads = useMemo(() => threadsOf(detail.comments), [detail.comments])
  const markers: Marker[] = detail.comments
    .filter((comment) => comment.parentId === null && comment.position && comment.marker !== null)
    .map((comment) => ({ id: comment.id, number: comment.marker!, position: comment.position!, draft: comment.status === 'draft', active: comment.id === active }))
  const hasPicture = Boolean(version.imageUrl)
  const drafts = detail.comments.filter((comment) => comment.status === 'draft' && comment.editable)

  /** Runs one request and takes in its answer: the refreshed deliverable, or a sentence that says why it did not go through (and the page refreshes when it is out of date). */
  async function run<T>(name: string, job: () => Promise<Result<T>>, done: (data: T) => DeliverableDetail | null, message: string | null): Promise<boolean> {
    if (busy) return false
    setBusy(name)
    setError(null)
    setNotice(null)
    const result = await job()
    setBusy(null)
    if (result.ok) {
      const next = done(result.data)
      if (next) apply(next)
      if (message) setNotice({ kind: 'status', text: message })
      return true
    }
    const text = problemText(result.failure, words)
    setNotice({ kind: 'alert', text })
    // Out of date (a newer version, a decided request): show what is true now, and the sentence above stays.
    if (result.failure.kind === 'refused' && (result.failure.reason === 'stale' || result.failure.reason === 'superseded' || result.failure.status === 409)) reload()
    return false
  }

  const saveComment = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!text) {
      setError(w.feedback.errors.required)
      field.current?.focus()
      return
    }
    if (text.length > 2000) {
      setError(w.feedback.errors.tooLong)
      field.current?.focus()
      return
    }
    const ok = editing
      ? await run('save', () => editComment(reference, deliverable, editing, { body: text, position }), (data) => data, null)
      : await run('save', () => addComment(reference, deliverable, { body: text, position }), (data) => data, null)
    if (ok) {
      setBody('')
      setPosition(null)
      setEditing(null)
      setPlacing(false)
    }
  }

  const choose = (point: Point) => {
    setPosition(point)
    setPlacing(false)
    field.current?.focus()
  }

  const startEdit = (comment: DeliverableComment) => {
    setEditing(comment.id)
    setBody(comment.body)
    setPosition(comment.position)
    setPlacing(false)
    setError(null)
    field.current?.focus()
  }

  const select = (id: string) => {
    setActive(id)
    document.getElementById(`thread-${id}`)?.scrollIntoView({ block: 'nearest' })
    document.getElementById(`thread-${id}`)?.focus()
  }

  const approval = detail.approval
  const spot = position ? describePoint(position) : null

  return (
    <>
      <PageHeader eyebrow={w.type[detail.type]} title={detail.title} focusKey={detail.reference}>
        <p className={styles.statusLine}>
          <StatusBadge status={detail.reviewState} label={w.review[detail.reviewState]} tone={REVIEW_TONE[detail.reviewState]} />
          <span>{fill(w.version.viewing, { number: version.number })}</span>
          <span className={styles.muted}>{version.current ? w.version.current : w.version.olderNote}</span>
        </p>
      </PageHeader>

      <p className={styles.fineprint}>
        <LocalizedLink to={`/client-portal/messages?about=deliverable:${detail.reference}`}>{words.messages.ask.deliverable}</LocalizedLink>
      </p>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {approval && detail.can.decide && (
        <section className={d.approvalPanel} aria-labelledby="approval-title">
          <h2 id="approval-title" className={styles.sectionTitle}>
            {w.approval.title}
          </h2>
          <p>
            <strong>{fill(w.approval.asked, { number: approval.versionNumber })}</strong>
          </p>
          {approval.note && (
            <p className={styles.prose}>
              <span className={styles.muted}>{w.approval.note}: </span>
              {approval.note}
            </p>
          )}
          <p className={styles.muted}>{w.approval.explain}</p>
          <div className={d.actions}>
            <Button type="button" variant="primary" onClick={() => { setConfirmed(false); setDialog(true) }} disabled={Boolean(busy)}>
              {w.approval.approve}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setChanges(changes === null ? '' : null)} aria-expanded={changes !== null} disabled={Boolean(busy)}>
              {w.approval.changes}
            </Button>
            <Button type="button" variant="text" onClick={() => void run('withdraw', () => withdrawApproval(reference, deliverable, approval), (data) => data, w.approval.withdrawn)} disabled={Boolean(busy)}>
              {w.approval.withdraw}
            </Button>
          </div>
          {changes !== null && (
            <form
              className={d.form}
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                if (changes.trim().length < 3) {
                  setError(w.approval.changesTooShort)
                  return
                }
                void run('changes', () => askForChanges(reference, deliverable, approval, changes.trim()), (data) => data, w.approval.changesDone).then((ok) => ok && setChanges(null))
              }}
            >
              <div className={d.field}>
                <label className={d.label} htmlFor="changes-text">
                  {w.approval.changesLabel}
                </label>
                <textarea id="changes-text" className={d.textarea} value={changes} rows={5} maxLength={2200} aria-invalid={error === w.approval.changesTooShort ? true : undefined} aria-describedby="changes-hint" onChange={(event) => { setChanges(event.target.value); setError(null) }} />
                <p id="changes-hint" className={styles.muted}>
                  {w.approval.changesHint}
                </p>
                {error === w.approval.changesTooShort && (
                  <p className={styles.problemLine} role="alert">
                    {error}
                  </p>
                )}
              </div>
              <div className={d.actions}>
                <Button type="submit" variant="primary" disabled={Boolean(busy)}>
                  {busy === 'changes' ? w.approval.changesSending : w.approval.changesSend}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {detail.reviewState === 'approved' && detail.approvedAt && (
        <p className={d.done} role="status">
          {fill(w.approval.approvedOn, { number: detail.versions.find((entry) => entry.outcome === 'approved')?.number ?? detail.currentVersion, date: formatMoment(detail.approvedAt, lang) })}
        </p>
      )}

      <div className={d.twoColumns}>
        <Preview detail={detail} version={version} markers={markers} placing={placing} pending={position} onPlace={choose} onCancel={() => { setPlacing(false); field.current?.focus() }} onSelect={select} />

        <section className={styles.section} aria-labelledby="feedback-title">
          <h2 id="feedback-title" className={styles.sectionTitle}>
            {w.feedback.title}
          </h2>
          <p className={styles.muted}>{detail.can.comment ? w.feedback.lead : version.current ? w.feedback.closedNote : w.version.olderNote}</p>

          {threads.length === 0 ? (
            <p className={styles.muted}>{w.feedback.none}</p>
          ) : (
            <ol className={d.threads}>
              {threads.map(({ root, replies }, index) => (
                <li key={root.id} id={`thread-${root.id}`} className={d.thread} data-active={root.id === active} tabIndex={-1}>
                  <p className={d.commentHead}>
                    {root.marker !== null ? <span className={d.badgeNumber}>{root.marker}</span> : null}
                    <strong>{root.marker !== null ? fill(w.feedback.thread, { number: root.marker }) : `${w.feedback.general} ${index + 1}`}</strong>
                    <span>{root.status === 'draft' ? w.feedback.draft : root.status === 'resolved' ? w.feedback.resolved : w.feedback.sent}</span>
                    <span>{root.position ? fill(w.annotate.position, { left: describePoint(root.position).left, top: describePoint(root.position).top }) : w.annotate.noPosition}</span>
                  </p>
                  {[root, ...replies].map((comment) => (
                    <div key={comment.id} className={d.comment} data-author={comment.author}>
                      <span className={d.commentHead}>
                        <span>{comment.author === 'you' ? w.feedback.you : w.feedback.studio}</span>
                        <span>{formatMoment(comment.createdAt, lang)}</span>
                      </span>
                      <p>{comment.body}</p>
                    </div>
                  ))}
                  {root.editable && (
                    <div className={d.actions}>
                      <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(root)} disabled={Boolean(busy)}>
                        {w.feedback.edit}
                      </Button>
                      <Button type="button" variant="text" size="sm" onClick={() => void run('delete', () => deleteComment(reference, deliverable, root.id), () => null, null).then((ok) => ok && reload())} disabled={Boolean(busy)}>
                        {w.feedback.delete}
                      </Button>
                    </div>
                  )}
                  {root.status === 'resolved' && detail.can.follow && (
                    <>
                      <p className={styles.muted}>{w.feedback.resolvedNote}</p>
                      <div className={d.actions}>
                        <Button type="button" variant="secondary" size="sm" onClick={() => void run('reopen', () => reopenComment(reference, deliverable, root.id), (data) => data, w.feedback.reopened)} disabled={Boolean(busy)}>
                          {w.feedback.reopen}
                        </Button>
                      </div>
                    </>
                  )}
                  {root.status === 'submitted' && detail.can.follow &&
                    (followId === root.id ? (
                      <form
                        className={d.form}
                        noValidate
                        onSubmit={(event) => {
                          event.preventDefault()
                          if (!followText.trim()) return
                          void run('follow', () => followUp(reference, deliverable, root.id, followText.trim()), (data) => data, w.feedback.followUpDone).then((ok) => {
                            if (ok) {
                              setFollowId(null)
                              setFollowText('')
                            }
                          })
                        }}
                      >
                        <div className={d.field}>
                          <label className={d.label} htmlFor={`follow-${root.id}`}>
                            {w.feedback.followUpLabel}
                          </label>
                          <textarea id={`follow-${root.id}`} className={d.textarea} value={followText} rows={3} maxLength={2200} onChange={(event) => setFollowText(event.target.value)} />
                        </div>
                        <div className={d.actions}>
                          <Button type="submit" variant="primary" size="sm" disabled={Boolean(busy) || !followText.trim()}>
                            {w.feedback.followUpSend}
                          </Button>
                          <Button type="button" variant="text" size="sm" onClick={() => setFollowId(null)}>
                            {w.feedback.cancel}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className={d.actions}>
                        <Button type="button" variant="text" size="sm" onClick={() => { setFollowId(root.id); setFollowText('') }} aria-label={`${w.feedback.followUp}: ${root.marker !== null ? fill(w.feedback.thread, { number: root.marker }) : w.feedback.general}`}>
                          {w.feedback.followUp}
                        </Button>
                      </div>
                    ))}
                </li>
              ))}
            </ol>
          )}

          {detail.can.comment && (
            <form className={d.form} onSubmit={(event) => void saveComment(event)} noValidate aria-labelledby="compose-title">
              <h3 id="compose-title" className={styles.subTitle}>
                {editing ? w.feedback.edit : w.feedback.label}
              </h3>
              {error && error !== w.approval.changesTooShort && (
                <div className={d.errors} role="alert">
                  <p>{w.feedback.errors.summary}</p>
                  <ul>
                    <li>
                      <a href="#comment-text">{error}</a>
                    </li>
                  </ul>
                </div>
              )}
              <div className={d.field}>
                <label className={d.label} htmlFor="comment-text">
                  {w.feedback.label}
                </label>
                <textarea id="comment-text" ref={field} className={d.textarea} value={body} rows={5} maxLength={2200} aria-invalid={error && error !== w.approval.changesTooShort ? true : undefined} aria-describedby="comment-hint comment-count" onChange={(event) => { setBody(event.target.value); if (error) setError(null) }} />
                <p id="comment-hint" className={styles.muted}>
                  {w.feedback.hint}
                </p>
                <p id="comment-count" className={d.counter}>
                  {fill(w.feedback.count, { count: body.trim().length, max: 2000 })}
                </p>
              </div>
              {hasPicture ? (
                <div className={d.field}>
                  <p className={styles.muted}>{w.annotate.lead}</p>
                  <div className={d.actions}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setPlacing((on) => !on)} aria-pressed={placing}>
                      {placing ? w.annotate.cancelPlace : w.annotate.place}
                    </Button>
                    {position && (
                      <Button type="button" variant="text" size="sm" onClick={() => setPosition(null)}>
                        {w.annotate.remove}
                      </Button>
                    )}
                  </div>
                  {spot && (
                    <p className={styles.muted} role="status">
                      {fill(w.annotate.chosen, { left: spot.left, top: spot.top })}
                    </p>
                  )}
                </div>
              ) : (
                <p className={styles.muted}>{w.annotate.unavailable}</p>
              )}
              <div className={d.actions}>
                <Button type="submit" variant="secondary" disabled={Boolean(busy)}>
                  {busy === 'save' ? w.feedback.saving : editing ? w.feedback.saveChange : w.feedback.save}
                </Button>
                {editing && (
                  <Button type="button" variant="text" onClick={() => { setEditing(null); setBody(''); setPosition(null) }}>
                    {w.feedback.cancel}
                  </Button>
                )}
              </div>
            </form>
          )}

          {detail.can.comment && (
            <div className={d.field}>
              <p className={styles.muted} role="status">
                {fill(w.feedback.drafts, { count: drafts.length })}
              </p>
              {detail.drafts.earlier > 0 && <p className={styles.muted}>{fill(w.feedback.earlier, { count: detail.drafts.earlier })}</p>}
              <div className={d.actions}>
                <Button
                  type="button"
                  variant="primary"
                  disabled={Boolean(busy) || drafts.length === 0}
                  onClick={() =>
                    void run('send', () => sendFeedback(reference, deliverable), (data) => data.deliverable, w.feedback.sentDone)
                  }
                >
                  {busy === 'send' ? w.feedback.sending : w.feedback.send}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <Versions detail={detail} onShow={(number) => onShow(number === detail.currentVersion ? null : number)} />

      <section className={styles.section} aria-labelledby="history-title">
        <h2 id="history-title" className={styles.sectionTitle}>
          {w.history.title}
        </h2>
        {detail.history.length === 0 ? (
          <p className={styles.muted}>{w.history.empty}</p>
        ) : (
          <ol className={d.history}>
            {detail.history.map((line) => {
              const known = line.type in w.history ? (w.history as Record<string, unknown>)[line.type] : null
              // The words are already in the customer's language (a string); a type this page has no sentence for is shown as a plain "Event", never as its key.
              const text = typeof known === 'string' ? fill(known, { number: line.version ?? '', count: line.subject ?? '' }) : w.history.fallback
              return (
                <li key={line.id}>
                  <span>{text}</span>
                  <span className={d.hint}>
                    {w.history.by[line.by]} · {formatMoment(line.at, lang)}
                  </span>
                  {line.note && <span className={styles.timelineNote}>{line.note}</span>}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <Dialog open={dialog} title={w.approval.dialogTitle} onClose={() => setDialog(false)}>
        {approval && (
          <form
            className={d.form}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (!confirmed) {
                setError(w.approval.confirmRequired)
                return
              }
              void run('approve', () => approveVersion(reference, deliverable, approval), (data) => data, fill(w.approval.approved, { number: approval.versionNumber })).then(() => setDialog(false))
            }}
          >
            <p>{fill(w.approval.dialogBody, { number: approval.versionNumber, title: version.title })}</p>
            <label className={d.check}>
              <input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setError(null) }} aria-describedby={error === w.approval.confirmRequired ? 'confirm-error' : undefined} />
              <span>{fill(w.approval.confirmCheck, { number: approval.versionNumber })}</span>
            </label>
            {error === w.approval.confirmRequired && (
              <p id="confirm-error" className={styles.problemLine} role="alert">
                {error}
              </p>
            )}
            <div className={d.actions}>
              <Button type="submit" variant="primary" disabled={Boolean(busy)}>
                {busy === 'approve' ? w.approval.approving : w.approval.confirm}
              </Button>
              <Button type="button" variant="text" onClick={() => setDialog(false)}>
                {w.approval.close}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  )
}

