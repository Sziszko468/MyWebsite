import type { Head, HeadTag } from './head'

/**
 * Keeps the live document's head in step with the page being shown (a visitor moves around without
 * a page load). The tags a page owns carry a `data-seo` attribute, both the ones the build printed
 * into the HTML and the ones written here; a tag is updated in place when it already exists, created
 * when it is new and removed when the new page has no such tag (for example the canonical address of
 * a page that must not be indexed). Nothing outside `data-seo` is touched.
 */

function keyOf(tag: HeadTag, index: number): string {
  if (tag.kind === 'jsonld') return `jsonld:${index}`
  const { attrs } = tag
  if (tag.kind === 'meta') return `meta:${attrs.name ?? attrs.property}`
  return attrs.rel === 'alternate' ? `link:alternate:${attrs.hreflang}` : `link:${attrs.rel}`
}

function keyOfElement(element: Element, jsonIndex: { n: number }): string {
  if (element instanceof HTMLScriptElement) return `jsonld:${jsonIndex.n++}`
  if (element instanceof HTMLMetaElement) return `meta:${element.getAttribute('name') ?? element.getAttribute('property')}`
  const rel = element.getAttribute('rel')
  return rel === 'alternate' ? `link:alternate:${element.getAttribute('hreflang')}` : `link:${rel}`
}

function fill(element: Element, tag: HeadTag): void {
  if (tag.kind === 'jsonld') {
    if (element.textContent !== tag.json) element.textContent = tag.json
    return
  }
  for (const [name, value] of Object.entries(tag.attrs)) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value)
  }
  for (const name of element.getAttributeNames()) {
    if (name !== 'data-seo' && !(name in tag.attrs)) element.removeAttribute(name)
  }
}

export function applyHead(head: Head, doc: Document = document): void {
  doc.documentElement.lang = head.lang
  if (doc.title !== head.title) doc.title = head.title

  const wanted = new Map<string, HeadTag>()
  head.tags.forEach((tag, index) => wanted.set(keyOf(tag, head.tags.filter((other, i) => i < index && other.kind === 'jsonld').length), tag))

  // A JSON-LD script is keyed by its position among the scripts, so count them the same way for both sides.
  const jsonIndex = { n: 0 }
  for (const element of Array.from(doc.head.querySelectorAll('[data-seo]'))) {
    if (element.tagName === 'TITLE') continue
    const key = keyOfElement(element, jsonIndex)
    const tag = wanted.get(key)
    if (!tag) {
      element.remove()
      continue
    }
    fill(element, tag)
    wanted.delete(key)
  }

  for (const tag of wanted.values()) {
    const element = doc.createElement(tag.kind === 'jsonld' ? 'script' : tag.kind)
    if (tag.kind === 'jsonld') element.setAttribute('type', 'application/ld+json')
    element.setAttribute('data-seo', '')
    fill(element, tag)
    doc.head.appendChild(element)
  }
}
