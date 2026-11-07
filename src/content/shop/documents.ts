import { LANGUAGES } from '../../i18n/config'
import type { PackageId } from '../packages'
import { PACKAGE_IDS } from '../services/ids'
import type { Trilingual } from '../trilingual'
import { CORE_QUESTION_IDS, type FullExperience, type Question, type TitledText } from './fullExperience'
import { isFeatureLevel, type Comparison, type ComparisonFeature, type FeatureLevel, type TierInfo } from './comparison'

/**
 * Reading the two shop documents the backend publishes (the tier comparison and the FULL EXPERIENCE offer) into what the pages draw.
 * The server checks a document before it stores it (server/src/modules/shop/documents.ts); this is the website's own check of what
 * it receives, with the same rules, because a page must never be broken by a document it cannot draw: anything that does not hold
 * is refused as a whole (`null`) and the website keeps its own text. Nothing here throws.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** One text per language; `allowEmpty` lets a text be empty in every language (a description may be). */
function tri(value: unknown, max: number, allowEmpty = false): Trilingual | null {
  if (!isRecord(value)) return null
  const out = {} as Trilingual
  for (const lang of LANGUAGES) {
    const text = value[lang]
    if (typeof text !== 'string' || text.length > max) return null
    if (!allowEmpty && text.trim() === '') return null
    out[lang] = text
  }
  return out
}

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const id = (value: unknown): string | null => (typeof value === 'string' && ID.test(value) ? value : null)

export function readComparison(raw: unknown, known: readonly PackageId[] = PACKAGE_IDS): Comparison | null {
  if (!isRecord(raw) || !Array.isArray(raw.tiers) || !Array.isArray(raw.features)) return null
  const tiers: TierInfo[] = []
  for (const item of raw.tiers) {
    if (!isRecord(item)) return null
    const code = known.find((candidate) => candidate === item.package)
    const label = tri(item.label, 60)
    const buildsOn = item.buildsOn === null || item.buildsOn === undefined ? null : (known.find((candidate) => candidate === item.buildsOn) ?? undefined)
    if (!code || !label || buildsOn === undefined || tiers.some((tier) => tier.package === code)) return null
    tiers.push({ package: code, label, buildsOn })
  }
  // Every package the website has takes part: a comparison missing one would draw an empty column.
  if (!known.every((code) => tiers.some((tier) => tier.package === code))) return null
  for (const tier of tiers) {
    const seen = new Set<PackageId>([tier.package])
    for (let next = tier.buildsOn; next !== null; next = tiers.find((candidate) => candidate.package === next)?.buildsOn ?? null) {
      if (seen.has(next)) return null
      seen.add(next)
    }
  }
  const features: ComparisonFeature[] = []
  for (const item of raw.features) {
    if (!isRecord(item) || !isRecord(item.levels)) return null
    const featureId = id(item.id)
    const name = tri(item.name, 80)
    const description = tri(item.description, 240, true)
    if (!featureId || !name || !description || features.some((feature) => feature.id === featureId)) return null
    const levels = {} as Record<PackageId, FeatureLevel>
    for (const code of known) {
      const level = item.levels[code] ?? 'none'
      if (!isFeatureLevel(level)) return null
      levels[code] = level
    }
    features.push({ id: featureId, name, description, levels })
  }
  return { tiers, features }
}

function titled(raw: unknown, max: number): TitledText[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null
  const out: TitledText[] = []
  for (const item of raw) {
    if (!isRecord(item)) return null
    const itemId = id(item.id)
    const title = tri(item.title, 80)
    const text = tri(item.text, 300, true)
    if (!itemId || !title || !text || out.some((other) => other.id === itemId)) return null
    out.push({ id: itemId, title, text })
  }
  return out
}

export function readFullExperience(raw: unknown): FullExperience | null {
  if (!isRecord(raw) || !isRecord(raw.hero) || !isRecord(raw.teaser) || !isRecord(raw.configurator)) return null
  const hero = { eyebrow: tri(raw.hero.eyebrow, 60), headline: tri(raw.hero.headline, 120), supporting: tri(raw.hero.supporting, 400), primaryCta: tri(raw.hero.primaryCta, 60), secondaryCta: tri(raw.hero.secondaryCta, 60) }
  const teaser = { title: tri(raw.teaser.title, 120), text: tri(raw.teaser.text, 400) }
  const priceLabel = tri(raw.priceLabel, 60)
  const stages = titled(raw.stages, 24)
  const components = titled(raw.components, 16)
  const intro = tri(raw.configurator.intro, 300, true)
  if (Object.values(hero).some((value) => value === null) || Object.values(teaser).some((value) => value === null) || !priceLabel || !stages || !components || !intro) return null

  const faq: FullExperience['faq'] = []
  if (!Array.isArray(raw.faq) || raw.faq.length > 12) return null
  for (const item of raw.faq) {
    if (!isRecord(item)) return null
    const faqId = id(item.id)
    const question = tri(item.question, 200)
    const answer = tri(item.answer, 800)
    if (!faqId || !question || !answer || faq.some((other) => other.id === faqId)) return null
    faq.push({ id: faqId, question, answer })
  }

  const questions: Question[] = []
  const rawQuestions = raw.configurator.questions
  if (!Array.isArray(rawQuestions) || rawQuestions.length > 12) return null
  for (const item of rawQuestions) {
    if (!isRecord(item) || !Array.isArray(item.options) || item.options.length < 2 || item.options.length > 16) return null
    const questionId = id(item.id)
    const title = tri(item.title, 120)
    const help = tri(item.help, 240, true)
    if (!questionId || !title || !help || (item.kind !== 'single' && item.kind !== 'multi') || questions.some((other) => other.id === questionId)) return null
    const options: Question['options'] = []
    for (const option of item.options) {
      if (!isRecord(option)) return null
      const optionId = id(option.id)
      const label = tri(option.label, 100)
      const hint = tri(option.hint, 200, true)
      if (!optionId || !label || !hint || options.some((other) => other.id === optionId)) return null
      options.push({ id: optionId, label, hint, unsure: option.unsure === true })
    }
    questions.push({ id: questionId, kind: item.kind, required: item.required === true, title, help, options })
  }
  if (!CORE_QUESTION_IDS.every((core) => questions.some((question) => question.id === core))) return null
  if (!questions.find((question) => question.id === 'budget')?.options.some((option) => option.unsure)) return null

  return {
    hero: hero as FullExperience['hero'],
    teaser: teaser as FullExperience['teaser'],
    priceLabel,
    stages,
    components,
    faq,
    configurator: { intro, questions },
  }
}
