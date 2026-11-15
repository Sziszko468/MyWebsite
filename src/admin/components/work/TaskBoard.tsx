import { useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { TASK_STATUSES, type Task, type TaskStatus } from '../../api/work'
import { fill, useInterfaceLanguage, useText } from '../../i18n'
import styles from '../../styles/ui.module.scss'
import w from '../../styles/work.module.scss'
import { dayText, needsReview, PRIORITY_TONE, Tag, taskPath } from './parts'

/**
 * The board: one column per status. A card moves in three ways, and the first two need no mouse: the menu on the card (a real select, named after the task), the
 * "up" and "down" buttons (the order inside a column), and dragging it to another column. The server decides whether a move is allowed (the card says what it
 * answered); the board never assumes one worked.
 */

export function TaskBoard({
  projectId,
  tasks,
  allowed,
  onMove,
  onReorder,
}: {
  projectId: string
  tasks: Task[]
  allowed: Record<TaskStatus, TaskStatus[]>
  onMove: (task: Task, status: TaskStatus) => void
  onReorder: (ids: string[]) => void
}) {
  const t = useText().work
  const language = useInterfaceLanguage()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)

  const drop = (event: DragEvent, status: TaskStatus) => {
    event.preventDefault()
    setOver(null)
    const id = event.dataTransfer.getData('text/plain') || dragging
    setDragging(null)
    const task = tasks.find((entry) => entry.id === id)
    if (task && task.status !== status) onMove(task, status)
  }

  return (
    <div className={w.fit}>
      <p className={w.hint}>{t.board.drag}</p>
      <ul className={w.board} aria-label={t.board.label}>
        {TASK_STATUSES.map((status) => {
          const inColumn = tasks.filter((task) => task.status === status)
          return (
            <li
              key={status}
              className={w.column}
              data-over={over === status}
              onDragOver={(event) => {
                if (dragging) {
                  event.preventDefault()
                  setOver(status)
                }
              }}
              onDragLeave={() => setOver((current) => (current === status ? null : current))}
              onDrop={(event) => drop(event, status)}
            >
              <h2 className={w.columnTitle} id={`column-${status}`}>
                <span>{t.statuses[status]}</span>
                <span className={w.count}>{inColumn.length}</span>
              </h2>
              {inColumn.length === 0 ? (
                <p className={w.hint}>{t.board.empty}</p>
              ) : (
                <ul className={w.cards} aria-labelledby={`column-${status}`}>
                  {inColumn.map((task, index) => (
                    <li
                      key={task.id}
                      className={w.card}
                      draggable
                      data-dragging={dragging === task.id}
                      data-attention={needsReview(task)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', task.id)
                        event.dataTransfer.effectAllowed = 'move'
                        setDragging(task.id)
                      }}
                      onDragEnd={() => {
                        setDragging(null)
                        setOver(null)
                      }}
                    >
                      <h3 className={w.cardTitle}>
                        <Link to={taskPath(projectId, task.id)} className={w.cardLink}>
                          {task.title}
                        </Link>
                      </h3>
                      <p className={w.meta}>
                        <span className={styles.mono}>{task.reference}</span>
                        <Tag tone={PRIORITY_TONE[task.priority]}>{t.priorities[task.priority]}</Tag>
                      </p>
                      <p className={w.meta}>
                        {task.due_on && <span>{fill(t.card.due, { date: dayText(task.due_on, language) })}</span>}
                        {task.overdue && <span className={w.late}>{t.card.overdue}</span>}
                        <span>{task.customer_visible ? t.card.shared : t.card.private}</span>
                        <span>{task.assigneeEmail ? fill(t.card.assigned, { name: task.assigneeEmail }) : t.card.unassigned}</span>
                      </p>
                      {task.blockedBy.length > 0 && <p className={w.meta}>{fill(t.card.waitingFor, { titles: task.blockedBy.map((entry) => entry.title).join(', ') })}</p>}
                      {task.requiresCustomerAction && <p className={w.meta}><Tag tone="warning">{t.card.needsCustomer}</Tag></p>}
                      {needsReview(task) && <p className={w.meta}><Tag tone="accent">{t.card.needsReview}</Tag></p>}
                      <div className={w.controls}>
                        <select
                          className={w.move}
                          aria-label={fill(t.board.moveLabel, { title: task.title })}
                          value=""
                          onChange={(event) => {
                            const next = event.target.value as TaskStatus
                            if (next) onMove(task, next)
                          }}
                        >
                          <option value="">{t.board.moveTo}</option>
                          {allowed[task.status].map((next) => (
                            <option key={next} value={next}>
                              {t.statuses[next]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={w.small}
                          aria-label={fill(t.board.upLabel, { title: task.title })}
                          disabled={index === 0}
                          onClick={() => {
                            const ids = inColumn.map((entry) => entry.id)
                            ;[ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]
                            onReorder(ids)
                          }}
                        >
                          <span aria-hidden="true">↑</span>
                          <span className={styles.srOnly}>{t.board.up}</span>
                        </button>
                        <button
                          type="button"
                          className={w.small}
                          aria-label={fill(t.board.downLabel, { title: task.title })}
                          disabled={index === inColumn.length - 1}
                          onClick={() => {
                            const ids = inColumn.map((entry) => entry.id)
                            ;[ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]
                            onReorder(ids)
                          }}
                        >
                          <span aria-hidden="true">↓</span>
                          <span className={styles.srOnly}>{t.board.down}</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
