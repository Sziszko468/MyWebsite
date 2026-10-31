import { findExperiment } from '../content/lab'
import { labText } from '../content/labText'
import { projectMeta } from '../content/projectDetails/meta'
import type { Language } from '../i18n/config'
import type { Dictionary } from '../i18n/locales/hu'
import { labIdOfPage, projectIdOfPage, type NavPageId, type PageDef } from './pages'

const NAV_IDS: readonly string[] = ['work', 'services', 'about', 'lab', 'contact']

/** What the browser tab, a search result and a shared link say about a page. */
export interface DocumentMeta {
  title: string
  description: string
  /** Open Graph type: a project's page is an article, everything else a website. */
  ogType: 'website' | 'article'
}

const OWN_META: Partial<Record<PageDef['id'], (t: Dictionary) => { title: string; description: string }>> = {
  services: (t) => t.servicesPage.meta,
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
 * content/projectDetails/meta.ts; the services, About and contact pages have their own title and description in the
 * dictionary; the other navigation pages are titled by their navigation label; the home page by
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
  const own = projectId ? projectMeta[projectId] : undefined
  if (own) {
    return { title: `${own.title[lang]} — ${brandName}`, description: own.description[lang], ogType: 'article' }
  }

  // An experiment is titled by its name; the Lab's own page by its statement.
  const labId = labIdOfPage(page.id)
  const experiment = labId ? findExperiment(labId) : undefined
  if (labId && experiment) {
    return {
      ...site,
      title: `${experiment.name} — ${t.nav.lab} — ${brandName}`,
      description: experiment.tagline[lang],
    }
  }
  if (page.id === 'lab') {
    return { ...site, title: `${labText.meta.title[lang]} — ${brandName}`, description: labText.meta.description[lang] }
  }

  // These pages describe themselves: what they offer is worth more in a search result than a menu label.
  const pageMeta = OWN_META[page.id]?.(t)
  if (pageMeta) return { ...site, title: `${pageMeta.title} — ${brandName}`, description: pageMeta.description }

  if (NAV_IDS.includes(page.id)) return { ...site, title: `${t.nav[page.id as NavPageId]} — ${brandName}` }
  return site
}
