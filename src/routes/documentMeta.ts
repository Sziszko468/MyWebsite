import { findExperiment } from '../content/lab'
import { aiMeta } from '../content/ai/meta'
import { experimentSummary, labMeta } from '../content/labMeta'
import { privacyMeta } from '../content/privacyMeta'
import { projectMeta } from '../content/projectDetails/meta'
import { runtimeProject } from '../projects/store'
import { serviceAreas } from '../content/services/areas'
import { packages } from '../content/packages'
import { comparison } from '../content/shop/comparison'
import { shopMeta } from '../content/shop/meta'
import type { Language } from '../i18n/config'
import type { Dictionary } from '../i18n/locales/hu'
import { labIdOfPage, packageIdOfPage, projectIdOfPage, serviceIdOfPage, type NavPageId, type PageDef } from './pages'

const NAV_IDS: readonly string[] = ['work', 'services', 'about', 'lab', 'contact']

/** What the browser tab, a search result and a shared link say about a page. */
export interface DocumentMeta {
  title: string
  description: string
  /** Open Graph type: a project's page is an article, everything else a website. */
  ogType: 'website' | 'article'
}

const OWN_META: Partial<Record<PageDef['id'], (t: Dictionary) => { title: string; description: string }>> = {
  work: (t) => t.workPage.meta,
  about: (t) => t.aboutPage.meta,
  contact: (t) => t.contactPage.meta,
}

const OG_LOCALE: Record<Language, string> = { hu: 'hu_HU', en: 'en_US', nl: 'nl_NL' }

export function ogLocale(lang: Language): string {
  return OG_LOCALE[lang]
}

/**
 * The title and description of a page in a language. An experiment's page and the Lab's are titled
 * from the Lab's words (content/labText.ts). A project's page has its own, written in
 * content/projectDetails/meta.ts; the shop's front page, request builder and cart have theirs in content/shop/meta.ts and a
 * service page is titled by the service's name and described by its summary; the About and contact pages have their own
 * title and description in the dictionary; the other navigation pages are titled by their navigation label; the home page by
 * the brand and the site's tagline; an unknown path says so.
 */
export function buildDocumentMeta(
  page: PageDef | undefined,
  lang: Language,
  t: Dictionary,
  brandName: string,
): DocumentMeta {
  const site = { title: `${brandName} — ${t.meta.title}`, description: t.meta.description, ogType: 'website' as const }
  if (!page) return { ...site, title: `${t.notFound.title} — ${brandName}`, description: t.notFound.description }

  const projectId = projectIdOfPage(page.id)
  const own = projectId ? (projectMeta as Record<string, (typeof projectMeta)[keyof typeof projectMeta]>)[projectId] : undefined
  if (own) {
    return { title: `${own.title[lang]} — ${brandName}`, description: own.description[lang], ogType: 'article' }
  }
  // A project that exists only in the administration: its own name and card text (the data arrives after the page's code).
  if (projectId && projectId !== 'preview') {
    const card = runtimeProject(projectId)
    if (card) return { title: `${card.name[lang] || card.name.hu} — ${brandName}`, description: card.description[lang] || card.description.hu, ogType: 'article' }
    return { ...site, title: `${t.nav.work} — ${brandName}`, description: t.workPage.meta.description }
  }
  if (projectId === 'preview') return { ...site, title: `${t.project.preview.title} — ${brandName}` }

  // An experiment is titled by its name; the Lab's own page by its statement.
  const labId = labIdOfPage(page.id)
  const experiment = labId ? findExperiment(labId) : undefined
  if (labId && experiment) {
    return {
      ...site,
      title: `${experiment.name} — ${t.nav.lab} — ${brandName}`,
      description: experimentSummary[experiment.id][lang],
    }
  }
  if (page.id === 'lab') {
    return { ...site, title: `${labMeta.title[lang]} — ${brandName}`, description: labMeta.description[lang] }
  }

  // The shop: the front page, the request builder and the cart have their own words, and a service is
  // titled by its name and described by its summary.
  const serviceId = serviceIdOfPage(page.id)
  const area = serviceId ? serviceAreas.find((candidate) => candidate.id === serviceId) : undefined
  if (area) return { ...site, title: `${area.name[lang]} — ${t.nav.services} — ${brandName}`, description: area.summary[lang] }
  // A package is titled by its name and described by what it is and who it is for.
  const packageId = packageIdOfPage(page.id)
  const pack = packageId ? packages.find((candidate) => candidate.id === packageId) : undefined
  if (pack) {
    // The package's name and its tier label (a few words); the tagline is the description's first sentence.
    const label = comparison.tiers.find((tier) => tier.package === pack.id)?.label[lang]
    return { ...site, title: `${pack.name}${label ? `: ${label}` : ''} — ${brandName}`, description: `${pack.tagline[lang]} ${pack.audience[lang]}` }
  }
  const shop =
    page.id === 'services' ? shopMeta.landing
    : page.id === 'configure' ? shopMeta.configurator
    : page.id === 'cart' ? shopMeta.cart
    : page.id === 'full-experience' ? shopMeta.fullExperience
    : page.id === 'full-experience-start' ? shopMeta.fullExperienceStart
    : undefined
  if (shop) return { ...site, title: `${shop.title[lang]} — ${brandName}`, description: shop.description[lang] }

  if (page.id === 'control-room') return { ...site, title: `${aiMeta.title[lang]} — ${brandName}`, description: aiMeta.description[lang] }
  if (page.id === 'privacy') return { ...site, title: `${privacyMeta.title[lang]} — ${brandName}`, description: privacyMeta.description[lang] }

  // These pages describe themselves: what they offer is worth more in a search result than a menu label.
  const pageMeta = OWN_META[page.id]?.(t)
  if (pageMeta) return { ...site, title: `${pageMeta.title} — ${brandName}`, description: pageMeta.description }

  if (NAV_IDS.includes(page.id)) return { ...site, title: `${t.nav[page.id as NavPageId]} — ${brandName}` }
  return site
}
