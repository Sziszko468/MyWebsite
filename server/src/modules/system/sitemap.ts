import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { AppContext } from '../../context.ts'
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '../../config.ts'
import type { Reply } from '../../http/reply.ts'
import { livePages } from '../projects/service.ts'

/**
 * The sitemap as a live answer (PROMPT 22). The build writes `sitemap.xml` from what the backend had published on the day it ran; a project
 * unpublished since would stay in it, and one published since would be missing. So the server reads the built file, takes out every project
 * page, and writes the project pages that exist now (a published project that has a page of its own, in the languages it can be shown in, each
 * with its alternates). Everything else in the file is passed on exactly as built. A draft, an archived project and a language a project lacks
 * are never listed. With no built sitemap (no site address was configured at build time) there is nothing to answer.
 */

const URL_BLOCK = /<url>[\s\S]*?<\/url>/g
const PROJECT_LOC = /<loc>([^<]*\/(hu|en|nl)\/work\/([a-z0-9][a-z0-9-]*)\/)<\/loc>/
const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function liveSitemap(app: AppContext, directory: string): Reply | null {
  const file = join(resolve(directory), 'sitemap.xml')
  if (!existsSync(file)) return null
  const built = readFileSync(file, 'utf8')
  const first = /<loc>([^<]+)<\/loc>/.exec(built)
  if (!first) return null
  let origin: string
  try {
    origin = new URL(first[1].replace(/&amp;/g, '&')).origin
  } catch {
    return null
  }
  const kept = (built.match(URL_BLOCK) ?? []).filter((block) => !PROJECT_LOC.test(block))
  const pages = livePages(app)
  const location = (language: Language, slug: string) => `${origin}/${language}/work/${slug}/`
  const added = [...pages].flatMap(([slug, languages]) => {
    if (languages.length === 0) return []
    // The same `x-default` as the page's own head (src/seo/head.ts): English when the project has it, else its first language.
    const fallback = languages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : languages[0]
    const alternates = [...languages.map((language) => ({ hreflang: language as string, href: location(language, slug) })), { hreflang: 'x-default', href: location(fallback, slug) }]
      .map((link) => `    <xhtml:link rel="alternate" hreflang="${link.hreflang}" href="${escape(link.href)}"/>`)
      .join('\n')
    return LANGUAGES.filter((language) => languages.includes(language)).map((language) => `  <url>\n    <loc>${escape(location(language, slug))}</loc>\n${alternates}\n  </url>`)
  })
  const header = built.slice(0, built.indexOf('<url>') === -1 ? built.length : built.indexOf('<url>')).replace(/\s+$/, '')
  const body = [header, ...kept.map((block) => `  ${block.trim()}`), ...added, '</urlset>', ''].join('\n')
  return {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
    body,
  }
}
