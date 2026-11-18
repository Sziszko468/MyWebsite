import { useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AdminButton } from '../components/AdminButton'
import { fill } from '../i18n'
import { copyText, downloadText, draftToText, exportFileName, factLines, formatMoment, humanKey, printElement, reportToText } from './exporters'
import { OUTLINE_SECTIONS, type Draft, type Outline, type Report } from './model'
import { useAssistantLanguage, useAssistantText } from './text'
import styles from '../styles/assistant.module.scss'

/**
 * The three results of the assistant that have a shape of their own (PROMPT 31): a report, a draft reply (or translation) and a quotation outline. Each one says what it is in
 * words, not only in colour: a report keeps the facts that were READ FROM THE DATABASE apart from the assistant's own words (headed "AI interpretation: not verified data"),
 * and a draft says in its first line that nothing has been sent. Everything is text in elements: nothing the assistant wrote is ever drawn as HTML.
 */

// ---------------------------------------------------------------------------------------------------------------------------- data

const MAX_ITEMS = 25

function FactNode({ value, depth }: { value: unknown; depth: number }) {
  const t = useAssistantText()
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className={styles.factEmpty}>—</span>
    return (
      <ul className={styles.factList}>
        {value.slice(0, MAX_ITEMS).map((item, index) => (
          <li key={index}>
            <FactNode value={item} depth={depth + 1} />
          </li>
        ))}
        {value.length > MAX_ITEMS && <li className={styles.factMore}>{fill(t.report.more, { count: value.length - MAX_ITEMS })}</li>}
      </ul>
    )
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className={styles.factEmpty}>—</span>
    if (depth > 5) return <span className={styles.factEmpty}>…</span>
    return (
      <dl className={styles.factTree}>
        {entries.map(([key, child]) => (
          <div key={key} className={styles.factRow} data-nested={typeof child === 'object' && child !== null ? 'true' : undefined}>
            <dt>{humanKey(key)}</dt>
            <dd>
              <FactNode value={child} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    )
  }
  return <>{value === null || value === undefined ? '—' : String(value)}</>
}

function Labelled({ title, tone, children }: { title: string; tone: 'database' | 'ai' | 'plain'; children: ReactNode }) {
  const id = useId()
  return (
    <section className={styles.block} data-tone={tone} aria-labelledby={id}>
      <h4 id={id} className={styles.blockTitle}>
        {title}
      </h4>
      {children}
    </section>
  )
}

const Bullets = ({ items, empty }: { items: readonly string[]; empty: string }) =>
  items.length === 0 ? (
    <p className={styles.muted}>{empty}</p>
  ) : (
    <ul className={styles.bullets}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )

// ---------------------------------------------------------------------------------------------------------------------------- report

export function ReportCard({ report }: { report: Report }) {
  const t = useAssistantText()
  const language = useAssistantLanguage()
  const titleId = useId()
  const ref = useRef<HTMLElement | null>(null)
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const title = (t.report.titles as Record<string, string>)[report.kind] ?? report.kind
  const limitations = t.report.limitationTexts as Record<string, string>
  const missing = t.report.missingTexts as Record<string, string>
  const areas = t.report.unavailableAreas as Record<string, string>

  const copy = async () => {
    if (await copyText(reportToText(report, t, language))) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <article ref={ref} className={styles.report} aria-labelledby={titleId} data-kind={report.kind}>
      <header className={styles.reportHead}>
        <h3 id={titleId}>{title}</h3>
        <p className={styles.reportMeta}>
          <span>
            {t.report.generatedAt}: <time dateTime={report.generatedAt}>{formatMoment(report.generatedAt, language)}</time>
          </span>
          {report.subject && (
            <span>
              {t.report.subject}: <Link to={report.subject.path}>{report.subject.reference}</Link>
            </span>
          )}
          {report.period && (
            <span>
              {t.report.period}: {report.period.description}
            </span>
          )}
        </p>
        <p className={styles.reportMeta}>
          {t.report.sources}: {report.dataSources.join(', ')}
        </p>
      </header>

      <Labelled title={t.report.facts} tone="database">
        <button type="button" className={styles.linkButton} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? t.report.hide : t.report.show}
        </button>
        {open && (
          // A box that scrolls can be reached and scrolled with the keyboard: a labelled group in the tab order.
          <div className={styles.facts} role="group" aria-label={t.report.facts} tabIndex={0}>
            <FactNode value={report.confirmedFacts} depth={0} />
          </div>
        )}
      </Labelled>
      <Labelled title={t.report.observations} tone="ai">
        <Bullets items={report.aiObservations} empty={t.report.none} />
      </Labelled>
      <Labelled title={t.report.recommendations} tone="ai">
        <Bullets items={report.recommendations} empty={t.report.none} />
      </Labelled>
      <Labelled title={t.report.missing} tone="plain">
        <Bullets items={report.missingInformation.map((code) => missing[code] ?? code)} empty={t.report.none} />
      </Labelled>
      {report.notAvailableToYou.length > 0 && (
        <Labelled title={t.report.notAvailable} tone="plain">
          <Bullets items={report.notAvailableToYou.map((area) => areas[area] ?? area)} empty={t.report.none} />
        </Labelled>
      )}
      <Labelled title={t.report.limitations} tone="plain">
        <Bullets items={report.limitations.map((code) => limitations[code] ?? code)} empty={t.report.none} />
      </Labelled>
      <p className={styles.reportNotice}>{t.report.humanReview}</p>

      <div className={styles.cardActions} data-no-print>
        <AdminButton variant="secondary" onClick={() => void copy()}>
          {copied ? t.report.copied : t.report.copy}
        </AdminButton>
        <AdminButton variant="secondary" onClick={() => downloadText(exportFileName(t, new Date(report.generatedAt)), reportToText(report, t, language))}>
          {t.report.download}
        </AdminButton>
        <AdminButton variant="secondary" onClick={() => ref.current && printElement(ref.current)}>
          {t.report.print}
        </AdminButton>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------------------------------------------------------- drafts

export function DraftCard({ draft }: { draft: Draft }) {
  const t = useAssistantText()
  const titleId = useId()
  const [copied, setCopied] = useState(false)
  const names = t.language.names as Record<string, string>
  const copy = async () => {
    if (await copyText(draft.body)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }
  return (
    <article className={styles.draft} aria-labelledby={titleId} data-kind={draft.kind}>
      <h3 id={titleId}>{draft.kind === 'translation' ? t.draft.translationTitle : t.draft.replyTitle}</h3>
      <p className={styles.draftNotice} role="note">
        <strong>{t.draft.notSent}</strong> {t.draft.review}
      </p>
      <p className={styles.reportMeta}>
        {draft.language && (
          <span>
            {t.draft.language}: {names[draft.language] ?? draft.language}
          </span>
        )}
        {draft.customerPreferredLanguage && (
          <span>
            {t.draft.customerLanguage}: {names[draft.customerPreferredLanguage] ?? draft.customerPreferredLanguage}
          </span>
        )}
      </p>
      {draft.original && (
        <>
          <p className={styles.muted}>{t.draft.original}</p>
          <p className={styles.draftBody}>{draft.original}</p>
          <p className={styles.muted}>{t.draft.translation}</p>
        </>
      )}
      <p className={styles.draftBody}>{draft.body}</p>
      <div className={styles.cardActions}>
        <AdminButton variant="secondary" onClick={() => void copy()}>
          {copied ? t.draft.copied : t.draft.copy}
        </AdminButton>
        {draft.path && (
          <AdminButton variant="secondary" to={draft.path}>
            {t.draft.open}
          </AdminButton>
        )}
      </div>
    </article>
  )
}

export function OutlineCard({ outline }: { outline: Outline }) {
  const t = useAssistantText()
  const titleId = useId()
  const names = t.draft.sections as Record<string, string>
  return (
    <article className={styles.draft} aria-labelledby={titleId} data-kind="outline">
      <h3 id={titleId}>
        {t.draft.outlineTitle} {outline.quoteReference && <span className={styles.muted}>{outline.quoteReference}</span>}
      </h3>
      <p className={styles.draftNotice} role="note">
        <strong>{t.draft.outlineNotice}</strong>
      </p>
      {OUTLINE_SECTIONS.map((section) =>
        outline.sections[section].length === 0 ? null : (
          <Labelled key={section} title={names[section]} tone="plain">
            <Bullets items={outline.sections[section]} empty={t.report.none} />
          </Labelled>
        ),
      )}
      <div className={styles.cardActions}>
        <AdminButton
          variant="secondary"
         
          onClick={() => void copyText(OUTLINE_SECTIONS.map((section) => `${names[section]}\n${outline.sections[section].map((line) => `- ${line}`).join('\n')}`).join('\n\n'))}
        >
          {t.draft.copy}
        </AdminButton>
        {outline.path && (
          <AdminButton variant="secondary" to={outline.path}>
            {t.actions.open}
          </AdminButton>
        )}
      </div>
    </article>
  )
}

export { draftToText, factLines }
