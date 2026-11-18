import { useId, useState, type FormEvent } from 'react'
import { controlRoom } from '../../../ai/controlRoom'
import { FACT_LIMITS, MAINTENANCE, PROJECT_TYPES, SIGNAL_COUNTS, SIGNAL_VALUES, awaitsConfirmation, type DiscoveryState, type Fact, type FactKey, type SignalChoice, type SignalCount } from '../../../ai/discoveryModel'
import { useDiscoveryText, word, type DiscoveryWords } from '../../../ai/useDiscoveryText'
import { cx } from '../../../utils/cx'
import { fill } from '../../../utils/format'
import styles from './Discovery.module.scss'

interface TabProps {
  state: DiscoveryState
  /** Nothing can be changed now (a change is on its way, the assistant is answering, or the request was sent). */
  locked: boolean
  /** The field errors of the last change the server refused. */
  fields: Record<string, string>
}

/** The project itself: what kind it is, what the visitor says about it, the few characteristics that drive its size, and how big the rules read it. */
export function ProjectTab({ state, locked, fields }: TabProps) {
  return (
    <div className={styles.tabPanel}>
      <TypePicker state={state} locked={locked} />
      <FactsForm state={state} locked={locked} fields={fields} />
      <Characteristics state={state} locked={locked} />
      <ComplexityCard state={state} />
    </div>
  )
}

// ---- the type ----

function TypePicker({ state, locked }: Pick<TabProps, 'state' | 'locked'>) {
  const text = useDiscoveryText()
  const name = useId()
  const { value, origin, confirmed } = state.type
  const pending = value !== null && origin === 'assistant' && !confirmed
  return (
    <fieldset className={cx(styles.fieldset, styles.card)} disabled={locked}>
      <legend>{text.type.legend}</legend>
      <p className={styles.small}>{text.type.lead}</p>
      <div className={styles.options}>
        {PROJECT_TYPES.map((type) => (
          <label key={type} className={styles.option}>
            <input type="radio" name={`${name}-type`} value={type} checked={value === type} onChange={() => void controlRoom.discoveryType({ type })} />
            <span>{text.labels.types[type]}</span>
          </label>
        ))}
      </div>
      <div className={styles.actions} role="status">
        {value === null && <span className={styles.small}>{text.type.none}</span>}
        {pending && (
          <>
            <span className={cx(styles.badge, styles.badgeAi)}>{text.type.aiProposed}</span>
            <button type="button" className={cx(styles.secondary, styles.compact)} onClick={() => void controlRoom.discoveryType({ confirm: true })}>
              {text.type.confirm}
            </button>
          </>
        )}
        {value !== null && !pending && <span className={cx(styles.badge, styles.badgeOk)}>{origin === 'visitor' ? text.type.chosen : text.facts.confirmedAi}</span>}
      </div>
    </fieldset>
  )
}

// ---- the facts ----

const FACT_FIELDS: { key: FactKey; kind: 'input' | 'textarea' | 'select' }[] = [
  { key: 'projectName', kind: 'input' },
  { key: 'objective', kind: 'textarea' },
  { key: 'problem', kind: 'textarea' },
  { key: 'audience', kind: 'textarea' },
  { key: 'existingSite', kind: 'textarea' },
  { key: 'budget', kind: 'input' },
  { key: 'timeline', kind: 'input' },
  { key: 'maintenance', kind: 'select' },
]

function originBadge(fact: Fact | undefined, text: DiscoveryWords) {
  if (!fact) return null
  if (fact.origin === 'visitor') return <span className={styles.badge}>{text.facts.yours}</span>
  return fact.confirmed ? <span className={cx(styles.badge, styles.badgeOk)}>{text.facts.confirmedAi}</span> : <span className={cx(styles.badge, styles.badgeAi)}>{text.facts.aiSuggested}</span>
}

function FactsForm({ state, locked, fields }: TabProps) {
  const text = useDiscoveryText()
  const id = useId()
  // Only what the visitor has typed is held here: whatever else changes underneath (the assistant recording something) shows through untouched.
  const [edits, setEdits] = useState<Partial<Record<FactKey, string>>>({})
  const [saved, setSaved] = useState(false)
  const valueOf = (key: FactKey): string => edits[key] ?? state.facts[key]?.value ?? ''
  const dirty = Object.keys(edits).length > 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!dirty || locked) return
    const payload: Partial<Record<FactKey, string>> = {}
    for (const key of Object.keys(edits) as FactKey[]) payload[key] = (edits[key] ?? '').trim()
    const { ok } = await controlRoom.discoveryFacts(payload)
    if (ok) {
      setEdits({})
      setSaved(true)
    }
  }
  const set = (key: FactKey, value: string) => {
    setSaved(false)
    setEdits((current) => ({ ...current, [key]: value }))
  }

  return (
    <form className={cx(styles.card, styles.form)} onSubmit={(event) => void submit(event)} noValidate aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.sectionTitle}>
        {text.facts.title}
      </h3>
      <p className={styles.small}>{text.facts.lead}</p>
      <div className={styles.grid}>
        {FACT_FIELDS.map(({ key, kind }) => {
          const fact = state.facts[key]
          const edited = edits[key] !== undefined
          const pending = fact !== undefined && awaitsConfirmation(fact) && !edited
          const wide = kind === 'textarea'
          const inputId = `${id}-${key}`
          return (
            <div key={key} className={cx(styles.control, wide && styles.wide)}>
              <div className={styles.controlHead}>
                <label htmlFor={inputId}>{text.facts[key]}</label>
                {!edited && originBadge(fact, text)}
              </div>
              {kind === 'textarea' ? (
                <textarea id={inputId} rows={2} maxLength={FACT_LIMITS[key]} value={valueOf(key)} disabled={locked} aria-invalid={fields[key] ? true : undefined} onChange={(event) => set(key, event.target.value)} />
              ) : kind === 'select' ? (
                <select id={inputId} value={valueOf(key)} disabled={locked} onChange={(event) => set(key, event.target.value)}>
                  <option value="">{text.facts.unsetOption}</option>
                  {MAINTENANCE.map((option) => (
                    <option key={option} value={option}>
                      {text.labels.maintenance[option]}
                    </option>
                  ))}
                </select>
              ) : (
                <input id={inputId} type="text" maxLength={FACT_LIMITS[key]} value={valueOf(key)} disabled={locked} aria-invalid={fields[key] ? true : undefined} aria-describedby={key === 'budget' ? `${inputId}-note` : undefined} onChange={(event) => set(key, event.target.value)} />
              )}
              {key === 'budget' && (
                <p id={`${inputId}-note`} className={styles.small}>
                  {text.facts.budgetNote}
                </p>
              )}
              {pending && (
                <div className={styles.actions}>
                  <button type="button" className={cx(styles.secondary, styles.compact)} disabled={locked} aria-label={`${text.facts.confirm}: ${text.facts[key]}`} onClick={() => void controlRoom.discoveryFacts({}, [key])}>
                    {text.facts.confirm}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={locked || !dirty}>
          {locked && dirty ? text.facts.saving : text.facts.save}
        </button>
        {saved && !dirty && (
          <span className={styles.small} role="status">
            {text.facts.saved}
          </span>
        )}
      </div>
    </form>
  )
}

// ---- the characteristics ----

const CHOICES = Object.keys(SIGNAL_VALUES) as SignalChoice[]
const COUNTS = Object.keys(SIGNAL_COUNTS) as SignalCount[]

function Characteristics({ state, locked }: Pick<TabProps, 'state' | 'locked'>) {
  const text = useDiscoveryText()
  const id = useId()
  const change = (key: string, value: string, count: boolean) => void controlRoom.discoverySignals({ [key]: value === '' ? null : count ? Number(value) : value })
  const confirm = (key: string, value: string | number) => void controlRoom.discoverySignals({ [key]: value })

  const row = (key: SignalChoice | SignalCount, label: string, options: { value: string; label: string }[], count: boolean) => {
    const signal = state.signals[key]
    const inputId = `${id}-${key}`
    return (
      <div key={key} className={styles.control}>
        <div className={styles.controlHead}>
          <label htmlFor={inputId}>{label}</label>
          {signal?.origin === 'assistant' && <span className={cx(styles.badge, styles.badgeAi)}>{text.requirements.origin.suggested}</span>}
        </div>
        <select id={inputId} value={signal === undefined ? '' : String(signal.value)} disabled={locked} onChange={(event) => change(key, event.target.value, count)}>
          <option value="">{text.traits.unset}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {signal?.origin === 'assistant' && (
          <div className={styles.actions}>
            <button type="button" className={cx(styles.secondary, styles.compact)} disabled={locked} aria-label={`${text.type.confirm}: ${label}`} onClick={() => confirm(key, signal.value)}>
              {text.type.confirm}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <section className={cx(styles.card, styles.form)} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.sectionTitle}>
        {text.traits.title}
      </h3>
      <p className={styles.small}>{text.traits.lead}</p>
      <div className={styles.grid}>
        {CHOICES.map((key) => {
          const values = text.traits[`${key}Values` as const] as Record<string, string>
          return row(
            key,
            text.traits[key],
            SIGNAL_VALUES[key].map((value) => ({ value, label: word(values, value) })),
            false,
          )
        })}
        {COUNTS.map((key) => {
          const [min, max] = SIGNAL_COUNTS[key]
          return row(
            key,
            text.traits[key],
            Array.from({ length: max - min + 1 }, (_, index) => ({ value: String(min + index), label: String(min + index) })),
            true,
          )
        })}
      </div>
    </section>
  )
}

// ---- the complexity ----

const VALUE_TABLES = { user_roles: 'rolesValues', data_model: 'dataModelValues', authentication: 'authenticationValues', admin_area: 'adminAreaValues', automation: 'automationValues', security: 'securityValues', scalability: 'scalabilityValues' } as const

/** The number or choice a factor's points come from, in words (a count, "few", "regulated"…). */
function factorDetail(code: string, detail: string | number | null, text: DiscoveryWords): string {
  if (detail === null) return ''
  if (typeof detail === 'number') return String(detail)
  if (code === 'project_type') return word(text.labels.types, detail)
  const table = VALUE_TABLES[code as keyof typeof VALUE_TABLES]
  return table ? word(text.traits[table] as Record<string, string>, detail) : ''
}

export function ComplexityCard({ state, compact = false }: { state: Pick<DiscoveryState, 'complexity'>; compact?: boolean }) {
  const text = useDiscoveryText()
  const id = useId()
  const { level, score, factors, unknown, raisedFrom, thresholds } = state.complexity
  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.sectionTitle}>
        {text.complexity.title}
      </h3>
      {level === null ? (
        <p className={styles.small}>{text.complexity.insufficient}</p>
      ) : (
        <>
          <div className={styles.level}>
            <span className={styles.small}>{text.complexity.level}:</span>
            <span className={styles.levelName}>{text.labels.levels[level]}</span>
            <span className={styles.small}>{fill(text.complexity.score, { score })}</span>
          </div>
          {raisedFrom && <p className={styles.small}>{fill(text.complexity.raised, { from: text.labels.levels[raisedFrom] })}</p>}
          {!compact && (
            <details className={styles.details}>
              <summary>{text.complexity.why}</summary>
              <ul className={styles.factors}>
                {factors.map((factor) => {
                  const detail = factorDetail(factor.code, factor.detail, text)
                  return (
                    <li key={factor.code} className={styles.factor}>
                      <span>
                        {word(text.labels.factors, factor.code)}
                        {detail && ` (${detail})`}
                      </span>
                      <span className={styles.points}>{factor.points === 1 ? text.complexity.pointsOne : fill(text.complexity.points, { points: factor.points })}</span>
                    </li>
                  )
                })}
              </ul>
              <p className={styles.small}>{fill(text.complexity.thresholds, thresholds)}</p>
            </details>
          )}
        </>
      )}
      {unknown.length > 0 && <p className={styles.small}>{fill(text.complexity.unknown, { list: unknown.map((key) => word(text.labels.signals, key)).join(', ') })}</p>}
      <p className={styles.small}>{text.complexity.notEstimate}</p>
    </section>
  )
}
