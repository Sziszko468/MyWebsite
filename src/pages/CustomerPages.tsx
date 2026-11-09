import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { CheckboxField, TextField } from '../components/form/fields'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { useI18n } from '../i18n/useI18n'
import { fetchQuotation, fetchRequest, postAction, type Failure, type QuotePageData, type QuoteView, type RequestPageData } from '../quotes/api'
import { useQuoteText, type QuoteWords } from '../quotes/useQuoteText'
import { useRemote } from '../quotes/useRemote'
import { fill, formatDay, formatMoment } from '../utils/format'
import styles from './CustomerPages.module.scss'

/**
 * The customer's two private pages. They hold no account and no state of their own: the secret in the address is the only thing that opens them, the
 * server decides what each action may do, and a page that cannot be loaded says why in words rather than showing nothing. Both are noindex
 * shells in the build (routes/pages.ts); the quotation's own text arrives from the server in the language the administrator wrote it in.
 */

function Problem({ failure, words, onRetry }: { failure: Failure; words: QuoteWords; onRetry: () => void }) {
  const entry =
    failure.kind === 'expired' ? words.problems.expired
    : failure.kind === 'replaced' ? words.problems.replaced
    : failure.kind === 'rate_limited' ? words.problems.rateLimited
    : failure.kind === 'network' ? words.problems.network
    : failure.kind === 'unavailable' ? { title: words.problems.network.title, text: words.problems.notAvailable }
    : words.problems.notFound
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  return (
    <section className={styles.problem} role="alert">
      <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
        {entry.title}
      </h1>
      <p>{entry.text}</p>
      <div className={styles.row}>
        {(failure.kind === 'network' || failure.kind === 'rate_limited') && (
          <Button type="button" variant="secondary" onClick={onRetry}>
            {words.common.retry}
          </Button>
        )}
        <Button to="/" variant="text">
          {words.common.home}
        </Button>
      </div>
    </section>
  )
}

const Loading = ({ label }: { label: string }) => (
  <p className={styles.loading} role="status">
    {label}
  </p>
)

/** Text the administrator wrote, with its line breaks, never as markup. */
const Prose = ({ children }: { children: string }) => <p className={styles.prose}>{children}</p>

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {title}
      </h2>
      {children}
    </section>
  )
}

const longDay = formatDay

// ---- the quotation ----------------------------------------------------------------------------------------------------

function Price({ quote, words }: { quote: QuoteView; words: QuoteWords }) {
  const p = words.quote.price
  const { pricing } = quote
  const items = pricing.lines.filter((line) => line.kind === 'item')
  const optional = pricing.lines.filter((line) => line.kind === 'optional')
  const discounts = pricing.lines.filter((line) => line.kind === 'discount')
  const taxLine = pricing.tax.amount && pricing.tax.ratePercent ? fill(pricing.tax.mode === 'included' ? p.tax.amountIncluded : p.tax.amount, { rate: pricing.tax.ratePercent }) : null
  return (
    <Section id="q-price" title={words.quote.sections.price}>
      {pricing.mode === 'custom' && (
        <>
          <h3 className={styles.sub}>{p.custom}</h3>
          <Prose>{pricing.note}</Prose>
        </>
      )}
      {pricing.mode === 'fixed' && pricing.fixed && (
        <dl className={styles.totals}>
          <div className={styles.grand}>
            <dt>{p.fixed}</dt>
            <dd>{pricing.fixed.text}</dd>
          </div>
        </dl>
      )}
      {pricing.mode === 'itemized' && (
        <>
          <ul className={styles.lines}>
            {items.map((line, index) => (
              <li key={`${line.description}-${index}`}>
                <div className={styles.lineHead}>
                  <span className={styles.lineName}>{line.description}</span>
                  <span className={styles.lineAmount}>{line.total.text}</span>
                </div>
                {line.quantity > 1 && (
                  <p className={styles.lineMeta}>
                    {line.quantity} × {line.unit.text}
                  </p>
                )}
                {line.detail && <p className={styles.lineMeta}>{line.detail}</p>}
              </li>
            ))}
          </ul>
          <dl className={styles.totals}>
            {(pricing.discount || pricing.tax.amount) && pricing.subtotal && (
              <div>
                <dt>{p.subtotal}</dt>
                <dd>{pricing.subtotal.text}</dd>
              </div>
            )}
            {discounts.map((line, index) => (
              <div key={`${line.description}-${index}`}>
                <dt>
                  {p.discount}: {line.description}
                  {line.justification && <span className={styles.lineMeta}>{fill(p.discountReason, { reason: line.justification })}</span>}
                </dt>
                <dd>− {line.total.text}</dd>
              </div>
            ))}
            {taxLine && pricing.tax.amount && (
              <div>
                <dt>{taxLine}</dt>
                <dd>{pricing.tax.amount.text}</dd>
              </div>
            )}
            {pricing.total && (
              <div className={styles.grand}>
                <dt>{p.total}</dt>
                <dd>{pricing.total.text}</dd>
              </div>
            )}
          </dl>
          {optional.length > 0 && (
            <div className={styles.optional}>
              <h3 className={styles.sub}>{p.optionalTitle}</h3>
              <p className={styles.lineMeta}>{p.optionalNote}</p>
              <ul className={styles.lines}>
                {optional.map((line, index) => (
                  <li key={`${line.description}-${index}`}>
                    <div className={styles.lineHead}>
                      <span className={styles.lineName}>{line.description}</span>
                      <span className={styles.lineAmount}>{line.total.text}</span>
                    </div>
                    {line.detail && <p className={styles.lineMeta}>{line.detail}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {pricing.mode !== 'custom' && p.tax[pricing.tax.mode] && <p className={styles.taxNote}>{p.tax[pricing.tax.mode]}</p>}
      {pricing.tax.note && <p className={styles.taxNote}>{pricing.tax.note}</p>}
    </Section>
  )
}

type Panel = null | 'accept' | 'decline' | 'revise'

function Actions({ page, words, onDone }: { page: QuotePageData; words: QuoteWords; onDone: (kind: 'accepted' | 'declined' | 'revision_requested') => void }) {
  const a = words.quote.actions
  const [panel, setPanel] = useState<Panel>(null)
  const [confirm, setConfirm] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (panel) headingRef.current?.focus()
  }, [panel])

  const open = (next: Panel) => {
    setPanel(next)
    setConfirm(false)
    setText('')
    setError(null)
    setTried(false)
  }
  const needsMessage = panel === 'revise'
  const missing = panel === 'revise' ? text.trim().length < 3 : !confirm
  const e = words.quote.errors

  const submit = async () => {
    setTried(true)
    if (missing || !panel) return
    const tokenOf = panel === 'accept' ? page.actions.accept : panel === 'decline' ? page.actions.decline : page.actions.revise
    if (!tokenOf) return setError(e.needsReload)
    setBusy(true)
    setError(null)
    const result = await postAction({ token: tokenOf, confirm: panel !== 'revise' ? true : undefined, ...(panel === 'decline' && text.trim() ? { reason: text.trim() } : {}), ...(panel === 'revise' ? { message: text.trim() } : {}) })
    setBusy(false)
    if (result.ok) return onDone(result.data.outcome)
    const f = result.failure
    if (f.kind === 'refused') {
      setError(f.reason === 'already_used' ? e.alreadyUsed : f.reason === 'already_decided' ? e.alreadyDecided : f.reason === 'quote_expired' ? e.quoteExpired : Object.values(f.fields)[0] === 'tooLong' ? e.tooLong : e.generic)
    } else {
      setError(f.kind === 'expired' || f.kind === 'replaced' ? e.needsReload : e.generic)
    }
  }

  return (
    <>
      <section className={styles.actions} aria-labelledby="q-actions">
      <h2 id="q-actions" className={styles.heading}>
        {a.heading}
      </h2>
      <p className={styles.lineMeta}>{a.intro}</p>
      {panel === null && page.actions.revise && (
        <div className={styles.buttons}>
          <Button type="button" variant="text" onClick={() => open('revise')}>
            {a.revise}
          </Button>
        </div>
      )}
      {panel !== null && (
        <form
          className={styles.panel}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          aria-busy={busy || undefined}
        >
          <h3 ref={headingRef} tabIndex={-1} className={styles.sub}>
            {panel === 'accept' ? a.acceptTitle : panel === 'decline' ? a.declineTitle : a.reviseTitle}
          </h3>
          <p>{panel === 'accept' ? a.acceptText : panel === 'decline' ? a.declineText : a.reviseText}</p>
          {panel === 'decline' && <TextField multiline rows={3} label={a.declineReason} value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} autoComplete="off" />}
          {needsMessage && (
            <TextField multiline rows={5} label={a.reviseMessage} value={text} onChange={(event) => setText(event.target.value)} error={tried && missing ? e.message : undefined} maxLength={2000} autoComplete="off" />
          )}
          {panel !== 'revise' && (
            <CheckboxField label={panel === 'accept' ? a.acceptConfirm : a.declineConfirm} checked={confirm} onChange={setConfirm} error={tried && missing ? e.confirm : undefined} />
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.buttons}>
            <Button type="submit" loading={busy} loadingLabel={a.sending} variant={panel === 'decline' ? 'secondary' : 'primary'}>
              {panel === 'accept' ? a.acceptSubmit : panel === 'decline' ? a.declineSubmit : a.reviseSubmit}
            </Button>
            <Button type="button" variant="text" onClick={() => open(null)} disabled={busy}>
              {a.cancel}
            </Button>
          </div>
        </form>
      )}
      </section>
      {panel === null && (page.actions.accept || page.actions.decline) && (
        <div className={styles.bar}>
          {page.actions.accept && (
            <Button type="button" onClick={() => open('accept')}>
              {a.accept}
            </Button>
          )}
          {page.actions.decline && (
            <Button type="button" variant="secondary" onClick={() => open('decline')}>
              {a.decline}
            </Button>
          )}
        </div>
      )}
    </>
  )
}

export function QuotePage() {
  const { token = '' } = useParams()
  const { lang } = useI18n()
  const words = useQuoteText()
  const { state, reload } = useRemote(token, fetchQuotation)
  const [done, setDone] = useState<null | 'accepted' | 'declined' | 'revision_requested'>(null)
  const doneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  if (state.status === 'loading') return <Page words={words}><Loading label={words.common.loading} /></Page>
  if (state.status === 'failed') return <Page words={words}><Problem failure={state.failure} words={words} onRetry={reload} /></Page>

  const { quote, state: quoteState } = state.data
  const q = words.quote
  const when = (iso: string | null) => (iso ? formatMoment(iso, lang) : '')
  const banner =
    quoteState === 'accepted' ? fill(q.status.accepted, { date: when(quote.acceptedAt) })
    : quoteState === 'declined' ? fill(q.status.declined, { date: when(quote.declinedAt) })
    : quoteState === 'expired' && quote.validUntil ? fill(q.status.expired, { date: longDay(quote.validUntil, lang) })
    : null
  const finished = done === 'accepted' ? { title: q.done.accepted, text: q.done.acceptedText } : done === 'declined' ? { title: q.done.declined, text: q.done.declinedText } : done === 'revision_requested' ? { title: q.done.revised, text: q.done.revisedText } : null
  const canAct = (quoteState === 'open' || quoteState === 'expired') && (done === null || done === 'revision_requested')

  return (
    <Page words={words}>
      <article className={styles.document} aria-labelledby="q-title">
        <header className={styles.header}>
          <p className={styles.eyebrow}>{q.eyebrow}</p>
          <h1 id="q-title" className={styles.title}>
            {quote.title}
          </h1>
          <dl className={styles.facts}>
            <div>
              <dt>{words.common.reference}</dt>
              <dd className={styles.code}>{quote.reference}</dd>
            </div>
            <div>
              <dt>{q.version}</dt>
              <dd>{quote.version}</dd>
            </div>
            {quote.sentAt && (
              <div>
                <dt>{q.sentOn}</dt>
                <dd>{when(quote.sentAt)}</dd>
              </div>
            )}
            {quote.validUntil && (
              <div>
                <dt>{q.validUntil}</dt>
                <dd>{longDay(quote.validUntil, lang)}</dd>
              </div>
            )}
            {quote.estimatedTimeline && (
              <div>
                <dt>{q.timeline}</dt>
                <dd>{quote.estimatedTimeline}</dd>
              </div>
            )}
          </dl>
          <p className={styles.lineMeta}>{fill(q.forCustomer, { name: quote.customer.company ? `${quote.customer.name}, ${quote.customer.company}` : quote.customer.name })}</p>
        </header>

        {banner && (
          <p className={styles.banner} role="status" data-state={quoteState}>
            {banner}
          </p>
        )}
        {quoteState === 'accepted' && <p className={styles.lineMeta}>{q.status.acceptedNote}</p>}
        {finished && (
          <div ref={doneRef} tabIndex={-1} className={styles.done} role="status">
            <h2 className={styles.heading}>{finished.title}</h2>
            <p>{finished.text}</p>
          </div>
        )}

        {quote.introduction && <Prose>{quote.introduction}</Prose>}
        {quote.understanding && (
          <Section id="q-understanding" title={q.sections.understanding}>
            <Prose>{quote.understanding}</Prose>
          </Section>
        )}
        {quote.scope && (
          <Section id="q-scope" title={q.sections.scope}>
            <Prose>{quote.scope}</Prose>
          </Section>
        )}
        {quote.deliverables && (
          <Section id="q-deliverables" title={q.sections.deliverables}>
            <Prose>{quote.deliverables}</Prose>
          </Section>
        )}
        {quote.exclusions && (
          <Section id="q-exclusions" title={q.sections.exclusions}>
            <Prose>{quote.exclusions}</Prose>
          </Section>
        )}
        <Price quote={quote} words={words} />
        {quote.paymentTerms && (
          <Section id="q-payment" title={q.sections.payment}>
            <Prose>{quote.paymentTerms}</Prose>
          </Section>
        )}
        {quote.notes && (
          <Section id="q-notes" title={q.sections.notes}>
            <Prose>{quote.notes}</Prose>
          </Section>
        )}
        {quote.terms && (
          <Section id="q-terms" title={q.sections.terms}>
            <Prose>{quote.terms}</Prose>
          </Section>
        )}

        {canAct && (
          <Actions
            key={done ?? 'idle'}
            page={state.data}
            words={words}
            onDone={(kind) => {
              setDone(kind)
              reload()
            }}
          />
        )}
      </article>
    </Page>
  )
}

function Page({ words, children }: { words: QuoteWords; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <Container size="narrow">
        {children}
        <p className={styles.private}>{words.common.privateNote}</p>
      </Container>
    </div>
  )
}

// ---- the status of a request ----------------------------------------------------------------------------------------------

function RequestView({ data, words }: { data: RequestPageData; words: QuoteWords }) {
  const { lang } = useI18n()
  const r = words.request
  return (
    <article className={styles.document} aria-labelledby="r-title">
      <header className={styles.header}>
        <p className={styles.eyebrow}>{r.eyebrow}</p>
        <h1 id="r-title" className={styles.title}>
          {r.title}
        </h1>
        <dl className={styles.facts}>
          <div>
            <dt>{words.common.reference}</dt>
            <dd className={styles.code}>{data.reference}</dd>
          </div>
          <div>
            <dt>{r.received}</dt>
            <dd>
              <time dateTime={data.createdAt}>{formatMoment(data.createdAt, lang)}</time>
            </dd>
          </div>
          <div>
            <dt>{r.statusLabel}</dt>
            <dd>
              <strong className={styles.status} data-status={data.status}>
                {r.statuses[data.status]}
              </strong>
            </dd>
          </div>
        </dl>
      </header>

      {data.quotations.length > 0 && (
        <Section id="r-quotes" title={r.quotations}>
          <ul className={styles.cards}>
            {data.quotations.map((quote) => (
              <li key={quote.reference} className={styles.card}>
                <p className={styles.lineName}>{quote.title}</p>
                <p className={styles.lineMeta}>
                  <span className={styles.code}>{quote.reference}</span> · {fill(r.version, { version: quote.version })} · {r.states[quote.state]}
                  {quote.validUntil ? ` · ${words.quote.validUntil}: ${longDay(quote.validUntil, lang)}` : ''}
                </p>
                {quote.link && (
                  <LocalizedLink to={`/quote/${quote.link}`} className={styles.openLink}>
                    {r.open}
                  </LocalizedLink>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="r-updates" title={r.updates}>
        {data.updates.length === 0 ? (
          <p>{r.noUpdates}</p>
        ) : (
          <ol className={styles.timeline}>
            {[...data.updates].reverse().map((update, index) => (
              <li key={`${update.at}-${index}`}>
                <time dateTime={update.at} className={styles.lineMeta}>
                  {formatMoment(update.at, lang)}
                </time>
                <p className={styles.lineName}>{update.kind === 'quote' ? r.statuses.quote_sent : update.status ? r.statuses[update.status] : ''}</p>
                {update.body && <Prose>{update.body}</Prose>}
              </li>
            ))}
          </ol>
        )}
      </Section>
      <p className={styles.lineMeta}>{r.notice}</p>
    </article>
  )
}

export function RequestStatusPage() {
  const { token = '' } = useParams()
  const words = useQuoteText()
  const { state, reload } = useRemote(token, fetchRequest)
  return (
    <Page words={words}>
      {state.status === 'loading' ? <Loading label={words.common.loading} /> : state.status === 'failed' ? <Problem failure={state.failure} words={words} onRetry={reload} /> : <RequestView data={state.data} words={words} />}
    </Page>
  )
}

/** The bare `/quote` and `/request`: no secret, so nothing to show but where to find it. */
export function IncompleteLinkPage() {
  const words = useQuoteText()
  return (
    <Page words={words}>
      <section className={styles.problem}>
        <h1 className={styles.title}>{words.problems.incomplete.title}</h1>
        <p>{words.problems.incomplete.text}</p>
        <Button to="/" variant="text">
          {words.common.home}
        </Button>
      </section>
    </Page>
  )
}
