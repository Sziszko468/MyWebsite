import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TASK_STATUSES, type Category, type Task, type TaskStatus, type WorkMilestone } from '../../api/work'
import { AdminTextProvider } from '../../i18n'
import { en } from '../../i18n/en'
import { hu } from '../../i18n/hu'
import { dayText, needsReview } from './parts'
import { TaskBoard } from './TaskBoard'
import { draftOf, EMPTY_DRAFT, inputOf, TaskFields } from './TaskFields'
import { TaskList } from './TaskList'
import { WorkSchedule } from './WorkSchedule'

/**
 * PROMPT 26, the administration's side of the work, rendered in its own providers: a card can be moved without a mouse (a select and two buttons, each named after the
 * task), the schedule is text first, the list can be selected and has a caption, the form says what the customer will see, and a task is private until shared.
 */

const render = (node: ReactElement, language: 'en' | 'hu' = 'en'): string => renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language, children: node })))
const noop = () => undefined

const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id, reference: `TSK-${id.toUpperCase()}`, project_id: 'p1', title, description: '', customer_description: '', status: 'backlog', priority: 'normal', category_id: null, milestone_id: null, start_on: null, due_on: null, completed_at: null,
  assigned_to: null, customer_visible: 0, sort_order: 1, revision: 1, created_at: '2026-11-03T10:00:00.000Z', updated_at: '2026-11-03T10:00:00.000Z', projectReference: 'PRJ-1', projectName: 'A', assigneeEmail: null, overdue: false,
  blockedBy: [], dependsOn: [], dependents: [], action: null, requiresCustomerAction: false, ...over,
})
const allowed = Object.fromEntries(TASK_STATUSES.map((status) => [status, TASK_STATUSES.filter((to) => to !== status)])) as Record<TaskStatus, TaskStatus[]>
const milestone = (id: string, title: string, dueOn: string | null, status: WorkMilestone['status'] = 'upcoming'): WorkMilestone => ({ id, project_id: 'p1', title, description: null, due_on: dueOn, completed_at: null, status, customer_visible: 1, position: 1, tasks: 0, completedTasks: 0 })

describe('the board', () => {
  const tasks = [task('a', 'Design', { status: 'planned', due_on: '2026-11-10', overdue: true, priority: 'urgent', customer_visible: 1 }), task('b', 'Build', { status: 'planned', blockedBy: [{ id: 'a', reference: 'TSK-A', title: 'Design', status: 'planned' }] }), task('c', 'Review', { status: 'in_review', action: { id: 'x', action_type: 'other', status: 'submitted', revision: 1, submitted_at: null, reviewed_at: null, instruction: 'q' } })]
  const html = render(h(TaskBoard, { projectId: 'p1', tasks, allowed, onMove: noop, onReorder: noop }))

  it('has one column per status, each with its name and its count as a heading', () => {
    for (const status of TASK_STATUSES) expect(html).toContain(`id="column-${status}"`)
    expect((html.match(/<h2 class="[^"]*columnTitle/g) ?? []).length).toBe(TASK_STATUSES.length)
  })

  it('moves a card without a mouse: a select named after the task, and up and down buttons named after it, whatever dragging is also there', () => {
    for (const title of ['Design', 'Build', 'Review']) {
      expect(html).toContain(`aria-label="Move “${title}” to"`)
      expect(html).toContain(`aria-label="Move “${title}” up"`)
      expect(html).toContain(`aria-label="Move “${title}” down"`)
    }
    expect(html).toContain('draggable="true"')
    expect(html).toContain('The menu on each card does the same without a mouse.')
    // The first card of a column cannot go up, the last cannot go down.
    expect(html).toMatch(/aria-label="Move “Design” up" disabled/)
    expect(html).toMatch(/aria-label="Move “Build” down" disabled/)
  })

  it('offers only the statuses the server says are allowed from where the card is', () => {
    const narrow = render(h(TaskBoard, { projectId: 'p1', tasks: [task('a', 'Only', { status: 'completed' })], allowed: { ...allowed, completed: ['planned', 'in_progress'] }, onMove: noop, onReorder: noop }))
    const select = /<select[^>]*>([\s\S]*?)<\/select>/.exec(narrow)![1]
    expect([...select.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1])).toEqual(['', 'planned', 'in_progress'])
  })

  it('says what matters on a card in words: when it is due and late, whether it is shared, what it waits for, what the customer must do or the owner must review', () => {
    expect(html).toContain('Due 10 Nov 2026')
    expect(html).toContain('Overdue')
    expect(html).toContain('Shared with the customer')
    expect(html).toContain('Private')
    expect(html).toContain('Waiting for Design')
    expect(html).toContain('Answer to review')
    expect(needsReview(tasks[2])).toBe(true)
  })

  it('links every card to its page and reads in Hungarian too', () => {
    expect(html).toContain('href="/client-projects/p1/tasks/a"')
    const hungarian = render(h(TaskBoard, { projectId: 'p1', tasks, allowed, onMove: noop, onReorder: noop }), 'hu')
    expect(hungarian).toContain('aria-label="A(z) „Design” áthelyezése ide"')
    expect(hungarian).toContain(hu.work.statuses.planned)
  })
})

describe('the list', () => {
  const tasks = [task('a', 'Design', { customer_visible: 1, assigneeEmail: 'o@x.test', due_on: '2026-11-10' }), task('b', 'Build')]
  const html = render(h(TaskList, { projectId: 'p1', tasks, onBulk: async () => [], busy: false }))

  it('is a table with a caption, headed columns, a checkbox for every row named after its task and one for all', () => {
    expect(html).toContain('<caption class="')
    expect(html).toContain(en.work.list.caption)
    expect((html.match(/<th scope="col"/g) ?? []).length).toBe(7)
    expect(html).toContain('aria-label="Select “Design”"')
    expect(html).toContain('aria-label="Select all shown tasks"')
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('says in words whether a task is shared', () => {
    expect(html).toContain('Shared')
    expect(html).toContain('Private')
  })
})

describe('the schedule', () => {
  it('lists dated work first as text with its dates, then what has no date, and hides the bars from assistive technology', () => {
    const html = render(h(WorkSchedule, { projectId: 'p1', tasks: [task('a', 'Design', { start_on: '2026-11-02', due_on: '2026-11-06' }), task('b', 'Floating')], milestones: [milestone('m', 'Launch', '2026-12-01')], today: '2026-11-03' }))
    expect(html).toContain('2 Nov 2026 to 6 Nov 2026')
    expect(html).toContain('Launch')
    expect(html).toContain('Without a date')
    expect(html).toContain('Floating')
    expect(html).toMatch(/aria-hidden="true"/)
    expect(html).toContain('href="/client-projects/p1/tasks/a"')
  })

  it('says so when nothing has a date, and marks late work in words', () => {
    expect(render(h(WorkSchedule, { projectId: 'p1', tasks: [], milestones: [], today: '2026-11-03' }))).toContain(en.work.schedule.empty)
    expect(render(h(WorkSchedule, { projectId: 'p1', tasks: [task('a', 'Late', { due_on: '2026-10-01' })], milestones: [], today: '2026-11-03' }))).toContain('Overdue')
  })
})

describe('the form', () => {
  const props = { onChange: noop, errors: {}, categories: [] as Category[], milestones: [], assignees: [], withStatus: true }

  it('says what the customer will see next to the fields that decide it, and is private by default', () => {
    expect(EMPTY_DRAFT.customerVisible).toBe(false)
    const html = render(h(TaskFields, { ...props, draft: EMPTY_DRAFT }))
    expect(html).toContain(en.work.form.descriptionHint)
    expect(html).toContain(en.work.form.customerDescriptionHint)
    expect(html).toContain(en.work.form.shareHint)
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/)
  })

  it('holds a task shared while a customer request is open, and says why', () => {
    const html = render(h(TaskFields, { ...props, draft: { ...EMPTY_DRAFT, customerVisible: true }, keepShared: true }))
    expect(html).toContain(en.work.form.actionOpen)
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/)
  })

  it('sends an empty choice as null (clear it) and never a status when editing', () => {
    const draft = { ...draftOf(task('a', 'T', { status: 'planned', due_on: '2026-11-10' })), categoryId: '', dueOn: '' }
    expect(inputOf(draft, false)).toMatchObject({ title: 'T', categoryId: null, dueOn: null, customerVisible: false })
    expect('status' in inputOf(draft, false)).toBe(false)
    expect(inputOf(draft, true).status).toBe('planned')
  })

  it('hides a disabled category from the choices unless the task already has it', () => {
    const categories: Category[] = [
      { id: 'c1', code: 'design', enabled: true, sortOrder: 1, names: { hu: 'Dizájn', en: 'Design', nl: 'Ontwerp' }, used: 0 },
      { id: 'c2', code: 'old', enabled: false, sortOrder: 2, names: { hu: 'Régi', en: 'Old', nl: 'Oud' }, used: 1 },
    ]
    expect(render(h(TaskFields, { ...props, categories, draft: EMPTY_DRAFT }))).not.toContain('>Old<')
    expect(render(h(TaskFields, { ...props, categories, draft: { ...EMPTY_DRAFT, categoryId: 'c2' } }))).toContain('>Old<')
  })
})

describe('a day', () => {
  it('is written the same wherever the browser is: a day has no hour, so no zone can move it', () => {
    expect(dayText('2026-03-29', 'en')).toBe('29 Mar 2026')
    expect(dayText('2026-03-29', 'hu')).toBe('2026. márc. 29.')
    expect(dayText(null, 'en')).toBe('—')
    expect(dayText('not a day', 'en')).toBe('—')
  })
})

describe('the words', () => {
  const leaves = (value: unknown, path: string, found: Array<[string, string]> = []): Array<[string, string]> => {
    if (typeof value === 'string') found.push([path, value])
    else if (typeof value === 'object' && value !== null) for (const [key, child] of Object.entries(value)) leaves(child, `${path}.${key}`, found)
    return found
  }

  it('say "delivered" only as the provider’s confirmation, and never promise an answer time', () => {
    for (const [path, text] of [...leaves(en.work, 'en'), ...leaves(hu.work, 'hu')]) {
      if (/delivered|kézbesít/i.test(text)) expect(text, path).toMatch(/provider|szolgáltató|only|csak/i)
      expect(text, path).not.toMatch(/within \d|\d+ (hours|days)|\d+ (órán belül|napon belül)/i)
    }
  })

  it('have the same shape in both languages', () => {
    expect(leaves(hu.work, '').map(([path]) => path)).toEqual(leaves(en.work, '').map(([path]) => path))
  })
})
