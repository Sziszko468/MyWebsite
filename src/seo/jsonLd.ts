import { findExperiment } from '../content/lab'
import { projectMeta } from '../content/projectDetails/meta'
import { projects } from '../content/projects'
import { serviceAreas } from '../content/services/areas'
import type { Language } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import type { DocumentMeta } from '../routes/documentMeta'
import { findPage, labIdOfPage, projectIdOfPage, serviceIdOfPage, type PageDef } from '../routes/pages'
import type { SeoContext } from './head'
import { seoPath } from './paths'

/**
 * Structured data (Schema.org, as JSON-LD) for an indexable page. It states only what the site itself
 * already shows: who the site belongs to (once the brand is real), what the page is called and says,
 * where it sits in the site, what a project is built with and what a service is named. It never
 * contains a rating, a review, an address, a price, a certificate or a registration number, because
 * the site has none of them to give.
 */

type Node = Record<string, unknown>

const PAGE_TYPE: Partial<Record<PageDef['id'], string>> = {
  about: 'AboutPage',
  contact: 'ContactPage',
  work: 'CollectionPage',
  services: 'CollectionPage',
  lab: 'CollectionPage',
}

interface Crumb {
  name: string
  path: string
}

function trail(page: PageDef, lang: Language): Crumb[] {
  const t = dictionaries[lang]
  const home: Crumb = { name: t.nav.home, path: seoPath(lang, '/') }
  const nav = (id: 'work' | 'services' | 'lab'): Crumb => ({ name: t.nav[id], path: seoPath(lang, `/${id}`) })
  const here = (name: string): Crumb => ({ name, path: seoPath(lang, page.path) })

  if (page.id === 'home') return [home]
  const projectId = projectIdOfPage(page.id)
  if (projectId) {
    const name = projects.find((p) => p.id === projectId)?.name ?? projectId
    // The Work page is a trail step only once it is a page worth listing.
    return findPage('/work')?.indexable ? [home, nav('work'), here(name)] : [home, here(name)]
  }
  const serviceId = serviceIdOfPage(page.id)
  if (serviceId) return [home, nav('services'), here(serviceAreas.find((a) => a.id === serviceId)?.name[lang] ?? serviceId)]
  const labId = labIdOfPage(page.id)
  if (labId) return [home, nav('lab'), here(findExperiment(labId)?.name ?? labId)]
  const label = page.id === 'privacy' ? t.footer.legal.privacy : (t.nav as Record<string, string>)[page.id]
  return [home, here(label ?? page.id)]
}

export function buildJsonLd(page: PageDef, lang: Language, ctx: SeoContext, meta: DocumentMeta, canonical: string): object[] {
  const siteUrl = ctx.siteUrl!
  const graph: Node[] = []
  const ref = (id: string) => ({ '@id': id })

  // Who the site belongs to. Only once the brand is real: the template's placeholder name is not a person.
  const personId = `${siteUrl}/#person`
  const websiteId = `${siteUrl}${seoPath(lang, '/')}#website`
  if (ctx.brandIsSet) {
    graph.push({
      '@type': 'Person',
      '@id': personId,
      name: ctx.brandName,
      url: `${siteUrl}${seoPath(lang, '/')}`,
      ...(ctx.profiles.length > 0 ? { sameAs: [...ctx.profiles] } : {}),
    })
    graph.push({
      '@type': 'WebSite',
      '@id': websiteId,
      url: `${siteUrl}${seoPath(lang, '/')}`,
      name: ctx.brandName,
      inLanguage: lang,
      publisher: ref(personId),
    })
  }

  const crumbs = trail(page, lang)
  const webPageId = `${canonical}#webpage`
  const webPage: Node = {
    '@type': PAGE_TYPE[page.id] ?? 'WebPage',
    '@id': webPageId,
    url: canonical,
    name: meta.title,
    description: meta.description,
    inLanguage: lang,
    ...(ctx.brandIsSet ? { isPartOf: ref(websiteId) } : {}),
  }
  graph.push(webPage)

  if (crumbs.length > 1) {
    const breadcrumbId = `${canonical}#breadcrumb`
    webPage.breadcrumb = ref(breadcrumbId)
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement: crumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: `${siteUrl}${crumb.path}`,
      })),
    })
  }

  const creator = ctx.brandIsSet ? { creator: ref(personId) } : {}

  const projectId = projectIdOfPage(page.id)
  if (projectId) {
    const entry = projects.find((p) => p.id === projectId)
    const own = projectMeta[projectId]
    if (entry) {
      const id = `${canonical}#project`
      webPage.mainEntity = ref(id)
      graph.push({
        '@type': 'CreativeWork',
        '@id': id,
        name: entry.name,
        description: meta.description,
        url: canonical,
        inLanguage: lang,
        ...(entry.tags.length > 0 ? { keywords: entry.tags.join(', ') } : {}),
        ...(own ? { image: `${siteUrl}${own.image.src}` } : {}),
        ...creator,
      })
    }
  }

  const serviceId = serviceIdOfPage(page.id)
  if (serviceId) {
    const area = serviceAreas.find((candidate) => candidate.id === serviceId)
    if (area) {
      const id = `${canonical}#service`
      webPage.mainEntity = ref(id)
      graph.push({
        '@type': 'Service',
        '@id': id,
        name: area.name[lang],
        description: area.summary[lang],
        url: canonical,
        ...(ctx.brandIsSet ? { provider: ref(personId) } : {}),
      })
    }
  }

  const labId = labIdOfPage(page.id)
  if (labId) {
    const experiment = findExperiment(labId)
    if (experiment) {
      const id = `${canonical}#experiment`
      webPage.mainEntity = ref(id)
      graph.push({
        '@type': 'CreativeWork',
        '@id': id,
        name: experiment.name,
        description: experiment.tagline[lang],
        url: canonical,
        inLanguage: lang,
        keywords: experiment.tech.join(', '),
        ...creator,
      })
    }
  }

  return graph
}
