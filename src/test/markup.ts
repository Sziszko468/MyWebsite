/**
 * Kinetic type (components/motion/KineticText) draws each word in its own boxes, so a headline in the
 * markup reads `<span …><span …>Not</span></span> <span …>…`. To a reader and to the DOM's own
 * `textContent` it is the sentence as written; a test that looks for the sentence in the markup string
 * uses this to see it the same way. Everything inside an element that carries `data-kinetic` is
 * reduced to its text, and the element itself is kept, so the attribute can still be asserted.
 */
export function flattenKinetic(html: string): string {
  const tag = /<(\/?)([a-z][a-z0-9-]*)\b([^>]*?)(\/?)>/gi
  let out = ''
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = tag.exec(html))) {
    const [whole, closing, name, attributes] = match
    out += html.slice(cursor, match.index)
    cursor = match.index + whole.length

    if (!closing && /\bdata-kinetic=/.test(attributes)) {
      out += whole
      // Walk to the matching close, keeping only the text between.
      let depth = 1
      while (depth > 0 && (match = tag.exec(html))) {
        out += html.slice(cursor, match.index)
        cursor = match.index + match[0].length
        if (match[4] === '/' || /^(wbr|br|img|input|hr)$/i.test(match[2])) continue
        depth += match[1] ? -1 : 1
      }
      void name
      out += `</${name}>`
      continue
    }
    out += whole
  }
  return out + html.slice(cursor)
}
