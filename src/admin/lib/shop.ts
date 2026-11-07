import type { Language } from '../../i18n/config'

/**
 * The tier comparison and the FULL EXPERIENCE offer as the administration edits them: the types of the two documents (the shape the
 * server stores, server/src/modules/shop/documents.ts), the limits the editors count against (the server's numbers: a contract test,
 * server/test/admin-contract.test.ts, holds them together), the empty things "Add" starts from, and the small pure functions that
 * change a list without mutating it. The server checks every save; these only help the editor say so early.
 */

export type Tri = Record<Language, string>
export const emptyTri = (): Tri => ({ hu: '', en: '', nl: '' })

export const FEATURE_LEVELS = ['included', 'addon', 'custom', 'none'] as const
export type FeatureLevel = (typeof FEATURE_LEVELS)[number]

export interface TierEntry {
  package: string
  label: Tri
  buildsOn: string | null
}
export interface ComparisonFeature {
  id: string
  name: Tri
  description: Tri
  levels: Record<string, FeatureLevel>
}
export interface ComparisonDoc {
  version: 1
  tiers: TierEntry[]
  features: ComparisonFeature[]
}

export interface QuestionOption {
  id: string
  label: Tri
  hint: Tri
  unsure: boolean
}
export interface Question {
  id: string
  kind: 'single' | 'multi'
  required: boolean
  title: Tri
  help: Tri
  options: QuestionOption[]
}
export interface TitledText {
  id: string
  title: Tri
  text: Tri
}
export interface OfferDoc {
  version: 1
  hero: { eyebrow: Tri; headline: Tri; supporting: Tri; primaryCta: Tri; secondaryCta: Tri }
  teaser: { title: Tri; text: Tri }
  priceLabel: Tri
  stages: TitledText[]
  components: TitledText[]
  faq: { id: string; question: Tri; answer: Tri }[]
  configurator: { intro: Tri; questions: Question[] }
}

export type DocumentCode = 'comparison' | 'full_experience'
export interface DocumentView<T> {
  code: DocumentCode
  draft: T
  published: T | null
  publishedAt: string | null
  updatedAt: string
  changed: boolean
}

/** The same numbers as the server's (modules/shop/documents.ts LIMITS and the `tri` limits in parseComparison / parseFullExperience). */
export const SHOP_LIMITS = {
  features: 40,
  stages: 24,
  components: 16,
  faq: 12,
  questions: 12,
  optionsPerQuestion: 16,
  tierLabel: 60,
  featureName: 80,
  featureDescription: 240,
  headline: 120,
  eyebrow: 60,
  cta: 60,
  supporting: 400,
  stageTitle: 80,
  stageText: 300,
  question: 120,
  help: 240,
  optionLabel: 100,
  optionHint: 200,
  faqQuestion: 200,
  faqAnswer: 800,
  intro: 300,
} as const

/** The questions the configurator cannot do without: they can be edited and moved, not removed. */
export const CORE_QUESTIONS = ['type', 'stage', 'components', 'complexity', 'budget', 'timeline'] as const

/** Makes an id from a title: lowercase letters, digits and hyphens, at most 40 characters, not already taken. */
export function newId(title: string, taken: readonly string[], fallback: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34)
  const stem = base || fallback
  if (!taken.includes(stem)) return stem
  for (let n = 2; n < 100; n += 1) if (!taken.includes(`${stem}-${n}`)) return `${stem}-${n}`
  return `${stem}-${taken.length + 1}`
}

export const move = <T>(list: readonly T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length || from === to) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
export const replaceAt = <T>(list: readonly T[], index: number, value: T): T[] => list.map((item, at) => (at === index ? value : item))
export const removeAt = <T>(list: readonly T[], index: number): T[] => list.filter((_, at) => at !== index)

export function newFeature(taken: readonly string[], packages: readonly string[]): ComparisonFeature {
  return { id: newId('', taken, 'new-feature'), name: emptyTri(), description: emptyTri(), levels: Object.fromEntries(packages.map((code) => [code, 'none' as FeatureLevel])) }
}
export const newTitled = (taken: readonly string[], fallback: string): TitledText => ({ id: newId('', taken, `new-${fallback}`), title: emptyTri(), text: emptyTri() })
export const newOption = (taken: readonly string[]): QuestionOption => ({ id: newId('', taken, 'new-option'), label: emptyTri(), hint: emptyTri(), unsure: false })
export const newQuestion = (taken: readonly string[]): Question => ({ id: newId('', taken, 'new-question'), kind: 'single', required: false, title: emptyTri(), help: emptyTri(), options: [newOption([]), newOption(['new-option'])] })

export const sameDocument = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** A short line saying how a feature stands across the packages ("Launch ✓ · Grow + …"), for a collapsed row. */
export function levelSummary(feature: ComparisonFeature, packages: readonly string[]): string {
  const mark: Record<FeatureLevel, string> = { included: '✓', addon: '+', custom: '◇', none: '–' }
  return packages.map((code) => `${code} ${mark[feature.levels[code] ?? 'none']}`).join(' · ')
}

// The placeholder ids the editor makes (`new-option`, `new-stage-2`): distinctive on purpose, so an id the owner or the seed chose (`stage` is a core question's) is never taken for one.
const AUTO_ID = /^new-[a-z]+(-\d+)?$/

/** Gives a brand-new item (one still carrying the placeholder id the editor made) an id from its English text, so a brief or a link reads `web-app`, not `option-3`. Existing ids are never changed. */
function finalizeList<T extends { id: string }>(items: readonly T[], english: (item: T) => string): T[] {
  const taken = items.filter((item) => !AUTO_ID.test(item.id)).map((item) => item.id)
  return items.map((item) => {
    if (!AUTO_ID.test(item.id) || english(item).trim() === '') return item
    const id = newId(english(item), taken, item.id)
    taken.push(id)
    return { ...item, id }
  })
}

export function finalizeComparison(doc: ComparisonDoc): ComparisonDoc {
  return { ...doc, features: finalizeList(doc.features, (feature) => feature.name.en) }
}

export function finalizeOffer(doc: OfferDoc): OfferDoc {
  return {
    ...doc,
    stages: finalizeList(doc.stages, (item) => item.title.en),
    components: finalizeList(doc.components, (item) => item.title.en),
    faq: finalizeList(doc.faq, (item) => item.question.en),
    configurator: {
      ...doc.configurator,
      questions: finalizeList(doc.configurator.questions, (question) => question.title.en).map((question) => ({ ...question, options: finalizeList(question.options, (option) => option.label.en) })),
    },
  }
}
