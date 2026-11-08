import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RichText } from './RichText'

/**
 * An answer is the model's text, so it is untrusted: it is drawn as React elements, never as HTML, and it can carry only a page
 * of this site or an https address as a link.
 */

const render = (text: string) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(RichText, { text })))

describe('the way an answer is drawn', () => {
  it('draws paragraphs, line breaks, lists, bold and code', () => {
    const html = render('First **bold** and `code`.\nSecond line.\n\n- one\n- two\n\n1. a\n2) b')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<br/>')
    expect(html).toMatch(/<ul><li>one<\/li><li>two<\/li><\/ul>/)
    expect(html).toMatch(/<ol><li>a<\/li><li>b<\/li><\/ol>/)
    expect(html.match(/<p>/g)).toHaveLength(1)
  })

  it('turns a page of this site into an internal link, bare or in brackets', () => {
    const html = render('See /en/services/packages/grow and [the contact page](/nl/contact).')
    // (The router adds data-discover to its own links.)
    expect(html).toMatch(/<a href="\/en\/services\/packages\/grow"[^>]*>\/en\/services\/packages\/grow<\/a>/)
    expect(html).toMatch(/<a href="\/nl\/contact"[^>]*>the contact page<\/a>/)
    expect(html).not.toContain('target=')
  })

  it('opens an https address in a new tab without handing over the opener', () => {
    const html = render('[the docs](https://example.com/docs)')
    expect(html).toContain('href="https://example.com/docs"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('leaves every other kind of address as plain text', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://example.com', '//evil.example/x', 'https://user:pass@example.com/', '/admin', '/fr/contact', 'ftp://example.com']) {
      const html = render(`[click me](${bad})`)
      expect(html, bad).not.toContain('<a ')
      expect(html, bad).toContain('click me')
    }
  })

  it('never produces markup from the text: tags, handlers and images come out as text', () => {
    const html = render('<script>alert(1)</script> <img src=x onerror=alert(1)> ![pic](https://example.com/p.png) <b>raw</b>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('copes with empty, oversized and ragged input', () => {
    expect(() => render('')).not.toThrow()
    expect(() => render('**unclosed and `unclosed [x](')).not.toThrow()
    expect(() => render('a'.repeat(50_000))).not.toThrow()
    expect(render('\r\nwindows\r\n\r\nlines')).toContain('<p>lines</p>')
  })
})
