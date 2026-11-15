import { useState } from 'react'
import { MILESTONE_STATUSES, type MilestoneStatus, type WorkMilestone } from '../../api/work'
import { fill, useInterfaceLanguage, useText } from '../../i18n'
import styles from '../../styles/ui.module.scss'
import w from '../../styles/work.module.scss'
import { AdminButton } from '../AdminButton'
import { useConfirm } from '../Confirm'
import { CheckField, SelectField, TextAreaField, TextField } from '../form'
import { dayText, MILESTONE_TONE, Tag } from './parts'

/**
 * The milestones: a title, a description, a target date, a status and whether the customer sees it. A completed milestone cannot be changed back (the history already
 * says it was done); completing one never completes its tasks, and the panel says so. A hidden milestone is the owner's alone and is not in the customer's count.
 */

interface Draft {
  title: string
  description: string
  dueOn: string
  status: MilestoneStatus
  customerVisible: boolean
}

const draftOf = (milestone: WorkMilestone): Draft => ({ title: milestone.title, description: milestone.description ?? '', dueOn: milestone.due_on ?? '', status: milestone.status, customerVisible: milestone.customer_visible === 1 })

function MilestoneCard({ milestone, busy, errors, onSave, onRemove }: { milestone: WorkMilestone; busy: string | null; errors: Record<string, string>; onSave: (id: string, draft: Draft) => void; onRemove: (milestone: WorkMilestone) => void }) {
  const t = useText().work
  const language = useInterfaceLanguage()
  const [draft, setDraft] = useState<Draft>(() => draftOf(milestone))
  const locked = milestone.status === 'completed'
  return (
    <li className={w.milestone}>
      <div className={w.milestoneHead}>
        <strong>{milestone.title}</strong>
        <span className={styles.rowTight}>
          <Tag tone={MILESTONE_TONE[milestone.status]}>{t.milestoneStatuses[milestone.status]}</Tag>
          {milestone.customer_visible === 0 && <Tag tone="neutral">{t.milestones.hidden}</Tag>}
        </span>
      </div>
      <p className={w.hint}>
        {fill(t.milestones.tasks, { done: milestone.completedTasks, total: milestone.tasks })}
        {milestone.completed_at ? ` · ${fill(t.milestones.completedAt, { date: dayText(milestone.completed_at.slice(0, 10), language) })}` : ''}
      </p>
      <form
        className={styles.stack}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          onSave(milestone.id, draft)
        }}
      >
        <div className={styles.formGrid}>
          <TextField label={t.milestones.name} value={draft.title} maxLength={120} error={errors.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <TextField label={t.milestones.due} type="date" optional value={draft.dueOn} error={errors.dueOn} onChange={(event) => setDraft({ ...draft, dueOn: event.target.value })} />
          <SelectField
            label={t.milestones.status}
            value={draft.status}
            disabled={locked}
            onChange={(event) => setDraft({ ...draft, status: event.target.value as MilestoneStatus })}
            options={MILESTONE_STATUSES.map((value) => ({ value, label: t.milestoneStatuses[value] }))}
          />
        </div>
        <TextAreaField label={t.milestones.description} optional rows={2} maxLength={1000} value={draft.description} error={errors.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        <CheckField label={t.milestones.visible} checked={draft.customerVisible} onChange={(checked) => setDraft({ ...draft, customerVisible: checked })} />
        {locked && <p className={w.hint}>{t.milestones.completeNote}</p>}
        <div className={styles.formActions}>
          <AdminButton type="submit" loading={busy === `save-${milestone.id}`}>
            {t.milestones.save}
          </AdminButton>
          {!locked && (
            <AdminButton variant="text" danger onClick={() => onRemove(milestone)}>
              {t.milestones.remove}
            </AdminButton>
          )}
        </div>
      </form>
    </li>
  )
}

export function MilestonesPanel({
  milestones,
  busy,
  errors,
  onAdd,
  onSave,
  onRemove,
}: {
  milestones: WorkMilestone[]
  busy: string | null
  errors: Record<string, string>
  onAdd: (draft: { title: string; description: string; dueOn: string; customerVisible: boolean }) => Promise<boolean>
  onSave: (id: string, draft: Draft) => void
  onRemove: (milestone: WorkMilestone) => Promise<void> | void
}) {
  const t = useText().work
  const confirm = useConfirm()
  const [fresh, setFresh] = useState({ title: '', description: '', dueOn: '', customerVisible: true })
  return (
    <div className={w.fit}>
      <p className={w.hint}>{t.milestones.lead}</p>
      {milestones.length === 0 ? (
        <p className={styles.muted}>{t.milestones.empty}</p>
      ) : (
        <ul className={w.cards}>
          {milestones.map((milestone) => (
            <MilestoneCard
              key={`${milestone.id}-${milestone.status}-${milestone.customer_visible}`}
              milestone={milestone}
              busy={busy}
              errors={errors}
              onSave={onSave}
              onRemove={async (entry) => {
                if (await confirm({ title: t.milestones.removeTitle, body: t.milestones.removeBody, confirmLabel: t.milestones.remove, danger: true })) await onRemove(entry)
              }}
            />
          ))}
        </ul>
      )}
      <form
        className={styles.stack}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void onAdd(fresh).then((ok) => {
            if (ok) setFresh({ title: '', description: '', dueOn: '', customerVisible: true })
          })
        }}
      >
        <h2 className={styles.sectionTitle}>{t.milestones.add}</h2>
        <div className={styles.formGrid}>
          <TextField label={t.milestones.name} value={fresh.title} maxLength={120} error={errors.title} onChange={(event) => setFresh({ ...fresh, title: event.target.value })} />
          <TextField label={t.milestones.due} type="date" optional value={fresh.dueOn} error={errors.dueOn} onChange={(event) => setFresh({ ...fresh, dueOn: event.target.value })} />
        </div>
        <TextAreaField label={t.milestones.description} optional rows={2} maxLength={1000} value={fresh.description} onChange={(event) => setFresh({ ...fresh, description: event.target.value })} />
        <CheckField label={t.milestones.visible} checked={fresh.customerVisible} onChange={(checked) => setFresh({ ...fresh, customerVisible: checked })} />
        <div className={styles.formActions}>
          <AdminButton type="submit" variant="primary" loading={busy === 'add-milestone'}>
            {t.milestones.add}
          </AdminButton>
        </div>
      </form>
    </div>
  )
}
