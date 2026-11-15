import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { eventText } from '../components/portal/eventText'
import { ProgressPanel, ProjectSchedule } from '../components/portal/WorkViews'
import { portalText } from '../content/portal'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nProvider } from '../i18n/I18nProvider'
import type { PortalTask, ProjectEventType, WorkProgress } from './api'
import type { PortalWords } from './text'

/**
 * PROMPT 26, the customer's side of the project work: every line of the timeline reads in every language, the progress says nothing when there is nothing to count,
 * the schedule is text first (its bars are a picture of words that are always there), nothing moves, and the one thing a customer can send goes to one place with one field.
 */

const words = (lang: Language): PortalWords => Object.fromEntries(Object.entries(portalText).map(([key, value]) => [key, pick(value, lang)])) as unknown as PortalWords
function pick(value: unknown, lang: Language): unknown {
  if (typeof value !== 'object' || value === null) return value
  const entry = value as Record<string, unknown>
  if (typeof entry.hu === 'string' && typeof entry.en === 'string' && typeof entry.nl === 'string') return entry[lang]
  return Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, pick(child, lang)]))
}

const render = (node: ReactElement, lang: Language = 'en'): string => renderToStaticMarkup(h(MemoryRouter, null, h(I18nProvider, { lang, children: node })))

const CUSTOMER_EVENTS: ProjectEventType[] = [
  'created', 'status_changed', 'dates_changed', 'milestone_added', 'milestone_completed', 'document_published', 'feedback_requested', 'update_posted',
  'task_created', 'task_status_changed', 'task_completed', 'task_cancelled', 'milestone_status_changed', 'action_assigned', 'action_submitted', 'action_under_review', 'action_changes_requested', 'action_accepted', 'action_cancelled',
]

describe('the timeline’s lines', () => {
  it('read in every language, name what they are about, and never leave a placeholder or a raw code behind', () => {
    for (const lang of LANGUAGES) {
      for (const type of CUSTOMER_EVENTS) {
        const toStatus = type === 'status_changed' ? 'design' : type === 'task_status_changed' ? 'in_progress' : type === 'milestone_status_changed' ? 'delayed' : null
        const line = eventText({ type, toStatus, milestone: type.startsWith('milestone') ? 'MARKER-TITLE' : null, subject: 'MARKER-TITLE' }, words(lang))
        expect(line.length, `${lang} ${type}`).toBeGreaterThan(5)
        expect(line, `${lang} ${type}`).not.toMatch(/[{}]|undefined|\b(in_progress|task_created|changes_requested)\b/)
        if (type !== 'created' && type !== 'dates_changed' && type !== 'document_published' && type !== 'feedback_requested' && type !== 'update_posted' && type !== 'status_changed') expect(line, `${lang} ${type}`).toContain('MARKER-TITLE')
      }
    }
  })

  it('names the new status in the customer’s words, not in the code’s', () => {
    expect(eventText({ type: 'task_status_changed', toStatus: 'waiting_customer', milestone: null, subject: 'Logo' }, words('en'))).toContain('Waiting for you')
    expect(eventText({ type: 'milestone_status_changed', toStatus: 'delayed', milestone: null, subject: 'Beta' }, words('nl'))).toContain('Vertraagd')
    expect(eventText({ type: 'status_changed', toStatus: 'design', milestone: null, subject: null }, words('hu'))).toContain('Dizájn')
  })

  it('has a line for a task or a milestone whose title is no longer known', () => {
    expect(eventText({ type: 'task_created', toStatus: null, milestone: null, subject: null }, words('en'))).toContain('a task')
  })
})

describe('the words of the work', () => {
  const leaves = (value: unknown, path = 'work', found: Array<[string, Record<string, string>]> = []): Array<[string, Record<string, string>]> => {
    if (typeof value !== 'object' || value === null) return found
    const entry = value as Record<string, unknown>
    if (typeof entry.hu === 'string' && typeof entry.en === 'string' && typeof entry.nl === 'string') found.push([path, entry as Record<string, string>])
    else for (const [key, child] of Object.entries(entry)) leaves(child, `${path}.${key}`, found)
    return found
  }
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',')

  it('exist in all three languages with the same placeholders', () => {
    const all = leaves(portalText.work)
    expect(all.length).toBeGreaterThan(100)
    for (const [path, entry] of all) {
      for (const lang of LANGUAGES) expect(entry[lang].trim().length, `${path} ${lang}`).toBeGreaterThan(0)
      expect(placeholders(entry.hu), `${path} hu/en`).toBe(placeholders(entry.en))
      expect(placeholders(entry.nl), `${path} nl/en`).toBe(placeholders(entry.en))
    }
  })

  it('has a word for every status of a task, a request and a milestone, and every kind of request', () => {
    const covered = (group: Record<string, unknown>, keys: string[]) => expect(Object.keys(group).sort()).toEqual([...keys].sort())
    covered(portalText.work.tasks.status, ['backlog', 'planned', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'completed', 'cancelled'])
    covered(portalText.work.action.status, ['not_started', 'submitted', 'under_review', 'changes_requested', 'accepted', 'cancelled'])
    covered(portalText.work.action.types, ['provide_content', 'answer_question', 'confirm_direction', 'review_deliverable', 'approve_stage', 'other'])
    covered(portalText.work.milestones.status, ['upcoming', 'in_progress', 'completed', 'delayed', 'cancelled'])
  })

  it('says plainly that no file can be attached, and promises no time for an answer or a review', () => {
    for (const lang of LANGUAGES) {
      const hint = portalText.work.action.form.hint[lang]
      expect(hint, lang).toMatch(lang === 'hu' ? /Fájlt itt nem tudsz csatolni/ : lang === 'nl' ? /geen bestand bijvoegen/ : /cannot attach a file/)
      const all = leaves(portalText.work).map(([, entry]) => entry[lang]).join(' ')
      expect(all, lang).not.toMatch(/\b\d+ (hours|days|órán|napon|uur|dagen)\b|\b(within|belül|binnen)\b/i)
    }
  })
})

describe('the progress', () => {
  const progress = (percent: number | null, basis: WorkProgress['basis'] = 'tasks'): WorkProgress => ({ percent, basis: percent === null ? null : basis, tasks: { total: 3, completed: 1, open: 2, overdue: 1 }, milestones: { total: 2, completed: 1, overdue: 0 }, today: '2026-11-03' })

  it('says there is nothing to measure, and shows no number, when nothing is recorded', () => {
    for (const lang of LANGUAGES) {
      const html = render(h(ProgressPanel, { progress: progress(null) }), lang)
      expect(html, lang).toContain(portalText.work.progress.emptyTitle[lang])
      expect(html, lang).not.toMatch(/%|<progress/)
    }
  })

  it('shows the count it came from, the bar with a name, and what is late', () => {
    const html = render(h(ProgressPanel, { progress: progress(33) }))
    expect(html).toContain('33% done')
    expect(html).toContain('1 of 3 tasks done')
    expect(html).toContain('<progress')
    expect(html).toContain('aria-label="Project progress: 33%"')
    expect(html).toContain('1 past their date')
    expect(render(h(ProgressPanel, { progress: progress(50, 'milestones') }))).toContain('1 of 2 milestones done')
  })
})

describe('the schedule', () => {
  const task = (reference: string, title: string, startOn: string | null, dueOn: string | null, status: PortalTask['status'] = 'planned'): PortalTask => ({ reference, title, description: '', status, startOn, dueOn, completedAt: null, overdue: false, category: null, milestone: null, waitingFor: [], action: null })
  const milestone = (id: string, title: string, dueOn: string | null, status: 'upcoming' | 'completed' | 'cancelled' = 'upcoming') => ({ id, title, description: null, status, dueOn, completedAt: status === 'completed' ? '2026-11-01T10:00:00Z' : null })

  it('is text first: every dated item is a row with its title and its dates, and the bars are hidden from assistive technology', () => {
    const html = render(h(ProjectSchedule, { reference: 'PRJ-1', tasks: [task('TSK-A', 'Design', '2026-11-02', '2026-11-06'), task('TSK-B', 'Build', null, '2026-11-20'), task('TSK-C', 'No date', null, null)], milestones: [milestone('m1', 'Launch', '2026-12-01')], today: '2026-11-03' }))
    for (const needle of ['Design', 'Build', 'Launch', 'No date', 'Without a date', 'Today: ']) expect(html).toContain(needle)
    expect(html).toContain('2 November 2026 to 6 November 2026')
    expect(html).toMatch(/<div class="[^"]*track[^"]*" aria-hidden="true">/)
    expect(html).toContain('href="/en/client-portal/projects/PRJ-1/tasks/TSK-A"')
    expect(html).toMatch(/<ol[^>]*aria-label="Timeline view"/)
  })

  it('marks what is late in words, leaves out what is cancelled, and says so when nothing has a date', () => {
    const late = render(h(ProjectSchedule, { reference: 'PRJ-1', tasks: [task('TSK-A', 'Overdue thing', null, '2026-10-01')], milestones: [milestone('m1', 'Cancelled one', '2026-11-30', 'cancelled')], today: '2026-11-03' }))
    expect(late).toContain('Past its date')
    expect(late).not.toContain('Cancelled one')
    const none = render(h(ProjectSchedule, { reference: 'PRJ-1', tasks: [], milestones: [], today: '2026-11-03' }))
    expect(none).toContain('None of the items has a date yet.')
    expect(none).not.toContain('<ol')
  })

  it('writes the dates in the customer’s language', () => {
    const html = render(h(ProjectSchedule, { reference: 'PRJ-1', tasks: [task('TSK-A', 'Terv', '2026-11-02', '2026-11-06')], milestones: [], today: '2026-11-03' }), 'hu')
    expect(html).toContain('2026. november 2.')
    expect(html).toContain('Ma: ')
  })
})

describe('what is sent', () => {
  const api = readFileSync(join(process.cwd(), 'src/portal/api.ts'), 'utf8')

  it('is one field to one address that names the project and the task; no customer, no status, no number', () => {
    expect(api).toContain("call<{ revision: number; task: PortalTaskDetail }>('POST', `/api/portal/projects/${enc(reference)}/tasks/${enc(task)}/respond`, { response })")
    expect(api).toContain("call<PortalWork>('GET', `/api/portal/projects/${enc(reference)}/tasks`)")
    expect(api).not.toMatch(/percent:\s*\w+\s*[,}]\s*\)/)
  })

  it('moves nothing: the stylesheets of the work have no animation, no transition and no keyframes, so reduced motion has nothing to take away', () => {
    for (const file of ['src/components/portal/Work.module.scss', 'src/admin/styles/work.module.scss']) {
      const text = readFileSync(join(process.cwd(), file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(text, file).not.toMatch(/\b(animation|transition|@keyframes|scroll-behavior)\b/)
    }
  })
})
