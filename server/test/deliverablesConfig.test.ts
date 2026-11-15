import { describe, expect, it } from 'vitest'
import { loadConfig, redactedConfig } from '../src/config.ts'
import { isEmbeddable, parsePreviewUrl } from '../src/modules/deliverables/preview.ts'

/**
 * PROMPT 27: the one setting that lets a preview be shown INSIDE the client portal (`PREVIEW_ORIGINS`). It must be exact (an https origin, no wildcard, no path, no user name), it
 * must never name this site itself, and an address is embedded only when its origin is on the list; every other address stays a link the customer opens in a new tab.
 */

const base = { APP_ENV: 'test', DATABASE_PATH: ':memory:', EMAIL_PROVIDER: 'none' }

describe('PREVIEW_ORIGINS', () => {
  it('is empty by default: nothing is embedded and no picture is drawn', () => {
    expect(loadConfig(base).previewOrigins).toEqual([])
    expect(isEmbeddable('https://previews.example.test/a', [])).toBe(false)
  })

  it('takes exact https origins, once each, and nothing else', () => {
    expect(loadConfig({ ...base, PREVIEW_ORIGINS: 'https://previews.example.test, https://other.example.test,https://previews.example.test' }).previewOrigins).toEqual(['https://previews.example.test', 'https://other.example.test'])
    for (const value of ['*', 'https://*.example.test', 'http://previews.example.test', 'https://previews.example.test/path', 'https://user:pass@previews.example.test', 'https://previews.example.test/?q=1', 'previews.example.test', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(() => loadConfig({ ...base, PREVIEW_ORIGINS: value }), value).toThrow(/PREVIEW_ORIGINS/)
    }
  })

  it('refuses this site’s own origin and the API’s: the portal never frames itself', () => {
    expect(() => loadConfig({ ...base, PUBLIC_URL: 'https://www.example.test', PREVIEW_ORIGINS: 'https://www.example.test' })).toThrow(/own origin/)
    expect(() => loadConfig({ ...base, API_PUBLIC_URL: 'https://api.example.test', PREVIEW_ORIGINS: 'https://api.example.test' })).toThrow(/own origin/)
    expect(loadConfig({ ...base, PUBLIC_URL: 'https://www.example.test', PREVIEW_ORIGINS: 'https://previews.example.test' }).previewOrigins).toEqual(['https://previews.example.test'])
  })

  it('is shown in the redacted configuration (it holds no secret)', () => {
    expect(redactedConfig(loadConfig({ ...base, PREVIEW_ORIGINS: 'https://previews.example.test' })).previewOrigins).toEqual(['https://previews.example.test'])
  })

  it('embeds an address only when its origin is on the list, and never one that merely looks like it', () => {
    const allowed = ['https://previews.example.test']
    const embeds = (raw: string) => {
      const parsed = parsePreviewUrl(raw)
      return parsed.ok && isEmbeddable(parsed.value.url, allowed)
    }
    expect(embeds('https://previews.example.test/site/v1')).toBe(true)
    expect(embeds('https://previews.example.test.evil.test/')).toBe(false)
    expect(embeds('https://evilpreviews.example.test/')).toBe(false)
    expect(embeds('https://sub.previews.example.test/')).toBe(false)
    expect(embeds('https://previews.example.test@evil.test/')).toBe(false)
    expect(embeds('https://other.example.test/')).toBe(false)
  })
})
