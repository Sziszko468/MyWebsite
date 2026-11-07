import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The Content-Security-Policy allows the shell's inline pre-paint script by its hash. The browser hashes the text its HTML parser
 * produced, and that parser turns CRLF into LF before anything else, so the build must hash the same text. A checkout with Windows
 * line endings (git's autocrlf) once hashed `\r\n`: every page then logged a CSP violation and the browser refused the theme script.
 * The build scripts are plain .mjs run by node, so these are source checks plus the arithmetic of why it matters.
 */
const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../scripts/${path}`, import.meta.url)), 'utf8')
const hash = (text: string) => createHash('sha256').update(text).digest('base64')

describe('the inline-script hash', () => {
  it('differs between CRLF and LF text, which is why the line endings must be normalised before hashing', () => {
    const lf = '(function () {\n  var theme = null;\n})();'
    expect(hash(lf.replace(/\n/g, '\r\n'))).not.toBe(hash(lf))
  })

  it.each(['prerender.mjs', 'check-seo.mjs'])('%s hashes the text as the HTML parser sees it (CR and CRLF become LF)', (script) => {
    expect(read(script)).toContain(String.raw`.replace(/\r\n?/g, '\n')`)
  })
})
