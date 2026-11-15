import { describe, expect, it } from 'vitest'
import { buildCsp, buildHeadersFile, type HeaderInput } from '../security/headers'
import { exactHttpsOrigin, parsePreviewOrigins } from './preview'

/**
 * PROMPT 27: what the build does with `VITE_PREVIEW_ORIGINS`. Only exact https origins count; they are added to the client portal's own policy (`frame-src`, `img-src`) and to
 * nothing else, so every other page keeps `frame-src 'none'` and the site's pictures stay as they were.
 */

const input: HeaderInput = { scriptHashes: ['abc'], styleHashes: ['def'], connectOrigins: ['https://api.example.test'] }
const ORIGIN = 'https://previews.example.test'

describe('VITE_PREVIEW_ORIGINS', () => {
  it('accepts exact https origins once each and reports the rest instead of using it', () => {
    expect(parsePreviewOrigins(`${ORIGIN}, https://b.example.test ,${ORIGIN}`)).toEqual({ origins: [ORIGIN, 'https://b.example.test'], rejected: [] })
    const bad = ['*', 'https://*.example.test', 'http://a.example.test', 'https://a.example.test/x', 'https://u:p@a.example.test', 'https://a.example.test/?q', 'https://a.example.test/#h', 'a.example.test', 'https://localhost', 'https://10.0.0.1', 'javascript:alert(1)']
    expect(parsePreviewOrigins(bad.join(','))).toEqual({ origins: [], rejected: bad })
    expect(parsePreviewOrigins(undefined)).toEqual({ origins: [], rejected: [] })
    expect(parsePreviewOrigins('')).toEqual({ origins: [], rejected: [] })
    expect(exactHttpsOrigin('https://Previews.Example.test')).toBe(ORIGIN)
  })
})

describe('the policy', () => {
  it('keeps frame-src none and the picture rule as they were when no origin is allowed', () => {
    const csp = buildCsp(input)
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("img-src 'self' data: blob:;")
    const file = buildHeadersFile(input)
    expect(file.split('Content-Security-Policy').length - 1).toBe(1)
    expect(file).not.toContain(ORIGIN)
  })

  it('adds the origins to the client portal’s pages only: a frame and a picture, never a script, a style or a connection', () => {
    const file = buildHeadersFile({ ...input, previewOrigins: [ORIGIN] })
    const general = file.split('\n\n').find((part) => part.startsWith('/*'))!
    expect(general).toContain("frame-src 'none'")
    expect(general).not.toContain(ORIGIN)
    for (const lang of ['hu', 'en', 'nl']) {
      const block = file.split('\n\n').find((part) => part.startsWith(`/${lang}/client-portal/*`))!
      expect(block).toContain(`frame-src ${ORIGIN};`)
      expect(block).toContain(`img-src 'self' data: blob: ${ORIGIN};`)
      expect(block).toContain("script-src 'self' 'sha256-abc'")
      expect(block).toContain("connect-src 'self' https://api.example.test;")
      expect(block).toContain("frame-ancestors 'none'")
      expect(block).toContain('Referrer-Policy: no-referrer')
      expect(block).toContain('Cache-Control: no-store')
      expect(block).toContain('X-Robots-Tag: noindex, nofollow')
    }
    // No other private page and no public page is touched.
    expect(file.split(ORIGIN).length - 1).toBe(6)
    expect(file.split('\n\n').filter((part) => part.includes(ORIGIN)).every((part) => part.includes('/client-portal/*'))).toBe(true)
  })
})
