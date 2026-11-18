import { useId, useState, type ReactNode } from 'react'
import { controlRoom } from '../../../ai/controlRoom'
import { readPlanVersion } from '../../../ai/discoveryClient'
import { LIMITS, PRIORITY_ORDER, SECTIONS, awaitsConfirmation, type DiscoveryState, type Fact, type Missing, type PlanContent, type PlanMeta, type PlanRequirement, type Section } from '../../../ai/discoveryModel'
import { useAiText } from '../../../ai/useAiText'
import { useDiscoveryText, word, type DiscoveryWords } from '../../../ai/useDiscoveryText'
import { LOCALE_TAGS, type Language } from '../../../i18n/config'
import { useI18n } from '../../../i18n/useI18n'
import { cx } from '../../../utils/cx'
import { fill } from '../../../utils/format'
import { LocalizedLink } from '../../LocalizedLink/LocalizedLink'
import { SendForm } from '../SendForm'
import styles from './Discovery.module.scss'

interface PlanTabProps {
  state: DiscoveryState
  conversationId: string
  locked: boolean
  /** The quote workflow's side: the plan the server projected is ready to be approved, and sending is switched on. */
  ready: boolean
  quoteEnabled: boolean
}

type Shown = PlanMeta & { content: PlanContent }

/**
 * The plan, section by section, with the visitor's own notes; the versions it has had; and the review that comes before a request is sent.
 * Nothing is sent from here by itself: the review shows what the studio would receive, and the form below it is the visitor's explicit approval.
 */
export function PlanTab({ state, conversationId, locked, ready, quoteEnabled }: PlanTabProps) {
  const text = useDiscoveryText()
  const { lang } = useI18n()
  const [viewing, setViewing] = useState<Shown | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const latest = state.plan.latest
  const blocked = state.missingForPlan.length > 0

  if (!latest)
    return (
      <div className={styles.tabPanel}>
        <div className={cx(styles.card, styles.empty)}>
          <h3 className={styles.sectionTitle}>{text.plan.title}</h3>
          <p className={styles.small}>{text.plan.empty}</p>
          {blocked && <MissingList codes={state.missingForPlan} title={text.plan.missing.title} />}
          <button type="button" className={styles.primary} disabled={locked || blocked || state.sent} onClick={() => void controlRoom.discoveryGenerate()}>
            {locked ? text.plan.generating : text.plan.generate}
          </button>
        </div>
      </div>
    )

  const shown: Shown = viewing ?? latest
  const readOnly = viewing !== null

  const open = async (version: number) => {
    setLoadFailed(false)
    try {
      setViewing(await readPlanVersion(conversationId, version))
    } catch {
      setLoadFailed(true)
    }
  }

  return (
    <div className={styles.tabPanel}>
      <div>
        <div className={styles.planHead}>
          <h3 className={styles.sectionTitle}>{text.plan.title}</h3>
          <span className={styles.chips}>
            <span className={styles.badge}>{fill(text.plan.version, { version: shown.version })}</span>
            <span className={cx(styles.badge, styles.badgeAi)}>{text.plan.proposal}</span>
          </span>
        </div>
        <p className={styles.small}>{text.plan.lead}</p>
      </div>

      {readOnly ? (
        <div className={styles.notice} role="status">
          <p className={styles.small}>{fill(text.plan.versions.viewing, { version: shown.version })}</p>
          <button type="button" className={cx(styles.secondary, styles.compact)} onClick={() => setViewing(null)}>
            {text.plan.versions.back}
          </button>
        </div>
      ) : state.plan.stale ? (
        <div className={styles.alert} role="status">
          <p className={styles.small}>{text.plan.stale}</p>
          {blocked && <MissingList codes={state.missingForPlan} title={text.plan.missing.title} />}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={locked || blocked || state.sent} onClick={() => void controlRoom.discoveryGenerate()}>
              {locked ? text.plan.generating : text.plan.regenerate}
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.good} role="status">
          {text.plan.fresh}
        </p>
      )}
      {loadFailed && (
        <p className={styles.alert} role="alert">
          {text.panel.problem}
        </p>
      )}

      <p className={styles.small}>{text.plan.notDecision}</p>

      {SECTIONS.map((section) => (
        <PlanSection key={section} section={section} content={shown.content} state={state} readOnly={readOnly} locked={locked} stale={!readOnly && state.plan.staleSections.includes(section)} />
      ))}

      <Versions versions={state.plan.versions} current={shown.version} latest={latest.version} lang={lang} onOpen={(version) => void open(version)} />

      {!readOnly && <Review state={state} content={latest.content} ready={ready} quoteEnabled={quoteEnabled} />}
    </div>
  )
}

function MissingList({ codes, title }: { codes: Missing[]; title: string }) {
  const text = useDiscoveryText()
  return (
    <div>
      <p className={styles.small}>{title}</p>
      <ul className={styles.bullets}>
        {codes.map((code) => (
          <li key={code}>{text.plan.missing[code]}</li>
        ))}
      </ul>
    </div>
  )
}

// ---- one section ----

function factValue(fact: Fact | null, text: DiscoveryWords) {
  if (!fact) return null
  return (
    <>
      {fact.value} {awaitsConfirmation(fact) && <span className={cx(styles.badge, styles.badgeAi)}>{text.facts.aiSuggested}</span>}
    </>
  )
}

function PlanSection({ section, content, state, readOnly, locked, stale }: { section: Section; content: PlanContent; state: DiscoveryState; readOnly: boolean; locked: boolean; stale: boolean }) {
  const text = useDiscoveryText()
  const id = useId()
  return (
    <section className={cx(styles.planSection, stale && styles.planSectionStale)} aria-labelledby={`${id}-title`}>
      <div className={styles.planHead}>
        <h3 id={`${id}-title`} className={styles.sectionTitle}>
          {text.labels.sections[section]}
        </h3>
        {stale && <span className={cx(styles.badge, styles.badgeAi)}>{text.plan.staleSection}</span>}
      </div>
      {section === 'overview' && <OverviewBody content={content} />}
      {section === 'requirements' && <RequirementsBody content={content} />}
      {section === 'architecture' && <ArchitectureBody content={content} />}
      {section === 'phases' && <PhasesBody content={content} />}
      {section === 'risks' && <RisksBody content={content} />}
      {section === 'next_steps' && <NextStepsBody content={content} />}
      {readOnly ? (
        content.notes[section] ? (
          <div className={styles.note}>
            <p className={styles.small}>{text.plan.notes.yours}</p>
            <p className={styles.reqText}>{content.notes[section]}</p>
          </div>
        ) : null
      ) : (
        <SectionNote section={section} saved={state.notes[section] ?? ''} locked={locked || state.sent} />
      )}
      {!readOnly && !state.sent && (
        <div className={styles.actions}>
          <button type="button" className={cx(styles.secondary, styles.compact)} disabled={locked || state.missingForPlan.length > 0} onClick={() => void controlRoom.discoveryGenerate([section])}>
            {text.plan.regenerateSection}
          </button>
        </div>
      )}
    </section>
  )
}

function OverviewBody({ content }: { content: PlanContent }) {
  const text = useDiscoveryText()
  const o = content.overview
  const type = o.projectType.value
  const rows: { label: string; value: ReactNode }[] = [
    { label: text.plan.overview.name, value: o.projectName ? factValue(o.projectName, text) : text.plan.overview.unnamed },
    { label: text.plan.overview.type, value: type ? word(text.labels.types, type) : text.facts.empty },
    { label: text.plan.overview.objective, value: factValue(o.objective, text) },
    { label: text.plan.overview.problem, value: factValue(o.problem, text) },
    { label: text.plan.overview.audience, value: factValue(o.audience, text) },
    { label: text.plan.overview.existing, value: factValue(o.existingSite, text) },
    { label: text.plan.overview.timeline, value: factValue(o.timeline, text) },
    { label: text.plan.overview.budget, value: factValue(o.budget, text) },
    { label: text.plan.overview.maintenance, value: o.maintenance ? word(text.labels.maintenance, o.maintenance.value) : null },
    { label: text.complexity.title, value: o.complexity.level ? word(text.labels.levels, o.complexity.level) : text.labels.levels.unknown },
  ].filter((row) => row.value !== null)
  return (
    <dl className={styles.dl}>
      {rows.map((row) => (
        <div key={row.label} className={styles.dlRow}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function RequirementsBody({ content }: { content: PlanContent }) {
  const text = useDiscoveryText()
  const items = content.requirements.items
  if (items.length === 0) return <p className={styles.small}>{text.requirements.empty}</p>
  return (
    <>
      {PRIORITY_ORDER.map((priority) => {
        const group = items.filter((item) => item.priority === priority)
        if (group.length === 0) return null
        return (
          <div key={priority} className={styles.group}>
            <h4 className={styles.groupTitle}>{text.labels.priorities[priority]}</h4>
            <ul className={styles.list}>
              {group.map((item) => (
                <PlanRequirementRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        )
      })}
    </>
  )
}

function PlanRequirementRow({ item }: { item: PlanRequirement }) {
  const text = useDiscoveryText()
  return (
    <li className={cx(styles.req, item.status === 'unconfirmed' && styles.reqPending, item.status === 'confirmed' && styles.reqConfirmed)}>
      <p className={styles.reqTitle}>{item.title}</p>
      <div className={styles.chips}>
        <span className={cx(styles.badge, item.status === 'confirmed' ? styles.badgeOk : styles.badgeAi)}>{text.requirements.status[item.status]}</span>
        <span className={styles.badge}>{item.required ? text.requirements.kind.required : text.requirements.kind.optional}</span>
        <span className={styles.badge}>{word(text.labels.categories, item.category)}</span>
      </div>
      {item.description && <p className={styles.reqText}>{item.description}</p>}
    </li>
  )
}

function ArchitectureBody({ content }: { content: PlanContent }) {
  const text = useDiscoveryText()
  if (content.architecture.length === 0) return <p className={styles.small}>{text.plan.architecture.none}</p>
  const areas = [...new Set(content.architecture.map((item) => item.area))]
  return (
    <>
      <p className={styles.small}>{text.plan.notDecision}</p>
      {areas.map((area) => (
        <div key={area} className={styles.group}>
          <h4 className={styles.groupTitle}>{text.plan.architecture.area[area]}</h4>
          <ul className={styles.bullets}>
            {content.architecture
              .filter((item) => item.area === area)
              .map((item) => (
                <li key={item.code}>
                  {word(text.labels.architecture, item.code)}
                  {item.why.length > 0 && <span className={styles.sub}>{fill(text.plan.architecture.because, { reasons: item.why.map((code) => word(text.labels.reasons, code)).join('; ') })}</span>}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </>
  )
}

function PhasesBody({ content }: { content: PlanContent }) {
  const text = useDiscoveryText()
  const titles = new Map(content.requirements.items.map((item) => [item.id, item.title]))
  return (
    <>
      <ol className={styles.bullets}>
        {content.phases.map((phase) => {
          const covered = phase.requirementIds.map((id) => titles.get(id)).filter((title): title is string => title !== undefined)
          return (
            <li key={phase.code}>
              {word(text.labels.phases, phase.code)}
              {covered.length > 0 && <span className={styles.sub}>{fill(text.plan.phases.for, { list: covered.join(', ') })}</span>}
            </li>
          )
        })}
      </ol>
      <p className={styles.small}>{text.plan.phases.note}</p>
    </>
  )
}

function RisksBody({ content }: { content: PlanContent }) {
  const text = useDiscoveryText()
  const detailWord = (code: string) => word({ ...text.labels.signals, ...text.labels.facts }, code)
  return (
    <ul className={styles.bullets}>
      {content.risks.map((risk) => (
        <li key={`${risk.kind}-${risk.code}`}>
          <span className={styles.badge}>{word(text.labels.riskKinds, risk.kind)}</span> {word(text.labels.risks, risk.code)}
          {risk.detail.length > 0 && <span className={styles.sub}>{fill(text.plan.risks.detail, { detail: risk.detail.map(detailWord).join(', ') })}</span>}
        </li>
      ))}
    </ul>
  )
}

function NextStepsBody({ content }: { content: PlanContent }) {
  const text = useDiscoveryText()
  return (
    <ol className={styles.bullets}>
      {content.nextSteps.map((code) => (
        <li key={code}>{word(text.labels.nextSteps, code)}</li>
      ))}
    </ol>
  )
}

/** The visitor's own words on a section: kept by every regeneration of it (the server holds them apart from the generated text). */
function SectionNote({ section, saved, locked }: { section: Section; saved: string; locked: boolean }) {
  const text = useDiscoveryText()
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? saved
  const dirty = draft !== null && draft !== saved
  return (
    <div className={cx(styles.control, styles.note)}>
      <label htmlFor={id}>{text.plan.notes.label}</label>
      <textarea id={id} rows={2} maxLength={LIMITS.note} value={value} disabled={locked} aria-describedby={`${id}-hint`} onChange={(event) => setDraft(event.target.value)} />
      <p id={`${id}-hint`} className={styles.small}>
        {text.plan.notes.hint}
      </p>
      {dirty && (
        <div className={styles.actions}>
          <button
            type="button"
            className={cx(styles.secondary, styles.compact)}
            disabled={locked}
            onClick={() =>
              void controlRoom.discoveryNote(section, (draft ?? '').trim()).then(({ ok }) => {
                if (ok) setDraft(null)
              })
            }
          >
            {text.plan.notes.save}
          </button>
        </div>
      )}
    </div>
  )
}

// ---- the versions ----

function Versions({ versions, current, latest, lang, onOpen }: { versions: PlanMeta[]; current: number; latest: number; lang: Language; onOpen: (version: number) => void }) {
  const text = useDiscoveryText()
  if (versions.length === 0) return null
  const when = (iso: string): string => {
    try {
      return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
    } catch {
      return iso
    }
  }
  const ordered = [...versions].sort((a, b) => b.version - a.version)
  return (
    <section className={styles.card} aria-label={text.plan.versions.title}>
      <h3 className={styles.sectionTitle}>{text.plan.versions.title}</h3>
      <p className={styles.small}>{text.plan.versions.lead}</p>
      <ul className={styles.versions}>
        {ordered.map((item) => {
          const summary = item.summary
          const lines: string[] = []
          if (summary) {
            if (item.version === 1) lines.push(text.plan.versions.first)
            else {
              lines.push(fill(text.plan.versions.changes, { added: summary.requirementsAdded, removed: summary.requirementsRemoved, changed: summary.requirementsChanged }))
              if (summary.sections.length < SECTIONS.length) lines.push(fill(text.plan.versions.regenerated, { list: summary.sections.map((section) => word(text.labels.sections, section)).join(', ') }))
              if (summary.complexityFrom !== summary.complexityTo && summary.complexityFrom && summary.complexityTo) lines.push(fill(text.plan.versions.complexityMoved, { from: word(text.labels.levels, summary.complexityFrom), to: word(text.labels.levels, summary.complexityTo) }))
            }
          }
          return (
            <li key={item.version} className={styles.version} aria-current={item.version === current ? 'true' : undefined}>
              <div className={styles.versionHead}>
                <span>
                  <strong>{fill(text.plan.version, { version: item.version })}</strong>
                  {item.version === latest && <> · {text.plan.versions.current}</>}
                </span>
                {item.version !== current && (
                  <button type="button" className={cx(styles.secondary, styles.compact)} aria-label={`${text.plan.versions.view}: ${fill(text.plan.version, { version: item.version })}`} onClick={() => onOpen(item.version)}>
                    {text.plan.versions.view}
                  </button>
                )}
              </div>
              <span className={styles.small}>
                {text.plan.versions.by[item.origin]} · {when(item.createdAt)}
              </span>
              {lines.map((line) => (
                <span key={line} className={styles.small}>
                  {line}
                </span>
              ))}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ---- the review before sending ----

function Review({ state, content, ready, quoteEnabled }: { state: DiscoveryState; content: PlanContent; ready: boolean; quoteEnabled: boolean }) {
  const text = useDiscoveryText()
  const ai = useAiText()
  const id = useId()
  const o = content.overview
  const items = content.requirements.items
  // The same rule the server approves by: a core requirement is an essential or a required one, and the visitor confirmed it.
  const core = (item: PlanRequirement) => item.priority === 'essential' || item.required
  const confirmedCore = items.filter((item) => item.status === 'confirmed' && core(item))
  const unconfirmed = items.filter((item) => item.status === 'unconfirmed')
  const optional = items.filter((item) => item.status === 'confirmed' && !core(item))
  const problems: Missing[] = [...state.missingForApproval]
  if (state.plan.stale && !problems.includes('planStale')) problems.push('planStale')

  const list = (title: string, entries: PlanRequirement[]) => (
    <div className={styles.group}>
      <h4 className={styles.groupTitle}>{title}</h4>
      {entries.length === 0 ? (
        <p className={styles.small}>{text.review.none}</p>
      ) : (
        <ul className={styles.bullets}>
          {entries.map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      )}
    </div>
  )
  const given = (fact: Fact | null) => fact?.value ?? text.review.notGiven

  return (
    <section className={styles.review} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.sectionTitle}>
        {text.review.title}
      </h3>
      <p className={styles.small}>{text.review.lead}</p>
      <dl className={styles.dl}>
        <div className={styles.dlRow}>
          <dt>{text.review.overview}</dt>
          <dd>
            {o.projectName?.value ?? text.plan.overview.unnamed} · {o.projectType.value ? word(text.labels.types, o.projectType.value) : text.facts.empty}
          </dd>
        </div>
        <div className={styles.dlRow}>
          <dt>{text.review.complexity}</dt>
          <dd>{o.complexity.level ? word(text.labels.levels, o.complexity.level) : text.labels.levels.unknown}</dd>
        </div>
        <div className={styles.dlRow}>
          <dt>{text.review.budget}</dt>
          <dd>{given(o.budget)}</dd>
        </div>
        <div className={styles.dlRow}>
          <dt>{text.review.timeline}</dt>
          <dd>{given(o.timeline)}</dd>
        </div>
        <div className={styles.dlRow}>
          <dt>{text.review.maintenance}</dt>
          <dd>{o.maintenance ? word(text.labels.maintenance, o.maintenance.value) : text.review.notGiven}</dd>
        </div>
        <div className={styles.dlRow}>
          <dt>{text.review.contact}</dt>
          <dd>{text.review.contactNote}</dd>
        </div>
      </dl>
      {list(text.review.confirmed, confirmedCore)}
      {list(text.review.unconfirmed, unconfirmed)}
      {list(text.review.optional, optional)}
      <p className={styles.small}>{text.review.privacy}</p>
      <p className={styles.small}>{text.review.notQuote}</p>

      {state.sent ? null : problems.length > 0 ? (
        <div className={styles.alert}>
          <p className={styles.small}>{text.review.blocked}</p>
          <ul className={styles.bullets}>
            {problems.map((code) => (
              <li key={code}>{text.plan.missing[code]}</li>
            ))}
          </ul>
        </div>
      ) : !quoteEnabled ? (
        <p className={styles.small}>
          {ai.send.disabled}{' '}
          <LocalizedLink to="/services/configure" className={styles.link}>
            {ai.send.form}
          </LocalizedLink>
        </p>
      ) : ready ? (
        <SendForm key={state.plan.latest?.version ?? 0} />
      ) : null}
    </section>
  )
}
