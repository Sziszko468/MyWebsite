import { LANGUAGE_META, type Language } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { NAV_PAGES, type PageDef } from '../routes/pages'
import type { Head, HeadTag } from './head'
import { seoPath } from './paths'
import { seoText } from './text'

/**
 * Printing a page's head and its no-script fallback as HTML text, for the build. The same `Head` the
 * browser applies to the live document is what is printed here, so a crawler that reads only the HTML
 * and one that runs the page see the same thing.
 */

/** The markers in the built `index.html` (written by index.html, kept by the build) that a page's own HTML replaces. */
export const HEAD_MARKER = '<!--seo:head-->'
export const BODY_MARKER = '<!--seo:body-->'

const ATTRIBUTE_ESCAPES: Record<string, string> = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }
const TEXT_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

export const escapeAttribute = (value: string): string => value.replace(/[&"<>]/g, (char) => ATTRIBUTE_ESCAPES[char])
export const escapeText = (value: string): string => value.replace(/[&<>]/g, (char) => TEXT_ESCAPES[char])

export function renderTag(tag: HeadTag): string {
  if (tag.kind === 'jsonld') return `<script type="application/ld+json" data-seo>${tag.json}</script>`
  const attrs = Object.entries(tag.attrs)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(' ')
  return `<${tag.kind} ${attrs} data-seo>`
}

/** `<title>` and the tags of a head, one per line, as they go into the document's <head>. */
export function renderHead(head: Head): string {
  return [`<title data-seo>${escapeText(head.title)}</title>`, ...head.tags.map(renderTag)].join('\n    ')
}

/**
 * What a visitor without script sees: the page's name and description, a way to the other pages and
 * the other languages. The page itself is built by script, so this is deliberately small and honest
 * about it. Inline styles keep it readable on the dark page background without loading the stylesheet.
 */
export function renderNoscript(page: PageDef | undefined, lang: Language): string {
  const t = dictionaries[lang]
  const link = (href: string, text: string, extra = '') => `<a href="${escapeAttribute(href)}"${extra} style="color:inherit">${escapeText(text)}</a>`
  const pages = NAV_PAGES.map((candidate) => `<li>${link(seoPath(lang, candidate.path), t.nav[candidate.id])}</li>`).join('')
  const languages = (page?.languages ?? Object.keys(LANGUAGE_META)).map((code) => {
    const meta = LANGUAGE_META[code as Language]
    return `<li>${link(seoPath(code as Language, page?.path ?? '/'), meta.name, ` lang="${code}" hreflang="${code}"`)}</li>`
  })
  return [
    '<noscript>',
    '<div style="max-width:42rem;margin:0 auto;padding:2rem 1rem;font:16px/1.5 system-ui,sans-serif;color:#f4f0e8">',
    `<p>${escapeText(seoText.noScript[lang])}</p>`,
    `<nav aria-label="${escapeAttribute(t.nav.primary)}"><ul>${pages}</ul></nav>`,
    `<nav aria-label="${escapeAttribute(t.language.label)}"><ul>${languages.join('')}</ul></nav>`,
    '</div>',
    '</noscript>',
  ].join('')
}

/** Fills the built page shell for one page: the document language, its head and its no-script fallback. */
export function renderPage(template: string, head: Head, page: PageDef | undefined): string {
  if (!template.includes(HEAD_MARKER) || !template.includes(BODY_MARKER)) {
    throw new Error(`The page shell has no ${HEAD_MARKER} or ${BODY_MARKER} marker; index.html must keep both.`)
  }
  return template
    .replace(/<html lang="[^"]*"/, `<html lang="${head.lang}"`)
    .replace(HEAD_MARKER, () => renderHead(head))
    .replace(BODY_MARKER, () => renderNoscript(page, head.lang))
}
