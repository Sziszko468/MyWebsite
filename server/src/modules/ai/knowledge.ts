import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { sha256Hex } from '../../lib/crypto.ts'
import { isRecord } from '../../lib/text.ts'
import { loadCatalog, type PackageRecord } from '../catalog/repository.ts'
import { publicFull, categories as projectCategories } from '../projects/service.ts'
import type { ComparisonDoc, FullExperienceDoc } from '../shop/documents.ts'

/**
 * What the assistant may know, and the only way it reaches it: narrow, read-only functions over what is PUBLISHED. Nothing here
 * reads a draft, an archived project, a disabled service or package, an inquiry, a quote request, a note, a user or a setting
 * other than the published content, and every function returns plain data trimmed to what one answer needs. The answers are
 * built per language and cached; the cache key is a fingerprint of the content (the newest `updated_at` and the row count of
 * every table a visitor can see), so an administrator's edit is in the next answer without any invalidation call.
 */

export const SEED_PROFILE_FILE = join(import.meta.dirname, '..', '..', '..', 'seed', 'profile.seed.json')

const SHORT = 700
const MEDIUM = 1400

/** A text shortened at a word boundary; a tool result is context the visitor pays for in tokens. */
export function clip(value: unknown, max = MEDIUM): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).trimEnd()}…`
}

type Tri = Record<Language, string>
const pick = (value: unknown, lang: Language): string => {
  if (!isRecord(value)) return typeof value === 'string' ? value : ''
  const text = value[lang]
  if (typeof text === 'string' && text.trim() !== '') return text
  return typeof value.hu === 'string' ? value.hu : typeof value.en === 'string' ? value.en : ''
}
const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const records = (value: unknown): Record<string, unknown>[] => arrayOf(value).filter(isRecord)

// ---- the cache -----------------------------------------------------------------------------------------------------

/**
 * For each table the assistant reads: the newest `updated_at`, the number of rows, and how many are visible to a visitor (the
 * status that makes a row public). Each statement is a literal: no SQL here is built from a value.
 */
const FINGERPRINT_QUERIES: readonly (readonly [string, string])[] = [
  ['services', "SELECT MAX(updated_at) AS latest, COUNT(*) AS n, SUM(status = 'active') AS visible FROM services"],
  ['packages', "SELECT MAX(updated_at) AS latest, COUNT(*) AS n, SUM(status = 'active') AS visible FROM packages"],
  ['extras', "SELECT MAX(updated_at) AS latest, COUNT(*) AS n, SUM(status = 'active') AS visible FROM extras"],
  ['site_content', "SELECT MAX(updated_at) AS latest, COUNT(*) AS n, SUM(status = 'active') AS visible FROM site_content"],
  ['projects', "SELECT MAX(updated_at) AS latest, COUNT(*) AS n, SUM(status = 'published') AS visible FROM projects"],
  ['shop_documents', "SELECT MAX(updated_at) AS latest, COUNT(*) AS n, SUM(published_json IS NOT NULL) || MAX(COALESCE(published_at, '')) AS visible FROM shop_documents"],
]

/**
 * Changes when something the assistant can read changes: for every table, the newest `updated_at`, how many rows there are and
 * how many of them are visible to a visitor (so unpublishing a row is seen even if two edits share a timestamp). Cheap: six
 * aggregate queries over a few dozen rows. The cache is also bounded by `CACHE_MAX_AGE_MS`, as a second safety.
 */
export function fingerprint(app: AppContext): string {
  const parts = FINGERPRINT_QUERIES.map(([table, sql]) => {
    const row = app.db.get<{ latest: string | null; n: number; visible: string | number | null }>(sql)
    return `${table}:${row?.latest ?? ''}:${row?.n ?? 0}:${row?.visible ?? ''}`
  })
  return sha256Hex(parts.join('|')).slice(0, 16)
}

const CACHE_MAX_AGE_MS = 60_000

interface Built {
  fingerprint: string
  builtAt: number
  value: unknown
}

export class Knowledge {
  private readonly app: AppContext
  private readonly cache = new Map<string, Built>()
  private profileCache: { mtimeMs: number; data: Record<string, unknown> | null } | null = null
  /** How many times an answer was built rather than served from the cache (the administration shows it; tests read it). */
  builds = 0
  lastBuiltAt: string | null = null

  constructor(app: AppContext) {
    this.app = app
  }

  private cached<T>(key: string, build: () => T): T {
    const now = fingerprint(this.app)
    const hit = this.cache.get(key)
    if (hit && hit.fingerprint === now && this.app.clock.now().getTime() - hit.builtAt < CACHE_MAX_AGE_MS) return hit.value as T
    const value = build()
    this.builds += 1
    this.lastBuiltAt = this.app.clock.now().toISOString()
    this.cache.set(key, { fingerprint: now, builtAt: this.app.clock.now().getTime(), value })
    return value
  }

  /** Forgets everything (an administrator's "refresh"); the next question rebuilds. */
  invalidate(): void {
    this.cache.clear()
    this.profileCache = null
  }

  // ---- the developer -------------------------------------------------------------------------------------------------

  private profileData(): Record<string, unknown> | null {
    try {
      const mtimeMs = statSync(SEED_PROFILE_FILE).mtimeMs
      if (!this.profileCache || this.profileCache.mtimeMs !== mtimeMs) {
        const parsed: unknown = JSON.parse(readFileSync(SEED_PROFILE_FILE, 'utf8'))
        this.profileCache = { mtimeMs, data: isRecord(parsed) ? parsed : null }
      }
      return this.profileCache.data
    } catch {
      return null
    }
  }

  /** What the About page says about the developer: nothing more. The things that are not published are listed, so the assistant can say so. */
  developerProfile(lang: Language): Record<string, unknown> {
    const data = this.profileData()
    if (!data) return { available: false, note: 'The developer profile is not available.' }
    const story = isRecord(data.story) ? data.story : {}
    const contact = isRecord(data.contact) ? data.contact : {}
    return {
      available: true,
      name: typeof data.name === 'string' ? data.name : null,
      nameNote: typeof data.name === 'string' ? null : 'The site has not published a name yet: do not give one.',
      story: { title: pick(story.title, lang), paragraphs: arrayOf(story.paragraphs).map((paragraph) => clip(pick(paragraph, lang), MEDIUM)), thought: clip(pick(story.thought, lang), SHORT) },
      strengths: records(data.strengths).map((item) => ({ name: pick(item.name, lang), text: clip(pick(item.text, lang), SHORT) })),
      technologies: records(data.technologies).map((group) => ({ group: pick(group.label, lang), items: arrayOf(group.items).filter((item): item is string => typeof item === 'string') })),
      technologiesNote: 'These are the technologies the About page lists. It states no level, no number of years and no project for any of them.',
      workingApproach: records(data.approach).map((step) => ({ step: step.name, text: pick(step.text, lang) })),
      currentFocus: records(data.focus).map((topic) => ({ title: pick(topic.title, lang), text: pick(topic.text, lang) })),
      thisWebsiteIsBuiltWith: arrayOf(data.siteStack),
      contact: {
        email: typeof contact.email === 'string' ? contact.email : null,
        social: records(contact.social).map((item) => ({ label: item.label, url: item.url })),
        contactPage: `/${lang}${typeof contact.contactPagePath === 'string' ? contact.contactPagePath : '/contact'}`,
        note: contact.email ? null : 'No public e-mail address is published: point to the contact page or to the quote request.',
      },
      notPublished: ['employer or company names', 'employment dates and years of experience', 'clients and customer names', 'project results and statistics', 'certifications and awards', 'availability and rates', 'testimonials or reviews', 'private information of any kind'],
    }
  }

  // ---- the portfolio -------------------------------------------------------------------------------------------------

  private projects(lang: Language): { projects: ProjectView[]; categories: { key: string; label: string }[] } {
    return this.cached(`projects:${lang}`, () => {
      const categoryLabels = new Map(projectCategories(this.app).map((category) => [category.key, pick(category.label, lang)]))
      const projects = publicFull(this.app).map((project): ProjectView => {
        const detail = isRecord(project.detail) ? project.detail : {}
        const stack = records(detail.stack).flatMap((group) => arrayOf(group.items).filter((item): item is string => typeof item === 'string'))
        return {
          slug: project.slug,
          title: pick(project.card.title, lang),
          label: pick(project.card.label, lang),
          description: clip(pick(project.card.description, lang), SHORT),
          category: categoryLabels.get(project.category) ?? project.category,
          categoryKey: project.category,
          status: project.card.projectStatus,
          technologies: [...new Set([...project.card.tags, ...stack])],
          hasDetailPage: project.card.detailPage,
          publicUrl: project.card.detailPage ? `/${lang}/work/${project.slug}/` : null,
          demoUrl: project.card.demoUrl,
          detail,
        }
      })
      return { projects, categories: [...categoryLabels].map(([key, label]) => ({ key, label })) }
    })
  }

  searchProjects(lang: Language, input: { query?: string; category?: string; technology?: string }): Record<string, unknown> {
    const { projects, categories } = this.projects(lang)
    const words = (input.query ?? '').toLowerCase().split(/[^\p{L}\p{N}.+#]+/u).filter((word) => word.length >= 2)
    const technology = input.technology?.toLowerCase().trim()
    const category = input.category?.toLowerCase().trim()
    const scored = projects
      .filter((project) => !category || project.categoryKey.toLowerCase() === category || project.category.toLowerCase() === category)
      .filter((project) => !technology || project.technologies.some((item) => item.toLowerCase().includes(technology)))
      .map((project) => {
        const haystack = `${project.title} ${project.label} ${project.description} ${project.category} ${project.technologies.join(' ')}`.toLowerCase()
        const score = words.length === 0 ? 1 : words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0)
        return { project, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
    return {
      count: scored.length,
      totalPublished: projects.length,
      categories,
      results: scored.map(({ project }) => ({
        slug: project.slug,
        title: project.title,
        label: project.label || null,
        description: project.description,
        category: project.category,
        technologies: project.technologies,
        status: project.status,
        publicUrl: project.publicUrl,
        demoUrl: project.demoUrl,
        detailsAvailable: true,
      })),
      note: scored.length === 0 ? 'No published project matches. Do not invent one.' : null,
    }
  }

  projectDetails(lang: Language, slug: string): Record<string, unknown> {
    const project = this.projects(lang).projects.find((candidate) => candidate.slug === slug)
    if (!project) return { found: false, note: 'There is no published project with this slug. Do not describe it.' }
    const detail = project.detail
    const overview = isRecord(detail.overview) ? detail.overview : {}
    const links = isRecord(detail.links) ? detail.links : {}
    return {
      found: true,
      slug: project.slug,
      title: project.title,
      summary: clip(pick(detail.summary, lang), SHORT),
      status: project.status,
      category: project.category,
      role: detail.role ? clip(pick(detail.role, lang), SHORT) : null,
      overview: { what: clip(pick(overview.what, lang)), audience: clip(pick(overview.audience, lang)), problem: clip(pick(overview.problem, lang)), goal: clip(pick(overview.goal, lang)) },
      challenges: records(detail.challenges).slice(0, 8).map((item) => ({ title: pick(item.title, lang), problem: clip(pick(item.problem, lang), SHORT), solution: clip(pick(item.solution, lang), SHORT) })),
      approach: records(detail.approach).slice(0, 8).map((item) => ({ title: pick(item.title, lang), text: clip(pick(item.text, lang), SHORT) })),
      architecture: clip(pick(detail.architectureText, lang)) || null,
      architectureDiagramOnPage: isRecord(detail.architecture),
      keyFeatures: records(detail.features).slice(0, 12).map((item) => ({ title: pick(item.title, lang), text: clip(pick(item.text, lang), SHORT), status: item.status })),
      technologies: records(detail.stack).map((group) => ({ group: group.group, items: arrayOf(group.items) })),
      decisions: records(detail.decisions).slice(0, 8).map((item) => ({ title: pick(item.title, lang), text: clip(pick(item.text, lang), SHORT) })),
      limits: arrayOf(detail.limits).map((item) => clip(pick(item, lang), SHORT)).filter(Boolean),
      results: arrayOf(detail.results).map((item) => clip(pick(item, lang), SHORT)).filter(Boolean),
      gallery: records(detail.gallery).slice(0, 12).map((item) => ({ src: item.src, alt: pick(item.alt, lang), caption: pick(item.caption, lang) })),
      links: { demo: links.demo ?? null, source: links.source ?? null, extra: links.extra ?? null },
      publicUrl: project.publicUrl,
      note: 'Only what is listed here is published. Anything else (results, clients, numbers) is not: say so rather than guess.',
    }
  }

  // ---- the shop ------------------------------------------------------------------------------------------------------

  private shop(lang: Language) {
    return this.cached(`shop:${lang}`, () => {
      const catalog = loadCatalog(this.app.db)
      const comparison: ComparisonDoc | null = catalog.documents.comparison
      const experience: FullExperienceDoc | null = catalog.documents.fullExperience
      const text = <T extends object>(translations: Partial<Record<Language, T>>): Partial<T> => translations[lang] ?? translations.hu ?? Object.values(translations)[0] ?? {}
      const price = (pack: { price: PackageRecord['price']; vat: string; quoteRequired?: boolean }) => (pack.price.kind === 'from' ? { kind: 'from', amount: pack.price.amount, currency: pack.price.currency, vat: pack.vat, quoteRequired: pack.quoteRequired ?? null } : { kind: pack.price.kind === 'tbd' ? 'not_decided' : 'custom_quote', note: 'No fixed price is published for this item.' })
      return { catalog, comparison, experience, text, price }
    })
  }

  services(lang: Language): Record<string, unknown> {
    const { catalog, text, price } = this.shop(lang)
    const packageName = (code: string): string => {
      const pack = catalog.packages.find((candidate) => candidate.code === code)
      return pack ? String(text(pack.translations).name ?? code) : code
    }
    return {
      count: catalog.services.length,
      services: catalog.services.map((service) => {
        const t = text(service.translations)
        const packs = service.packages.flatMap((code) => catalog.packages.filter((pack) => pack.code === code))
        const kinds = new Set(packs.map((pack) => pack.price.kind))
        return {
          slug: service.slug,
          name: t.title ?? service.slug,
          tagline: t.tagline ?? '',
          summary: clip(t.summary, SHORT),
          overview: clip(t.overview, MEDIUM),
          whatItCanInclude: t.features ?? [],
          availability: 'published',
          pricingModel: kinds.size === 1 && kinds.has('quote') ? 'custom_quote' : kinds.has('from') ? 'some_published_prices' : 'custom_quote',
          relatedPackages: packs.map((pack) => ({ code: pack.code, name: packageName(pack.code), price: price(pack) })),
          page: `/${lang}/services/${service.slug}`,
        }
      }),
      note: 'Prices are exactly what is published here. When the pricing model is custom_quote there is no price to state.',
    }
  }

  comparePackages(lang: Language, only?: string[]): Record<string, unknown> {
    const { catalog, comparison, text, price } = this.shop(lang)
    const wanted = only && only.length > 0 ? new Set(only) : null
    const packs = catalog.packages.filter((pack) => !wanted || wanted.has(pack.code))
    const extraOf = (code: string) => catalog.extras.find((extra) => extra.code === code)
    const tierOf = (code: string) => comparison?.tiers.find((tier) => tier.package === code)
    const levelOf = (feature: ComparisonDoc['features'][number], code: string) => feature.levels[code] ?? 'none'

    const packages = packs.map((pack) => {
      const t = text(pack.translations)
      const tier = tierOf(pack.code)
      const addOns = pack.extras.flatMap((code) => {
        const extra = extraOf(code)
        if (!extra) return []
        const e = text(extra.translations)
        return [{ code: extra.code, name: e.name ?? extra.code, summary: clip(e.summary, 300), price: price(extra) }]
      })
      // What this tier adds to the one it builds on: the features it includes that the lower one does not.
      const adds =
        comparison && tier
          ? comparison.features.filter((feature) => levelOf(feature, pack.code) === 'included' && (tier.buildsOn === null || levelOf(feature, tier.buildsOn) !== 'included')).map((feature) => pick(feature.name, lang))
          : null
      return {
        code: pack.code,
        name: t.name ?? pack.code,
        tier: tier ? pick(tier.label, lang) : null,
        buildsOn: tier?.buildsOn ?? null,
        tagline: t.tagline ?? '',
        whoItIsFor: clip(t.audience, SHORT),
        scope: clip(t.scope, SHORT),
        customisation: clip(t.customization, SHORT),
        support: clip(t.support, SHORT),
        included: t.includes ?? [],
        mainDeliverables: t.deliverables ?? [],
        suits: t.fits ?? [],
        price: price(pack),
        priceNote: t.priceNote ?? null,
        addOns,
        addsOverThePackageBelow: adds,
        page: `/${lang}/services/packages/${pack.code}`,
      }
    })

    const matrix = comparison
      ? comparison.features.map((feature) => ({
          feature: pick(feature.name, lang),
          explanation: clip(pick(feature.description, lang), 240) || null,
          levels: Object.fromEntries(packs.map((pack) => [pack.code, levelOf(feature, pack.code)])),
        }))
      : null
    return {
      count: packages.length,
      packages,
      featureMatrix: matrix,
      levelsExplained: { included: 'part of the package', addon: 'available as an optional add-on', custom: 'available as a custom service, quoted separately', none: 'not part of the package' },
      comparisonPublished: comparison !== null,
      note: 'Every price is exactly as published; "custom_quote" means there is no price to state. Do not estimate one.',
    }
  }

  fullExperience(lang: Language): Record<string, unknown> {
    const { experience } = this.shop(lang)
    if (!experience) return { published: false, note: 'FULL EXPERIENCE is not published at the moment. Do not describe it.' }
    return {
      published: true,
      name: 'FULL EXPERIENCE',
      headline: pick(experience.hero.headline, lang),
      summary: clip(pick(experience.hero.supporting, lang), SHORT),
      pricing: { model: 'custom_quote', label: pick(experience.priceLabel, lang), note: 'This is a custom service. There is no fixed price and none must be stated or estimated; a quote is written from the requirements.' },
      developmentStages: experience.stages.map((stage) => ({ title: pick(stage.title, lang), text: clip(pick(stage.text, lang), 500) })),
      optionalComponents: experience.components.map((component) => ({ title: pick(component.title, lang), text: clip(pick(component.text, lang), 500) })),
      questions: experience.faq.map((entry) => ({ question: pick(entry.question, lang), answer: clip(pick(entry.answer, lang), 700) })),
      whatTheConfiguratorAsks: experience.configurator.questions.map((question) => pick(question.title, lang)),
      startPage: `/${lang}/services/full-experience/start`,
      page: `/${lang}/services/full-experience`,
    }
  }

  /** What an administrator sees under "Knowledge": the sources, how much of each is published, and how fresh the answers are. */
  status(): Record<string, unknown> {
    const catalog = loadCatalog(this.app.db)
    const projects = this.app.db.get<{ published: number; total: number }>("SELECT SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published, COUNT(*) AS total FROM projects") ?? { published: 0, total: 0 }
    const profile = this.profileData()
    return {
      fingerprint: fingerprint(this.app),
      builds: this.builds,
      lastBuiltAt: this.lastBuiltAt,
      sources: {
        projects: { published: projects.published ?? 0, total: projects.total },
        services: { published: catalog.services.length },
        packages: { published: catalog.packages.length },
        addOns: { published: catalog.extras.length },
        comparison: { published: catalog.documents.comparison !== null },
        fullExperience: { published: catalog.documents.fullExperience !== null },
        developerProfile: { available: profile !== null, nameSet: profile !== null && typeof profile.name === 'string' },
      },
    }
  }
}

interface ProjectView {
  slug: string
  title: string
  label: string
  description: string
  category: string
  categoryKey: string
  status: string
  technologies: string[]
  hasDetailPage: boolean
  publicUrl: string | null
  demoUrl: string | null
  detail: Record<string, unknown>
}

export type { Tri }
