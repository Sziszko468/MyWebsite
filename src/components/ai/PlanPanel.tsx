import { useId, useState, type FormEvent } from 'react'
import { AiError } from '../../ai/client'
import { controlRoom, useControlRoom } from '../../ai/controlRoom'
import { useAiText } from '../../ai/useAiText'
import { fill } from '../../utils/format'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { DiscoveryPanel } from './discovery/DiscoveryPanel'
import { SendForm } from './SendForm'
import styles from './Plan.module.scss'

/**
 * The project plan the visitor and the assistant build together, and the one way a plan becomes a quote request. The plan is
 * the server's: this panel shows it, lets the visitor edit or restart it, and holds the form where they approve sending it. The
 * approval (name, e-mail address, the acknowledgement) goes straight to the server and never through the chat, so the model
 * never sees the visitor's contact details; the assistant is then asked to send, and the server sends only what was approved.
 */

type Plan = Record<string, unknown>

const TEXT_FIELDS = ['projectType', 'businessGoal', 'targetAudience', 'frontend', 'backend', 'database', 'authentication', 'adminDashboard', 'mobile', 'timeline', 'budgetRange', 'overview', 'recommendedSolution'] as const
const LIST_FIELDS = ['requiredFeatures', 'optionalFeatures', 'integrations', 'languages', 'technologyCategories', 'dependencies', 'openQuestions', 'nextSteps'] as const
const MULTILINE = new Set<string>(['overview', 'recommendedSolution', 'businessGoal', 'targetAudience', 'frontend', 'backend', 'database', 'adminDashboard'])
const ORDER = ['overview', 'projectType', 'businessGoal', 'targetAudience', 'recommendedSolution', 'requiredFeatures', 'optionalFeatures', 'frontend', 'backend', 'database', 'authentication', 'adminDashboard', 'integrations', 'languages', 'mobile', 'technologyCategories', 'dependencies', 'timeline', 'budgetRange', 'complexity', 'openQuestions', 'nextSteps'] as const

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')
const asList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

/** The plan side of the assistant: the structured project discovery when it is on (the default), the older free-form plan otherwise. */
export function PlanPanel({ onAsk }: { onAsk?: () => void }) {
  const { config } = useControlRoom()
  return config?.discoveryEnabled === true ? <DiscoveryPanel onAsk={onAsk} /> : <LegacyPlanPanel onAsk={onAsk} />
}

/** The older, free-form plan panel: used when the structured project discovery is switched off. */
function LegacyPlanPanel({ onAsk }: { onAsk?: () => void }) {
  const room = useControlRoom()
  const text = useAiText()
  const plan = room.plan?.plan as Plan | null | undefined
  const state = room.plan
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const busy = room.status === 'submitted' || room.status === 'streaming'

  if (!state || !plan) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.title}>{text.plan.title}</h2>
        <p className={styles.lead}>{text.plan.empty}</p>
        <button
          type="button"
          className={styles.primary}
          disabled={busy}
          onClick={() => {
            onAsk?.()
            void controlRoom.send(text.plan.startPrompt)
          }}
        >
          {text.plan.start}
        </button>
      </div>
    )
  }

  const label = (field: string) => (text.plan.fields as Record<string, string>)[field] ?? field
  const complexity = (text.plan.complexity as Record<string, string>)[asText(plan.complexity)] ?? asText(plan.complexity)
  const filled = ORDER.filter((field) => (field === 'complexity' ? plan.complexity !== 'unsure' || state.ready : Array.isArray(plan[field]) ? asList(plan[field]).length > 0 : asText(plan[field]) !== ''))

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>{text.plan.title}</h2>
        <span className={styles.version}>{fill(text.plan.version, { version: state.version })}</span>
      </div>
      <p className={styles.lead}>{text.plan.lead}</p>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {editing ? (
        <PlanForm
          plan={plan}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            setNotice(text.plan.saved)
          }}
        />
      ) : (
        <>
          <dl className={styles.fields}>
            {filled.map((field) => (
              <div key={field} className={styles.field}>
                <dt>{label(field)}</dt>
                <dd>
                  {field === 'complexity' ? (
                    complexity
                  ) : Array.isArray(plan[field]) ? (
                    <ul>
                      {asList(plan[field]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    asText(plan[field])
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className={styles.small}>{text.plan.complexityNote}</p>
          {!state.ready && state.missing.length > 0 && <p className={styles.missing}>{fill(text.plan.needsMore, { fields: state.missing.map(label).join(', ') })}</p>}
          {state.ready && !state.sent && <p className={styles.ready}>{text.plan.ready}</p>}
          {!state.sent && (
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => setEditing(true)}>
                {text.plan.edit}
              </button>
              <RestartButton disabled={busy} />
            </div>
          )}
        </>
      )}

      {state.sent ? (
        <p className={styles.sent} role="status">
          {fill(text.send.sent, { reference: state.reference ?? '' })}
        </p>
      ) : (
        state.ready && !editing && room.config?.quoteEnabled && <SendForm key={state.version} />
      )}
      {state.ready && !state.sent && !editing && room.config && !room.config.quoteEnabled && (
        <p className={styles.small}>
          {text.send.disabled}{' '}
          <LocalizedLink to="/services/configure" className={styles.link}>
            {text.send.form}
          </LocalizedLink>
        </p>
      )}
    </div>
  )
}

function RestartButton({ disabled }: { disabled: boolean }) {
  const text = useAiText()
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button type="button" className={styles.ghost} disabled={disabled} onClick={() => setAsking(true)}>
        {text.plan.restart}
      </button>
    )
  return (
    <span className={styles.confirm} role="group" aria-label={text.plan.restartConfirm}>
      <span>{text.plan.restartConfirm}</span>
      <button type="button" className={styles.danger} onClick={() => void controlRoom.startOverPlan().finally(() => setAsking(false))}>
        {text.plan.restart}
      </button>
      <button type="button" className={styles.ghost} onClick={() => setAsking(false)}>
        {text.plan.cancel}
      </button>
    </span>
  )
}

function PlanForm({ plan, onCancel, onSaved }: { plan: Plan; onCancel: () => void; onSaved: () => void }) {
  const text = useAiText()
  const id = useId()
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, asText(plan[field])])),
    ...Object.fromEntries(LIST_FIELDS.map((field) => [field, asList(plan[field]).join('\n')])),
    complexity: asText(plan.complexity) || 'unsure',
  }))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setProblem(null)
    setFields({})
    const body: Record<string, unknown> = { complexity: values.complexity }
    for (const field of TEXT_FIELDS) body[field] = values[field]
    for (const field of LIST_FIELDS) body[field] = values[field].split('\n').map((line) => line.trim()).filter(Boolean)
    try {
      await controlRoom.editPlan(body)
      onSaved()
    } catch (error) {
      if (error instanceof AiError && error.status === 409) setProblem(text.plan.conflict)
      else if (error instanceof AiError && error.status === 422) {
        setProblem(text.plan.invalid)
        setFields(error.fields)
      } else setProblem(text.errors.generic)
      if (error instanceof AiError && error.status === 409) void controlRoom.refreshPlan()
    } finally {
      setBusy(false)
    }
  }
  const label = (field: string) => (text.plan.fields as Record<string, string>)[field] ?? field
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      {[...TEXT_FIELDS, ...LIST_FIELDS].map((field) => {
        const list = (LIST_FIELDS as readonly string[]).includes(field)
        const long = list || MULTILINE.has(field)
        return (
          <div key={field} className={styles.control}>
            <label htmlFor={`${id}-${field}`}>
              {label(field)}
              {list && <span className={styles.small}> · {text.plan.onePerLine}</span>}
            </label>
            {long ? (
              <textarea id={`${id}-${field}`} rows={list ? 3 : 2} value={values[field]} aria-invalid={fields[field] ? true : undefined} onChange={(event) => setValues({ ...values, [field]: event.target.value })} />
            ) : (
              <input id={`${id}-${field}`} type="text" value={values[field]} aria-invalid={fields[field] ? true : undefined} onChange={(event) => setValues({ ...values, [field]: event.target.value })} />
            )}
          </div>
        )
      })}
      <div className={styles.control}>
        <label htmlFor={`${id}-complexity`}>{label('complexity')}</label>
        <select id={`${id}-complexity`} value={values.complexity} onChange={(event) => setValues({ ...values, complexity: event.target.value })}>
          {Object.entries(text.plan.complexity).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? text.plan.saving : text.plan.save}
        </button>
        <button type="button" className={styles.ghost} disabled={busy} onClick={onCancel}>
          {text.plan.cancel}
        </button>
      </div>
    </form>
  )
}
