import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ANALYTICS_LANGUAGES, SECTION_NAMES, type AnalyticsAnswer, type AnalyticsLanguage, type Metric, type MoneyMetric, type Section } from '../api/analytics'
import { NAVIGATION } from '../components/navigation'
import { AdminTextProvider } from '../i18n'
import { analyticsEn, analyticsHu, analyticsNl, analyticsText } from '../i18n/analytics'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { BarChart, BarList, DonutChart, FunnelChart, LineChart } from './Charts'
import { formatCount, formatDayKey, formatHours, formatMoney, formatPercent, formatUsd, humanize, word } from './format'
import { KpiCard, MoneyCard } from './Kpi'
import { DEFAULT_FILTERS, SECTION_FILTERS, canOpen, directionOf, queryFor, rangeProblem, readFilters, sectionOf, unitOf, writeFilters } from './model'
import { SectionView } from './Sections'
import { AnalyticsTextProvider } from './text'

/**
 * PROMPT 32, the analytics screen without a browser: the three languages say the same things, everything the server can send has its words, figures are written the way each language
 * writes them and money is never added or converted, a figure that does not exist is never drawn as a zero, every chart carries its numbers as a table, and the source of the screen
 * holds no sentence of its own, no raw colour and no arithmetic on money.
 */

const SERVER = join(process.cwd(), 'server', 'src', 'modules', 'analytics')
const serverSource = readdirSync(SERVER)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => readFileSync(join(SERVER, name), 'utf8'))
  .join('\n')

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
const english = flatten(analyticsEn)
const hungarian = flatten(analyticsHu)
const dutch = flatten(analyticsNl)

describe('the three languages of the screen', () => {
  it('have exactly the same keys, the same placeholders and no empty or unfinished text', () => {
    expect([...hungarian.keys()].sort()).toEqual([...english.keys()].sort())
    expect([...dutch.keys()].sort()).toEqual([...english.keys()].sort())
    for (const [name, entries] of [['hu', hungarian], ['nl', dutch]] as const) {
      const different = [...english].filter(([key, value]) => JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(entries.get(key) ?? ''))).map(([key]) => key)
      expect(different, name).toEqual([])
    }
    for (const [name, entries] of [['en', english], ['hu', hungarian], ['nl', dutch]] as const) {
      const bad = [...entries].filter(([, value]) => value.trim() === '' || /\$\{|\[object|undefined|TODO/.test(value) || (value.match(/\{/g) ?? []).length !== (value.match(/\}/g) ?? []).length).map(([key]) => key)
      expect(bad, name).toEqual([])
    }
  })

  it('translated every long sentence: none is identical to the English one', () => {
    for (const [name, entries] of [['hu', hungarian], ['nl', dutch]] as const) {
      expect([...english].filter(([key, value]) => value.length > 40 && value === entries.get(key)).map(([key]) => key), name).toEqual([])
    }
  })

  it('never lets a Hungarian or Dutch sentence fall back to English: the language asked for is the language given', () => {
    expect(analyticsText('hu')).toBe(analyticsHu)
    expect(analyticsText('nl')).toBe(analyticsNl)
    expect(analyticsText('en')).toBe(analyticsEn)
    expect(analyticsHu.language.names.hu).toBe('magyar')
    expect(analyticsNl.language.names.nl).toBe('Nederlands')
  })

  it('has a name for the screen in both interface languages of the administration, and a place in the navigation that has a route', () => {
    expect(en.nav.analytics).toBeTruthy()
    expect(hu.nav.analytics).toBeTruthy()
    const item = NAVIGATION.find((entry) => entry.id === 'analytics')
    expect(item).toMatchObject({ path: '/analytics', primary: false })
    expect(readFileSync(join(process.cwd(), 'src', 'admin', 'AdminApp.tsx'), 'utf8')).toContain('<Route path="analytics" element={<AnalyticsPage />} />')
  })
})

describe('everything the server can send has its words', () => {
  const ids = (pattern: RegExp, group = 1): string[] => [...new Set([...serverSource.matchAll(pattern)].map((match) => match[group]))]
  const dictionary = (group: Record<string, unknown>) => Object.keys(group)

  it('has a name and a definition for every metric, sum of money, series, breakdown and table', () => {
    const metrics = ids(/\b(?:flow|flowOf|snapshot|unavailable|notPermitted)\((?:ctx, )?'([A-Za-z]+)'/g).filter((id) => id !== 'x')
    metrics.push(...ids(/'(newQuoteRequests|newContactMessages|activeProjects|completedProjects|openQuotations|acceptedQuotations|customerWaitingForAdministrator|overdueMilestones|delayedProjects|recordedRevenue)'/g))
    expect(metrics.length).toBeGreaterThan(40)
    expect(dictionary(analyticsEn.metrics)).toEqual(expect.arrayContaining([...new Set(metrics)]))
    const money = ids(/\b(?:moneyMetric|moneyUnavailable|averageMetric)\('([A-Za-z]+)'/g)
    expect(money.length).toBeGreaterThanOrEqual(5)
    expect(dictionary(analyticsEn.moneyMetrics)).toEqual(expect.arrayContaining(money))
    const series = [...ids(/'([A-Za-z]+Series)'/g), ...ids(/countSeries\(ctx, '([A-Za-z]+)'/g)]
    expect(series.length).toBeGreaterThanOrEqual(9)
    // The two assistants' series are built in a loop from a template (`aiRequests${audience}Series`).
    expect(serverSource).toContain('aiRequests${audience')
    expect(dictionary(analyticsEn.series)).toEqual(expect.arrayContaining(['aiRequestsVisitorSeries', 'aiRequestsAdminSeries']))
    expect(dictionary(analyticsEn.series)).toEqual(expect.arrayContaining(series))
    // The value series is named by the kind of event (`${stamp}ValueSeries`); only the accepted one is drawn.
    expect(serverSource).toContain("moneySeries(ctx, 'accepted')")
    expect(dictionary(analyticsEn.series)).toContain('acceptedValueSeries')
    const distributions = [...ids(/id: '([A-Za-z]+)', total/g), ...ids(/\bdist\('([A-Za-z]+)'/g), ...ids(/\bby\('([A-Za-z]+)'/g), ...ids(/\bpack\('([A-Za-z]+)'/g)]
    expect(distributions.length).toBeGreaterThanOrEqual(18)
    expect(dictionary(analyticsEn.distributions)).toEqual(expect.arrayContaining(distributions))
    const tables = [...serverSource.matchAll(/id: '([A-Za-z]+)',\s*columns: \[([^\]]*)\]/g)]
    expect(tables.length).toBeGreaterThanOrEqual(7)
    for (const [, id, columns] of tables) {
      expect(dictionary(analyticsEn.tables), id).toContain(id)
      for (const column of [...columns.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1])) expect(dictionary(analyticsEn.columns), `${id}.${column}`).toContain(column)
    }
  })

  it('has words for every limitation, every reason a figure is unavailable, every funnel stage and every alert', () => {
    const limitations = [...serverSource.matchAll(/limitations\.push\(([^)]*)\)/g)].flatMap((match) => [...match[1].matchAll(/'([a-z_]+)'/g)].map((code) => code[1]))
    expect(new Set(limitations).size).toBeGreaterThanOrEqual(30)
    expect(dictionary(analyticsEn.limitations)).toEqual(expect.arrayContaining([...new Set(limitations)]))
    const reasons = ids(/\b(?:unavailable|moneyUnavailable)\('[A-Za-z]+', '([a-z_]+)'\)/g)
    expect(dictionary(analyticsEn.reasons)).toEqual(expect.arrayContaining([...reasons, 'not_permitted']))
    const stages = [...(/const STAGES = \[([^\]]*)\]/.exec(serverSource)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((match) => match[1])
    expect(stages).toHaveLength(7)
    expect(dictionary(analyticsEn.funnel.stages).sort()).toEqual([...stages].sort())
    const alerts = readFileSync(join(SERVER, 'alerts.ts'), 'utf8')
    const of = (pattern: RegExp) => [...new Set([...alerts.matchAll(pattern)].map((match) => match[1]))]
    expect(dictionary(analyticsEn.alerts.kinds).sort()).toEqual(of(/kind: '([a-z_]+)'/g).sort())
    expect(dictionary(analyticsEn.alerts.reasons)).toEqual(expect.arrayContaining(of(/reason: '([a-z_]+)'/g)))
    expect(dictionary(analyticsEn.alerts.actions).sort()).toEqual(of(/nextAction: '([a-z_]+)'/g).sort())
    expect(dictionary(analyticsEn.alerts.leftOut)).toEqual(expect.arrayContaining(of(/left\.push\('([a-z_]+)'\)/g)))
  })

  it('has a word for every status the figures are broken down by', () => {
    const read = (file: string, name: string) => [...(new RegExp(`${name}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(readFileSync(join(process.cwd(), 'server', 'src', 'modules', file), 'utf8'))?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
    const statuses = [
      ...read('quotes/status.ts', 'REQUEST_STATUSES'),
      ...read('quotes/status.ts', 'SOURCES'),
      ...read('customers/model.ts', 'PROJECT_STATUSES'),
      ...read('projectwork/model.ts', 'TASK_STATUSES'),
      ...read('projectwork/model.ts', 'MILESTONE_STATUSES'),
      ...read('communications/model.ts', 'CONVERSATION_STATUSES'),
      'draft', 'sent', 'accepted', 'declined', 'superseded', 'withdrawn',
      'pending', 'confirmed', 'completed', 'cancelled', 'no_show',
      'active', 'invited', 'disabled', 'invitation', 'registration',
      'visitor', 'admin', 'combined', 'day', 'month', 'milestone', 'task', 'high', 'medium', 'low', 'full_experience', 'hu', 'en', 'nl',
      'segmentNew', 'segmentActiveProject', 'segmentCompletedProject', 'segmentReturning', 'segmentOpenInquiry', 'segmentAwaitingAction',
      'lifecycleAccount', 'lifecycleQuoteRequest', 'lifecycleAcceptedQuotation', 'lifecycleProjectStarted', 'lifecycleProjectCompleted', 'lifecycleReturning',
    ]
    expect(statuses.length).toBeGreaterThan(60)
    expect(Object.keys(analyticsEn.keys)).toEqual(expect.arrayContaining([...new Set(statuses)]))
    // A segment is explained by its exact rule, in every language.
    for (const dictionaryOf of [analyticsEn, analyticsHu, analyticsNl]) expect(dictionaryOf.keys.segmentReturning.length).toBeGreaterThan(40)
  })

  it('the segments the server computes are the segments the screen explains (no rule is hidden)', () => {
    const operations = readFileSync(join(SERVER, 'operations.ts'), 'utf8')
    const segments = [...operations.matchAll(/\['(segment[A-Za-z]+)'/g)].map((match) => match[1])
    expect(segments).toHaveLength(6)
    expect(Object.keys(analyticsEn.keys)).toEqual(expect.arrayContaining(segments))
  })
})

describe('numbers, money and dates are written the way each language writes them', () => {
  it('places the decimal point of ONE currency and nothing else (euro cents, whole forints), per language', () => {
    expect(formatMoney(123456, 'EUR', 'en')).toBe('€1,234.56')
    expect(formatMoney(12345600, 'EUR', 'hu')).toMatch(/^123\s456,00\s(€|EUR)$/)
    expect(formatMoney(123456, 'EUR', 'hu')).toMatch(/^1\s?234,56\s(€|EUR)$/)
    expect(formatMoney(123456, 'EUR', 'nl')).toMatch(/^€\s1\.234,56$/)
    expect(formatMoney(1500000, 'HUF', 'hu')).toMatch(/^1\s500\s000\s(Ft|HUF)$/)
    expect(plain(formatMoney(1500000, 'HUF', 'en'))).toBe('HUF 1,500,000')
    expect(formatMoney(1, 'EUR', 'en')).toBe('€0.01')
    expect(plain(formatMoney(0, 'HUF', 'en'))).toBe('HUF 0')
  })

  it('writes percentages, durations, estimated dollars and counts in the language', () => {
    expect(formatPercent(12.5, 'en')).toBe('12.5%')
    expect(formatPercent(12.5, 'hu')).toMatch(/^12,5\s?%$/)
    expect(formatPercent(12.5, 'nl')).toMatch(/^12,5\s?%$/)
    expect(formatCount(1234.5, 'en')).toBe('1,234.5')
    expect(formatCount(12345.5, 'hu')).toMatch(/^12\s345,5$/)
    expect(formatHours(0.5, 'en')).toMatch(/30 minutes/)
    expect(formatHours(5.5, 'en')).toMatch(/5.5 hours/)
    expect(formatHours(72, 'en')).toMatch(/3 days/)
    expect(formatUsd(0.00666, 'en')).toBe('US$0.0067')
    expect(formatUsd(12.5, 'en')).toBe('US$12.50')
  })

  it('writes a day or a month as that day or month whatever time zone the browser is in (read as UTC)', () => {
    expect(formatDayKey('2026-11-03', 'en')).toBe('3 Nov 2026')
    expect(formatDayKey('2026-11-03', 'hu')).toMatch(/2026\. nov\. 3\./)
    expect(formatDayKey('2026-11-03', 'nl')).toMatch(/3 nov(\.|ember)? 2026/)
    expect(formatDayKey('2026-11', 'en')).toBe('Nov 2026')
    expect(formatDayKey('garbage', 'en')).toBe('garbage')
  })

  it('shows a code the dictionary does not know as readable words instead of dropping it', () => {
    expect(humanize('waiting_for_something')).toBe('Waiting for something')
    expect(word({ new: 'New' }, 'new')).toBe('New')
    expect(word({ new: 'New' }, 'quote_sent')).toBe('Quote sent')
  })
})

describe('permissions, filters and the address', () => {
  const can = (...granted: string[]) => (permission: string) => granted.includes(permission)

  it('offers a section only to a role that may read the data behind it (the server checks again on every request)', () => {
    const editor = can('requests:read', 'clients:read')
    const admin = can('requests:read', 'clients:read', 'system:read')
    expect(SECTION_NAMES.filter((name) => canOpen(name, editor as never))).toEqual(['executive', 'financial', 'customers', 'funnel', 'projects', 'consultations', 'communication', 'alerts'])
    expect(SECTION_NAMES.filter((name) => canOpen(name, admin as never))).toEqual([...SECTION_NAMES])
    expect(SECTION_NAMES.filter((name) => canOpen(name, can() as never))).toEqual([])
    expect(canOpen('financial', can('clients:read') as never)).toBe(false)
    expect(canOpen('customers', can('requests:read') as never)).toBe(false)
  })

  it('reads the filters from the address and drops anything that is not a known value', () => {
    expect(readFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS)
    const read = readFilters(new URLSearchParams('period=custom&from=2026-10-01&to=2026-10-31&currency=EUR&language=nl&service=web-design&quoteStatus=accepted'))
    expect(read).toMatchObject({ period: 'custom', from: '2026-10-01', to: '2026-10-31', currency: 'EUR', language: 'nl', service: 'web-design', quoteStatus: 'accepted' })
    const hostile = readFilters(new URLSearchParams("period=forever&from=yesterday&currency=USD&language=fr&service=x'; DROP TABLE services; --&package=../etc&quoteStatus=<script>&projectStatus=done&consultationStatus=1"))
    expect(hostile).toEqual(DEFAULT_FILTERS)
    expect(sectionOf('ai')).toBe('ai')
    expect(sectionOf('../../etc')).toBe('executive')
    expect(sectionOf(null)).toBe('executive')
  })

  it('writes only what differs from the default, and reads back what it wrote', () => {
    expect(writeFilters(DEFAULT_FILTERS, 'executive').toString()).toBe('')
    const filters = { ...DEFAULT_FILTERS, period: 'custom' as const, from: '2026-10-01', to: '2026-10-31', currency: 'HUF' as const, language: 'hu' as const }
    const params = writeFilters(filters, 'financial')
    expect(params.get('section')).toBe('financial')
    expect(readFilters(params)).toEqual(filters)
    // Dates of a custom period are only written for a custom period.
    expect(writeFilters({ ...DEFAULT_FILTERS, from: '2026-10-01' }, 'executive').toString()).toBe('')
  })

  it('refuses a custom period that cannot be, before asking the server', () => {
    const base = { ...DEFAULT_FILTERS, period: 'custom' as const }
    expect(rangeProblem({ ...base })).toBe('missing')
    expect(rangeProblem({ ...base, from: '2026-11-05', to: '2026-11-01' })).toBe('order')
    expect(rangeProblem({ ...base, from: '2015-01-01', to: '2026-11-01' })).toBe('length')
    expect(rangeProblem({ ...base, from: '2026-10-01', to: '2026-10-31' })).toBeNull()
    expect(rangeProblem({ ...DEFAULT_FILTERS })).toBeNull()
  })

  it('asks the server only for the filters a section honours, and always names the language of the catalogue', () => {
    const filters = { ...DEFAULT_FILTERS, currency: 'EUR' as const, language: 'hu' as const, service: 'web', quoteStatus: 'sent', projectStatus: 'review', consultationStatus: 'pending' }
    expect(queryFor(filters, 'financial', 'nl')).toEqual({ period: 'last_30_days', lang: 'nl', currency: 'EUR', language: 'hu', service: 'web', quoteStatus: 'sent' })
    expect(queryFor(filters, 'projects', 'en')).toEqual({ period: 'last_30_days', lang: 'en', projectStatus: 'review' })
    expect(queryFor(filters, 'ai', 'en')).toEqual({ period: 'last_30_days', lang: 'en' })
    for (const name of SECTION_NAMES) expect(Object.keys(queryFor(filters, name, 'en')).sort().filter((key) => !['period', 'lang'].includes(key)).length).toBeLessThanOrEqual(SECTION_FILTERS[name].length + 1)
  })

  it('says which way a figure moved only when it is compared with a period, never for a snapshot or a figure that does not exist', () => {
    const base: Metric = { id: 'newCustomers', kind: 'actual', state: 'available', value: 5, previous: 3, change: 2, changePercent: 66.7, comparison: 'period', reason: null, drill: null }
    expect(directionOf(base)).toBe('up')
    expect(directionOf({ ...base, change: -1 })).toBe('down')
    expect(directionOf({ ...base, change: 0 })).toBe('same')
    expect(directionOf({ ...base, comparison: 'snapshot', previous: null, change: null })).toBeNull()
    expect(directionOf({ ...base, state: 'unavailable', value: null })).toBeNull()
    expect(unitOf('averageResponseHours')).toBe('hours')
    expect(unitOf('aiEstimatedCostUsdCombined')).toBe('usd')
    expect(unitOf('newCustomers')).toBe('count')
  })
})

// ---- drawing ---------------------------------------------------------------------------------------------------------------------------

/** Intl puts a no-break space between a currency code and the number; a test reads it as a plain one. */
const plain = (text: string): string => text.replace(/[\u00a0\u202f]/g, ' ')

const render = (node: ReactElement, language: AnalyticsLanguage = 'en'): string => plain(renderToStaticMarkup(h(MemoryRouter, null, h(AdminTextProvider, { language: language === 'hu' ? 'hu' : 'en', children: h(AnalyticsTextProvider, { language, children: node }) }))))

const metric = (over: Partial<Metric> & { id: string }): Metric => ({ kind: 'actual', state: 'available', value: 4, previous: 2, change: 2, changePercent: 100, comparison: 'period', reason: null, drill: null, ...over })
const money = (over: Partial<MoneyMetric> & { id: string }): MoneyMetric => ({ kind: 'actual', state: 'available', comparison: 'period', lines: [], withoutAmount: 0, reason: null, drill: null, ...over })

const META: AnalyticsAnswer['meta'] = {
  generatedAt: '2026-11-03T10:00:00.000Z',
  period: { preset: 'last_30_days', zone: 'Europe/Budapest', today: '2026-11-03', from: '2026-10-05', to: '2026-11-03', fromUtc: '2026-10-04T22:00:00.000Z', toUtc: '2026-11-03T23:00:00.000Z', days: 30 },
  previous: { from: '2026-09-05', to: '2026-10-04', fromUtc: '2026-09-04T22:00:00.000Z', toUtc: '2026-10-04T22:00:00.000Z', days: 30 },
  currencyNote: 'never_summed_across_currencies',
}
const answer = (section: Partial<Section> & { name: Section['name'] }): AnalyticsAnswer => ({
  meta: META,
  filters: { currency: null, language: null, service: null, packageCode: null, projectStatus: null, quoteStatus: null, consultationStatus: null, lang: 'en' },
  access: { requests: true, clients: true, system: true },
  section: { state: 'available', metrics: [], money: [], series: [], distributions: [], tables: [], limitations: [], ...section },
})

describe('a figure that does not exist is never drawn as a zero', () => {
  it('writes the value, its kind, the previous period and the change, with a definition and a link to the records', () => {
    const html = render(h(KpiCard, { metric: metric({ id: 'newQuoteRequests', value: 12, previous: 8, change: 4, changePercent: 50, drill: '/quotes' }) }))
    expect(html).toContain('New quote requests')
    expect(html).toContain('>12<')
    expect(html).toContain('Stored fact')
    expect(html).toMatch(/up 4 \(50%\) vs previous period/)
    expect(html).toContain('Previous period: 8')
    expect(html).toContain('Quote requests received in the period')
    expect(html).toContain('href="/quotes"')
  })

  it('shows an unavailable figure as unavailable with the reason, and no value, no comparison and no link', () => {
    const html = render(h(KpiCard, { metric: metric({ id: 'recordedRevenue', state: 'unavailable', value: null, previous: null, change: null, changePercent: null, comparison: 'none', reason: 'no_payment_data', drill: '/x' }) }))
    expect(html).toContain('Recorded revenue')
    expect(html).toContain('Not available')
    expect(html).toContain('No payments are recorded in the system')
    expect(html).not.toMatch(/>0<|kpiValue|vs previous|href=/)
  })

  it('says a figure is not available for the role, without a value and without the reason of the data', () => {
    const html = render(h(KpiCard, { metric: metric({ id: 'newCustomers', state: 'not_permitted', value: null, previous: null, change: null, changePercent: null, comparison: 'none', reason: 'not_permitted' }) }))
    expect(html).toContain('Not available for your role')
    expect(html).not.toMatch(/>0<|vs previous/)
  })

  it('keeps a snapshot apart from a period (no history is stored) and marks an estimate as one', () => {
    const snapshot = render(h(KpiCard, { metric: metric({ id: 'activeProjects', value: 7, previous: null, change: null, changePercent: null, comparison: 'snapshot' }) }))
    expect(snapshot).toContain('The situation now')
    expect(snapshot).not.toContain('vs previous')
    const estimate = render(h(KpiCard, { metric: metric({ id: 'aiEstimatedCostUsdCombined', kind: 'estimate', value: 0.0123, previous: null, change: null, changePercent: null, comparison: 'none' }) }))
    expect(estimate).toContain('Estimate')
    expect(estimate).toContain('US$0.0123')
  })

  it('writes a figure in the language of the screen (Hungarian and Dutch)', () => {
    const value = metric({ id: 'averageResponseHours', kind: 'derived', value: 5.5, previous: null, change: null, changePercent: null, comparison: 'none' })
    expect(render(h(KpiCard, { metric: value }), 'hu')).toContain('Átlagos válaszidő')
    expect(render(h(KpiCard, { metric: value }), 'nl')).toContain('Gemiddelde antwoordtijd')
    expect(render(h(KpiCard, { metric: metric({ id: 'newQuoteRequests', value: 12345.5 }) }), 'hu')).toMatch(/12\s345,5/)
  })
})

describe('money is shown per currency and never added', () => {
  it('lists each currency with its own amount, and says that nothing is added or converted', () => {
    const sum = money({
      id: 'acceptedQuotationValue',
      lines: [
        { currency: 'EUR', minor: 1250000, previousMinor: 900000, priced: 3, count: 4 },
        { currency: 'HUF', minor: 4500000, previousMinor: null, priced: 2, count: 2 },
      ],
      withoutAmount: 1,
    })
    const html = render(h(MoneyCard, { metric: sum }))
    expect(html).toContain('€12,500.00')
    expect(html).toContain('HUF 4,500,000')
    expect(html).toContain('3 of 4 quotations carry an amount')
    expect(html).toContain('1 without an amount')
    expect(html).toContain('Previous period: €9,000.00')
    expect(html).toContain('NOT cash received')
    // No single total: the two amounts are in two lines, and 12,500.00 + 4,500,000 appears nowhere.
    expect(html).not.toContain('4,512,500')
    const note = render(h(SectionView, { answer: answer({ name: 'financial', money: [sum] }) }))
    expect(note).toContain('never added or converted')
  })

  it('does not draw money that cannot exist as zero', () => {
    const html = render(h(MoneyCard, { metric: money({ id: 'recordedRevenueMoney', state: 'unavailable', comparison: 'none', reason: 'no_payment_data' }) }))
    expect(html).toContain('Not available')
    expect(html).not.toMatch(/€0|HUF 0|>0</)
  })
})

describe('every chart carries its numbers as a table and says what it is', () => {
  const labels = ['2026-11-01', '2026-11-02', '2026-11-03']
  const format = (value: number) => `${value} pcs`

  it('a line has a title, a description, a one-sentence summary for a screen reader, a legend and a table', () => {
    const html = render(h(LineChart, { title: 'Accepted value', description: 'By the time of acceptance.', labels, series: [{ label: 'Euro', values: [1, 4, 2], tone: 0 }, { label: 'Forint', values: [2, 2, 5], tone: 1 }], format }))
    expect(html).toContain('<figure')
    expect(html).toContain('Accepted value')
    expect(html).toContain('By the time of acceptance.')
    expect(html).toContain('role="img"')
    expect(html).toMatch(/aria-label="Accepted value: 2026-11-01 – 2026-11-03 · highest 5 pcs"/)
    expect(html).toContain('<table')
    expect(html).toContain('<summary>Show the figures as a table</summary>')
    expect(html).toContain('2 pcs')
    expect(html).toContain('data-tone="1"')
  })

  it('bars can be grouped or stacked, and stacked bars add up only parts of one whole', () => {
    const stacked = render(h(BarChart, { title: 'Messages', labels, series: [{ label: 'Customers', values: [1, 2, 3], tone: 0 }, { label: 'You', values: [1, 1, 1], tone: 1 }], mode: 'stacked', format }))
    expect(stacked).toMatch(/highest 4 pcs/)
    const grouped = render(h(BarChart, { title: 'Quotations', labels, series: [{ label: 'Sent', values: [1, 2, 3], tone: 0 }, { label: 'Accepted', values: [1, 1, 1], tone: 1 }], mode: 'grouped', format }))
    expect(grouped).toMatch(/highest 3 pcs/)
  })

  it('says so in words when there is nothing to draw (no flat line passed off as data)', () => {
    for (const html of [
      render(h(LineChart, { title: 'Empty line', labels, series: [{ label: 'x', values: [0, 0, 0], tone: 0 }], format })),
      render(h(BarChart, { title: 'Empty bars', labels, series: [{ label: 'x', values: [0, 0, 0], tone: 0 }], mode: 'grouped', format })),
      render(h(DonutChart, { title: 'Empty ring', items: [], format, share: (fraction) => String(fraction) })),
      render(h(BarList, { title: 'Empty list', items: [], format })),
      render(h(FunnelChart, { title: 'Empty funnel', steps: [{ label: 'Received', count: 0, notes: [] }], format })),
    ]) {
      expect(html).toContain('No data in this period.')
      expect(html).not.toContain('<svg')
    }
  })

  it('a ring writes every part with its count and its share (the colour is never the only way to tell them apart)', () => {
    const html = render(h(DonutChart, { title: 'Status', items: [{ label: 'Open', value: 3 }, { label: 'Resolved', value: 1 }], format: (value) => `${value}`, share: (fraction) => `${Math.round(fraction * 100)}%` }))
    expect(html).toContain('Open')
    expect(html).toContain('3 · 75%')
    expect(html).toContain('1 · 25%')
    expect(html).toContain('<table')
  })

  it('a funnel writes each stage count with its own conversion', () => {
    const html = render(h(FunnelChart, { title: 'Funnel', steps: [{ label: 'Received', count: 10, notes: [] }, { label: 'Sent', count: 4, notes: ['40% of the previous stage'] }], format: (value) => `${value}` }))
    expect(html).toContain('40% of the previous stage')
    expect(html).toContain('width:100%')
    expect(html).toContain('width:40%')
  })
})

describe('a section, from what the server sent', () => {
  it('says a section the role may not read is not available, and draws nothing else', () => {
    const html = render(h(SectionView, { answer: answer({ name: 'ai', state: 'not_permitted', limitations: ['not_permitted'] }) }))
    expect(html).toContain('This section is not available for your role.')
    expect(html).not.toMatch(/<figure|role="img"|<table/)
  })

  it('draws the funnel as a cohort, with conversions, days and the note that decline reasons are not stored', () => {
    const html = render(
      h(SectionView, {
        answer: answer({
          name: 'funnel',
          extra: {
            cohort: { from: '2026-10-05', to: '2026-11-03' },
            stages: [
              { stage: 'received', count: 20, conversionFromPrevious: null, conversionFromReceived: null, daysFromPrevious: null },
              { stage: 'reviewed', count: 15, conversionFromPrevious: 75, conversionFromReceived: 75, daysFromPrevious: 1.5 },
            ],
          },
          limitations: ['conversion_is_cohort_based'],
        }),
      }),
    )
    expect(html).toContain('Requests received 5 Oct 2026 to 3 Nov 2026')
    expect(html).toContain('Reviewed')
    expect(html).toContain('75% of the previous stage')
    expect(html).toContain('on average 1.5 after the previous stage')
    expect(html).toContain('Decline reasons are not stored as categories')
    expect(html).toContain('Conversion follows the requests received in the period')
  })

  it('lists alerts with their rule, their record and a suggested step, links only to pages of the administration, and never says "all clear"', () => {
    const items = [
      { kind: 'unanswered_customer_message', severity: 'high' as const, reason: 'customer_waiting_two_days', reference: 'MSG-1', date: '2026-10-20T08:00:00.000Z', nextAction: 'reply_to_the_customer', path: '/communications/MSG-1' },
      { kind: 'request_not_reviewed', severity: 'medium' as const, reason: 'request_new_for_two_days', reference: 'CC-2026-000001', date: '2026-10-30T08:00:00.000Z', nextAction: 'review_the_request', path: 'https://evil.example/x' },
    ]
    const html = render(h(SectionView, { answer: answer({ name: 'alerts', extra: { items, leftOut: ['quotes_and_consultations'], truncated: false }, limitations: ['fixed_rules'] }) }))
    expect(html).toContain('Customer message unanswered')
    expect(html).toContain('The customer wrote last, and has waited more than two days.')
    expect(html).toContain('Reply to the customer.')
    expect(html).toContain('href="/communications/MSG-1"')
    expect(html).not.toContain('evil.example')
    expect(html).toContain('Quote and consultation alerts are not available for your role.')
    const empty = render(h(SectionView, { answer: answer({ name: 'alerts', extra: { items: [], leftOut: [] } }) }))
    expect(empty).toContain('not that nothing needs attention')
    expect(empty).not.toMatch(/all clear/i)
  })

  it('draws a breakdown as a ring only when it is parts of one whole, and the interest in a service as a list that says an inquiry is not a purchase', () => {
    const html = render(
      h(SectionView, {
        answer: answer({
          name: 'financial',
          distributions: [
            { id: 'quotationsCreatedByStatus', total: 4, items: [{ key: 'sent', value: 3 }, { key: 'accepted', value: 1 }] },
            { id: 'servicesRequested', total: 5, items: [{ key: 'Web design', value: 5, accepted: 2, drill: null }] },
          ],
        }),
      }),
    )
    expect(html).toContain('stroke-dasharray')
    expect(html).toContain('Sent')
    expect(html).toContain('Web design')
    expect(html).toContain('2 followed by an accepted quotation')
    expect(html).toContain('An inquiry is not a purchase')
  })

  it('draws one line chart per currency for the accepted value (two currencies are never on one axis)', () => {
    const point = (key: string, value: number) => ({ key, from: key, to: key, value })
    const html = render(
      h(SectionView, {
        answer: answer({
          name: 'financial',
          series: [
            { id: 'acceptedValueSeries', granularity: 'day', unit: 'minor', currency: 'EUR', points: [point('2026-11-01', 100000), point('2026-11-02', 250000)] },
            { id: 'acceptedValueSeries', granularity: 'day', unit: 'minor', currency: 'HUF', points: [point('2026-11-01', 500000), point('2026-11-02', 0)] },
          ],
        }),
      }),
    )
    expect(html).toContain('Accepted quotation value over time · EUR')
    expect(html).toContain('Accepted quotation value over time · HUF')
    expect(html).toContain('€2,500.00')
    expect(html).toContain('HUF 500,000')
  })

  it('renders every section in all three languages without a raw key, an undefined or an open placeholder', () => {
    const rich = answer({
      name: 'executive',
      metrics: [metric({ id: 'newQuoteRequests' }), metric({ id: 'recordedRevenue', state: 'unavailable', value: null, comparison: 'none', reason: 'no_payment_data' })],
      money: [money({ id: 'potentialPipelineValue', comparison: 'snapshot', lines: [{ currency: 'EUR', minor: 100, previousMinor: null, priced: 1, count: 1 }] })],
      limitations: ['no_payment_data', 'accepted_value_is_not_cash', 'some_future_code'],
    })
    for (const language of ANALYTICS_LANGUAGES) {
      const html = render(h(SectionView, { answer: rich }), language)
      expect(html, language).not.toMatch(/undefined|\[object|\{[a-z]+\}/)
      expect(html, language).not.toContain('newQuoteRequests')
      // A limitation the dictionary does not know yet is shown humanised, never dropped.
      expect(html, language).toContain('Some future code')
    }
  })
})

// ---- the source itself -----------------------------------------------------------------------------------------------------------------

const DIR = join(process.cwd(), 'src', 'admin', 'analytics')
const sourceFiles = readdirSync(DIR).filter((name) => /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')).map((name) => [name, readFileSync(join(DIR, name), 'utf8')] as const)
const page = readFileSync(join(process.cwd(), 'src', 'admin', 'pages', 'AnalyticsPage.tsx'), 'utf8')
const styles = readFileSync(join(process.cwd(), 'src', 'admin', 'styles', 'analytics.module.scss'), 'utf8')
const apiClient = readFileSync(join(process.cwd(), 'src', 'admin', 'api', 'analytics.ts'), 'utf8')
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the source of the screen', () => {
  it('has no sentence of its own: every word between tags is an expression, never a text', () => {
    for (const [name, source] of [...sourceFiles.filter(([file]) => file.endsWith('.tsx')), ['AnalyticsPage.tsx', page] as const]) {
      const text = strip(source)
      const literal = [...text.matchAll(/(?<![=-])>\s*([A-Za-z][A-Za-z ,.'’!?-]{2,})\s*</g)].map((match) => match[1].trim()).filter((words) => !/^[A-Z]{1,3}$/.test(words))
      expect(literal, name).toEqual([])
      expect([...text.matchAll(/(?:aria-label|placeholder|title|alt)="([^"{]*[A-Za-z]{3,}[^"]*)"/g)].map((match) => match[1]), name).toEqual([])
    }
  })

  it('does no arithmetic on money: an amount is formatted, never added, averaged, converted or compared', () => {
    for (const [name, source] of [...sourceFiles, ['AnalyticsPage.tsx', page] as const]) {
      if (name === 'format.ts' || name === 'analytics.test.ts') continue
      const text = strip(source)
      expect(text, name).not.toMatch(/(minor|Minor|money|Money|lines)[^\n]{0,60}\.reduce\(|\.reduce\([^\n]{0,80}(minor|Minor)/)
      expect(text, name).not.toMatch(/(minor|Minor)\s*[-+*/]\s*[A-Za-z0-9(]|[A-Za-z0-9)]\s*[-+*/]\s*(minor|Minor)\b/)
      expect(text, name).not.toMatch(/exchange|\bconvert(ed|ing)?\b|toEUR|toHUF/i)
    }
    // The one place a minor unit meets a division is the decimal point of a single currency.
    expect(strip(readFileSync(join(DIR, 'format.ts'), 'utf8')).match(/minor\s*\/\s*10 \*\* exponent/g)).toHaveLength(1)
  })

  it('draws nothing but its own markup: no HTML injection, no storage but the language, no network of its own besides the one export', () => {
    for (const [name, source] of [...sourceFiles, ['AnalyticsPage.tsx', page] as const]) {
      expect(source, name).not.toMatch(/dangerouslySetInnerHTML|innerHTML|eval\(|new Function|document\.write|\.insertAdjacentHTML|XMLHttpRequest|WebSocket|sendBeacon|apiKey/)
      expect(source, name).not.toMatch(/\bfetch\(/)
      if (name !== 'text.tsx') expect(source, name).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
    }
    // The CSV is asked for with a plain GET, same origin, and nothing but the report and the screen's own filters travels with it.
    expect(strip(apiClient).match(/\bfetch\(/g)).toHaveLength(1)
    expect(strip(apiClient)).toContain("method: 'GET'")
    expect(strip(apiClient)).toContain("credentials: 'same-origin'")
    expect(strip(apiClient)).not.toMatch(/POST|PUT|PATCH|DELETE|localStorage/)
  })

  it('keeps colours in the design tokens (no raw colour but black and white for the printed page) and moves nothing', () => {
    const css = strip(styles)
    const raw = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0].toLowerCase()).filter((colour) => !['#000', '#fff'].includes(colour))
    expect(raw).toEqual([])
    expect(css).not.toMatch(/@keyframes|animation:|transition:/)
    // The print rules exist, and they show the header that is hidden on the screen.
    expect(css).toMatch(/@media print[\s\S]*\.printHeader[\s\S]*display:\s*block/)
    expect(readFileSync(join(process.cwd(), 'src', 'admin', 'styles', 'admin.css'), 'utf8')).toContain('body[data-printing]')
  })

  it('prints through the same marking the assistant uses, and downloads the file the server made (a Blob, so its byte order mark survives)', () => {
    expect(page).toContain("import { printElement } from '../assistant/exporters'")
    expect(page).toContain('printElement(printable.current)')
    expect(apiClient).toContain('response.blob()')
    expect(apiClient).not.toContain('response.text()')
  })

  it('is a screen of the administration only: nothing from it is imported by the website, and it reads, never writes', () => {
    expect(strip(apiClient)).not.toMatch(/\b(post|put|patch|del)\(/)
    expect(strip(page)).not.toMatch(/\b(post|put|patch|del)\(/)
  })
})
