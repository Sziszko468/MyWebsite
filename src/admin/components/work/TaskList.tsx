import { useState } from 'react'
import { Link } from 'react-router'
import { TASK_STATUSES, type BulkResult, type Task, type TaskStatus } from '../../api/work'
import { fill, useInterfaceLanguage, useText } from '../../i18n'
import styles from '../../styles/ui.module.scss'
import w from '../../styles/work.module.scss'
import { AdminButton } from '../AdminButton'
import { SelectField } from '../form'
import { dayText, PRIORITY_TONE, Tag, taskPath, TASK_TONE } from './parts'

/** The tasks as a table, with a selection and one status for all of it: each task is moved on its own, and the answer says which could not move and why. */

export function TaskList({ projectId, tasks, onBulk, busy }: { projectId: string; tasks: Task[]; onBulk: (ids: string[], status: TaskStatus) => Promise<BulkResult[]>; busy: boolean }) {
  const t = useText().work
  const language = useInterfaceLanguage()
  const [selected, setSelected] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [report, setReport] = useState<string | null>(null)
  const all = tasks.length > 0 && tasks.every((task) => selected.includes(task.id))
  const chosen = selected.filter((id) => tasks.some((task) => task.id === id))

  async function apply() {
    if (!status || chosen.length === 0) return
    const results = await onBulk(chosen, status as TaskStatus)
    const failed = results.filter((entry) => !entry.ok)
    setSelected(failed.map((entry) => entry.id))
    const reasons = failed.map((entry) => `${tasks.find((task) => task.id === entry.id)?.title ?? entry.id}: ${(t.list.reasons as Record<string, string>)[entry.reason ?? ''] ?? entry.reason ?? ''}`)
    setReport([fill(failed.length === results.length ? t.list.bulkNone : t.list.bulkDone, { moved: results.length - failed.length, failed: failed.length, count: failed.length }), ...reasons].join(' · '))
  }

  return (
    <div className={w.fit}>
      {chosen.length > 0 && (
        <div className={w.bulk} role="group" aria-label={fill(t.list.selected, { count: chosen.length })}>
          <strong>{fill(t.list.selected, { count: chosen.length })}</strong>
          <SelectField label={t.list.bulkStatus} value={status} onChange={(event) => setStatus(event.target.value)} options={[{ value: '', label: t.list.choose }, ...TASK_STATUSES.map((value) => ({ value, label: t.statuses[value] }))]} />
          <AdminButton variant="primary" onClick={() => void apply()} disabled={!status} loading={busy}>
            {t.list.apply}
          </AdminButton>
        </div>
      )}
      {report && (
        <p className={styles.notice} role="status">
          {report}
        </p>
      )}
      <div className={w.listWrap} tabIndex={0} role="region" aria-label={t.list.caption}>
        <table className={w.listTable}>
          <caption className={styles.srOnly}>{t.list.caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={w.checkCell}>
                <input type="checkbox" checked={all} aria-label={t.list.selectAll} onChange={(event) => setSelected(event.target.checked ? tasks.map((task) => task.id) : [])} />
              </th>
              <th scope="col">{t.list.columns.task}</th>
              <th scope="col">{t.list.columns.status}</th>
              <th scope="col">{t.list.columns.priority}</th>
              <th scope="col">{t.list.columns.due}</th>
              <th scope="col">{t.list.columns.assignee}</th>
              <th scope="col">{t.list.columns.customer}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td className={w.checkCell}>
                  <input type="checkbox" checked={selected.includes(task.id)} aria-label={fill(t.list.selectRow, { title: task.title })} onChange={(event) => setSelected(event.target.checked ? [...selected, task.id] : selected.filter((id) => id !== task.id))} />
                </td>
                <td>
                  <div className={styles.cellMain}>
                    <Link to={taskPath(projectId, task.id)} className={styles.cellLink}>
                      <span className={styles.cellTitle}>{task.title}</span>
                    </Link>
                    <span className={styles.mono}>{task.reference}</span>
                  </div>
                </td>
                <td>
                  <Tag tone={TASK_TONE[task.status]}>{t.statuses[task.status]}</Tag>
                </td>
                <td>
                  <Tag tone={PRIORITY_TONE[task.priority]}>{t.priorities[task.priority]}</Tag>
                </td>
                <td>
                  {task.due_on ? dayText(task.due_on, language) : t.list.none}
                  {task.overdue && <span className={w.late}> · {t.card.overdue}</span>}
                </td>
                <td>{task.assigneeEmail ?? t.list.none}</td>
                <td>{task.customer_visible ? t.list.yes : t.list.no}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
