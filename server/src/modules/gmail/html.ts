/**
 * An e-mail's HTML turned into readable plain text, without ever treating it as a page: it is scanned once, left to right, by
 * hand (no regular expression runs over the whole message, so no input can make it slow), tags are dropped, the content of
 * `<script>`, `<style>` and the like is dropped with them, and nothing is loaded, followed or kept as markup. What comes out is
 * text: whoever shows it later must still escape it.
 */

const SKIPPED = new Set(['script', 'style', 'head', 'title', 'template', 'svg', 'object', 'iframe', 'embed', 'noembed', 'math'])
const BLOCKS = new Set(['p', 'div', 'br', 'tr', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot', 'blockquote', 'pre', 'hr', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'address', 'form', 'fieldset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'center', 'main', 'figure', 'figcaption'])
/** Blocks that are separated from what comes before and after by a blank line; the other block tags by a line break. */
const PARAGRAPHS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'pre', 'hr'])
/** A tag longer than this is not a tag: the `<` was text. */
const MAX_TAG = 4096

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  bull: '•', middot: '·', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', deg: '°', plusmn: '±', times: '×', divide: '÷', para: '¶', shy: '', zwnj: '', zwj: '', ensp: ' ', emsp: ' ', thinsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Euml: 'Ë', Iuml: 'Ï', Ouml: 'Ö', Uuml: 'Ü',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', atilde: 'ã', otilde: 'õ', ntilde: 'ñ', ccedil: 'ç', szlig: 'ß', aring: 'å', aelig: 'æ', oslash: 'ø',
  odblac: 'ő', Odblac: 'Ő', udblac: 'ű', Udblac: 'Ű',
}

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      // A character that cannot be text (a control character, a surrogate, outside Unicode) becomes nothing, never an error.
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) || (code < 0x20 && code !== 0x09 && code !== 0x0a)) return ''
      return String.fromCodePoint(code)
    }
    return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : whole
  })
}

/** Where the tag that starts at `from` (just after its `<`) ends, or -1 when it does not end in a way a tag does. Quoted values may hold a `>`. */
function tagEnd(html: string, from: number): number {
  const limit = Math.min(html.length, from + MAX_TAG)
  let quote = ''
  for (let i = from; i < limit; i += 1) {
    const char = html[i]
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '>') return i
    else if (char === '<') return -1
  }
  return -1
}

/** The index just after the closing tag of `name` that follows `from`, or the end of the text (an unclosed script swallows the rest). */
function afterClosing(html: string, name: string, from: number): number {
  const closing = new RegExp(`</${name}\\s*>`, 'ig')
  closing.lastIndex = from
  const found = closing.exec(html)
  return found ? found.index + found[0].length : html.length
}

export function htmlToText(html: string): string {
  const out: string[] = []
  // The line breaks owed before the next text (two block tags in a row owe one, not two), and whether that text starts a list item.
  let breaks = 0
  let bullet = false
  const text = (raw: string) => {
    const collapsed = decodeEntities(raw).replace(/[ \t\r\n\f]+/g, ' ')
    if (collapsed.trim() === '') {
      if (collapsed !== '' && breaks === 0 && out.length > 0) out.push(' ')
      return
    }
    const first = out.length === 0
    if (!first) out.push('\n'.repeat(breaks))
    out.push(bullet ? '- ' : '', collapsed.replace(/^ +/, breaks > 0 || first ? '' : ' '))
    breaks = 0
    bullet = false
  }
  const length = html.length
  let at = 0
  while (at < length) {
    const open = html.indexOf('<', at)
    if (open === -1) {
      text(html.slice(at))
      break
    }
    if (open > at) text(html.slice(at, open))
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4)
      at = end === -1 ? length : end + 3
      continue
    }
    const next = html[open + 1]
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', open + 2)
      at = end === -1 ? length : end + 1
      continue
    }
    if (next === undefined || !/[A-Za-z/]/.test(next)) {
      text('<') // a "<" that starts nothing is just a character
      at = open + 1
      continue
    }
    const end = tagEnd(html, open + 1)
    if (end === -1) {
      text('<')
      at = open + 1
      continue
    }
    const inner = html.slice(open + 1, end)
    const match = /^(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(inner)
    at = end + 1
    if (!match) continue
    const closing = match[1] === '/'
    const name = match[2].toLowerCase()
    if (!closing && SKIPPED.has(name) && !inner.endsWith('/')) {
      at = afterClosing(html, name, at)
      breaks = Math.max(breaks, 1)
      continue
    }
    if (name === 'br') breaks += 1
    else if (BLOCKS.has(name)) {
      breaks = Math.max(breaks, PARAGRAPHS.has(name) ? 2 : 1)
      if (name === 'li' && !closing) bullet = true
    } else if ((name === 'td' || name === 'th') && closing) out.push(' ')
  }
  return out
    .join('')
    .replace(/ *\n */g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
