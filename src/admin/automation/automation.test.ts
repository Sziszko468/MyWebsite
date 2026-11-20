import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { allowances } from '../../i18n/quality/allowances'
import { checkEntries } from '../../i18n/quality/rules'
import { ACTION_STATUSES, ACTION_TYPES, type ActionDetail, type ActionSummary } from '../api/automation'
import { ApiError } from '../api/client'
import { ProposalCard } from '../assistant/Cards'
import { proposalOf, type ToolCall } from '../assistant/model'
import { AssistantTextProvider } from '../assistant/text'
import { NAVIGATION } from '../components/navigation'
import { AdminTextProvider } from '../i18n'
import { AUTOMATION_LANGUAGES, automationEn, automationHu, automationNl, automationText, type AutomationLanguage } from '../i18n/automation'
import { DEFAULT_FILTERS, errorSentence, humanize, moment, queryFor, readFilters, statusWord, valueWord, writeFilters } from './model'
import { DecisionPanel, PreviewView, StatusPill, SummaryLine, Timeline } from './Parts'
import { AutomationTextProvider } from './text'

/**
 * PROMPT 33: the automation screen. These tests read the screen the way an administrator meets it, in Hungarian, English and Dutch: every code the server can send has its sentence in
 * each language, what an assistant or a customer wrote is shown as inert text, the decision controls offer only what the server says they may, the second confirmation is asked for,
 * and no word on the screen is written into a component.
 */

const SERVER = join(process.cwd(), 'server', 'src', 'modules', 'ai', 'automation')
const source = (name: string) => readFileSync(join(SERVER, name), 'utf8')
const LANGUAGES = AUTOMATION_LANGUAGES
const plain = (text: string) => text.replace(/[  ]/g, ' ')
const render = (node: ReactElement, language: AutomationLanguage = 'en'): string => plain(renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language: language === 'hu' ? 'hu' : 'en', children: h(AutomationTextProvider, { language, children: node }) }))))

/** The members of `export const NAME = [...] as const` in a server file. */
function listOf(file: string, name: string): string[] {
  const match = new RegExp(`export const ${name}\\s*(?::[^=]+)?=\\s*\\[([\\s\\S]*?)\\]\\s*as const`).exec(source(file))
  if (!match) throw new Error(`${name} not found in ${file}`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
}

const flatten = (node: unknown, prefix = ''): Array<[string, string]> => (typeof node === 'string' ? [[prefix, node]] : typeof node === 'object' && node !== null ? Object.entries(node).flatMap(([key, value]) => flatten(value, prefix ? `${prefix}.${key}` : key)) : [])

const summary = (over: Partial<ActionSummary> = {}): ActionSummary => ({
  reference: 'ACT-ABCDEFGH',
  type: 'project.status_change',
  status: 'awaiting_approval',
  administrator: { id: 'a1b2c3d4-0000', email: 'owner@example.test' },
  target: { type: 'project', reference: 'PRJ-ABCDEFGH', label: 'Alpha site' },
  change: { field: 'status', before: 'design', after: 'review' },
  contentKind: null,
  requiresSecondConfirmation: false,
  customerVisible: true,
  expiresAt: '2026-11-03T11:00:00.000Z',
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
  failureCode: null,
  retryOf: null,
  can: { approve: true, reject: true, cancel: true, retry: false },
  ...over,
})

const detail = (over: Partial<ActionDetail> = {}): ActionDetail => ({
  ...summary(),
  language: 'en',
  conversationId: null,
  reason: 'The administrator said the design phase is over.',
  preview: {
    records: [{ type: 'project', reference: 'PRJ-ABCDEFGH', label: 'Alpha site' }],
    changes: [{ field: 'status', before: 'design', after: 'review' }],
    contents: [{ kind: 'customer_note', text: 'We are ready for your review.' }],
    sideEffects: ['customer_sees_status', 'no_email_sent', 'history_line_recorded'],
    reversible: 'yes',
    customerVisible: true,
    secondConfirmation: false,
  },
  payloadHash: 'a'.repeat(64),
  definition: { permission: 'clients:projects', reversible: 'partly', customerVisible: true, secondConfirmation: 'conditional' },
  decision: null,
  execution: { startedAt: null, finishedAt: null, result: null, failureCode: null },
  history: [],
  ...over,
})

describe('the dictionary: three languages, one shape, every code the server can send', () => {
  it('has the same keys and the same placeholders in Hungarian, English and Dutch, and no empty text', () => {
    const en = new Map(flatten(automationEn))
    for (const [name, dictionary] of [['hu', automationHu], ['nl', automationNl]] as const) {
      const other = new Map(flatten(dictionary))
      expect([...other.keys()].sort(), name).toEqual([...en.keys()].sort())
      for (const [key, text] of other) {
        expect(text.trim().length, `${name} ${key}`).toBeGreaterThan(0)
        expect([...text.matchAll(/\{(\w+)\}/g)].map((item) => item[1]).sort(), `${name} ${key}`).toEqual([...(en.get(key) ?? '').matchAll(/\{(\w+)\}/g)].map((item) => item[1]).sort())
      }
    }
  })

  it('has a sentence for every status, action type, side effect, failure, history line, target and unsupported action and reason the server has', () => {
    const statuses = listOf('model.ts', 'ACTION_STATUSES')
    const types = listOf('model.ts', 'ACTION_TYPES')
    const effects = listOf('model.ts', 'SIDE_EFFECTS')
    const failures = listOf('model.ts', 'FAILURE_CODES')
    const events = listOf('model.ts', 'EVENT_KINDS')
    const actors = listOf('model.ts', 'ACTOR_TYPES')
    const unsupported = [...source('model.ts').matchAll(/\{ code: '([a-z_]+)', reason: '([a-z_]+)' \}/g)]
    expect(statuses).toEqual([...ACTION_STATUSES])
    expect(types).toEqual([...ACTION_TYPES])
    expect(unsupported.length).toBeGreaterThan(10)
    for (const dictionary of [automationEn, automationHu, automationNl]) {
      for (const status of statuses) expect(dictionary.status).toHaveProperty(status)
      for (const type of types) expect(dictionary.types).toHaveProperty([type, 'name'])
      for (const effect of effects) expect(dictionary.sideEffects).toHaveProperty(effect)
      for (const failure of failures) expect(dictionary.failures).toHaveProperty(failure)
      for (const event of events) expect(dictionary.events).toHaveProperty(event)
      for (const actor of actors) expect(dictionary.actors).toHaveProperty(actor)
      for (const [, code, reason] of unsupported) {
        expect(dictionary.catalog.unsupported).toHaveProperty(code)
        expect(dictionary.catalog.reasons).toHaveProperty(reason)
      }
      for (const reversible of ['yes', 'partly', 'no', 'not_applicable']) expect(dictionary.reversible).toHaveProperty(reversible)
      for (const status of ['proposed', 'awaiting_approval', 'approved', 'executing', 'completed', 'rejected', 'expired', 'cancelled', 'failed']) expect(dictionary.statusLine).toHaveProperty(status)
    }
    // The reasons the API answers a refused decision with.
    const reasons = [...source('lifecycle.ts').matchAll(/conflictOf\('[^']*', '([a-z_]+)'/g)].map((item) => item[1])
    expect(reasons.length).toBeGreaterThan(5)
    for (const reason of new Set(reasons)) {
      if (reason === 'payload_tampered') continue
      for (const dictionary of [automationEn, automationHu, automationNl]) expect(Object.keys({ ...dictionary.errors, ...dictionary.failures }), reason).toContain(reason)
    }
  })

  it('passes the platform\'s own language rules (placeholders, numbers, whitespace, quotes, brackets, untranslated text)', () => {
    const entries = flatten(automationEn).map(([id]) => ({ id: `admin/i18n/automation.ts#${id}`, source: 'admin/i18n/automation.ts', area: 'automation', texts: { hu: new Map(flatten(automationHu)).get(id), en: new Map(flatten(automationEn)).get(id), nl: new Map(flatten(automationNl)).get(id) } }))
    const findings = checkEntries(entries, allowances).filter((finding) => finding.rule !== 'glossary')
    expect(findings.map((finding) => `[${finding.rule}] ${finding.id} ${finding.lang ?? ''}: ${finding.message}`)).toEqual([])
    expect(entries.length).toBeGreaterThan(200)
  })

  it('names the navigation place in both administration languages, and the place exists', () => {
    expect(NAVIGATION.find((item) => item.id === 'automation')).toMatchObject({ path: '/automation', primary: false })
    const nav = (text: string) => new RegExp(`automation: '${text}'`)
    expect(readFileSync(join(process.cwd(), 'src', 'admin', 'i18n', 'en.ts'), 'utf8')).toMatch(nav('Automation'))
    expect(readFileSync(join(process.cwd(), 'src', 'admin', 'i18n', 'hu.ts'), 'utf8')).toMatch(nav('Automatizálás'))
    const app = readFileSync(join(process.cwd(), 'src', 'admin', 'AdminApp.tsx'), 'utf8')
    expect(app).toContain('<Route path="automation" element={<AutomationPage />} />')
    expect(app).toContain('<Route path="automation/:reference" element={<AutomationActionPage />} />')
  })
})

describe('what is on the screen, in every language', () => {
  it('says what would change, to whom, with which side effects, whether it can be undone and whether the customer sees it', () => {
    for (const language of LANGUAGES) {
      const t = automationText(language)
      const action = detail()
      const html = render(h(PreviewView, { preview: action.preview!, expiresAt: action.expiresAt, requiresSecond: true }), language)
      for (const text of [t.detail.changesTitle, t.detail.recordsTitle, t.detail.sideEffectsTitle, t.sideEffects.customer_sees_status, t.sideEffects.no_email_sent, t.reversible.yes, t.detail.visible.yes, t.detail.secondYes, t.detail.before, t.detail.after, t.fields.status, t.detail.contents.customer_note]) expect(html, `${language}: ${text}`).toContain(text.replace(/’/g, '&#x27;').replace(/'/g, '&#x27;'))
      expect(html).toContain(statusWord(language, 'design'))
      expect(html).toContain(statusWord(language, 'review'))
      expect(html).toContain('PRJ-ABCDEFGH')
      expect(html).toContain('We are ready for your review.')
    }
  })

  it('writes a status in the platform\'s own words (the dashboard\'s), and never a raw key', () => {
    expect(statusWord('hu', 'on_hold')).toBe('Szünetel')
    expect(statusWord('nl', 'on_hold')).toBe('Gepauzeerd')
    expect(statusWord('en', 'under_review')).not.toBe('under_review')
    expect(statusWord('en', 'no_such_status')).toBe('No such status')
    expect(valueWord(automationEn, 'en', 'status', null)).toBe('—')
    expect(valueWord(automationHu, 'hu', 'startedOn', 'today')).toBe('ma')
    expect(valueWord(automationNl, 'nl', 'closedDays', '2026-12-24 – 2026-12-26 (3)')).toBe('2026-12-24 – 2026-12-26 (3)')
    expect(humanize('some.new_code')).toBe('Some new code')
  })

  it('shows what an assistant or a customer wrote as TEXT: markup in it is escaped, never drawn', () => {
    const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)> [click](javascript:alert(3))'
    const action = detail({ preview: { ...detail().preview!, contents: [{ kind: 'draft_reply', text: hostile, language: 'en' }] } })
    const html = render(h(PreviewView, { preview: action.preview!, expiresAt: action.expiresAt, requiresSecond: false }))
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('lists the history line by line with who did it, in words, and with the failure written in the language of the screen', () => {
    for (const language of LANGUAGES) {
      const t = automationText(language)
      const lines = [
        { seq: 1, kind: 'proposal_created', actor: { type: 'ai' as const, id: 'x', email: 'owner@example.test' }, from: null, to: 'proposed' as const, detail: null, at: '2026-11-03T10:00:00.000Z', hash: 'h1' },
        { seq: 2, kind: 'approval_granted', actor: { type: 'admin' as const, id: 'x', email: 'owner@example.test' }, from: 'awaiting_approval' as const, to: 'approved' as const, detail: null, at: '2026-11-03T10:05:00.000Z', hash: 'h2' },
        { seq: 3, kind: 'execution_failed', actor: { type: 'server' as const, id: null, email: null }, from: 'executing' as const, to: 'failed' as const, detail: { code: 'target_changed' }, at: '2026-11-03T10:05:01.000Z', hash: 'h3' },
      ]
      const html = render(h(Timeline, { lines }), language)
      for (const text of [t.events.proposal_created, t.events.approval_granted, t.events.execution_failed, t.actors.ai, t.actors.admin, t.actors.server, t.failures.target_changed]) expect(html, `${language}: ${text}`).toContain(text.replace(/'/g, '&#x27;'))
      expect(html).toContain('owner@example.test')
      expect(html).toContain('<ol')
    }
  })

  it('words every status, with its word on the label (never colour alone)', () => {
    for (const language of LANGUAGES) for (const status of ACTION_STATUSES) expect(render(h(StatusPill, { status }), language)).toContain(`data-status="${status}"`)
    expect(render(h(StatusPill, { status: 'failed' }), 'hu')).toContain('Sikertelen')
    expect(render(h(StatusPill, { status: 'awaiting_approval' }), 'nl')).toContain('Wacht op goedkeuring')
  })

  it('summarises a change on one line for a list (only what there is after, when nothing was there before), and says nothing for an action that changes no record', () => {
    expect(render(h(SummaryLine, { item: summary() }), 'en')).toContain('Status: Design → Review')
    expect(render(h(SummaryLine, { item: summary({ change: { field: 'closedDays', before: null, after: '2026-12-24 – 2026-12-26 (3)' } }) }), 'en')).toContain('Closed days: 2026-12-24 – 2026-12-26 (3)')
    expect(render(h(SummaryLine, { item: summary({ change: { field: 'closedDays', before: null, after: '2026-12-24' } }) }), 'hu')).not.toContain('→')
    expect(render(h(SummaryLine, { item: summary({ change: null, type: 'project.note_add' }) }), 'nl')).toBe('')
  })
})

describe('the decision controls', () => {
  const panel = (action: ActionDetail, language: AutomationLanguage = 'en') => render(h(DecisionPanel, { action, onChanged: () => undefined }), language)

  it('offers approve, reject and cancel when the server says so, and only those', () => {
    for (const language of LANGUAGES) {
      const t = automationText(language)
      const html = panel(detail(), language)
      expect(html).toContain(t.approval.approve)
      expect(html).toContain(t.approval.reject)
      expect(html).toContain(t.approval.cancel)
      expect(html).not.toContain(t.approval.retry)
    }
    const nothing = panel(detail({ can: { approve: false, reject: false, cancel: false, retry: false } }))
    expect(nothing).not.toContain(automationEn.approval.approve)
    expect(nothing).toContain(automationEn.approval.cannot)
    const retry = panel(detail({ status: 'failed', can: { approve: false, reject: false, cancel: false, retry: true } }))
    expect(retry).toContain(automationEn.approval.retry)
    expect(retry).not.toContain(automationEn.approval.approve)
    expect(panel(detail({ status: 'completed', can: { approve: false, reject: false, cancel: false, retry: false } }))).toBe('')
  })

  it('asks for the second confirmation where the action needs one, and starts with the approval disabled until it is ticked', () => {
    const needs = panel(detail({ requiresSecondConfirmation: true }))
    expect(needs).toContain(automationEn.approval.second)
    expect(needs).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<[^>]+>)*[^<]*Approve and carry out/)
    expect(panel(detail({ requiresSecondConfirmation: false }))).not.toContain(automationEn.approval.second)
    expect(panel(detail({ requiresSecondConfirmation: false }))).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*(<[^>]+>)*[^<]*Approve and carry out/)
  })

  it('labels the rejection note and every button with a name', () => {
    for (const language of LANGUAGES) {
      const html = panel(detail(), language)
      expect(html).toContain(automationText(language).approval.rejectNote)
      expect(html).toContain('<section')
      expect(html).toMatch(/aria-labelledby="[^"]+"/)
    }
  })
})

describe('the words for a failed request, in the language of the screen', () => {
  const failing = (status: number, details: Record<string, unknown> = {}, fields: Record<string, string> = {}) => new ApiError(status, 'conflict', 'x', fields, null, details)

  it('says the server\'s reason in words, never the technical message', () => {
    for (const language of LANGUAGES) {
      const t = automationText(language)
      expect(errorSentence(t, failing(409, { reason: 'target_changed' }))).toBe(t.failures.target_changed)
      expect(errorSentence(t, failing(409, { reason: 'not_awaiting_approval' }))).toBe(t.errors.not_awaiting_approval)
      expect(errorSentence(t, failing(409, { reason: 'payload_mismatch' }))).toBe(t.errors.payload_mismatch)
      expect(errorSentence(t, failing(422, {}, { secondConfirmation: 'required' }))).toBe(t.errors.secondConfirmation)
      expect(errorSentence(t, failing(403))).toBe(t.errors.forbidden)
      expect(errorSentence(t, failing(404))).toBe(t.errors.notFound)
      expect(errorSentence(t, new Error('network down'))).toBe(t.errors.generic)
      expect(errorSentence(t, failing(500, { reason: 'something_new' }))).toBe(t.errors.generic)
    }
  })
})

describe('the address: a hand-edited address cannot ask for anything odd', () => {
  it('keeps only values the server would accept, and writes only what differs from the default', () => {
    const read = (query: string) => readFilters(new URLSearchParams(query))
    expect(read('')).toEqual({ tab: 'pending', filters: DEFAULT_FILTERS })
    expect(read('tab=history&status=failed&type=project.note_add&target=PRJ-ABC&from=2026-11-01&to=2026-11-30&page=3').filters).toEqual({ status: 'failed', type: 'project.note_add', admin: '', target: 'PRJ-ABC', from: '2026-11-01', to: '2026-11-30', page: 3 })
    expect(read("status=drop table&type=<script>&target=a b&from=yesterday&page=-4&admin=%27").filters).toEqual(DEFAULT_FILTERS)
    expect(read('tab=nonsense').tab).toBe('pending')
    expect(writeFilters('pending', DEFAULT_FILTERS).toString()).toBe('')
    expect(writeFilters('history', { ...DEFAULT_FILTERS, status: 'failed', page: 2 }).toString()).toBe('tab=history&status=failed&page=2')
    expect(queryFor('history', { ...DEFAULT_FILTERS, type: 'project.note_add' })).toEqual({ tab: 'history', type: 'project.note_add', page: 1, pageSize: 20 })
  })

  it('shows a moment in the screen\'s language, and a dash for none', () => {
    expect(moment(null, 'en')).toBe('—')
    expect(moment('nonsense', 'hu')).toBe('—')
    expect(moment('2026-11-03T10:00:00.000Z', 'en')).toMatch(/2026/)
    expect(moment('2026-11-03T10:00:00.000Z', 'hu')).toMatch(/2026/)
  })
})

describe('the proposal card in the assistant\'s chat', () => {
  const call = (output: unknown): ToolCall => ({ id: 'c1', name: 'proposeProjectNote', state: 'done', output })
  const good = { status: 'awaiting_approval', approvalRequired: true, duplicate: false, proposal: { reference: 'ACT-ABCDEFGH', type: 'project.note_add', expiresAt: '2026-11-03T11:00:00.000Z', requiresSecondConfirmation: false }, link: { type: 'proposal', reference: 'ACT-ABCDEFGH', path: '/automation/ACT-ABCDEFGH' } }

  it('reads only a result the server marked as a proposal, and only the page of that action', () => {
    expect(proposalOf(call(good))).toMatchObject({ reference: 'ACT-ABCDEFGH', path: '/automation/ACT-ABCDEFGH' })
    for (const bad of [
      { ...good, status: 'completed' },
      { ...good, approvalRequired: false },
      { ...good, link: { ...good.link, path: '/automation/ACT-ABCDEFGH/../../ai' } },
      { ...good, link: { ...good.link, path: 'https://evil.example/automation/ACT-ABCDEFGH' } },
      { ...good, link: { ...good.link, path: '/automation/ACT-ZZZZZZZZ' } },
      { ...good, proposal: { ...good.proposal, reference: 'ACT-abc' } },
      { status: 'awaiting_approval' },
      'text',
      null,
    ]) expect(proposalOf(call(bad)), JSON.stringify(bad)).toBeNull()
  })

  it('says nothing has been done, links to the action\'s own page and has no approval control of its own, in every language', () => {
    for (const language of LANGUAGES) {
      const t = automationText(language)
      const proposal = proposalOf(call({ ...good, proposal: { ...good.proposal, requiresSecondConfirmation: true } }))!
      const html = plain(renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language: language === 'hu' ? 'hu' : 'en', children: h(AssistantTextProvider, { language, children: h(ProposalCard, { proposal }) }) }))))
      expect(html).toContain(t.card.notDone)
      expect(html).toContain(t.card.open)
      expect(html).toContain(t.card.secondConfirmation)
      expect(html).toContain('href="/admin/automation/ACT-ABCDEFGH"')
      expect(html).not.toContain(t.approval.approve)
      expect(html).not.toContain('<button')
    }
  })
})

describe('no word on the screen is written into a component', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), 'src', 'admin', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const files = ['automation/Parts.tsx', 'pages/AutomationPage.tsx', 'pages/AutomationActionPage.tsx', 'automation/text.tsx']

  it('has no text between tags and no sentence in an attribute: everything is an expression from the dictionary', () => {
    for (const file of files) {
      const code = read(file)
      // A `>` that closes a type (`Promise<…>`) or ends a statement is not a tag: only text between two tags counts.
      expect((code.match(/>\s*[A-Za-z][^<>{}\n]*</g) ?? []).filter((found) => !/^>\s*(?:return\b|const\b|Promise<)/.test(found)), `${file}: text between tags`).toEqual([])
      expect(code.match(/\b(?:label|title|aria-label|placeholder|hint|alt)="[^"{]*[A-Za-z][^"]*"/g) ?? [], `${file}: text in an attribute`).toEqual([])
    }
  })

  it('shows nothing a visitor or an assistant wrote as markup', () => {
    for (const file of files) expect(read(file), file).not.toMatch(/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML/)
    const cards = read('assistant/Cards.tsx')
    expect(cards).not.toMatch(/dangerouslySetInnerHTML|innerHTML/)
  })
})
