import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { discoveryText } from '../content/ai/discovery'
import { discoveryLabels } from '../content/ai/discoveryLabels'
import { aiText } from '../content/ai'
import { LANGUAGES } from '../i18n/config'
import { CATEGORIES, FACT_LIMITS, MAINTENANCE, PRIORITIES, PROJECT_TYPES, REQUIREMENT_COMPLEXITIES, SECTIONS, SIGNAL_COUNTS, SIGNAL_VALUES, SKIPPABLE_STAGES, STAGES } from './discoveryModel'

/**
 * PROMPT 30: the website's copy of the discovery vocabulary must be the server's, and every sentence of the panel must exist, whole, in the
 * three languages. These read the server's sources as text (the two projects share no code), so a change on one side that the other
 * does not follow fails here, not in front of a visitor.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n')
const model = read('server/src/modules/ai/discovery/model.ts')
const stages = read('server/src/modules/ai/discovery/stages.ts')
const labels = read('server/src/modules/ai/discovery/labels.ts')

const listOf = (source: string, name: string): string[] => {
  const match = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(source)
  expect(match, name).not.toBeNull()
  return [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((entry) => entry[1])
}

describe('the vocabulary the server validates', () => {
  it.each([
    ['STAGES', STAGES],
    ['PROJECT_TYPES', PROJECT_TYPES],
    ['CATEGORIES', CATEGORIES],
    ['PRIORITIES', PRIORITIES],
    ['SECTIONS', SECTIONS],
    ['MAINTENANCE', MAINTENANCE],
  ] as const)('%s is the same list on both sides', (name, mine) => {
    expect([...mine]).toEqual(listOf(model, name))
  })

  it('the requirement complexities, the skippable stages, the fact limits and the signals are the same on both sides', () => {
    expect([...REQUIREMENT_COMPLEXITIES]).toEqual(listOf(model, 'REQUIREMENT_COMPLEXITIES'))
    expect([...SKIPPABLE_STAGES]).toEqual(listOf(stages, 'SKIPPABLE_STAGES'))
    const limits = /export const FACT_LIMITS = \{([^}]*)\}/.exec(model)?.[1] ?? ''
    expect(Object.fromEntries([...limits.matchAll(/(\w+):\s*(\d+)/g)].map((entry) => [entry[1], Number(entry[2])]))).toEqual(FACT_LIMITS)
    for (const [key, values] of Object.entries(SIGNAL_VALUES)) {
      const line = new RegExp(`\\b${key}: \\[([^\\]]*)\\]`).exec(model)?.[1] ?? ''
      expect([...line.matchAll(/'([^']+)'/g)].map((entry) => entry[1]), key).toEqual([...values])
    }
    for (const [key, [min, max]] of Object.entries(SIGNAL_COUNTS)) expect(model, key).toContain(`${key}: [${min}, ${max}]`)
  })
})

/** The body of one table of the server's `labels.ts`, as the generator wrote it into the website's copy. */
const serverTable = (name: string): string[] => {
  const match = new RegExp(`export const ${name}: Record<string, Tri> = \\{\\n([\\s\\S]*?)\\n\\}\\n`).exec(labels)
  expect(match, name).not.toBeNull()
  return (match?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\bt\(/, 'tri('))
}

const TABLES: [string, keyof typeof discoveryLabels][] = [
  ['TYPES', 'types'], ['CATEGORIES', 'categories'], ['PRIORITIES', 'priorities'], ['STATUSES', 'statuses'], ['COMPLEXITY_LEVELS', 'levels'], ['MAINTENANCE', 'maintenance'],
  ['FACTORS', 'factors'], ['ARCHITECTURE', 'architecture'], ['REASONS', 'reasons'], ['PHASES', 'phases'], ['RISKS', 'risks'], ['RISK_KINDS', 'riskKinds'],
  ['SIGNALS', 'signals'], ['FACTS', 'facts'], ['NEXT_STEPS', 'nextSteps'], ['SECTIONS', 'sections'],
]

describe('the words of a plan’s codes', () => {
  const copy = read('src/content/ai/discoveryLabels.ts')
  it.each(TABLES)('%s is the server’s table, word for word, in all three languages', (serverName, key) => {
    const body = new RegExp(`\\n  ${key}: \\{\\n([\\s\\S]*?)\\n  \\},`).exec(copy)?.[1] ?? ''
    const mine = body.split('\n').map((line) => line.trim()).filter(Boolean)
    expect(mine).toEqual(serverTable(serverName))
    expect(Object.keys(discoveryLabels[key]).length).toBe(mine.length)
  })

  it('has a word for every project type, category, priority and section the interface can show', () => {
    expect(Object.keys(discoveryLabels.types)).toEqual(expect.arrayContaining([...PROJECT_TYPES]))
    expect(Object.keys(discoveryLabels.categories)).toEqual(expect.arrayContaining([...CATEGORIES]))
    expect(Object.keys(discoveryLabels.priorities)).toEqual(expect.arrayContaining([...PRIORITIES]))
    expect(Object.keys(discoveryLabels.sections)).toEqual(expect.arrayContaining([...SECTIONS]))
    expect(Object.keys(discoveryLabels.maintenance)).toEqual(expect.arrayContaining([...MAINTENANCE]))
    for (const stage of STAGES) expect(discoveryText.progress.stage[stage], stage).toBeDefined()
  })
})

interface Leaf {
  path: string
  value: Record<string, string>
}
function leaves(value: unknown, path = ''): Leaf[] {
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  if (typeof record.hu === 'string' && typeof record.en === 'string' && typeof record.nl === 'string') return [{ path, value: record as Record<string, string> }]
  return Object.entries(record).flatMap(([key, item]) => leaves(item, path ? `${path}.${key}` : key))
}

const all = [...leaves(discoveryText, 'discovery'), ...leaves(aiText.status.tool, 'status.tool')]
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((entry) => entry[1]).sort()

describe('every sentence of the discovery panel', () => {
  it('exists, whole, in Hungarian, English and Dutch', () => {
    expect(all.length).toBeGreaterThan(400)
    for (const { path, value } of all) {
      for (const lang of LANGUAGES) {
        expect(value[lang]?.trim().length, `${path} (${lang})`).toBeGreaterThan(0)
        expect(value[lang], `${path} (${lang}) is unfinished`).not.toMatch(/\b(TODO|FIXME|XXX|lorem)\b/i)
      }
    }
  })

  it('keeps the same placeholders in every language', () => {
    for (const { path, value } of all) {
      const expected = placeholders(value.en)
      expect(placeholders(value.hu), `${path} (hu)`).toEqual(expected)
      expect(placeholders(value.nl), `${path} (nl)`).toEqual(expected)
    }
  })

  it('does not translate by copying: the three languages differ wherever the sentence has more than a name in it', () => {
    const same = all.filter(({ value }) => value.hu === value.en && value.en === value.nl && /\s/.test(value.en.trim()) && !/^\{[^}]+\}( [/·] \{[^}]+\})?$/.test(value.en))
    // A few strings are legitimately identical in all three (a template of numbers, a product name): they carry no words of their own.
    expect(same.map(({ path }) => path).filter((path) => !/(counter|detail|count|points|score|risks\.detail)$/.test(path))).toEqual([])
  })

  it('never states a price, an hourly rate, a date or a guarantee', () => {
    for (const { path, value } of all) {
      for (const lang of LANGUAGES) {
        const text = value[lang]
        expect(text, `${path} (${lang})`).not.toMatch(/[€$£]|\b(EUR|HUF|USD|Ft)\b|\b\d+\s*(eur|huf|euró|forint)\b/i)
        expect(text, `${path} (${lang})`).not.toMatch(/\b(guarantee[sd]?|garant[áa]l|garantie|gegarandeerd)\b/i)
      }
    }
  })

  it('says, in the complexity card, that it is not an estimate, and in the plan that it is a proposal', () => {
    expect(discoveryText.complexity.notEstimate.en).toMatch(/not an estimate/i)
    expect(discoveryText.plan.notDecision.en).toMatch(/not confirmed/i)
    expect(discoveryText.plan.lead.en).toMatch(/not a quote/i)
    expect(discoveryText.review.notQuote.en).toMatch(/not a quote/i)
    expect(discoveryText.facts.budgetNote.en).toMatch(/not a promise/i)
  })
})
