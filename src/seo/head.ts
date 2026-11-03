import { siteConfig, BRAND_PLACEHOLDER, type SiteConfig } from '../config/site'
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { buildDocumentMeta, ogLocale } from '../routes/documentMeta'
import { PAGES, type PageDef } from '../routes/pages'
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

function robotsFor(page: PageDef | undefined, ctx: SeoContext): string {
  if (!ctx.siteUrl) return 'noindex, nofollow'
  if (!page || !page.indexable) return 'noindex, follow'
  return 'index, follow, max-image-preview:large'
}

/** Builds the head of a page (`undefined` is the page that is not there) in a language. */
export function buildHead(page: PageDef | undefined, lang: Language, ctx: SeoContext = seoContextFrom()): Head {
  const meta = buildDocumentMeta(page, lang, dictionaries[lang], ctx.brandName)
  const { siteUrl } = ctx
  const translated = page !== undefined && page.languages.includes(lang)
  const indexable = Boolean(siteUrl) && page !== undefined && page.indexable && translated
  const abs = (path: string): string | null => (siteUrl ? `${siteUrl}${path}` : null)

  const canonical = indexable && page ? abs(seoPath(lang, page.path)) : null
  const alternates: Alternate[] = []
  if (indexable && page) {
    for (const code of LANGUAGES) {
      if (page.languages.includes(code)) alternates.push({ hreflang: code, href: abs(seoPath(code, page.path))! })
    }
    const fallback = page.languages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : page.languages[0]
    alternates.push({ hreflang: 'x-default', href: abs(seoPath(fallback, page.path))! })
  }

  const robots = robotsFor(page, ctx)
  const image = abs(DEFAULT_IMAGE_PATH)
  const imageAlt = seoText.imageAlt[lang]
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
    og('og:title', meta.title),
    og('og:description', meta.description),
    og('og:locale', ogLocale(lang)),
  )
  if (canonical) tags.push(og('og:url', canonical))
  if (indexable && page) {
    for (const code of page.languages) if (code !== lang) tags.push(og('og:locale:alternate', ogLocale(code)))
  }
  if (image) {
    tags.push(
      og('og:image', image),
      og('og:image:type', 'image/png'),
      og('og:image:width', String(IMAGE_SIZE.width)),
      og('og:image:height', String(IMAGE_SIZE.height)),
      og('og:image:alt', imageAlt),
    )
  }
  const twitter = (name: string, content: string): HeadTag => ({ kind: 'meta', attrs: { name, content } })
  tags.push(
    twitter('twitter:card', image ? 'summary_large_image' : 'summary'),
    twitter('twitter:title', meta.title),
    twitter('twitter:description', meta.description),
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
  return pages.flatMap((page) => page.languages.map((lang) => ({ page, lang })))
}
