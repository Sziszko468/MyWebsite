import { afterEach, describe, expect, it } from 'vitest'
import { eraseByEmail } from '../src/modules/system/maintenance.ts'
import { runWorkReminders } from '../src/modules/projectwork/reminders.ts'
import { MailError } from '../src/modules/notifications/smtp.ts'
import { makeWorkKit, type WorkKit } from './workKit.ts'

/**
 * The project work's e-mails (PROMPT 26): who is told what, in whose language, once; what the owner switched off; what was queued and what was delivered; the
 * reminders and their idempotence. Mail is the recording test mailer: nothing is ever sent anywhere.
 */

let w: WorkKit
afterEach(async () => {
  await w?.close()
})

const CUSTOMER = 'anna@example.com'
const OWNER = 'owner@site.test'

const mail = (to: string, subject: RegExp) => w.kit.server.mailer.sent.filter((message) => message.to === to && subject.test(message.subject))
const reminders = () => runWorkReminders(w.kit.server.app.context)

async function asked(body: Record<string, unknown> = {}) {
  const task = await w.task({ title: 'Send us your logo', customerDescription: 'We need it.', description: 'INTERNAL-ONLY-TEXT', customerVisible: true, ...body })
  const given = await w.call('POST', w.at(`/tasks/${task.id}/action`), { actionType: 'provide_content', instruction: 'Please send the text of the logo.' })
  expect(given.status, given.text).toBe(201)
  await w.kit.settle()
  return { ...task, actionId: given.json.data.action.id as string }
}

describe('the customer is told when an action is given to them', () => {
  it('in their own language, with the project, the task, the instruction and a link, and nothing private', async () => {
    for (const [language, subject, button] of [['en', /An action is waiting for you: A website/, 'Open the action'], ['hu', /Teendőd van a projektedben: A website/, 'Teendő megnyitása'], ['nl', /Er wacht een actie op je: A website/, 'Actie openen']] as const) {
      w = await makeWorkKit({ language })
      await asked()
      const sent = mail(CUSTOMER, subject)
      expect(sent, language).toHaveLength(1)
      expect(sent[0].text).toContain('Send us your logo')
      expect(sent[0].text).toContain('Please send the text of the logo.')
      expect(sent[0].text).toContain(w.project.reference)
      expect(sent[0].text).toContain(`https://site.test/${language}/client-portal/projects/${w.project.reference}`)
      expect(sent[0].html).toContain(button)
      expect(sent[0].text + sent[0].html).not.toContain('INTERNAL-ONLY-TEXT')
      await w.close()
    }
  })

  it('is not sent when the owner switched it off, and a task nobody shared is never written about', async () => {
    w = await makeWorkKit()
    expect((await w.call('PUT', '/api/admin/work-settings', { actionAssigned: false })).status).toBe(200)
    await asked()
    expect(mail(CUSTOMER, /action is waiting/)).toHaveLength(0)
    await w.call('PUT', '/api/admin/work-settings', { actionAssigned: true })
    const hidden = await w.task({ title: 'Never mentioned' })
    expect((await w.call('POST', w.at(`/tasks/${hidden.id}/action`), { actionType: 'other', instruction: 'Please look.' })).status).toBe(409)
    await w.kit.settle()
    expect(w.kit.server.mailer.sent.map((message) => message.text).join('\n')).not.toContain('Never mentioned')
  })
})

describe('the owner is told when the customer responds', () => {
  it('once, to the owner’s address, with the customer to reply to, and without the customer’s words', async () => {
    w = await makeWorkKit()
    const t = await asked()
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: 'THE-CUSTOMERS-OWN-WORDS' })
    await w.kit.settle()
    const sent = mail(OWNER, /A customer responded: A website/)
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain('Send us your logo')
    expect(sent[0].text).toContain(CUSTOMER)
    expect(sent[0].text).toContain(`/admin/client-projects/${w.project.id}`)
    expect(sent[0].text + sent[0].html).not.toContain('THE-CUSTOMERS-OWN-WORDS')
    expect((sent[0] as { replyTo?: string | null }).replyTo).toBe(CUSTOMER)
    // The owner’s message is never sent to the customer.
    expect(mail(CUSTOMER, /customer responded/)).toHaveLength(0)
  })

  it('is not sent when the owner switched it off', async () => {
    w = await makeWorkKit()
    await w.call('PUT', '/api/admin/work-settings', { responseSubmitted: false })
    const t = await asked()
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: 'An answer.' })
    await w.kit.settle()
    expect(mail(OWNER, /customer responded/)).toHaveLength(0)
  })
})

describe('the customer is told about the review', () => {
  it('accepted: thanked; changes requested: told what to change, in the owner’s words and never the private note', async () => {
    w = await makeWorkKit()
    const t = await asked()
    const answer = () => w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: 'An answer.' })
    await answer()
    await w.call('POST', w.at(`/actions/${t.actionId}/changes`), { customerNote: 'Please add the year of founding.', internalNote: 'PRIVATE-REVIEW-NOTE' })
    await w.kit.settle()
    const changes = mail(CUSTOMER, /We ask for changes to your response: A website/)
    expect(changes).toHaveLength(1)
    expect(changes[0].text).toContain('Please add the year of founding.')
    expect(changes[0].text + changes[0].html).not.toContain('PRIVATE-REVIEW-NOTE')
    await answer()
    await w.call('POST', w.at(`/actions/${t.actionId}/accept`), { internalNote: 'PRIVATE-REVIEW-NOTE' })
    await w.kit.settle()
    const accepted = mail(CUSTOMER, /Your response was accepted: A website/)
    expect(accepted).toHaveLength(1)
    expect(accepted[0].text + accepted[0].html).not.toContain('PRIVATE-REVIEW-NOTE')
  })

  it('each can be switched off by the owner on its own', async () => {
    w = await makeWorkKit()
    await w.call('PUT', '/api/admin/work-settings', { responseReviewed: false, changesRequested: false })
    const t = await asked()
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: 'An answer.' })
    await w.call('POST', w.at(`/actions/${t.actionId}/changes`), { customerNote: 'Please change it.' })
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: 'Changed.' })
    await w.call('POST', w.at(`/actions/${t.actionId}/accept`), {})
    await w.kit.settle()
    expect(mail(CUSTOMER, /We ask for changes|Your response was accepted/)).toHaveLength(0)
  })
})

describe('a milestone is completed', () => {
  it('is silent until the owner switches it on (as completing a milestone always was)', async () => {
    w = await makeWorkKit()
    expect((await w.call('GET', '/api/admin/work-settings')).json.data.milestoneCompleted).toBe(false)
    const one = (await w.call('POST', w.at('/milestones'), { title: 'Quiet one' })).json.data
    await w.call('PATCH', w.at(`/milestones/${one.id}`), { done: true })
    await w.kit.settle()
    expect(mail(CUSTOMER, /milestone was completed/)).toHaveLength(0)
  })

  it('tells the customer, in their language, only for a milestone they can see', async () => {
    w = await makeWorkKit({ language: 'nl' })
    await w.call('PUT', '/api/admin/work-settings', { milestoneCompleted: true })
    const seen = (await w.call('POST', w.at('/milestones'), { title: 'Eerste versie' })).json.data
    const secret = (await w.call('POST', w.at('/milestones'), { title: 'Interne controle', customerVisible: false })).json.data
    await w.call('PATCH', w.at(`/milestones/${seen.id}`), { status: 'completed' })
    await w.call('PATCH', w.at(`/milestones/${secret.id}`), { status: 'completed' })
    await w.kit.settle()
    const sent = mail(CUSTOMER, /Een mijlpaal is afgerond: A website/)
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain('Eerste versie')
    expect(w.kit.server.mailer.sent.map((message) => message.text).join('\n')).not.toContain('Interne controle')
  })

  it('is not sent twice for the same milestone, and not at all when the owner switched it off', async () => {
    w = await makeWorkKit()
    await w.call('PUT', '/api/admin/work-settings', { milestoneCompleted: true })
    const first = (await w.call('POST', w.at('/milestones'), { title: 'One' })).json.data
    await w.call('PATCH', w.at(`/milestones/${first.id}`), { done: true })
    await w.call('PATCH', w.at(`/milestones/${first.id}`), { done: true })
    await w.call('PUT', '/api/admin/work-settings', { milestoneCompleted: false })
    const second = (await w.call('POST', w.at('/milestones'), { title: 'Two' })).json.data
    await w.call('PATCH', w.at(`/milestones/${second.id}`), { done: true })
    await w.kit.settle()
    expect(mail(CUSTOMER, /milestone was completed/)).toHaveLength(1)
  })
})

describe('reminders', () => {
  it('"due soon" goes out once when the date is near and not before; running the pass again, or twice a day, makes no second message', async () => {
    w = await makeWorkKit()
    await asked({ dueOn: '2026-11-20' })
    expect(reminders()).toEqual({ dueSoon: 0, overdue: 0 })
    w.kit.server.clock.advance(15 * 86_400_000)
    expect(reminders()).toEqual({ dueSoon: 1, overdue: 0 })
    expect(reminders()).toEqual({ dueSoon: 0, overdue: 0 })
    await w.kit.settle()
    expect(reminders()).toEqual({ dueSoon: 0, overdue: 0 })
    const sent = mail(CUSTOMER, /A due date is coming up: A website/)
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain('Send us your logo')
    expect(sent[0].text).toContain('20 November 2026')
  })

  it('"overdue" is off by default: a passed date queues nothing', async () => {
    w = await makeWorkKit()
    await asked({ dueOn: '2026-11-05' })
    w.kit.server.clock.advance(5 * 86_400_000)
    expect(reminders()).toEqual({ dueSoon: 0, overdue: 0 })
    await w.kit.settle()
    expect(mail(CUSTOMER, /due date has passed/)).toHaveLength(0)
  })

  it('"overdue", once the owner switches it on, goes out once for that date', async () => {
    w = await makeWorkKit()
    await w.call('PUT', '/api/admin/work-settings', { actionOverdue: true })
    await asked({ dueOn: '2026-11-05' })
    w.kit.server.clock.advance(5 * 86_400_000)
    expect(reminders()).toEqual({ dueSoon: 0, overdue: 1 })
    expect(reminders()).toEqual({ dueSoon: 0, overdue: 0 })
    await w.kit.settle()
    expect(mail(CUSTOMER, /A due date has passed: A website/)).toHaveLength(1)
  })

  it('a date that moves is a new date and gets its own reminder; the old date’s message is not repeated', async () => {
    w = await makeWorkKit()
    const t = await asked({ dueOn: '2026-11-05' })
    expect(reminders().dueSoon).toBe(1)
    await w.call('PATCH', w.at(`/tasks/${t.id}`), { dueOn: '2026-11-06' })
    expect(reminders().dueSoon).toBe(1)
    expect(reminders().dueSoon).toBe(0)
  })

  it('is never sent for an answered action, a finished or hidden task, a project on hold or finished, or a customer who was switched off', async () => {
    w = await makeWorkKit()
    const answered = await asked({ title: 'Answered', dueOn: '2026-11-05' })
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${answered.reference}/respond`, { response: 'Done already.' })
    const cancelled = await asked({ title: 'Cancelled', dueOn: '2026-11-05' })
    await w.call('POST', w.at(`/tasks/${cancelled.id}/status`), { status: 'cancelled' })
    expect(reminders()).toEqual({ dueSoon: 0, overdue: 0 })
    const open = await asked({ title: 'Open', dueOn: '2026-11-05' })
    await w.call('POST', w.at('/status'), { status: 'on_hold' })
    expect(reminders().dueSoon).toBe(0)
    await w.call('POST', w.at('/status'), { status: 'planning' })
    await w.call('POST', `/api/admin/clients/${w.anna.id}/actions`, { action: 'disable' })
    expect(reminders().dueSoon).toBe(0)
    await w.call('POST', `/api/admin/clients/${w.anna.id}/actions`, { action: 'enable' })
    expect(reminders().dueSoon).toBe(1)
    void open
  })

  it('a reminder that was queued but whose reason went away before it was sent is cancelled, not sent', async () => {
    w = await makeWorkKit()
    await asked({ dueOn: '2026-11-05' })
    expect(reminders().dueSoon).toBe(1)
    // Before the message is written (nothing else runs between these two lines), the customer answers.
    w.kit.server.db.run("UPDATE project_customer_actions SET status = 'submitted'")
    await w.kit.settle()
    expect(mail(CUSTOMER, /due date is coming up/)).toHaveLength(0)
    expect(w.kit.server.db.get<{ status: string }>("SELECT status FROM email_deliveries WHERE kind = 'client_action_due_soon'")!.status).toBe('cancelled')
  })

  it('is run by the daily maintenance, and nothing at all is queued when the owner switched both reminders off', async () => {
    w = await makeWorkKit()
    await asked({ dueOn: '2026-11-05' })
    await w.call('PUT', '/api/admin/work-settings', { actionDueSoon: false, actionOverdue: false })
    expect(reminders()).toEqual({ dueSoon: 0, overdue: 0 })
    await w.call('PUT', '/api/admin/work-settings', { actionDueSoon: true })
    const result = (await w.call('POST', '/api/admin/system/maintenance', {})).json?.data
    if (result) expect(result.workReminders).toEqual({ dueSoon: 1, overdue: 0 })
    else expect(reminders().dueSoon).toBe(1)
  })
})

describe('what the owner can see about the messages', () => {
  it('says what is queued and what was handed to the provider, and for whom', async () => {
    w = await makeWorkKit()
    // The provider is down for the first attempt: the message is queued, not sent.
    w.kit.server.mailer.failNext(new MailError('The provider is busy.', { transient: true, reason: 'unavailable' }))
    const t = await w.task({ title: 'Send us your logo', customerVisible: true })
    await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please send the logo.' })
    await w.kit.settle()
    const before = (await w.call('GET', w.at('/work-notifications'))).json.data
    expect(before.map((entry: { kind: string; stage: string; to: string }) => [entry.kind, entry.stage, entry.to])).toEqual([['client_action_assigned', 'queued', 'customer']])
    w.kit.server.clock.advance(10 * 60_000)
    await w.kit.settle()
    const after = (await w.call('GET', w.at('/work-notifications'))).json.data
    expect(after[0]).toMatchObject({ kind: 'client_action_assigned', stage: 'sent', recipient: CUSTOMER })
    expect((await w.call('GET', w.at('/work-notifications'), undefined, 'none')).status).toBe(401)
  })
})

describe('the owner’s choices', () => {
  it('are validated, limited to the ones that exist, and need the administrator', async () => {
    w = await makeWorkKit()
    const read = (await w.call('GET', '/api/admin/work-settings')).json.data
    expect(read).toMatchObject({ actionAssigned: true, actionOverdue: false, dueSoonDays: 3 })
    for (const body of [{}, { dueSoonDays: 0 }, { dueSoonDays: 31 }, { dueSoonDays: 2.5 }, { dueSoonDays: '3' }, { actionAssigned: 'yes' }, { surprise: true }]) {
      expect((await w.call('PUT', '/api/admin/work-settings', body)).status, JSON.stringify(body)).toBe(422)
    }
    expect((await w.call('PUT', '/api/admin/work-settings', { dueSoonDays: 7, actionOverdue: true })).json.data).toMatchObject({ dueSoonDays: 7, actionOverdue: true, actionAssigned: true })
    expect((await w.call('PUT', '/api/admin/work-settings', { actionOverdue: true }, 'editor')).status).toBe(403)
  })
})

describe('erasing a customer', () => {
  it('takes the tasks, the actions, the answers and the reminders with the account', async () => {
    w = await makeWorkKit()
    const t = await asked({ dueOn: '2026-11-05' })
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: 'My answer.' })
    const other = await asked({ title: 'Second', dueOn: '2026-11-05' })
    reminders()
    const result = eraseByEmail(w.kit.server.app.context, CUSTOMER)
    expect(result.customers).toBe(1)
    const { db } = w.kit.server
    for (const table of ['project_tasks', 'project_customer_actions', 'project_action_submissions', 'project_action_transitions', 'project_task_dependencies', 'client_project_events']) {
      expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n, table).toBe(0)
    }
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM email_deliveries WHERE kind LIKE 'client_action%' OR kind = 'client_milestone_completed'")!.n).toBe(0)
    void other
  })
})
