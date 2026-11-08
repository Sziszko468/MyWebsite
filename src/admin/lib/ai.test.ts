import { createElement, type FC } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BarChart, Meter } from '../components/AiCharts'
import { AdminTextProvider } from '../i18n'
import { dollars, duration, formFrom, payloadFrom, sameForm, share, type AiSettings } from './ai'

const settings: AiSettings = {
  enabled: true,
  plannerEnabled: true,
  quoteEnabled: true,
  languages: ['hu', 'en', 'nl'],
  maxInputChars: 1200,
  maxHistoryMessages: 20,
  maxConversationMessages: 60,
  maxOutputTokens: 1500,
  maxToolCalls: 6,
  maxRequestsPerSession: 40,
  maxRequestsPerIp: 30,
  maxDailyConversations: 100,
  dailyRequests: 1000,
  dailyTokenBudget: 2_000_000,
  dailyBudgetUsd: 1,
  monthlyBudgetUsd: 10,
  conversationMaxHours: 24,
  retentionDays: 7,
  effort: 'low',
  thinking: 'adaptive',
  priceInputPerMTok: 0.1,
  priceOutputPerMTok: 0.5,
  pricesAsOf: '2026-10-06',
  welcome: { hu: '', en: 'Hello', nl: '' },
  suggestions: { hu: [], en: ['A', 'B'], nl: [] },
}

describe('the assistant\'s settings form', () => {
  it('round-trips the settings through the form: numbers as text, chips as lines', () => {
    const form = formFrom(settings)
    expect(form.numbers.dailyBudgetUsd).toBe('1')
    expect(form.suggestions.en).toBe('A\nB')
    const payload = payloadFrom(form)
    expect(payload).toMatchObject({ enabled: true, dailyBudgetUsd: 1, monthlyBudgetUsd: 10, maxOutputTokens: 1500, priceInputPerMTok: 0.1, effort: 'low', suggestions: { en: ['A', 'B'], hu: [], nl: [] }, welcome: { en: 'Hello' } })
    expect(payload).not.toHaveProperty('model')
    expect(payload).not.toHaveProperty('apiKey')
  })

  it('reads a decimal comma, trims chips, and sends an empty or non-numeric box as null so the server names the field', () => {
    const form = formFrom(settings)
    form.numbers.dailyBudgetUsd = '0,5'
    form.numbers.maxToolCalls = ''
    form.numbers.retentionDays = 'abc'
    form.suggestions.nl = '  Eerste  \n\n  Tweede '
    const payload = payloadFrom(form)
    expect(payload.dailyBudgetUsd).toBe(0.5)
    expect(payload.maxToolCalls).toBeNull()
    expect(payload.retentionDays).toBeNull()
    expect(payload.suggestions).toMatchObject({ nl: ['Eerste', 'Tweede'] })
  })

  it('knows when the form differs from what was saved', () => {
    const form = formFrom(settings)
    expect(sameForm(form, formFrom(settings))).toBe(true)
    expect(sameForm({ ...form, enabled: false }, form)).toBe(false)
  })
})

describe('the numbers on the assistant\'s screen', () => {
  it('turns a share of a budget into a bar, and a zero budget into "full once anything is spent"', () => {
    expect(share(0.25, 1)).toBe(0.25)
    expect(share(5, 1)).toBe(1)
    expect(share(0, 0)).toBe(0)
    expect(share(0.001, 0)).toBe(1)
  })

  it('writes dollars with the precision small amounts need, and lengths of time in the interface language', () => {
    expect(dollars(0, 'en')).toBe('US$0.00')
    expect(dollars(0.000018, 'en')).toBe('US$0.00002')
    expect(dollars(0.1436, 'en')).toBe('US$0.1436')
    expect(dollars(12.5, 'en')).toBe('US$12.50')
    expect(duration(null, 'en')).toBe('–')
    expect(duration(75, 'en')).toBe('1 min 15 s')
    expect(duration(75, 'hu')).toBe('1 perc 15 mp')
  })
})

describe('the charts', () => {
  const wrap = (child: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(AdminTextProvider as FC<{ language: 'en' }>, { language: 'en' }, child))

  it('draw real values, keep empty periods as empty slots, and give a screen reader the summary and a table of the same numbers', () => {
    const html = wrap(createElement(BarChart, { title: 'Requests', series: [{ label: 'Requests', tone: 0 }], points: [{ label: '11-01', values: [0] }, { label: '11-02', values: [4] }, { label: '11-03', values: [2] }], format: (value: number) => String(value), empty: 'nothing' }))
    expect(html).toContain('role="img"')
    expect(html).toMatch(/aria-label="Requests: 6/)
    expect(html.match(/<rect/g)).toHaveLength(2)
    expect(html).toContain('<table')
    expect(html).toContain('11-02')
  })

  it('says so, in words, when there is nothing to draw', () => {
    const html = wrap(createElement(BarChart, { title: 'Requests', series: [{ label: 'Requests', tone: 0 }], points: [{ label: 'a', values: [0] }], format: String, empty: 'Nothing recorded yet.' }))
    expect(html).toContain('Nothing recorded yet.')
    expect(html).not.toContain('<svg')
  })

  it('shows a budget as a meter with its numbers in words', () => {
    const html = wrap(createElement(Meter, { label: 'Today', value: 0.3, max: 1, text: '$0.30 of $1.00', tone: 'normal' }))
    expect(html).toContain('<meter')
    expect(html).toContain('aria-valuetext="$0.30 of $1.00"')
    expect(html).toContain('<label')
  })
})
