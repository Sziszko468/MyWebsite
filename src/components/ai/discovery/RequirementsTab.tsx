import { useId, useRef, useState, type FormEvent } from 'react'
import { controlRoom } from '../../../ai/controlRoom'
import { CATEGORIES, LIMITS, PRIORITIES, PRIORITY_ORDER, REQUIREMENT_COMPLEXITIES, type Category, type DiscoveryState, type Priority, type Requirement, type RequirementComplexity } from '../../../ai/discoveryModel'
import { useDiscoveryText, word, type DiscoveryWords } from '../../../ai/useDiscoveryText'
import { cx } from '../../../utils/cx'
import { fill } from '../../../utils/format'
import styles from './Discovery.module.scss'

interface TabProps {
  state: DiscoveryState
  locked: boolean
  fields: Record<string, string>
}

/**
 * The requirements, grouped by how essential they are. Each card says who wrote it and whether the visitor confirmed it: what the assistant
 * suggests stays a suggestion until the visitor says so, and what the visitor wrote is theirs. Every card can be confirmed, rejected (and
 * restored), edited, re-prioritised, moved to "later" and deleted; a new requirement can be added by hand.
 */
export function RequirementsTab({ state, locked, fields }: TabProps) {
  const text = useDiscoveryText()
  const heading = useRef<HTMLHeadingElement>(null)
  const live = state.requirements.filter((item) => item.status !== 'rejected')
  const rejected = state.requirements.filter((item) => item.status === 'rejected')
  const unconfirmed = live.filter((item) => item.status === 'unconfirmed').length

  return (
    <div className={styles.tabPanel}>
      <div>
        <h3 className={styles.sectionTitle} ref={heading} tabIndex={-1}>
          {text.requirements.title}
        </h3>
        <p className={styles.small}>{text.requirements.lead}</p>
        {unconfirmed > 0 && (
          <p className={styles.notice} role="status">
            {fill(text.requirements.unconfirmedCount, { count: unconfirmed })}
          </p>
        )}
      </div>

      {state.requirements.length === 0 && <p className={styles.notice}>{text.requirements.empty}</p>}

      {PRIORITY_ORDER.map((priority) => {
        const items = live.filter((item) => item.priority === priority)
        if (items.length === 0) return null
        return (
          <section key={priority} className={styles.group} aria-label={fill(text.requirements.groupLabel, { priority: text.labels.priorities[priority] })}>
            <h4 className={styles.groupTitle}>
              {text.labels.priorities[priority]} <span className={cx(styles.small, styles.muted)}>{text.requirements.priorityHelp[priority]}</span>
            </h4>
            <ul className={styles.list}>
              {items.map((item) => (
                <RequirementCard key={item.id} item={item} all={state.requirements} locked={locked} fields={fields} onRemoved={() => heading.current?.focus()} />
              ))}
            </ul>
          </section>
        )
      })}

      {rejected.length > 0 && (
        <section className={styles.group} aria-label={text.requirements.status.rejected}>
          <h4 className={styles.groupTitle}>{text.requirements.status.rejected}</h4>
          <ul className={styles.list}>
            {rejected.map((item) => (
              <RequirementCard key={item.id} item={item} all={state.requirements} locked={locked} fields={fields} onRemoved={() => heading.current?.focus()} />
            ))}
          </ul>
        </section>
      )}

      <AddRequirement locked={locked} fields={fields} />
    </div>
  )
}

function originLabel(item: Requirement, text: DiscoveryWords): { label: string; className: string } {
  if (item.origin === 'visitor') return { label: text.requirements.origin.visitor, className: styles.badge }
  if (item.status === 'confirmed') return { label: text.facts.confirmedAi, className: cx(styles.badge, styles.badgeOk) }
  return { label: item.basis === 'stated' ? text.requirements.origin.stated : text.requirements.origin.suggested, className: cx(styles.badge, styles.badgeAi) }
}

function RequirementCard({ item, all, locked, fields, onRemoved }: { item: Requirement; all: Requirement[]; locked: boolean; fields: Record<string, string>; onRemoved: () => void }) {
  const text = useDiscoveryText()
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const origin = originLabel(item, text)
  const dependencies = item.dependsOn.map((id) => all.find((other) => other.id === id)?.title).filter((title): title is string => title !== undefined)
  const rejected = item.status === 'rejected'

  if (editing)
    return (
      <li className={styles.req}>
        <RequirementForm
          initial={item}
          locked={locked}
          fields={fields}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const { ok } = await controlRoom.discoveryChange(item.id, values)
            if (ok) setEditing(false)
          }}
        />
      </li>
    )

  return (
    <li className={cx(styles.req, item.status === 'unconfirmed' && styles.reqPending, item.status === 'confirmed' && styles.reqConfirmed, rejected && styles.reqRejected)}>
      <p className={styles.reqTitle}>{item.title}</p>
      <div className={styles.chips}>
        <span className={origin.className}>{origin.label}</span>
        <span className={cx(styles.badge, item.status === 'confirmed' && styles.badgeOk, rejected && styles.badgeOff)}>{text.requirements.status[item.status]}</span>
        <span className={styles.badge}>{item.required ? text.requirements.kind.required : text.requirements.kind.optional}</span>
        <span className={styles.badge}>{word(text.labels.categories, item.category)}</span>
        <span className={styles.badge}>
          {text.requirements.complexityName}: {text.requirements.complexityValues[item.complexity]}
        </span>
      </div>
      {item.description && <p className={styles.reqText}>{item.description}</p>}
      {dependencies.length > 0 && <p className={styles.small}>{fill(text.requirements.dependsOn, { list: dependencies.join(', ') })}</p>}

      <div className={styles.actions}>
        {item.status === 'unconfirmed' && (
          <button type="button" className={cx(styles.primary, styles.compact)} disabled={locked} aria-label={`${text.requirements.actions.confirm}: ${item.title}`} onClick={() => void controlRoom.discoveryChange(item.id, { status: 'confirmed' })}>
            {text.requirements.actions.confirm}
          </button>
        )}
        {rejected ? (
          <button type="button" className={cx(styles.secondary, styles.compact)} disabled={locked} aria-label={`${text.requirements.actions.restore}: ${item.title}`} onClick={() => void controlRoom.discoveryChange(item.id, { status: item.origin === 'visitor' ? 'confirmed' : 'unconfirmed' })}>
            {text.requirements.actions.restore}
          </button>
        ) : (
          <button type="button" className={cx(styles.secondary, styles.compact)} disabled={locked} aria-label={`${text.requirements.actions.reject}: ${item.title}`} onClick={() => void controlRoom.discoveryChange(item.id, { status: 'rejected' })}>
            {text.requirements.actions.reject}
          </button>
        )}
        {!rejected && (
          <button type="button" className={cx(styles.secondary, styles.compact)} disabled={locked} aria-label={`${text.requirements.actions.edit}: ${item.title}`} onClick={() => setEditing(true)}>
            {text.requirements.actions.edit}
          </button>
        )}
        {!rejected && item.priority !== 'future' && (
          <button type="button" className={cx(styles.ghost, styles.compact)} disabled={locked} aria-label={`${text.requirements.actions.later}: ${item.title}`} onClick={() => void controlRoom.discoveryChange(item.id, { priority: 'future' })}>
            {text.requirements.actions.later}
          </button>
        )}
        {!rejected && <PriorityPicker item={item} locked={locked} />}
        {removing ? (
          <span className={styles.confirm} role="group" aria-label={text.requirements.actions.removeConfirm}>
            <span>{text.requirements.actions.removeConfirm}</span>
            <button
              type="button"
              className={cx(styles.danger, styles.compact)}
              disabled={locked}
              onClick={() =>
                void controlRoom.discoveryRemove(item.id).then(({ ok }) => {
                  if (ok) onRemoved()
                  else setRemoving(false)
                })
              }
            >
              {text.requirements.actions.remove}
            </button>
            <button type="button" className={cx(styles.ghost, styles.compact)} onClick={() => setRemoving(false)}>
              {text.requirements.actions.cancel}
            </button>
          </span>
        ) : (
          <button type="button" className={cx(styles.ghost, styles.compact)} disabled={locked} aria-label={`${text.requirements.actions.remove}: ${item.title}`} onClick={() => setRemoving(true)}>
            {text.requirements.actions.remove}
          </button>
        )}
      </div>
    </li>
  )
}

function PriorityPicker({ item, locked }: { item: Requirement; locked: boolean }) {
  const text = useDiscoveryText()
  const id = useId()
  return (
    <span className={styles.inline}>
      <label htmlFor={id} className={styles.small}>
        {text.requirements.form.priority}
      </label>
      <select id={id} value={item.priority} disabled={locked} aria-label={`${text.requirements.form.priority}: ${item.title}`} onChange={(event) => void controlRoom.discoveryChange(item.id, { priority: event.target.value as Priority })}>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {text.labels.priorities[priority]}
          </option>
        ))}
      </select>
    </span>
  )
}

// ---- the form (to add, and to edit) ----

interface FormValues {
  title: string
  description: string
  category: Category
  priority: Priority
  required: boolean
  complexity: RequirementComplexity
}

function RequirementForm({ initial, locked, fields, submitLabel, busyLabel, onSubmit, onCancel }: { initial?: Requirement; locked: boolean; fields: Record<string, string>; submitLabel?: string; busyLabel?: string; onSubmit: (values: FormValues) => Promise<void>; onCancel?: () => void }) {
  const text = useDiscoveryText()
  const id = useId()
  const [values, setValues] = useState<FormValues>(() => ({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? 'other',
    priority: initial?.priority ?? 'important',
    required: initial?.required ?? false,
    complexity: initial?.complexity ?? 'medium',
  }))
  const [missing, setMissing] = useState(false)
  // An essential requirement is always required and a future consideration never is: the server applies the same rule, the checkbox shows it.
  const required = values.priority === 'essential' ? true : values.priority === 'future' ? false : values.required

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (values.title.trim() === '') {
      setMissing(true)
      return
    }
    setMissing(false)
    await onSubmit({ ...values, title: values.title.trim(), description: values.description.trim(), required })
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <div className={styles.control}>
        <label htmlFor={`${id}-title`}>{text.requirements.form.name}</label>
        <input id={`${id}-title`} type="text" maxLength={LIMITS.title} value={values.title} disabled={locked} aria-invalid={missing || fields.title ? true : undefined} onChange={(event) => setValues({ ...values, title: event.target.value })} />
      </div>
      <div className={styles.control}>
        <label htmlFor={`${id}-description`}>{text.requirements.form.description}</label>
        <textarea id={`${id}-description`} rows={2} maxLength={LIMITS.description} value={values.description} disabled={locked} aria-invalid={fields.description ? true : undefined} onChange={(event) => setValues({ ...values, description: event.target.value })} />
      </div>
      <div className={styles.grid}>
        <div className={styles.control}>
          <label htmlFor={`${id}-category`}>{text.requirements.form.category}</label>
          <select id={`${id}-category`} value={values.category} disabled={locked} onChange={(event) => setValues({ ...values, category: event.target.value as Category })}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {word(text.labels.categories, category)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.control}>
          <label htmlFor={`${id}-priority`}>{text.requirements.form.priority}</label>
          <select id={`${id}-priority`} value={values.priority} disabled={locked} onChange={(event) => setValues({ ...values, priority: event.target.value as Priority })}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {text.labels.priorities[priority]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.control}>
          <label htmlFor={`${id}-complexity`}>{text.requirements.form.complexity}</label>
          <select id={`${id}-complexity`} value={values.complexity} disabled={locked} onChange={(event) => setValues({ ...values, complexity: event.target.value as RequirementComplexity })}>
            {REQUIREMENT_COMPLEXITIES.map((level) => (
              <option key={level} value={level}>
                {text.requirements.complexityValues[level]}
              </option>
            ))}
          </select>
        </div>
        <div className={cx(styles.check, styles.control)}>
          <input id={`${id}-required`} type="checkbox" checked={required} disabled={locked || values.priority === 'essential' || values.priority === 'future'} onChange={(event) => setValues({ ...values, required: event.target.checked })} />
          <label htmlFor={`${id}-required`}>{text.requirements.form.required}</label>
        </div>
      </div>
      {missing && (
        <p className={styles.alert} role="alert">
          {text.errors.invalid}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={locked}>
          {locked ? (busyLabel ?? text.requirements.actions.saving) : (submitLabel ?? text.requirements.actions.save)}
        </button>
        {onCancel && (
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {text.requirements.actions.cancel}
          </button>
        )}
      </div>
    </form>
  )
}

function AddRequirement({ locked, fields }: { locked: boolean; fields: Record<string, string> }) {
  const text = useDiscoveryText()
  // A fresh form after every successful add (the key), so nothing of the last one is left in it.
  const [round, setRound] = useState(0)
  return (
    <details className={cx(styles.card, styles.details)}>
      <summary>{text.requirements.form.title}</summary>
      <RequirementForm
        key={round}
        locked={locked}
        fields={fields}
        submitLabel={text.requirements.form.submit}
        busyLabel={text.requirements.form.adding}
        onSubmit={async (values) => {
          const { ok } = await controlRoom.discoveryAdd(values)
          if (ok) setRound((current) => current + 1)
        }}
      />
    </details>
  )
}
