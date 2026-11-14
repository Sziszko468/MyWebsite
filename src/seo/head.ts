import { siteConfig, BRAND_PLACEHOLDER, type SiteConfig } from '../config/site'
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { buildDocumentMeta, ogLocale } from '../routes/documentMeta'
import { runtimeProject } from '../projects/store'
import { PAGES, projectIdOfPage, type PageDef } from '../routes/pages'
import { buildJsonLd } from './jsonLd'
import { DEFAULT_IMAGE_PATH, IMAGE_SIZE, seoPath } from './paths'
import { seoText } from './text'

/**
 * Everything a page says about itself to a search engine or a link preview: its title, description,
 * indexing rule, canonical address, language alternates, Open Graph and Twitter tags and structured
 * data. One pure function builds it, so the browser (to keep the document in step while a visitor
 * moves around) and the build (to write each page's own HTML) can never disagree.
 *
 * Indexing is opt-in: with no site address configured (config/site.ts `siteUrl`) every page says
 * `noindex, nofollow` and nothing that needs an absolute address is produced.
 */

export interface SeoContext {
  /** The published origin, or `null` while it is not configured. */
  siteUrl: string | null
  brandName: string
  /** `false` while the brand is still the template's placeholder: no person or website is then described by it. */
  brandIsSet: boolean
  /** Public profile addresses (https), from the site configuration. */
  profiles: readonly string[]
}

export function seoContextFrom(config: Pick<SiteConfig, 'siteUrl' | 'brandName' | 'social'> = siteConfig): SeoContext {
  return {
    siteUrl: config.siteUrl,
    brandName: config.brandName,
    brandIsSet: config.brandName.trim() !== '' && config.brandName !== BRAND_PLACEHOLDER,
    profiles: config.social.flatMap((profile) => (profile.url ? [profile.url] : [])),
  }
}

/** One tag of the document head. Kept as data so the browser can apply it and the build can print it. */
export type HeadTag =
  | { kind: 'meta'; attrs: Record<string, string> }
  | { kind: 'link'; attrs: Record<string, string> }
  | { kind: 'jsonld'; json: string }

export interface Alternate {
  /** A language code, or `x-default`. */
  hreflang: string
  href: string
}

export interface Head {
  lang: Language
  title: string
  description: string
  robots: string
  /** Whether search engines are asked to list this page. */
  indexable: boolean
  canonical: string | null
  alternates: Alternate[]
  jsonLd: object[]
  tags: HeadTag[]
}

/**
 * The languages a page really exists in. A project's page exists only in the languages the project has something to say in: the website
 * never fills a gap with another language, so there is no page, no canonical address and no hreflang alternate for the others.
 */
export function languagesOfPage(page: PageDef): readonly Language[] {
  const slug = projectIdOfPage(page.id)
  const card = slug && slug !== 'preview' ? runtimeProject(slug) : null
  const only = card?.languages
  return only ? page.languages.filter((code) => only.includes(code)) : page.languages
}

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

function robotsFor(page: PageDef | undefined, ctx: SeoContext): string {
  if (!ctx.siteUrl) return 'noindex, nofollow'
  if (!page || !page.indexable) return 'noindex, follow'
  return 'index, follow, max-image-preview:large'
}

/** Builds the head of a page (`undefined` is the page that is not there) in a language. */
export function buildHead(page: PageDef | undefined, lang: Language, ctx: SeoContext = seoContextFrom()): Head {
  const meta = buildDocumentMeta(page, lang, dictionaries[lang], ctx.brandName)
  const { siteUrl } = ctx
  const languages = page ? languagesOfPage(page) : []
  const translated = page !== undefined && languages.includes(lang)
  const indexable = Boolean(siteUrl) && page !== undefined && page.indexable && translated
  const abs = (path: string): string | null => (siteUrl ? `${siteUrl}${path}` : null)

  const canonical = indexable && page ? abs(seoPath(lang, page.path)) : null
  const alternates: Alternate[] = []
  if (indexable && page) {
    for (const code of LANGUAGES) {
      if (languages.includes(code)) alternates.push({ hreflang: code, href: abs(seoPath(code, page.path))! })
    }
    const fallback = languages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : languages[0]
    alternates.push({ hreflang: 'x-default', href: abs(seoPath(fallback, page.path))! })
  }

  const robots = robotsFor(page, ctx)
  // A project's own sharing picture (and the words it wrote for sharing), else the site's.
  const own = meta.og?.image ?? null
  const image = own ? abs(own.src) : abs(DEFAULT_IMAGE_PATH)
  const imageAlt = own ? own.alt : seoText.imageAlt[lang]
  const ogTitle = meta.og?.title ?? meta.title
  const ogDescription = meta.og?.description ?? meta.description
  const jsonLd = indexable && page && canonical ? buildJsonLd(page, lang, ctx, meta, canonical) : []

  const tags: HeadTag[] = [
    { kind: 'meta', attrs: { name: 'description', content: meta.description } },
    { kind: 'meta', attrs: { name: 'robots', content: robots } },
  ]
  if (canonical) tags.push({ kind: 'link', attrs: { rel: 'canonical', href: canonical } })
  for (const alternate of alternates) {
    tags.push({ kind: 'link', attrs: { rel: 'alternate', hreflang: alternate.hreflang, href: alternate.href } })
  }

  const og = (property: string, content: string): HeadTag => ({ kind: 'meta', attrs: { property, content } })
  tags.push(
    og('og:type', meta.ogType),
    og('og:site_name', ctx.brandName),
    og('og:title', ogTitle),
    og('og:description', ogDescription),
    og('og:locale', ogLocale(lang)),
  )
  if (canonical) tags.push(og('og:url', canonical))
  if (indexable && page) {
    for (const code of languages) if (code !== lang) tags.push(og('og:locale:alternate', ogLocale(code)))
  }
  if (image) {
    tags.push(
      og('og:image', image),
      ...(own ? (IMAGE_TYPES[own.src.split('.').pop()?.toLowerCase() ?? ''] ? [og('og:image:type', IMAGE_TYPES[own.src.split('.').pop()!.toLowerCase()])] : []) : [og('og:image:type', 'image/png')]),
      og('og:image:width', String(own ? own.width : IMAGE_SIZE.width)),
      og('og:image:height', String(own ? own.height : IMAGE_SIZE.height)),
      og('og:image:alt', imageAlt),
    )
  }
  const twitter = (name: string, content: string): HeadTag => ({ kind: 'meta', attrs: { name, content } })
  tags.push(
    twitter('twitter:card', image ? 'summary_large_image' : 'summary'),
    twitter('twitter:title', ogTitle),
    twitter('twitter:description', ogDescription),
  )
  if (image) tags.push(twitter('twitter:image', image), twitter('twitter:image:alt', imageAlt))

  if (jsonLd.length > 0) tags.push({ kind: 'jsonld', json: serializeJsonLd({ '@context': 'https://schema.org', '@graph': jsonLd }) })

  return { lang, title: meta.title, description: meta.description, robots, indexable, canonical, alternates, jsonLd, tags }
}

/**
 * JSON for a `<script type="application/ld+json">`. `<` is written as `<`, so no text in the data
 * can close the script element or open a comment, whatever it contains.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

/** Every page the site can show and its language, in registry order: what the build writes and the sitemap lists. */
export function allPageVersions(pages: readonly PageDef[] = PAGES): { page: PageDef; lang: Language }[] {
  return pages.flatMap((page) => languagesOfPage(page).map((lang) => ({ page, lang })))
}
