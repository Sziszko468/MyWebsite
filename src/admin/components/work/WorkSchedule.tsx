import { useMemo } from 'react'
import { Link } from 'react-router'
import { buildSchedule, type ScheduleInput } from '../../../utils/schedule'
import type { Task, WorkMilestone } from '../../api/work'
import { fill, useInterfaceLanguage, useText } from '../../i18n'
import styles from '../../styles/ui.module.scss'
import w from '../../styles/work.module.scss'
import { dayText, taskPath } from './parts'

/**
 * The schedule: every task and milestone that has a date, in time order. The arithmetic is shared with the customer's page (src/utils/schedule.ts); "today" is the
 * server's, in the owner's zone, so what is overdue here is what is overdue there. Each row is text first (title, dates, whether it is late) and the bar is a picture
 * of that text, so nothing depends on seeing it; below 48 rem the bar sits under the words.
 */

export function WorkSchedule({ projectId, tasks, milestones, today }: { projectId: string; tasks: Task[]; milestones: WorkMilestone[]; today: string }) {
  const t = useText().work
  const language = useInterfaceLanguage()
  const schedule = useMemo(() => {
    const items: ScheduleInput[] = [
      ...tasks.map((task): ScheduleInput => ({ id: `t:${task.id}`, title: task.title, startOn: task.start_on, dueOn: task.due_on, done: task.status === 'completed', cancelled: task.status === 'cancelled', kind: 'task', meta: task.id })),
      ...milestones.map((milestone): ScheduleInput => ({ id: `m:${milestone.id}`, title: milestone.title, startOn: null, dueOn: milestone.due_on, done: milestone.status === 'completed', cancelled: milestone.status === 'cancelled', kind: 'milestone' })),
    ]
    return buildSchedule(items, today)
  }, [tasks, milestones, today])

  if (!schedule.range && schedule.unscheduled.length === 0) return <p className={w.hint}>{t.schedule.empty}</p>
  return (
    <div className={w.schedule}>
      <p className={w.hint}>{t.schedule.lead}</p>
      {schedule.range && <p className={w.hint}>{fill(t.schedule.range, { from: dayText(schedule.range.from, language), to: dayText(schedule.range.to, language) })}</p>}
      <ol className={w.scheduleRows} aria-label={t.schedule.chart}>
        {schedule.rows.map((row) => (
          <li key={row.id} className={w.scheduleRow}>
            <div className={w.scheduleText}>
              <span className={w.kind}>{t.schedule.kinds[row.kind]}</span>
              {row.kind === 'task' && row.meta ? (
                <Link to={taskPath(projectId, row.meta)} className={styles.cellLink}>
                  {row.title}
                </Link>
              ) : (
                <span>{row.title}</span>
              )}
              <span className={w.hint}>
                {row.point || row.from === row.to ? dayText(row.from, language) : fill(t.schedule.span, { from: dayText(row.from, language), to: dayText(row.to, language) })}
                {row.overdue ? <strong className={w.late}> · {t.schedule.overdue}</strong> : null}
              </span>
            </div>
            <div className={w.track} aria-hidden="true">
              {schedule.ticks.map((tick) => (
                <span key={tick.at} className={w.tick} style={{ left: `${tick.left}%` }} />
              ))}
              {schedule.today !== null && <span className={w.todayLine} style={{ left: `${schedule.today}%` }} />}
              <span className={w.fill} data-kind={row.kind} data-done={row.done} data-overdue={row.overdue} style={{ left: `${row.left}%`, width: `${row.width}%` }} />
            </div>
          </li>
        ))}
      </ol>
      {schedule.today !== null && <p className={w.hint}>{`${t.schedule.today}: ${dayText(today, language)}`}</p>}
      {schedule.unscheduled.length > 0 && (
        <div className={w.fit}>
          <h2 className={styles.sectionTitle}>{t.schedule.unscheduled}</h2>
          <ul className={w.links}>
            {schedule.unscheduled.map((item) => (
              <li key={item.id}>
                <span>
                  <span className={w.kind}>{t.schedule.kinds[item.kind ?? 'task']}</span>{' '}
                  {item.kind === 'task' && item.meta ? (
                    <Link to={taskPath(projectId, item.meta)} className={styles.cellLink}>
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
