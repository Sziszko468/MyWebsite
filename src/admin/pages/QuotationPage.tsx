import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import * as endpoints from '../api/endpoints'
import type { QuotationDetail, QuotationForm, QuotationLine, QuotationView } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { CheckField, Fieldset, SelectField, TextAreaField, TextField } from '../components/form'
import { Icon } from '../components/Icon'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { StatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import type { AdminText } from '../i18n/en'
import { describeError, fieldErrors } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

/**
 * The quotation editor: a draft the administrator writes for one request. Every amount is typed as text and the server does all the arithmetic
 * (whole minor units, integers), so the totals shown are the server's, after saving. A version that was sent is shown here too, read only. Route:
 * `/quotes/:id/create` (the request's id) opens or starts the draft; `/quotes/:id/versions/:quoteId` opens one version.
 */

const emptyLine = (): QuotationLine => ({ kind: 'item', description: '', detail: '', quantity: 1, unitPrice: '', justification: '' })

/** Starts a quotation for the request, or says why not. */
export function QuotationStartPage() {
  const t = useText()
  const q = t.quotation
  const toast = useToast()
  const navigate = useNavigate()
  const session = useSession()
  const { id = '' } = useParams()
  const resource = useResource((signal) => endpoints.quotes.get(id, signal).then((answer) => answer.data), [id])
  const [busy, setBusy] = useState(false)
  const quote = resource.data

  // A draft that already exists is the one to work on: no second one is made.
  const draft = quote?.quotations.find((row) => row.status === 'draft')
  useEffect(() => {
    if (draft) void navigate(`/quotes/${id}/versions/${draft.id}`, { replace: true })
  }, [draft, id, navigate])

  if (resource.loading) return <LoadingState />
  if (resource.error || !quote) return <ErrorState level={1} error={resource.error} onRetry={resource.reload} />

  const start = async () => {
    setBusy(true)
    try {
      const started = await endpoints.quotes.startQuotation(id)
      toast.success(q.detail.quotations.started)
      void navigate(`/quotes/${id}/versions/${started.data.quotation.id}`, { replace: true })
    } catch (error) {
      toast.error(describeError(t, error))
      setBusy(false)
    }
  }

  const first = quote.quotations.length === 0
  return (
    <>
      <PageHeader title={q.editor.title} back={{ to: `/quotes/${id}`, label: q.editor.back }} lead={fill(q.editor.for, { name: quote.name, reference: quote.reference })} />
      <DetailPanel>
        {first && session.can('requests:write') ? (
          <div className={styles.stack}>
            {!session.meta.quotationsReady && <p className={styles.notice}>{q.detail.quotations.notReady}</p>}
            <AdminButton variant="primary" loading={busy} loadingLabel={t.common.saving} onClick={() => void start()}>
              <Icon name="quote" />
              {q.detail.quotations.create}
            </AdminButton>
          </div>
        ) : (
          <p>{q.detail.quotations.newVersionHelp}</p>
        )}
      </DetailPanel>
    </>
  )
}

export function QuotationPage() {
  const t = useText()
  const { quoteId = '', id = '' } = useParams()
  const resource = useResource((signal) => endpoints.quotations.get(quoteId, signal).then((answer) => answer.data), [quoteId])
  if (resource.loading) return <LoadingState />
  if (resource.error || !resource.data) return <ErrorState level={1} error={resource.error} onRetry={resource.reload} />
  void t
  return <Editor key={`${quoteId}-${resource.data.quotation.updated_at}-${resource.data.quotation.status}`} detail={resource.data} requestId={id} apply={resource.set} />
}

function Editor({ detail, requestId, apply }: { detail: QuotationDetail; requestId: string; apply: (detail: QuotationDetail) => void }) {
  const t = useText()
  const q = t.quotation
  const e = q.editor
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const session = useSession()
  const language = useInterfaceLanguage()
  const { quotation, request } = detail
  const editable = quotation.status === 'draft' && session.can('requests:write')

  const [form, setForm] = useState<QuotationForm>(quotation.form)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<null | 'save' | 'send' | 'discard'>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')

  const set = <K extends keyof QuotationForm>(key: K, value: QuotationForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }))
    setDirty(true)
  }
  const setLine = (index: number, patch: Partial<QuotationLine>) => {
    setForm((previous) => ({ ...previous, lines: previous.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)) }))
    setDirty(true)
  }
  const message = (field: string) => {
    const code = errors[field]
    return code ? ((e.errors as Record<string, string>)[code] ?? e.errors.invalid) : undefined
  }

  const save = async (): Promise<boolean> => {
    setBusy('save')
    try {
      const answer = await endpoints.quotations.save(quotation.id, form)
      setErrors({})
      setDirty(false)
      apply(answer.data)
      toast.success(e.saved)
      return true
    } catch (error) {
      setErrors(fieldErrors(t, error))
      toast.error(describeError(t, error))
      return false
    } finally {
      setBusy(null)
    }
  }

  const send = async () => {
    if (dirty) return toast.error(e.saveFirst)
    const yes = await confirm({ title: fill(e.sendTitle, { name: request.name }), body: fill(e.sendBody, { email: request.email }), confirmLabel: e.send })
    if (!yes) return
    setBusy('send')
    try {
      const answer = await endpoints.quotations.send(quotation.id, note)
      apply(answer.data)
      toast.success(e.sent)
      void navigate(`/quotes/${requestId}`)
    } catch (error) {
      setErrors(fieldErrors(t, error))
      toast.error(describeError(t, error))
    } finally {
      setBusy(null)
    }
  }

  const discard = async () => {
    const yes = await confirm({ title: e.discardTitle, body: e.discardBody, danger: true })
    if (!yes) return
    setBusy('discard')
    try {
      await endpoints.quotations.discard(quotation.id)
      toast.success(e.discarded)
      void navigate(`/quotes/${requestId}`)
    } catch (error) {
      toast.error(describeError(t, error))
      setBusy(null)
    }
  }

  const problems = Object.keys(detail.problems)
  const view = quotation.view
  const totals = view.pricing
  const lineRows = form.lines
  const currency = form.currency

  return (
    <>
      <PageHeader
        title={`${e.title} · ${fill(q.detail.quotations.version, { n: quotation.version })}`}
        back={{ to: `/quotes/${requestId}`, label: e.back }}
        lead={fill(e.for, { name: request.name, reference: quotation.reference })}
        actions={<StatusBadge kind="quotation" status={quotation.status} />}
      />
      <p className={styles.notice} role="status">
        {editable ? e.draftNotice : e.sentNotice}
      </p>
      {quotation.revision_reason && <p className={styles.hint}>{fill(q.detail.quotations.reason, { reason: quotation.revision_reason })}</p>}

      <div className={page.detail}>
        <div className={page.detailMain}>
          <form
            className={styles.stackLg}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (editable) void save()
            }}
          >
            <fieldset className={styles.fieldsetReset} disabled={!editable}>
              <DetailPanel title={e.sections.basics}>
                <div className={styles.stack}>
                  <TextField label={e.titleLabel} value={form.title} maxLength={160} onChange={(event) => set('title', event.target.value)} error={message('title')} />
                  <SelectField label={e.language} value={form.language} onChange={(event) => set('language', event.target.value as QuotationForm['language'])} options={session.meta.languages.map((code) => ({ value: code, label: (t.languages as Record<string, string>)[code] ?? code }))} />
                  <TextField label={e.validUntil} hint={e.validHelp} type="date" value={form.validUntil} onChange={(event) => set('validUntil', event.target.value)} error={message('validUntil')} />
                  <TextField label={e.timeline} value={form.estimatedTimeline} maxLength={1000} onChange={(event) => set('estimatedTimeline', event.target.value)} error={message('estimatedTimeline')} />
                </div>
              </DetailPanel>

              <DetailPanel title={e.sections.text}>
                <div className={styles.stack}>
                  <TextAreaField label={e.introduction} rows={4} value={form.introduction} maxLength={8000} onChange={(event) => set('introduction', event.target.value)} error={message('introduction')} />
                  <TextAreaField label={e.understanding} rows={4} value={form.understanding} maxLength={8000} onChange={(event) => set('understanding', event.target.value)} error={message('understanding')} />
                  <TextAreaField label={e.scope} rows={6} value={form.scope} maxLength={8000} onChange={(event) => set('scope', event.target.value)} error={message('scope')} />
                  <TextAreaField label={e.deliverables} rows={4} value={form.deliverables} maxLength={8000} onChange={(event) => set('deliverables', event.target.value)} error={message('deliverables')} />
                  <TextAreaField label={e.exclusions} rows={3} value={form.exclusions} maxLength={8000} onChange={(event) => set('exclusions', event.target.value)} error={message('exclusions')} />
                  <TextAreaField label={e.paymentTerms} rows={3} value={form.paymentTerms} maxLength={8000} onChange={(event) => set('paymentTerms', event.target.value)} error={message('paymentTerms')} />
                  <TextAreaField label={e.terms} rows={6} value={form.terms} maxLength={8000} onChange={(event) => set('terms', event.target.value)} error={message('terms')} />
                  <TextAreaField label={e.notes} rows={3} value={form.notes} maxLength={8000} onChange={(event) => set('notes', event.target.value)} error={message('notes')} />
                </div>
              </DetailPanel>

              <DetailPanel title={e.sections.price}>
                <div className={styles.stack}>
                  <SelectField label={e.pricingMode} value={form.pricingMode} onChange={(event) => set('pricingMode', event.target.value as QuotationForm['pricingMode'])} options={(['itemized', 'fixed', 'custom'] as const).map((mode) => ({ value: mode, label: e.modes[mode] }))} />
                  {form.pricingMode !== 'custom' && (
                    <SelectField label={e.currency} value={currency} onChange={(event) => set('currency', event.target.value)} options={[{ value: '', label: e.currencyChoose }, { value: 'EUR', label: 'EUR' }, { value: 'HUF', label: 'HUF' }]} error={message('currency')} />
                  )}
                  {form.pricingMode === 'fixed' && <TextField label={e.fixedAmount} inputMode="decimal" value={form.fixedAmount} onChange={(event) => set('fixedAmount', event.target.value)} error={message('fixedAmount')} />}
                  {form.pricingMode === 'custom' && <TextAreaField label={e.pricingNote} hint={e.pricingNoteHelp} rows={4} value={form.pricingNote} maxLength={2000} onChange={(event) => set('pricingNote', event.target.value)} error={message('pricingNote')} />}

                  {form.pricingMode === 'itemized' && (
                    <Fieldset legend={e.lines}>
                      <p className={styles.hint}>{e.optionalHelp} {e.discountHelp}</p>
                      {message('lines') && <p className={styles.error}>{message('lines')}</p>}
                      {lineRows.length === 0 && <p className={styles.muted}>{e.noLines}</p>}
                      <ul className={page.items}>
                        {lineRows.map((line, index) => (
                          <li key={index} className={page.item}>
                            <div className={styles.stack}>
                              <SelectField label={e.kind} value={line.kind} onChange={(event) => setLine(index, { kind: event.target.value as QuotationLine['kind'] })} options={(['item', 'optional', 'discount'] as const).map((kind) => ({ value: kind, label: e.kinds[kind] }))} />
                              <TextField label={e.description} value={line.description} maxLength={200} onChange={(event) => setLine(index, { description: event.target.value })} error={message(`lines.${index}.description`)} />
                              <TextField label={e.detail} value={line.detail} maxLength={1000} onChange={(event) => setLine(index, { detail: event.target.value })} error={message(`lines.${index}.detail`)} />
                              <div className={styles.grid2}>
                                <TextField label={e.quantity} inputMode="numeric" value={String(line.quantity)} onChange={(event) => setLine(index, { quantity: Number(event.target.value.replace(/\D/g, '')) || 0 })} error={message(`lines.${index}.quantity`)} />
                                <TextField label={`${e.unitPrice}${currency ? ` (${currency})` : ''}`} inputMode="decimal" value={line.unitPrice} onChange={(event) => setLine(index, { unitPrice: event.target.value })} error={message(`lines.${index}.unitPrice`)} />
                              </div>
                              {line.kind === 'discount' && <TextField label={e.justification} value={line.justification} maxLength={500} onChange={(event) => setLine(index, { justification: event.target.value })} error={message(`lines.${index}.justification`)} />}
                              {editable && (
                                <AdminButton type="button" danger onClick={() => { setForm((previous) => ({ ...previous, lines: previous.lines.filter((_, at) => at !== index) })); setDirty(true) }}>
                                  <Icon name="trash" />
                                  {fill(e.removeLine, { n: index + 1 })}
                                </AdminButton>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                      {editable && (
                        <AdminButton type="button" onClick={() => { setForm((previous) => ({ ...previous, lines: [...previous.lines, emptyLine()] })); setDirty(true) }}>
                          <Icon name="plus" />
                          {e.addLine}
                        </AdminButton>
                      )}
                      {quotation.version === 1 && quotation.form.lines.length > 0 && <p className={styles.hint}>{e.prefilled}</p>}
                    </Fieldset>
                  )}
                </div>
              </DetailPanel>

              {form.pricingMode !== 'custom' && (
                <DetailPanel title={e.sections.tax}>
                  <div className={styles.stack}>
                    <p className={styles.hint}>{e.taxHelp}</p>
                    <SelectField label={e.taxMode} value={form.taxMode} onChange={(event) => set('taxMode', event.target.value as QuotationForm['taxMode'])} options={(['unspecified', 'excluded', 'included', 'exempt'] as const).map((mode) => ({ value: mode, label: e.taxModes[mode] }))} error={message('taxMode')} />
                    {(form.taxMode === 'excluded' || form.taxMode === 'included') && (
                      <>
                        <TextField label={e.taxRate} inputMode="decimal" value={form.taxRatePercent} onChange={(event) => set('taxRatePercent', event.target.value)} error={message('taxRatePercent')} />
                        <CheckField label={e.taxVerified} checked={form.taxVerified} onChange={(checked) => set('taxVerified', checked)} />
                        {message('taxVerified') && <p className={styles.error}>{message('taxVerified')}</p>}
                      </>
                    )}
                    <TextAreaField label={e.taxNote} rows={2} value={form.taxNote} maxLength={2000} onChange={(event) => set('taxNote', event.target.value)} />
                  </div>
                </DetailPanel>
              )}
            </fieldset>

            {editable && (
              <div className={page.actionList}>
                <AdminButton type="submit" variant="primary" loading={busy === 'save'} loadingLabel={t.common.saving}>
                  {e.save}
                </AdminButton>
              </div>
            )}
          </form>

          <DetailPanel title={e.sections.preview}>
            <p className={styles.hint}>{fill(e.preview.help, { language: (t.languages as Record<string, string>)[view.language] ?? view.language })}</p>
            {dirty && (
              <p className={`${styles.notice} ${styles.noticeWarning}`} role="status">
                {e.preview.stale}
              </p>
            )}
            <QuotationPreview view={view} e={e} noValue={t.common.noValue} />
          </DetailPanel>
        </div>

        <div className={page.detailSide}>
          <DetailPanel title={e.totals}>
            {dirty ? (
              <p className={styles.hint}>{e.notCalculated}</p>
            ) : (
              <dl className={styles.definitions}>
                {totals.subtotal && (
                  <>
                    <dt>{e.subtotal}</dt>
                    <dd>{totals.subtotal.text}</dd>
                  </>
                )}
                {totals.discount && (
                  <>
                    <dt>{e.discount}</dt>
                    <dd>− {totals.discount.text}</dd>
                  </>
                )}
                {totals.tax.amount && (
                  <>
                    <dt>
                      {e.tax} ({totals.tax.ratePercent} %)
                    </dt>
                    <dd>{totals.tax.amount.text}</dd>
                  </>
                )}
                {totals.total ? (
                  <>
                    <dt>
                      <strong>{e.total}</strong>
                    </dt>
                    <dd>
                      <strong>{totals.total.text}</strong>
                    </dd>
                  </>
                ) : (
                  <>
                    <dt>{q.detail.quotations.customPrice}</dt>
                    <dd>{totals.note || t.common.noValue}</dd>
                  </>
                )}
                {totals.optional && (
                  <>
                    <dt>{e.optionalTotal}</dt>
                    <dd>{totals.optional.text}</dd>
                  </>
                )}
              </dl>
            )}
          </DetailPanel>

          {editable && (
            <DetailPanel title={e.checklist}>
              {problems.length === 0 ? (
                <p>{e.ready}</p>
              ) : (
                <ul className={styles.checks}>
                  {problems.map((field) => (
                    <li key={field}>{(e.missing as Record<string, string>)[field] ?? e.errors.required}</li>
                  ))}
                </ul>
              )}
            </DetailPanel>
          )}

          {editable && (
            <DetailPanel title={e.sections.send}>
              <div className={styles.stack}>
                {!detail.canSend && <p className={styles.notice}>{q.detail.quotations.notReady}</p>}
                <TextAreaField label={e.sendNote} optional rows={3} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
                <AdminButton variant="primary" loading={busy === 'send'} loadingLabel={t.common.saving} disabled={problems.length > 0 || !detail.canSend || busy !== null} onClick={() => void send()}>
                  <Icon name="mail" />
                  {e.send}
                </AdminButton>
                <AdminButton danger loading={busy === 'discard'} onClick={() => void discard()}>
                  <Icon name="trash" />
                  {e.discard}
                </AdminButton>
              </div>
            </DetailPanel>
          )}

          <DetailPanel title={e.versions}>
            <ul className={styles.stack}>
              {detail.siblings.map((row) => (
                <li key={row.id}>
                  {row.id === quotation.id ? <strong>{fill(q.detail.quotations.version, { n: row.version })}</strong> : <Link className={styles.linkTarget} to={`/quotes/${requestId}/versions/${row.id}`}>{fill(q.detail.quotations.version, { n: row.version })}</Link>}{' '}
                  <StatusBadge kind="quotation" status={row.status} />
                </li>
              ))}
            </ul>
            {quotation.sent_at && <p className={styles.hint}>{fill(q.detail.quotations.sent, { date: formatDateTime(quotation.sent_at, language) })}</p>}
          </DetailPanel>
        </div>
      </div>
    </>
  )
}

type EditorWords = AdminText['quotation']['editor']

/**
 * The saved quotation as the customer will read it: the same document the server builds for the customer's page and the e-mails (modules/quotes/view.ts),
 * with every amount already written out by the server. The headings are the administrator's words for the fields; the text, the amounts and the language
 * are the offer's own, and the block says which language that is so a screen reader pronounces it correctly.
 */
export function QuotationPreview({ view, e, noValue }: { view: QuotationView; e: EditorWords; noValue: string }) {
  const p = view.pricing
  const items = p.lines.filter((line) => line.kind === 'item')
  const optional = p.lines.filter((line) => line.kind === 'optional')
  const discounts = p.lines.filter((line) => line.kind === 'discount')
  const prose = (label: string, body: string) =>
    body.trim() ? (
      <section className={page.previewSection}>
        <h3>{label}</h3>
        <p className={styles.prose}>{body}</p>
      </section>
    ) : null
  const lineList = (lines: typeof items) => (
    <ul className={page.items}>
      {lines.map((line, index) => (
        <li key={`${line.description}-${index}`} className={page.item}>
          <span className={styles.spread}>
            <span className={page.itemTitle}>{line.description}</span>
            <span>{line.total.text}</span>
          </span>
          {line.quantity > 1 && <span className={`${styles.muted} ${styles.small}`}>{fill(e.preview.quantity, { quantity: line.quantity, unit: line.unit.text })}</span>}
          {line.detail && <span className={`${styles.muted} ${styles.small}`}>{line.detail}</span>}
        </li>
      ))}
    </ul>
  )
  return (
    <article className={`${page.previewDoc} ${page.messageText}`} lang={view.language}>
      <header>
        <h3 className={page.previewTitle}>{view.title || noValue}</h3>
        <p className={`${styles.muted} ${styles.small}`}>
          {fill(e.preview.for, { name: view.customer.company ? `${view.customer.name} (${view.customer.company})` : view.customer.name })}
          {view.validUntil ? ` · ${fill(e.preview.validUntil, { date: view.validUntil })}` : ''}
        </p>
      </header>
      {prose(e.introduction, view.introduction)}
      {prose(e.understanding, view.understanding)}
      {prose(e.scope, view.scope)}
      {prose(e.deliverables, view.deliverables)}
      {prose(e.exclusions, view.exclusions)}
      {prose(e.timeline, view.estimatedTimeline)}
      <section className={page.previewSection}>
        <h3>{e.sections.price}</h3>
        {p.mode === 'custom' && <p className={styles.prose}>{p.note || e.preview.notStated}</p>}
        {p.mode === 'fixed' && <p className={styles.prose}>{p.fixed?.text ?? e.preview.notStated}</p>}
        {p.mode === 'itemized' && (
          <>
            {items.length === 0 ? <p className={styles.muted}>{e.noLines}</p> : lineList(items)}
            <dl className={styles.definitions}>
              {p.subtotal && (p.discount || p.tax.amount) && (
                <>
                  <dt>{e.subtotal}</dt>
                  <dd>{p.subtotal.text}</dd>
                </>
              )}
              {discounts.map((line, index) => (
                <div key={`${line.description}-${index}`} className={page.previewRow}>
                  <dt>
                    {e.discount}: {line.description}
                    {line.justification ? ` (${fill(e.preview.discountReason, { reason: line.justification })})` : ''}
                  </dt>
                  <dd>− {line.total.text}</dd>
                </div>
              ))}
              {p.tax.amount && p.tax.ratePercent && (
                <>
                  <dt>
                    {e.tax} ({p.tax.ratePercent} %)
                  </dt>
                  <dd>{p.tax.amount.text}</dd>
                </>
              )}
              {p.total && (
                <>
                  <dt>
                    <strong>{e.total}</strong>
                  </dt>
                  <dd>
                    <strong>{p.total.text}</strong>
                  </dd>
                </>
              )}
            </dl>
            {optional.length > 0 && (
              <>
                <h4 className={page.previewSub}>{e.kinds.optional}</h4>
                {lineList(optional)}
              </>
            )}
          </>
        )}
        {p.tax.note && <p className={styles.prose}>{p.tax.note}</p>}
      </section>
      {prose(e.paymentTerms, view.paymentTerms)}
      {prose(e.terms, view.terms)}
      {prose(e.notes, view.notes)}
    </article>
  )
}
