import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UIMessage } from 'ai'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { CONTEXT_TYPES } from '../api/assistant'
import { AdminTextProvider } from '../i18n'
import { assistantEn, assistantHu, assistantNl, assistantText } from '../i18n/assistant'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { NAVIGATION } from '../components/navigation'
import { DraftCard, OutlineCard, ReportCard } from './Cards'
import { RichText } from './Markup'
import { conversationSummary, exportFileName, factLines, humanKey, reportToText } from './exporters'
import { contextFromParams, contextPath, draftOf, linksIn, outlineOf, reportOf, sourcesOf, toolCallsOf, isSafePath, type Report, type ToolCall } from './model'
import { History, Insights } from './Panes'
import { AssistantTextProvider } from './text'
import { Composer, MessageView, Thread } from './Thread'
import { chatErrorCode } from './useAssistantChat'

/**
 * PROMPT 31, the assistant's screen without a browser: the three languages say the same things, every tool, report, limit and error of the server has its words, what the
 * assistant produces is drawn as text with its label (a report keeps database facts apart from the assistant's opinion, a draft says nothing was sent), a link can only be one
 * the server's tools returned, the markup of an answer can never become HTML, and the screen's source holds no sentence of its own, no raw colour and no way to reach the model.
 */

const SERVER = join(process.cwd(), 'server', 'src', 'modules', 'ai', 'adminassistant')
const serverFile = (...parts: string[]) => readFileSync(join(SERVER, ...parts), 'utf8')

function flatten(value: unknown, path = ''): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (node: unknown, at: string) => {
    if (typeof node === 'string') out.set(at, node)
    else if (Array.isArray(node)) node.forEach((item, index) => visit(item, `${at}[${index}]`))
    else if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) visit(child, at ? `${at}.${key}` : key)
    else throw new Error(`${at}: a dictionary holds strings only`)
  }
  visit(value, path)
  return out
}
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

const english = flatten(assistantEn)
const hungarian = flatten(assistantHu)
const dutch = flatten(assistantNl)

describe('the three languages of the screen', () => {
  it('have exactly the same keys (so no sentence is missing in one of them)', () => {
    expect([...hungarian.keys()].sort()).toEqual([...english.keys()].sort())
    expect([...dutch.keys()].sort()).toEqual([...english.keys()].sort())
  })

  it('use the same placeholders, leave none open, and have no empty text', () => {
    for (const [name, entries] of [['hu', hungarian], ['nl', dutch]] as const) {
      const different = [...english].filter(([key, value]) => JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(entries.get(key) ?? ''))).map(([key]) => key)
      expect(different, name).toEqual([])
    }
    for (const [name, entries] of [['en', english], ['hu', hungarian], ['nl', dutch]] as const) {
      expect([...entries].filter(([, value]) => value.trim() === '' || /\$\{|\[object|undefined/.test(value) || (value.match(/\{/g) ?? []).length !== (value.match(/\}/g) ?? []).length).map(([key]) => key), name).toEqual([])
    }
  })

  it('translated every long sentence: none is identical to the English one', () => {
    for (const [name, entries] of [['hu', hungarian], ['nl', dutch]] as const) {
      const same = [...english].filter(([key, value]) => value.length > 40 && value === entries.get(key)).map(([key]) => key)
      expect(same, name).toEqual([])
    }
  })

  it('give the right language names and answer in the language that was asked for', () => {
    expect(assistantText('hu')).toBe(assistantHu)
    expect(assistantText('nl')).toBe(assistantNl)
    expect(assistantText('en')).toBe(assistantEn)
    expect(assistantNl.language.names.nl).toBe('Nederlands')
    expect(assistantHu.language.names.hu).toBe('magyar')
  })

  it('has a name for every one of the server\'s thirty-one tools, and for nothing else', () => {
    const tools = serverFile('tools.ts')
    const block = /export const ADMIN_TOOL_NAMES = \[([\s\S]*?)\] as const/.exec(tools)?.[1] ?? ''
    const names = [...block.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1])
    expect(names).toHaveLength(31)
    for (const dictionary of [assistantEn, assistantHu, assistantNl]) expect(Object.keys(dictionary.tools.names).sort()).toEqual([...names].sort())
  })

  it('has a title for every report the server can make, and words for every limitation and every missing-information code it can name', () => {
    const reports = serverFile('reports.ts')
    const kinds = [...(/export const REPORT_KINDS = \[([\s\S]*?)\] as const/.exec(reports)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
    expect(kinds).toHaveLength(7)
    const limitations = [...(/const LIMITATIONS = \[([\s\S]*?)\]/.exec(reports)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
    expect(limitations.length).toBeGreaterThanOrEqual(5)
    const readers = readdirSync(join(SERVER, 'readers')).map((file) => readFileSync(join(SERVER, 'readers', file), 'utf8')).join('\n')
    const missing = new Set([...readers.matchAll(/(?:missing|unknowns)\.push\(([^)]*)\)/g)].flatMap((match) => [...match[1].matchAll(/'([a-z_]+)'/g)].map((code) => code[1])))
    for (const code of ['name', 'company', 'no_projects']) missing.add(code)
    expect(missing.size).toBeGreaterThanOrEqual(15)
    const areas = [...readers.matchAll(/unavailable\.push\('([a-z_]+)'\)/g)].map((match) => match[1])
    for (const dictionary of [assistantEn, assistantHu, assistantNl]) {
      expect(Object.keys(dictionary.report.titles).sort()).toEqual([...kinds].sort())
      expect(Object.keys(dictionary.report.limitationTexts).sort()).toEqual([...limitations].sort())
      for (const code of missing) expect(Object.keys(dictionary.report.missingTexts), code).toContain(code)
      for (const area of areas) expect(Object.keys(dictionary.report.unavailableAreas), area).toContain(area)
    }
  })

  it('has words for every reason the server gives for refusing a question, and suggested questions for every kind of context', () => {
    const gateway = readFileSync(join(process.cwd(), 'server', 'src', 'modules', 'ai', 'gateway.ts'), 'utf8')
    const adminPart = gateway.slice(gateway.indexOf('async adminChat('), gateway.indexOf('private afterFailure'))
    const reasons = new Set([...adminPart.matchAll(/reason: '([a-z_]+)'/g)].map((match) => match[1]))
    for (const reason of reasons) if (!['unavailable', 'shutting_down'].includes(reason)) expect(Object.keys(assistantEn.errors), reason).toContain(reason)
    for (const dictionary of [assistantEn, assistantHu, assistantNl]) {
      expect(Object.keys(dictionary.suggestions).sort()).toEqual([...CONTEXT_TYPES].sort())
      for (const list of Object.values(dictionary.suggestions)) expect(list.length).toBeGreaterThanOrEqual(4)
      expect(Object.keys(dictionary.context.types).sort()).toEqual([...CONTEXT_TYPES].sort())
    }
  })
})

describe('what the screen reads out of the messages', () => {
  const message = (parts: unknown[], id = 'm1'): UIMessage => ({ id, role: 'assistant', parts }) as UIMessage
  const tool = (name: string, output: unknown, state = 'output-available') => ({ type: `tool-${name}`, toolCallId: `${name}-1`, state, input: {}, output })

  it('collects the records a tool pointed at, once each, and nothing whose page is not one of the administration\'s record pages', () => {
    const found = linksIn({
      items: [
        { reference: 'CC-2026-000001', link: { type: 'quote', reference: 'CC-2026-000001', path: '/quotes/abc' } },
        { link: { type: 'quote', reference: 'CC-2026-000001', path: '/quotes/abc' } },
        { link: { type: 'project', reference: 'PRJ-1', path: '/client-projects/p-1' } },
        { link: { type: 'quote', reference: 'EVIL', path: 'javascript:alert(1)' } },
        { link: { type: 'quote', reference: 'EVIL2', path: 'https://evil.example/quotes/1' } },
        { link: { type: 'quote', reference: 'EVIL3', path: '/quotes/../../etc' } },
        { link: { type: 'quote', reference: 'EVIL4', path: '//evil.example' } },
        { link: { type: 'other', reference: 'X', path: '/quotes/x' } },
      ],
    })
    expect([...found.keys()].sort()).toEqual(['project:PRJ-1', 'quote:CC-2026-000001'])
    expect(isSafePath('/clients/1/work')).toBe(true)
    expect(isSafePath('/admin/quotes/1')).toBe(false)
    expect(isSafePath('/quotes/1?x=1')).toBe(false)
    expect(sourcesOf([message([tool('searchAdminQuotes', { items: [{ link: { type: 'quote', reference: 'CC-1', path: '/quotes/1' } }] })])]).map((source) => source.reference)).toEqual(['CC-1'])
  })

  it('names the state of every tool call, and counts a refused one as failed', () => {
    const calls = toolCallsOf(message([tool('getBusinessOverview', { basis: 'actual' }), tool('searchAdminQuotes', { error: 'not_available' }), tool('getAdminProjectDetails', undefined, 'input-available'), tool('summarizeProject', undefined, 'output-error'), { type: 'text', text: 'hello' }]))
    expect(calls.map((call) => [call.name, call.state])).toEqual([['getBusinessOverview', 'done'], ['searchAdminQuotes', 'failed'], ['getAdminProjectDetails', 'running'], ['summarizeProject', 'failed']])
  })

  it('reads a report, a draft and an outline only in the shape the server gives them', () => {
    const call = (name: string, output: unknown): ToolCall => ({ id: name, name, state: 'done', output })
    const report = reportOf(call('generateProjectReport', { status: 'report_generated', report: { kind: 'project_status', generatedAt: '2026-11-03T10:00:00.000Z', subject: { type: 'project', reference: 'PRJ-1', path: '/client-projects/1' }, period: { description: 'now' }, dataSources: ['client_projects'], confirmedFacts: { a: 1 }, aiObservations: ['x', 3], recommendations: [], missingInformation: ['milestones'], limitations: ['human_review_required'], notAvailableToYou: [] } }))
    expect(report).toMatchObject({ kind: 'project_status', subject: { reference: 'PRJ-1' }, aiObservations: ['x'], missingInformation: ['milestones'] })
    expect(reportOf(call('x', { status: 'report_generated', report: { kind: 'project_status' } }))).toBeNull()
    expect(reportOf(call('x', { report: { kind: 'a', generatedAt: 'b' } }))).toBeNull()
    const unsafe = reportOf(call('x', { status: 'report_generated', report: { kind: 'k', generatedAt: 't', subject: { type: 'project', reference: 'PRJ-1', path: 'https://evil.example' } } }))
    expect(unsafe?.subject).toBeNull()

    expect(draftOf(call('draftCustomerReply', { status: 'draft_not_sent', body: 'Hello', language: 'nl', customerPreferredLanguage: 'nl', conversationReference: 'MSG-1', link: { path: '/communications/MSG-1' } }))).toMatchObject({ kind: 'reply', body: 'Hello', path: '/communications/MSG-1' })
    expect(draftOf(call('translateCustomerReply', { status: 'draft_not_sent', body: 'Hallo', language: 'nl' }))).toMatchObject({ kind: 'translation', path: null })
    expect(draftOf(call('draftCustomerReply', { status: 'sent', body: 'Hello' }))).toBeNull()
    expect(draftOf(call('draftCustomerReply', { error: 'language_mismatch' }))).toBeNull()

    const outline = outlineOf(call('prepareQuotationOutline', { stage: 'outline', quoteReference: 'CC-1', outline: { introduction: 'Hi', scope: ['A', 'B'] }, link: { path: '/quotes/1' } }))
    expect(outline?.sections.introduction).toEqual(['Hi'])
    expect(outline?.sections.scope).toEqual(['A', 'B'])
    expect(outline?.sections.exclusions).toEqual([])
    expect(outlineOf(call('prepareQuotationOutline', { stage: 'facts' }))).toBeNull()
  })

  it('starts a conversation about a record from an address only when it names a kind and a reference the server would accept', () => {
    expect(contextFromParams('project', 'PRJ-ABC123')).toMatchObject({ type: 'project', ref: 'PRJ-ABC123' })
    expect(contextFromParams('general', 'x')).toBeNull()
    expect(contextFromParams('project', null)).toBeNull()
    expect(contextFromParams('project', "PRJ-1' OR 1=1")).toBeNull()
    expect(contextFromParams('project', '../etc')).toBeNull()
    expect(contextFromParams('everything', 'PRJ-1')).toBeNull()
    expect(contextPath({ type: 'project', ref: 'PRJ-1' }, [{ type: 'project', reference: 'PRJ-1', path: '/client-projects/1' }])).toBe('/client-projects/1')
    expect(contextPath({ type: 'general', ref: null }, [])).toBeNull()
  })
})

describe('what an error means', () => {
  it.each([
    [JSON.stringify({ error: { code: 'service_unavailable', details: { reason: 'admin_disabled' } } }), 'admin_disabled'],
    [JSON.stringify({ error: { code: 'service_unavailable', details: { reason: 'model_unverified' } } }), 'model_unverified'],
    [JSON.stringify({ error: { code: 'rate_limited', details: { reason: 'daily_budget' } } }), 'budget'],
    [JSON.stringify({ error: { code: 'conflict', details: { reason: 'busy' } } }), 'busy'],
    [JSON.stringify({ error: { code: 'rate_limited' } }), 'rate_limited'],
    [JSON.stringify({ error: { code: 'unauthorized' } }), 'unauthorized'],
    [JSON.stringify({ error: { code: 'csrf_failed' } }), 'forbidden'],
    [JSON.stringify({ error: { code: 'validation_failed', details: { fields: { text: 'tooLong' } } } }), 'tooLong'],
    [JSON.stringify({ error: { code: 'validation_failed', details: { fields: { text: 'required' } } } }), 'empty'],
    [JSON.stringify({ error: { code: 'validation_failed', details: { reason: 'sensitive_data' } } }), 'sensitive_data'],
    [JSON.stringify({ error: { code: 'not_found', details: { reason: 'context_unavailable' } } }), 'context_unavailable'],
    ['Failed to fetch', 'network'],
    ['model_mismatch', 'model_mismatch'],
    ['something odd happened to the stream', 'generic'],
  ])('%s is %s', (message, code) => {
    expect(chatErrorCode(new Error(message))).toBe(code)
  })

  it('says nothing when there is no error', () => {
    expect(chatErrorCode(undefined)).toBeNull()
  })
})

// ---- drawing -------------------------------------------------------------------------------------------------------------------------

type Lang = 'hu' | 'en' | 'nl'
const render = (node: ReactElement, language: Lang = 'en'): string => renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language: language === 'nl' ? 'en' : language, children: h(AssistantTextProvider, { language, children: node }) })))
const noop = () => undefined

const report: Report = {
  kind: 'project_status',
  generatedAt: '2026-11-03T10:00:00.000Z',
  subject: { type: 'project', reference: 'PRJ-ABC123', path: '/client-projects/p-1' },
  period: { description: 'the state at the time of generation' },
  dataSources: ['client_projects', 'project_tasks'],
  confirmedFacts: { project: { status: 'development', overdueTasks: [{ reference: 'T-1' }] } },
  aiObservations: ['One task is overdue <b>according</b> to the stored date.'],
  recommendations: ['Ask the customer for the texts.'],
  missingInformation: ['milestones', 'a_code_nobody_knows'],
  limitations: ['stored_records_only', 'human_review_required'],
  notAvailableToYou: ['projects_and_conversations'],
}

describe('the markup of an answer', () => {
  const links = new Map([['CC-2026-000012', '/quotes/q-12'], ['CC-2026-00001', '/quotes/q-1']])
  const draw = (text: string) => render(h(RichText, { text, links }))

  it('turns a reference that a tool returned into a link to its page, longest first, and leaves every other reference as text', () => {
    const html = draw('See CC-2026-000012 and CC-2026-00001, but not CC-2026-999999 or XCC-2026-00001.')
    expect(html).toContain('href="/quotes/q-12"')
    expect(html).toContain('href="/quotes/q-1"')
    expect(html).not.toContain('CC-2026-999999</a>')
    expect(html).not.toMatch(/XCC-2026-00001<\/a>/)
    expect(html).toContain('>CC-2026-000012</a>')
  })

  it('never lets an answer become HTML or a link of its own', () => {
    const html = draw('<script>alert(1)</script> [click](javascript:alert(1)) <img src=x onerror=alert(1)> https://evil.example/path **bold**')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="javascript')
    expect(html).not.toContain('href="https://evil.example')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('draws lists, numbered lists, headings and tables as elements', () => {
    expect(draw('- one\n- two')).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(draw('1. first\n2. second')).toContain('<ol><li>first</li><li>second</li></ol>')
    expect(draw('## Heading\nbody')).toContain('<strong>Heading</strong>')
    const table = draw('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(table).toContain('<th scope="col">a</th>')
    expect(table).toContain('<td>2</td>')
  })
})

describe('a report', () => {
  it('keeps the facts read from the database apart from the assistant\'s own words, and labels each one in words', () => {
    const html = render(h(ReportCard, { report }))
    expect(html).toContain('Project status report')
    expect(html).toContain('data-tone="database"')
    expect(html).toContain('data-tone="ai"')
    expect(html).toContain('Confirmed facts (read from the database)')
    expect(html).toContain('AI interpretation: not verified data')
    expect(html).toContain('AI recommendations: not verified data')
    expect(html).toContain('One task is overdue &lt;b&gt;according&lt;/b&gt; to the stored date.')
    expect(html).toContain('Milestones')
    expect(html).toContain('a_code_nobody_knows')
    expect(html).toContain('Only stored records are used; nothing is estimated.')
    expect(html).toContain('A person must review this before it is used.')
    expect(html).toContain('Projects, customers and conversations')
    expect(html).toContain('href="/client-projects/p-1"')
    expect(html).toContain('Prepared by an AI assistant. Check it before you rely on it.')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('overdue tasks')
  })

  it('speaks the language of the assistant, in Hungarian and in Dutch', () => {
    expect(render(h(ReportCard, { report }), 'hu')).toContain('AI-értelmezés: nem ellenőrzött adat')
    expect(render(h(ReportCard, { report }), 'hu')).toContain('Projekt-állapotjelentés')
    expect(render(h(ReportCard, { report }), 'nl')).toContain('AI-interpretatie: niet-geverifieerde gegevens')
    expect(render(h(ReportCard, { report }), 'nl')).toContain('Projectstatusrapport')
  })

  it('becomes a plain text with the same headings, for copying and downloading', () => {
    const text = reportToText(report, assistantEn, 'en')
    expect(text).toContain('# Project status report')
    expect(text).toContain('## Confirmed facts (read from the database)')
    expect(text).toContain('overdue tasks:')
    expect(text).toContain('## AI interpretation: not verified data')
    expect(text).toContain('- One task is overdue')
    expect(text).toContain('## Limitations')
    expect(text).toContain('Prepared by an AI assistant.')
    expect(factLines({ a: { b: [1, 2, { c: 'd' }] }, e: null })).toEqual(['a:', '  b:', '    - 1', '    - 2', '    -', '      c: d', 'e: —'])
    expect(factLines(Array.from({ length: 30 }, (_, index) => index)).at(-1)).toBe('- … 5')
    expect(humanKey('overdueTasksNow')).toBe('overdue tasks now')
    expect(exportFileName(assistantNl, new Date('2026-11-03T10:00:00Z'))).toBe('ai-assistent-samenvatting-2026-11-03.txt')
  })
})

describe('a draft and an outline', () => {
  it('says first of all that nothing has been sent, and offers to open the conversation, not to send', () => {
    const html = render(h(DraftCard, { draft: { kind: 'reply', body: 'Dank u voor uw bericht.', language: 'nl', customerPreferredLanguage: 'nl', conversationReference: 'MSG-1', path: '/communications/MSG-1', original: null } }))
    expect(html).toContain('Draft only. Nothing has been sent.')
    expect(html).toContain('send it yourself from the conversation page')
    expect(html).toContain('Dank u voor uw bericht.')
    expect(html).toContain('href="/admin/communications/MSG-1"')
    expect(html).not.toMatch(/>Send</)
    expect(render(h(DraftCard, { draft: { kind: 'translation', body: 'Hello', language: 'en', customerPreferredLanguage: null, conversationReference: null, path: null, original: 'Hallo' } }))).toContain('Translation draft')
    expect(render(h(DraftCard, { draft: { kind: 'reply', body: 'Szia', language: 'hu', customerPreferredLanguage: 'hu', conversationReference: null, path: null, original: null } }), 'hu')).toContain('Csak vázlat. Semmi sem lett elküldve.')
  })

  it('marks a quotation outline as an AI-generated draft that needs a person, without a price anywhere', () => {
    const outline = { quoteReference: 'CC-2026-000001', path: '/quotes/q-1', sections: { introduction: ['Hi'], understanding: ['A bakery website'], scope: ['Home page'], deliverables: [], exclusions: [], assumptions: [], openQuestions: ['Which domain?'] } }
    const html = render(h(OutlineCard, { outline }))
    expect(html).toContain('AI-generated draft: requires human review')
    expect(html).toContain('contains no prices, discounts or dates')
    expect(html).toContain('Home page')
    expect(html).toContain('Questions for the customer')
    expect(html).not.toContain('Deliverables')
    expect(render(h(OutlineCard, { outline }), 'nl')).toContain('moet door een persoon worden nagekeken')
  })
})

describe('the conversation', () => {
  const user = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'What <b>needs</b> my attention?' }] } as UIMessage
  const answer = {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'tool-getAdministrativeAlerts', toolCallId: 't1', state: 'output-available', input: {}, output: { basis: 'x', alerts: [], link: { type: 'quote', reference: 'CC-2026-000001', path: '/quotes/q-1' } } },
      { type: 'tool-searchAdminProjects', toolCallId: 't2', state: 'input-available', input: {} },
      { type: 'tool-draftCustomerReply', toolCallId: 't3', state: 'output-available', input: {}, output: { error: 'language_mismatch' } },
      { type: 'text', text: 'Check **CC-2026-000001** first.\n\n- one\n- two' },
    ],
  } as unknown as UIMessage

  it('draws what was asked as text, and an answer with the tools it used, their state and links to the records', () => {
    const links = new Map([['CC-2026-000001', '/quotes/q-1']])
    const html = render(h('ol', null, h(MessageView, { message: user, links, last: false, busy: false, onCopy: async () => true, onRegenerate: noop }), h(MessageView, { message: answer, links, last: true, busy: false, onCopy: async () => true, onRegenerate: noop })))
    expect(html).toContain('What &lt;b&gt;needs&lt;/b&gt; my attention?')
    expect(html).toContain('Read: Alerts')
    expect(html).toContain('Reading: Searching projects…')
    expect(html).toContain('Not available: Draft reply (not sent)')
    expect(html).toContain('data-state="running"')
    expect(html).toContain('data-state="failed"')
    expect(html).toContain('href="/quotes/q-1"')
    expect(html).toContain('Copy answer')
    expect(html).toContain('Answer again')
    expect(html).toContain('<li>two</li>')
  })

  it('offers the actions of the last answer only when nothing is being written', () => {
    const links = new Map<string, string>()
    expect(render(h(MessageView, { message: answer, links, last: true, busy: true, onCopy: async () => true, onRegenerate: noop }))).not.toContain('Copy answer')
    expect(render(h(MessageView, { message: answer, links, last: false, busy: false, onCopy: async () => true, onRegenerate: noop }))).not.toContain('Copy answer')
  })

  const props = (over: Record<string, unknown> = {}) => ({ messages: [] as UIMessage[], status: 'ready', error: undefined, links: new Map<string, string>(), max: 4000, suggestions: assistantEn.suggestions.general, locked: null, contextLabel: 'The whole business', title: null, onSend: noop, onStop: noop, onRetry: noop, onRegenerate: noop, onNew: noop, onClear: noop, onCopySummary: noop, onExport: noop, composerRef: { current: null }, copied: false, ...over })

  it('starts with the suggested questions, the welcome and the privacy-minded composer', () => {
    const html = render(h(Thread, props()))
    expect(html).toContain('Ask about your projects')
    expect(html).toContain('What needs my attention today?')
    expect(html).toContain('role="group"')
    expect(html).toContain('role="log"')
    expect(html).toContain('Enter sends · Shift+Enter adds a line')
    expect(html).toContain('0 / 4000')
    expect(html).toContain('The whole business')
    expect(html).toContain('Copy summary')
    expect(html).toContain('Export summary')
    expect(html).toContain('Clear conversation')
    expect(render(h(Thread, props({ suggestions: assistantHu.suggestions.general })), 'hu')).toContain('Mire kell ma odafigyelnem?')
    expect(render(h(Thread, props()), 'nl')).toContain('Je vraag')
  })

  it('says what is going on: reading, writing, stopped, failed, and what to do next', () => {
    const base = props({ messages: [user] })
    expect(render(h(Thread, { ...base, status: 'submitted' }))).toContain('Reading your records…')
    expect(render(h(Thread, { ...base, status: 'streaming', messages: [user, answer] }))).toContain('Reading your records…')
    expect(render(h(Thread, { ...base, status: 'streaming', messages: [user, { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Partly' }] } as UIMessage] }))).toContain('Writing the answer…')
    expect(render(h(Thread, { ...base, status: 'streaming' }))).toContain('>Stop<')
    const failed = render(h(Thread, { ...base, status: 'error', error: new Error(JSON.stringify({ error: { code: 'service_unavailable', details: { reason: 'busy' } } })) }))
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('An answer is already being written in this conversation.')
    expect(failed).toContain('Try again')
    const closed = render(h(Thread, { ...base, status: 'error', error: new Error(JSON.stringify({ error: { code: 'conflict', details: { reason: 'conversation_full' } } })) }))
    expect(closed).toContain('This conversation reached its length limit. Start a new one.')
    expect(closed).not.toContain('Try again')
    expect(closed).toContain('New conversation')
    const tooLong = render(h(Thread, { ...base, status: 'error', error: new Error(JSON.stringify({ error: { code: 'validation_failed', details: { fields: { text: 'tooLong' } } } })) }))
    expect(tooLong).toContain('longer than 4000 characters')
  })

  it('cannot be written in when the conversation is closed or its record is gone, and says why', () => {
    const closed = render(h(Thread, props({ messages: [user], locked: 'closed' })))
    expect(closed).toContain('This conversation reached its limit.')
    expect(closed).toMatch(/<textarea[^>]*disabled/)
    const gone = render(h(Thread, props({ messages: [user], locked: 'context' })))
    expect(gone).toContain('The record of this conversation is gone')
    expect(gone).not.toContain('role="group"')
  })

  it('asks for a question before sending, and counts the characters', () => {
    const html = render(h(Composer, { disabled: false, max: 100, busy: false, onSend: noop, onStop: noop, inputRef: { current: null } }))
    expect(html).toContain('Your question')
    expect(html).toContain('type="submit"')
    expect(html).toContain('0 / 100')
    expect(render(h(Composer, { disabled: false, max: 100, busy: true, onSend: noop, onStop: noop, inputRef: { current: null } }))).toContain('>Stop<')
  })
})

describe('the history and the context', () => {
  const summary = (over: Record<string, unknown> = {}) => ({ id: 'ac-1', title: 'What <i>needs</i> my attention', language: 'en', contextType: 'project', contextRef: 'PRJ-ABC123', status: 'active', messageCount: 4, updatedAt: '2026-11-03T10:00:00.000Z', createdAt: '2026-11-03T09:00:00.000Z', ...over })

  it('lists the conversations with their context, marks the open one, and gives every delete button the name of its conversation', () => {
    const html = render(h(History, { conversations: [summary() as never, summary({ id: 'ac-2', title: null, contextType: 'general', contextRef: null }) as never], error: false, query: '', onQuery: noop, activeId: 'ac-1', onOpen: noop, onNew: noop, onDelete: noop }))
    expect(html).toContain('What &lt;i&gt;needs&lt;/i&gt; my attention')
    expect(html).toContain('Untitled conversation')
    expect(html).toContain('Project · PRJ-ABC123 · 4 messages')
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('Delete conversation: What &lt;i&gt;needs&lt;/i&gt; my attention')
    expect(html).toContain('Delete conversation: Untitled conversation')
    expect(html).toContain('New conversation')
    expect(html).toContain('Search conversations')
    expect(render(h(History, { conversations: [], error: false, query: 'zzz', onQuery: noop, activeId: 'x', onOpen: noop, onNew: noop, onDelete: noop }))).toContain('No conversation matches.')
    expect(render(h(History, { conversations: [], error: false, query: '', onQuery: noop, activeId: 'x', onOpen: noop, onNew: noop, onDelete: noop }), 'nl')).toContain('Nog geen gesprekken.')
    expect(render(h(History, { conversations: null, error: true, query: '', onQuery: noop, activeId: 'x', onOpen: noop, onNew: noop, onDelete: noop }))).toContain('The history could not be loaded.')
  })

  const config = { available: true, reason: null, languages: ['hu', 'en', 'nl'], maxInputChars: 4000, retentionDays: 14, canManage: true, model: { name: 'Claude Haiku 5.5', provider: 'Anthropic' }, access: { quotes: true, consultations: true, customers: false, projects: true, conversations: true } } as never

  it('shows the context, that the assistant only reads, the records it used as links, the suggested questions, and how to read an answer', () => {
    const html = render(h(Insights, { config, context: { type: 'project', ref: 'PRJ-ABC123', label: null }, contextPath: '/client-projects/p-1', sources: [{ type: 'quote', reference: 'CC-2026-000001', path: '/quotes/q-1' }], suggestions: assistantEn.suggestions.project, busy: false, locked: false, onAsk: noop, onStart: noop }))
    expect(html).toContain('One project')
    expect(html).toContain('href="/client-projects/p-1"')
    expect(html).toContain('Read-only')
    expect(html).toContain('It can read and prepare. It cannot create, change, send, accept, cancel or delete anything')
    expect(html).toContain('href="/quotes/q-1"')
    expect(html).toContain('Summarise the status of this project.')
    expect(html).toContain('How to read an answer')
    expect(html).toContain('Drafts are never sent.')
    expect(html).toContain('Claude Haiku 5.5 (Anthropic)')
    // A role that may not read customers is not offered customers as a context.
    expect(html).not.toContain('>One customer<')
    expect(html).toContain('>One project<')
    expect(html).toContain('Start a business conversation')
  })

  it('disables the suggested questions while an answer is being written, or when the conversation cannot continue', () => {
    const draw = (busy: boolean, locked: boolean) => render(h(Insights, { config, context: { type: 'general', ref: null, label: null }, contextPath: null, sources: [], suggestions: assistantEn.suggestions.general, busy, locked, onAsk: noop, onStart: noop }))
    expect(draw(true, false)).toMatch(/<button[^>]*disabled[^>]*>What needs my attention today\?/)
    expect(draw(false, true)).toMatch(/<button[^>]*disabled[^>]*>What needs my attention today\?/)
    expect(draw(false, false)).not.toMatch(/<button[^>]*disabled[^>]*>What needs my attention today\?/)
    expect(draw(false, false)).toContain('The records the assistant uses appear here')
  })

  it('summarises a conversation as text with the notice, never with a field of the browser', () => {
    const text = conversationSummary(
      { messages: [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'Q?' }] }, { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'A.' }] }] as UIMessage[], contextLabel: 'One project · PRJ-1', sources: [{ type: 'project', reference: 'PRJ-1', path: '/client-projects/1' }], title: 'My question', now: new Date('2026-11-03T10:00:00Z') },
      assistantHu,
      'hu',
    )
    expect(text).toContain('# AI asszisztens összefoglaló: My question')
    expect(text).toContain('## Kérdés\nQ?')
    expect(text).toContain('## Válasz\nA.')
    expect(text).toContain('- Projekt: PRJ-1')
    expect(text).toContain('Az AI admin asszisztens készítette')
  })
})

// ---- the source itself -----------------------------------------------------------------------------------------------------------------

const ASSISTANT_DIR = join(process.cwd(), 'src', 'admin', 'assistant')
const sourceFiles = readdirSync(ASSISTANT_DIR).filter((name) => /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')).map((name) => [name, readFileSync(join(ASSISTANT_DIR, name), 'utf8')] as const)
const page = readFileSync(join(process.cwd(), 'src', 'admin', 'pages', 'AiAssistantPage.tsx'), 'utf8')
const styles = readFileSync(join(process.cwd(), 'src', 'admin', 'styles', 'assistant.module.scss'), 'utf8')

describe('the source of the screen', () => {
  it('has no sentence of its own: every word between tags is an expression, never a text', () => {
    for (const [name, source] of [...sourceFiles.filter(([file]) => file.endsWith('.tsx')), ['AiAssistantPage.tsx', page] as const]) {
      const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      const literal = [...text.matchAll(/(?<![=-])>\s*([A-Za-z][A-Za-z ,.'’!?-]{2,})\s*</g)].map((match) => match[1].trim()).filter((words) => !/^[A-Z]{1,3}$/.test(words) && words !== 'AI')
      expect(literal, name).toEqual([])
      expect([...text.matchAll(/(?:aria-label|placeholder|title|alt)="([^"{]*[A-Za-z]{3,}[^"]*)"/g)].map((match) => match[1]), name).toEqual([])
    }
  })

  it('cannot reach the model, a key, another address or the page: no fetch of its own, no HTML injection, no storage but the language, no eval', () => {
    for (const [name, source] of sourceFiles) {
      expect(source, name).not.toMatch(/dangerouslySetInnerHTML|innerHTML|eval\(|new Function|document\.write|\.insertAdjacentHTML/)
      expect(source, name).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|apiKey|ANTHROPIC|api\.anthropic/i)
      if (name !== 'text.tsx') expect(source, name).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
    }
    const chat = (sourceFiles.find(([name]) => name === 'useAssistantChat.ts')?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
    // The body of a request names a conversation, a language, a trigger, one text and a context: not a model, a tool, a prompt or a history.
    expect(chat).not.toMatch(/model:|tools:|system:|prompt:|userId|adminId|apiKey/)
    expect(chat).toContain("trigger: 'submit-user-message', text: lastUserText(all)")
    expect(chat).toContain("credentials: 'same-origin'")
  })

  it('uses only the administration\'s tokens for colour and shows a focus ring, a narrow layout, three columns and reduced motion', () => {
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styles).not.toMatch(/\b(?:rgb|hsl)a?\(/)
    expect(styles).toContain(':focus-visible')
    expect(styles).toContain('@container assistant (min-width: 62.5rem)')
    expect(styles).toContain('grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr) minmax(15rem, 20rem)')
    expect(styles).toContain('prefers-reduced-motion: no-preference')
    expect(styles).toContain("&[data-active='true']")
    // Nothing moves except under no-preference.
    for (const match of styles.matchAll(/animation:/g)) expect(styles.slice(0, match.index).lastIndexOf('prefers-reduced-motion: no-preference')).toBeGreaterThan(styles.slice(0, match.index).lastIndexOf('}\n\n.'))
    const global = readFileSync(join(process.cwd(), 'src', 'admin', 'styles', 'admin.css'), 'utf8')
    expect(global).toContain('body[data-printing]')
    expect(global).toContain('[data-printable]')
  })

  it('has a place in the navigation and a route, with a name in both languages of the administration', () => {
    const item = NAVIGATION.find((entry) => entry.id === 'assistant')
    expect(item).toMatchObject({ path: '/ai-assistant', primary: false })
    expect(en.nav.assistant).toBe('AI admin assistant')
    expect(hu.nav.assistant).toBe('AI admin asszisztens')
    expect(readFileSync(join(process.cwd(), 'src', 'admin', 'AdminApp.tsx'), 'utf8')).toContain('<Route path="ai-assistant" element={<AiAssistantPage />} />')
  })
})
